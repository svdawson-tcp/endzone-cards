// order-shipped — emails the buyer "Your cards are on the way" after Colton marks a website order shipped
// in EndZone → Web Orders (migration 0040). Includes the tracking link (if entered), the cards, and a
// Google review button. Sent at most once per order (shipped_at must be set, shipped_email_at stamped after).
// Caller must be the order's owner (mentors can view, not act).
import { adminClient, button, COLTON, esc, fail, isEmail, isUuid, json, layout, money, readJson, sendEmail, SITE, cors } from "../_shop/shared.ts";

const REVIEW_URL = "https://g.page/r/CaVzxI-3FIFuEAE/review";

/** Carrier tracking page for a tracking number, or null if we can't tell the carrier. */
function trackingUrl(raw: string): string | null {
  const t = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return `https://www.ups.com/track?tracknum=${t}`;
  if (/^(9\d{19,21}|(EA|EC|CP|RA|LZ|LK)\d{9}US)$/.test(t)) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
  if (/^(\d{12}|\d{15})$/.test(t)) return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
  return null;
}

type Item = { description: string | null; price: number; deal_free: boolean | null; show_cards: { photo_front_url: string | null } | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const admin = adminClient();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: uErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (uErr || !u?.user) return fail(req, 401, "not_signed_in", "Please sign in again.");

  const b = await readJson(req);
  if (!b || !isUuid(b.order_id)) return fail(req, 400, "bad_request", "Missing order.");

  const { data: o } = await admin.from("web_orders")
    .select("id, user_id, order_number, status, buyer_email, buyer_name, shipped_at, tracking_number, shipped_email_at, web_order_items (description, price, deal_free, show_cards (photo_front_url))")
    .eq("id", b.order_id).maybeSingle();
  if (!o || o.user_id !== u.user.id) return fail(req, 404, "order_not_found", "That order wasn't found.");
  if (o.status !== "paid" || !o.shipped_at) return fail(req, 409, "not_shipped", "Mark the order shipped first.");
  if (o.shipped_email_at) return json(req, 200, { sent: false, already: true });
  if (!isEmail(o.buyer_email)) return fail(req, 422, "no_email", "This order has no buyer email.");

  const first = String(o.buyer_name ?? "").trim().split(/\s+/)[0];
  const tn = String(o.tracking_number ?? "").trim();
  const link = tn ? trackingUrl(tn) : null;

  const items = ((o.web_order_items ?? []) as unknown as Item[]).map((it) => {
    const img = it.show_cards?.photo_front_url
      ? `<img src="${esc(it.show_cards.photo_front_url)}" alt="" width="56" style="display:block;border-radius:4px;border:1px solid #eee">`
      : "";
    return `<tr><td style="padding:6px 12px 6px 0;vertical-align:middle">${img}</td>
<td style="padding:6px 0;vertical-align:middle">${esc(it.description || "Card")}</td>
<td style="padding:6px 0 6px 12px;vertical-align:middle;text-align:right;white-space:nowrap">${it.deal_free ? "Free" : money(it.price)}</td></tr>`;
  }).join("");

  const trackingHtml = tn
    ? `<p style="margin:0 0 8px"><strong>Tracking:</strong> ${esc(tn)}</p>${link ? `<p style="margin:0 0 16px">${button(link, "TRACK YOUR PACKAGE", "#1FA39A")}</p>` : ""}`
    : `<p style="margin:0 0 16px">It should arrive in a few days.</p>`;

  const html = layout("YOUR CARDS ARE ON THE WAY", `
<p style="margin:0 0 16px">${first ? `Hi ${esc(first)},` : "Hi,"}</p>
<p style="margin:0 0 16px">Your order <strong>${esc(o.order_number)}</strong> just shipped. Thanks for buying from CS Sports Cards!</p>
${trackingHtml}
${items ? `<table role="presentation" width="100%" style="margin:0 0 20px;border-top:1px solid #eee;border-bottom:1px solid #eee">${items}</table>` : ""}
<p style="margin:0 0 8px"><strong>Happy with your cards?</strong> A quick Google review helps a small shop a lot.</p>
<p style="margin:0 0 20px">${button(REVIEW_URL, "LEAVE US A REVIEW")}</p>
<p style="margin:0 0 8px">New singles drop every week. <a href="${SITE}/shop" style="color:#1FA39A">See what's in the case</a>.</p>
<p style="margin:0">Questions? Just reply to this email.</p>`);

  const sent = await sendEmail({ to: o.buyer_email.trim(), subject: `Your cards are on the way (${o.order_number})`, html, replyTo: COLTON });
  if (!sent) return fail(req, 502, "email_failed", "The shipped email didn't send. The order is still marked shipped.");

  const { error } = await admin.from("web_orders").update({ shipped_email_at: new Date().toISOString() }).eq("id", o.id);
  if (error) console.error("shipped_email_at update failed", error);
  return json(req, 200, { sent: true });
});
