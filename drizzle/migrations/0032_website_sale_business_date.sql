-- =====================================================================
-- EndZone 0032 — website sales dated by the Eastern calendar day (Scott, 16 Nov 2026)
-- Reported by Colton 16 Nov: homepage revenue missing tonight's website orders.
--
-- EndZone's rule: a sale's business day is (transaction_date AT TIME ZONE 'UTC')::date,
-- and manual sales are stored at midnight UTC of the chosen day. web_complete_order stored
-- the exact Stripe payment time instead, so any order paid after 7 PM Eastern (8 PM in summer)
-- counted as the next day on the dashboard, trend chart, tax tracker and cash ledger.
--
--  1. web_complete_order: transaction_date = Eastern calendar day of p_paid_at, at midnight UTC.
--     (The exact payment time stays on web_orders.paid_at.)
--  2. Backfill: every website sale row not already at midnight UTC is moved to its Eastern day.
--     Rows already at midnight UTC were entered by hand and are left alone. The triggers
--     on_transaction_money_update and trigger_shipping_expense_from_sale move the linked
--     cash entry and any postage expense to the same day.
-- Refunds (web_apply_refund) already use America/New_York; unchanged.
-- =====================================================================

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
  -- 0032: business day in Eastern time, stored at midnight UTC like manual sales
  v_sale_day timestamptz := ((coalesce(p_paid_at, now()) AT TIME ZONE 'America/New_York')::date)::timestamp AT TIME ZONE 'UTC';
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
            'website', v_sale_day,
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

-- Backfill: website sales stored with a payment time -> their Eastern day at midnight UTC
UPDATE transactions
SET transaction_date = ((transaction_date AT TIME ZONE 'America/New_York')::date)::timestamp AT TIME ZONE 'UTC'
WHERE sales_channel = 'website'
  AND transaction_date <> ((transaction_date AT TIME ZONE 'UTC')::date)::timestamp AT TIME ZONE 'UTC';
