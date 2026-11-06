-- =====================================================================
-- EndZone 0018 — discount codes for website checkout (Nov 5 2026)
-- First use: the package-insert card. Every website order ships with a card printed with one code
-- (CSTHANKS10). Because the same code is printed on every card, it only works for someone who has
-- already bought on the website: kind 'repeat' = the buyer's email has a paid website order in the last
-- window_days days, and hasn't used this code in that window. Kind 'welcome' (a first-website-order code
-- for Instagram/Facebook/show buyers) is supported but no welcome code exists yet.
-- The cart asks for the email the buyer ordered with; checkout locks that email in Stripe, and the
-- order is flagged if the payment comes through under a different email.
-- Discounts apply to cards only (never shipping), on cart orders only (offers are already negotiated).
-- The discount is spread over the cards so each EndZone sale row records what was actually paid.
-- CSTHANKS10 is created switched OFF until Colton confirms the amount and the window.
-- =====================================================================

CREATE TABLE public.web_discount_codes (
  code         text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{3,20}$'),
  user_id      uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('repeat', 'welcome')),
  percent      numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 50),
  window_days  integer CHECK (window_days IS NULL OR window_days BETWEEN 1 AND 365),
  active       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'repeat' OR window_days IS NOT NULL)
);
ALTER TABLE public.web_discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or mentor can view discount codes" ON public.web_discount_codes
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_mentor_access(user_id));
REVOKE ALL ON public.web_discount_codes FROM anon, authenticated;
GRANT SELECT ON public.web_discount_codes TO authenticated;

ALTER TABLE public.web_orders
  ADD COLUMN discount_code text REFERENCES public.web_discount_codes(code),
  ADD COLUMN discount      numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0);
ALTER TABLE public.web_order_items
  ADD COLUMN discount      numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  ADD CONSTRAINT web_order_items_discount_le_price CHECK (discount <= price);
ALTER TABLE public.web_orders
  DROP CONSTRAINT web_orders_total_adds_up,
  ADD CONSTRAINT web_orders_total_adds_up CHECK (total = subtotal - discount + shipping),
  ADD CONSTRAINT web_orders_discount_le_subtotal CHECK (discount <= subtotal);
CREATE INDEX idx_web_orders_buyer_email ON public.web_orders (lower(buyer_email)) WHERE status = 'paid';

-- ---------- the one rule: may this email use this code right now?
CREATE FUNCTION public.web_check_discount(p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c web_discount_codes; v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  SELECT * INTO c FROM web_discount_codes WHERE code = upper(btrim(coalesce(p_code, ''))) AND active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'unknown',
      'message', 'That code isn''t valid. Check the spelling and try again.');
  END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email) > 200 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'email', 'message', 'Enter the email you ordered with.');
  END IF;
  IF c.kind = 'repeat' THEN
    IF NOT EXISTS (SELECT 1 FROM web_orders WHERE user_id = c.user_id AND status = 'paid'
                   AND lower(buyer_email) = v_email AND paid_at > now() - make_interval(days => c.window_days)) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'not_eligible',
        'message', 'This code is for repeat customers: use the email from an order in the last '
                   || c.window_days || ' days.');
    END IF;
    IF EXISTS (SELECT 1 FROM web_orders WHERE user_id = c.user_id AND status = 'paid' AND discount_code = c.code
               AND lower(buyer_email) = v_email AND paid_at > now() - make_interval(days => c.window_days)) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'used',
        'message', 'This code was already used with that email. Your next order gets a new card with a new chance.');
    END IF;
  ELSE -- welcome: first website order only
    IF EXISTS (SELECT 1 FROM web_orders WHERE user_id = c.user_id AND status = 'paid' AND lower(buyer_email) = v_email) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'not_eligible',
        'message', 'This code is for a first website order, and that email has ordered before.');
    END IF;
  END IF;
  RETURN jsonb_build_object('valid', true, 'code', c.code, 'percent', c.percent);
END; $$;
REVOKE ALL ON FUNCTION public.web_check_discount(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_check_discount(text, text) TO service_role;

-- ---------- checkout: apply a code to a pending cart order (after any free-shipping link)
CREATE FUNCTION public.web_apply_discount(p_order_id uuid, p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o web_orders; chk jsonb; v_total numeric(10,2); v_left numeric(10,2); v_share numeric(10,2);
        it record; n integer; i integer := 0;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' OR o.source <> 'cart' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  chk := web_check_discount(p_code, p_email);
  IF NOT (chk->>'valid')::boolean THEN RETURN chk || jsonb_build_object('applied', false); END IF;
  IF (SELECT user_id FROM web_discount_codes WHERE code = chk->>'code') <> o.user_id THEN
    RETURN jsonb_build_object('applied', false, 'valid', false, 'message', 'That code isn''t valid.');
  END IF;

  v_total := round(o.subtotal * (chk->>'percent')::numeric / 100, 2);
  SELECT count(*) INTO n FROM web_order_items WHERE order_id = o.id;
  v_left := v_total;
  FOR it IN SELECT id, price FROM web_order_items WHERE order_id = o.id ORDER BY price, id LOOP
    i := i + 1;
    v_share := CASE WHEN i = n THEN v_left
                    ELSE coalesce(round(v_total * it.price / nullif(o.subtotal, 0), 2), 0) END;
    v_share := least(v_share, it.price);
    v_left := v_left - v_share;
    UPDATE web_order_items SET discount = v_share WHERE id = it.id;
  END LOOP;
  UPDATE web_orders
  SET discount_code = chk->>'code', discount = v_total, total = subtotal - v_total + shipping,
      buyer_email = lower(btrim(p_email))
  WHERE id = o.id;
  RETURN jsonb_build_object('applied', true, 'code', chk->>'code', 'percent', (chk->>'percent')::numeric,
                            'discount', v_total);
END; $$;
REVOKE ALL ON FUNCTION public.web_apply_discount(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_apply_discount(uuid, text, text) TO service_role;

-- ---------- confirmation email: the repeat code to offer this buyer next time (null = none active)
CREATE FUNCTION public.web_repeat_code(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('code', code, 'percent', percent, 'window_days', window_days)
  FROM web_discount_codes WHERE user_id = p_user_id AND kind = 'repeat' AND active
  ORDER BY created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.web_repeat_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_repeat_code(uuid) TO service_role;

-- ---------- paid: sale rows record what was paid for each card (price less its discount, plus shipping share)
CREATE OR REPLACE FUNCTION public.web_complete_order(p_order_id uuid, p_payment_intent text, p_stripe_fee numeric,
  p_paid_at timestamp with time zone, p_buyer_email text, p_buyer_name text, p_shipping_address jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
            greatest(it.price - it.discount + ship_share - fee_share, 0), it.price - it.discount + ship_share,
            'website', p_paid_at,
            'Website order ' || o.order_number || CASE WHEN it.discount > 0
              THEN ' (code ' || o.discount_code || ', ' || to_char(it.discount, 'FM$999990.00') || ' off)' ELSE '' END)
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
  RETURN true;
END; $function$;

-- ---------- 0017's automatic combined shipping: the shipping in a sale row is gross less (price - discount);
-- the order total keeps its discount.
CREATE OR REPLACE FUNCTION public.web_auto_combine_shipping(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o          web_orders;
  e          web_orders;
  l          web_ship_links;
  v_ship     numeric(10,2);
  v_mismatch text;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'paid' THEN RETURN jsonb_build_object('action', 'none'); END IF;

  IF o.shipping_refunded IS NOT NULL THEN
    RETURN jsonb_build_object('action', 'refund', 'amount', o.shipping_refunded, 'refund_id', o.shipping_refund_id,
      'order_number', (SELECT f.order_number FROM web_ship_links sl JOIN web_orders f ON f.id = sl.order_id
                       WHERE sl.id = o.ship_link_id));
  END IF;
  IF o.ship_link_id IS NOT NULL OR o.shipping <= 0 OR o.shipped_at IS NOT NULL
     OR nullif(btrim(o.buyer_email), '') IS NULL THEN
    RETURN jsonb_build_object('action', 'none');
  END IF;

  FOR e IN
    SELECT * FROM web_orders
    WHERE user_id = o.user_id AND id <> o.id AND status = 'paid' AND shipped_at IS NULL
      AND lower(btrim(buyer_email)) = lower(btrim(o.buyer_email))
      AND (paid_at, created_at) < (o.paid_at, o.created_at)
    ORDER BY paid_at, created_at
  LOOP
    IF e.ship_link_id IS NOT NULL THEN
      SELECT * INTO l FROM web_ship_links WHERE id = e.ship_link_id;
    ELSE
      INSERT INTO web_ship_links (user_id, kind, token, order_id, expires_at)
      VALUES (e.user_id, 'order', web_new_link_token(), e.id, coalesce(e.paid_at, now()) + interval '48 hours')
      ON CONFLICT (order_id) DO NOTHING;
      SELECT * INTO l FROM web_ship_links WHERE order_id = e.id;
    END IF;
    IF l.id IS NULL OR l.kind <> 'order' THEN CONTINUE; END IF;
    l := web_ship_link_valid(l.token);
    IF l.id IS NULL THEN CONTINUE; END IF;

    IF web_addr_key(e.shipping_address) <> web_addr_key(o.shipping_address) THEN
      v_mismatch := coalesce(v_mismatch, e.order_number);
      CONTINUE;
    END IF;

    v_ship := o.shipping;
    UPDATE transactions t
    SET revenue = greatest(t.revenue - (t.gross_amount - (oi.price - oi.discount)), 0),
        gross_amount = oi.price - oi.discount
    FROM web_order_items oi
    WHERE oi.order_id = o.id AND oi.transaction_id = t.id AND t.gross_amount > oi.price - oi.discount;
    UPDATE web_orders SET shipping = 0, total = subtotal - discount, ship_link_id = l.id, shipping_refunded = v_ship
    WHERE id = o.id;
    RETURN jsonb_build_object('action', 'refund', 'amount', v_ship, 'refund_id', NULL,
      'order_number', (SELECT order_number FROM web_orders WHERE id = l.order_id));
  END LOOP;

  IF v_mismatch IS NOT NULL THEN
    UPDATE web_orders
    SET problem_note = concat_ws('; ', problem_note,
      'Same buyer has open order ' || v_mismatch || ' going to a different address. Shipping was charged. '
      || 'If you ship them together, refund the shipping in Stripe')
    WHERE id = o.id;
    RETURN jsonb_build_object('action', 'different_address', 'order_number', v_mismatch);
  END IF;
  RETURN jsonb_build_object('action', 'none');
END; $$;
REVOKE ALL ON FUNCTION public.web_auto_combine_shipping(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_auto_combine_shipping(uuid) TO service_role;

-- ---------- the package-insert code, OFF until Colton confirms 10% / 30 days
INSERT INTO public.web_discount_codes (code, user_id, kind, percent, window_days, active)
SELECT 'CSTHANKS10', owner_user_id, 'repeat', 10, 30, false FROM public.website_settings LIMIT 1;
