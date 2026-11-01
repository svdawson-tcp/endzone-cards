// shop-checkout — cart checkout from cssportscards.com/cart.
// Holds the cards (all or nothing), prices them from EndZone, and returns a Stripe Checkout URL.
import { adminClient, dbError, fail, isUuid, json, readJson, cors, siteFor } from "../_shop/shared.ts";
import { createCheckoutSession, stripeClient } from "../_shop/stripe.ts";

const CART_HOLD_MINUTES = 35; // Stripe session lasts 31–33 min; the hold outlasts it

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const stripe = stripeClient();
  if (!stripe) return fail(req, 503, "checkout_off", "Online checkout isn't open yet. Use Request to Buy instead.");

  const b = await readJson(req);

  // Buyer came back from Stripe with "cancel": give their cards back right away instead of in 30 min.
  if (isUuid(b?.release_order_id)) {
    const admin = adminClient();
    const { data: o } = await admin.from("web_orders").select("id, status, source, stripe_session_id")
      .eq("id", b!.release_order_id).maybeSingle();
    if (o && o.status === "pending" && o.source === "cart") {
      let closed = !o.stripe_session_id;
      if (o.stripe_session_id) {
        try {
          const sess = await stripe.checkout.sessions.retrieve(o.stripe_session_id);
          if (sess.status === "expired") closed = true;
          else if (sess.status === "open") closed = (await stripe.checkout.sessions.expire(sess.id)).status === "expired";
          // "complete" = already paid in another tab: leave it for the webhook
        } catch (e) {
          console.error("Could not close session; leaving hold in place", e);
        }
      }
      if (closed) await admin.rpc("web_release_order", { p_order_id: o.id, p_status: "canceled" });
    }
    return json(req, 200, { released: true });
  }

  const ids = Array.isArray(b?.card_ids) ? [...new Set(b!.card_ids as unknown[])] : [];
  if (!ids.length || ids.length > 50 || !ids.every(isUuid)) {
    return fail(req, 400, "bad_request", "Your cart looks empty. Please refresh and try again.");
  }

  const admin = adminClient();
  await admin.rpc("web_release_stale_holds"); // tidy up abandoned holds first (cheap)

  const { data: order, error } = await admin.rpc("web_create_order", {
    p_card_ids: ids, p_source: "cart", p_hold_minutes: CART_HOLD_MINUTES,
  });
  if (error) {
    const [code, detail] = dbError(error);
    if (code === "CARDS_UNAVAILABLE") {
      const gone = detail.split(",").filter(isUuid);
      return fail(req, 409, "cards_unavailable",
        gone.length === 1
          ? "One card in your cart was just sold or is in someone else's checkout. We took it out of your cart."
          : "Some cards in your cart were just sold or are in someone else's checkout. We took them out of your cart.",
        { card_ids: gone });
    }
    console.error("web_create_order failed", error);
    return fail(req, 500, "server_error", "Checkout hit a snag. Please try again.");
  }

  try {
    const url = await createCheckoutSession(stripe, admin, order, { site: siteFor(req), cancelUrl: `${siteFor(req)}/cart?canceled=1&o={ORDER_ID}` });
    return json(req, 200, { url });
  } catch (e) {
    console.error("Stripe session failed", e);
    await admin.rpc("web_release_order", { p_order_id: order.id, p_status: "canceled" });
    return fail(req, 502, "server_error", "Checkout hit a snag. Please try again in a minute.");
  }
});
