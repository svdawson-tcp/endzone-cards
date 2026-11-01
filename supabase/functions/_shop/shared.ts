// Shared helpers for the cssportscards.com shop functions (shop-offer, shop-offer-pay, shop-checkout,
// offer-action, offer-respond, stripe-webhook). Folders starting with "_" are not deployed as functions.
//
// Rules these functions follow (see drizzle/migrations/0007_website_checkout_offers.sql):
//  * Prices come from EndZone via the web_* database functions; the browser's numbers are never used.
//  * Every write goes through a web_* function (service role). anon/authenticated cannot call them.
//  * Email is best-effort: a failed email never undoes an order or an offer.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SITE = "https://www.cssportscards.com";
export const ENDZONE = "https://endzone-cards.netlify.app";
export const COLTON = "colton@cssportscards.com";
const FROM_ORDERS = "CS Sports Cards <orders@cssportscards.com>";
const FROM_SITE = "CS Sports Cards Website <noreply@cssportscards.com>";

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?cssportscards\.com$/,
  /^https:\/\/[a-z0-9-]+--cs-sportscards\.netlify\.app$/,
  /^https:\/\/cs-sportscards\.netlify\.app$/,
  /^https:\/\/endzone-cards\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--endzone-cards\.netlify\.app$/,
  /^http:\/\/localhost:\d+$/,
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

export function fail(req: Request, status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return json(req, status, { error, message, ...extra });
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  let key: string | undefined;
  try {
    key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"];
  } catch { /* fall back to the legacy key */ }
  key ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("No Supabase secret key in the function environment");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? b as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Unguessable token for email links (32 random bytes, URL-safe). */
export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const isEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
export const isToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{30,60}$/.test(v);

export function money(n: unknown): string {
  return "$" + Number(n ?? 0).toFixed(2);
}

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Pull the code out of a Postgres RAISE like "CARDS_UNAVAILABLE:abc,def" → ["CARDS_UNAVAILABLE", "abc,def"]. */
export function dbError(e: { message?: string } | null | undefined): [string, string] {
  const m = (e?.message ?? "").trim();
  const match = m.match(/^([A-Z_]+)(?::(.*))?$/);
  return match ? [match[1], match[2] ?? ""] : ["DB_ERROR", m];
}

export type CardInfo = {
  id: string; player_name: string; year: string | null; card_details: Record<string, string> | null;
  asking_price: number; photo_front_url: string | null;
};

export function cardLine(c: CardInfo): string {
  const d = c.card_details ?? {};
  return [c.year, d.brand, d.set, d.card_number ? "#" + String(d.card_number).replace(/^#/, "") : null]
    .filter(Boolean).join(" ");
}

export async function getCard(admin: SupabaseClient, id: string): Promise<CardInfo | null> {
  const { data } = await admin.from("show_cards")
    .select("id, player_name, year, card_details, asking_price, photo_front_url").eq("id", id).maybeSingle();
  return data as CardInfo | null;
}

// ---------------------------------------------------------------- email
const BRAND = { charcoal: "#1E1E1E", teal: "#1FA39A", coral: "#F2665A" };

export function layout(heading: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:${BRAND.charcoal}">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:${BRAND.charcoal};padding:18px 24px;color:#fff;font-weight:bold;letter-spacing:1px">CS SPORTS CARDS &amp; COLLECTIBLES</td></tr>
<tr><td style="height:4px;background:${BRAND.teal}"></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:22px">${heading}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #eee;font-size:13px;color:#666">
<a href="${SITE}" style="color:${BRAND.teal}">cssportscards.com</a> &middot;
<a href="https://www.instagram.com/cs.sportscards/" style="color:${BRAND.teal}">Instagram @cs.sportscards</a>
</td></tr></table></body></html>`;
}

export function button(href: string, label: string, color = BRAND.coral): string {
  return `<a href="${esc(href)}" style="display:inline-block;margin:4px 8px 4px 0;padding:12px 20px;background:${color};color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">${esc(label)}</a>`;
}

export function cardBlock(c: CardInfo, priceLabel?: string): string {
  const img = c.photo_front_url
    ? `<img src="${esc(c.photo_front_url)}" alt="" width="96" style="display:block;border-radius:6px;border:1px solid #eee">`
    : "";
  return `<table role="presentation" style="margin:8px 0 16px"><tr>
<td style="vertical-align:top;padding-right:14px">${img}</td>
<td style="vertical-align:top"><div style="font-weight:bold;font-size:17px">${esc(c.player_name)}</div>
<div style="color:#555;margin:2px 0 6px">${esc(cardLine(c))}</div>
${priceLabel ? `<div style="font-size:16px">${priceLabel}</div>` : ""}</td></tr></table>`;
}

export async function sendEmail(msg: {
  to: string; subject: string; html: string; from?: "orders" | "site"; replyTo?: string;
}): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.error("RESEND_API_KEY not set; email skipped:", msg.subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: msg.from === "site" ? FROM_SITE : FROM_ORDERS,
        to: [msg.to],
        reply_to: msg.replyTo,
        subject: msg.subject,
        html: msg.html,
      }),
    });
    if (!res.ok) console.error("Resend failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("Resend error", e);
    return false;
  }
}

/** Resend allows ~2 sends/second; space consecutive sends. */
export const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms));
