-- Add soft delete tracking columns to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Add index for filtering deleted transactions
CREATE INDEX IF NOT EXISTS idx_transactions_deleted ON transactions(deleted) WHERE deleted = false OR deleted IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN transactions.deleted IS 'Soft delete flag - marks transaction as deleted without removing from database';
COMMENT ON COLUMN transactions.deleted_at IS 'Timestamp when transaction was soft deleted';
COMMENT ON COLUMN transactions.deletion_reason IS 'Required reason for deleting transaction (10-500 chars)';