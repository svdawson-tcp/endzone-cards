// shop-offer — a buyer makes an offer on a card from cssportscards.com/shop.
// At/above the hidden floor: accepted automatically, card held, buyer emailed a pay link.
// Below it: Colton gets Accept / Counter / Decline buttons; buyer gets an "offer received" email.
import { adminClient, dbError, fail, getCard, isEmail, isUuid, json, newToken, readJson, cors } from "../_shop/shared.ts";
import {
  emailBuyerPayLink, emailBuyerReceived, emailColtonAutoAccepted, emailColtonNewOffer, pause, payUrl, type Offer,
} from "../_shop/offers.ts";

const MESSAGES: Record<string, [number, string, string]> = {
  CARD_UNAVAILABLE: [409, "card_unavailable", "Sorry, that card was just sold or is on hold."],
  OFFER_TOO_LOW: [400, "offer_too_low", "Please enter an offer of at least $1."],
  OFFER_AT_ASKING: [400, "offer_at_asking", "That's at or above the asking price, so just add it to your cart."],
  TOO_MANY_OFFERS: [429, "too_many_offers", "You've made several offers on this card today. Please try again tomorrow."],
  OFFERS_OFF: [403, "offers_off", "Offers are paused right now."],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const b = await readJson(req);
  if (!b) return fail(req, 400, "bad_request", "Something was missing. Please try again.");
  if (typeof b.company === "string" && b.company.trim() !== "") return json(req, 200, { status: "pending" }); // bot

  const amount = Number(b.amount);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 1000) : "";
  if (!isUuid(b.card_id) || !Number.isFinite(amount) || amount <= 0 || amount > 100000 ||
      !name || name.length > 80 || !isEmail(email)) {
    return fail(req, 400, "bad_request", "Please check your offer, name and email.");
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc("web_make_offer", {
    p_card_id: b.card_id, p_amount: Math.round(amount * 100) / 100, p_buyer_name: name, p_buyer_email: email,
    p_note: note || null, p_action_token: newToken(), p_pay_token: newToken(),
  });
  if (error) {
    const [code] = dbError(error);
    const m = MESSAGES[code] ?? (code === "CARDS_UNAVAILABLE" ? MESSAGES.CARD_UNAVAILABLE : null);
    if (m) return fail(req, m[0], m[1], m[2]);
    console.error("web_make_offer failed", error);
    return fail(req, 500, "server_error", "Something went wrong sending your offer. Please try again.");
  }

  const o = data as Offer;
  const card = await getCard(admin, o.show_card_id);
  if (card) {
    if (o.status === "accepted") {
      await emailBuyerPayLink(o, card);
      await pause();
      await emailColtonAutoAccepted(o, card);
    } else {
      await emailColtonNewOffer(o, card);
      await pause();
      await emailBuyerReceived(o, card);
    }
  }

  return o.status === "accepted"
    ? json(req, 200, { status: "accepted", final_amount: o.final_amount, pay_url: payUrl(o), pay_expires_at: o.pay_expires_at })
    : json(req, 200, { status: "pending" });
});
