// EndZone "shop" Edge Function: the website cart, offers, and Colton's replies. See lib.ts for shared rules.
//
// POST { action, ... }
//   Public (cssportscards.com, no login):
//     checkout        { cards: [id...] }                 → { url }          cart → Stripe Checkout
//     abandon         { order_id }                        → { ok }           buyer came back from Checkout
//     offer           { card_id, amount, email, name? }   → { status: "accepted", pay_url } | { status: "pending" }
//     offer_info      { offer_id, token }                 → offer details for the pay page
//     offer_checkout  { offer_id, token }                 → { url }          pay an accepted or countered offer
//   Business owner only (EndZone, signed in):
//     offer_respond   { offer_id, decision: accept|counter|decline, counter_amount? } → { ok }
//     order_shipped   { order_id, carrier?, tracking_number? }                       → { ok }
//
// Errors come back as { error: <code> } with a 4xx status; the site and EndZone show friendly text for each code.

import {
  adminClient, cardTitle, cents, CART_HOLD_MINUTES, cors, emailHtml, esc, isEmail, isUuid, json,
  MAX_CARDS_PER_ORDER, money, OFFER_HOLD_HOURS, offerPayUrl, ownerEmail, reserve, sendEmail, settings,
  SITE_URL, ENDZONE_URL, stripe, type Admin, type Settings,
} from "./lib.ts";

type Body = Record<string, unknown>;
class HttpError extends Error {
  constructor(public status: number, public code: string, public extra: Record<string, unknown> = {}) { super(code); }
}
function fail(status: number, code: string, extra: Record<string, unknown> = {}): never {
  throw new HttpError(status, code, extra);
}

// ---------------------------------------------------------------------------
// Cart checkout
// ---------------------------------------------------------------------------
async function createCheckout(admin: Admin, s: Settings, opts: {
  orderId: string; cards: { id: string; price: number; title: string; photo: string | null }[];
  offerId?: string; email?: string; expiresAt: Date;
}) {
  const subtotal = opts.cards.reduce((t, c) => t + c.price, 0);
  const { error: oErr } = await admin.from("shop_orders").insert({
    id: opts.orderId, user_id: s.owner_user_id, offer_id: opts.offerId ?? null,
    subtotal, shipping: s.shipping_flat, expires_at: opts.expiresAt.toISOString(),
  });
  if (oErr) throw new Error(`order insert: ${oErr.message}`);
  const { error: iErr } = await admin.from("shop_order_items")
    .insert(opts.cards.map((c) => ({ order_id: opts.orderId, show_card_id: c.id, price: c.price })));
  if (iErr) throw new Error(`order items insert: ${iErr.message}`);

  const { data: order } = await admin.from("shop_orders").select("order_number").eq("id", opts.orderId).single();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: opts.orderId,
    customer_email: opts.email,
    line_items: opts.cards.map((c) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: cents(c.price),
        product_data: { name: c.title, ...(c.photo ? { images: [c.photo] } : {}) },
        ...(s.collect_sales_tax ? { tax_behavior: "exclusive" as const } : {}),
      },
    })),
    shipping_address_collection: { allowed_countries: ["US"] },
    shipping_options: [{
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: "Flat rate, tracked (sleeve, top loader, team bag)",
        fixed_amount: { amount: cents(s.shipping_flat), currency: "usd" },
        ...(s.collect_sales_tax ? { tax_behavior: "exclusive" as const } : {}),
      },
    }],
    automatic_tax: { enabled: s.collect_sales_tax },
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60, // Stripe minimum is 30 minutes
    success_url: `${SITE_URL}/order.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/cart.html?back=${opts.orderId}`,
    metadata: { order_id: opts.orderId, order_number: order?.order_number ?? "", offer_id: opts.offerId ?? "" },
    payment_intent_data: {
      description: `CS Sports Cards order ${order?.order_number ?? ""}`.trim(),
      metadata: { order_id: opts.orderId },
    },
  });
  await admin.from("shop_orders").update({ stripe_session_id: session.id }).eq("id", opts.orderId);
  return session.url!;
}

async function checkout(admin: Admin, body: Body) {
  const ids = Array.isArray(body.cards) ? [...new Set(body.cards)] : [];
  if (ids.length === 0 || ids.length > MAX_CARDS_PER_ORDER || !ids.every(isUuid)) fail(400, "bad_cart");
  const s = await settings(admin);
  const orderId = crypto.randomUUID();
  const held = await reserve(admin, ids as string[], orderId, CART_HOLD_MINUTES);
  if (!held.ok) fail(409, "cards_unavailable", { cards: held.unavailable });
  try {
    const url = await createCheckout(admin, s, {
      orderId,
      cards: held.cards.map((c) => ({ id: c.id, price: c.price, title: cardTitle(c), photo: c.photo_front_url })),
      expiresAt: new Date(Date.now() + CART_HOLD_MINUTES * 60_000),
    });
    return { url };
  } catch (e) {
    await admin.rpc("release_hold", { p_ref: orderId });
    await admin.from("shop_orders").update({ status: "cancelled" }).eq("id", orderId);
    throw e;
  }
}

async function abandon(admin: Admin, body: Body) {
  if (!isUuid(body.order_id)) fail(400, "bad_request");
  const { data: o } = await admin.from("shop_orders").select("id, status, stripe_session_id, offer_id")
    .eq("id", body.order_id).maybeSingle();
  if (!o || o.status !== "pending") return { ok: true };
  if (o.stripe_session_id) {
    try {
      const sess = await stripe().checkout.sessions.retrieve(o.stripe_session_id);
      if (sess.status === "open") await stripe().checkout.sessions.expire(o.stripe_session_id);
      else if (sess.status === "complete") return { ok: true }; // paid; the webhook records it
    } catch (e) {
      console.warn("[shop] abandon: could not expire session", e instanceof Error ? e.message : e);
    }
  }
  await admin.from("shop_orders").update({ status: "expired" }).eq("id", o.id).eq("status", "pending");
  if (!o.offer_id) await admin.rpc("release_hold", { p_ref: o.id }); // an offer keeps its own hold
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------
async function listedCard(admin: Admin, s: Settings, cardId: string) {
  const { data: c } = await admin.from("show_cards")
    .select("id, user_id, player_name, year, card_details, asking_price, status, show_on_website, accept_offers, offer_floor, hold_until")
    .eq("id", cardId).maybeSingle();
  if (!c || c.user_id !== s.owner_user_id || !c.show_on_website || c.status !== "available" || Number(c.asking_price) < 10) {
    return null;
  }
  const d = (c.card_details ?? {}) as Record<string, string>;
  return {
    ...c,
    price: Number(c.asking_price),
    floor: c.offer_floor == null ? null : Number(c.offer_floor),
    title: cardTitle({ year: c.year, brand: d.brand, set_name: d.set, player_name: c.player_name, card_number: d.card_number }),
    held: !!c.hold_until && new Date(c.hold_until) > new Date(),
  };
}

const minOffer = (price: number, s: Settings) => Math.max(10, Math.ceil(price * s.offer_min_ratio));

async function makeOffer(admin: Admin, body: Body) {
  if (!isUuid(body.card_id) || !isEmail(body.email)) fail(400, "bad_request");
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) fail(400, "bad_amount");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) || null : null;
  const email = (body.email as string).trim().toLowerCase();

  const s = await settings(admin);
  const card = await listedCard(admin, s, body.card_id as string);
  if (!card || card.held) fail(409, "card_unavailable");
  if (!card!.accept_offers) fail(409, "no_offers");
  if (amount < minOffer(card!.price, s)) fail(400, "offer_too_low", { min: minOffer(card!.price, s) });
  if (amount >= card!.price) fail(400, "offer_at_price");

  // Light abuse limits: one open offer per buyer per card, 10 offers per buyer per day.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: open } = await admin.from("shop_offers").select("id", { count: "exact", head: true })
    .eq("show_card_id", card!.id).eq("buyer_email", email).eq("status", "pending").gt("respond_by", new Date().toISOString());
  if ((open ?? 0) > 0) fail(409, "offer_already_open");
  const { count: today } = await admin.from("shop_offers").select("id", { count: "exact", head: true })
    .eq("buyer_email", email).gte("created_at", since);
  if ((today ?? 0) >= 10) fail(429, "too_many_offers");

  const auto = card!.floor != null && amount >= card!.floor;
  const { data: offer, error } = await admin.from("shop_offers").insert({
    user_id: s.owner_user_id, show_card_id: card!.id, buyer_email: email, buyer_name: name,
    amount, asking_price: card!.price,
  }).select("id, pay_token").single();
  if (error || !offer) throw new Error(`offer insert: ${error?.message}`);

  const owner = await ownerEmail(admin, s);
  if (auto) {
    const held = await reserve(admin, [card!.id], offer.id, OFFER_HOLD_HOURS * 60);
    if (!held.ok) {
      await admin.from("shop_offers").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", offer.id);
      fail(409, "card_unavailable");
    }
    const payBy = new Date(Date.now() + OFFER_HOLD_HOURS * 3600_000);
    await admin.from("shop_offers").update({
      status: "accepted", auto_accepted: true, agreed_amount: amount, pay_by: payBy.toISOString(),
      responded_at: new Date().toISOString(),
    }).eq("id", offer.id);
    const url = offerPayUrl(offer.id, offer.pay_token);
    await sendEmail(email, `Offer accepted: ${card!.title}`, emailHtml("Your offer is accepted", [
      `Your offer of <strong>${money(amount)}</strong> on <strong>${esc(card!.title)}</strong> is accepted.`,
      `The card is held for you for 24 hours. Shipping is ${money(s.shipping_flat)}.`,
    ], { label: `PAY ${money(amount)} + ${money(s.shipping_flat)} SHIPPING`, url },
      "If the link expires, the card goes back on the site. Questions? Just reply to this email."), owner ?? undefined);
    await sendEmail(owner, `Offer auto-accepted: ${money(amount)} on ${card!.player_name}`, emailHtml("Offer auto-accepted", [
      `${esc(email)} offered <strong>${money(amount)}</strong> on ${esc(card!.title)} (asking ${money(card!.price)}).`,
      `It met your auto-accept price, so the buyer has a pay link good for 24 hours. The card is off the site until then.`,
    ], { label: "OPEN OFFERS IN ENDZONE", url: `${ENDZONE_URL}/offers` }));
    return { status: "accepted", pay_url: url };
  }

  await sendEmail(email, `Offer received: ${card!.title}`, emailHtml("Colton has your offer", [
    `Thanks for your offer of <strong>${money(amount)}</strong> on <strong>${esc(card!.title)}</strong>.`,
    `You'll get an email when he accepts, counters or passes, usually within a day. The card stays for sale until then.`,
  ]), owner ?? undefined);
  await sendEmail(owner, `New offer: ${money(amount)} on ${card!.player_name}`, emailHtml("New offer on the website", [
    `${esc(name ? `${name} (${email})` : email)} offered <strong>${money(amount)}</strong> on ${esc(card!.title)} (asking ${money(card!.price)}).`,
    `It expires in 48 hours if you don't answer.`,
  ], { label: "ANSWER IN ENDZONE", url: `${ENDZONE_URL}/offers` }));
  return { status: "pending" };
}

async function loadPayableOffer(admin: Admin, body: Body) {
  if (!isUuid(body.offer_id) || typeof body.token !== "string" || body.token.length < 20) fail(400, "bad_request");
  const { data: o } = await admin.from("shop_offers")
    .select("id, user_id, show_card_id, buyer_email, status, agreed_amount, pay_by, pay_token, order_id")
    .eq("id", body.offer_id).maybeSingle();
  if (!o || o.pay_token !== body.token) fail(404, "offer_not_found");
  if (o!.status === "paid") fail(409, "offer_paid");
  if (!["accepted", "countered"].includes(o!.status) || !o!.pay_by || new Date(o!.pay_by) < new Date()) fail(410, "offer_expired");
  return o!;
}

async function offerInfo(admin: Admin, body: Body) {
  const o = await loadPayableOffer(admin, body);
  const s = await settings(admin);
  const { data: c } = await admin.from("show_cards")
    .select("player_name, year, card_details, photo_front_url, asking_price").eq("id", o.show_card_id).single();
  const d = (c?.card_details ?? {}) as Record<string, string>;
  return {
    title: c ? cardTitle({ year: c.year, brand: d.brand, set_name: d.set, player_name: c.player_name, card_number: d.card_number }) : "",
    player_name: c?.player_name ?? "", photo_front_url: c?.photo_front_url ?? null,
    asking_price: Number(c?.asking_price ?? 0), price: Number(o.agreed_amount), shipping: s.shipping_flat,
    pay_by: o.pay_by, countered: o.status === "countered",
  };
}

async function offerCheckout(admin: Admin, body: Body) {
  const o = await loadPayableOffer(admin, body);
  const s = await settings(admin);
  const minutesLeft = (new Date(o.pay_by!).getTime() - Date.now()) / 60_000;
  // Keep the offer's own hold (ref = offer id) until pay_by; the checkout runs inside it.
  const held = await reserve(admin, [o.show_card_id], o.id, Math.max(minutesLeft, 31), o.id);
  if (!held.ok) fail(409, "card_unavailable");

  // One open checkout per offer: close any earlier one so the buyer can't pay twice.
  const { data: open } = await admin.from("shop_orders").select("id, stripe_session_id")
    .eq("offer_id", o.id).eq("status", "pending");
  for (const prev of open ?? []) {
    if (prev.stripe_session_id) {
      try { await stripe().checkout.sessions.expire(prev.stripe_session_id); } catch { /* already closed */ }
    }
    await admin.from("shop_orders").update({ status: "expired" }).eq("id", prev.id).eq("status", "pending");
  }

  const card = held.cards[0];
  const url = await createCheckout(admin, s, {
    orderId: crypto.randomUUID(), offerId: o.id, email: o.buyer_email,
    cards: [{ id: card.id, price: Number(o.agreed_amount), title: cardTitle(card), photo: card.photo_front_url }],
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  return { url };
}

// ---------------------------------------------------------------------------
// Owner actions (EndZone)
// ---------------------------------------------------------------------------
async function requireOwner(admin: Admin, req: Request, s: Settings) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) fail(401, "not_signed_in");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) fail(401, "not_signed_in");
  if (data!.user!.id !== s.owner_user_id) fail(403, "not_owner");
}

async function offerRespond(admin: Admin, req: Request, body: Body) {
  const s = await settings(admin);
  await requireOwner(admin, req, s);
  if (!isUuid(body.offer_id) || !["accept", "counter", "decline"].includes(body.decision as string)) fail(400, "bad_request");
  const { data: o } = await admin.from("shop_offers")
    .select("id, show_card_id, buyer_email, buyer_name, amount, asking_price, status, respond_by, pay_token")
    .eq("id", body.offer_id).eq("user_id", s.owner_user_id).maybeSingle();
  if (!o) fail(404, "offer_not_found");
  if (o!.status !== "pending") fail(409, "already_answered");
  if (new Date(o!.respond_by) < new Date()) fail(410, "offer_expired");

  const { data: c } = await admin.from("show_cards").select("player_name, year, card_details, asking_price")
    .eq("id", o!.show_card_id).single();
  const d = (c?.card_details ?? {}) as Record<string, string>;
  const title = c ? cardTitle({ year: c.year, brand: d.brand, set_name: d.set, player_name: c.player_name, card_number: d.card_number }) : "the card";
  const now = new Date();
  const owner = await ownerEmail(admin, s);

  if (body.decision === "decline") {
    await admin.from("shop_offers").update({ status: "declined", responded_at: now.toISOString() }).eq("id", o!.id).eq("status", "pending");
    await sendEmail(o!.buyer_email, `About your offer on ${c?.player_name ?? "the card"}`, emailHtml("Thanks for the offer", [
      `Colton can't take ${money(Number(o!.amount))} on <strong>${esc(title)}</strong> right now, but thanks for asking.`,
      `It's still in the case at ${money(Number(c?.asking_price ?? o!.asking_price))} if you change your mind.`,
    ], { label: "SEE THE CASE", url: `${SITE_URL}/shop` }), owner ?? undefined);
    return { ok: true, status: "declined" };
  }

  let agreed = Number(o!.amount);
  if (body.decision === "counter") {
    agreed = Math.round(Number(body.counter_amount) * 100) / 100;
    const price = Number(c?.asking_price ?? o!.asking_price);
    if (!Number.isFinite(agreed) || agreed <= Number(o!.amount) || agreed >= price) {
      fail(400, "bad_counter", { min: Number(o!.amount), max: price });
    }
  }
  const held = await reserve(admin, [o!.show_card_id], o!.id, OFFER_HOLD_HOURS * 60);
  if (!held.ok) fail(409, "card_unavailable");
  const payBy = new Date(now.getTime() + OFFER_HOLD_HOURS * 3600_000);
  const status = body.decision === "counter" ? "countered" : "accepted";
  const { data: updated } = await admin.from("shop_offers").update({
    status, agreed_amount: agreed, pay_by: payBy.toISOString(), responded_at: now.toISOString(),
    ...(status === "countered" ? { counter_amount: agreed } : {}),
  }).eq("id", o!.id).eq("status", "pending").select("id");
  if (!updated?.length) {
    await admin.rpc("release_hold", { p_ref: o!.id });
    fail(409, "already_answered");
  }

  const url = offerPayUrl(o!.id, o!.pay_token);
  if (status === "accepted") {
    await sendEmail(o!.buyer_email, `Offer accepted: ${title}`, emailHtml("Your offer is accepted", [
      `Colton accepted your offer of <strong>${money(agreed)}</strong> on <strong>${esc(title)}</strong>.`,
      `The card is held for you for 24 hours. Shipping is ${money(s.shipping_flat)}.`,
    ], { label: `PAY ${money(agreed)} + ${money(s.shipping_flat)} SHIPPING`, url },
      "If the link expires, the card goes back on the site."), owner ?? undefined);
  } else {
    await sendEmail(o!.buyer_email, `Colton countered your offer on ${c?.player_name ?? "the card"}`, emailHtml("Here's a counter-offer", [
      `Thanks for the offer of ${money(Number(o!.amount))} on <strong>${esc(title)}</strong>. Colton can do <strong>${money(agreed)}</strong>.`,
    ], { label: `PAY ${money(agreed)} + ${money(s.shipping_flat)} SHIPPING`, url },
      "This price is good for 24 hours and the card is held for you until then. Not interested? Just ignore this email."), owner ?? undefined);
  }
  return { ok: true, status };
}

async function orderShipped(admin: Admin, req: Request, body: Body) {
  const s = await settings(admin);
  await requireOwner(admin, req, s);
  if (!isUuid(body.order_id)) fail(400, "bad_request");
  const carrier = typeof body.carrier === "string" ? body.carrier.trim().slice(0, 40) || null : null;
  const tracking = typeof body.tracking_number === "string" ? body.tracking_number.trim().slice(0, 60) || null : null;
  const { data: o } = await admin.from("shop_orders")
    .update({ status: "shipped", shipped_at: new Date().toISOString(), carrier, tracking_number: tracking })
    .eq("id", body.order_id).eq("user_id", s.owner_user_id).eq("status", "paid")
    .select("order_number, buyer_email, buyer_name").maybeSingle();
  if (!o) fail(409, "not_shippable");
  const track = tracking
    ? `Tracking${carrier ? ` (${esc(carrier)})` : ""}: <strong>${esc(tracking)}</strong>`
    : "It's on its way.";
  await sendEmail(o!.buyer_email, `Order ${o!.order_number} has shipped`, emailHtml("Your cards are on the way", [
    `Order <strong>${esc(o!.order_number)}</strong> shipped today, packed in a sleeve, top loader and team bag.`, track,
  ], undefined, "Thanks for buying from CS Sports Cards. Follow @cs.sportscards on Instagram for weekly drops."),
    (await ownerEmail(admin, s)) ?? undefined);
  return { ok: true };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "bad_request" });
  }
  const admin = adminClient();
  try {
    switch (body.action) {
      case "checkout": return json(req, 200, await checkout(admin, body));
      case "abandon": return json(req, 200, await abandon(admin, body));
      case "offer": return json(req, 200, await makeOffer(admin, body));
      case "offer_info": return json(req, 200, await offerInfo(admin, body));
      case "offer_checkout": return json(req, 200, await offerCheckout(admin, body));
      case "offer_respond": return json(req, 200, await offerRespond(admin, req, body));
      case "order_shipped": return json(req, 200, await orderShipped(admin, req, body));
      default: return json(req, 400, { error: "unknown_action" });
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, e.status, { error: e.code, ...e.extra });
    console.error("[shop] failed:", body.action, e instanceof Error ? e.message : e);
    return json(req, 500, { error: "server_error" });
  }
});
