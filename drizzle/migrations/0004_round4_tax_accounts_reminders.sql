-- =====================================================================
-- EndZone Round 4 — weekly tax tracker, four-account tracking, reconciliation, reminders
-- Design: "EndZone Round 4 Design — Tax Tracker, Reminders, Four Accounts" (Claude Doc, approved 10 Oct 2026)
-- Must run as ONE transaction. Additive only: code already in production keeps working after it runs.
-- Conventions: money is numeric (never float); business dates are `date`; soft-deleted sales are
-- excluded with `deleted IS NOT TRUE`; every SECURITY DEFINER function checks auth.uid() ownership.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CASH TRANSACTIONS: tax payments and interest
-- ---------------------------------------------------------------------
ALTER TABLE public.cash_transactions DROP CONSTRAINT cash_transactions_transaction_type_check;
ALTER TABLE public.cash_transactions ADD CONSTRAINT cash_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'deposit','withdrawal','adjustment',               -- legacy manual types
    'auto_sale','auto_purchase','auto_expense',        -- system
    'owner_contribution','owner_draw','reimbursement', -- owner money
    'transfer',                                        -- between the owner's own accounts
    'tax_payment',                                     -- estimated tax paid out of the Tax account
    'interest'));                                      -- bank interest credited to an account

ALTER TABLE public.cash_transactions
  ADD COLUMN tax_authority text CHECK (tax_authority IS NULL OR tax_authority IN ('irs','pa','local')),
  ADD COLUMN tax_period    text CHECK (tax_period IS NULL OR tax_period ~ '^[0-9]{4}-Q[1-4]$');

ALTER TABLE public.cash_transactions
  ADD CONSTRAINT cash_tax_payment_fields CHECK (
    (transaction_type = 'tax_payment') = (tax_authority IS NOT NULL AND tax_period IS NOT NULL));

ALTER TABLE public.cash_transactions DROP CONSTRAINT cash_sign_by_type;
ALTER TABLE public.cash_transactions ADD CONSTRAINT cash_sign_by_type CHECK (
       (transaction_type IN ('owner_contribution','interest') AND amount > 0)
    OR (transaction_type IN ('owner_draw','reimbursement','tax_payment') AND amount < 0)
    OR (transaction_type NOT IN ('owner_contribution','interest','owner_draw','reimbursement','tax_payment')));

-- ---------------------------------------------------------------------
-- 2. LOTS: which account paid (optional; NULL = the user's default account)
-- ---------------------------------------------------------------------
ALTER TABLE public.lots ADD COLUMN account_id uuid REFERENCES public.cash_accounts(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.auto_create_cash_from_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- account_id NULL falls through to the default account; a foreign account is rejected
  -- by the cash_transactions_default_account trigger.
  INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, related_lot_id, entry_date, created_at)
  VALUES (NEW.user_id, NEW.account_id, 'auto_purchase', -NEW.total_cost, NEW.id, NEW.purchase_date, NEW.created_at);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_cash_on_lot_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (OLD.total_cost, OLD.purchase_date, OLD.account_id)
     IS DISTINCT FROM (NEW.total_cost, NEW.purchase_date, NEW.account_id) THEN
    UPDATE cash_transactions
    SET amount = -NEW.total_cost,
        entry_date = NEW.purchase_date,
        account_id = COALESCE(NEW.account_id, ensure_default_cash_account(NEW.user_id))
    WHERE related_lot_id = NEW.id AND transaction_type = 'auto_purchase';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER on_lot_money_update ON public.lots;
CREATE TRIGGER on_lot_money_update AFTER UPDATE OF total_cost, purchase_date, account_id ON public.lots
  FOR EACH ROW EXECUTE FUNCTION sync_cash_on_lot_update();

-- ---------------------------------------------------------------------
-- 3. EXPENSES: bank and payment-processor fees get their own category
-- ---------------------------------------------------------------------
ALTER TABLE public.expenses DROP CONSTRAINT expenses_category_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (category IN (
  'Shipping & Postage','Platform Fees','Table / Booth Fees','Hotel & Lodging',
  'Travel (Gas, Tolls, Parking)','Meals','Grading','Supplies','Software & Subscriptions',
  'Bank & Payment Fees','Other'));

-- ---------------------------------------------------------------------
-- 4. MONEY SETTINGS (one row per user; absent row = defaults)
-- ---------------------------------------------------------------------
CREATE TABLE public.money_settings (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tax_rate             numeric(5,4) NOT NULL DEFAULT 0.04 CHECK (tax_rate >= 0 AND tax_rate <= 0.5),
  tracker_start        date NOT NULL DEFAULT DATE '2026-01-01',
  transfer_weekday     smallint NOT NULL DEFAULT 1 CHECK (transfer_weekday BETWEEN 1 AND 7),  -- ISO: 1 = Monday
  round_up_transfers   boolean NOT NULL DEFAULT true,
  first_estimate_due   date NOT NULL DEFAULT DATE '2027-01-15',
  annual_report_from   smallint NOT NULL DEFAULT 2027,
  setup_completed_at   timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.money_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own money settings or as mentor" ON public.money_settings
  FOR SELECT USING ((auth.uid() = user_id) OR has_mentor_access(user_id));
CREATE POLICY "Users can insert own money settings" ON public.money_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own money settings" ON public.money_settings
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE ON public.money_settings TO authenticated;
GRANT ALL ON public.money_settings TO service_role;
CREATE TRIGGER update_money_settings_updated_at BEFORE UPDATE ON public.money_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 5. ACCOUNT RECONCILIATIONS (immutable; written only by record_reconciliation)
-- ---------------------------------------------------------------------
CREATE TABLE public.account_reconciliations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id     uuid NOT NULL REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  as_of          date NOT NULL,
  bank_balance   numeric(12,2) NOT NULL,
  undeposited    numeric(12,2) NOT NULL DEFAULT 0 CHECK (undeposited >= 0),
  app_balance    numeric(12,2) NOT NULL,
  difference     numeric(12,2) GENERATED ALWAYS AS (app_balance - bank_balance - undeposited) STORED,
  adjustment_id  uuid REFERENCES public.cash_transactions(id) ON DELETE SET NULL,
  note           text CHECK (note IS NULL OR length(note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_reconciliations_account_idx ON public.account_reconciliations (account_id, as_of DESC);
ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reconciliations or as mentor" ON public.account_reconciliations
  FOR SELECT USING ((auth.uid() = user_id) OR has_mentor_access(user_id));
-- No INSERT/UPDATE/DELETE policies: app_balance must be computed by the server, and a check is never edited.
GRANT SELECT ON public.account_reconciliations TO authenticated;
GRANT ALL ON public.account_reconciliations TO service_role;

-- ---------------------------------------------------------------------
-- 6. REMINDER STATE (dismiss / snooze per reminder occurrence)
-- ---------------------------------------------------------------------
CREATE TABLE public.reminders_state (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_key   text NOT NULL CHECK (length(reminder_key) BETWEEN 1 AND 60),
  period_key     text NOT NULL CHECK (length(period_key) BETWEEN 1 AND 40),
  dismissed_at   timestamptz,
  snoozed_until  date,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reminder_key, period_key)
);
ALTER TABLE public.reminders_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own reminder state or as mentor" ON public.reminders_state
  FOR SELECT USING ((auth.uid() = user_id) OR has_mentor_access(user_id));
CREATE POLICY "Users can insert own reminder state" ON public.reminders_state
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminder state" ON public.reminders_state
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE ON public.reminders_state TO authenticated;
GRANT ALL ON public.reminders_state TO service_role;

-- ---------------------------------------------------------------------
-- 7. ESTIMATED-TAX SCHEDULE (federal + PA share the same dates)
--    Apr 15 = Q1, Jun 15 = Q2, Sep 15 = Q3, Jan 15 of next year = Q4.
--    A date on a weekend moves to the following Monday.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tax_estimate_schedule(p_from date, p_to date)
RETURNS TABLE (due_date date, tax_period text)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH raw AS (
    SELECT make_date(y, 4, 15)     AS d, y || '-Q1' AS p FROM generate_series(extract(year FROM p_from)::int - 1, extract(year FROM p_to)::int) y
    UNION ALL SELECT make_date(y, 6, 15),  y || '-Q2' FROM generate_series(extract(year FROM p_from)::int - 1, extract(year FROM p_to)::int) y
    UNION ALL SELECT make_date(y, 9, 15),  y || '-Q3' FROM generate_series(extract(year FROM p_from)::int - 1, extract(year FROM p_to)::int) y
    UNION ALL SELECT make_date(y + 1, 1, 15), y || '-Q4' FROM generate_series(extract(year FROM p_from)::int - 1, extract(year FROM p_to)::int) y
  ), rolled AS (
    SELECT CASE extract(isodow FROM d) WHEN 6 THEN d + 2 WHEN 7 THEN d + 1 ELSE d END AS d, p FROM raw
  )
  SELECT d, p FROM rolled WHERE d BETWEEN p_from AND p_to ORDER BY d;
$$;

-- ---------------------------------------------------------------------
-- 8. WEEKLY TAX TRACKER
--    Owed per week = round(rate x gross sales in that Mon-Sun week, 2); gross falls back to net.
--    Deposits = transfers / owner contributions INTO an account of kind 'tax'.
--    Position = deposits - owed for COMPLETED weeks (the current week is still accruing).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tax_tracker(p_user_id uuid, p_today date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_today     date := COALESCE(p_today, (now() AT TIME ZONE 'America/New_York')::date);
  v_rate      numeric := 0.04;
  v_start     date := DATE '2026-01-01';
  v_round     boolean := true;
  v_first_est date := DATE '2027-01-15';
  v_cur_week  date;
  v_result    jsonb;
BEGIN
  SELECT tax_rate, tracker_start, round_up_transfers, first_estimate_due
  INTO v_rate, v_start, v_round, v_first_est
  FROM money_settings WHERE user_id = p_user_id;
  v_rate := COALESCE(v_rate, 0.04); v_start := COALESCE(v_start, DATE '2026-01-01');
  v_round := COALESCE(v_round, true); v_first_est := COALESCE(v_first_est, DATE '2027-01-15');
  v_cur_week := date_trunc('week', v_today::timestamp)::date;

  WITH weeks AS (
    SELECT gs::date AS wk
    FROM generate_series(date_trunc('week', v_start::timestamp), v_cur_week::timestamp, interval '1 week') gs
  ),
  sales AS (
    SELECT date_trunc('week', ((t.transaction_date AT TIME ZONE 'UTC')::date)::timestamp)::date AS wk,
           SUM(COALESCE(t.gross_amount, t.revenue)) AS gross,
           COUNT(*) AS n,
           BOOL_OR(GREATEST(t.created_at, COALESCE(t.corrected_at, t.created_at))
                   >= ((date_trunc('week', ((t.transaction_date AT TIME ZONE 'UTC')::date)::timestamp) + interval '7 days')
                       AT TIME ZONE 'America/New_York')) AS late
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.transaction_type IN ('show_card_sale','bulk_sale')
      AND t.deleted IS NOT TRUE
      AND (t.transaction_date AT TIME ZONE 'UTC')::date BETWEEN v_start AND v_today
    GROUP BY 1
  ),
  deps AS (
    SELECT date_trunc('week', c.entry_date::timestamp)::date AS wk, SUM(c.amount) AS deposited
    FROM cash_transactions c JOIN cash_accounts a ON a.id = c.account_id
    WHERE c.user_id = p_user_id AND a.kind = 'tax'
      AND c.transaction_type IN ('transfer','owner_contribution') AND c.amount > 0
      AND c.entry_date BETWEEN v_start AND v_today
    GROUP BY 1
  ),
  joined AS (
    SELECT w.wk,
           COALESCE(s.gross, 0) AS gross,
           COALESCE(s.n, 0) AS sale_count,
           ROUND(COALESCE(s.gross, 0) * v_rate, 2) AS owed,
           COALESCE(d.deposited, 0) AS deposited,
           COALESCE(s.late, false) AS late
    FROM weeks w LEFT JOIN sales s ON s.wk = w.wk LEFT JOIN deps d ON d.wk = w.wk
  ),
  cum AS (
    SELECT j.*,
           SUM(owed) OVER (ORDER BY wk) AS cum_owed,
           SUM(deposited) OVER (ORDER BY wk) AS cum_deposited
    FROM joined j
  ),
  completed AS (
    SELECT COALESCE(SUM(owed) FILTER (WHERE wk < v_cur_week), 0) AS owed_due,
           COALESCE(SUM(owed) FILTER (WHERE wk = v_cur_week), 0) AS accruing,
           COALESCE(SUM(deposited), 0) AS deposited,
           COALESCE(SUM(gross), 0) AS gross
    FROM cum
  ),
  tax_acct AS (
    SELECT COALESCE(SUM(c.amount), 0) AS balance,
           COALESCE(SUM(c.amount) FILTER (WHERE c.transaction_type = 'interest'), 0) AS interest
    FROM cash_transactions c JOIN cash_accounts a ON a.id = c.account_id
    WHERE c.user_id = p_user_id AND a.kind = 'tax'
  ),
  pays AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', c.id, 'date', c.entry_date, 'amount', -c.amount,
             'authority', c.tax_authority, 'period', c.tax_period, 'notes', c.notes)
             ORDER BY c.entry_date DESC, c.created_at DESC), '[]'::jsonb) AS rows,
           COALESCE(-SUM(c.amount), 0) AS total
    FROM cash_transactions c
    WHERE c.user_id = p_user_id AND c.transaction_type = 'tax_payment'
  ),
  next_due AS (
    SELECT s.due_date, s.tax_period
    FROM tax_estimate_schedule(GREATEST(v_first_est, v_today - 60), GREATEST(v_first_est, v_today) + 400) s
    WHERE NOT EXISTS (SELECT 1 FROM cash_transactions c
                      WHERE c.user_id = p_user_id AND c.transaction_type = 'tax_payment' AND c.tax_period = s.tax_period)
      AND s.due_date >= v_first_est
    ORDER BY s.due_date LIMIT 1
  )
  SELECT jsonb_build_object(
    'today',            v_today,
    'tax_rate',         v_rate,
    'tracker_start',    v_start,
    'current_week',     v_cur_week,
    'gross_sales',      c.gross,
    'owed_due',         c.owed_due,
    'accruing',         c.accruing,
    'deposited',        c.deposited,
    'position',         c.deposited - c.owed_due,
    'suggested_transfer', CASE WHEN c.deposited - c.owed_due < 0
                               THEN CASE WHEN v_round THEN CEIL(c.owed_due - c.deposited) ELSE c.owed_due - c.deposited END
                               ELSE 0 END,
    'tax_account_balance', ta.balance,
    'interest_total',   ta.interest,
    'paid_total',       p.total,
    'payments',         p.rows,
    'next_estimate_due',    (SELECT due_date FROM next_due),
    'next_estimate_period', (SELECT tax_period FROM next_due),
    'weeks', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'week_start', wk, 'gross', gross, 'sale_count', sale_count, 'owed', owed,
                'deposited', deposited, 'cum_owed', cum_owed, 'cum_deposited', cum_deposited,
                'late_entries', late,
                'status', CASE WHEN wk = v_cur_week THEN 'accruing'
                               WHEN owed = 0 THEN 'nothing_owed'
                               WHEN cum_deposited >= cum_owed THEN 'covered'
                               WHEN cum_deposited > cum_owed - owed THEN 'partial'
                               ELSE 'open' END)
              ORDER BY wk DESC), '[]'::jsonb) FROM cum)
  )
  INTO v_result
  FROM completed c, tax_acct ta, pays p;

  RETURN v_result;
END; $$;

-- ---------------------------------------------------------------------
-- 9. RECORD AN ESTIMATED TAX PAYMENT (out of a Tax account)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_tax_payment(
  p_account_id uuid, p_amount numeric, p_date date, p_authority text, p_period text, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payment amount must be greater than zero'; END IF;
  IF p_date IS NULL OR p_date > (now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Payment date cannot be in the future'; END IF;
  IF p_authority NOT IN ('irs','pa','local') THEN RAISE EXCEPTION 'Choose who the payment went to'; END IF;
  IF p_period IS NULL OR p_period !~ '^[0-9]{4}-Q[1-4]$' THEN RAISE EXCEPTION 'Choose the tax quarter'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cash_accounts WHERE id = p_account_id AND user_id = v_user AND kind = 'tax' AND NOT archived) THEN
    RAISE EXCEPTION 'Tax payments must come out of your Tax account';
  END IF;
  INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, tax_authority, tax_period, notes)
  VALUES (v_user, p_account_id, 'tax_payment', -round(p_amount, 2), p_date, p_authority, p_period, NULLIF(btrim(p_notes), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ---------------------------------------------------------------------
-- 10. RECONCILE AN ACCOUNT AGAINST THE BANK
--     SECURITY DEFINER so app_balance is always computed here (no client-written balances);
--     ownership is checked explicitly (ISS-007).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_reconciliation(
  p_account_id uuid, p_as_of date, p_bank_balance numeric, p_undeposited numeric DEFAULT 0,
  p_note text DEFAULT NULL, p_post_adjustment boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_app numeric; v_diff numeric; v_adj uuid; v_id uuid;
  v_note text := NULLIF(btrim(p_note), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cash_accounts WHERE id = p_account_id AND user_id = v_user AND NOT archived) THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF p_as_of IS NULL OR p_as_of > (now() AT TIME ZONE 'America/New_York')::date THEN RAISE EXCEPTION 'Check date cannot be in the future'; END IF;
  IF p_bank_balance IS NULL THEN RAISE EXCEPTION 'Enter the bank balance'; END IF;
  IF COALESCE(p_undeposited, 0) < 0 THEN RAISE EXCEPTION 'Money not yet in the bank cannot be negative'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 500 THEN RAISE EXCEPTION 'Note must be 500 characters or fewer'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_app
  FROM cash_transactions WHERE account_id = p_account_id AND user_id = v_user AND entry_date <= p_as_of;

  v_diff := v_app - round(p_bank_balance, 2) - round(COALESCE(p_undeposited, 0), 2);

  IF p_post_adjustment AND v_diff <> 0 THEN
    IF v_note IS NULL OR length(v_note) < 10 THEN
      RAISE EXCEPTION 'Explain the difference in at least 10 characters before posting an adjustment';
    END IF;
    INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, notes)
    VALUES (v_user, p_account_id, 'adjustment', -v_diff, p_as_of, 'Reconciliation: ' || v_note)
    RETURNING id INTO v_adj;
  END IF;

  INSERT INTO account_reconciliations (user_id, account_id, as_of, bank_balance, undeposited, app_balance, adjustment_id, note)
  VALUES (v_user, p_account_id, p_as_of, round(p_bank_balance, 2), round(COALESCE(p_undeposited, 0), 2), v_app, v_adj, v_note)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'app_balance', v_app, 'difference', v_diff,
                            'adjustment_id', v_adj, 'matched', v_diff = 0 OR v_adj IS NOT NULL);
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_reconciliation(uuid, date, numeric, numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_reconciliation(uuid, date, numeric, numeric, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------
-- 11. ACCOUNT STATEMENT (opening, money in/out by kind, rows with running balance)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_account_statement(
  p_account_id uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_acct   cash_accounts%ROWTYPE;
  v_to     date := COALESCE(p_to, (now() AT TIME ZONE 'America/New_York')::date);
  v_from   date;
  v_result jsonb;
BEGIN
  SELECT * INTO v_acct FROM cash_accounts WHERE id = p_account_id;   -- RLS: owner or mentor
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  v_from := COALESCE(p_from, (SELECT MIN(entry_date) FROM cash_transactions WHERE account_id = p_account_id), v_to);

  WITH base AS (
    SELECT c.*,
           CASE c.transaction_type
             WHEN 'auto_sale' THEN 'sales' WHEN 'auto_purchase' THEN 'purchases' WHEN 'auto_expense' THEN 'expenses'
             WHEN 'transfer' THEN 'transfers' WHEN 'tax_payment' THEN 'tax_payments' WHEN 'interest' THEN 'interest'
             WHEN 'adjustment' THEN 'adjustments'
             ELSE 'owner_money' END AS grp
    FROM cash_transactions c WHERE c.account_id = p_account_id
  ),
  opening AS (SELECT COALESCE(SUM(amount), 0) AS v FROM base WHERE entry_date < v_from),
  rng AS (
    SELECT b.*,
           (SELECT v FROM opening) + SUM(b.amount) OVER (ORDER BY b.entry_date, b.created_at, b.id) AS running
    FROM base b WHERE b.entry_date BETWEEN v_from AND v_to
  ),
  last_rec AS (
    SELECT r.as_of, r.difference, r.adjustment_id IS NOT NULL AS adjusted
    FROM account_reconciliations r WHERE r.account_id = p_account_id
    ORDER BY r.as_of DESC, r.created_at DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'account', jsonb_build_object('id', v_acct.id, 'name', v_acct.name, 'kind', v_acct.kind, 'target', v_acct.target_amount),
    'from', v_from, 'to', v_to,
    'opening', (SELECT v FROM opening),
    'closing', (SELECT v FROM opening) + COALESCE((SELECT SUM(amount) FROM rng), 0),
    'money_in',  COALESCE((SELECT SUM(amount) FROM rng WHERE amount > 0), 0),
    'money_out', COALESCE((SELECT -SUM(amount) FROM rng WHERE amount < 0), 0),
    'by_kind', COALESCE((SELECT jsonb_object_agg(grp, total) FROM (SELECT grp, SUM(amount) AS total FROM rng GROUP BY grp) g), '{}'::jsonb),
    'last_reconciliation', (SELECT to_jsonb(l) FROM last_rec l),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'date', r.entry_date, 'type', r.transaction_type, 'group', r.grp,
               'amount', r.amount, 'running_balance', r.running, 'notes', r.notes,
               'tax_authority', r.tax_authority, 'tax_period', r.tax_period,
               'related_transaction_id', r.related_transaction_id, 'related_lot_id', r.related_lot_id,
               'related_expense_id', r.related_expense_id, 'transfer_group_id', r.transfer_group_id)
               ORDER BY r.entry_date DESC, r.created_at DESC, r.id DESC)
             FROM (SELECT * FROM rng ORDER BY entry_date DESC, created_at DESC, id DESC LIMIT GREATEST(p_limit, 1)) r), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END; $$;

-- ---------------------------------------------------------------------
-- 12. REMINDERS (computed; dismiss/snooze state in reminders_state)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reminders(p_user_id uuid, p_today date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_today   date := COALESCE(p_today, (now() AT TIME ZONE 'America/New_York')::date);
  v_set     money_settings%ROWTYPE;
  v_tracker jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_prev_month_end date := (date_trunc('month', v_today::timestamp) - interval '1 day')::date;
  v_first_monday   date;
  r record;
BEGIN
  SELECT * INTO v_set FROM money_settings WHERE user_id = p_user_id;

  -- a) first-use setup
  IF v_set.user_id IS NULL OR v_set.setup_completed_at IS NULL THEN
    v_items := v_items || jsonb_build_object('key','money_setup','period','once','kind','setup',
      'title','Set up your four accounts','body','Two minutes: opening balances and how you want the weekly tax transfer.',
      'due', NULL);
  END IF;

  -- b) weekly tax transfer
  v_tracker := get_tax_tracker(p_user_id, v_today);
  IF (v_tracker->>'position')::numeric < 0 THEN
    v_items := v_items || jsonb_build_object('key','tax_transfer',
      'period', ((v_tracker->>'current_week')::date - 7)::text, 'kind','tax_transfer',
      'title', 'Send $' || to_char((v_tracker->>'suggested_transfer')::numeric, 'FM999999990.00') || ' to Tax',
      'body',  'Owed $' || to_char(-(v_tracker->>'position')::numeric, 'FM999999990.00') || ' for completed weeks.',
      'amount', (v_tracker->>'suggested_transfer')::numeric,
      'due', (v_tracker->>'current_week'));
  END IF;

  -- c) estimated tax payments: from 7 days before each due date until a payment for that quarter is recorded
  FOR r IN
    SELECT s.due_date, s.tax_period
    FROM tax_estimate_schedule(COALESCE(v_set.first_estimate_due, DATE '2027-01-15'), v_today + 7) s
    WHERE s.due_date >= COALESCE(v_set.first_estimate_due, DATE '2027-01-15')
      AND NOT EXISTS (SELECT 1 FROM cash_transactions c WHERE c.user_id = p_user_id
                      AND c.transaction_type = 'tax_payment' AND c.tax_period = s.tax_period)
  LOOP
    v_items := v_items || jsonb_build_object('key','estimated_tax','period', r.tax_period,'kind','estimated_tax',
      'title', 'Estimated tax due ' || to_char(r.due_date, 'Mon FMDD'),
      'body',  'Federal and PA payments for ' || r.tax_period || '. Record them here once paid.',
      'due', r.due_date, 'overdue', r.due_date < v_today);
  END LOOP;

  -- d) monthly reconciliation, from the first Monday of the month, once setup is done
  v_first_monday := date_trunc('month', v_today::timestamp)::date
                    + ((8 - extract(isodow FROM date_trunc('month', v_today::timestamp))::int) % 7);
  IF v_set.setup_completed_at IS NOT NULL AND v_today >= v_first_monday
     AND v_set.setup_completed_at::date <= v_prev_month_end THEN
    FOR r IN
      SELECT a.id, a.name FROM cash_accounts a
      WHERE a.user_id = p_user_id AND NOT a.archived
        AND NOT EXISTS (SELECT 1 FROM account_reconciliations x WHERE x.account_id = a.id AND x.as_of >= v_prev_month_end)
      ORDER BY a.sort_order, a.name
    LOOP
      v_items := v_items || jsonb_build_object('key','reconcile:' || r.id,'period', to_char(v_today, 'YYYY-MM'),
        'kind','reconcile','account_id', r.id,
        'title', 'Check ' || r.name || ' against the bank',
        'body', 'Enter the balance on your ' || to_char(v_prev_month_end, 'FMMonth') || ' statement.', 'due', NULL);
    END LOOP;
  END IF;

  -- e) year-end: January, starting 2027
  IF extract(month FROM v_today) = 1 AND extract(year FROM v_today) >= 2027 THEN
    v_items := v_items || jsonb_build_object('key','year_end','period', extract(year FROM v_today)::text,'kind','info',
      'title','Year-end: send your books to the accountant',
      'body','Collect 1099-K forms from eBay, Whatnot and PayPal and send them with your EndZone export.',
      'due', make_date(extract(year FROM v_today)::int, 1, 31));
  END IF;

  -- f) PA LLC annual report: September, from annual_report_from
  IF extract(month FROM v_today) = 9 AND extract(year FROM v_today) >= COALESCE(v_set.annual_report_from, 2027) THEN
    v_items := v_items || jsonb_build_object('key','pa_annual_report','period', extract(year FROM v_today)::text,'kind','info',
      'title','PA LLC annual report due Sept 30',
      'body','File for CS Sports Cards & Collectibles LLC at file.dos.pa.gov.',
      'due', make_date(extract(year FROM v_today)::int, 9, 30));
  END IF;

  -- drop dismissed or snoozed occurrences
  RETURN COALESCE((
    SELECT jsonb_agg(i ORDER BY ord)
    FROM jsonb_array_elements(v_items) WITH ORDINALITY AS e(i, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM reminders_state s
      WHERE s.user_id = p_user_id AND s.reminder_key = i->>'key' AND s.period_key = i->>'period'
        AND (s.dismissed_at IS NOT NULL OR (s.snoozed_until IS NOT NULL AND s.snoozed_until > v_today)))
  ), '[]'::jsonb);
END; $$;

-- ---------------------------------------------------------------------
-- 12b. FIRST-USE MONEY SETUP (all-or-nothing)
--      Records how the four bank accounts were funded, an optional "Old M&T savings" account,
--      the weekly-transfer rounding choice, and an opening reconciliation of every account.
--      Payload (all amounts as strings, all dates YYYY-MM-DD):
--      { "setup_date": "2026-10-12",
--        "old_account": { "status": "closed" | "open", "balance": "0.00" },
--        "opening": [ { "type": "contribution" | "transfer", "account": "operating|travel|tax|reserve",
--                       "amount": "7500.00", "date": "2026-10-12", "note": "..." } ],
--        "cash_outside_bank": "250.00",
--        "bank_balances": { "operating": "...", "travel": "...", "tax": "...", "reserve": "...", "old": "..." },
--        "round_up_transfers": true,
--        "note": "explanation for any opening differences (optional)" }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_money_setup(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/New_York')::date;
  v_date  date;
  v_acct  jsonb := '{}'::jsonb;   -- kind -> account id
  v_old   uuid;
  v_bal   numeric;
  v_item  jsonb;
  v_amt   numeric;
  v_d     date;
  v_note  text := COALESCE(NULLIF(btrim(p->>'note'), ''), 'Opening balance at account setup');
  v_k     text;
  v_rec   jsonb;
  v_recs  jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM money_settings WHERE user_id = v_user AND setup_completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Your accounts are already set up';
  END IF;
  IF length(v_note) < 10 THEN v_note := 'Opening balance at account setup: ' || v_note; END IF;

  v_date := COALESCE(NULLIF(p->>'setup_date', '')::date, v_today);
  IF v_date > v_today THEN RAISE EXCEPTION 'Setup date cannot be in the future'; END IF;

  SELECT jsonb_object_agg(kind, id) INTO v_acct
  FROM (SELECT DISTINCT ON (kind) kind, id FROM cash_accounts
        WHERE user_id = v_user AND NOT archived AND kind IN ('operating','travel','tax','reserve')
        ORDER BY kind, is_default DESC, sort_order, created_at) a;
  IF v_acct IS NULL OR NOT (v_acct ?& ARRAY['operating','travel','tax','reserve']) THEN
    RAISE EXCEPTION 'Operating, Travel & Shows, Tax and Reserve accounts must all exist before setup';
  END IF;

  -- 1. Old M&T savings: if still open, give it its own account and move its money there from Operating
  IF COALESCE(p->'old_account'->>'status', 'closed') = 'open' THEN
    SELECT id INTO v_old FROM cash_accounts
    WHERE user_id = v_user AND lower(btrim(name)) = 'old m&t savings' AND NOT archived;
    IF v_old IS NULL THEN
      INSERT INTO cash_accounts (user_id, name, kind, sort_order)
      VALUES (v_user, 'Old M&T savings', 'other', 9) RETURNING id INTO v_old;
    END IF;
    v_bal := round(COALESCE(NULLIF(p->'old_account'->>'balance', '')::numeric, 0), 2);
    IF v_bal < 0 THEN RAISE EXCEPTION 'Old account balance cannot be negative'; END IF;
    IF v_bal > 0 THEN
      PERFORM record_account_transfer((v_acct->>'operating')::uuid, v_old, v_bal, v_date,
                                      'Money still in the old M&T savings account at setup');
    END IF;
  END IF;

  -- 2. Opening money, as it actually moved
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p->'opening', '[]'::jsonb)) LOOP
    v_k := v_item->>'account';
    IF NOT (v_acct ? v_k) THEN RAISE EXCEPTION 'Unknown account "%" in opening entries', v_k; END IF;
    v_amt := round(NULLIF(v_item->>'amount', '')::numeric, 2);
    IF v_amt IS NULL OR v_amt = 0 THEN CONTINUE; END IF;
    IF v_amt < 0 THEN RAISE EXCEPTION 'Opening amounts must be positive'; END IF;
    v_d := COALESCE(NULLIF(v_item->>'date', '')::date, v_date);
    IF v_d > v_today THEN RAISE EXCEPTION 'Opening dates cannot be in the future'; END IF;

    IF v_item->>'type' = 'contribution' THEN
      INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, notes)
      VALUES (v_user, (v_acct->>v_k)::uuid, 'owner_contribution', v_amt, v_d,
              COALESCE(NULLIF(btrim(v_item->>'note'), ''), 'Opening funding at account setup'));
    ELSIF v_item->>'type' = 'transfer' THEN
      IF v_k = 'operating' THEN RAISE EXCEPTION 'An opening transfer must go to Travel, Tax or Reserve'; END IF;
      PERFORM record_account_transfer((v_acct->>'operating')::uuid, (v_acct->>v_k)::uuid, v_amt, v_d,
                                      COALESCE(NULLIF(btrim(v_item->>'note'), ''), 'Opening transfer at account setup'));
    ELSE
      RAISE EXCEPTION 'Opening entries must be a contribution or a transfer';
    END IF;
  END LOOP;

  -- 3. Settings
  INSERT INTO money_settings (user_id, round_up_transfers)
  VALUES (v_user, COALESCE((p->>'round_up_transfers')::boolean, true))
  ON CONFLICT (user_id) DO UPDATE SET round_up_transfers = EXCLUDED.round_up_transfers;

  -- 4. Opening reconciliation of every account against the bank; differences become one noted adjustment each
  FOREACH v_k IN ARRAY ARRAY['operating','travel','tax','reserve','old'] LOOP
    CONTINUE WHEN NULLIF(p->'bank_balances'->>v_k, '') IS NULL;
    CONTINUE WHEN v_k = 'old' AND v_old IS NULL;
    v_rec := record_reconciliation(
      CASE WHEN v_k = 'old' THEN v_old ELSE (v_acct->>v_k)::uuid END,
      v_date,
      (p->'bank_balances'->>v_k)::numeric,
      CASE WHEN v_k = 'operating' THEN COALESCE(NULLIF(p->>'cash_outside_bank', '')::numeric, 0) ELSE 0 END,
      v_note,
      true);
    v_recs := v_recs || jsonb_build_array(jsonb_build_object('account', v_k) || v_rec);
  END LOOP;

  UPDATE money_settings SET setup_completed_at = now() WHERE user_id = v_user;

  RETURN jsonb_build_object('setup_date', v_date, 'old_account_id', v_old, 'reconciliations', v_recs);
END; $$;
GRANT EXECUTE ON FUNCTION public.complete_money_setup(jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.tax_estimate_schedule(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_tracker(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_tax_payment(uuid, numeric, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_statement(uuid, date, date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reminders(uuid, date) TO authenticated;

-- ---------------------------------------------------------------------
-- 13. LOCK DOWN FUNCTION EXECUTION (new issue found during the 10 Oct migration rehearsal)
--     Every public function was executable by logged-out visitors through default privileges,
--     including SECURITY DEFINER internals. The app never calls an RPC before login, and trigger
--     functions do not need EXECUTE to fire.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_default_cash_account(uuid) FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
