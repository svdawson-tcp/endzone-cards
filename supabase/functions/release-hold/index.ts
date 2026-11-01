// release-hold — Colton releases a card that's on hold for an online buyer (EndZone "Release hold" button).
// Caller must be signed in to EndZone as the card's owner (mentors can see the button state, not act).
// Order of work matters: close the buyer's Stripe checkout FIRST, so nobody can pay for a released card.
import { adminClient, COLTON, dbError, esc, fail, getCard, isUuid, json, layout, readJson, cors, sendEmail } from "../_shop/shared.ts";
import { stripeClient } from "../_shop/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const admin = adminClient();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: uErr } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (uErr || !u?.user) return fail(req, 401, "not_signed_in", "Please sign in again.");

  const b = await readJson(req);
  if (!b || !isUuid(b.card_id)) return fail(req, 400, "bad_request", "Missing card.");

  const { data: card } = await admin.from("show_cards").select("id, user_id, held_for, held_until")
    .eq("id", b.card_id).maybeSingle();
  if (!card || card.user_id !== u.user.id) return fail(req, 404, "card_not_found", "That card wasn't found.");

  // Close the Stripe checkout page the buyer may have open.
  if (card.held_for && card.held_until && new Date(card.held_until) > new Date()) {
    const { data: order } = await admin.from("web_orders").select("id, status, stripe_session_id")
      .eq("id", card.held_for).maybeSingle();
    if (order?.status === "paid") {
      return fail(req, 409, "order_paid", "This card was just paid for online. Check Web Orders.");
    }
    if (order?.status === "pending" && order.stripe_session_id) {
      const stripe = stripeClient();
      if (!stripe) return fail(req, 503, "stripe_off", "Couldn't reach Stripe. Try again in a minute.");
      try {
        const sess = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
        if (sess.status === "complete") {
          return fail(req, 409, "order_paid", "The buyer just paid for this card. Watch for the order email.");
        }
        if (sess.status === "open") {
          const closed = await stripe.checkout.sessions.expire(sess.id);
          if (closed.status !== "expired") throw new Error("session did not close");
        }
      } catch (e) {
        console.error("release-hold: could not close checkout", order.stripe_session_id, e);
        return fail(req, 502, "stripe_error", "Couldn't close the buyer's checkout, so the hold is still on. Try again in a minute.");
      }
    }
  }

  const { data: res, error } = await admin.rpc("web_owner_release_hold", { p_card_id: card.id, p_user_id: u.user.id });
  if (error) {
    const [code] = dbError(error);
    if (code === "ORDER_PAID") return fail(req, 409, "order_paid", "This card was just paid for online. Check Web Orders.");
    console.error("web_owner_release_hold failed", error);
    return fail(req, 500, "server_error", "Something went wrong. Please try again.");
  }

  // An accepted offer was withdrawn: let the buyer know their link is closed.
  const r = res as { offer_withdrawn?: boolean; offer_id?: string };
  if (r?.offer_withdrawn && r.offer_id) {
    const { data: f } = await admin.from("web_offers").select("buyer_name, buyer_email, final_amount, show_card_id")
      .eq("id", r.offer_id).maybeSingle();
    const c = f ? await getCard(admin, f.show_card_id) : null;
    if (f && c) {
      const first = String(f.buyer_name ?? "").trim().split(/\s+/)[0] || "there";
      await sendEmail({
        to: f.buyer_email, replyTo: COLTON,
        subject: `Update on your offer: ${c.player_name}`,
        html: layout(`Sorry, ${esc(first)}`, `<p>The ${esc(c.player_name)} card is no longer available, so your payment link has been closed. You haven't been charged.</p>
<p>Questions? Just reply to this email.</p>`),
      });
    }
  }
  return json(req, 200, res);
});
