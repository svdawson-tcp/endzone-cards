// shop-offer-pay — the buyer's pay link for an accepted or countered offer (cssportscards.com/offer?t=...).
// {token, peek:true}     → what the offer page shows, plus the buyer's other open offers (to pay together)
// {tokens:[...], peek:true} → the cart's view of the offers in it (0026)
// {token}                → Stripe Checkout URL for this one card at the agreed price
import { adminClient, cardLine, fail, isToken, json, readJson, cors, siteFor } from "../_shop/shared.ts";
import { createCheckoutSession, stripeClient } from "../_shop/stripe.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type OfferRow = {
  id: string; show_card_id: string; buyer_email: string; status: string; final_amount: number | null;
  pay_expires_at: string | null; order_id: string | null; pay_token: string;
  show_cards: { id: string; player_name: string; year: string | null; card_details: Record<string, string> | null;
    asking_price: number; photo_front_url: string | null; status: string } | null;
};
const COLS = "id, show_card_id, buyer_email, status, final_amount, pay_expires_at, order_id, pay_token, " +
  "show_cards(id, player_name, year, card_details, asking_price, photo_front_url, status)";

const isExpired = (o: OfferRow) => !o.pay_expires_at || new Date(o.pay_expires_at) < new Date();
const isOpen = (o: OfferRow) => ["accepted", "countered"].includes(o.status) && !isExpired(o) && o.show_cards?.status === "available";
const shownStatus = (o: OfferRow) =>
  o.status === "paid" ? "paid" : ["accepted", "countered"].includes(o.status) && o.show_cards?.status !== "available"
    ? "closed" : isExpired(o) && ["accepted", "countered"].includes(o.status) ? "expired" : o.status;

function view(o: OfferRow) {
  const c = o.show_cards;
  return {
    token: o.pay_token, status: shownStatus(o), final_amount: o.final_amount, pay_expires_at: o.pay_expires_at,
    card: c ? { id: c.id, player_name: c.player_name, line: cardLine(c), photo_front_url: c.photo_front_url,
                asking_price: c.asking_price } : null,
  };
}

/** Is this offer's card in a cart checkout right now (so its own link can't be paid until that closes)? */
async function inCartCheckout(admin: SupabaseClient, offerId: string): Promise<boolean> {
  const { data } = await admin.from("web_order_items").select("order_id, web_orders!inner(status, source, hold_expires_at)")
    .eq("offer_id", offerId).eq("web_orders.status", "pending").eq("web_orders.source", "cart")
    .gt("web_orders.hold_expires_at", new Date().toISOString()).limit(1);
  return !!data?.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const b = await readJson(req);
  const admin = adminClient();
  const { data: settings } = await admin.from("website_settings").select("shipping_flat").limit(1).maybeSingle();
  const shipping = Number(settings?.shipping_flat ?? 6);

  // The cart: what each offer token in it is worth now.
  if (b && Array.isArray(b.tokens) && b.peek === true) {
    const tokens = [...new Set(b.tokens as unknown[])].filter(isToken).slice(0, 30) as string[];
    if (!tokens.length) return json(req, 200, { offers: [], shipping });
    const { data } = await admin.from("web_offers").select(COLS).in("pay_token", tokens);
    const rows = (data ?? []) as unknown as OfferRow[];
    const found = new Set(rows.map((r) => r.pay_token));
    return json(req, 200, {
      shipping,
      offers: [...rows.map(view), ...tokens.filter((t) => !found.has(t)).map((t) => ({ token: t, status: "not_found" }))],
    });
  }

  if (!b || !isToken(b.token)) return fail(req, 400, "bad_link", "This payment link isn't valid.");
  const { data: one } = await admin.from("web_offers").select(COLS).eq("pay_token", b.token).maybeSingle();
  if (!one) return fail(req, 404, "bad_link", "This payment link isn't valid.");
  const offer = one as unknown as OfferRow;

  if (b.peek === true) {
    // Other open offers for the same email, so the buyer can pay them together (0026).
    const { data: sib } = await admin.from("web_offers").select(COLS)
      .ilike("buyer_email", offer.buyer_email.replace(/[\\%_]/g, "\\$&"))
      .in("status", ["accepted", "countered"]).gt("pay_expires_at", new Date().toISOString())
      .neq("id", offer.id).order("pay_expires_at");
    const others = ((sib ?? []) as unknown as OfferRow[]).filter(isOpen).map(view);
    const v = view(offer);
    return json(req, 200, { ...v, shipping, others, in_cart_checkout: isOpen(offer) && await inCartCheckout(admin, offer.id) });
  }

  if (offer.status === "paid") return fail(req, 410, "offer_closed", "This offer has already been paid. Thank you!");
  if (!["accepted", "countered"].includes(offer.status)) {
    return fail(req, 410, "offer_closed", "This offer is no longer open.");
  }
  if (isExpired(offer)) return fail(req, 410, "offer_expired", "This payment link has expired, so the card went back in the case.");
  if (offer.show_cards?.status !== "available") return fail(req, 410, "offer_closed", "This card is no longer available.");
  if (await inCartCheckout(admin, offer.id)) {
    return fail(req, 409, "in_cart_checkout",
      "This card is in a checkout you started from your cart. Finish paying there, or go back to your cart and try again.");
  }

  const stripe = stripeClient();
  if (!stripe) return fail(req, 503, "checkout_off", "Online payment isn't open yet. Reply to the email and Colton will send a payment link.");

  // The card has been held for this offer since it was accepted; reuse that order.
  const { data: held } = await admin.rpc("web_hold_for_offer", { p_offer_id: offer.id });
  if (!held) return fail(req, 410, "offer_closed", "This card is no longer available.");
  // Make sure the hold outlasts the Stripe session (review H2): at least 35 minutes from now.
  const { data: order, error: extErr } = await admin.rpc("web_extend_hold", { p_order_id: held.id, p_minutes: 35 });
  if (extErr || !order) return fail(req, 410, "offer_closed", "This card is no longer available.");

  try {
    const url = await createCheckoutSession(stripe, admin, order, {
      email: offer.buyer_email,
      successUrl: `${siteFor(req)}/cart?paid=${encodeURIComponent(order.order_number)}&src=offer`,
      cancelUrl: `${siteFor(req)}/offer?t=${encodeURIComponent(String(b.token))}`,
    });
    return json(req, 200, { url });
  } catch (e) {
    console.error("Stripe session failed", e);
    return fail(req, 502, "server_error", "Payment hit a snag. Please try again in a minute.");
  }
});
