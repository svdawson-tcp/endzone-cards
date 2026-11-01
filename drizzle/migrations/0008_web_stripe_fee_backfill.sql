-- =====================================================================
-- EndZone 0008 — record the Stripe fee when Stripe reports it after payment.
-- Stripe often hasn't settled the fee yet when checkout.session.completed arrives (found in the first
-- sandbox order, Nov 1 2026). The webhook now also listens to charge.updated and calls this function.
-- Splits the fee across the order's sales by price (same rule as web_complete_order); lowering each
-- sale's revenue fires the existing trigger that keeps the cash entry in step. Idempotent.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.web_set_stripe_fee(p_payment_intent text, p_fee numeric)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o web_orders;
  it record;
  n integer;
  i integer := 0;
  fee_left numeric(10,2);
  fee_share numeric(10,2);
BEGIN
  SELECT * INTO o FROM web_orders WHERE stripe_payment_intent_id = p_payment_intent AND status = 'paid' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_PAID_YET'; END IF;
  IF o.stripe_fee IS NOT DISTINCT FROM round(p_fee, 2) THEN RETURN false; END IF;

  SELECT count(*) INTO n FROM web_order_items WHERE order_id = o.id AND transaction_id IS NOT NULL;
  fee_left := round(p_fee, 2);
  FOR it IN
    SELECT oi.price, oi.transaction_id, t.gross_amount
    FROM web_order_items oi JOIN transactions t ON t.id = oi.transaction_id
    WHERE oi.order_id = o.id ORDER BY oi.price, oi.id
  LOOP
    i := i + 1;
    IF i = n THEN fee_share := fee_left;
    ELSE
      fee_share := coalesce(round(round(p_fee, 2) * it.price / nullif(o.subtotal, 0), 2), 0);
      fee_left := fee_left - fee_share;
    END IF;
    UPDATE transactions SET revenue = greatest(it.gross_amount - fee_share, 0) WHERE id = it.transaction_id;
  END LOOP;

  UPDATE web_orders SET stripe_fee = round(p_fee, 2) WHERE id = o.id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.web_set_stripe_fee(text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_set_stripe_fee(text, numeric) TO service_role;
