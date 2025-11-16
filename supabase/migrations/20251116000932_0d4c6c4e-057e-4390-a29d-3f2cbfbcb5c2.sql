-- Create atomic function to reassign show_card_sale to different show
CREATE OR REPLACE FUNCTION reassign_show_card_sale_to_show(
  p_transaction_id UUID,
  p_new_show_id UUID,
  p_correction_note TEXT
) RETURNS void AS $$
DECLARE
  v_show_card_id UUID;
  v_user_id UUID;
BEGIN
  -- Get show_card_id and user_id from transaction
  SELECT show_card_id, user_id INTO v_show_card_id, v_user_id
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_show_card_id IS NULL THEN
    RAISE EXCEPTION 'Transaction is not a show_card_sale';
  END IF;

  -- Update transaction
  UPDATE transactions 
  SET 
    show_id = p_new_show_id,
    correction_note = p_correction_note,
    corrected_at = now(),
    correction_count = correction_count + 1
  WHERE id = p_transaction_id;

  -- Update show_cards table atomically
  UPDATE show_cards
  SET show_id = p_new_show_id
  WHERE id = v_show_card_id
    AND user_id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;