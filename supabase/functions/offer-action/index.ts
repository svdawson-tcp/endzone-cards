// offer-action — backs Colton's Accept / Counter / Decline email buttons.
// The buttons open cssportscards.com/offer-reply?t=<action_token>&a=<action>, a page that shows the offer
// (POST {t, peek:true}) and only acts when Colton presses the confirm button there (POST {t, action}).
// Acting only on POST matters: mail scanners (e.g. Outlook Safe Links) "click" every link in an email.
import { adminClient, cardLine, fail, getCard, isToken, json, readJson, cors, siteFor } from "../_shop/shared.ts";
import { respondToOffer } from "../_shop/offers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed", "Not allowed.");

  const b = await readJson(req);
  if (!b || !isToken(b.t)) return fail(req, 400, "bad_link", "This link isn't valid.");

  const admin = adminClient();
  const { data: offer } = await admin.from("web_offers")
    .select("id, show_card_id, buyer_name, buyer_email, buyer_note, amount, asking_at_offer, floor_at_offer, status, counter_amount, final_amount, pay_expires_at, created_at")
    .eq("action_token", b.t).maybeSingle();
  if (!offer) return fail(req, 404, "bad_link", "This offer link isn't valid.");

  if (b.peek === true) {
    const c = await getCard(admin, offer.show_card_id);
    return json(req, 200, {
      offer,
      card: c ? { player_name: c.player_name, line: cardLine(c), photo_front_url: c.photo_front_url } : null,
    });
  }

  const action = String(b.action ?? "");
  const counter = b.counter_amount == null ? undefined : Number(b.counter_amount);
  if (action === "counter" && !(Number.isFinite(counter) && counter! > 0)) {
    return fail(req, 400, "counter_out_of_range", "Enter your counteroffer amount.");
  }
  const [status, body] = await respondToOffer(admin, offer.id, action, counter, siteFor(req));
  return json(req, status, body);
});
