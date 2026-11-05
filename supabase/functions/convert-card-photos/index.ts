// convert-card-photos — ONE-OFF (Nov 4 2026). iPhone Safari couldn't encode WebP, so EndZone stored ~1 MB PNG
// card photos. For one row of public.photo_convert_jobs: download the PNG, flatten any transparency onto white,
// shrink to 1600 px on the long edge, encode JPEG q82, check the JPEG decodes with the same shape, upload it
// beside the original (original is KEPT), then point the card at it only if the card still uses the old photo.
// { job_id }                -> convert that job (pending or error only)
// { job_id, preview: true } -> read-only: small before/after JPEG thumbnails (base64) for a visual check
// { job_id, verify: true }  -> read-only re-check: compare old vs new at 96 px, fetch the public url
// Ran Nov 4 2026: 367 photos, 361 MB -> 35 MB, all verified. Delete this function once the conversion is confirmed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeAny, shrink, toJpeg } from "./img.ts";

const PREFIX = "/storage/v1/object/public/show_cards/";
const MAX_EDGE = 1600;

function admin() {
  let key: string | undefined;
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"]; } catch { /* legacy */ }
  key ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, key!, { auth: { persistSession: false } });
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function load(db: ReturnType<typeof admin>, path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from("show_cards").download(path);
  if (error || !data) throw new Error(`download ${path}: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.job_id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "job_id required" }, 400);
  const db = admin();
  const { data: job } = await db.from("photo_convert_jobs").select("*").eq("id", id).maybeSingle();
  if (!job) return json({ error: "no such job" }, 404);
  const oldPath: string = job.old_url.split(PREFIX)[1];

  if (body.preview === true) {
    if (job.status !== "done") return json({ error: "not converted" }, 409);
    const thumb = async (path: string) => b64(toJpeg(shrink(decodeAny(await load(db, path)), 360), 70));
    return json({ job_id: id, old: await thumb(oldPath), new: await thumb(job.new_url.split(PREFIX)[1]) });
  }
  if (body.verify === true) {
    // Independent check of a finished job: re-download both files, compare them at 96 px (mean absolute
    // difference per channel, 0-255), and fetch the new file's PUBLIC url the way the website does.
    if (job.status !== "done") return json({ error: "not converted" }, 409);
    const a = shrink(decodeAny(await load(db, oldPath)), 96);
    const b = shrink(decodeAny(await load(db, job.new_url.split(PREFIX)[1])), 96);
    let diff = 999;
    if (a.width === b.width && a.height === b.height) {
      let sum = 0, n = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); n += 3;
      }
      diff = Math.round((sum / n) * 100) / 100;
    }
    let publicOk = false;
    try {
      const r = await fetch(job.new_url);
      const buf = new Uint8Array(await r.arrayBuffer());
      publicOk = r.ok && (r.headers.get("content-type") ?? "").startsWith("image/jpeg") && buf[0] === 0xff && buf[1] === 0xd8 && buf.length === job.new_bytes;
    } catch { /* stays false */ }
    await db.from("photo_convert_jobs").update({ diff, new_public_ok: publicOk, verified_at: new Date().toISOString() }).eq("id", id);
    return json({ job_id: id, diff, public_ok: publicOk });
  }
  if (job.status !== "pending" && job.status !== "error") return json({ job_id: id, status: job.status, skipped: true });

  const fail = async (msg: string) => {
    await db.from("photo_convert_jobs").update({ status: "error", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", id);
    return json({ job_id: id, status: "error", error: msg }, 500);
  };
  try {
    if (!oldPath) return await fail("old_url is not in the show_cards bucket");
    const orig = await load(db, oldPath);
    if (orig[0] !== 0x89 || orig[1] !== 0x50) return await fail("not a PNG (already converted?)");
    const img = decodeAny(orig);
    const ow = img.width, oh = img.height;
    const hadAlpha = img.hadAlpha;
    const jpg = toJpeg(shrink(img, MAX_EDGE), 82);

    // Check before touching the card: decodes, same shape, plausible size.
    const check = decodeAny(jpg);
    if (Math.abs(check.width / check.height - ow / oh) > 0.01) return await fail(`aspect changed ${ow}x${oh} -> ${check.width}x${check.height}`);
    if (jpg.length < 5000) return await fail(`jpeg suspiciously small (${jpg.length} bytes)`);

    const newPath = oldPath.replace(/\.[A-Za-z0-9]+$/, "") + "_c.jpg";
    const { error: upErr } = await db.storage.from("show_cards").upload(newPath, jpg, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
    if (upErr) return await fail(`upload: ${upErr.message}`);
    const stored = await load(db, newPath);
    if (stored.length !== jpg.length) return await fail(`stored ${stored.length} bytes, expected ${jpg.length}`);

    const newUrl = job.old_url.replace(oldPath, newPath);
    const col = job.side === "front" ? "photo_front_url" : "photo_back_url";
    const { data: upd, error: updErr } = await db.from("show_cards").update({ [col]: newUrl }).eq("id", job.card_id).eq(col, job.old_url).select("id");
    if (updErr) return await fail(`card update: ${updErr.message}`);
    const status = upd && upd.length === 1 ? "done" : "skipped_changed";
    await db.from("photo_convert_jobs").update({
      status, error: null, new_url: newUrl, old_bytes: orig.length, new_bytes: jpg.length,
      old_w: ow, old_h: oh, new_w: check.width, new_h: check.height, had_alpha: hadAlpha, finished_at: new Date().toISOString(),
    }).eq("id", id);
    return json({ job_id: id, status, old_kb: Math.round(orig.length / 1024), new_kb: Math.round(jpg.length / 1024), w: check.width, h: check.height });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
