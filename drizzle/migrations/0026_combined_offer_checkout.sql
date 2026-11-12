-- 0026 combined offer checkout (11 Nov 2026)
-- Problem: every accepted/countered offer was its own order with its own $6 shipping, and the held card was
-- hidden from the shop, so a buyer with several offers couldn't pay them together or put them in the cart.
-- Fix:
--   * Accepted-offer cards can go in a cart order at the offer price (web_order_items.offer_id).
--     web_create_cart_order moves the card's hold from the offer's own order to the cart order.
--   * If that cart checkout is canceled or runs out, the card goes back to its offer hold (until the offer's
--     own 24 hours end), not back in the case: web_release_order / web_release_stale_holds restore it.
--   * When the cart order is paid, its offers are marked paid and their own pending orders are closed.
--   * Codes never take money off an offer price (already negotiated).
--   * Open-offer cap: 15 accepted or countered offers waiting to be paid per buyer (email or device),
--     counting Colton's own accepts and counters; no cap for a buyer email with a paid website order.
-- Also records in the repo what 0024_loosen_offer_limits and 0025_open_offer_cap_auto_only changed live
-- (both were applied through the Supabase MCP only): web_make_offer below is the full current version.

ALTER TABLE public.web_order_items ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.web_offers(id) ON DELETE SET NULL;

-- Put accepted-offer cards in a released cart order back on their own offer hold, while the offer is still open.
CREATE OR REPLACE FUNCTION public.web_restore_offer_holds(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  UPDATE show_cards c
  SET held_for = oo.id, held_until = oo.hold_expires_at
  FROM web_order_items oi
  JOIN web_offers f ON f.id = oi.offer_id
  JOIN web_orders oo ON oo.offer_id = f.id AND oo.source = 'offer' AND oo.status = 'pending'
  WHERE oi.order_id = p_order_id AND c.id = oi.show_card_id AND c.held_for = p_order_id
    AND c.status = 'available'
    AND f.status IN ('accepted','countered') AND f.pay_expires_at > now() AND oo.hold_expires_at > now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $function$;

CREATE OR REPLACE FUNCTION public.web_release_order(p_order_id uuid, p_status text DEFAULT 'expired'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_status NOT IN ('expired','canceled') THEN RAISE EXCEPTION 'Bad status'; END IF;
  IF EXISTS (SELECT 1 FROM web_orders WHERE id = p_order_id AND status = 'pending') THEN
    PERFORM web_restore_offer_holds(p_order_id); -- offer cards go back to their offer hold (0026)
  END IF;
  UPDATE web_orders SET status = p_status WHERE id = p_order_id AND status = 'pending';
  UPDATE show_cards SET held_until = NULL, held_for = NULL WHERE held_for = p_order_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.web_release_stale_holds()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer; r record;
BEGIN
  -- Cart orders first, so offer cards in them go back to their offer hold instead of the case (0026).
  FOR r IN SELECT id FROM web_orders
           WHERE status = 'pending' AND source = 'cart' AND hold_expires_at < now() - interval '10 minutes'
             AND EXISTS (SELECT 1 FROM web_order_items oi WHERE oi.order_id = web_orders.id AND oi.offer_id IS NOT NULL)
  LOOP
    PERFORM web_release_order(r.id, 'expired');
  END LOOP;
  UPDATE show_cards SET held_until = NULL, held_for = NULL
  WHERE held_until IS NOT NULL AND held_until < now() - interval '10 minutes';
  UPDATE web_orders SET status = 'expired'
  WHERE status = 'pending' AND hold_expires_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE web_offers SET status = 'expired'
  WHERE status IN ('accepted','countered') AND pay_expires_at < now();
  RETURN v_count;
END; $function$;

-- Cart order with regular cards (asking price) and accepted-offer cards (offer price). All or nothing.
-- Errors: EMPTY_CART, CART_TOO_LARGE, OFFERS_MIXED_EMAIL, OFFERS_UNAVAILABLE:<offer ids>, CARDS_UNAVAILABLE:<card ids>
CREATE OR REPLACE FUNCTION public.web_create_cart_order(p_card_ids uuid[], p_offer_ids uuid[], p_hold_minutes integer DEFAULT NULL::integer)
 RETURNS web_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w        website_settings;
  v_order  web_orders;
  v_offers uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_offer_ids, '{}'::uuid[])) x WHERE x IS NOT NULL);
  v_ocards uuid[];
  v_ids    uuid[];
  v_held   uuid[];
  v_bad    uuid[] := '{}';
  v_email  text;
  v_sub    numeric(10,2);
  f        web_offers;
  oo       web_orders;
BEGIN
  SELECT * INTO w FROM website_settings LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Website settings missing'; END IF;
  SELECT array_agg(show_card_id) INTO v_ocards FROM web_offers WHERE id = ANY (v_offers);
  -- a card that's in the cart and also one of the buyer's offers is bought once, at the offer price
  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_card_ids, '{}'::uuid[])) x
                 WHERE x IS NOT NULL AND NOT (x = ANY (coalesce(v_ocards, '{}'::uuid[]))));
  IF coalesce(array_length(v_ids, 1), 0) + coalesce(array_length(v_offers, 1), 0) = 0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;
  IF coalesce(array_length(v_ids, 1), 0) + coalesce(array_length(v_offers, 1), 0) > 50 THEN RAISE EXCEPTION 'CART_TOO_LARGE'; END IF;

  IF array_length(v_offers, 1) > 0 THEN
    IF (SELECT count(DISTINCT lower(btrim(buyer_email))) FROM web_offers WHERE id = ANY (v_offers)) > 1 THEN
      RAISE EXCEPTION 'OFFERS_MIXED_EMAIL';
    END IF;
    v_bad := ARRAY(SELECT x FROM unnest(v_offers) x WHERE NOT EXISTS (SELECT 1 FROM web_offers WHERE id = x));
    FOR f IN SELECT * FROM web_offers WHERE id = ANY (v_offers) FOR UPDATE LOOP
      v_email := lower(btrim(f.buyer_email));
      IF f.user_id <> w.owner_user_id OR f.status NOT IN ('accepted','countered') OR f.pay_expires_at IS NULL
         OR f.pay_expires_at <= now() THEN
        v_bad := v_bad || f.id; CONTINUE;
      END IF;
      -- the offer's own order holds the card; (re)create it if it lapsed while the offer is still open
      BEGIN
        oo := web_hold_for_offer(f.id);
      EXCEPTION WHEN others THEN
        v_bad := v_bad || f.id; CONTINUE;
      END;
      IF NOT EXISTS (SELECT 1 FROM show_cards c WHERE c.id = f.show_card_id AND c.status = 'available'
                     AND c.held_for = oo.id AND c.held_until > now()) THEN
        v_bad := v_bad || f.id;
      END IF;
    END LOOP;
    IF array_length(v_bad, 1) > 0 THEN RAISE EXCEPTION 'OFFERS_UNAVAILABLE:%', array_to_string(v_bad, ','); END IF;
  END IF;

  INSERT INTO web_orders (user_id, source, subtotal, shipping, total, hold_expires_at, buyer_email)
  VALUES (w.owner_user_id, 'cart', 0, 0, 0,
          now() + make_interval(mins => coalesce(p_hold_minutes, w.hold_minutes)), v_email)
  RETURNING * INTO v_order;

  IF array_length(v_ids, 1) > 0 THEN
    WITH held AS (
      UPDATE show_cards c
      SET held_until = v_order.hold_expires_at, held_for = v_order.id
      WHERE c.id = ANY (v_ids)
        AND c.user_id = w.owner_user_id
        AND c.status = 'available'
        AND c.show_on_website
        AND (c.asking_price >= 10 OR (c.in_bargain_bin AND c.asking_price >= 2))
        AND (c.held_until IS NULL OR c.held_until < now())
      RETURNING c.id)
    SELECT array_agg(id) INTO v_held FROM held;
    IF coalesce(array_length(v_held, 1), 0) <> array_length(v_ids, 1) THEN
      RAISE EXCEPTION 'CARDS_UNAVAILABLE:%',
        array_to_string(ARRAY(SELECT unnest(v_ids) EXCEPT SELECT unnest(coalesce(v_held, '{}'::uuid[]))), ',');
    END IF;
  END IF;

  IF array_length(v_offers, 1) > 0 THEN
    -- move each offer card's hold from its offer order to this order (put back by web_release_order)
    UPDATE show_cards c
    -- (same hold length as the regular cards; if the offer still has time left when this checkout closes,
    -- web_release_order puts the card back on its offer hold)
    SET held_until = v_order.hold_expires_at, held_for = v_order.id
    FROM web_offers wf JOIN web_orders wo ON wo.offer_id = wf.id AND wo.status = 'pending' AND wo.source = 'offer'
    WHERE wf.id = ANY (v_offers) AND c.id = wf.show_card_id AND c.held_for = wo.id;
    IF (SELECT count(*) FROM show_cards WHERE held_for = v_order.id) <>
       coalesce(array_length(v_ids, 1), 0) + array_length(v_offers, 1) THEN
      RAISE EXCEPTION 'OFFERS_UNAVAILABLE:%', array_to_string(v_offers, ',');
    END IF;
  END IF;

  INSERT INTO web_order_items (order_id, show_card_id, price, description, offer_id)
  SELECT v_order.id, c.id, coalesce(wf.final_amount, c.asking_price),
         btrim(concat_ws(' ', c.player_name, '—', c.year, c.card_details->>'brand', c.card_details->>'set',
               CASE WHEN c.card_details->>'card_number' IS NOT NULL
                    THEN '#' || ltrim(c.card_details->>'card_number', '#') END)),
         wf.id
  FROM show_cards c
  LEFT JOIN web_offers wf ON wf.id = ANY (v_offers) AND wf.show_card_id = c.id
  WHERE c.held_for = v_order.id;
  SELECT sum(price) INTO v_sub FROM web_order_items WHERE order_id = v_order.id;
  UPDATE web_orders
  SET subtotal = v_sub, shipping = w.shipping_flat, total = v_sub + w.shipping_flat
  WHERE id = v_order.id
  RETURNING * INTO v_order;
  RETURN v_order;
END; $function$;

REVOKE ALL ON FUNCTION public.web_create_cart_order(uuid[], uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_create_cart_order(uuid[], uuid[], integer) TO service_role;
REVOKE ALL ON FUNCTION public.web_restore_offer_holds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_restore_offer_holds(uuid) TO service_role;

-- Codes come off regular cards only; an offer price is already negotiated (0026).
CREATE OR REPLACE FUNCTION public.web_apply_discount(p_order_id uuid, p_code text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o web_orders; chk jsonb; v_base numeric(10,2); v_total numeric(10,2); v_left numeric(10,2);
        v_share numeric(10,2); it record; n integer; i integer := 0;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' OR o.source <> 'cart' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  chk := web_check_discount(p_code, p_email);
  IF NOT (chk->>'valid')::boolean THEN RETURN chk || jsonb_build_object('applied', false); END IF;
  IF (SELECT user_id FROM web_discount_codes WHERE code = chk->>'code') <> o.user_id THEN
    RETURN jsonb_build_object('applied', false, 'valid', false, 'message', 'That code isn''t valid.');
  END IF;

  SELECT coalesce(sum(price), 0), count(*) INTO v_base, n
  FROM web_order_items WHERE order_id = o.id AND NOT deal_free AND offer_id IS NULL;
  IF n = 0 THEN
    RETURN jsonb_build_object('applied', false, 'valid', false,
      'message', 'Codes don''t apply to offer prices. Add a card at its listed price to use your code.');
  END IF;
  v_total := round(v_base * (chk->>'percent')::numeric / 100, 2);
  v_left := v_total;
  FOR it IN SELECT id, price FROM web_order_items WHERE order_id = o.id AND NOT deal_free AND offer_id IS NULL
            ORDER BY price, id LOOP
    i := i + 1;
    v_share := CASE WHEN i = n THEN v_left
                    ELSE coalesce(round(v_total * it.price / nullif(v_base, 0), 2), 0) END;
    v_share := least(v_share, it.price);
    v_left := v_left - v_share;
    UPDATE web_order_items SET discount = v_share WHERE id = it.id;
  END LOOP;
  UPDATE web_orders
  SET discount_code = chk->>'code', discount = deal_discount + v_total,
      total = subtotal - deal_discount - v_total + shipping, buyer_email = lower(btrim(p_email))
  WHERE id = o.id;
  RETURN jsonb_build_object('applied', true, 'code', chk->>'code', 'percent', (chk->>'percent')::numeric,
                            'discount', v_total);
END; $function$;

-- Paid: offers in the order are paid too, and their own pending orders are closed (0026).
CREATE OR REPLACE FUNCTION public.web_complete_order(p_order_id uuid, p_payment_intent text, p_stripe_fee numeric, p_paid_at timestamp with time zone, p_buyer_email text, p_buyer_name text, p_shipping_address jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o          web_orders;
  it         record;
  n          integer;
  i          integer := 0;
  ship_left  numeric(10,2);
  fee_left   numeric(10,2);
  ship_share numeric(10,2);
  fee_share  numeric(10,2);
  v_txn      uuid;
  v_problems text[] := '{}';
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status = 'paid' THEN RETURN false; END IF;
  SELECT count(*) INTO n FROM web_order_items WHERE order_id = o.id;
  ship_left := o.shipping;
  fee_left  := coalesce(p_stripe_fee, 0);
  FOR it IN
    SELECT oi.*, c.status AS card_status, c.user_id AS card_owner, c.lot_id AS card_lot, c.held_for AS card_held_for
    FROM web_order_items oi JOIN show_cards c ON c.id = oi.show_card_id
    WHERE oi.order_id = o.id ORDER BY oi.price, oi.id
  LOOP
    i := i + 1;
    IF i = n THEN
      ship_share := ship_left; fee_share := fee_left;
    ELSE
      ship_share := round(o.shipping * it.price / nullif(o.subtotal, 0), 2);
      fee_share  := round(coalesce(p_stripe_fee, 0) * it.price / nullif(o.subtotal, 0), 2);
      ship_share := coalesce(ship_share, 0); fee_share := coalesce(fee_share, 0);
      ship_left := ship_left - ship_share; fee_left := fee_left - fee_share;
    END IF;
    IF it.card_status <> 'available' THEN
      v_problems := v_problems || (it.description || ' was already ' || it.card_status || ' in EndZone');
    ELSIF o.status <> 'pending' AND it.card_held_for IS DISTINCT FROM o.id THEN
      v_problems := v_problems || (it.description || ' was paid after this checkout closed; check it isn''t sold twice');
    END IF;
    INSERT INTO transactions (user_id, transaction_type, lot_id, show_card_id, quantity, revenue, gross_amount,
                              sales_channel, transaction_date, notes)
    VALUES (it.card_owner, 'show_card_sale', it.card_lot, it.show_card_id, 1,
            greatest(it.price - it.discount + ship_share - fee_share, 0), it.price - it.discount + ship_share,
            'website', p_paid_at,
            'Website order ' || o.order_number
            || CASE WHEN it.deal_free THEN ' (free: Bargain Bin deal, ' || to_char(it.price, 'FM$999990.00') || ' off)'
                    WHEN it.offer_id IS NOT NULL THEN ' (accepted offer)'
                    WHEN it.discount > 0 THEN ' (code ' || coalesce(o.discount_code, '?') || ', '
                                              || to_char(it.discount, 'FM$999990.00') || ' off)'
                    ELSE '' END)
    RETURNING id INTO v_txn;
    UPDATE web_order_items SET transaction_id = v_txn WHERE id = it.id;
  END LOOP;
  IF o.discount_code IS NOT NULL AND p_buyer_email IS NOT NULL
     AND lower(btrim(p_buyer_email)) <> lower(btrim(coalesce(o.buyer_email, ''))) THEN
    v_problems := v_problems || ('Code ' || o.discount_code || ' was checked for ' || coalesce(o.buyer_email, '?')
                                 || ' but paid as ' || p_buyer_email);
  END IF;
  UPDATE web_orders
  SET status = 'paid', paid_at = p_paid_at, stripe_payment_intent_id = p_payment_intent,
      stripe_fee = p_stripe_fee,
      buyer_email = coalesce(p_buyer_email, buyer_email), buyer_name = coalesce(p_buyer_name, buyer_name),
      shipping_address = coalesce(p_shipping_address, shipping_address),
      problem_note = CASE WHEN array_length(v_problems, 1) > 0 THEN array_to_string(v_problems, '; ') END
  WHERE id = o.id;
  UPDATE show_cards SET held_until = NULL, held_for = NULL WHERE held_for = o.id;
  IF o.offer_id IS NOT NULL THEN UPDATE web_offers SET status = 'paid' WHERE id = o.offer_id; END IF;
  -- offers paid through the cart (0026)
  UPDATE web_offers f SET status = 'paid', order_id = o.id
  FROM web_order_items oi WHERE oi.order_id = o.id AND oi.offer_id = f.id;
  UPDATE web_orders oo SET status = 'canceled'
  WHERE oo.status = 'pending' AND oo.source = 'offer' AND oo.id <> o.id
    AND oo.offer_id IN (SELECT offer_id FROM web_order_items WHERE order_id = o.id AND offer_id IS NOT NULL);
  RETURN true;
END; $function$;

-- Open-offer cap (0026): 15 accepted or countered offers waiting to be paid, per buyer email and per device,
-- counting Colton's own accepts and counters. No cap for an email that already has a paid website order.
CREATE OR REPLACE FUNCTION public.web_make_offer(p_card_id uuid, p_amount numeric, p_buyer_name text, p_buyer_email text, p_note text, p_action_token text, p_pay_token text, p_ip_hash text DEFAULT NULL::text)
 RETURNS web_offers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w website_settings;
  c show_cards;
  v_floor numeric(10,2);
  v_offer web_offers;
  v_recent integer;
BEGIN
  SELECT * INTO w FROM website_settings LIMIT 1;
  IF NOT FOUND OR NOT w.offers_enabled THEN RAISE EXCEPTION 'OFFERS_OFF'; END IF;
  SELECT * INTO c FROM show_cards
  WHERE id = p_card_id AND user_id = w.owner_user_id AND status = 'available' AND show_on_website
    AND asking_price >= 10 AND NOT in_bargain_bin AND (held_until IS NULL OR held_until < now());
  IF NOT FOUND THEN RAISE EXCEPTION 'CARD_UNAVAILABLE'; END IF;
  p_amount := round(p_amount, 2);
  IF p_amount < 1 THEN RAISE EXCEPTION 'OFFER_TOO_LOW'; END IF;
  IF p_amount >= c.asking_price THEN RAISE EXCEPTION 'OFFER_AT_ASKING'; END IF;
  -- Per card, per email: 3 offers a day.
  SELECT count(*) INTO v_recent FROM web_offers
  WHERE show_card_id = c.id AND lower(buyer_email) = lower(p_buyer_email) AND created_at > now() - interval '1 day';
  IF v_recent >= 3 THEN RAISE EXCEPTION 'TOO_MANY_OFFERS'; END IF;
  -- Per device: 30 an hour, 75 a day (0024).
  IF p_ip_hash IS NOT NULL THEN
    IF (SELECT count(*) FROM web_offers WHERE buyer_ip_hash = p_ip_hash AND created_at > now() - interval '1 hour') >= 30
       OR (SELECT count(*) FROM web_offers WHERE buyer_ip_hash = p_ip_hash AND created_at > now() - interval '1 day') >= 75 THEN
      RAISE EXCEPTION 'TOO_MANY_OFFERS';
    END IF;
  END IF;
  v_floor := coalesce(c.offer_floor, round(c.asking_price * w.offer_floor_pct, 2));
  -- Offers waiting to be paid: 15 per buyer (0026). Buyers with a paid website order have no cap.
  IF p_amount >= v_floor
     AND NOT EXISTS (SELECT 1 FROM web_orders WHERE status = 'paid' AND user_id = w.owner_user_id
                     AND lower(btrim(buyer_email)) = lower(btrim(p_buyer_email)))
     AND ((SELECT count(*) FROM web_offers WHERE status IN ('accepted','countered') AND pay_expires_at > now()
             AND lower(buyer_email) = lower(p_buyer_email)) >= 15
       OR (p_ip_hash IS NOT NULL AND (SELECT count(*) FROM web_offers WHERE status IN ('accepted','countered')
             AND pay_expires_at > now() AND buyer_ip_hash = p_ip_hash) >= 15)) THEN
    RAISE EXCEPTION 'TOO_MANY_OPEN_OFFERS';
  END IF;
  INSERT INTO web_offers (user_id, show_card_id, buyer_name, buyer_email, buyer_note, amount,
                          asking_at_offer, floor_at_offer, action_token, buyer_ip_hash,
                          status, auto_accepted, final_amount, pay_token, pay_expires_at, responded_at)
  VALUES (w.owner_user_id, c.id, btrim(p_buyer_name), btrim(p_buyer_email), nullif(btrim(p_note), ''), p_amount,
          c.asking_price, v_floor, p_action_token, p_ip_hash,
          CASE WHEN p_amount >= v_floor THEN 'accepted' ELSE 'pending' END,
          p_amount >= v_floor,
          CASE WHEN p_amount >= v_floor THEN p_amount END,
          CASE WHEN p_amount >= v_floor THEN p_pay_token END,
          CASE WHEN p_amount >= v_floor THEN now() + make_interval(hours => w.offer_hold_hours) END,
          CASE WHEN p_amount >= v_floor THEN now() END)
  RETURNING * INTO v_offer;
  IF v_offer.status = 'accepted' THEN
    PERFORM web_hold_for_offer(v_offer.id);
  END IF;
  RETURN v_offer;
END; $function$;
