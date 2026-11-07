-- =====================================================================
-- EndZone 0023 — Bargain Bin deal + free bonus card on bigger orders (Colton "Yes to all", 5 Nov 2026)
--
-- 1. Bin deal: buy 10 Bargain Bin cards, get 1 free. In a cart order, every 11th bin card is free, and the
--    free ones are always the cheapest bin cards (11 bin cards = 1 free, 22 = 2 free). Case cards don't count.
--    The free card's price is recorded as its discount (web_order_items.deal_free / discount = price), so the
--    order total rule (total = subtotal - discount + shipping) and every existing report keep working.
--    A discount code then takes its % off what is left (never off a free card).
-- 2. Bonus card: a cart order whose cards come to $60 or more after discounts is flagged bonus_card.
--    Colton adds a free card of his choice when packing (emails and Web Orders say so). Nothing is charged.
-- Both are cart-only (offers are already negotiated) and can be switched off in website_settings
-- (bin_deal_buy NULL = no bin deal, bonus_card_min NULL = no bonus card).
-- =====================================================================

ALTER TABLE public.website_settings
  ADD COLUMN bin_deal_buy   integer      DEFAULT 10 CHECK (bin_deal_buy IS NULL OR bin_deal_buy BETWEEN 2 AND 50),
  ADD COLUMN bonus_card_min numeric(10,2) DEFAULT 60 CHECK (bonus_card_min IS NULL OR bonus_card_min > 0);

ALTER TABLE public.web_orders
  ADD COLUMN deal_discount numeric(10,2) NOT NULL DEFAULT 0 CHECK (deal_discount >= 0),
  ADD COLUMN bonus_card    boolean       NOT NULL DEFAULT false,
  ADD CONSTRAINT web_orders_deal_le_discount CHECK (deal_discount <= discount);
ALTER TABLE public.web_order_items
  ADD COLUMN deal_free boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT web_order_items_deal_free_whole CHECK (NOT deal_free OR discount = price);

-- ---------- checkout step 1 (after any free-shipping link, before a code): the bin deal
CREATE FUNCTION public.web_apply_bin_deal(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o web_orders; w website_settings; n integer; v_free integer; v_amt numeric(10,2);
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' OR o.source <> 'cart' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  IF o.discount > 0 THEN RAISE EXCEPTION 'DEAL_AFTER_DISCOUNT'; END IF; -- must run before a code
  SELECT * INTO w FROM website_settings WHERE owner_user_id = o.user_id LIMIT 1;
  IF w.bin_deal_buy IS NULL THEN RETURN jsonb_build_object('free', 0); END IF;

  SELECT count(*) INTO n FROM web_order_items oi JOIN show_cards c ON c.id = oi.show_card_id
  WHERE oi.order_id = o.id AND c.in_bargain_bin;
  v_free := n / (w.bin_deal_buy + 1);
  IF v_free = 0 THEN RETURN jsonb_build_object('free', 0, 'bin_cards', n); END IF;

  UPDATE web_order_items SET deal_free = true, discount = price
  WHERE id IN (SELECT oi.id FROM web_order_items oi JOIN show_cards c ON c.id = oi.show_card_id
               WHERE oi.order_id = o.id AND c.in_bargain_bin ORDER BY oi.price, oi.id LIMIT v_free);
  SELECT coalesce(sum(discount), 0) INTO v_amt FROM web_order_items WHERE order_id = o.id AND deal_free;
  UPDATE web_orders SET deal_discount = v_amt, discount = v_amt, total = subtotal - v_amt + shipping WHERE id = o.id;
  RETURN jsonb_build_object('free', v_free, 'bin_cards', n, 'discount', v_amt);
END; $$;
REVOKE ALL ON FUNCTION public.web_apply_bin_deal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_apply_bin_deal(uuid) TO service_role;

-- ---------- checkout step 2: a code takes its % off what's left after the bin deal (never off a free card)
CREATE OR REPLACE FUNCTION public.web_apply_discount(p_order_id uuid, p_code text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  v_base  := o.subtotal - o.deal_discount;
  v_total := round(v_base * (chk->>'percent')::numeric / 100, 2);
  SELECT count(*) INTO n FROM web_order_items WHERE order_id = o.id AND NOT deal_free;
  v_left := v_total;
  FOR it IN SELECT id, price FROM web_order_items WHERE order_id = o.id AND NOT deal_free ORDER BY price, id LOOP
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
END; $$;
REVOKE ALL ON FUNCTION public.web_apply_discount(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_apply_discount(uuid, text, text) TO service_role;

-- ---------- checkout step 3: does this order earn the free bonus card?
CREATE FUNCTION public.web_apply_bonus_card(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o web_orders; v_min numeric(10,2); v_on boolean;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' OR o.source <> 'cart' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  SELECT bonus_card_min INTO v_min FROM website_settings WHERE owner_user_id = o.user_id LIMIT 1;
  v_on := v_min IS NOT NULL AND o.subtotal - o.discount >= v_min;
  UPDATE web_orders SET bonus_card = v_on WHERE id = o.id;
  RETURN jsonb_build_object('bonus_card', v_on, 'min', v_min);
END; $$;
REVOKE ALL ON FUNCTION public.web_apply_bonus_card(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_apply_bonus_card(uuid) TO service_role;

-- ---------- the cart's preview of the two promos (the server decides at checkout)
CREATE FUNCTION public.get_shop_promos()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('bin_deal_buy', bin_deal_buy, 'bonus_card_min', bonus_card_min)
  FROM website_settings LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_shop_promos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_promos() TO anon, authenticated, service_role;

-- ---------- paid: sale notes say why a card was cheaper (bin deal and/or code)
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
            'Website order ' || o.order_number
            || CASE WHEN it.deal_free THEN ' (free: Bargain Bin deal, ' || to_char(it.price, 'FM$999990.00') || ' off)'
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
  RETURN true;
END; $function$;
