// Offer emails and Colton's response logic, shared by shop-offer, offer-action and offer-respond.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  button, cardBlock, COLTON, dbError, ENDZONE, esc, getCard, layout, money, newToken, pause, sendEmail, SITE,
  type CardInfo,
} from "./shared.ts";

export type Offer = {
  id: string; show_card_id: string; buyer_name: string; buyer_email: string; buyer_note: string | null;
  amount: number; asking_at_offer: number; floor_at_offer: number; status: string; auto_accepted: boolean;
  counter_amount: number | null; final_amount: number | null; action_token: string; pay_token: string | null;
  pay_expires_at: string | null; created_at: string;
};

const first = (name: string) => (name || "").trim().split(/\s+/)[0] || "there";
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }) + " ET" : "";

export const payUrl = (o: Offer, site = SITE) => `${site}/offer?t=${encodeURIComponent(o.pay_token ?? "")}`;
const replyUrl = (o: Offer, a: string, site = SITE) => `${site}/offer-reply?t=${encodeURIComponent(o.action_token)}&a=${a}`;

/** Buyer: your offer (or Colton's counter) is accepted, here is the pay link. */
export async function emailBuyerPayLink(o: Offer, c: CardInfo, site = SITE) {
  const countered = o.status === "countered";
  const price = Number(o.final_amount);
  await sendEmail({
    to: o.buyer_email,
    replyTo: COLTON,
    subject: countered ? `Counteroffer on ${c.player_name}: ${money(price)}` : `Offer accepted: ${c.player_name}`,
    html: layout(
      countered ? `${esc(first(o.buyer_name))}, Colton sent a counteroffer` : `Deal, ${esc(first(o.buyer_name))}!`,
      `${cardBlock(c, countered
        ? `Your offer ${money(o.amount)} &rarr; <strong>Colton's price ${money(price)}</strong>`
        : `Your price: <strong>${money(price)}</strong>`)}
<p>Total with shipping: <strong>${money(price + 6)}</strong> ($6 flat shipping per order).</p>
<p>${button(payUrl(o, site), countered ? "ACCEPT & PAY" : "PAY NOW")}</p>
<p style="color:#555">The card is held for you until <strong>${esc(when(o.pay_expires_at))}</strong>. After that it goes back in the case.</p>
<p style="background:#e3f5f3;color:#0f5f59;padding:10px;border-radius:6px"><strong>Buying more than one card?</strong> Open the link above and add this card to your cart. Every card you add, offer cards and regular cards, ships together for one $6 shipping charge.</p>
<p>Questions? Just reply to this email.</p>`),
  });
}

/** Colton: a new offer below the floor — Accept / Counter / Decline buttons. */
export async function emailColtonNewOffer(o: Offer, c: CardInfo, site = SITE) {
  await sendEmail({
    to: COLTON,
    from: "site",
    replyTo: o.buyer_email,
    subject: `Offer ${money(o.amount)} on ${c.player_name} (asking ${money(o.asking_at_offer)})`,
    html: layout("New offer to review", `${cardBlock(c,
      `Offer <strong>${money(o.amount)}</strong> &middot; asking ${money(o.asking_at_offer)} &middot; auto-accept floor ${money(o.floor_at_offer)}`)}
<p><strong>${esc(o.buyer_name)}</strong> &lt;${esc(o.buyer_email)}&gt;</p>
${o.buyer_note ? `<p style="background:#f6f6f6;padding:10px;border-radius:6px">${esc(o.buyer_note).replace(/\n/g, "<br>")}</p>` : ""}
<p>${button(replyUrl(o, "accept", site), `ACCEPT ${money(o.amount)}`, "#1FA39A")}${button(replyUrl(o, "counter", site), "COUNTER", "#1E1E1E")}${button(replyUrl(o, "decline", site), "DECLINE", "#888888")}</p>
<p style="color:#555;font-size:13px">The card stays for sale until you accept. You can also answer on the <a href="${ENDZONE}/offers">Offers screen in EndZone</a>.</p>`),
  });
}

/** Colton FYI: an offer met the floor and was accepted automatically. */
export async function emailColtonAutoAccepted(o: Offer, c: CardInfo) {
  await sendEmail({
    to: COLTON,
    from: "site",
    replyTo: o.buyer_email,
    subject: `Auto-accepted ${money(o.amount)} on ${c.player_name}`,
    html: layout("Offer auto-accepted", `${cardBlock(c,
      `Offer <strong>${money(o.amount)}</strong> &middot; asking ${money(o.asking_at_offer)} &middot; floor ${money(o.floor_at_offer)}`)}
<p><strong>${esc(o.buyer_name)}</strong> &lt;${esc(o.buyer_email)}&gt; got a payment link. The card is off the site and held for them until ${esc(when(o.pay_expires_at))}.</p>
${o.buyer_note ? `<p style="background:#f6f6f6;padding:10px;border-radius:6px">${esc(o.buyer_note).replace(/\n/g, "<br>")}</p>` : ""}
<p style="color:#555;font-size:13px">You'll get an order email when they pay.</p>`),
  });
}

/** Buyer: offer received and waiting on Colton. */
export async function emailBuyerReceived(o: Offer, c: CardInfo) {
  await sendEmail({
    to: o.buyer_email,
    replyTo: COLTON,
    subject: `We got your offer on ${c.player_name}`,
    html: layout(`Thanks, ${esc(first(o.buyer_name))}!`, `${cardBlock(c, `Your offer: <strong>${money(o.amount)}</strong>`)}
<p>Colton will look it over and email you back, usually within a day. If he accepts, you'll get a link to pay.</p>
<p>Questions? Just reply to this email.</p>`),
  });
}

export async function emailBuyerDeclined(o: Offer, c: CardInfo, site = SITE) {
  await sendEmail({
    to: o.buyer_email,
    replyTo: COLTON,
    subject: `About your offer on ${c.player_name}`,
    html: layout(`Thanks for the offer, ${esc(first(o.buyer_name))}`, `${cardBlock(c, `Your offer: ${money(o.amount)}`)}
<p>Colton can't take ${money(o.amount)} on this one. It's still available at ${money(o.asking_at_offer)} if you want it.</p>
<p>${button(`${site}/shop#card-${o.show_card_id}`, "SEE THE CARD")}</p>`),
  });
}

const RESPOND_MESSAGES: Record<string, string> = {
  COUNTER_OUT_OF_RANGE: "A counteroffer has to be more than their offer and no more than the asking price.",
  CARDS_UNAVAILABLE: "That card is no longer available (sold or on hold), so the offer can't be accepted.",
  OFFER_NOT_FOUND: "That offer wasn't found.",
};

/** Colton accepts, counters or declines a pending offer. Returns [status, body]. */
export async function respondToOffer(
  admin: SupabaseClient, offerId: string, action: string, counter?: number, site = SITE,
): Promise<[number, Record<string, unknown>]> {
  if (!["accept", "decline", "counter"].includes(action)) return [400, { error: "bad_request", message: "Unknown action." }];
  const { data, error } = await admin.rpc("web_respond_offer", {
    p_offer_id: offerId, p_action: action,
    p_counter: action === "counter" ? counter ?? null : null,
    p_pay_token: action === "decline" ? null : newToken(),
  });
  if (error) {
    const [code] = dbError(error);
    if (code.startsWith("OFFER_ALREADY_")) {
      const st = code.slice("OFFER_ALREADY_".length).toLowerCase();
      return [409, { error: `offer_already_${st}`, message: `This offer was already ${st}.` }];
    }
    if (RESPOND_MESSAGES[code]) return [409, { error: code.toLowerCase(), message: RESPOND_MESSAGES[code] }];
    console.error("web_respond_offer failed", error);
    return [500, { error: "server_error", message: "Something went wrong. Please try again." }];
  }
  const o = data as Offer;
  const c = await getCard(admin, o.show_card_id);
  if (c) {
    if (o.status === "declined") await emailBuyerDeclined(o, c, site);
    else await emailBuyerPayLink(o, c, site);
  }
  const { pay_token: _p, action_token: _a, ...safe } = o;
  return [200, { offer: safe }];
}

export { pause };
