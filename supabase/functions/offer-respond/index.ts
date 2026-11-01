// offer-respond — Colton accepts, counters or declines an offer from the EndZone Offers screen.
// Caller must be signed in to EndZone as the website owner (or the business owner's account).
import { adminClient, fail, isUuid, json, readJson, cors } from "../_shop/shared.ts";
import { respondToOffer } from "../_shop/offers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const admin = adminClient();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: uErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (uErr || !u?.user) return fail(req, 401, "not_signed_in", "Please sign in again.");

  const b = await readJson(req);
  if (!b || !isUuid(b.offer_id)) return fail(req, 400, "bad_request", "Missing offer.");

  // Only the owner of the offer (the business owner) may answer it. Mentors can view, not act.
  const { data: offer } = await admin.from("web_offers").select("id, user_id").eq("id", b.offer_id).maybeSingle();
  if (!offer || offer.user_id !== u.user.id) return fail(req, 404, "offer_not_found", "That offer wasn't found.");

  const action = String(b.action ?? "");
  const counter = b.counter_amount == null ? undefined : Number(b.counter_amount);
  if (action === "counter" && !(Number.isFinite(counter) && counter! > 0)) {
    return fail(req, 400, "counter_out_of_range", "Enter your counteroffer amount.");
  }
  const [status, body] = await respondToOffer(admin, offer.id, action, counter);
  return json(req, status, body);
});
