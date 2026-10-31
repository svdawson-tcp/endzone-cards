-- 0006 card reader tests. Run against a database with 0006 applied:
--   psql -v ON_ERROR_STOP=1 -f drizzle/tests/0006_card_reader_tests.sql
-- Every test runs in its own transaction and rolls back. A failed assertion stops the run.
\set colton  '440df399-17c0-46c7-b5ff-d9f3a2d87858'
\set scott   '771eca1d-2b3a-4878-b8d9-eda457ef918e'

CREATE OR REPLACE FUNCTION pg_temp.act_as(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO PUBLIC;

\echo T1 cap: the third read of the day is refused when the cap is 2
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE a uuid; b uuid; c uuid; other uuid; ev uuid;
BEGIN
  a := claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 2);
  b := claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 2);
  c := claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 2);
  IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'T1 first two reads should be allowed'; END IF;
  IF c IS NOT NULL THEN RAISE EXCEPTION 'T1 third read should be refused'; END IF;
  other := claim_card_read('771eca1d-2b3a-4878-b8d9-eda457ef918e', 2);
  IF other IS NULL THEN RAISE EXCEPTION 'T1 another user has their own cap'; END IF;
  ev := claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 2, 'eval');
  IF ev IS NULL THEN RAISE EXCEPTION 'T1 eval reads are counted separately'; END IF;
END $$;
ROLLBACK;

\echo T2 cap: reads from yesterday do not count today
BEGIN;
INSERT INTO card_reads (user_id, created_at) SELECT :'colton', now() - interval '2 days' FROM generate_series(1, 5);
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 2) IS NULL THEN RAISE EXCEPTION 'T2 old reads must not count'; END IF;
END $$;
ROLLBACK;

\echo T3 the Edge Function role can record the result
BEGIN;
SET LOCAL ROLE service_role;
DO $$ DECLARE r uuid; BEGIN
  r := claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 200);
  UPDATE card_reads SET ok = true, model = 'claude-sonnet-5-5', input_tokens = 3200, output_tokens = 400,
    result = '{"player_name":{"value":"Jayden Daniels","sure":true}}' WHERE id = r;
  IF NOT FOUND THEN RAISE EXCEPTION 'T3 update failed'; END IF;
END $$;
ROLLBACK;

\echo T4 signed-in users cannot call claim_card_read
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ BEGIN
  PERFORM claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 999999);
  RAISE EXCEPTION 'T4 authenticated must not be able to claim';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
ROLLBACK;

\echo T5 anon cannot call claim_card_read or see the log
BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 999999);
  RAISE EXCEPTION 'T5 anon must not be able to claim';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM card_reads;
  RAISE EXCEPTION 'T5 anon must not read the log';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
ROLLBACK;

\echo T6 users see only their own reads and cannot write
BEGIN;
INSERT INTO card_reads (user_id) VALUES (:'colton'), (:'colton'), (:'scott');
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM card_reads;
  IF n <> 2 THEN RAISE EXCEPTION 'T6 Colton should see 2 rows, saw %', n; END IF;
  BEGIN
    INSERT INTO card_reads (user_id) VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858');
    RAISE EXCEPTION 'T6 insert must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE card_reads SET ok = true;
    RAISE EXCEPTION 'T6 update must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM card_reads;
    RAISE EXCEPTION 'T6 delete must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo T7 bad arguments are rejected
BEGIN;
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM claim_card_read(NULL, 5);
  RAISE EXCEPTION 'T7 null user must fail';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE 'claim_card_read%' THEN RAISE; END IF;
END $$;
DO $$ BEGIN
  PERFORM claim_card_read('440df399-17c0-46c7-b5ff-d9f3a2d87858', 2, 'other');
  RAISE EXCEPTION 'T7 unknown source must fail';
EXCEPTION WHEN check_violation THEN NULL;
END $$;
ROLLBACK;

\echo ALL 0006 TESTS PASSED
