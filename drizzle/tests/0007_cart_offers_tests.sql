-- 0007 cart and offers tests. Run against a database with 0007 applied:
--   psql -v ON_ERROR_STOP=1 -f drizzle/tests/0007_cart_offers_tests.sql
-- Every test runs in its own transaction and rolls back. A failed assertion stops the run.
\set colton  '440df399-17c0-46c7-b5ff-d9f3a2d87858'
\set scott   '771eca1d-2b3a-4878-b8d9-eda457ef918e'

CREATE OR REPLACE FUNCTION pg_temp.act_as(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO PUBLIC;

-- Fixture: Colton's cards A..E (A,B,C listed; D sold; E not listed) and one listed card of Scott's.
CREATE OR REPLACE FUNCTION pg_temp.fixture() RETURNS void LANGUAGE plpgsql AS $$
DECLARE l uuid; base text := 'https://x.supabase.co/storage/v1/object/public/show_cards/';
BEGIN
  INSERT INTO lots (id, user_id) VALUES (gen_random_uuid(), '440df399-17c0-46c7-b5ff-d9f3a2d87858') RETURNING id INTO l;
  INSERT INTO show_cards (id, user_id, lot_id, player_name, year, card_details, asking_price, status, photo_front_url, sport, team, show_on_website, accept_offers, offer_floor) VALUES
    ('a0000000-0000-0000-0000-00000000000a', '440df399-17c0-46c7-b5ff-d9f3a2d87858', l, 'Card A', '2024', '{"set":"Prizm","rookie":true}', 85, 'available', base||'c/a.webp', 'football', 'Commanders', true, true, 72),
    ('a0000000-0000-0000-0000-00000000000b', '440df399-17c0-46c7-b5ff-d9f3a2d87858', l, 'Card B', '2025', NULL, 40, 'available', base||'c/b.webp', 'basketball', 'Fever', true, false, NULL),
    ('a0000000-0000-0000-0000-00000000000c', '440df399-17c0-46c7-b5ff-d9f3a2d87858', l, 'Card C', '2024', NULL, 20, 'available', base||'c/c.webp', 'football', 'Broncos', true, true, NULL),
    ('a0000000-0000-0000-0000-00000000000d', '440df399-17c0-46c7-b5ff-d9f3a2d87858', l, 'Card D', '2018', NULL, 45, 'sold', base||'c/d.webp', 'basketball', 'Mavericks', true, false, NULL),
    ('a0000000-0000-0000-0000-00000000000e', '440df399-17c0-46c7-b5ff-d9f3a2d87858', l, 'Card E', '2020', NULL, 30, 'available', base||'c/e.webp', NULL, NULL, false, false, NULL);
  INSERT INTO lots (id, user_id) VALUES (gen_random_uuid(), '771eca1d-2b3a-4878-b8d9-eda457ef918e') RETURNING id INTO l;
  INSERT INTO show_cards (id, user_id, lot_id, player_name, asking_price, status, photo_front_url, sport, team, show_on_website) VALUES
    ('b0000000-0000-0000-0000-00000000000f', '771eca1d-2b3a-4878-b8d9-eda457ef918e', l, 'Scott card', 50, 'available', base||'s/f.webp', 'football', 'Rams', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.fixture() TO PUBLIC;

-- Make an order for cards with prices taken from the cards, as shop-checkout does.
CREATE OR REPLACE FUNCTION pg_temp.make_order(cards uuid[], ship numeric, sess text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE o uuid := gen_random_uuid(); sub numeric;
BEGIN
  SELECT sum(asking_price) INTO sub FROM show_cards WHERE id = ANY (cards);
  INSERT INTO shop_orders (id, user_id, subtotal, shipping, expires_at, stripe_session_id)
  VALUES (o, '440df399-17c0-46c7-b5ff-d9f3a2d87858', sub, ship, now() + interval '30 minutes', sess);
  INSERT INTO shop_order_items (order_id, show_card_id, price) SELECT o, id, asking_price FROM show_cards WHERE id = ANY (cards);
  RETURN o;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.make_order(uuid[], numeric, text) TO PUBLIC;

\echo T1 reserve: all-or-nothing holds, no double holds, expired holds reusable
BEGIN;
SELECT pg_temp.fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); n int;
BEGIN
  SELECT count(*) INTO n FROM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000b']::uuid[], r1, 30);
  IF n <> 2 THEN RAISE EXCEPTION 'T1 expected 2 held, got %', n; END IF;
  BEGIN
    PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000c']::uuid[], r2, 30);
    RAISE EXCEPTION 'T1 B is held by r1; second hold must fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'cards_unavailable:%0b' THEN RAISE; END IF;
  END;
  IF (SELECT hold_ref FROM show_cards WHERE id = 'a0000000-0000-0000-0000-00000000000c') IS NOT NULL THEN
    RAISE EXCEPTION 'T1 all-or-nothing: C must not be held after a failed reserve';
  END IF;
  -- same ref may re-reserve (refreshes the hold)
  PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000a']::uuid[], r1, 30);
  -- an expired hold can be taken
  UPDATE show_cards SET hold_until = now() - interval '1 minute' WHERE hold_ref = r1;
  PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000b']::uuid[], r2, 30);
  -- an offer's hold carries over to its own checkout
  PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000b']::uuid[], gen_random_uuid(), 30, r2);
END $$;
ROLLBACK;

\echo T2 reserve refuses sold, unlisted, other owners and bad sizes
BEGIN;
SELECT pg_temp.fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE c uuid;
BEGIN
  FOREACH c IN ARRAY ARRAY['a0000000-0000-0000-0000-00000000000d','a0000000-0000-0000-0000-00000000000e',
                           'b0000000-0000-0000-0000-00000000000f', gen_random_uuid()]::uuid[] LOOP
    BEGIN
      PERFORM reserve_cards(ARRAY[c], gen_random_uuid(), 30);
      RAISE EXCEPTION 'T2 card % must not be reservable', c;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'cards_unavailable:%' THEN RAISE; END IF;
    END;
  END LOOP;
  BEGIN
    PERFORM reserve_cards('{}'::uuid[], gen_random_uuid(), 30);
    RAISE EXCEPTION 'T2 empty list must fail';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'reserve_cards:%' THEN RAISE; END IF; END;
END $$;
ROLLBACK;

\echo T3 public list hides held cards, shows offer info, never the floor
BEGIN;
SELECT pg_temp.fixture();
SET LOCAL ROLE service_role;
SELECT count(*) FROM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000b']::uuid[], gen_random_uuid(), 30);
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE r record; n int;
BEGIN
  SELECT count(*) INTO n FROM get_shop_cards();
  IF n <> 2 THEN RAISE EXCEPTION 'T3 expected A and C only, got % rows', n; END IF;
  SELECT * INTO r FROM get_shop_cards() WHERE player_name = 'Card A';
  IF NOT r.accept_offers OR r.min_offer <> 43 OR NOT r.rookie THEN RAISE EXCEPTION 'T3 card A offer info wrong: %', row_to_json(r); END IF;
  SELECT * INTO r FROM get_shop_cards() WHERE player_name = 'Card C';
  IF r.min_offer <> 10 THEN RAISE EXCEPTION 'T3 min offer never below $10, got %', r.min_offer; END IF;
  IF to_jsonb(r) ? 'offer_floor' THEN RAISE EXCEPTION 'T3 floor must not be public'; END IF;
END $$;
ROLLBACK;

\echo T4 complete_order records sales, splits shipping and fee exactly, is idempotent
BEGIN;
SELECT pg_temp.fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE o uuid; res text; g numeric; f numeric; rv numeric; n int;
BEGIN
  PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000c']::uuid[], gen_random_uuid(), 30);
  o := pg_temp.make_order(ARRAY['a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000c']::uuid[], 6, 'cs_test_1');
  UPDATE show_cards SET hold_ref = o WHERE hold_ref IS NOT NULL;
  res := complete_order(o, 'cs_test_1', 'pi_1', 'buyer@example.com', 'Marco', '{"city":"Camp Hill"}', 9.06, 160.06, 4.94);
  IF res <> 'paid' THEN RAISE EXCEPTION 'T4 expected paid, got %', res; END IF;
  SELECT count(*), sum(gross_amount), sum(platform_fee), sum(revenue) INTO n, g, f, rv FROM transactions WHERE notes LIKE 'Website order%';
  IF n <> 3 OR g <> 151 OR f <> 4.94 OR rv <> 151 - 4.94 THEN RAISE EXCEPTION 'T4 sums wrong: n=% gross=% fee=% rev=%', n, g, f, rv; END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE notes LIKE 'Website order%' AND (sales_channel <> 'website' OR gross_amount < revenue)) THEN
    RAISE EXCEPTION 'T4 channel or gross/net wrong'; END IF;
  IF (SELECT count(*) FROM show_cards WHERE status = 'sold' AND id IN ('a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000c')) <> 3 THEN
    RAISE EXCEPTION 'T4 cards must be sold'; END IF;
  IF EXISTS (SELECT 1 FROM show_cards WHERE hold_ref IS NOT NULL) THEN RAISE EXCEPTION 'T4 holds must be cleared'; END IF;
  IF (SELECT count(*) FROM shop_order_items WHERE order_id = o AND transaction_id IS NOT NULL) <> 3 THEN RAISE EXCEPTION 'T4 items not linked'; END IF;
  res := complete_order(o, 'cs_test_1', 'pi_1', 'buyer@example.com', 'Marco', '{}', 9.06, 160.06, 4.94);
  IF res <> 'already_paid' THEN RAISE EXCEPTION 'T4 second call must be already_paid, got %', res; END IF;
  IF (SELECT count(*) FROM transactions WHERE notes LIKE 'Website order%') <> 3 THEN RAISE EXCEPTION 'T4 retry must not add sales'; END IF;
  BEGIN
    PERFORM complete_order(o, 'cs_other', 'pi_x', 'x@y.co', NULL, NULL, 0, 0, 0);
  EXCEPTION WHEN raise_exception THEN NULL; END;
END $$;
ROLLBACK;

\echo T5 a card sold at a show during checkout is skipped and flagged for refund
BEGIN;
SELECT pg_temp.fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE o uuid; res text;
BEGIN
  o := pg_temp.make_order(ARRAY['a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000c']::uuid[], 6, 'cs_test_2');
  UPDATE show_cards SET status = 'sold' WHERE id = 'a0000000-0000-0000-0000-00000000000c';
  res := complete_order(o, 'cs_test_2', 'pi_2', 'b@example.com', NULL, NULL, 0, 111, 3.5);
  IF res <> 'paid_with_problem' THEN RAISE EXCEPTION 'T5 expected paid_with_problem, got %', res; END IF;
  IF (SELECT count(*) FROM transactions WHERE notes LIKE 'Website order%') <> 1 THEN RAISE EXCEPTION 'T5 only A is a sale'; END IF;
  IF (SELECT problem FROM shop_orders WHERE id = o) NOT LIKE '%0c%' THEN RAISE EXCEPTION 'T5 problem must name card C'; END IF;
END $$;
ROLLBACK;

\echo T6 an offer order marks the offer paid and clears the offer hold
BEGIN;
SELECT pg_temp.fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE off uuid; o uuid;
BEGIN
  INSERT INTO shop_offers (user_id, show_card_id, buyer_email, amount, asking_price, status, agreed_amount, pay_by)
  VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', 'a0000000-0000-0000-0000-00000000000a', 'b@example.com', 75, 85, 'accepted', 75, now() + interval '24 hours')
  RETURNING id INTO off;
  PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000a']::uuid[], off, 1440);
  o := gen_random_uuid();
  INSERT INTO shop_orders (id, user_id, offer_id, subtotal, shipping, expires_at, stripe_session_id)
  VALUES (o, '440df399-17c0-46c7-b5ff-d9f3a2d87858', off, 75, 6, now() + interval '30 minutes', 'cs_test_3');
  INSERT INTO shop_order_items VALUES (o, 'a0000000-0000-0000-0000-00000000000a', 75, NULL);
  PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000a']::uuid[], o, 30, off);
  PERFORM complete_order(o, 'cs_test_3', 'pi_3', 'b@example.com', NULL, NULL, 0, 81, 2.65);
  IF (SELECT status FROM shop_offers WHERE id = off) <> 'paid' THEN RAISE EXCEPTION 'T6 offer must be paid'; END IF;
  IF (SELECT gross_amount FROM transactions WHERE show_card_id = 'a0000000-0000-0000-0000-00000000000a') <> 81 THEN
    RAISE EXCEPTION 'T6 sale must be at the agreed price plus shipping'; END IF;
  IF EXISTS (SELECT 1 FROM show_cards WHERE hold_ref IS NOT NULL) THEN RAISE EXCEPTION 'T6 holds must be cleared'; END IF;
END $$;
ROLLBACK;

\echo T7 owners read only their own offers and orders, cannot write, cannot see pay tokens
BEGIN;
SELECT pg_temp.fixture();
INSERT INTO shop_offers (user_id, show_card_id, buyer_email, amount, asking_price) VALUES
  (:'colton', 'a0000000-0000-0000-0000-00000000000a', 'b@example.com', 60, 85),
  (:'scott', 'b0000000-0000-0000-0000-00000000000f', 'c@example.com', 40, 50);
INSERT INTO shop_orders (user_id, subtotal, shipping, expires_at) VALUES (:'colton', 85, 6, now()), (:'scott', 50, 6, now());
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM shop_offers; IF n <> 1 THEN RAISE EXCEPTION 'T7 Colton offers %', n; END IF;
  SELECT count(*) INTO n FROM shop_orders; IF n <> 1 THEN RAISE EXCEPTION 'T7 Colton orders %', n; END IF;
  BEGIN PERFORM pay_token FROM shop_offers; RAISE EXCEPTION 'T7 pay_token must be hidden';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE shop_offers SET status = 'accepted'; RAISE EXCEPTION 'T7 update must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO shop_orders (user_id, subtotal, shipping, expires_at) VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', 1, 0, now());
    RAISE EXCEPTION 'T7 insert must be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM reserve_cards(ARRAY['a0000000-0000-0000-0000-00000000000a']::uuid[], gen_random_uuid(), 30);
    RAISE EXCEPTION 'T7 users must not reserve';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM complete_order(gen_random_uuid(), 'x', 'x', 'x@y.co', NULL, NULL, 0, 0, 0);
    RAISE EXCEPTION 'T7 users must not complete orders';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo T8 the public sees no offers or orders and cannot call the private functions
BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM shop_offers; RAISE EXCEPTION 'T8 anon offers'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM shop_orders; RAISE EXCEPTION 'T8 anon orders'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM shop_order_items; RAISE EXCEPTION 'T8 anon items'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM release_hold(gen_random_uuid()); RAISE EXCEPTION 'T8 anon release'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM reserve_cards(ARRAY[gen_random_uuid()], gen_random_uuid(), 30); RAISE EXCEPTION 'T8 anon reserve'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

\echo T9 website is an accepted sales channel
BEGIN;
SELECT pg_temp.fixture();
INSERT INTO transactions (user_id, transaction_type, show_card_id, revenue, sales_channel)
VALUES (:'colton', 'show_card_sale', 'a0000000-0000-0000-0000-00000000000b', 40, 'website');
ROLLBACK;

\echo ALL 0007 TESTS PASSED
