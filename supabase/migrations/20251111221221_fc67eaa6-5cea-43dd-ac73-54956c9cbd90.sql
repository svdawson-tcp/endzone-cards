-- Remove old constraint that blocks dispositions
ALTER TABLE transactions 
DROP CONSTRAINT IF EXISTS show_card_required;

-- Add updated constraint that permits dispositions and bulk sales without show cards
ALTER TABLE transactions
ADD CONSTRAINT show_card_optional_for_dispositions CHECK (
  transaction_type IN ('disposition', 'bulk_sale') OR show_card_id IS NOT NULL
);