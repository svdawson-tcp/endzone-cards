-- Round 4 replica tests. Run against a restored copy of production with 0004 applied:
--   psql -v ON_ERROR_STOP=1 -f drizzle/tests/round4_replica_tests.sql
-- Every test runs in its own transaction and rolls back. A failed assertion stops the run.
\set colton  '440df399-17c0-46c7-b5ff-d9f3a2d87858'
\set scott   '771eca1d-2b3a-4878-b8d9-eda457ef918e'
\set second  'ee555162-724c-4327-ba21-180a5634ecb7'

-- helper: act as a user (role authenticated + JWT sub)
CREATE OR REPLACE FUNCTION pg_temp.act_as(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO PUBLIC;

\echo T1 weekly owed matches an independent calculation (ISO weeks, 4% of gross with net fallback)
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE t jsonb := get_tax_tracker('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-10-10');
        v_ind numeric; v_tr numeric; v_bad int;
BEGIN
  -- independent: group by ISO year-week string, completed weeks only (before Mon 2026-10-05)
  SELECT COALESCE(SUM(owed),0) INTO v_ind FROM (
    SELECT ROUND(SUM(COALESCE(gross_amount, revenue)) * 0.04, 2) AS owed
    FROM transactions
    WHERE user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858' AND transaction_type IN ('show_card_sale','bulk_sale')
      AND deleted IS NOT TRUE
      AND (transaction_date AT TIME ZONE 'UTC')::date BETWEEN DATE '2026-01-01' AND DATE '2026-10-04'
    GROUP BY to_char((transaction_date AT TIME ZONE 'UTC')::date, 'IYYY-IW')) q;
  v_tr := (t->>'owed_due')::numeric;
  RAISE NOTICE 'tracker owed_due=% independent=% gross=% accruing=% weeks=%', v_tr, v_ind, t->>'gross_sales', t->>'accruing', jsonb_array_length(t->'weeks');
  IF v_tr <> v_ind THEN RAISE EXCEPTION 'T1 FAIL owed_due % <> %', v_tr, v_ind; END IF;
  -- every completed week's owed equals round(gross*0.04,2)
  SELECT count(*) INTO v_bad FROM jsonb_array_elements(t->'weeks') w
  WHERE (w->>'owed')::numeric <> ROUND((w->>'gross')::numeric * 0.04, 2);
  IF v_bad > 0 THEN RAISE EXCEPTION 'T1 FAIL % weeks mis-rounded', v_bad; END IF;
  IF (t->>'current_week')::date <> DATE '2026-10-05' THEN RAISE EXCEPTION 'T1 FAIL current week %', t->>'current_week'; END IF;
  IF (t->'weeks'->0->>'status') <> 'accruing' THEN RAISE EXCEPTION 'T1 FAIL newest week status'; END IF;
  RAISE NOTICE 'T1 PASS';
END $$;
ROLLBACK;

\echo T2 gross_amount is used when present, net otherwise
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE l uuid; t0 jsonb; t1 jsonb;
BEGIN
  SELECT id INTO l FROM lots WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  t0 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  INSERT INTO transactions (user_id, transaction_type, lot_id, quantity, revenue, gross_amount, transaction_date, sales_channel)
  VALUES (auth.uid(), 'bulk_sale', l, 1, 90.00, 100.00, DATE '2026-09-29', 'ebay');   -- week of Sep 28 (completed)
  INSERT INTO transactions (user_id, transaction_type, lot_id, quantity, revenue, transaction_date, sales_channel)
  VALUES (auth.uid(), 'bulk_sale', l, 1, 50.00, DATE '2026-09-30', 'facebook');      -- no gross: falls back to 50
  t1 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  -- the week's owed is round(week_gross*0.04,2); check gross moved by exactly 150
  IF (t1->>'gross_sales')::numeric - (t0->>'gross_sales')::numeric <> 150 THEN
    RAISE EXCEPTION 'T2 FAIL gross delta %', (t1->>'gross_sales')::numeric - (t0->>'gross_sales')::numeric; END IF;
  RAISE NOTICE 'T2 PASS (owed_due % -> %)', t0->>'owed_due', t1->>'owed_due';
END $$;
ROLLBACK;

\echo T3 backdated sale lands in its own week and is flagged late; soft-deleted sale drops out
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE l uuid; tx uuid; t0 jsonb; t1 jsonb; t2 jsonb; w jsonb;
BEGIN
  SELECT id INTO l FROM lots WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
  t0 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  INSERT INTO transactions (user_id, transaction_type, lot_id, quantity, revenue, transaction_date, sales_channel)
  VALUES (auth.uid(), 'bulk_sale', l, 1, 250.00, DATE '2026-08-04', 'card_show') RETURNING id INTO tx;
  t1 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  SELECT x INTO w FROM jsonb_array_elements(t1->'weeks') x WHERE x->>'week_start' = '2026-08-03';
  IF NOT (w->>'late_entries')::boolean THEN RAISE EXCEPTION 'T3 FAIL not flagged late'; END IF;
  IF (t1->>'owed_due')::numeric - (t0->>'owed_due')::numeric NOT BETWEEN 9.99 AND 10.01 THEN
    RAISE EXCEPTION 'T3 FAIL owed delta %', (t1->>'owed_due')::numeric - (t0->>'owed_due')::numeric; END IF;
  PERFORM soft_delete_sale(tx, 'Test deletion for replica');
  t2 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  IF (t2->>'owed_due')::numeric <> (t0->>'owed_due')::numeric THEN RAISE EXCEPTION 'T3 FAIL deleted sale still counted'; END IF;
  RAISE NOTICE 'T3 PASS';
END $$;
ROLLBACK;

\echo T4 a transfer into Tax counts as a deposit and leaves total cash unchanged
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE op uuid; tax uuid; t0 jsonb; t1 jsonb; c0 numeric; c1 numeric;
BEGIN
  SELECT id INTO op  FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  SELECT SUM(amount) INTO c0 FROM cash_transactions WHERE user_id = auth.uid();
  t0 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  PERFORM record_account_transfer(op, tax, 2500.00, DATE '2026-10-09', 'Catch-up for 2026 sales');
  t1 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  SELECT SUM(amount) INTO c1 FROM cash_transactions WHERE user_id = auth.uid();
  IF c0 <> c1 THEN RAISE EXCEPTION 'T4 FAIL total cash % -> %', c0, c1; END IF;
  IF (t1->>'deposited')::numeric - (t0->>'deposited')::numeric <> 2500 THEN RAISE EXCEPTION 'T4 FAIL deposit not counted'; END IF;
  IF (t1->>'tax_account_balance')::numeric <> (t0->>'tax_account_balance')::numeric + 2500 THEN RAISE EXCEPTION 'T4 FAIL tax balance'; END IF;
  RAISE NOTICE 'T4 PASS: 2026 owed through last week = %, after $2,500 catch-up position = % (positive = surplus)',
    t1->>'owed_due', t1->>'position';
END $$;
ROLLBACK;

\echo T5 tax payment reduces the Tax balance but not the set-aside position; validations hold
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE op uuid; tax uuid; t0 jsonb; t1 jsonb; ok boolean;
BEGIN
  SELECT id INTO op  FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  PERFORM record_account_transfer(op, tax, 1000.00, DATE '2026-10-09', 'deposit');
  t0 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  PERFORM record_tax_payment(tax, 400.00, DATE '2026-10-09', 'irs', '2026-Q4', 'test');
  t1 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  IF (t1->>'position') <> (t0->>'position') THEN RAISE EXCEPTION 'T5 FAIL payment changed position'; END IF;
  IF (t1->>'tax_account_balance')::numeric <> (t0->>'tax_account_balance')::numeric - 400 THEN RAISE EXCEPTION 'T5 FAIL balance'; END IF;
  IF (t1->>'paid_total')::numeric <> 400 THEN RAISE EXCEPTION 'T5 FAIL paid_total'; END IF;
  ok := false; BEGIN PERFORM record_tax_payment(op, 10, DATE '2026-10-09', 'irs', '2026-Q4'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T5 FAIL payment allowed from Operating'; END IF;
  ok := false; BEGIN PERFORM record_tax_payment(tax, 10, CURRENT_DATE + 30, 'irs', '2026-Q4'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T5 FAIL future-dated payment allowed'; END IF;
  ok := false; BEGIN PERFORM record_tax_payment(tax, 10, DATE '2026-10-09', 'irs', 'Q4'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T5 FAIL bad period allowed'; END IF;
  ok := false; BEGIN
    INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date) VALUES (auth.uid(), tax, 'tax_payment', -5, DATE '2026-10-09');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T5 FAIL tax_payment without authority/period allowed'; END IF;
  RAISE NOTICE 'T5 PASS';
END $$;
ROLLBACK;

\echo T6 interest raises the Tax balance but is not a deposit
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE tax uuid; t0 jsonb; t1 jsonb; ok boolean := false;
BEGIN
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  t0 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, notes)
  VALUES (auth.uid(), tax, 'interest', 1.37, DATE '2026-10-01', 'Sept interest');
  t1 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  IF (t1->>'deposited') <> (t0->>'deposited') THEN RAISE EXCEPTION 'T6 FAIL interest counted as deposit'; END IF;
  IF (t1->>'interest_total')::numeric <> 1.37 THEN RAISE EXCEPTION 'T6 FAIL interest_total'; END IF;
  BEGIN INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date) VALUES (auth.uid(), tax, 'interest', -1, DATE '2026-10-01');
  EXCEPTION WHEN check_violation THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T6 FAIL negative interest allowed'; END IF;
  RAISE NOTICE 'T6 PASS';
END $$;
ROLLBACK;

\echo T7 reconciliation: server-computed balance, adjustment needs a note, direct writes blocked
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE op uuid; r jsonb; app numeric; ok boolean; n int;
BEGIN
  SELECT id INTO op FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  SELECT SUM(amount) INTO app FROM cash_transactions WHERE account_id = op AND entry_date <= DATE '2026-10-09';
  r := record_reconciliation(op, DATE '2026-10-09', app - 120.00, 100.00, NULL, false);      -- $20 unexplained
  IF (r->>'app_balance')::numeric <> app OR (r->>'difference')::numeric <> 20 OR (r->>'matched')::boolean THEN
    RAISE EXCEPTION 'T7 FAIL mismatch result %', r; END IF;
  ok := false; BEGIN PERFORM record_reconciliation(op, DATE '2026-10-09', app - 120.00, 100.00, 'short', true);
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T7 FAIL adjustment posted without a proper note'; END IF;
  r := record_reconciliation(op, DATE '2026-10-09', app - 120.00, 100.00, 'Monthly bank fee and card fee', true);
  IF NOT (r->>'matched')::boolean OR r->>'adjustment_id' IS NULL THEN RAISE EXCEPTION 'T7 FAIL adjustment %', r; END IF;
  SELECT SUM(amount) INTO app FROM cash_transactions WHERE account_id = op AND entry_date <= DATE '2026-10-09';
  r := record_reconciliation(op, DATE '2026-10-09', app - 100.00, 100.00);
  IF (r->>'difference')::numeric <> 0 THEN RAISE EXCEPTION 'T7 FAIL after adjustment difference %', r->>'difference'; END IF;
  ok := false; BEGIN
    INSERT INTO account_reconciliations (user_id, account_id, as_of, bank_balance, app_balance) VALUES (auth.uid(), op, DATE '2026-10-09', 1, 1);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T7 FAIL direct insert allowed'; END IF;
  SELECT count(*) INTO n FROM account_reconciliations WHERE account_id = op;
  IF n <> 3 THEN RAISE EXCEPTION 'T7 FAIL expected 3 reconciliations, got %', n; END IF;
  RAISE NOTICE 'T7 PASS';
END $$;
ROLLBACK;

\echo T8 mentor (Scott) can read Colton tracker, statement and reminders but cannot write to his accounts
BEGIN;
SELECT pg_temp.act_as(:'scott');
DO $$
DECLARE t jsonb; s jsonb; rm jsonb; ctax uuid; cop uuid; ok boolean;
BEGIN
  SELECT id INTO ctax FROM cash_accounts WHERE user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858' AND kind = 'tax';
  SELECT id INTO cop  FROM cash_accounts WHERE user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858' AND kind = 'operating';
  IF ctax IS NULL THEN RAISE EXCEPTION 'T8 FAIL mentor cannot see accounts'; END IF;
  t := get_tax_tracker('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-10-10');
  IF (t->>'gross_sales')::numeric = 0 THEN RAISE EXCEPTION 'T8 FAIL mentor sees no sales'; END IF;
  s := get_account_statement(cop, NULL, DATE '2026-10-10', 5);
  IF (s->>'closing')::numeric <> 7819.91 THEN RAISE EXCEPTION 'T8 FAIL statement closing %', s->>'closing'; END IF;
  rm := get_reminders('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-10-10');
  ok := false; BEGIN PERFORM record_tax_payment(ctax, 10, DATE '2026-10-09', 'irs', '2026-Q4'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T8 FAIL mentor recorded a tax payment on Colton''s account'; END IF;
  ok := false; BEGIN PERFORM record_reconciliation(cop, DATE '2026-10-09', 1); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T8 FAIL mentor reconciled Colton''s account'; END IF;
  ok := false; BEGIN PERFORM record_account_transfer(cop, ctax, 1, DATE '2026-10-09'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T8 FAIL mentor transferred Colton''s money'; END IF;
  RAISE NOTICE 'T8 PASS (statement closing %, reminders %)', s->>'closing', jsonb_array_length(rm);
END $$;
ROLLBACK;

\echo T9 an unrelated user sees nothing of Colton
BEGIN;
SELECT pg_temp.act_as(:'second');
DO $$
DECLARE t jsonb; cop uuid; ok boolean := false;
BEGIN
  t := get_tax_tracker('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-10-10');
  IF (t->>'gross_sales')::numeric <> 0 OR (t->>'deposited')::numeric <> 0 THEN RAISE EXCEPTION 'T9 FAIL leak %', t->>'gross_sales'; END IF;
  SELECT id INTO cop FROM cash_accounts WHERE user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858' LIMIT 1;
  IF cop IS NOT NULL THEN RAISE EXCEPTION 'T9 FAIL can see accounts'; END IF;
  BEGIN PERFORM get_account_statement('00000000-0000-0000-0000-000000000000'); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T9 FAIL statement for unknown account'; END IF;
  RAISE NOTICE 'T9 PASS';
END $$;
ROLLBACK;

\echo T10 logged-out visitors cannot call functions; triggers still fire for signed-in users
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE ok boolean;
BEGIN
  ok := false; BEGIN PERFORM get_tax_tracker('440df399-17c0-46c7-b5ff-d9f3a2d87858'); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T10 FAIL anon ran get_tax_tracker'; END IF;
  ok := false; BEGIN PERFORM ensure_default_cash_account('440df399-17c0-46c7-b5ff-d9f3a2d87858'); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T10 FAIL anon ran ensure_default_cash_account'; END IF;
  ok := false; BEGIN PERFORM record_reconciliation('00000000-0000-0000-0000-000000000000', CURRENT_DATE, 0); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T10 FAIL anon ran record_reconciliation'; END IF;
  RAISE NOTICE 'T10a PASS';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE ok boolean := false;
BEGIN
  BEGIN PERFORM ensure_default_cash_account(auth.uid()); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T10 FAIL signed-in user can call ensure_default_cash_account directly'; END IF;
  RAISE NOTICE 'T10b PASS';
END $$;
ROLLBACK;

\echo T11 lot purchases land in the chosen account; moving the lot moves the cash; foreign accounts rejected
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE trav uuid; op uuid; foreign_acct uuid; l uuid; a uuid; ok boolean := false;
BEGIN
  SELECT id INTO trav FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'travel';
  SELECT id INTO op   FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  INSERT INTO lots (user_id, purchase_date, source, total_cost, account_id) VALUES (auth.uid(), DATE '2026-10-09', 'Test', 40.00, trav) RETURNING id INTO l;
  SELECT account_id INTO a FROM cash_transactions WHERE related_lot_id = l AND transaction_type = 'auto_purchase';
  IF a <> trav THEN RAISE EXCEPTION 'T11 FAIL purchase landed in %', a; END IF;
  UPDATE lots SET account_id = NULL WHERE id = l;
  SELECT account_id INTO a FROM cash_transactions WHERE related_lot_id = l AND transaction_type = 'auto_purchase';
  IF a <> op THEN RAISE EXCEPTION 'T11 FAIL clearing account did not return cash to default'; END IF;
  INSERT INTO lots (user_id, purchase_date, source, total_cost) VALUES (auth.uid(), DATE '2026-10-09', 'Test2', 10.00) RETURNING id INTO l;
  SELECT account_id INTO a FROM cash_transactions WHERE related_lot_id = l;
  IF a <> op THEN RAISE EXCEPTION 'T11 FAIL default account not used'; END IF;
  RESET ROLE;
  SELECT id INTO foreign_acct FROM cash_accounts WHERE user_id = '771eca1d-2b3a-4878-b8d9-eda457ef918e' AND kind = 'travel';
  PERFORM pg_temp.act_as('440df399-17c0-46c7-b5ff-d9f3a2d87858');
  BEGIN INSERT INTO lots (user_id, purchase_date, source, total_cost, account_id) VALUES (auth.uid(), DATE '2026-10-09', 'X', 5, foreign_acct);
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T11 FAIL lot paid from another user''s account'; END IF;
  RAISE NOTICE 'T11 PASS';
END $$;
ROLLBACK;

\echo T12 estimated-tax schedule and weekend roll
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM tax_estimate_schedule(DATE '2027-01-01', DATE '2027-12-31');
  IF n <> 4 THEN RAISE EXCEPTION 'T12 FAIL 2027 has % due dates', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM tax_estimate_schedule(DATE '2027-01-01', DATE '2027-01-31') WHERE due_date = DATE '2027-01-15' AND tax_period = '2026-Q4')
    THEN RAISE EXCEPTION 'T12 FAIL Jan 15 2027 / 2026-Q4'; END IF;
  -- 2028-04-15 is a Saturday -> Monday 2028-04-17
  IF NOT EXISTS (SELECT 1 FROM tax_estimate_schedule(DATE '2028-04-01', DATE '2028-04-30') WHERE due_date = DATE '2028-04-17' AND tax_period = '2028-Q1')
    THEN RAISE EXCEPTION 'T12 FAIL weekend roll'; END IF;
  RAISE NOTICE 'T12 PASS';
END $$;

\echo T13 reminders: setup, weekly transfer, estimated payment window, reconciliation, dismiss and snooze
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE r jsonb; keys text; tax uuid; op uuid;
BEGIN
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  SELECT id INTO op  FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  r := get_reminders(auth.uid(), DATE '2026-10-12');
  SELECT string_agg(x->>'key', ',') INTO keys FROM jsonb_array_elements(r) x;
  IF keys NOT LIKE '%money_setup%' OR keys NOT LIKE '%tax_transfer%' THEN RAISE EXCEPTION 'T13 FAIL before setup: %', keys; END IF;
  IF keys LIKE '%estimated_tax%' THEN RAISE EXCEPTION 'T13 FAIL estimate shown in October 2026'; END IF;
  INSERT INTO money_settings (user_id, setup_completed_at) VALUES (auth.uid(), TIMESTAMPTZ '2026-10-12 20:00-04');
  PERFORM record_account_transfer(op, tax, 5000.00, DATE '2026-10-09', 'fund tax');
  r := get_reminders(auth.uid(), DATE '2026-10-12');
  SELECT string_agg(x->>'key', ',') INTO keys FROM jsonb_array_elements(r) x;
  IF keys IS NOT NULL AND (keys LIKE '%money_setup%' OR keys LIKE '%tax_transfer%') THEN RAISE EXCEPTION 'T13 FAIL after setup + funding: %', keys; END IF;
  -- reminders cannot be computed for a future "today" because transfers can't be future-dated; use p_today
  r := get_reminders(auth.uid(), DATE '2027-01-09');
  SELECT string_agg(x->>'key' || ':' || (x->>'period'), ',') INTO keys FROM jsonb_array_elements(r) x;
  IF keys NOT LIKE '%estimated_tax:2026-Q4%' THEN RAISE EXCEPTION 'T13 FAIL Jan 2027 estimate missing: %', keys; END IF;
  IF keys NOT LIKE '%year_end:2027%' THEN RAISE EXCEPTION 'T13 FAIL year-end missing: %', keys; END IF;
  IF keys NOT LIKE '%reconcile:%' THEN RAISE EXCEPTION 'T13 FAIL monthly reconciliation missing: %', keys; END IF;
  INSERT INTO reminders_state (user_id, reminder_key, period_key, dismissed_at) VALUES (auth.uid(), 'year_end', '2027', now());
  INSERT INTO reminders_state (user_id, reminder_key, period_key, snoozed_until) VALUES (auth.uid(), 'estimated_tax', '2026-Q4', DATE '2027-01-12');
  r := get_reminders(auth.uid(), DATE '2027-01-09');
  SELECT string_agg(x->>'key', ',') INTO keys FROM jsonb_array_elements(r) x;
  IF keys LIKE '%year_end%' OR keys LIKE '%estimated_tax%' THEN RAISE EXCEPTION 'T13 FAIL dismiss/snooze ignored: %', keys; END IF;
  r := get_reminders(auth.uid(), DATE '2027-01-13');
  SELECT string_agg(x->>'key', ',') INTO keys FROM jsonb_array_elements(r) x;
  IF keys NOT LIKE '%estimated_tax%' THEN RAISE EXCEPTION 'T13 FAIL snooze did not expire'; END IF;
  RAISE NOTICE 'T13 PASS';
END $$;
ROLLBACK;

\echo T14 statement arithmetic: opening + rows = closing; transfer pair nets to zero across accounts
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE op uuid; s jsonb; total numeric;
BEGIN
  SELECT id INTO op FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  s := get_account_statement(op, DATE '2026-09-01', DATE '2026-10-10', 1000);
  IF (s->>'opening')::numeric + (s->>'money_in')::numeric - (s->>'money_out')::numeric <> (s->>'closing')::numeric THEN
    RAISE EXCEPTION 'T14 FAIL statement does not add up %', s - 'rows'; END IF;
  IF (s->>'closing')::numeric <> 7819.91 THEN RAISE EXCEPTION 'T14 FAIL closing %', s->>'closing'; END IF;
  IF (s->'rows'->0->>'running_balance')::numeric <> 7819.91 THEN RAISE EXCEPTION 'T14 FAIL newest running balance'; END IF;
  SELECT SUM((v)::numeric) INTO total FROM jsonb_each_text(s->'by_kind') AS e(k, v);
  IF total <> (s->>'money_in')::numeric - (s->>'money_out')::numeric THEN RAISE EXCEPTION 'T14 FAIL by_kind total'; END IF;
  RAISE NOTICE 'T14 PASS (Sept 1 opening %, in %, out %, closing %)', s->>'opening', s->>'money_in', s->>'money_out', s->>'closing';
END $$;
ROLLBACK;

\echo T15 first-use setup: one call funds, splits and reconciles all accounts; refuses a second run
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE r jsonb; ok boolean := false; op_bank numeric; bal record; total_before numeric; total_after numeric; n int;
BEGIN
  SELECT SUM(amount) INTO total_before FROM cash_transactions WHERE user_id = auth.uid();
  -- Operating's app balance on 10 Oct is 7819.91 of old business cash. Real-world story:
  --   Scott's $7,500 into Operating and $2,500 into Travel; $2,500 old cash to Tax; $3,900 old cash to Reserve;
  --   old M&T savings still holds $419.91; Colton carries $150 of show cash.
  -- Operating bank = 7819.91 + 7500 - 2500 - 3900 - 419.91 - 150 cash - 12.00 fees we don't know about = 8338.00
  r := complete_money_setup(jsonb_build_object(
    'setup_date', '2026-10-10',
    'old_account', jsonb_build_object('status', 'open', 'balance', '419.91'),
    'opening', jsonb_build_array(
      jsonb_build_object('type','contribution','account','operating','amount','7500.00','date','2026-10-09','note','Gift from Scott'),
      jsonb_build_object('type','contribution','account','travel','amount','2500.00','date','2026-10-09','note','Gift from Scott'),
      jsonb_build_object('type','transfer','account','tax','amount','2500.00','date','2026-10-09'),
      jsonb_build_object('type','transfer','account','reserve','amount','3900.00','date','2026-10-09')),
    'cash_outside_bank', '150.00',
    'bank_balances', jsonb_build_object('operating','8338.00','travel','2500.00','tax','2500.00','reserve','3900.00','old','419.91'),
    'round_up_transfers', false,
    'note', 'Opening setup, small bank fees not yet entered'));
  SELECT count(*) INTO n FROM jsonb_array_elements(r->'reconciliations');
  IF n <> 5 THEN RAISE EXCEPTION 'T15 FAIL expected 5 reconciliations, got % (%)', n, r; END IF;
  -- Operating should have needed exactly one -12.00 adjustment; others matched
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'reconciliations') x
                 WHERE x->>'account' = 'operating' AND (x->>'difference')::numeric = 12.00 AND x->>'adjustment_id' IS NOT NULL) THEN
    RAISE EXCEPTION 'T15 FAIL operating difference %', r->'reconciliations'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r->'reconciliations') x
             WHERE x->>'account' <> 'operating' AND (x->>'difference')::numeric <> 0) THEN
    RAISE EXCEPTION 'T15 FAIL unexpected difference %', r->'reconciliations'; END IF;
  -- balances now equal the bank (Operating = bank + cash outside the bank)
  FOR bal IN SELECT a.name, a.kind, COALESCE(SUM(c.amount),0) AS b FROM cash_accounts a LEFT JOIN cash_transactions c ON c.account_id = a.id
             WHERE a.user_id = auth.uid() AND NOT a.archived GROUP BY a.name, a.kind LOOP
    IF (bal.kind = 'operating' AND bal.b <> 8488.00) OR (bal.kind = 'travel' AND bal.b <> 2500)
       OR (bal.kind = 'tax' AND bal.b <> 2500) OR (bal.kind = 'reserve' AND bal.b <> 3900)
       OR (bal.kind = 'other' AND bal.b <> 419.91) THEN
      RAISE EXCEPTION 'T15 FAIL % balance %', bal.name, bal.b; END IF;
  END LOOP;
  -- total cash moved only by the two contributions (10,000) and the -12.00 adjustment
  SELECT SUM(amount) INTO total_after FROM cash_transactions WHERE user_id = auth.uid();
  IF total_after - total_before <> 9988.00 THEN RAISE EXCEPTION 'T15 FAIL total delta %', total_after - total_before; END IF;
  IF (SELECT round_up_transfers FROM money_settings WHERE user_id = auth.uid()) THEN RAISE EXCEPTION 'T15 FAIL rounding pref'; END IF;
  BEGIN PERFORM complete_money_setup('{}'::jsonb); EXCEPTION WHEN OTHERS THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'T15 FAIL second setup allowed'; END IF;
  -- tracker now sees the $2,500 catch-up
  IF (get_tax_tracker(auth.uid(), DATE '2026-10-10')->>'position')::numeric <> 367.05 THEN
    RAISE EXCEPTION 'T15 FAIL tracker position %', get_tax_tracker(auth.uid(), DATE '2026-10-10')->>'position'; END IF;
  RAISE NOTICE 'T15 PASS (Operating 8488.00 incl. $150 cash, Travel 2500, Tax 2500, Reserve 3900, Old M&T 419.91; one $12 adjustment)';
END $$;
ROLLBACK;

\echo T16 money moved back out of Tax reduces the set-aside position
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE op uuid; tax uuid; t0 jsonb; t1 jsonb;
BEGIN
  SELECT id INTO op  FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  t0 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  PERFORM record_account_transfer(op, tax, 2500.00, DATE '2026-10-05', 'set aside');
  PERFORM record_account_transfer(tax, op, 2000.00, DATE '2026-10-06', 'borrowed back');
  t1 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  IF (t1->>'deposited')::numeric - (t0->>'deposited')::numeric <> 500 THEN
    RAISE EXCEPTION 'T16 FAIL deposited delta %', (t1->>'deposited')::numeric - (t0->>'deposited')::numeric; END IF;
  IF (t1->>'position')::numeric - (t0->>'position')::numeric <> 500 THEN RAISE EXCEPTION 'T16 FAIL position'; END IF;
  RAISE NOTICE 'T16 PASS (position % after $2,500 in and $2,000 back out)', t1->>'position';
END $$;
ROLLBACK;

\echo T17 a Monday transfer for the week just finished marks every completed week covered
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE op uuid; tax uuid; t jsonb; owed numeric; n_open int;
BEGIN
  SELECT id INTO op  FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  t := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  owed := -(t->>'position')::numeric;
  PERFORM record_account_transfer(op, tax, owed, DATE '2026-10-05', 'Weekly tax set-aside');  -- Monday of the current week
  t := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  IF (t->>'position')::numeric <> 0 THEN RAISE EXCEPTION 'T17 FAIL position %', t->>'position'; END IF;
  SELECT count(*) INTO n_open FROM jsonb_array_elements(t->'weeks') w WHERE w->>'status' IN ('open','partial');
  IF n_open > 0 THEN RAISE EXCEPTION 'T17 FAIL % completed weeks still open', n_open; END IF;
  RAISE NOTICE 'T17 PASS (exact transfer of % covers all weeks)', owed;
END $$;
ROLLBACK;

\echo T18 an estimated quarter needs both the IRS and the PA payment
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE tax uuid; r jsonb; body text; ok boolean := false;
BEGIN
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, tax_authority, tax_period)
  VALUES (auth.uid(), tax, 'tax_payment', -300.00, CURRENT_DATE, 'irs', '2026-Q4');
  r := get_reminders(auth.uid(), DATE '2027-01-09');
  SELECT x->>'body' INTO body FROM jsonb_array_elements(r) x WHERE x->>'key' = 'estimated_tax' AND x->>'period' = '2026-Q4';
  IF body IS NULL OR body NOT LIKE 'Federal payment recorded%' THEN RAISE EXCEPTION 'T18 FAIL IRS-only reminder: %', body; END IF;
  IF get_tax_tracker(auth.uid(), DATE '2027-01-09')->>'next_estimate_period' <> '2026-Q4' THEN RAISE EXCEPTION 'T18 FAIL next period moved on'; END IF;
  INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, tax_authority, tax_period)
  VALUES (auth.uid(), tax, 'tax_payment', -100.00, CURRENT_DATE, 'pa', '2026-Q4');
  r := get_reminders(auth.uid(), DATE '2027-01-09');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r) x WHERE x->>'key' = 'estimated_tax' AND x->>'period' = '2026-Q4') THEN
    RAISE EXCEPTION 'T18 FAIL reminder still shown after both payments'; END IF;
  BEGIN PERFORM record_tax_payment(tax, 10.00, CURRENT_DATE, NULL, '2026-Q4');
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'Choose who the payment went to'; END;
  IF NOT ok THEN RAISE EXCEPTION 'T18 FAIL missing authority message'; END IF;
  RAISE NOTICE 'T18 PASS';
END $$;
ROLLBACK;

\echo T19 functions added by later migrations are not executable by logged-out visitors
BEGIN;
CREATE FUNCTION public.zz_probe() RETURNS int LANGUAGE sql AS 'SELECT 1';
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.zz_probe()', 'EXECUTE') THEN RAISE EXCEPTION 'T19 FAIL anon can run new functions'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.zz_probe()', 'EXECUTE') THEN RAISE NOTICE 'T19 note: new functions need an explicit GRANT to authenticated'; END IF;
  RAISE NOTICE 'T19 PASS';
END $$;
ROLLBACK;

\echo T20 logged-out table reads return no rows instead of an error
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM cash_transactions;
  IF n <> 0 THEN RAISE EXCEPTION 'T20 FAIL anon saw % rows', n; END IF;
  SELECT count(*) INTO n FROM transactions;
  IF n <> 0 THEN RAISE EXCEPTION 'T20 FAIL anon saw % sales', n; END IF;
  RAISE NOTICE 'T20 PASS';
END $$;
ROLLBACK;

\echo T21 a bank-check adjustment on Tax does not change what Colton owes the Tax account
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE tax uuid; op uuid; t0 jsonb; t1 jsonb; bal numeric;
BEGIN
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  SELECT id INTO op  FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'operating';
  PERFORM record_account_transfer(op, tax, 1000.00, DATE '2026-10-05', 'set aside');
  t0 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  SELECT COALESCE(SUM(amount),0) INTO bal FROM cash_transactions WHERE account_id = tax;
  PERFORM record_reconciliation(tax, DATE '2026-10-09', bal - 100, 0, 'IRS payment not recorded yet', true);
  t1 := get_tax_tracker(auth.uid(), DATE '2026-10-10');
  IF (t1->>'position')::numeric <> (t0->>'position')::numeric THEN RAISE EXCEPTION 'T21 FAIL position % -> %', t0->>'position', t1->>'position'; END IF;
  IF (t1->>'tax_account_balance')::numeric <> (t0->>'tax_account_balance')::numeric - 100 THEN RAISE EXCEPTION 'T21 FAIL balance not adjusted'; END IF;
  RAISE NOTICE 'T21 PASS';
END $$;
ROLLBACK;

\echo T22 marking an estimated quarter done clears it when no PA payment was due
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE tax uuid; r jsonb;
BEGIN
  SELECT id INTO tax FROM cash_accounts WHERE user_id = auth.uid() AND kind = 'tax';
  INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, entry_date, tax_authority, tax_period)
  VALUES (auth.uid(), tax, 'tax_payment', -300.00, CURRENT_DATE, 'irs', '2026-Q4');
  INSERT INTO reminders_state (user_id, reminder_key, period_key, dismissed_at) VALUES (auth.uid(), 'estimated_tax', '2026-Q4', now());
  IF NOT tax_quarter_paid(auth.uid(), '2026-Q4') THEN RAISE EXCEPTION 'T22 FAIL quarter not done'; END IF;
  IF get_tax_tracker(auth.uid(), DATE '2027-01-09')->>'next_estimate_period' <> '2027-Q1' THEN
    RAISE EXCEPTION 'T22 FAIL next period %', get_tax_tracker(auth.uid(), DATE '2027-01-09')->>'next_estimate_period'; END IF;
  r := get_reminders(auth.uid(), DATE '2027-01-09');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(r) x WHERE x->>'key' = 'estimated_tax') THEN RAISE EXCEPTION 'T22 FAIL reminder still shown'; END IF;
  RAISE NOTICE 'T22 PASS';
END $$;
ROLLBACK;

\echo ALL TESTS PASSED
