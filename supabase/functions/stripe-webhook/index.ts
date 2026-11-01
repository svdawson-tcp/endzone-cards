// stripe-webhook — Stripe tells us a website checkout was paid or expired.
// Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Subscribe the endpoint to:
//   checkout.session.completed, checkout.session.expired
// Lessons carried over from The Chef Pantry: verify the signature with constructEventAsync (Deno),
// ignore events that aren't ours, never fail the webhook over email, send order emails exactly once.
import type Stripe from "npm:stripe@18.5.0";
import {
  adminClient, button, COLTON, ENDZONE, esc, layout, money, pause, sendEmail,
} from "../_shop/shared.ts";
import { stripeClient } from "../_shop/stripe.ts";

const ok = (body: Record<string, unknown> = { received: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const stripe = stripeClient();
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripe || !secret) return new Response("Not configured", { status: 500 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, req.headers.get("stripe-signature") ?? "", secret);
  } catch (e) {
    console.error("Bad signature", e instanceof Error ? e.message : e);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") {
    return ok({ received: true, ignored: event.type });
  }
  const session = event.data.object as Stripe.Checkout.Session;
  const orderId = session.metadata?.cs_order_id;
  if (!orderId) return ok({ received: true, ignored: "not a cssportscards order" });

  const admin = adminClient();
  const { data: order } = await admin.from("web_orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) {
    console.error("Webhook for unknown order", orderId, session.id);
    return ok({ received: true, ignored: "unknown order" });
  }

  // ---- expired: give the cards back (cart orders only; an offer keeps its hold until its link expires)
  if (event.type === "checkout.session.expired") {
    if (order.status === "pending" && order.source === "cart" && order.stripe_session_id === session.id) {
      await admin.rpc("web_release_order", { p_order_id: order.id, p_status: "expired" });
    }
    return ok();
  }

  // ---- completed
  if (session.payment_status !== "paid") return ok({ received: true, ignored: "not paid yet" });
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  // Stripe fee for this payment (from the charge's balance transaction).
  let fee: number | null = null;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId!, { expand: ["latest_charge.balance_transaction"] });
    const bt = (pi.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction | null;
    if (bt && typeof bt === "object") fee = bt.fee / 100;
  } catch (e) {
    console.error("Could not read Stripe fee (sale recorded without it)", e);
  }

  const ship = session.collected_information?.shipping_details ?? (session as unknown as { shipping_details?: Stripe.Checkout.Session.CollectedInformation.ShippingDetails }).shipping_details;
  const address = ship ? { name: ship.name, ...ship.address } : null;
  const buyerEmail = session.customer_details?.email ?? null;
  const buyerName = ship?.name ?? session.customer_details?.name ?? null;

  const { data: recorded, error } = await admin.rpc("web_complete_order", {
    p_order_id: order.id, p_payment_intent: piId, p_stripe_fee: fee,
    p_paid_at: new Date(event.created * 1000).toISOString(), // when Stripe confirmed payment
    p_buyer_email: buyerEmail, p_buyer_name: buyerName, p_shipping_address: address,
  });
  if (error) {
    console.error("web_complete_order failed", error);
    return new Response("Could not record order", { status: 500 }); // Stripe retries
  }

  // Paid twice (e.g. two tabs on an offer link)? Refund the extra payment and tell Colton.
  if (recorded === false && order.stripe_payment_intent_id && order.stripe_payment_intent_id !== piId) {
    try {
      await stripe.refunds.create({ payment_intent: piId!, reason: "duplicate" }, { idempotencyKey: `dup-${piId}` });
      await sendEmail({
        to: COLTON, from: "site", subject: `Refunded a duplicate payment on ${order.order_number}`,
        html: layout("Duplicate payment refunded", `<p>Order ${esc(order.order_number)} was paid twice. The second payment (${esc(piId)}) was refunded automatically. Nothing else to do.</p>`),
      });
    } catch (e) {
      console.error("DUPLICATE PAYMENT — refund failed, refund manually in Stripe:", piId, e);
    }
    return ok({ received: true, duplicate: true });
  }

  await sendOrderEmailsOnce(admin, order.id);
  return ok();
});

// ------------------------------------------------------------------ order emails (send once)
// deno-lint-ignore no-explicit-any
async function sendOrderEmailsOnce(admin: any, orderId: string) {
  const { data: claimed } = await admin.from("web_orders")
    .update({ emails_sent_at: new Date().toISOString() })
    .eq("id", orderId).is("emails_sent_at", null).select("*");
  if (!claimed?.length) return; // already sent
  const o = claimed[0];
  try {
    const { data: items } = await admin.from("web_order_items")
      .select("price, description, show_cards(photo_front_url)").eq("order_id", o.id);
    const a = o.shipping_address ?? {};
    const addr = [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + " " + (a.postal_code ?? "")]
      .filter((s: string) => s && s.trim()).map(esc).join("<br>");
    const rows = (items ?? []).map((it: { price: number; description: string; show_cards: { photo_front_url: string | null } | null }) =>
      `<tr><td style="padding:6px 10px 6px 0">${it.show_cards?.photo_front_url ? `<img src="${esc(it.show_cards.photo_front_url)}" width="48" style="border-radius:4px">` : ""}</td>
<td style="padding:6px 12px 6px 0">${esc(it.description)}</td><td style="padding:6px 0;text-align:right">${money(it.price)}</td></tr>`).join("");
    const totals = `<tr><td></td><td style="padding:6px 12px 0 0;color:#555">Shipping</td><td style="text-align:right;color:#555">${money(o.shipping)}</td></tr>
<tr><td></td><td style="padding:6px 12px 0 0"><strong>Total paid</strong></td><td style="text-align:right"><strong>${money(o.total)}</strong></td></tr>`;
    const table = `<table role="presentation" style="width:100%;border-collapse:collapse">${rows}${totals}</table>`;
    const first = String(o.buyer_name ?? "").trim().split(/\s+/)[0] || "there";

    await sendEmail({
      to: COLTON, from: "site", replyTo: o.buyer_email ?? undefined,
      subject: `New order ${o.order_number}: ${money(o.total)} — ship to ${a.name ?? o.buyer_name ?? "buyer"}`,
      html: layout(`New order ${esc(o.order_number)}`, `${o.problem_note ? `<p style="background:#fde8e6;color:#9b1c10;padding:10px;border-radius:6px"><strong>Check this order:</strong> ${esc(o.problem_note)}</p>` : ""}
${table}<p style="margin-top:16px"><strong>Ship to</strong><br>${addr || "(no address)"}</p>
<p>Buyer: ${esc(o.buyer_name ?? "")} &lt;${esc(o.buyer_email ?? "")}&gt;</p>
<p>${button(`${ENDZONE}/web-orders`, "OPEN ORDERS IN ENDZONE", "#1FA39A")}</p>
<p style="color:#555;font-size:13px">The sale is already recorded in EndZone (channel: Website).</p>`),
    });
    if (o.buyer_email) {
      await pause();
      await sendEmail({
        to: o.buyer_email, replyTo: COLTON,
        subject: `Order ${o.order_number} confirmed — thanks!`,
        html: layout(`Thanks, ${esc(first)}! Your order is in.`, `<p>Order <strong>${esc(o.order_number)}</strong></p>${table}
<p style="margin-top:16px"><strong>Shipping to</strong><br>${addr}</p>
<p>Colton packs every card carefully and ships within a few days. Questions? Just reply to this email.</p>`),
      });
    }
  } catch (e) {
    console.error("Order emails failed; releasing claim so a retry can send them", e);
    await admin.from("web_orders").update({ emails_sent_at: null }).eq("id", orderId);
  }
}
