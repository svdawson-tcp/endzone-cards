// EndZone "stripe-shop-webhook": Stripe tells us a website checkout finished or expired.
// The single writer that marks an order paid (complete_order is safe to call more than once:
// Stripe retries, and a repeat changes nothing and sends no second email).
//
// Stripe Dashboard → Developers → Webhooks → endpoint
//   https://dtfizpxtpsmqqzpactdh.supabase.co/functions/v1/stripe-shop-webhook
//   events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired
// Its signing secret goes in the Supabase secret STRIPE_SHOP_WEBHOOK_SECRET.

import type Stripe from "npm:stripe@18.5.0";
import {
  adminClient, dollars, ENDZONE_URL, emailHtml, esc, money, ownerEmail, sendEmail, settings, SITE_URL, stripe,
} from "../shop/lib.ts";

const ok = (body: unknown = { received: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

async function paid(session: Stripe.Checkout.Session) {
  const admin = adminClient();
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return ok({ ignored: "no_order_id" });
  if (session.payment_status !== "paid") return ok({ ignored: "not_paid_yet" }); // async methods finish later

  const st = stripe();
  let fee: number | null = null;
  let paymentIntent: string | null = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  if (paymentIntent) {
    try {
      const pi = await st.paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge.balance_transaction"] });
      const charge = pi.latest_charge as Stripe.Charge | null;
      const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null;
      if (bt && typeof bt === "object") fee = dollars(bt.fee);
    } catch (e) {
      console.warn("[shop-webhook] fee lookup failed", e instanceof Error ? e.message : e);
    }
  } else {
    paymentIntent = null;
  }

  // deno-lint-ignore no-explicit-any
  const shipping = (session as any).collected_information?.shipping_details ?? (session as any).shipping_details ?? null;
  const email = session.customer_details?.email ?? session.customer_email ?? null;
  const name = shipping?.name ?? session.customer_details?.name ?? null;

  const { data: result, error } = await admin.rpc("complete_order", {
    p_order: orderId, p_session: session.id, p_payment_intent: paymentIntent, p_email: email, p_name: name,
    p_ship_to: shipping, p_tax: dollars(session.total_details?.amount_tax ?? 0),
    p_total: dollars(session.amount_total ?? 0), p_fee: fee,
  });
  if (error) {
    console.error("[shop-webhook] complete_order failed", orderId, error.message);
    return new Response(JSON.stringify({ error: "complete_order_failed" }), { status: 500 }); // Stripe retries
  }
  if (result === "already_paid") return ok({ duplicate: true });

  // First time this order was marked paid: send the emails once.
  const s = await settings(admin);
  const owner = await ownerEmail(admin, s);
  const { data: order } = await admin.from("shop_orders")
    .select("order_number, subtotal, shipping, tax, total, problem").eq("id", orderId).single();
  const { data: items } = await admin.from("shop_order_items")
    .select("price, show_cards(player_name, year, card_details)").eq("order_id", orderId);
  // deno-lint-ignore no-explicit-any
  const lines = (items ?? []).map((i: any) => {
    const d = i.show_cards?.card_details ?? {};
    const t = [i.show_cards?.year, d.brand, d.set, i.show_cards?.player_name].filter(Boolean).join(" ");
    return `${esc(t)} · ${money(Number(i.price))}`;
  });
  const addr = shipping?.address
    ? [shipping.name, shipping.address.line1, shipping.address.line2,
       `${shipping.address.city ?? ""}, ${shipping.address.state ?? ""} ${shipping.address.postal_code ?? ""}`]
      .filter(Boolean).map((x: string) => esc(x)).join("<br>")
    : "";
  const totalLine = `Cards ${money(Number(order?.subtotal ?? 0))} + shipping ${money(Number(order?.shipping ?? 0))}` +
    (Number(order?.tax) > 0 ? ` + tax ${money(Number(order?.tax))}` : "") + ` = <strong>${money(Number(order?.total ?? 0))}</strong>`;

  if (email) {
    await sendEmail(email, `Order ${order?.order_number} confirmed`, emailHtml("Thanks for your order!", [
      `We got your payment for order <strong>${esc(order?.order_number ?? "")}</strong>.`,
      lines.join("<br>"), totalLine,
      `Colton packs every card in a sleeve, top loader and team bag. You'll get tracking when it ships, usually within 2 business days.`,
    ], { label: "BACK TO THE CASE", url: `${SITE_URL}/shop` }), owner ?? undefined);
  }
  await sendEmail(owner, `New website order ${order?.order_number}: ${money(Number(order?.total ?? 0))}`, emailHtml(
    result === "paid_with_problem" ? "New order (needs attention)" : "New website order — time to ship", [
      lines.join("<br>"), totalLine,
      addr ? `Ship to:<br>${addr}` : "",
      ...(order?.problem ? [`<strong style="color:#B3261E">${esc(order.problem)}</strong> Refund that card from the payment in Stripe.`] : []),
    ].filter(Boolean), { label: "OPEN ORDERS IN ENDZONE", url: `${ENDZONE_URL}/website-orders` }));
  return ok({ recorded: result });
}

async function expired(session: Stripe.Checkout.Session) {
  const admin = adminClient();
  const orderId = session.metadata?.order_id || session.client_reference_id;
  if (!orderId) return ok({ ignored: "no_order_id" });
  const { data: o } = await admin.from("shop_orders").update({ status: "expired" })
    .eq("id", orderId).eq("status", "pending").eq("stripe_session_id", session.id).select("id, offer_id").maybeSingle();
  if (o && !o.offer_id) await admin.rpc("release_hold", { p_ref: o.id }); // an offer keeps its own 24h hold
  return ok({ expired: !!o });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("STRIPE_SHOP_WEBHOOK_SECRET");
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return new Response(JSON.stringify({ error: "not_configured_or_unsigned" }), { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(raw, signature, secret);
  } catch (e) {
    console.error("[shop-webhook] bad signature", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return await paid(event.data.object as Stripe.Checkout.Session);
      case "checkout.session.expired":
        return await expired(event.data.object as Stripe.Checkout.Session);
      default:
        return ok({ ignored: event.type });
    }
  } catch (e) {
    console.error("[shop-webhook] failed", event.type, e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500 });
  }
});
