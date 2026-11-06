// sync-refunds — the safety net for refunds made in Stripe (0020).
// Every hour (pg_cron job "sync-refunds"), checks each paid website order from the last 120 days that isn't
// fully refunded in EndZone yet, reads how much Stripe has refunded on its payment, and hands anything new to
// web_apply_refund(). The stripe-webhook does the same instantly on charge.refunded; this catches refunds
// whose event never arrived. Safe to run any time: it only applies what Stripe shows and never twice.
import type Stripe from "npm:stripe@18.5.0";
import { adminClient } from "../_shop/shared.ts";
import { stripeClient } from "../_shop/stripe.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const stripe = stripeClient();
  if (!stripe) return json({ error: "not_configured" }, 500);
  const admin = adminClient();

  const { data: rows, error } = await admin.rpc("web_refund_candidates");
  if (error) {
    console.error("web_refund_candidates failed", error);
    return json({ error: "db" }, 500);
  }
  const results: unknown[] = [];
  for (const r of (rows ?? []).slice(0, 200) as { order_number: string; payment_intent: string; accounted: number }[]) {
    try {
      const pi = await stripe.paymentIntents.retrieve(r.payment_intent, { expand: ["latest_charge"] });
      const ch = pi.latest_charge as Stripe.Charge | null;
      const refunded = (ch?.amount_refunded ?? 0) / 100;
      if (refunded <= Number(r.accounted) + 0.004) continue;
      const when = await latestRefundTime(stripe, r.payment_intent);
      const { data: applied, error: e2 } = await admin.rpc("web_apply_refund", {
        p_payment_intent: r.payment_intent, p_refunded: refunded, p_refunded_at: when,
      });
      if (e2) throw e2;
      results.push({ order: r.order_number, ...applied });
    } catch (e) {
      console.error("Refund sync failed for", r.order_number, e);
      results.push({ order: r.order_number, error: true });
    }
  }
  if (results.length) console.log("sync-refunds", JSON.stringify(results));
  return json({ checked: rows?.length ?? 0, applied: results });
});

async function latestRefundTime(stripe: Stripe, piId: string): Promise<string> {
  try {
    const list = await stripe.refunds.list({ payment_intent: piId, limit: 1 });
    if (list.data[0]) return new Date(list.data[0].created * 1000).toISOString();
  } catch { /* fall back to now */ }
  return new Date().toISOString();
}
