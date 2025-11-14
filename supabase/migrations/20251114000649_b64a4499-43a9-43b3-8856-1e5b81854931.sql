-- Add transaction_date column with NOT NULL constraint
ALTER TABLE transactions 
ADD COLUMN transaction_date timestamptz NOT NULL DEFAULT now();

-- Backfill existing records with created_at values
-- This ensures data integrity for existing transactions
UPDATE transactions 
SET transaction_date = created_at;

-- Create index for query performance
-- Most queries will order by transaction_date DESC
CREATE INDEX idx_transactions_transaction_date 
ON transactions(transaction_date DESC);

-- Add documentation for future developers
COMMENT ON COLUMN transactions.transaction_date IS 
'Business date when the transaction occurred (user-specified). Distinct from created_at which is the system audit timestamp.';