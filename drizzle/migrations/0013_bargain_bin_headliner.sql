-- =====================================================================
-- EndZone 0013 — Bargain Bin + Weekly Headliner (Nov 2 2026, agreed with Colton)
-- * show_cards.in_bargain_bin: a value card kept apart from the premium case. On the website it shows only
--   in The Bargain Bin (never in Shop the Case), may be priced from $5, and never takes offers.
-- * website_settings.headliner_card_id / headliner_note: the home page's Weekly Headliner, chosen in EndZone.
-- =====================================================================

ALTER TABLE public.show_cards ADD COLUMN in_bargain_bin boolean NOT NULL DEFAULT false;
CREATE INDEX idx_show_cards_bin ON public.show_cards (user_id) WHERE in_bargain_bin;

-- A website card needs $10+ — or $5+ when it's a Bargain Bin card.
ALTER TABLE public.show_cards DROP CONSTRAINT show_cards_website_ready;
ALTER TABLE public.show_cards ADD CONSTRAINT show_cards_website_ready CHECK (
  NOT show_on_website OR (
    (asking_price >= 10 OR (in_bargain_bin AND asking_price >= 5))
    AND photo_front_url IS NOT NULL AND sport IS NOT NULL AND team IS NOT NULL));

ALTER TABLE public.website_settings
  ADD COLUMN headliner_card_id uuid REFERENCES public.show_cards(id) ON DELETE SET NULL,
  ADD COLUMN headliner_note text CHECK (headliner_note IS NULL OR char_length(headliner_note) <= 160);
GRANT UPDATE (headliner_card_id, headliner_note) ON public.website_settings TO authenticated;

-- ---------- shop feed: case + bin cards, each flagged; bin cards from $5 and never open to offers
DROP FUNCTION IF EXISTS public.get_shop_cards();
CREATE FUNCTION public.get_shop_cards()
RETURNS TABLE(id uuid, player_name text, year text, brand text, set_name text, card_number text, condition text,
              sport text, team text, price numeric, photo_front_url text, photo_back_url text,
              listed_at timestamp with time zone, offers_open boolean,
              rookie boolean, autograph boolean, parallel text, serial_number text, in_bin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT c.id, btrim(c.player_name), nullif(btrim(c.year), ''),
         nullif(btrim(c.card_details->>'brand'), ''), nullif(btrim(c.card_details->>'set'), ''),
         nullif(btrim(c.card_details->>'card_number'), ''), nullif(btrim(c.card_details->>'condition'), ''),
         c.sport, nullif(btrim(c.team), ''), c.asking_price,
         c.photo_front_url,
         CASE WHEN c.photo_back_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_back_url END,
         c.website_listed_at,
         w.offers_enabled AND NOT c.in_bargain_bin AND c.asking_price >= 10,
         coalesce(c.card_details->'rookie' = 'true'::jsonb, false),
         coalesce(c.card_details->'autograph' = 'true'::jsonb, false),
         nullif(btrim(c.card_details->>'parallel'), ''),
         nullif(btrim(c.card_details->>'serial_number'), ''),
         c.in_bargain_bin
  FROM public.show_cards c
  JOIN public.website_settings w ON w.owner_user_id = c.user_id
  WHERE c.show_on_website
    AND c.status = 'available'
    AND (c.asking_price >= 10 OR (c.in_bargain_bin AND c.asking_price >= 5))
    AND c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%'
    AND (c.held_until IS NULL OR c.held_until < now())
  ORDER BY c.website_listed_at DESC NULLS LAST, c.id;
$function$;
REVOKE ALL ON FUNCTION public.get_shop_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_cards() TO anon, authenticated, service_role;

-- ---------- checkout: bin cards may be $5–$9.99 (case cards still $10+)
CREATE OR REPLACE FUNCTION public.web_create_order(p_card_ids uuid[], p_source text DEFAULT 'cart'::text, p_offer_id uuid DEFAULT NULL::uuid, p_prices jsonb DEFAULT NULL::jsonb, p_hold_minutes integer DEFAULT NULL::integer)
 RETURNS web_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w        website_settings;
  v_order  web_orders;
  v_ids    uuid[] := ARRAY(SELECT DISTINCT unnest(p_card_ids));
  v_held   uuid[];
  v_sub    numeric(10,2);
  v_mins   integer;
BEGIN
  SELECT * INTO w FROM website_settings LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Website settings missing'; END IF;
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;
  IF array_length(v_ids, 1) > 50 THEN RAISE EXCEPTION 'CART_TOO_LARGE'; END IF;
  v_mins := coalesce(p_hold_minutes, w.hold_minutes);
  INSERT INTO web_orders (user_id, source, offer_id, subtotal, shipping, total, hold_expires_at)
  VALUES (w.owner_user_id, p_source, p_offer_id, 0, 0, 0, now() + make_interval(mins => v_mins))
  RETURNING * INTO v_order;
  WITH held AS (
    UPDATE show_cards c
    SET held_until = v_order.hold_expires_at, held_for = v_order.id
    WHERE c.id = ANY (v_ids)
      AND c.user_id = w.owner_user_id
      AND c.status = 'available'
      AND c.show_on_website
      AND (c.asking_price >= 10 OR (c.in_bargain_bin AND c.asking_price >= 5))
      AND (c.held_until IS NULL OR c.held_until < now()
           OR (p_offer_id IS NOT NULL AND c.held_for IN (SELECT o.id FROM web_orders o WHERE o.offer_id = p_offer_id)))
    RETURNING c.id)
  SELECT array_agg(id) INTO v_held FROM held;
  IF coalesce(array_length(v_held, 1), 0) <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'CARDS_UNAVAILABLE:%',
      array_to_string(ARRAY(SELECT unnest(v_ids) EXCEPT SELECT unnest(coalesce(v_held, '{}'::uuid[]))), ',');
  END IF;
  INSERT INTO web_order_items (order_id, show_card_id, price, description)
  SELECT v_order.id, c.id,
         coalesce((p_prices ->> c.id::text)::numeric(10,2), c.asking_price),
         btrim(concat_ws(' ', c.player_name, '—', c.year, c.card_details->>'brand', c.card_details->>'set',
               CASE WHEN c.card_details->>'card_number' IS NOT NULL
                    THEN '#' || ltrim(c.card_details->>'card_number', '#') END))
  FROM show_cards c WHERE c.id = ANY (v_ids);
  SELECT sum(price) INTO v_sub FROM web_order_items WHERE order_id = v_order.id;
  UPDATE web_orders
  SET subtotal = v_sub, shipping = w.shipping_flat, total = v_sub + w.shipping_flat
  WHERE id = v_order.id
  RETURNING * INTO v_order;
  RETURN v_order;
END; $function$;

-- ---------- offers: never on bin cards
CREATE OR REPLACE FUNCTION public.web_make_offer(
  p_card_id uuid, p_amount numeric, p_buyer_name text, p_buyer_email text, p_note text,
  p_action_token text, p_pay_token text, p_ip_hash text DEFAULT NULL)
RETURNS public.web_offers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  SELECT count(*) INTO v_recent FROM web_offers
  WHERE show_card_id = c.id AND lower(buyer_email) = lower(p_buyer_email) AND created_at > now() - interval '1 day';
  IF v_recent >= 3 THEN RAISE EXCEPTION 'TOO_MANY_OFFERS'; END IF;
  IF p_ip_hash IS NOT NULL THEN
    IF (SELECT count(*) FROM web_offers WHERE buyer_ip_hash = p_ip_hash AND created_at > now() - interval '1 hour') >= 10
       OR (SELECT count(*) FROM web_offers WHERE buyer_ip_hash = p_ip_hash AND created_at > now() - interval '1 day') >= 30 THEN
      RAISE EXCEPTION 'TOO_MANY_OFFERS';
    END IF;
  END IF;
  v_floor := coalesce(c.offer_floor, round(c.asking_price * w.offer_floor_pct, 2));
  IF p_amount >= v_floor AND (
       (SELECT count(*) FROM web_offers WHERE status IN ('accepted','countered') AND pay_expires_at > now()
          AND lower(buyer_email) = lower(p_buyer_email)) >= 2
    OR (p_ip_hash IS NOT NULL AND (SELECT count(*) FROM web_offers WHERE status IN ('accepted','countered')
          AND pay_expires_at > now() AND buyer_ip_hash = p_ip_hash) >= 2)) THEN
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
END; $$;
REVOKE ALL ON FUNCTION public.web_make_offer(uuid, numeric, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_make_offer(uuid, numeric, text, text, text, text, text, text) TO service_role;

-- ---------- website lists: + the Weekly Headliner (stays up marked sold until Colton picks the next one)
CREATE OR REPLACE FUNCTION public.get_website_lists()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH w AS (SELECT owner_user_id, headliner_card_id, headliner_note FROM website_settings LIMIT 1),
  today AS (SELECT (now() AT TIME ZONE 'America/New_York')::date d)
  SELECT jsonb_build_object(
    'wanted', coalesce((
      SELECT jsonb_agg(jsonb_build_object('sport', ww.sport, 'position', ww.position, 'player', ww.player_name)
             ORDER BY array_position(ARRAY['Football','Men''s Basketball','Women''s Basketball','Baseball','Hockey','Soccer','Other'], ww.sport),
                      g.first_order, lower(ww.position), lower(ww.player_name))
      FROM website_wanted ww
      JOIN (SELECT sport, lower(position) pos, min(sort_order) first_order FROM website_wanted, w
            WHERE user_id = w.owner_user_id GROUP BY 1, 2) g ON g.sport = ww.sport AND g.pos = lower(ww.position)
      , w WHERE ww.user_id = w.owner_user_id), '[]'::jsonb),
    'wanted_updated', (SELECT max(updated_at) FROM website_wanted, w WHERE user_id = w.owner_user_id),
    'shows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', s.name, 'location', s.location, 'start', s.start_date,
                                          'end', s.end_date, 'kind', s.kind) ORDER BY s.start_date, s.name)
      FROM website_shows s, w, today
      WHERE s.user_id = w.owner_user_id AND coalesce(s.end_date, s.start_date) >= today.d), '[]'::jsonb),
    'headliner', (
      SELECT jsonb_build_object(
        'id', c.id, 'player_name', btrim(c.player_name), 'year', c.year,
        'brand', nullif(btrim(c.card_details->>'brand'), ''), 'set_name', nullif(btrim(c.card_details->>'set'), ''),
        'parallel', nullif(btrim(c.card_details->>'parallel'), ''), 'card_number', nullif(btrim(c.card_details->>'card_number'), ''),
        'condition', nullif(btrim(c.card_details->>'condition'), ''),
        'rookie', coalesce(c.card_details->'rookie' = 'true'::jsonb, false),
        'autograph', coalesce(c.card_details->'autograph' = 'true'::jsonb, false),
        'serial_number', nullif(btrim(c.card_details->>'serial_number'), ''),
        'sport', c.sport, 'team', c.team, 'price', c.asking_price,
        'photo_front_url', CASE WHEN c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_front_url END,
        'sold', c.status = 'sold',
        'note', nullif(btrim(w.headliner_note), ''))
      FROM w JOIN show_cards c ON c.id = w.headliner_card_id AND c.user_id = w.owner_user_id
      WHERE c.show_on_website AND c.status IN ('available', 'sold'))
  );
$$;
REVOKE ALL ON FUNCTION public.get_website_lists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_website_lists() TO anon, authenticated;
