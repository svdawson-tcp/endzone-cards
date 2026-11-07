// stripe-webhook — Stripe tells us a website checkout was paid or expired.
// Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Subscribe the endpoint to:
//   checkout.session.completed, checkout.session.expired, charge.updated (Stripe fee arrives later),
//   charge.refunded (refunds made in Stripe go into EndZone's books; sync-refunds also catches them hourly)
// Lessons carried over from The Chef Pantry: verify the signature with constructEventAsync (Deno),
// ignore events that aren't ours, never fail the webhook over email, send order emails exactly once.
import type Stripe from "npm:stripe@18.5.0";
import {
  adminClient, button, COLTON, ENDZONE, esc, layout, money, pause, sendEmail, SITE,
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

  // ---- charge.refunded: a refund made in Stripe (by Colton, or our own shipping/duplicate refunds) goes into
  // EndZone's books. web_apply_refund applies only what's new, so our own refunds are skipped (0020).
  if (event.type === "charge.refunded") {
    const ch = event.data.object as Stripe.Charge;
    const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (!piId) return ok({ received: true, ignored: "no payment intent" });
    const admin = adminClient();
    let when = new Date(event.created * 1000).toISOString();
    try {
      const list = await stripe.refunds.list({ payment_intent: piId, limit: 1 });
      if (list.data[0]) when = new Date(list.data[0].created * 1000).toISOString();
    } catch { /* event time is close enough */ }
    const { data, error } = await admin.rpc("web_apply_refund", {
      p_payment_intent: piId, p_refunded: (ch.amount_refunded ?? 0) / 100, p_refunded_at: when,
    });
    if (error) {
      console.error("web_apply_refund failed", piId, error);
      return new Response("Could not record refund", { status: 500 }); // Stripe retries; hourly sync also catches it
    }
    return ok({ received: true, refund: data });
  }

  // ---- charge.updated: Stripe has settled its fee; record it on the sale(s)
  if (event.type === "charge.updated") {
    const ch = event.data.object as Stripe.Charge;
    const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (!piId || !ch.balance_transaction) return ok({ received: true, ignored: "no fee yet" });
    const admin = adminClient();
    const { data: known } = await admin.from("web_orders").select("id").eq("stripe_payment_intent_id", piId).maybeSingle();
    if (!known) {
      // Not ours, or the order isn't recorded yet. If the charge is ours, ask Stripe to retry later.
      const ours = ch.metadata?.cs_order_id;
      return ours ? new Response("Order not recorded yet", { status: 409 }) : ok({ received: true, ignored: "not ours" });
    }
    try {
      const bt = typeof ch.balance_transaction === "string"
        ? await stripe.balanceTransactions.retrieve(ch.balance_transaction)
        : ch.balance_transaction;
      const { error } = await admin.rpc("web_set_stripe_fee", { p_payment_intent: piId, p_fee: bt.fee / 100 });
      if (error) throw error;
    } catch (e) {
      console.error("Could not record Stripe fee", piId, e);
      return new Response("Could not record fee", { status: 500 });
    }
    return ok();
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
  // The destination sends events in its own API version (endive); re-read the session in the version this
  // code is written for, so field names always match.
  let s: Stripe.Checkout.Session;
  try {
    s = await stripe.checkout.sessions.retrieve(session.id);
  } catch (e) {
    console.error("Could not re-read session", session.id, e);
    return new Response("Could not read session", { status: 500 }); // Stripe retries
  }
  if (s.payment_status !== "paid") return ok({ received: true, ignored: "not paid yet" });
  const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;

  // Stripe fee for this payment (from the charge's balance transaction).
  let fee: number | null = null;
  try {
    const pi = await stripe.paymentIntents.retrieve(piId!, { expand: ["latest_charge.balance_transaction"] });
    const bt = (pi.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction | null;
    if (bt && typeof bt === "object") fee = bt.fee / 100;
  } catch (e) {
    console.error("Could not read Stripe fee (sale recorded without it)", e);
  }

  const ship = s.collected_information?.shipping_details ?? (s as unknown as { shipping_details?: Stripe.Checkout.Session.CollectedInformation.ShippingDetails }).shipping_details;
  const address = ship ? { name: ship.name, ...ship.address } : null;
  const buyerEmail = s.customer_details?.email ?? null;
  const buyerName = ship?.name ?? s.customer_details?.name ?? null;

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
  let storedPi = order.stripe_payment_intent_id as string | null;
  if (recorded === false) {
    const { data: now } = await admin.from("web_orders").select("stripe_payment_intent_id").eq("id", order.id).maybeSingle();
    storedPi = now?.stripe_payment_intent_id ?? storedPi;
  }
  if (recorded === false && storedPi && storedPi !== piId) {
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

  // Fee often isn't settled yet; try once more shortly (charge.updated also fills it in later).
  if (fee === null && recorded) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const pi = await stripe.paymentIntents.retrieve(piId!, { expand: ["latest_charge.balance_transaction"] });
      const bt = (pi.latest_charge as Stripe.Charge | null)?.balance_transaction as Stripe.BalanceTransaction | null;
      if (bt && typeof bt === "object") await admin.rpc("web_set_stripe_fee", { p_payment_intent: piId, p_fee: bt.fee / 100 });
    } catch (e) {
      console.error("Fee retry failed (charge.updated will fill it in)", e);
    }
  }

  // Same buyer already has an unshipped order in its free-shipping window, going to the same address,
  // but didn't use the "add to my order" link? Combine them and refund this order's shipping (0017).
  // Done before the emails so they say so. A failed refund retries with the webhook.
  const combined = await autoCombineShipping(stripe, admin, order.id, piId!);
  if (!combined) return new Response("Order recorded; shipping refund failed, retry", { status: 500 });

  const emailed = await sendOrderEmailsOnce(admin, order.id);
  if (!emailed) return new Response("Order recorded; emails failed, retry", { status: 500 }); // Stripe retries emails only
  return ok();
});

// ------------------------------------------------------------------ automatic combined shipping
// Returns false only when a refund is owed and couldn't be made (the webhook then asks Stripe to retry).
// deno-lint-ignore no-explicit-any
async function autoCombineShipping(stripe: Stripe, admin: any, orderId: string, piId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("web_auto_combine_shipping", { p_order_id: orderId });
  if (error) {
    console.error("Combined-shipping check failed (order keeps its shipping)", orderId, error);
    return true; // never hold up an order over this
  }
  if (data?.action !== "refund" || data.refund_id) return true;
  const cents = Math.round(Number(data.amount) * 100);
  try {
    // A retry after a refund that went through but wasn't saved: find it instead of refunding twice.
    const prior = await stripe.refunds.list({ payment_intent: piId, limit: 20 });
    let refund = prior.data.find((r) => r.metadata?.cs_reason === "combined_shipping" && r.status !== "failed" && r.status !== "canceled");
    if (!refund) {
      refund = await stripe.refunds.create(
        { payment_intent: piId, amount: cents, metadata: { cs_order_id: orderId, cs_reason: "combined_shipping" } },
        { idempotencyKey: `ship-${piId}` },
      );
    }
    await admin.from("web_orders").update({ shipping_refund_id: refund.id }).eq("id", orderId);
    return true;
  } catch (e) {
    console.error("Combined-shipping refund failed; Stripe will retry the webhook", piId, e);
    return false;
  }
}

// ------------------------------------------------------------------ order emails (send once)
// deno-lint-ignore no-explicit-any
async function sendOrderEmailsOnce(admin: any, orderId: string): Promise<boolean> {
  const { data: claimed } = await admin.from("web_orders")
    .update({ emails_sent_at: new Date().toISOString() })
    .eq("id", orderId).is("emails_sent_at", null).select("*");
  if (!claimed?.length) return true; // already sent
  const o = claimed[0];
  try {
    const { data: items } = await admin.from("web_order_items")
      .select("price, deal_free, description, show_cards(photo_front_url)").eq("order_id", o.id);
    const a = o.shipping_address ?? {};
    const addr = [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + " " + (a.postal_code ?? "")]
      .filter((s: string) => s && s.trim()).map(esc).join("<br>");
    const rows = (items ?? []).map((it: { price: number; deal_free?: boolean; description: string; show_cards: { photo_front_url: string | null } | null }) =>
      `<tr><td style="padding:6px 10px 6px 0">${it.show_cards?.photo_front_url ? `<img src="${esc(it.show_cards.photo_front_url)}" width="48" style="border-radius:4px">` : ""}</td>
<td style="padding:6px 12px 6px 0">${esc(it.description)}${it.deal_free ? ` <strong style="color:#0f5f59">FREE (Bargain Bin deal)</strong>` : ""}</td><td style="padding:6px 0;text-align:right">${money(it.price)}</td></tr>`).join("");
    // Combined shipping: which order/stack this one ships with, and the link to offer the buyer.
    let shipsWith: string | null = null;
    let otherAddress = false;
    if (o.ship_link_id) {
      const { data: sl } = await admin.from("web_ship_links").select("kind, customer_name, order_id").eq("id", o.ship_link_id).maybeSingle();
      if (sl?.kind === "stack") shipsWith = `${sl.customer_name}'s open stack`;
      else if (sl?.order_id) {
        const { data: first } = await admin.from("web_orders").select("order_number, shipping_address").eq("id", sl.order_id).maybeSingle();
        shipsWith = first?.order_number ? `order ${first.order_number}` : null;
        const key = (x: Record<string, string> | null) => x ? `${x.line1 ?? ""}|${x.postal_code ?? ""}`.toLowerCase().replace(/[^a-z0-9|]/g, "") : "";
        otherAddress = !!first?.shipping_address && key(first.shipping_address) !== key(o.shipping_address);
      }
    }
    let link: { token: string; kind: string; expires_at: string | null } | null = null;
    try {
      const { data } = await admin.rpc("web_order_ship_link", { p_order_id: o.id });
      if (data?.token) link = data;
    } catch (e) {
      console.error("Could not make the add-to-your-order link (email goes without it)", e);
    }
    const until = link?.expires_at
      ? new Date(link.expires_at).toLocaleString("en-US", {
          timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        }) + " ET"
      : null;
    const addMore = !link ? "" : link.kind === "stack"
      ? `<div style="margin:18px 0;padding:14px;border:2px solid #1FA39A;border-radius:8px">
<p style="margin:0 0 8px"><strong>This order was added to your open stack.</strong> Keep adding cards with free shipping. Use this link any time until your stack ships.</p>
${button(`${SITE}/shop?ship=${link.token}`, "SHOP MORE, SHIP FREE", "#1FA39A")}</div>`
      : `<div style="margin:18px 0;padding:14px;border:2px solid #1FA39A;border-radius:8px">
<p style="margin:0 0 8px"><strong>Want to add more cards?</strong> Shop again before <strong>${esc(until)}</strong> and shipping is free. Everything ships together in one package.</p>
${button(`${SITE}/shop?ship=${link.token}`, "ADD TO MY ORDER, SHIP FREE", "#1FA39A")}
<p style="margin:8px 0 0;font-size:13px;color:#555">Use this button to shop so we know it's you.</p></div>`;

    // Combined automatically after checkout: shipping was charged, then refunded.
    const refunded = o.shipping_refunded ? Number(o.shipping_refunded) : 0;
    // Bargain Bin deal (free cards) and code discount are shown separately; o.discount is their sum.
    const dealAmt = Number(o.deal_discount ?? 0);
    const codeAmt = Math.round((Number(o.discount) - dealAmt) * 100) / 100;
    const freeCount = (items ?? []).filter((it: { deal_free?: boolean }) => it.deal_free).length;
    const discountRow = (dealAmt > 0
      ? `<tr><td></td><td style="padding:6px 12px 0 0;color:#0f5f59">Bargain Bin deal: ${freeCount} free card${freeCount === 1 ? "" : "s"}</td><td style="text-align:right;color:#0f5f59">−${money(dealAmt)}</td></tr>`
      : "") + (codeAmt > 0 && o.discount_code
      ? `<tr><td></td><td style="padding:6px 12px 0 0;color:#0f5f59">Code ${esc(o.discount_code)}</td><td style="text-align:right;color:#0f5f59">−${money(codeAmt)}</td></tr>`
      : "");
    const bonusForColton = o.bonus_card
      ? `<p style="background:#fff4e5;color:#7a4a00;padding:10px;border-radius:6px"><strong>Bonus card: add a free card to this package.</strong> The cards came to ${money(Number(o.subtotal) - Number(o.discount))}, over the free-card amount.</p>`
      : "";
    const bonusForBuyer = o.bonus_card
      ? `<p style="background:#fff4e5;color:#7a4a00;padding:10px;border-radius:6px"><strong>A free bonus card is coming with your order.</strong> Thanks for the big order. Colton will pick one and pack it in with your cards.</p>`
      : "";
    const totals = discountRow + (refunded
      ? `<tr><td></td><td style="padding:6px 12px 0 0;color:#555">Shipping</td><td style="text-align:right;color:#555">${money(refunded)}</td></tr>
<tr><td></td><td style="padding:6px 12px 0 0;color:#0f5f59">Shipping refunded (ships with ${esc(shipsWith ?? "your earlier order")})</td><td style="text-align:right;color:#0f5f59">−${money(refunded)}</td></tr>`
      : `<tr><td></td><td style="padding:6px 12px 0 0;color:#555">Shipping${shipsWith ? ` (ships with ${esc(shipsWith)})` : ""}</td><td style="text-align:right;color:#555">${money(o.shipping)}</td></tr>`)
      + `<tr><td></td><td style="padding:6px 12px 0 0"><strong>${refunded ? "Total" : "Total paid"}</strong></td><td style="text-align:right"><strong>${money(o.total)}</strong></td></tr>`;
    const table = `<table role="presentation" style="width:100%;border-collapse:collapse">${rows}${totals}</table>`;
    // The package-card code, repeated here in case the card gets lost (only while the code is switched on).
    let nextCode = "";
    try {
      const { data: rc } = await admin.rpc("web_repeat_code", { p_user_id: o.user_id });
      if (rc?.code) {
        nextCode = `<div style="margin:18px 0;padding:14px;border:2px dashed #F2665A;border-radius:8px">
<p style="margin:0"><strong>${esc(Number(rc.percent))}% off your next order</strong> with code <strong>${esc(rc.code)}</strong> within ${esc(rc.window_days)} days. Enter it in your cart with this email address. It's on the card in your package too.</p></div>`;
      }
    } catch (e) {
      console.error("Could not read the repeat code (email goes without it)", e);
    }
    const first = String(o.buyer_name ?? "").trim().split(/\s+/)[0] || "there";

    const toColton = await sendEmail({
      to: COLTON, from: "site", replyTo: o.buyer_email ?? undefined,
      subject: `New order ${o.order_number}: ${money(o.total)}${o.bonus_card ? " + bonus card" : ""} — ship to ${a.name ?? o.buyer_name ?? "buyer"}`,
      html: layout(`New order ${esc(o.order_number)}`, `${shipsWith ? `<p style="background:#e3f5f3;color:#0f5f59;padding:10px;border-radius:6px"><strong>Free shipping: ship this with ${esc(shipsWith)}.</strong>${refunded ? ` Same buyer and address, so the ${money(refunded)} shipping was refunded automatically. Nothing to do in Stripe.` : ""}${otherAddress ? " <br>⚠ The shipping address is different from that order's. Check with the buyer before packing them together." : ""}</p>` : ""}${o.problem_note ? `<p style="background:#fde8e6;color:#9b1c10;padding:10px;border-radius:6px"><strong>Check this order:</strong> ${esc(o.problem_note)}</p>` : ""}${bonusForColton}
${table}<p style="margin-top:16px"><strong>Ship to</strong><br>${addr || "(no address)"}</p>
<p>Buyer: ${esc(o.buyer_name ?? "")} &lt;${esc(o.buyer_email ?? "")}&gt;</p>
<p>${button(`${ENDZONE}/web-orders`, "OPEN ORDERS IN ENDZONE", "#1FA39A")}</p>
<p style="color:#555;font-size:13px">The sale is already recorded in EndZone (channel: Website).</p>`),
    });
    let toBuyer = !o.buyer_email;
    if (o.buyer_email) {
      await pause();
      toBuyer = await sendEmail({
        to: o.buyer_email, replyTo: COLTON,
        subject: `Order ${o.order_number} confirmed — thanks!`,
        html: layout(`Thanks, ${esc(first)}! Your order is in.`, `<p>Order <strong>${esc(o.order_number)}</strong></p>${bonusForBuyer}${table}
<p style="margin-top:16px"><strong>Shipping to</strong><br>${addr}</p>
<p>${shipsWith ? `This ships together with your ${esc(shipsWith.replace(/^.*'s open stack$/, "open stack"))}.` : "Colton packs every card carefully and ships within a few days."}${refunded ? ` We refunded the ${money(refunded)} shipping on this one. It can take 5 to 10 days to show on your card.` : ""} Questions? Just reply to this email.</p>
${addMore}${nextCode}`),
      });
    }
    if (!toColton && !toBuyer) throw new Error("Both order emails failed");
    return true;
  } catch (e) {
    console.error("Order emails failed; releasing claim so a retry can send them", e);
    await admin.from("web_orders").update({ emails_sent_at: null }).eq("id", orderId);
    return false;
  }
}
