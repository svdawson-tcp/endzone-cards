// Website shop (cssportscards.com) helpers shared by the Offers and Web Orders screens and the card editor.
// Display and validation only: every price, hold and sale is decided on the server.
import { format } from "date-fns";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";
import { centsToMoney, formatMoney, moneyToCents, normalizeMoneyInput } from "@/lib/numericUtils";

/** Used when the website settings can't be read (matches the database default). */
export const DEFAULT_OFFER_FLOOR_PCT = 0.85;

/**
 * The lowest offer that is accepted automatically, as "552.50" text.
 * Mirrors web_make_offer: coalesce(offer_floor, round(asking_price * offer_floor_pct, 2)).
 * Exact cents (no float drift). Returns null when the asking price isn't a valid amount.
 */
export function effectiveOfferFloor(
  askingPrice: string | number | null | undefined,
  overrideFloor: string | number | null | undefined,
  floorPct: string | number | null | undefined,
): string | null {
  const override = moneyToCents(overrideFloor ?? null);
  if (override !== null) return centsToMoney(override);
  const asking = moneyToCents(askingPrice ?? null);
  if (asking === null || asking < 0n) return null;
  // offer_floor_pct is numeric(4,3): work in thousandths, round half up like Postgres round().
  const pctThousandths = BigInt(Math.round(Number(floorPct ?? DEFAULT_OFFER_FLOOR_PCT) * 1000));
  return centsToMoney((asking * pctThousandths + 500n) / 1000n);
}

/** 0.85 -> "85", 0.875 -> "87.5". */
export function pctToPercentText(pct: string | number | null | undefined): string {
  const n = Number(pct ?? DEFAULT_OFFER_FLOOR_PCT);
  return String(Math.round(n * 1000) / 10);
}

/** Whole or one-decimal percent between 50 and 100, else an error sentence. */
export function validateFloorPercent(value: string): string | undefined {
  const t = value.trim();
  if (!/^\d{1,3}(\.\d)?$/.test(t)) return "Enter a percent like 85 (50 to 100).";
  const n = Number(t);
  if (n < 50 || n > 100) return "Choose between 50% and 100%.";
  return undefined;
}

/** Counter must be more than the offer and no more than the asking price (same rule as the server). */
export function validateCounter(input: string, offer: { amount: number; asking_at_offer: number }): string | undefined {
  const normalized = normalizeMoneyInput(input);
  if (normalized === null) return "Enter an amount like 600 or 600.50";
  const cents = moneyToCents(normalized)!;
  if (cents <= moneyToCents(offer.amount)!) return `Must be more than the offer (${formatMoney(offer.amount)}).`;
  if (cents > moneyToCents(offer.asking_at_offer)!) return `Can't be more than asking (${formatMoney(offer.asking_at_offer)}).`;
  return undefined;
}

/** A card's "Lowest offer to auto-accept": blank is fine (use the default %); else 0..asking price. */
export function validateOfferFloor(input: string, askingPrice: string): string | undefined {
  if (!input.trim()) return undefined;
  const normalized = normalizeMoneyInput(input);
  if (normalized === null) return "Enter an amount like 500 or 500.50, or leave blank.";
  const asking = moneyToCents(normalizeMoneyInput(askingPrice));
  if (asking !== null && moneyToCents(normalized)! > asking) {
    return `Can't be more than the asking price (${formatMoney(centsToMoney(asking))}).`;
  }
  return undefined;
}

/** Stripe address shape: {name, line1, line2, city, state, postal_code, country} -> display lines. */
export function formatShippingAddress(address: Json | null | undefined): string[] {
  if (!address || typeof address !== "object" || Array.isArray(address)) return [];
  const a = address as Record<string, Json | undefined>;
  const text = (v: Json | undefined) => (typeof v === "string" ? v.trim() : "");
  const cityLine = [text(a.city), [text(a.state), text(a.postal_code)].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const country = text(a.country);
  return [
    text(a.name),
    text(a.line1),
    text(a.line2),
    cityLine,
    country && country !== "US" ? country : "",
  ].filter(Boolean);
}

/** A real timestamp (created_at, paid_at, ...) for display, e.g. "Nov 1, 3:42 PM". */
export function formatMoment(value: string | null | undefined, pattern = "MMM d, h:mm a"): string {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : format(d, pattern);
}

export function isFuture(value: string | null | undefined): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  return !isNaN(t) && t > Date.now();
}

/** The plain sentence an Edge Function returned ({error, message}), or the fallback. */
export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await (error.context as Response).json();
      if (body && typeof body.message === "string" && body.message) return body.message;
    } catch {
      // not JSON
    }
  }
  return fallback;
}

/** "Panini Prizm" style card title from a show card row. */
export function cardTitle(card: {
  player_name?: string | null;
  year?: string | null;
  card_details?: Json | null;
} | null | undefined): string {
  if (!card) return "Card";
  const d = (card.card_details && typeof card.card_details === "object" && !Array.isArray(card.card_details)
    ? card.card_details
    : {}) as Record<string, Json | undefined>;
  const str = (v: Json | undefined) => (typeof v === "string" && v.trim() ? v.trim() : "");
  const number = str(d.card_number);
  return [
    card.player_name || "",
    card.year || "",
    str(d.brand),
    str(d.set),
    number ? `#${number.replace(/^#/, "")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
