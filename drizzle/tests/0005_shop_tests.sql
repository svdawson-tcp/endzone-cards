-- 0005 "Shop the Case" tests. Run against a database with 0005 applied:
--   psql -v ON_ERROR_STOP=1 -f drizzle/tests/0005_shop_tests.sql
-- Every test runs in its own transaction and rolls back. A failed assertion stops the run.
\set colton  '440df399-17c0-46c7-b5ff-d9f3a2d87858'
\set scott   '771eca1d-2b3a-4878-b8d9-eda457ef918e'

CREATE OR REPLACE FUNCTION pg_temp.act_as(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.act_as_anon() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid), pg_temp.act_as_anon() TO PUBLIC;

-- Test fixture: as the table owner, add one lot and five cards per user, rolled back after each test.
CREATE OR REPLACE FUNCTION pg_temp.fixture() RETURNS void LANGUAGE plpgsql AS $$
DECLARE l uuid; u uuid; base text := 'https://x.supabase.co/storage/v1/object/public/show_cards/';
BEGIN
  FOREACH u IN ARRAY ARRAY['440df399-17c0-46c7-b5ff-d9f3a2d87858','771eca1d-2b3a-4878-b8d9-eda457ef918e']::uuid[] LOOP
    INSERT INTO lots (id, user_id) VALUES (gen_random_uuid(), u) RETURNING id INTO l;
    INSERT INTO show_cards (user_id, lot_id, player_name, year, card_details, cost_basis, asking_price, status, photo_front_url, photo_back_url, sport, team, show_on_website) VALUES
      (u, l, 'Listed Front+Back', '2024', '{"brand":"Panini","set":"Prizm","card_number":"347","condition":"PSA 10"}', 40, 85, 'available', base||u||'/a_front.webp', base||u||'/a_back.webp', 'football', 'Commanders', true),
      (u, l, 'Listed Front only', '2023', '{"set":"Optic"}', 5, 18, 'available', base||u||'/b_front.webp', NULL, 'football', 'Rams', true),
      (u, l, 'Not switched on',   '2022', NULL, 3, 25, 'available', base||u||'/c_front.webp', NULL, 'baseball', 'Pirates', false),
      (u, l, 'Switched on, sold', '2021', NULL, 3, 25, 'sold',      base||u||'/d_front.webp', NULL, 'baseball', 'Yankees', true),
      (u, l, 'Cheap, off',        '2020', NULL, 1, 4,  'available', base||u||'/e_front.webp', NULL, NULL, NULL, false);
  END LOOP;
END $$;

\echo T1 the public sees only the owner switched-on unsold cards
BEGIN;
SELECT pg_temp.fixture();
SELECT pg_temp.act_as_anon();
DO $$
DECLARE n int; names text;
BEGIN
  SELECT count(*), string_agg(player_name, ', ' ORDER BY player_name) INTO n, names FROM get_shop_cards();
  RAISE NOTICE 'public sees % cards: %', n, names;
  IF n <> 2 OR names <> 'Listed Front only, Listed Front+Back' THEN RAISE EXCEPTION 'T1 FAIL'; END IF;
  RAISE NOTICE 'T1 PASS';
END $$;
ROLLBACK;

\echo T2 the public function returns no financial or internal columns
BEGIN;
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(a, ',' ORDER BY a) INTO cols
  FROM unnest((SELECT proargnames FROM pg_proc WHERE proname = 'get_shop_cards')) a;
  RAISE NOTICE 'columns: %', cols;
  IF cols ~ '(cost|lot|user|status|disposition|profit|revenue|floor|hold)' THEN RAISE EXCEPTION 'T2 FAIL exposes %', cols; END IF;
  -- 0007 added parallel, serial_number, rookie, autograph, accept_offers, min_offer (never the offer floor).
  IF cols <> 'accept_offers,autograph,brand,card_number,condition,id,listed_at,min_offer,parallel,photo_back_url,photo_front_url,player_name,price,rookie,serial_number,set_name,sport,team,year'
    THEN RAISE EXCEPTION 'T2 FAIL unexpected column list %', cols; END IF;
  RAISE NOTICE 'T2 PASS';
END $$;
ROLLBACK;

\echo T3 the public still cannot read any card, lot or settings row directly
BEGIN;
SELECT pg_temp.fixture();
SELECT pg_temp.act_as_anon();
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM show_cards;  IF n <> 0 THEN RAISE EXCEPTION 'T3 FAIL anon sees % show_cards', n; END IF;
  BEGIN
    PERFORM 1 FROM website_settings; RAISE EXCEPTION 'T3 FAIL anon can query website_settings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE show_cards SET show_on_website = true; GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'T3 FAIL anon updated % cards', n; END IF;
  END;
  RAISE NOTICE 'T3 PASS';
END $$;
ROLLBACK;

\echo T4 a card cannot be switched on under $10, without a front photo, sport or team
BEGIN;
SELECT pg_temp.fixture();
SELECT pg_temp.act_as(:'colton');
DO $$
DECLARE ok int := 0;
BEGIN
  BEGIN UPDATE show_cards SET show_on_website = true, sport = 'football', team = 'Bills' WHERE player_name = 'Cheap, off';
  EXCEPTION WHEN check_violation THEN ok := ok + 1; END;
  BEGIN UPDATE show_cards SET show_on_website = true, photo_front_url = NULL WHERE player_name = 'Not switched on';
  EXCEPTION WHEN check_violation THEN ok := ok + 1; END;
  BEGIN UPDATE show_cards SET show_on_website = true, team = NULL WHERE player_name = 'Not switched on';
  EXCEPTION WHEN check_violation THEN ok := ok + 1; END;
  BEGIN UPDATE show_cards SET show_on_website = true, sport = 'cricket' WHERE player_name = 'Not switched on';
  EXCEPTION WHEN check_violation THEN ok := ok + 1; END;
  IF ok <> 4 THEN RAISE EXCEPTION 'T4 FAIL only % of 4 blocked', ok; END IF;
  RAISE NOTICE 'T4 PASS';
END $$;
ROLLBACK;

\echo T5 Colton can switch a card on and off; marking it sold removes it from the site
BEGIN;
SELECT pg_temp.fixture();
SELECT pg_temp.act_as(:'colton');
UPDATE show_cards SET show_on_website = true WHERE player_name = 'Not switched on' AND user_id = :'colton';
DO $$
DECLARE t1 timestamptz; n int;
BEGIN
  SELECT website_listed_at INTO t1 FROM show_cards WHERE player_name = 'Not switched on' AND user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858';
  IF t1 IS NULL THEN RAISE EXCEPTION 'T5 FAIL listed_at not set'; END IF;
  SELECT count(*) INTO n FROM get_shop_cards(); IF n <> 3 THEN RAISE EXCEPTION 'T5 FAIL expected 3, got %', n; END IF;
  UPDATE show_cards SET asking_price = 30 WHERE player_name = 'Not switched on' AND user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858';
  IF (SELECT website_listed_at FROM show_cards WHERE player_name = 'Not switched on' AND user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858') <> t1
    THEN RAISE EXCEPTION 'T5 FAIL editing price reset listed_at'; END IF;
  UPDATE show_cards SET status = 'sold' WHERE player_name = 'Not switched on' AND user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858';
  SELECT count(*) INTO n FROM get_shop_cards(); IF n <> 2 THEN RAISE EXCEPTION 'T5 FAIL sold card still listed'; END IF;
  UPDATE show_cards SET show_on_website = false WHERE player_name = 'Listed Front only' AND user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858';
  SELECT count(*) INTO n FROM get_shop_cards(); IF n <> 1 THEN RAISE EXCEPTION 'T5 FAIL switch-off ignored'; END IF;
  IF (SELECT website_listed_at FROM show_cards WHERE player_name = 'Listed Front only' AND user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858') IS NOT NULL
    THEN RAISE EXCEPTION 'T5 FAIL listed_at not cleared'; END IF;
  RAISE NOTICE 'T5 PASS';
END $$;
ROLLBACK;

\echo T6 another user cannot switch on Colton cards
BEGIN;
SELECT pg_temp.fixture();
SELECT pg_temp.act_as(:'scott');
DO $$
DECLARE n int;
BEGIN
  UPDATE show_cards SET show_on_website = true WHERE user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'T6 FAIL scott updated % of coltons cards', n; END IF;
  RAISE NOTICE 'T6 PASS';
END $$;
ROLLBACK;

\echo T7 card photos can no longer be listed by the public or by other users
BEGIN;
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('show_cards', '440df399-17c0-46c7-b5ff-d9f3a2d87858/a_front.webp'),
  ('show_cards', '771eca1d-2b3a-4878-b8d9-eda457ef918e/z_front.webp');
SELECT pg_temp.act_as_anon();
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'show_cards';
  IF n <> 0 THEN RAISE EXCEPTION 'T7 FAIL anon lists % photos', n; END IF;
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'show_cards';
  IF n <> 1 THEN RAISE EXCEPTION 'T7 FAIL colton sees % photos (expected only his 1)', n; END IF;
  RAISE NOTICE 'T7 PASS';
END $$;
ROLLBACK;

\echo ALL 0005 TESTS PASSED
