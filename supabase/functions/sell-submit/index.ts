// sell-submit — the "Got Cards?" form on cssportscards.com/sell (migration 0027).
// multipart/form-data: text fields + up to 10 JPEG photos (the page shrinks them to 1600 px first).
// Photos go to the PRIVATE sell-photos bucket under <lead id>/; the lead row is saved through
// web_create_sell_lead (rate-limited); Colton and the seller are emailed. Email is best-effort.
import { adminClient, cors, dbError, fail, isEmail, json, pause } from "../_shop/shared.ts";
import { MAX_PHOTOS, PHOTO_BUCKET, emailColtonNewLead, emailSellerReceived, signedPhotoUrls, type Lead } from "../_shop/sell.ts";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CATEGORIES = new Set(["football", "basketball", "baseball", "hockey", "soccer", "pokemon", "disney", "marvel", "not sure"]);
const HANDOFFS = new Set(["show", "meetup", "ship", "not sure"]);
const GRADED = new Set(["yes", "no", "not sure"]);
const HEARD_FROM = new Set(["google", "facebook", "instagram", "craigslist_nextdoor", "show", "card_flyer", "friend", "other"]);

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const text = (f: FormData, k: string, max: number) => {
  const v = f.get(k);
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(req, 400, "bad_request", "Something went wrong sending the form. Please try again.");
  }

  // Bots: hidden field filled in, or the form sent within 3 seconds of the page opening.
  const started = Number(text(form, "started", 20));
  if (text(form, "company", 200) !== "" || (Number.isFinite(started) && started > 0 && Date.now() - started < 3000)) {
    return json(req, 200, { status: "received" });
  }

  const name = text(form, "name", 80);
  const email = text(form, "email", 200);
  const zip = text(form, "zip", 10);
  if (!name) return fail(req, 400, "name_required", "Please add your name.");
  if (!isEmail(email)) return fail(req, 400, "email_required", "Please check your email address.");
  if (!/^\d{5}$/.test(zip)) return fail(req, 400, "zip_required", "Please add a 5-digit zip code.");

  const askingRaw = text(form, "asking", 20).replace(/[$,\s]/g, "");
  const asking = askingRaw === "" ? null : Number(askingRaw);
  if (asking !== null && !(Number.isFinite(asking) && asking > 0 && asking < 10_000_000)) {
    return fail(req, 400, "asking_bad", "Asking price should be a dollar amount, or leave it blank.");
  }
  const categories = form.getAll("categories").map(String).map((c) => c.toLowerCase()).filter((c) => CATEGORIES.has(c));
  const handoff = text(form, "handoff", 20).toLowerCase();
  const graded = text(form, "graded", 20).toLowerCase();
  const heardFrom = text(form, "heard_from", 30).toLowerCase();

  const files = form.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0);
  if (!files.length) return fail(req, 400, "photos_required", "Please add at least one photo.");
  if (files.length > MAX_PHOTOS) return fail(req, 400, "too_many_photos", `Up to ${MAX_PHOTOS} photos, please.`);

  const leadId = crypto.randomUUID();
  const admin = adminClient();
  const paths: string[] = [];
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_PHOTO_BYTES) return fail(req, 400, "photo_too_big", "One of the photos is too big. Please try again.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return fail(req, 400, "photo_type", "Photos need to be pictures (JPEG). Please try again.");
    }
    const path = `${leadId}/${i + 1}.jpg`;
    const { error } = await admin.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error("photo upload failed", error);
      if (paths.length) await admin.storage.from(PHOTO_BUCKET).remove(paths);
      return fail(req, 500, "upload_failed", "Your photos didn't upload. Please try again.");
    }
    paths.push(path);
  }

  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const { data, error } = await admin.rpc("web_create_sell_lead", {
    p_id: leadId, p_name: name, p_email: email, p_phone: text(form, "phone", 30) || null, p_zip: zip,
    p_categories: categories, p_card_count: text(form, "card_count", 60) || null,
    p_graded: GRADED.has(graded) ? graded : null, p_era: text(form, "era", 40) || null,
    p_details: text(form, "details", 3000) || null, p_asking: asking === null ? null : Math.round(asking * 100) / 100,
    p_handoff: HANDOFFS.has(handoff) ? handoff : null, p_photo_paths: paths,
    p_ip_hash: ip ? await sha256(`cs-sell:${ip}`) : null, p_source_page: text(form, "source", 200) || null,
    p_heard_from: HEARD_FROM.has(heardFrom) ? heardFrom : null,
  });
  if (error) {
    await admin.storage.from(PHOTO_BUCKET).remove(paths);
    const [code] = dbError(error);
    if (code === "TOO_MANY_LEADS") {
      return fail(req, 429, "too_many", "We've already got a few from you today. Colton will be in touch, or email colton@cssportscards.com.");
    }
    console.error("web_create_sell_lead failed", error);
    return fail(req, 500, "server_error", "Something went wrong sending the form. Please try again.");
  }

  const lead = data as Lead;
  await emailColtonNewLead(lead, await signedPhotoUrls(admin, paths));
  await pause();
  await emailSellerReceived(lead);
  return json(req, 200, { status: "received" });
});
