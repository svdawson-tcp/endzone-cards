import { supabase } from "@/integrations/supabase/client";

/**
 * EndZone's side of the website shop: calls the "shop" Edge Function for the owner actions
 * (answer an offer, mark an order shipped) and turns its error codes into plain words.
 * Writes never go straight to the shop tables: each action also emails the buyer.
 */

export class ShopError extends Error {
  constructor(public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

type ShopAction =
  | { action: "offer_respond"; offer_id: string; decision: "accept" | "counter" | "decline"; counter_amount?: number }
  | { action: "order_shipped"; order_id: string; carrier?: string; tracking_number?: string };

export async function callShop(body: ShopAction): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("shop", { body });
  if (!error) return (data ?? {}) as Record<string, unknown>;

  // FunctionsHttpError carries the Response; its JSON body is { error: code, ...extra }.
  const ctx = (error as { context?: unknown }).context;
  if (ctx instanceof Response) {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = await ctx.json();
    } catch {
      payload = null;
    }
    if (payload && typeof payload.error === "string") {
      const { error: code, ...extra } = payload;
      throw new ShopError(code as string, extra);
    }
    throw new ShopError("server_error");
  }
  throw new ShopError("network");
}

export const money = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? `$${v.toLocaleString("en-US")}` : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const money2 = (n: number | string | null | undefined) =>
  `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Friendly text for every error code the shop function returns to the owner. */
export function shopErrorMessage(e: unknown): string {
  const code = e instanceof ShopError ? e.code : "network";
  const extra = e instanceof ShopError ? e.extra : {};
  switch (code) {
    case "already_answered":
      return "This offer was already answered, maybe from another device. The list has been refreshed.";
    case "offer_expired":
      return "This offer expired before it was answered, so it can't be accepted or countered now.";
    case "offer_not_found":
      return "This offer can't be found any more. The list has been refreshed.";
    case "card_unavailable":
      return "This card sold or is on hold for another buyer, so the offer can't be accepted or countered. You can still decline it.";
    case "bad_counter":
      return typeof extra.min === "number" && typeof extra.max === "number"
        ? `Your counter has to be more than the offer (${money(extra.min)}) and less than the asking price (${money(extra.max)}).`
        : "Your counter has to be more than the offer and less than the asking price.";
    case "not_owner":
      return "Only the business owner's account can answer offers and ship orders.";
    case "not_signed_in":
      return "You've been signed out. Sign in again, then try once more.";
    case "not_shippable":
      return "This order can't be marked shipped. It may already be shipped, or it isn't paid.";
    case "bad_request":
      return "Something about that request was off. Refresh the page and try again.";
    case "network":
      return "Couldn't reach EndZone. Check your connection and try again.";
    default:
      return "Something went wrong on our side. Nothing was changed. Try again in a minute.";
  }
}

export type CardInfo = {
  player_name: string;
  year: string | null;
  card_details: unknown;
  photo_front_url?: string | null;
  asking_price?: number | null;
  offer_floor?: number | null;
};

/** "Jayden Daniels · 2024 Prizm #347" */
export function cardTitle(c: CardInfo | null | undefined): string {
  if (!c) return "Card";
  const d = (c.card_details ?? {}) as Record<string, unknown>;
  const set = (d.set as string) || (d.brand as string) || "";
  const num = d.card_number ? `#${String(d.card_number).replace(/^#/, "")}` : "";
  const rest = [c.year, set, num].filter(Boolean).join(" ");
  return rest ? `${c.player_name} · ${rest}` : c.player_name;
}

/** Adds n business days (Mon–Fri) to a date. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d;
}

/** A website hold is active while hold_until is in the future. */
export const isHeld = (holdUntil: string | null | undefined) => !!holdUntil && new Date(holdUntil).getTime() > Date.now();
