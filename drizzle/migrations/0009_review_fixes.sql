-- =====================================================================
-- EndZone 0009 — fixes from the independent pre-launch review (Nov 1 2026).
-- H1  offer abuse: per-IP rate limit + cap on open accepted offers (per email and per IP)
-- H2  offer pay link near expiry: web_extend_hold() so the hold always outlasts the Stripe session
-- M2  in-person sale of a card held for an online buyer is refused
-- L2  shipping/hold settings are no longer editable from the app ($6 is printed on the site)
-- L3  owner/mentor can no longer read the secret email-link tokens on offers
-- =====================================================================

-- ---------- L3: hide offer tokens from app users (service role still sees everything)
REVOKE SELECT ON public.web_offers FROM authenticated;
GRANT SELECT (id, user_id, show_card_id, buyer_name, buyer_email, buyer_note, amount, asking_at_offer, floor_at_offer,
              status, auto_accepted, counter_amount, final_amount, pay_expires_at, order_id, responded_at,
              created_at, updated_at)
  ON public.web_offers TO authenticated;

-- ---------- L2: only offers on/off and the default % stay editable in EndZone
REVOKE UPDATE ON public.website_settings FROM authenticated;
GRANT UPDATE (offers_enabled, offer_floor_pct) ON public.website_settings TO authenticated;

-- ---------- H1: who sent the offer (hashed IP; never shown anywhere)
ALTER TABLE public.web_offers ADD COLUMN buyer_ip_hash text;
CREATE INDEX idx_web_offers_ip_created ON public.web_offers (buyer_ip_hash, created_at DESC) WHERE buyer_ip_hash IS NOT NULL;
CREATE INDEX idx_web_offers_email_created ON public.web_offers (lower(buyer_email), created_at DESC);

DROP FUNCTION public.web_make_offer(uuid, numeric, text, text, text, text, text);
CREATE FUNCTION public.web_make_offer(
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
    AND asking_price >= 10 AND (held_until IS NULL OR held_until < now());
  IF NOT FOUND THEN RAISE EXCEPTION 'CARD_UNAVAILABLE'; END IF;
  p_amount := round(p_amount, 2);
  IF p_amount < 1 THEN RAISE EXCEPTION 'OFFER_TOO_LOW'; END IF;
  IF p_amount >= c.asking_price THEN RAISE EXCEPTION 'OFFER_AT_ASKING'; END IF;

  -- Rate limits: 3 per email per card per day; 10 per IP per hour, 30 per IP per day.
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

  -- Cap on cards held at once by the same buyer (email or IP): 2 unpaid accepted/countered offers.
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

-- ---------- H2: make sure a pending order's hold lasts at least p_minutes from now (before opening Stripe)
CREATE OR REPLACE FUNCTION public.web_extend_hold(p_order_id uuid, p_minutes integer)
RETURNS public.web_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o web_orders; v_until timestamptz;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  v_until := greatest(o.hold_expires_at, now() + make_interval(mins => p_minutes));
  -- every card in the order must still be held by this order
  IF EXISTS (SELECT 1 FROM web_order_items oi JOIN show_cards c ON c.id = oi.show_card_id
             WHERE oi.order_id = o.id AND (c.held_for IS DISTINCT FROM o.id OR c.status <> 'available')) THEN
    RAISE EXCEPTION 'CARDS_UNAVAILABLE';
  END IF;
  UPDATE web_orders SET hold_expires_at = v_until WHERE id = o.id RETURNING * INTO o;
  UPDATE show_cards SET held_until = v_until WHERE held_for = o.id;
  RETURN o;
END; $$;

-- ---------- M2: refuse a hand-entered sale of a card that is on hold for an online buyer
CREATE OR REPLACE FUNCTION public.block_sale_of_held_card()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_until timestamptz;
BEGIN
  IF NEW.transaction_type = 'show_card_sale' AND NEW.show_card_id IS NOT NULL
     AND NEW.sales_channel IS DISTINCT FROM 'website' THEN
    SELECT held_until INTO v_until FROM show_cards WHERE id = NEW.show_card_id;
    IF v_until IS NOT NULL AND v_until > now() THEN
      RAISE EXCEPTION 'This card is on hold for an online buyer until %. Try again after that, or ask Scott to release it.',
        to_char(v_until AT TIME ZONE 'America/New_York', 'Mon DD HH12:MI AM');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trigger_block_sale_of_held_card BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.block_sale_of_held_card();

-- ---------- permissions
REVOKE ALL ON FUNCTION public.web_make_offer(uuid, numeric, text, text, text, text, text, text),
                       public.web_extend_hold(uuid, integer),
                       public.block_sale_of_held_card()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_make_offer(uuid, numeric, text, text, text, text, text, text),
                          public.web_extend_hold(uuid, integer)
  TO service_role;
