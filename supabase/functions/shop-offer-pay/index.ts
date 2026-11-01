// shop-offer-pay — the buyer's pay link for an accepted or countered offer (cssportscards.com/offer?t=...).
// {token, peek:true} → what the page shows; {token} → Stripe Checkout URL at the agreed price.
import { adminClient, cardLine, fail, getCard, isToken, json, readJson, cors, SITE } from "../_shop/shared.ts";
import { createCheckoutSession, stripeClient } from "../_shop/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const b = await readJson(req);
  if (!b || !isToken(b.token)) return fail(req, 400, "bad_link", "This payment link isn't valid.");

  const admin = adminClient();
  const { data: offer } = await admin.from("web_offers")
    .select("id, show_card_id, buyer_email, status, final_amount, pay_expires_at, order_id")
    .eq("pay_token", b.token).maybeSingle();
  if (!offer) return fail(req, 404, "bad_link", "This payment link isn't valid.");

  const expired = !offer.pay_expires_at || new Date(offer.pay_expires_at) < new Date();
  const { data: settings } = await admin.from("website_settings").select("shipping_flat").limit(1).maybeSingle();

  if (b.peek === true) {
    const c = await getCard(admin, offer.show_card_id);
    return json(req, 200, {
      status: offer.status === "paid" ? "paid" : expired ? "expired" : offer.status,
      final_amount: offer.final_amount,
      shipping: Number(settings?.shipping_flat ?? 6),
      pay_expires_at: offer.pay_expires_at,
      card: c ? { player_name: c.player_name, line: cardLine(c), photo_front_url: c.photo_front_url } : null,
    });
  }

  if (offer.status === "paid") return fail(req, 410, "offer_closed", "This offer has already been paid. Thank you!");
  if (!["accepted", "countered"].includes(offer.status)) {
    return fail(req, 410, "offer_closed", "This offer is no longer open.");
  }
  if (expired) return fail(req, 410, "offer_expired", "This payment link has expired, so the card went back in the case.");

  const stripe = stripeClient();
  if (!stripe) return fail(req, 503, "checkout_off", "Online payment isn't open yet. Reply to the email and Colton will send a payment link.");

  // The card has been held for this offer since it was accepted; reuse that order.
  const { data: order } = await admin.rpc("web_hold_for_offer", { p_offer_id: offer.id });
  if (!order) return fail(req, 410, "offer_closed", "This card is no longer available.");

  try {
    const url = await createCheckoutSession(stripe, admin, order, {
      email: offer.buyer_email, cancelUrl: `${SITE}/offer?t=${encodeURIComponent(String(b.token))}`,
    });
    return json(req, 200, { url });
  } catch (e) {
    console.error("Stripe session failed", e);
    return fail(req, 502, "server_error", "Payment hit a snag. Please try again in a minute.");
  }
});
