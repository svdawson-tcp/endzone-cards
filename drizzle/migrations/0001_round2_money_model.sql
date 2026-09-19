-- =====================================================================
-- EndZone Round 2 — money model for the full-time business
-- Supervisor-authored, tested against a replica of the live baseline (2026-09-19).
-- Must run as ONE transaction (the migration runner's). Any failure must roll back everything.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CASH ACCOUNTS (Operating / Tax / Reserve / Travel & Shows ...)
-- ---------------------------------------------------------------------
CREATE TABLE public.cash_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 50),
  kind          text NOT NULL CHECK (kind IN ('operating','tax','reserve','travel','other')),
  target_amount numeric(10,2) CHECK (target_amount IS NULL OR target_amount >= 0),
  is_default    boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT default_account_not_archived CHECK (NOT (is_default AND archived))
);
CREATE UNIQUE INDEX cash_accounts_one_default_per_user ON public.cash_accounts (user_id) WHERE is_default;
CREATE UNIQUE INDEX cash_accounts_unique_name_per_user ON public.cash_accounts (user_id, lower(btrim(name)));

ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own cash accounts or as mentor" ON public.cash_accounts
  FOR SELECT USING ((auth.uid() = user_id) OR has_mentor_access(user_id));
CREATE POLICY "Users can insert own cash accounts" ON public.cash_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cash accounts" ON public.cash_accounts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- No DELETE policy: accounts are archived, never deleted (cash history references them).

GRANT SELECT, INSERT, UPDATE ON public.cash_accounts TO authenticated;
GRANT ALL ON public.cash_accounts TO service_role;

CREATE TRIGGER update_cash_accounts_updated_at BEFORE UPDATE ON public.cash_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Returns the user's default account, creating "Operating" if none exists.
CREATE OR REPLACE FUNCTION public.ensure_default_cash_account(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM cash_accounts WHERE user_id = p_user_id AND is_default;
  IF v_id IS NULL THEN
    INSERT INTO cash_accounts (user_id, name, kind, is_default, sort_order)
    VALUES (p_user_id, 'Operating', 'operating', true, 0)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      SELECT id INTO v_id FROM cash_accounts WHERE user_id = p_user_id AND is_default;
    END IF;
  END IF;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.ensure_default_cash_account(uuid) FROM PUBLIC;

-- Seed: every user with cash history gets Operating (default) + Tax + Reserve + Travel & Shows.
INSERT INTO public.cash_accounts (user_id, name, kind, is_default, sort_order)
SELECT u.user_id, a.name, a.kind, a.is_default, a.sort_order
FROM (SELECT DISTINCT user_id FROM public.cash_transactions) u
CROSS JOIN (VALUES ('Operating','operating',true,0),
                   ('Tax','tax',false,1),
                   ('Reserve','reserve',false,2),
                   ('Travel & Shows','travel',false,3)) AS a(name, kind, is_default, sort_order);

-- ---------------------------------------------------------------------
-- 2. CASH TRANSACTIONS: account, business date, transfers, new types
-- ---------------------------------------------------------------------
ALTER TABLE public.cash_transactions
  ADD COLUMN account_id        uuid REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN entry_date        date,
  ADD COLUMN transfer_group_id uuid;

-- Backfill account: all history belongs to Operating.
UPDATE public.cash_transactions c
SET account_id = a.id
FROM public.cash_accounts a
WHERE a.user_id = c.user_id AND a.is_default;

-- Backfill business date from the parent record where one exists; otherwise Eastern date of created_at
-- (manual entries already store the chosen date there).
UPDATE public.cash_transactions c SET entry_date = (t.transaction_date AT TIME ZONE 'UTC')::date
FROM public.transactions t WHERE c.related_transaction_id = t.id;
UPDATE public.cash_transactions c SET entry_date = l.purchase_date
FROM public.lots l WHERE c.related_lot_id = l.id AND c.entry_date IS NULL;
UPDATE public.cash_transactions c SET entry_date = e.expense_date
FROM public.expenses e WHERE c.related_expense_id = e.id AND c.entry_date IS NULL;
UPDATE public.cash_transactions SET entry_date = (created_at AT TIME ZONE 'America/New_York')::date
WHERE entry_date IS NULL;

ALTER TABLE public.cash_transactions
  ALTER COLUMN account_id SET NOT NULL,
  ALTER COLUMN entry_date SET NOT NULL,
  ALTER COLUMN entry_date SET DEFAULT ((now() AT TIME ZONE 'America/New_York')::date);

ALTER TABLE public.cash_transactions DROP CONSTRAINT cash_transactions_transaction_type_check;
ALTER TABLE public.cash_transactions ADD CONSTRAINT cash_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'deposit','withdrawal','adjustment',               -- legacy manual types ('withdrawal' kept for history only)
    'auto_sale','auto_purchase','auto_expense',        -- system
    'owner_contribution','owner_draw','reimbursement', -- new manual types
    'transfer'));

-- Founding-capital correction (see claude/Business_Analysis_Findings.md). Net effect on the balance: zero.
--   db5d4e0d… −1,986.70  (entry error)          → 0.00, stays 'adjustment'
--   457cf9a3… +3,973.40  (fix + contribution)   → +1,986.70, 'owner_contribution'
UPDATE public.cash_transactions
SET amount = 0,
    correction_note = 'Entry error on founding date. Original amount −1,986.70; the offset is folded into founding contribution 457cf9a3-a0cc-4ded-b830-8d91649e5436. Net balance unchanged.',
    corrected_at = now(), correction_count = COALESCE(correction_count,0) + 1
WHERE id = 'db5d4e0d-46cc-455d-afc5-0b30873a59a0' AND amount = -1986.70;
UPDATE public.cash_transactions
SET transaction_type = 'owner_contribution', amount = 1986.70,
    notes = COALESCE(notes, 'Founding gift from Scott Dawson ($2,000).'),
    correction_note = 'Relabelled from adjustment. Original amount +3,973.40 also reversed entry error db5d4e0d-46cc-455d-afc5-0b30873a59a0 (−1,986.70). Net balance unchanged.',
    corrected_at = now(), correction_count = COALESCE(correction_count,0) + 1
WHERE id = '457cf9a3-a0cc-4ded-b830-8d91649e5436' AND amount = 3973.40;

ALTER TABLE public.cash_transactions
  ADD CONSTRAINT cash_sign_by_type CHECK (
       (transaction_type = 'owner_contribution' AND amount > 0)
    OR (transaction_type IN ('owner_draw','reimbursement') AND amount < 0)
    OR (transaction_type NOT IN ('owner_contribution','owner_draw','reimbursement'))),
  ADD CONSTRAINT cash_transfer_has_group CHECK ((transaction_type = 'transfer') = (transfer_group_id IS NOT NULL));

CREATE INDEX cash_transactions_account_idx ON public.cash_transactions (account_id);
CREATE INDEX cash_transactions_user_date_idx ON public.cash_transactions (user_id, entry_date);
CREATE INDEX cash_transactions_transfer_group_idx ON public.cash_transactions (transfer_group_id) WHERE transfer_group_id IS NOT NULL;

-- Any insert without an account lands in the user's default account.
CREATE OR REPLACE FUNCTION public.cash_default_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    NEW.account_id := ensure_default_cash_account(NEW.user_id);
  ELSIF NOT EXISTS (SELECT 1 FROM cash_accounts WHERE id = NEW.account_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Cash account does not belong to this user';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER cash_transactions_default_account BEFORE INSERT OR UPDATE OF account_id ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION cash_default_account();

-- Atomic transfer between two of the caller's accounts. Total cash is unchanged.
CREATE OR REPLACE FUNCTION public.record_account_transfer(
  p_from_account uuid, p_to_account uuid, p_amount numeric, p_date date, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE v_group uuid := gen_random_uuid(); v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Transfer amount must be greater than zero'; END IF;
  IF p_from_account = p_to_account THEN RAISE EXCEPTION 'Choose two different accounts'; END IF;
  IF p_date IS NULL OR p_date > (now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Transfer date cannot be in the future'; END IF;
  IF (SELECT count(*) FROM cash_accounts WHERE id IN (p_from_account, p_to_account) AND user_id = v_user AND NOT archived) <> 2 THEN
    RAISE EXCEPTION 'Both accounts must be your own active accounts';
  END IF;
  INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, transfer_group_id, notes)
  VALUES (v_user, p_from_account, 'transfer', -round(p_amount, 2), p_date, v_group, p_notes),
         (v_user, p_to_account,   'transfer',  round(p_amount, 2), p_date, v_group, p_notes);
  RETURN v_group;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_account_transfer(uuid, uuid, numeric, date, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. EXPENSES: real categories, paid-personally, account
-- ---------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN paid_personally boolean NOT NULL DEFAULT false,
  ADD COLUMN account_id uuid REFERENCES public.cash_accounts(id) ON DELETE SET NULL;

UPDATE public.expenses SET category = CASE category
  WHEN 'Booth Fee' THEN 'Table / Booth Fees'
  WHEN 'Travel'    THEN 'Travel (Gas, Tolls, Parking)'
  ELSE category END;
UPDATE public.expenses SET category = 'Other'
WHERE category NOT IN ('Shipping & Postage','Platform Fees','Table / Booth Fees','Hotel & Lodging',
  'Travel (Gas, Tolls, Parking)','Meals','Grading','Supplies','Software & Subscriptions','Other');

ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (category IN (
  'Shipping & Postage','Platform Fees','Table / Booth Fees','Hotel & Lodging',
  'Travel (Gas, Tolls, Parking)','Meals','Grading','Supplies','Software & Subscriptions','Other'));

-- Cash row only when the business paid. Paid-personally expenses are owed back to the owner.
CREATE OR REPLACE FUNCTION public.auto_create_cash_from_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT NEW.paid_personally THEN
    INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, related_expense_id, entry_date, created_at)
    VALUES (NEW.user_id, NEW.account_id, 'auto_expense', -NEW.amount, NEW.id, NEW.expense_date, NOW());
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_cash_on_expense_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (OLD.amount, OLD.expense_date, OLD.paid_personally, OLD.account_id)
     IS DISTINCT FROM (NEW.amount, NEW.expense_date, NEW.paid_personally, NEW.account_id) THEN
    DELETE FROM cash_transactions WHERE related_expense_id = NEW.id AND transaction_type = 'auto_expense';
    IF NOT NEW.paid_personally THEN
      INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, related_expense_id, entry_date, created_at)
      VALUES (NEW.user_id, NEW.account_id, 'auto_expense', -NEW.amount, NEW.id, NEW.expense_date, NOW());
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER on_expense_amount_update ON public.expenses;
CREATE TRIGGER on_expense_money_update AFTER UPDATE OF amount, expense_date, paid_personally, account_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION sync_cash_on_expense_update();

CREATE OR REPLACE FUNCTION public.cleanup_cash_on_expense_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM cash_transactions WHERE related_expense_id = OLD.id;
  RETURN OLD;
END; $$;
CREATE TRIGGER on_expense_delete_cleanup BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION cleanup_cash_on_expense_delete();

-- ---------------------------------------------------------------------
-- 4. SALES: channel + keep cash business date in sync
-- ---------------------------------------------------------------------
ALTER TABLE public.transactions ADD COLUMN sales_channel text
  CHECK (sales_channel IS NULL OR sales_channel IN ('ebay','facebook','whatnot','card_show','in_person','other'));
UPDATE public.transactions SET sales_channel = 'card_show'
WHERE show_id IS NOT NULL AND transaction_type IN ('show_card_sale','bulk_sale');

CREATE OR REPLACE FUNCTION public.auto_create_cash_from_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.transaction_type IN ('show_card_sale','bulk_sale') AND NEW.revenue > 0 THEN
    INSERT INTO cash_transactions (user_id, transaction_type, amount, related_transaction_id, entry_date, created_at)
    VALUES (NEW.user_id, 'auto_sale', NEW.revenue, NEW.id, (NEW.transaction_date AT TIME ZONE 'UTC')::date, NEW.created_at);
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_cash_on_transaction_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.revenue IS DISTINCT FROM NEW.revenue OR OLD.transaction_date IS DISTINCT FROM NEW.transaction_date THEN
    UPDATE cash_transactions
    SET amount = NEW.revenue, entry_date = (NEW.transaction_date AT TIME ZONE 'UTC')::date
    WHERE related_transaction_id = NEW.id AND transaction_type = 'auto_sale';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER on_transaction_revenue_update ON public.transactions;
CREATE TRIGGER on_transaction_money_update AFTER UPDATE OF revenue, transaction_date ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION sync_cash_on_transaction_update();

-- ---------------------------------------------------------------------
-- 5. LOTS: bought-at-show link + keep cash business date in sync
-- ---------------------------------------------------------------------
ALTER TABLE public.lots ADD COLUMN show_id uuid REFERENCES public.shows(id) ON DELETE SET NULL;
CREATE INDEX lots_show_idx ON public.lots (show_id) WHERE show_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.auto_create_cash_from_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO cash_transactions (user_id, transaction_type, amount, related_lot_id, entry_date, created_at)
  VALUES (NEW.user_id, 'auto_purchase', -NEW.total_cost, NEW.id, NEW.purchase_date, NEW.created_at);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_cash_on_lot_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.total_cost IS DISTINCT FROM NEW.total_cost OR OLD.purchase_date IS DISTINCT FROM NEW.purchase_date THEN
    UPDATE cash_transactions
    SET amount = -NEW.total_cost, entry_date = NEW.purchase_date
    WHERE related_lot_id = NEW.id AND transaction_type = 'auto_purchase';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER on_lot_cost_update ON public.lots;
CREATE TRIGGER on_lot_money_update AFTER UPDATE OF total_cost, purchase_date ON public.lots
  FOR EACH ROW EXECUTE FUNCTION sync_cash_on_lot_update();

-- ---------------------------------------------------------------------
-- 6. SECURITY FIXES (SECURITY DEFINER functions lacked ownership checks)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_show_card_sale_to_show(p_transaction_id uuid, p_new_show_id uuid, p_correction_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_show_card_id uuid;
BEGIN
  SELECT show_card_id INTO v_show_card_id
  FROM transactions WHERE id = p_transaction_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_show_card_id IS NULL THEN RAISE EXCEPTION 'Transaction is not a show_card_sale'; END IF;
  IF p_new_show_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shows WHERE id = p_new_show_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Show not found';
  END IF;
  UPDATE transactions
  SET show_id = p_new_show_id, correction_note = p_correction_note,
      corrected_at = now(), correction_count = COALESCE(correction_count,0) + 1
  WHERE id = p_transaction_id AND user_id = auth.uid();
END; $$;

CREATE OR REPLACE FUNCTION public.update_show_card_on_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.transaction_type = 'show_card_sale' AND NEW.show_card_id IS NOT NULL THEN
    UPDATE show_cards SET status = 'sold', updated_at = NOW()
    WHERE id = NEW.show_card_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;

-- ---------------------------------------------------------------------
-- 7. DASHBOARD METRICS v2 (adds accounts, owner money, owed-to-owner)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_user_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH sales AS (
    SELECT t.transaction_type, t.revenue
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.transaction_type IN ('show_card_sale','bulk_sale')
      AND COALESCE(t.deleted, false) = false
      AND (p_start IS NULL OR (t.transaction_date AT TIME ZONE 'UTC')::date >= p_start)
      AND (p_end   IS NULL OR (t.transaction_date AT TIME ZONE 'UTC')::date <= p_end)
  ),
  s AS (
    SELECT COALESCE(SUM(revenue),0) AS revenue,
           COALESCE(SUM(revenue) FILTER (WHERE transaction_type='show_card_sale'),0) AS premium_revenue,
           COALESCE(SUM(revenue) FILTER (WHERE transaction_type='bulk_sale'),0) AS bulk_revenue,
           COUNT(*) AS sale_count
    FROM sales
  ),
  b AS (
    SELECT COALESCE(SUM(l.total_cost),0) AS purchased, COUNT(*) AS lots_purchased
    FROM lots l
    WHERE l.user_id = p_user_id
      AND (p_start IS NULL OR l.purchase_date >= p_start)
      AND (p_end   IS NULL OR l.purchase_date <= p_end)
  ),
  e AS (
    SELECT COALESCE(SUM(x.amount),0) AS expenses, COUNT(*) AS expense_count
    FROM expenses x
    WHERE x.user_id = p_user_id
      AND (p_start IS NULL OR x.expense_date >= p_start)
      AND (p_end   IS NULL OR x.expense_date <= p_end)
  ),
  o AS (
    SELECT COALESCE(SUM(c.amount) FILTER (WHERE c.transaction_type='owner_contribution'),0)  AS contributions,
           COALESCE(-SUM(c.amount) FILTER (WHERE c.transaction_type='owner_draw'),0)         AS draws,
           COALESCE(-SUM(c.amount) FILTER (WHERE c.transaction_type='reimbursement'),0)      AS reimbursements
    FROM cash_transactions c
    WHERE c.user_id = p_user_id
      AND (p_start IS NULL OR c.entry_date >= p_start)
      AND (p_end   IS NULL OR c.entry_date <= p_end)
  )
  SELECT jsonb_build_object(
    -- period metrics
    'revenue',             s.revenue,
    'premium_revenue',     s.premium_revenue,
    'bulk_revenue',        s.bulk_revenue,
    'sale_count',          s.sale_count,
    'avg_sale',            CASE WHEN s.sale_count > 0 THEN ROUND(s.revenue / s.sale_count, 2) ELSE 0 END,
    'inventory_purchased', b.purchased,
    'lots_purchased',      b.lots_purchased,
    'expenses',            e.expenses,
    'expense_count',       e.expense_count,
    'cash_in_minus_out',   s.revenue - b.purchased - e.expenses,
    'tax_setaside',        ROUND(s.revenue * 0.04, 2),
    'owner_contributions', o.contributions,
    'owner_draws',         o.draws,
    'reimbursements',      o.reimbursements,
    -- point-in-time metrics
    'cash_on_hand',        (SELECT COALESCE(SUM(c.amount),0) FROM cash_transactions c WHERE c.user_id = p_user_id),
    'owed_to_owner',       (SELECT COALESCE(SUM(x.amount),0) FROM expenses x WHERE x.user_id = p_user_id AND x.paid_personally)
                         + (SELECT COALESCE(SUM(c.amount),0) FROM cash_transactions c WHERE c.user_id = p_user_id AND c.transaction_type = 'reimbursement'),
    'accounts',            (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                'id', a.id, 'name', a.name, 'kind', a.kind, 'target', a.target_amount,
                                'is_default', a.is_default,
                                'balance', (SELECT COALESCE(SUM(c.amount),0) FROM cash_transactions c WHERE c.account_id = a.id))
                              ORDER BY a.sort_order, a.name), '[]'::jsonb)
                            FROM cash_accounts a WHERE a.user_id = p_user_id AND NOT a.archived),
    'active_lots',         (SELECT COUNT(*) FROM lots l2 WHERE l2.user_id = p_user_id AND l2.status = 'active'),
    'listed_cards',        (SELECT COUNT(*) FROM show_cards sc WHERE sc.user_id = p_user_id AND sc.status = 'available'),
    'listed_cards_value',  (SELECT COALESCE(SUM(sc.asking_price),0) FROM show_cards sc WHERE sc.user_id = p_user_id AND sc.status = 'available')
  )
  FROM s, b, e, o;
$$;