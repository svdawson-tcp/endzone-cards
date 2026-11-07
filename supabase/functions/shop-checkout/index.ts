// shop-checkout — cart checkout from cssportscards.com/cart.
// Holds the cards (all or nothing), prices them from EndZone, and returns a Stripe Checkout URL.
import { adminClient, dbError, fail, isEmail, isToken, isUuid, json, readJson, cors, siteFor } from "../_shop/shared.ts";
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

  // Cart "Apply" button: may this email use this code? (Checked again, for real, at checkout.)
  if (b?.check_code && typeof b.check_code === "object") {
    const cc = b.check_code as Record<string, unknown>;
    const { data, error } = await adminClient().rpc("web_check_discount", {
      p_code: String(cc.code ?? "").slice(0, 40), p_email: String(cc.email ?? "").slice(0, 200),
    });
    if (error) {
      console.error("web_check_discount failed", error);
      return fail(req, 500, "server_error", "We couldn't check that code just now. Please try again.");
    }
    return json(req, 200, { valid: !!data?.valid, code: data?.code ?? null, percent: data?.percent ?? null,
      message: data?.message ?? null });
  }
  const code = typeof b?.code === "string" && b.code.trim() ? b.code.trim().slice(0, 40) : null;
  if (code && !isEmail(b?.email)) {
    return fail(req, 400, "code_email", "Enter the email you ordered with to use your code.");
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

  // Combined shipping: a buyer who came through their "add to your order" link (or a stack link from Colton)
  // ships free. The link is checked here on the server; the cart only shows what to expect.
  let current = order;
  let shipLabel: string | undefined;
  if (isToken(b?.ship_token)) {
    const { data: applied, error: linkErr } = await admin.rpc("web_apply_ship_link", { p_order_id: order.id, p_token: b!.ship_token });
    if (linkErr) console.error("web_apply_ship_link failed (charging normal shipping)", linkErr);
    else if (applied?.applied) {
      const { data: fresh } = await admin.from("web_orders").select("*").eq("id", order.id).single();
      if (fresh) current = fresh;
      shipLabel = applied.kind === "stack"
        ? "Free shipping: added to your open stack"
        : `Free shipping: ships with order ${applied.order_number}`;
    }
  }

  // Bargain Bin deal: every 11th bin card is free (the cheapest ones). Before any code, so the code
  // takes its % off what's left. If it fails, stop rather than charge more than the cart showed.
  {
    const { data: deal, error: dealErr } = await admin.rpc("web_apply_bin_deal", { p_order_id: order.id });
    if (dealErr) {
      console.error("web_apply_bin_deal failed", dealErr);
      await admin.rpc("web_release_order", { p_order_id: order.id, p_status: "canceled" });
      return fail(req, 500, "server_error", "Checkout hit a snag. Please try again.");
    }
    if (Number(deal?.free) > 0) {
      const { data: fresh } = await admin.from("web_orders").select("*").eq("id", order.id).single();
      if (fresh) current = fresh;
    }
  }

  // Discount code (after free shipping and the bin deal, so the order total ends up right). If the code doesn't apply,
  // stop and say why rather than quietly charging full price. The email is locked in Stripe.
  let email: string | undefined;
  if (code) {
    const { data: disc, error: discErr } = await admin.rpc("web_apply_discount", {
      p_order_id: order.id, p_code: code, p_email: String(b!.email).trim(),
    });
    if (discErr || !disc?.applied) {
      if (discErr) console.error("web_apply_discount failed", discErr);
      await admin.rpc("web_release_order", { p_order_id: order.id, p_status: "canceled" });
      return fail(req, 400, "code_invalid",
        disc?.message ?? "We couldn't apply that code just now. Please try again.");
    }
    const { data: fresh } = await admin.from("web_orders").select("*").eq("id", order.id).single();
    if (fresh) current = fresh;
    email = String(b!.email).trim().toLowerCase();
  }

  // Bonus card on bigger orders: just a flag for Colton's packing (nothing is charged), so a failure only logs.
  {
    const { data: bonus, error: bonusErr } = await admin.rpc("web_apply_bonus_card", { p_order_id: order.id });
    if (bonusErr) console.error("web_apply_bonus_card failed (order goes without the bonus flag)", bonusErr);
    else if (bonus?.bonus_card) current = { ...current, bonus_card: true };
  }

  try {
    const url = await createCheckoutSession(stripe, admin, current, {
      site: siteFor(req), cancelUrl: `${siteFor(req)}/cart?canceled=1&o={ORDER_ID}`, shipLabel, email,
    });
    return json(req, 200, { url });
  } catch (e) {
    console.error("Stripe session failed", e);
    await admin.rpc("web_release_order", { p_order_id: order.id, p_status: "canceled" });
    return fail(req, 502, "server_error", "Checkout hit a snag. Please try again in a minute.");
  }
});
