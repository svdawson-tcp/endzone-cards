-- =====================================================================
-- EndZone 0007 — Website cart checkout + Make an Offer (cssportscards.com)
-- Must run as ONE transaction. Additive only: code already in production keeps working after it runs.
--
-- How it fits together
--   * The website never writes to the database directly. Supabase Edge Functions (service role) call the
--     web_* functions below; anon/authenticated users cannot execute any of them.
--   * Every card is one of a kind, so checkout first HOLDS the cards (show_cards.held_until / held_for).
--     A held card disappears from get_shop_cards() and cannot be held by anyone else until the hold ends.
--   * When Stripe confirms payment, web_complete_order() writes one ordinary show_card_sale per card
--     (sales_channel = 'website'). The existing triggers then mark the card sold and post the cash entry,
--     exactly like a sale typed into EndZone. Gross = card price + its share of shipping; revenue (net) =
--     gross minus its share of the Stripe fee, so platform_fee reports the Stripe fee per card.
--   * Offers: a card's floor is show_cards.offer_floor, or offer_floor_pct x asking price when blank.
--     An offer at/above the floor is accepted automatically; below it, Colton decides (email or EndZone).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SETTINGS
-- ---------------------------------------------------------------------
ALTER TABLE public.website_settings
  ADD COLUMN offers_enabled  boolean      NOT NULL DEFAULT true,
  ADD COLUMN offer_floor_pct numeric(4,3) NOT NULL DEFAULT 0.850 CHECK (offer_floor_pct BETWEEN 0.5 AND 1),
  ADD COLUMN shipping_flat   numeric(10,2) NOT NULL DEFAULT 6.00 CHECK (shipping_flat >= 0),
  ADD COLUMN hold_minutes    integer      NOT NULL DEFAULT 30  CHECK (hold_minutes BETWEEN 30 AND 1440),
  ADD COLUMN offer_hold_hours integer     NOT NULL DEFAULT 24  CHECK (offer_hold_hours BETWEEN 1 AND 72);

-- The owner (and mentor) may read and change the website settings from EndZone.
CREATE POLICY "Owner can view website settings" ON public.website_settings
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR has_mentor_access(owner_user_id));
CREATE POLICY "Owner can update website settings" ON public.website_settings
  FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
GRANT SELECT, UPDATE (offers_enabled, offer_floor_pct, shipping_flat, hold_minutes, offer_hold_hours)
  ON public.website_settings TO authenticated;

-- ---------------------------------------------------------------------
-- 2. SHOW CARDS: offer floor override + checkout hold
-- ---------------------------------------------------------------------
ALTER TABLE public.show_cards
  ADD COLUMN offer_floor numeric(10,2) CHECK (offer_floor IS NULL OR offer_floor >= 0),
  ADD COLUMN held_until  timestamptz,
  ADD COLUMN held_for    uuid;   -- web_orders.id holding the card (FK added below)

CREATE INDEX idx_show_cards_held ON public.show_cards (held_for) WHERE held_for IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. SALES CHANNEL: add 'website'
-- ---------------------------------------------------------------------
ALTER TABLE public.transactions DROP CONSTRAINT transactions_sales_channel_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_sales_channel_check
  CHECK (sales_channel IS NULL OR sales_channel IN ('ebay','facebook','whatnot','card_show','in_person','website','other'));

-- ---------------------------------------------------------------------
-- 4. ORDERS, ORDER ITEMS, OFFERS
-- ---------------------------------------------------------------------
CREATE SEQUENCE public.web_order_number_seq START 1001;

CREATE TABLE public.web_orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- business owner
  order_number             text NOT NULL UNIQUE DEFAULT ('CS-' || nextval('public.web_order_number_seq')),
  source                   text NOT NULL DEFAULT 'cart' CHECK (source IN ('cart','offer')),
  offer_id                 uuid,
  status                   text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','canceled')),
  buyer_email              text CHECK (buyer_email IS NULL OR buyer_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  buyer_name               text,
  shipping_address         jsonb,
  subtotal                 numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  shipping                 numeric(10,2) NOT NULL CHECK (shipping >= 0),
  total                    numeric(10,2) NOT NULL CHECK (total >= 0),
  stripe_session_id        text UNIQUE,
  stripe_payment_intent_id text,
  stripe_fee               numeric(10,2) CHECK (stripe_fee IS NULL OR stripe_fee >= 0),
  hold_expires_at          timestamptz NOT NULL,
  paid_at                  timestamptz,
  emails_sent_at           timestamptz,   -- send-once claim for the order emails
  shipped_at               timestamptz,
  tracking_number          text,
  problem_note             text,          -- e.g. a card that was sold elsewhere before payment cleared
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_orders_total_adds_up CHECK (total = subtotal + shipping)
);
CREATE INDEX idx_web_orders_user_created ON public.web_orders (user_id, created_at DESC);
CREATE INDEX idx_web_orders_pending ON public.web_orders (hold_expires_at) WHERE status = 'pending';

CREATE TABLE public.web_order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.web_orders(id) ON DELETE CASCADE,
  show_card_id   uuid NOT NULL REFERENCES public.show_cards(id) ON DELETE RESTRICT,
  price          numeric(10,2) NOT NULL CHECK (price >= 0),    -- price charged for this card
  description    text NOT NULL,                                -- frozen copy for receipts
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  UNIQUE (order_id, show_card_id)
);
CREATE INDEX idx_web_order_items_card ON public.web_order_items (show_card_id);

CREATE TABLE public.web_offers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- business owner
  show_card_id    uuid NOT NULL REFERENCES public.show_cards(id) ON DELETE CASCADE,
  buyer_name      text NOT NULL CHECK (char_length(btrim(buyer_name)) BETWEEN 1 AND 80),
  buyer_email     text NOT NULL CHECK (buyer_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  buyer_note      text CHECK (buyer_note IS NULL OR char_length(buyer_note) <= 1000),
  amount          numeric(10,2) NOT NULL CHECK (amount > 0),
  asking_at_offer numeric(10,2) NOT NULL,
  floor_at_offer  numeric(10,2) NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','countered','declined','expired','paid','withdrawn')),
  auto_accepted   boolean NOT NULL DEFAULT false,
  counter_amount  numeric(10,2) CHECK (counter_amount IS NULL OR counter_amount > 0),
  final_amount    numeric(10,2),             -- the price the buyer may pay (offer or counter)
  action_token    text NOT NULL UNIQUE,      -- secret in Colton's Accept/Counter/Decline email buttons
  pay_token       text UNIQUE,               -- secret in the buyer's payment link (set once accepted/countered)
  pay_expires_at  timestamptz,
  order_id        uuid REFERENCES public.web_orders(id) ON DELETE SET NULL,
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_web_offers_user_created ON public.web_offers (user_id, created_at DESC);
CREATE INDEX idx_web_offers_card ON public.web_offers (show_card_id);

ALTER TABLE public.web_orders
  ADD CONSTRAINT web_orders_offer_fk FOREIGN KEY (offer_id) REFERENCES public.web_offers(id) ON DELETE SET NULL;
ALTER TABLE public.show_cards
  ADD CONSTRAINT show_cards_held_for_fk FOREIGN KEY (held_for) REFERENCES public.web_orders(id) ON DELETE SET NULL;

CREATE TRIGGER update_web_orders_updated_at BEFORE UPDATE ON public.web_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_web_offers_updated_at BEFORE UPDATE ON public.web_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Owner/mentor can read orders and offers in EndZone. Writes go through the functions below only,
-- except shipping details on orders, which Colton fills in from EndZone.
ALTER TABLE public.web_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_offers      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view web orders" ON public.web_orders
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_mentor_access(user_id));
CREATE POLICY "Owner can update shipping on web orders" ON public.web_orders
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner can view web order items" ON public.web_order_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.web_orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR has_mentor_access(o.user_id))));
CREATE POLICY "Owner can view web offers" ON public.web_offers
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_mentor_access(user_id));

REVOKE ALL ON public.web_orders, public.web_order_items, public.web_offers FROM anon, authenticated;
GRANT SELECT ON public.web_orders, public.web_order_items, public.web_offers TO authenticated;
GRANT UPDATE (shipped_at, tracking_number) ON public.web_orders TO authenticated;
GRANT ALL ON public.web_orders, public.web_order_items, public.web_offers TO service_role;
GRANT USAGE ON SEQUENCE public.web_order_number_seq TO service_role;

-- ---------------------------------------------------------------------
-- 5. PUBLIC SHOP LIST: hide cards on hold (adds offers_open for the "Make an offer" button)
-- ---------------------------------------------------------------------
DROP FUNCTION public.get_shop_cards();
CREATE FUNCTION public.get_shop_cards()
RETURNS TABLE (
  id uuid, player_name text, year text, brand text, set_name text, card_number text,
  condition text, sport text, team text, price numeric,
  photo_front_url text, photo_back_url text, listed_at timestamptz, offers_open boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id, c.player_name, c.year,
         c.card_details->>'brand', c.card_details->>'set',
         c.card_details->>'card_number', c.card_details->>'condition',
         c.sport, c.team, c.asking_price,
         c.photo_front_url,
         CASE WHEN c.photo_back_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_back_url END,
         c.website_listed_at,
         w.offers_enabled
  FROM public.show_cards c
  JOIN public.website_settings w ON w.owner_user_id = c.user_id
  WHERE c.show_on_website
    AND c.status = 'available'
    AND c.asking_price >= 10
    AND c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%'
    AND (c.held_until IS NULL OR c.held_until < now())
  ORDER BY c.website_listed_at DESC NULLS LAST, c.id;
$$;
REVOKE ALL ON FUNCTION public.get_shop_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_cards() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. CHECKOUT FUNCTIONS (service role only)
-- ---------------------------------------------------------------------

-- Create a pending order and hold its cards, all or nothing. Prices come from EndZone, never the browser.
-- p_prices: optional {card_id: price} overrides, used only for an accepted offer.
-- Raises CARDS_UNAVAILABLE:<ids> if any card can't be held (sold, switched off, or held by someone else).
CREATE OR REPLACE FUNCTION public.web_create_order(
  p_card_ids uuid[], p_source text DEFAULT 'cart', p_offer_id uuid DEFAULT NULL,
  p_prices jsonb DEFAULT NULL, p_hold_minutes integer DEFAULT NULL)
RETURNS public.web_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Hold every card the same moment, only if it is still for sale and nobody else holds it.
  WITH held AS (
    UPDATE show_cards c
    SET held_until = v_order.hold_expires_at, held_for = v_order.id
    WHERE c.id = ANY (v_ids)
      AND c.user_id = w.owner_user_id
      AND c.status = 'available'
      AND c.show_on_website
      AND c.asking_price >= 10
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
END; $$;

-- Release an unpaid order (Stripe session expired, buyer canceled, or session creation failed).
CREATE OR REPLACE FUNCTION public.web_release_order(p_order_id uuid, p_status text DEFAULT 'expired')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_status NOT IN ('expired','canceled') THEN RAISE EXCEPTION 'Bad status'; END IF;
  UPDATE web_orders SET status = p_status WHERE id = p_order_id AND status = 'pending';
  UPDATE show_cards SET held_until = NULL, held_for = NULL WHERE held_for = p_order_id;
END; $$;

-- Record payment. Idempotent: a repeat call for a paid order does nothing and returns false.
-- Writes one show_card_sale per card; existing triggers mark the card sold and post the cash entry.
CREATE OR REPLACE FUNCTION public.web_complete_order(
  p_order_id uuid, p_payment_intent text, p_stripe_fee numeric, p_paid_at timestamptz,
  p_buyer_email text, p_buyer_name text, p_shipping_address jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    SELECT oi.*, c.status AS card_status, c.user_id AS card_owner
    FROM web_order_items oi JOIN show_cards c ON c.id = oi.show_card_id
    WHERE oi.order_id = o.id ORDER BY oi.price, oi.id
  LOOP
    i := i + 1;
    -- Split shipping and the Stripe fee by price; the last card takes the rounding remainder.
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
    END IF;

    INSERT INTO transactions (user_id, transaction_type, show_card_id, quantity, revenue, gross_amount,
                              sales_channel, transaction_date, notes)
    VALUES (it.card_owner, 'show_card_sale', it.show_card_id, 1,
            greatest(it.price + ship_share - fee_share, 0), it.price + ship_share,
            'website', p_paid_at, 'Website order ' || o.order_number)
    RETURNING id INTO v_txn;

    UPDATE web_order_items SET transaction_id = v_txn WHERE id = it.id;
  END LOOP;

  UPDATE web_orders
  SET status = 'paid', paid_at = p_paid_at, stripe_payment_intent_id = p_payment_intent,
      stripe_fee = p_stripe_fee,
      buyer_email = coalesce(p_buyer_email, buyer_email), buyer_name = coalesce(p_buyer_name, buyer_name),
      shipping_address = coalesce(p_shipping_address, shipping_address),
      problem_note = CASE WHEN array_length(v_problems, 1) > 0 THEN array_to_string(v_problems, '; ') END
  WHERE id = o.id;

  UPDATE show_cards SET held_until = NULL, held_for = NULL WHERE held_for = o.id;
  IF o.offer_id IS NOT NULL THEN UPDATE web_offers SET status = 'paid' WHERE id = o.offer_id; END IF;
  RETURN true;
END; $$;

-- Safety net: release holds whose time ran out without a Stripe "expired" event.
CREATE OR REPLACE FUNCTION public.web_release_stale_holds()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer;
BEGIN
  UPDATE show_cards SET held_until = NULL, held_for = NULL
  WHERE held_until IS NOT NULL AND held_until < now() - interval '10 minutes';
  UPDATE web_orders SET status = 'expired'
  WHERE status = 'pending' AND hold_expires_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE web_offers SET status = 'expired'
  WHERE status IN ('accepted','countered') AND pay_expires_at < now();
  RETURN v_count;
END; $$;

-- ---------------------------------------------------------------------
-- 7. OFFER FUNCTIONS (service role only)
-- ---------------------------------------------------------------------

-- Record an offer and decide it. Returns the offer row (status 'accepted' when it met the floor).
CREATE OR REPLACE FUNCTION public.web_make_offer(
  p_card_id uuid, p_amount numeric, p_buyer_name text, p_buyer_email text, p_note text,
  p_action_token text, p_pay_token text)
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
  IF p_amount >= c.asking_price THEN RAISE EXCEPTION 'OFFER_AT_ASKING'; END IF;  -- just buy it instead

  -- Light abuse limit: 3 offers per buyer per card per day.
  SELECT count(*) INTO v_recent FROM web_offers
  WHERE show_card_id = c.id AND lower(buyer_email) = lower(p_buyer_email) AND created_at > now() - interval '1 day';
  IF v_recent >= 3 THEN RAISE EXCEPTION 'TOO_MANY_OFFERS'; END IF;

  v_floor := coalesce(c.offer_floor, round(c.asking_price * w.offer_floor_pct, 2));

  INSERT INTO web_offers (user_id, show_card_id, buyer_name, buyer_email, buyer_note, amount,
                          asking_at_offer, floor_at_offer, action_token,
                          status, auto_accepted, final_amount, pay_token, pay_expires_at, responded_at)
  VALUES (w.owner_user_id, c.id, btrim(p_buyer_name), btrim(p_buyer_email), nullif(btrim(p_note), ''), p_amount,
          c.asking_price, v_floor, p_action_token,
          CASE WHEN p_amount >= v_floor THEN 'accepted' ELSE 'pending' END,
          p_amount >= v_floor,
          CASE WHEN p_amount >= v_floor THEN p_amount END,
          CASE WHEN p_amount >= v_floor THEN p_pay_token END,
          CASE WHEN p_amount >= v_floor THEN now() + make_interval(hours => w.offer_hold_hours) END,
          CASE WHEN p_amount >= v_floor THEN now() END)
  RETURNING * INTO v_offer;

  -- An accepted offer holds the card for the buyer while they pay.
  IF v_offer.status = 'accepted' THEN
    PERFORM web_hold_for_offer(v_offer.id);
  END IF;
  RETURN v_offer;
END; $$;

-- Hold the card for an accepted/countered offer until its payment link expires.
CREATE OR REPLACE FUNCTION public.web_hold_for_offer(p_offer_id uuid)
RETURNS public.web_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f web_offers;
  v_order web_orders;
  v_mins integer;
BEGIN
  SELECT * INTO f FROM web_offers WHERE id = p_offer_id;
  IF NOT FOUND OR f.status NOT IN ('accepted','countered') THEN RAISE EXCEPTION 'OFFER_NOT_OPEN'; END IF;
  -- Reuse the offer's existing pending order if there is one.
  SELECT * INTO v_order FROM web_orders WHERE offer_id = f.id AND status = 'pending';
  IF FOUND THEN RETURN v_order; END IF;
  v_mins := greatest(30, ceil(extract(epoch FROM (f.pay_expires_at - now())) / 60)::integer);
  v_order := web_create_order(ARRAY[f.show_card_id], 'offer', f.id,
                              jsonb_build_object(f.show_card_id::text, f.final_amount), v_mins);
  UPDATE web_offers SET order_id = v_order.id WHERE id = f.id;
  RETURN v_order;
END; $$;

-- Colton's decision on a pending offer (from the email buttons or the EndZone Offers screen).
-- p_action: 'accept' | 'decline' | 'counter'. Returns the updated offer.
CREATE OR REPLACE FUNCTION public.web_respond_offer(
  p_offer_id uuid, p_action text, p_counter numeric DEFAULT NULL, p_pay_token text DEFAULT NULL)
RETURNS public.web_offers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  w website_settings;
  f web_offers;
BEGIN
  SELECT * INTO w FROM website_settings LIMIT 1;
  SELECT * INTO f FROM web_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OFFER_NOT_FOUND'; END IF;
  IF f.status <> 'pending' THEN RAISE EXCEPTION 'OFFER_ALREADY_%', upper(f.status); END IF;

  IF p_action = 'decline' THEN
    UPDATE web_offers SET status = 'declined', responded_at = now() WHERE id = f.id RETURNING * INTO f;
    RETURN f;
  ELSIF p_action IN ('accept','counter') THEN
    IF p_pay_token IS NULL THEN RAISE EXCEPTION 'Pay token required'; END IF;
    IF p_action = 'counter' AND (p_counter IS NULL OR p_counter <= f.amount OR p_counter > f.asking_at_offer) THEN
      RAISE EXCEPTION 'COUNTER_OUT_OF_RANGE';
    END IF;
    UPDATE web_offers
    SET status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'countered' END,
        counter_amount = CASE WHEN p_action = 'counter' THEN round(p_counter, 2) END,
        final_amount = CASE WHEN p_action = 'accept' THEN f.amount ELSE round(p_counter, 2) END,
        pay_token = p_pay_token,
        pay_expires_at = now() + make_interval(hours => w.offer_hold_hours),
        responded_at = now()
    WHERE id = f.id RETURNING * INTO f;
    PERFORM web_hold_for_offer(f.id);   -- raises CARDS_UNAVAILABLE if the card sold meanwhile
    RETURN f;
  END IF;
  RAISE EXCEPTION 'Bad action';
END; $$;

-- ---------------------------------------------------------------------
-- 8. PERMISSIONS: every web_* function is for the Edge Functions (service role) only
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.web_create_order(uuid[], text, uuid, jsonb, integer),
  public.web_release_order(uuid, text),
  public.web_complete_order(uuid, text, numeric, timestamptz, text, text, jsonb),
  public.web_release_stale_holds(),
  public.web_make_offer(uuid, numeric, text, text, text, text, text),
  public.web_hold_for_offer(uuid),
  public.web_respond_offer(uuid, text, numeric, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.web_create_order(uuid[], text, uuid, jsonb, integer),
  public.web_release_order(uuid, text),
  public.web_complete_order(uuid, text, numeric, timestamptz, text, text, jsonb),
  public.web_release_stale_holds(),
  public.web_make_offer(uuid, numeric, text, text, text, text, text),
  public.web_hold_for_offer(uuid),
  public.web_respond_offer(uuid, text, numeric, text)
TO service_role;
