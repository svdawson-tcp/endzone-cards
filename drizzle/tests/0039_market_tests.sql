-- 0039 market tracker tests. Run on a scratch database after 0039_replica_setup.sql and 0039_market_benchmark.sql:
--   psql -v ON_ERROR_STOP=1 -f drizzle/tests/0039_market_tests.sql
-- Dates are relative to the month the tests run in (the function looks back from today). Every test rolls back.
\set colton '440df399-17c0-46c7-b5ff-d9f3a2d87858'
\set scott  '771eca1d-2b3a-4878-b8d9-eda457ef918e'
\set other  'ee555162-724c-4327-ba21-180a5634ecb7'

CREATE OR REPLACE FUNCTION pg_temp.act_as(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'ok: %', label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check(boolean, text) TO PUBLIC;

\echo SETUP
BEGIN;
INSERT INTO mentor_access (mentor_user_id, mentee_user_id, access_level) VALUES (:'scott', :'colton', 'read_only');
-- business dates are stored as UTC midnight (same convention as the app)
INSERT INTO transactions (user_id, transaction_type, revenue, transaction_date, deleted) VALUES
  (:'colton', 'bulk_sale',      1000, '2025-10-15 00:00+00', false),
  (:'colton', 'show_card_sale', 2000, '2025-11-30 00:00+00', false),
  (:'colton', 'bulk_sale',      3000, '2025-12-01 00:00+00', false),
  (:'colton', 'bulk_sale',      4000, '2026-01-10 00:00+00', false),
  (:'colton', 'bulk_sale',       999, '2026-01-11 00:00+00', true),   -- deleted: ignored
  (:'colton', 'disposition',       0, '2026-03-01 00:00+00', false),  -- not a sale: ignored
  (:'colton', 'bulk_sale',       500, date_trunc('month', now() AT TIME ZONE 'America/New_York') + interval '1 day', false),
  (:'other',  'bulk_sale',     77777, '2025-11-05 00:00+00', false);
COMMIT;

\echo T1 window, months before the first sale, empty months
BEGIN;
SELECT pg_temp.act_as(:'colton');
SELECT pg_temp.check(count(*) = 18, '18 months returned') FROM get_market_comparison(:'colton');
SELECT pg_temp.check(max(month) = date_trunc('month', now() AT TIME ZONE 'America/New_York')::date, 'ends this month') FROM get_market_comparison(:'colton');
SELECT pg_temp.check(count(*) = 12, 'p_months = 12') FROM get_market_comparison(:'colton', 12);
SELECT pg_temp.check(count(*) = 36, 'p_months capped at 36') FROM get_market_comparison(:'colton', 500);
SELECT pg_temp.check(bool_and(sales IS NULL), 'no sales figure before the first sale') FROM get_market_comparison(:'colton') WHERE month < '2025-10-01';
SELECT pg_temp.check(sales = 0 AND sale_count = 0, 'Feb 2026: $0, not blank') FROM get_market_comparison(:'colton') WHERE month = '2026-02-01';
ROLLBACK;

\echo T2 base months and indexes
BEGIN;
SELECT pg_temp.act_as(:'colton');
SELECT pg_temp.check(array_agg(month ORDER BY month) = ARRAY['2025-11-01','2025-12-01','2026-01-01']::date[], 'base = Nov 2025-Jan 2026 (first sale month skipped)')
  FROM get_market_comparison(:'colton') WHERE is_base;
SELECT pg_temp.check(sales_index = 33.3 AND market_index = 93.1, 'Oct 2025 index 33.3 / 93.1') FROM get_market_comparison(:'colton') WHERE month = '2025-10-01';
SELECT pg_temp.check(sales_index = 133.3 AND sales = 4000, 'Jan 2026: deleted sale ignored, index 133.3') FROM get_market_comparison(:'colton') WHERE month = '2026-01-01';
SELECT pg_temp.check(market_index = 165.7 AND market_usd = 290000000, 'Jul 2026 market index 165.7') FROM get_market_comparison(:'colton') WHERE month = '2026-07-01';
SELECT pg_temp.check(market_usd IS NULL AND market_index IS NULL, 'Aug 2026: no market figure yet') FROM get_market_comparison(:'colton') WHERE month = '2026-08-01';
SELECT pg_temp.check(sales = 0, 'Mar 2026: disposition not counted') FROM get_market_comparison(:'colton') WHERE month = '2026-03-01';
ROLLBACK;

\echo T3 current month is partial and never a base month
BEGIN;
SELECT pg_temp.act_as(:'colton');
SELECT pg_temp.check(count(*) = 1 AND bool_and(is_partial) AND bool_and(sales = 500), 'only this month is partial')
  FROM get_market_comparison(:'colton') WHERE is_partial;
ROLLBACK;

\echo T4 mentor sees the same, another user sees none of the data
BEGIN;
SELECT pg_temp.act_as(:'scott');
SELECT pg_temp.check(sum(sales) = 10500, 'mentor: same total as Colton') FROM get_market_comparison(:'colton');
ROLLBACK;
BEGIN;
SELECT pg_temp.act_as(:'other');
SELECT pg_temp.check(bool_and(sales IS NULL), 'other user: no sales of Colton''s') FROM get_market_comparison(:'colton');
SELECT pg_temp.check(sum(sales) = 77777, 'other user: own sales only') FROM get_market_comparison(:'other');
ROLLBACK;

\echo T5 market table: readable when signed in, not writable; not visible logged out
BEGIN;
SELECT pg_temp.act_as(:'colton');
SELECT pg_temp.check(count(*) = 11, 'signed in: 11 seeded months readable') FROM market_benchmarks;
SAVEPOINT s;
DO $$ BEGIN
  INSERT INTO market_benchmarks (month, value_usd, source_url) VALUES ('2026-08-01', 1, 'x');
  RAISE EXCEPTION 'FAIL: insert allowed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: signed-in insert refused';
END $$;
DO $$ BEGIN
  UPDATE market_benchmarks SET value_usd = 1;
  RAISE EXCEPTION 'FAIL: update allowed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: signed-in update refused';
END $$;
ROLLBACK;
BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM count(*) FROM market_benchmarks;
  RAISE EXCEPTION 'FAIL: anon can read';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: anon cannot read the table';
END $$;
DO $$ BEGIN
  PERFORM * FROM get_market_comparison('440df399-17c0-46c7-b5ff-d9f3a2d87858');
  RAISE EXCEPTION 'FAIL: anon can run';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: anon cannot run get_market_comparison';
END $$;
ROLLBACK;

\echo T6 constraints and re-running the seed
BEGIN;
DO $$ BEGIN
  INSERT INTO market_benchmarks (month, value_usd, source_url) VALUES ('2026-08-15', 1, 'x');
  RAISE EXCEPTION 'FAIL: mid-month allowed';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: month must be the 1st';
END $$;
DO $$ BEGIN
  INSERT INTO market_benchmarks (month, value_usd, source_url) VALUES ('2026-08-01', 0, 'x');
  RAISE EXCEPTION 'FAIL: zero allowed';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: value must be positive';
END $$;
ROLLBACK;
\echo ALL TESTS PASSED
