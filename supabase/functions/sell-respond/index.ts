// sell-respond — Colton answers a "Got Cards?" submission from EndZone → Sellers (migration 0027).
// action: "offer" (amount + optional note) | "ask_more" (message) | "pass" (optional note).
// The seller is emailed (reply-to Colton) and the lead's status is recorded. Caller must be the owner.
import { adminClient, cors, dbError, fail, isUuid, json, readJson } from "../_shop/shared.ts";
import { emailSellerReply, type Lead } from "../_shop/sell.ts";

const STATUS = { offer: "offer_sent", ask_more: "asked_more", pass: "passed" } as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const admin = adminClient();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: uErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (uErr || !u?.user) return fail(req, 401, "not_signed_in", "Please sign in again.");

  const b = await readJson(req);
  if (!b || !isUuid(b.lead_id)) return fail(req, 400, "bad_request", "Missing seller.");
  const action = String(b.action ?? "") as keyof typeof STATUS;
  if (!(action in STATUS)) return fail(req, 400, "bad_request", "Unknown action.");
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 2000) : "";
  const amount = b.amount == null || b.amount === "" ? null : Number(b.amount);
  if (action === "offer" && !(amount !== null && Number.isFinite(amount) && amount > 0 && amount < 10_000_000)) {
    return fail(req, 400, "amount_required", "Enter your offer amount.");
  }
  if (action === "ask_more" && !message) return fail(req, 400, "message_required", "Write what you'd like to ask.");

  // Only the owner may answer (mentors can view, not act).
  const { data: lead } = await admin.from("web_sell_leads").select("*").eq("id", b.lead_id).maybeSingle();
  if (!lead || lead.user_id !== u.user.id) return fail(req, 404, "lead_not_found", "That seller wasn't found.");
  if (lead.status === "bought") return fail(req, 409, "already_bought", "You've already bought these.");

  const offer = action === "offer" ? Math.round(amount! * 100) / 100 : null;
  const sent = await emailSellerReply(lead as Lead, action, offer, message);
  if (!sent) return fail(req, 502, "email_failed", "The email didn't send, so nothing was changed. Please try again.");

  const { data, error } = await admin.rpc("web_sell_lead_record_reply", {
    p_lead_id: lead.id, p_owner: u.user.id, p_status: STATUS[action], p_offer: offer, p_message: message || null,
  });
  if (error) {
    console.error("web_sell_lead_record_reply failed", dbError(error));
    // The email already went out; tell Colton so he doesn't send it twice.
    return json(req, 200, { status: STATUS[action], warning: "The email was sent, but EndZone didn't save the status. Refresh and check." });
  }
  return json(req, 200, { status: (data as Lead).status });
});
