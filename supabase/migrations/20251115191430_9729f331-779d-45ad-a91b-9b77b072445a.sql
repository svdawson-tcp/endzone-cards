
-- ============================================
-- PHASE 1A: TIER 1 CORRECTION TRACKING SCHEMA
-- ============================================

-- 1. Add correction tracking to transactions table
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS correction_note TEXT,
ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS correction_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.transactions.correction_note IS 'Most recent correction reason (Tier 1 simple reassignments only)';
COMMENT ON COLUMN public.transactions.corrected_at IS 'Timestamp of most recent correction';
COMMENT ON COLUMN public.transactions.correction_count IS 'Number of times this transaction has been corrected';

-- 2. Add correction tracking to cash_transactions table
ALTER TABLE public.cash_transactions
ADD COLUMN IF NOT EXISTS correction_note TEXT,
ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS correction_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.cash_transactions.correction_note IS 'Most recent correction reason';
COMMENT ON COLUMN public.cash_transactions.corrected_at IS 'Timestamp of most recent correction';
COMMENT ON COLUMN public.cash_transactions.correction_count IS 'Number of times corrected';

-- 3. Add correction tracking to expenses table
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS correction_note TEXT,
ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS correction_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.expenses.correction_note IS 'Most recent correction reason';
COMMENT ON COLUMN public.expenses.corrected_at IS 'Timestamp of most recent correction';
COMMENT ON COLUMN public.expenses.correction_count IS 'Number of times corrected';

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_corrected_at 
ON public.transactions(corrected_at DESC) 
WHERE corrected_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_transactions_corrected_at 
ON public.cash_transactions(corrected_at DESC) 
WHERE corrected_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_corrected_at 
ON public.expenses(corrected_at DESC) 
WHERE corrected_at IS NOT NULL;

-- 5. Add data integrity constraint
ALTER TABLE public.transactions
ADD CONSTRAINT check_show_card_sale_has_card
CHECK (
  transaction_type != 'show_card_sale' 
  OR show_card_id IS NOT NULL
);

COMMENT ON CONSTRAINT check_show_card_sale_has_card ON public.transactions IS 
'Ensures show_card_sale transactions always have a linked show_card_id (prevents orphaned sales)';
