// Stripe Checkout for cssportscards.com orders. Needs STRIPE_SECRET_KEY (Colton's account; test key first).
import Stripe from "npm:stripe@18.5.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SITE } from "./shared.ts";

export function stripeClient(): Stripe | null {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  return key ? new Stripe(key, { apiVersion: "2025-08-27.basil" }) : null;
}

type Item = { price: number; description: string; show_cards: { photo_front_url: string | null } | null };

type Order = {
  id: string; order_number: string; shipping: number; hold_expires_at: string; stripe_session_id: string | null;
};

/** Create the Stripe Checkout session for a pending order and remember its id on the order. */
export async function createCheckoutSession(
  stripe: Stripe, admin: SupabaseClient, order: Order,
  opts: { email?: string; cancelUrl: string; successUrl?: string; site?: string },
): Promise<string> {
  const { data: items, error } = await admin.from("web_order_items")
    .select("price, description, show_cards(photo_front_url)").eq("order_id", order.id);
  if (error || !items?.length) throw new Error("Order has no items");

  // Stripe sessions must live 30 min–24 h. The hold always outlasts the session by a few minutes.
  const now = Math.floor(Date.now() / 1000);
  const holdEnds = Math.floor(new Date(order.hold_expires_at).getTime() / 1000);
  const expiresAt = Math.max(now + 31 * 60, Math.min(holdEnds - 120, now + 23 * 3600));

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: (items as unknown as Item[]).map((it) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: Math.round(Number(it.price) * 100),
        product_data: {
          name: it.description.slice(0, 250),
          ...(it.show_cards?.photo_front_url ? { images: [it.show_cards.photo_front_url] } : {}),
        },
      },
    })),
    shipping_address_collection: { allowed_countries: ["US"] },
    shipping_options: [{
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: "Flat-rate shipping (one per order)",
        fixed_amount: { amount: Math.round(Number(order.shipping) * 100), currency: "usd" },
      },
    }],
    ...(opts.email ? { customer_email: opts.email } : {}),
    expires_at: expiresAt,
    client_reference_id: order.id,
    metadata: { cs_order_id: order.id, cs_order_number: order.order_number },
    payment_intent_data: {
      description: `CS Sports Cards order ${order.order_number}`,
      metadata: { cs_order_id: order.id, cs_order_number: order.order_number },
    },
    success_url: opts.successUrl ?? `${opts.site ?? SITE}/cart?paid=${encodeURIComponent(order.order_number)}`,
    cancel_url: opts.cancelUrl.replace("{ORDER_ID}", order.id),
  }, { idempotencyKey: `cs-${order.id}-${expiresAt}` });

  // Point the order at the new session FIRST, so the webhook ignores the "expired" event of the old one.
  await admin.from("web_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
  // An offer order can get a new session each time the buyer clicks PAY; close the previous one so
  // only one can ever be paid. (If both somehow get paid, the webhook refunds the extra one.)
  if (order.stripe_session_id && order.stripe_session_id !== session.id) {
    try { await stripe.checkout.sessions.expire(order.stripe_session_id); } catch { /* already closed */ }
  }
  return session.url!;
}
