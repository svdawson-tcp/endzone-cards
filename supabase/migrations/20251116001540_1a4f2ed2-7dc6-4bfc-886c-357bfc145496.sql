-- Fix RPC function: remove non-existent show_cards.show_id update
CREATE OR REPLACE FUNCTION reassign_show_card_sale_to_show(
  p_transaction_id UUID,
  p_new_show_id UUID,
  p_correction_note TEXT
) RETURNS void AS $$
DECLARE
  v_show_card_id UUID;
BEGIN
  -- Get show_card_id from transaction to verify it's a show_card_sale
  SELECT show_card_id INTO v_show_card_id
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_show_card_id IS NULL THEN
    RAISE EXCEPTION 'Transaction is not a show_card_sale';
  END IF;

  -- Update ONLY the transaction record
  -- (show_cards table does not have show_id column)
  UPDATE transactions 
  SET 
    show_id = p_new_show_id,
    correction_note = p_correction_note,
    corrected_at = now(),
    correction_count = correction_count + 1
  WHERE id = p_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;