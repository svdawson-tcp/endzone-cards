-- =====================================================================
-- EndZone 0007 — Website cart, checkout and offers
-- Design: "Cart & offers" mockups (canvas, approved by Scott 31 Oct 2026): options 3 (cart) + 4 (offers
-- with an automatic floor). Payments through Stripe Checkout on the LLC's own Stripe account.
-- Must run as ONE transaction. Additive only: the current app and website keep working after it runs.
--
-- Who writes what:
--   * The public website never writes to any table. It calls the shop Edge Functions, which use the
--     service role and the functions below.
--   * Colton (the business owner) can READ his orders and offers from EndZone. Changes to them
--     (accept, counter, decline, mark shipped) also go through Edge Functions, because each one
--     emails the buyer.
--   * A paid order becomes ordinary EndZone sales: one show_card_sale per card, sales channel 'website',
--     so the dashboard, cash and tax reports count it like any other sale.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Website is a sales channel
-- ---------------------------------------------------------------------
ALTER TABLE public.transactions DROP CONSTRAINT transactions_sales_channel_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_sales_channel_check CHECK (
  sales_channel IS NULL
  OR sales_channel IN ('ebay', 'facebook', 'whatnot', 'card_show', 'in_person', 'website', 'other'));

-- ---------------------------------------------------------------------
-- 2. Show cards: offer settings and the checkout hold
-- ---------------------------------------------------------------------
ALTER TABLE public.show_cards
  ADD COLUMN accept_offers boolean NOT NULL DEFAULT false,
  ADD COLUMN offer_floor numeric CHECK (offer_floor IS NULL OR offer_floor > 0),  -- private: never sent to the site
  ADD COLUMN hold_until timestamptz,   -- card is reserved for an online buyer until this time
  ADD COLUMN hold_ref uuid;            -- the order or offer holding it

-- ---------------------------------------------------------------------
-- 3. Website settings (one row, private)
-- ---------------------------------------------------------------------
ALTER TABLE public.website_settings
  ADD COLUMN shipping_flat numeric NOT NULL DEFAULT 6 CHECK (shipping_flat >= 0),
  ADD COLUMN offer_min_ratio numeric NOT NULL DEFAULT 0.5 CHECK (offer_min_ratio > 0 AND offer_min_ratio <= 1),
  ADD COLUMN collect_sales_tax boolean NOT NULL DEFAULT false,
  ADD COLUMN alert_email text;         -- where new-offer and new-order alerts go

-- ---------------------------------------------------------------------
-- 4. Offers
-- ---------------------------------------------------------------------
CREATE TABLE public.shop_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,       -- the business owner
  show_card_id  uuid NOT NULL REFERENCES public.show_cards(id) ON DELETE CASCADE,
  buyer_email   text NOT NULL CHECK (buyer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND char_length(buyer_email) <= 254),
  buyer_name    text CHECK (buyer_name IS NULL OR char_length(buyer_name) <= 100),
  amount        numeric NOT NULL CHECK (amount > 0),
  asking_price  numeric NOT NULL CHECK (asking_price > 0),                      -- price when the offer came in
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'countered', 'declined', 'expired', 'paid')),
  auto_accepted boolean NOT NULL DEFAULT false,
  counter_amount numeric CHECK (counter_amount IS NULL OR counter_amount > 0),
  agreed_amount numeric CHECK (agreed_amount IS NULL OR agreed_amount > 0),     -- the price the buyer may pay
  pay_token     text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at    timestamptz NOT NULL DEFAULT now(),
  respond_by    timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  responded_at  timestamptz,
  pay_by        timestamptz,
  order_id      uuid,
  CONSTRAINT shop_offers_agreed_when_open CHECK (
    status NOT IN ('accepted', 'countered', 'paid') OR (agreed_amount IS NOT NULL AND pay_by IS NOT NULL))
);
CREATE INDEX idx_shop_offers_owner ON public.shop_offers (user_id, created_at DESC);
CREATE INDEX idx_shop_offers_card ON public.shop_offers (show_card_id);

-- ---------------------------------------------------------------------
-- 5. Orders
-- ---------------------------------------------------------------------
CREATE SEQUENCE public.shop_order_number_seq START 1001;

CREATE TABLE public.shop_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      text NOT NULL UNIQUE DEFAULT 'CS-' || nextval('public.shop_order_number_seq'),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- the business owner
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'shipped', 'expired', 'cancelled')),
  offer_id          uuid REFERENCES public.shop_offers(id),
  buyer_email       text,
  buyer_name        text,
  ship_to           jsonb,
  subtotal          numeric NOT NULL CHECK (subtotal >= 0),
  shipping          numeric NOT NULL CHECK (shipping >= 0),
  tax               numeric NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total             numeric CHECK (total IS NULL OR total >= 0),
  stripe_fee        numeric CHECK (stripe_fee IS NULL OR stripe_fee >= 0),
  stripe_session_id text UNIQUE,
  stripe_payment_intent text,
  problem           text,               -- e.g. a card that sold elsewhere before payment cleared: refund it
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  paid_at           timestamptz,
  shipped_at        timestamptz,
  carrier           text CHECK (carrier IS NULL OR char_length(carrier) <= 40),
  tracking_number   text CHECK (tracking_number IS NULL OR char_length(tracking_number) <= 60)
);
CREATE INDEX idx_shop_orders_owner ON public.shop_orders (user_id, created_at DESC);

CREATE TABLE public.shop_order_items (
  order_id       uuid NOT NULL REFERENCES public.shop_orders(id) ON DELETE CASCADE,
  show_card_id   uuid NOT NULL REFERENCES public.show_cards(id),
  price          numeric NOT NULL CHECK (price >= 0),
  transaction_id uuid REFERENCES public.transactions(id),
  PRIMARY KEY (order_id, show_card_id)
);

ALTER TABLE public.shop_offers ADD CONSTRAINT shop_offers_order_fk
  FOREIGN KEY (order_id) REFERENCES public.shop_orders(id);

-- ---------------------------------------------------------------------
-- 6. Access: the owner reads; only the service role (Edge Functions) writes
-- ---------------------------------------------------------------------
ALTER TABLE public.shop_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view website offers" ON public.shop_offers
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Owner can view website orders" ON public.shop_orders
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Owner can view website order items" ON public.shop_order_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.shop_orders o WHERE o.id = order_id AND o.user_id = (SELECT auth.uid())));

REVOKE ALL ON public.shop_offers, public.shop_orders, public.shop_order_items FROM anon, authenticated;
GRANT SELECT ON public.shop_offers, public.shop_orders, public.shop_order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shop_offers, public.shop_orders, public.shop_order_items TO service_role;
REVOKE ALL ON SEQUENCE public.shop_order_number_seq FROM anon, authenticated;
GRANT USAGE ON SEQUENCE public.shop_order_number_seq TO service_role;
-- pay_token is a secret link for the buyer; the owner never needs it.
REVOKE SELECT ON public.shop_offers FROM authenticated;
GRANT SELECT (id, user_id, show_card_id, buyer_email, buyer_name, amount, asking_price, status, auto_accepted,
              counter_amount, agreed_amount, created_at, respond_by, responded_at, pay_by, order_id)
  ON public.shop_offers TO authenticated;

-- ---------------------------------------------------------------------
-- 7. reserve_cards: hold cards for a checkout. All or nothing.
--    A card can be held when it is the owner's, listed, unsold, $10+, and not held by someone else
--    (p_allow_ref lets an accepted offer's own hold carry over into its checkout).
--    Returns the held cards with their current asking price. Raises 'cards_unavailable:<ids>'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_cards(
  p_cards uuid[], p_ref uuid, p_minutes integer, p_allow_ref uuid DEFAULT NULL)
RETURNS TABLE (id uuid, price numeric, player_name text, year text, brand text, set_name text,
               card_number text, photo_front_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  owner uuid;
  missing uuid[];
BEGIN
  IF p_cards IS NULL OR cardinality(p_cards) = 0 OR cardinality(p_cards) > 25 THEN
    RAISE EXCEPTION 'reserve_cards: between 1 and 25 cards';
  END IF;
  IF p_ref IS NULL OR p_minutes IS NULL OR p_minutes < 1 OR p_minutes > 2880 THEN
    RAISE EXCEPTION 'reserve_cards: bad arguments';
  END IF;
  SELECT owner_user_id INTO owner FROM website_settings;

  -- Lock the candidate rows so two buyers can't hold the same card at once.
  PERFORM 1 FROM show_cards c WHERE c.id = ANY (p_cards) ORDER BY c.id FOR UPDATE;

  SELECT array_agg(x) INTO missing FROM unnest(p_cards) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM show_cards c
    WHERE c.id = x AND c.user_id = owner AND c.show_on_website AND c.status = 'available'
      AND c.asking_price >= 10
      AND (c.hold_until IS NULL OR c.hold_until < now() OR c.hold_ref = p_ref
           OR (p_allow_ref IS NOT NULL AND c.hold_ref = p_allow_ref)));
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'cards_unavailable:%', array_to_string(missing, ',');
  END IF;

  UPDATE show_cards c SET hold_until = now() + make_interval(mins => p_minutes), hold_ref = p_ref
  WHERE c.id = ANY (p_cards);

  RETURN QUERY
  SELECT c.id, c.asking_price, c.player_name, c.year, c.card_details->>'brand', c.card_details->>'set',
         c.card_details->>'card_number', c.photo_front_url
  FROM show_cards c WHERE c.id = ANY (p_cards) ORDER BY array_position(p_cards, c.id);
END; $$;

-- release_hold: give held cards back to the site (checkout abandoned or expired).
CREATE OR REPLACE FUNCTION public.release_hold(p_ref uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  UPDATE show_cards SET hold_until = NULL, hold_ref = NULL WHERE hold_ref = p_ref;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- ---------------------------------------------------------------------
-- 8. complete_order: Stripe says the order is paid. Safe to call more than once.
--    Records one website sale per card. Shipping and the Stripe fee are shared across the cards in
--    proportion to price: gross = price + shipping share, platform_fee = fee share, revenue = gross - fee.
--    Sales tax is not revenue and is not recorded on the sale.
--    A card that sold somewhere else while the buyer paid is skipped and noted in shop_orders.problem.
--    Returns 'paid', 'already_paid' or 'paid_with_problem'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_order(
  p_order uuid, p_session text, p_payment_intent text, p_email text, p_name text, p_ship_to jsonb,
  p_tax numeric, p_total numeric, p_fee numeric)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o shop_orders%ROWTYPE;
  it record;
  base numeric;
  n integer;
  i integer := 0;
  ship_left numeric;
  fee_left numeric;
  ship_share numeric;
  fee_share numeric;
  tx uuid;
  skipped text[] := '{}';
BEGIN
  SELECT * INTO o FROM shop_orders WHERE id = p_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'complete_order: no such order'; END IF;
  IF o.status IN ('paid', 'shipped') THEN RETURN 'already_paid'; END IF;
  IF o.stripe_session_id IS DISTINCT FROM p_session THEN RAISE EXCEPTION 'complete_order: session mismatch'; END IF;

  SELECT count(*) INTO n FROM shop_order_items WHERE order_id = p_order;
  base := o.subtotal;
  ship_left := o.shipping;
  fee_left := COALESCE(p_fee, 0);

  FOR it IN
    SELECT oi.show_card_id, oi.price, c.status AS card_status, c.user_id AS card_owner
    FROM shop_order_items oi JOIN show_cards c ON c.id = oi.show_card_id
    WHERE oi.order_id = p_order ORDER BY oi.price, oi.show_card_id FOR UPDATE OF c
  LOOP
    i := i + 1;
    IF i < n AND base > 0 THEN
      ship_share := round(o.shipping * it.price / base, 2);
      fee_share := round(COALESCE(p_fee, 0) * it.price / base, 2);
    ELSE
      ship_share := ship_left;   -- the last card takes the rounding remainder
      fee_share := fee_left;
    END IF;
    ship_left := ship_left - ship_share;
    fee_left := fee_left - fee_share;

    IF it.card_status <> 'available' OR it.card_owner <> o.user_id THEN
      skipped := skipped || it.show_card_id::text;
      CONTINUE;
    END IF;

    INSERT INTO transactions (user_id, transaction_type, show_card_id, revenue, gross_amount, platform_fee,
                              sales_channel, transaction_date, notes)
    VALUES (o.user_id, 'show_card_sale', it.show_card_id,
            GREATEST(it.price + ship_share - fee_share, 0), it.price + ship_share, fee_share,
            'website', now(), 'Website order ' || o.order_number)
    RETURNING id INTO tx;   -- update_show_card_on_sale marks the card sold
    UPDATE shop_order_items SET transaction_id = tx WHERE order_id = p_order AND show_card_id = it.show_card_id;
  END LOOP;

  UPDATE shop_orders SET
    status = 'paid', paid_at = now(), stripe_payment_intent = p_payment_intent,
    buyer_email = p_email, buyer_name = p_name, ship_to = p_ship_to,
    tax = COALESCE(p_tax, 0), total = p_total, stripe_fee = p_fee,
    problem = CASE WHEN cardinality(skipped) > 0
                   THEN 'Sold elsewhere before payment cleared; refund these cards: ' || array_to_string(skipped, ',')
              END
  WHERE id = p_order;

  UPDATE show_cards SET hold_until = NULL, hold_ref = NULL
  WHERE hold_ref = p_order OR (o.offer_id IS NOT NULL AND hold_ref = o.offer_id);
  IF o.offer_id IS NOT NULL THEN
    UPDATE shop_offers SET status = 'paid', order_id = p_order WHERE id = o.offer_id;
  END IF;

  RETURN CASE WHEN cardinality(skipped) > 0 THEN 'paid_with_problem' ELSE 'paid' END;
END; $$;

-- ---------------------------------------------------------------------
-- 9. The public read now also says whether a card takes offers (and the lowest offer allowed),
--    hides cards held for a buyer, and adds the card reader's extra details.
--    The offer floor itself is never returned.
-- ---------------------------------------------------------------------
DROP FUNCTION public.get_shop_cards();
CREATE FUNCTION public.get_shop_cards()
RETURNS TABLE (
  id uuid, player_name text, year text, brand text, set_name text, card_number text,
  condition text, sport text, team text, price numeric,
  photo_front_url text, photo_back_url text, listed_at timestamptz,
  parallel text, serial_number text, rookie boolean, autograph boolean,
  accept_offers boolean, min_offer numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id, c.player_name, c.year,
         c.card_details->>'brand', c.card_details->>'set',
         c.card_details->>'card_number', c.card_details->>'condition',
         c.sport, c.team, c.asking_price,
         c.photo_front_url,
         CASE WHEN c.photo_back_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_back_url END,
         c.website_listed_at,
         c.card_details->>'parallel', c.card_details->>'serial_number',
         COALESCE((c.card_details->>'rookie')::boolean, false), COALESCE((c.card_details->>'autograph')::boolean, false),
         c.accept_offers,
         CASE WHEN c.accept_offers THEN GREATEST(10, ceil(c.asking_price * w.offer_min_ratio)) END
  FROM public.show_cards c
  JOIN public.website_settings w ON w.owner_user_id = c.user_id
  WHERE c.show_on_website
    AND c.status = 'available'
    AND c.asking_price >= 10
    AND c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%'
    AND (c.hold_until IS NULL OR c.hold_until < now())
  ORDER BY c.website_listed_at DESC NULLS LAST, c.id
$$;

-- Function access: get_shop_cards is public (as in 0005); everything else is service role only.
REVOKE ALL ON FUNCTION public.get_shop_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_cards() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_cards(uuid[], uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_hold(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_order(uuid, text, text, text, text, jsonb, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_cards(uuid[], uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_hold(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order(uuid, text, text, text, text, jsonb, numeric, numeric, numeric)
  TO service_role;
