-- 0024: website sales belong to the card's lot (8 Nov 2026)
-- Colton saw website-sold cards in a lot's SOLD list with "Asking $x" but no "Sold $x".
-- web_complete_order inserted show_card_sale rows without lot_id, so LotDetail (sale prices)
-- and Lots (lot revenue/profit) never counted them. Manual sales set lot_id = the card's lot
-- (133 of 133 rows match), so website sales now do the same.

-- 1. Safety net: any card sale written without a lot takes the card's lot.
CREATE OR REPLACE FUNCTION public.transactions_fill_lot_from_card()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lot_id IS NULL AND NEW.show_card_id IS NOT NULL AND NEW.transaction_type = 'show_card_sale' THEN
    SELECT lot_id INTO NEW.lot_id FROM show_cards WHERE id = NEW.show_card_id;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS transactions_fill_lot_from_card ON public.transactions;
CREATE TRIGGER transactions_fill_lot_from_card
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.transactions_fill_lot_from_card();

-- 2. web_complete_order writes the lot explicitly.
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
    SELECT oi.*, c.status AS card_status, c.user_id AS card_owner, c.lot_id AS card_lot
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
    INSERT INTO transactions (user_id, transaction_type, lot_id, show_card_id, quantity, revenue, gross_amount,
                              sales_channel, transaction_date, notes)
    VALUES (it.card_owner, 'show_card_sale', it.card_lot, it.show_card_id, 1,
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

-- 3. Backfill existing website sales (backup of the rows changed).
CREATE TABLE IF NOT EXISTS public.backup_web_sale_lot_20261108 AS
  SELECT t.id AS transaction_id, t.lot_id AS old_lot_id, c.lot_id AS new_lot_id, now() AS backed_up_at
  FROM transactions t JOIN show_cards c ON c.id = t.show_card_id
  WHERE t.lot_id IS NULL AND t.transaction_type = 'show_card_sale' AND t.sales_channel = 'website'
    AND c.lot_id IS NOT NULL;
ALTER TABLE public.backup_web_sale_lot_20261108 ENABLE ROW LEVEL SECURITY;

UPDATE transactions t
SET lot_id = b.new_lot_id
FROM backup_web_sale_lot_20261108 b
WHERE b.transaction_id = t.id AND t.lot_id IS NULL;
