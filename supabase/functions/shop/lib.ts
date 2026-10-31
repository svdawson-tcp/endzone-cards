// Shared code for the website shop: Stripe, Supabase admin client, CORS, money helpers and emails.
// Used by the `shop` function (cart checkout, offers, owner actions) and `stripe-shop-webhook`.
//
// Patterns carried over from The Chef Pantry's checkout, which is proven in production:
//   * Stripe-hosted Checkout; card details never touch our site.
//   * Prices are always re-read on the server; nothing the browser sends is trusted for money.
//   * The signed webhook is the single writer that marks an order paid, and it is safe to retry.
//   * Emails go out once, after the database change succeeds (a retry that changes nothing sends nothing).
//
// Secrets (Supabase → Edge Functions → Secrets): STRIPE_SECRET_KEY, STRIPE_SHOP_WEBHOOK_SECRET, RESEND_API_KEY.
// Optional: SHOP_SITE_URL (default https://www.cssportscards.com), SHOP_FROM_EMAIL.

import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

export const SITE_URL = (Deno.env.get("SHOP_SITE_URL") ?? "https://www.cssportscards.com").replace(/\/$/, "");
export const ENDZONE_URL = "https://endzone-cards.netlify.app";
const FROM_EMAIL = Deno.env.get("SHOP_FROM_EMAIL") ?? "CS Sports Cards <orders@cssportscards.com>";

export const CART_HOLD_MINUTES = 35;        // Stripe sessions last 30 minutes; the hold outlives them a little
export const OFFER_HOLD_HOURS = 24;         // an accepted or countered offer holds the card this long
export const MAX_CARDS_PER_ORDER = 25;

export function stripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2025-08-27.basil" });
}

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  let key: string | undefined;
  try {
    key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"];
  } catch { /* fall back to the legacy key */ }
  key ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("No Supabase secret key in the function environment");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type Admin = ReturnType<typeof adminClient>;

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?cssportscards\.com$/,
  /^https:\/\/[a-z0-9-]+--cs-sportscards\.netlify\.app$/,
  /^https:\/\/cs-sportscards\.netlify\.app$/,
  /^https:\/\/endzone-cards\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--endzone-cards\.netlify\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
];

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

export const cents = (dollars: number) => Math.round(dollars * 100);
export const dollars = (c: number | null | undefined) => (c == null ? null : Math.round(c) / 100);
export const money = (d: number) => "$" + d.toFixed(2);
export const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const isEmail = (s: unknown): s is string =>
  typeof s === "string" && s.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export type Settings = {
  owner_user_id: string;
  shipping_flat: number;
  offer_min_ratio: number;
  collect_sales_tax: boolean;
  alert_email: string | null;
};

export async function settings(admin: Admin): Promise<Settings> {
  const { data, error } = await admin.from("website_settings")
    .select("owner_user_id, shipping_flat, offer_min_ratio, collect_sales_tax, alert_email").single();
  if (error || !data) throw new Error("website_settings missing");
  return {
    ...data,
    shipping_flat: Number(data.shipping_flat),
    offer_min_ratio: Number(data.offer_min_ratio),
  } as Settings;
}

/** Where to send owner alerts: the setting, or the owner's login email. */
export async function ownerEmail(admin: Admin, s: Settings): Promise<string | null> {
  if (s.alert_email) return s.alert_email;
  const { data } = await admin.auth.admin.getUserById(s.owner_user_id);
  return data?.user?.email ?? null;
}

export type CardRow = {
  id: string; price: number; player_name: string; year: string | null; brand: string | null;
  set_name: string | null; card_number: string | null; photo_front_url: string | null;
};

export function cardTitle(c: { year?: string | null; brand?: string | null; set_name?: string | null;
  player_name: string; card_number?: string | null }) {
  const parts = [c.year, c.brand, c.set_name, c.player_name].filter(Boolean).join(" ");
  return (c.card_number ? `${parts} #${c.card_number}` : parts).slice(0, 250);
}

/** Holds cards for a checkout or offer. Returns the cards, or the ids that aren't available. */
export async function reserve(admin: Admin, cardIds: string[], ref: string, minutes: number, allowRef?: string) {
  const { data, error } = await admin.rpc("reserve_cards", {
    p_cards: cardIds, p_ref: ref, p_minutes: Math.max(1, Math.min(2880, Math.ceil(minutes))),
    p_allow_ref: allowRef ?? null,
  });
  if (error) {
    const m = error.message.match(/cards_unavailable:([0-9a-f,-]+)/i);
    if (m) return { ok: false as const, unavailable: m[1].split(",") };
    throw new Error(`reserve_cards: ${error.message}`);
  }
  return {
    ok: true as const,
    cards: (data as CardRow[]).map((c) => ({ ...c, price: Number(c.price) })),
  };
}

// ---------------------------------------------------------------------------
// Email (Resend). Missing key = logged and skipped, never a failed checkout.
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function emailHtml(heading: string, paragraphs: string[], button?: { label: string; url: string }, footnote?: string) {
  const btn = button
    ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#F2665A;color:#1E2328;text-decoration:none;font-weight:800;letter-spacing:1px;padding:14px 22px;border:2px solid #1E2328;display:inline-block">${esc(button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F2F4F7;font-family:Helvetica,Arial,sans-serif;color:#1E2328">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF">
<div style="background:#000000;color:#FFFFFF;padding:14px 20px;font-weight:800;letter-spacing:2px">CS SPORTS CARDS</div>
<div style="padding:20px">
<h1 style="font-size:22px;margin:0 0 12px">${esc(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${p}</p>`).join("\n")}
${btn}
${footnote ? `<p style="font-size:13px;color:#6B7178;line-height:1.5">${footnote}</p>` : ""}
</div>
<div style="padding:14px 20px;font-size:12px;color:#6B7178;border-top:1px solid #E3E7EC">CS Sports Cards &amp; Collectibles LLC · Harrisburg, PA · <a href="${SITE_URL}" style="color:#1FA39A">cssportscards.com</a> · Instagram @cs.sportscards</div>
</div></body></html>`;
}
export { esc };

export async function sendEmail(to: string | null, subject: string, html: string, replyTo?: string) {
  if (!to) return false;
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("[shop] RESEND_API_KEY not set; email skipped:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) console.error("[shop] email failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("[shop] email error", e instanceof Error ? e.message : e);
    return false;
  }
}

export const offerPayUrl = (offerId: string, token: string) =>
  `${SITE_URL}/offer.html?o=${encodeURIComponent(offerId)}&t=${encodeURIComponent(token)}`;
