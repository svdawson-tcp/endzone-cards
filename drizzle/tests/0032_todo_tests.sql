-- 0032 To Do build 2 tests. Run after 0031_todo_tests.sql (uses its committed scratch data) on a scratch
-- database with 0031 and 0032 applied:  psql -v ON_ERROR_STOP=1 -f drizzle/tests/0032_todo_tests.sql
-- Each test runs in its own transaction and rolls back.
\set colton  '440df399-17c0-46c7-b5ff-d9f3a2d87858'
\set scott   '771eca1d-2b3a-4878-b8d9-eda457ef918e'
\set second  'ee555162-724c-4327-ba21-180a5634ecb7'

CREATE OR REPLACE FUNCTION pg_temp.act_as(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.act_as_service() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as_service() TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.items(t jsonb, k text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(t) x WHERE x->>'kind' = k $$;
GRANT EXECUTE ON FUNCTION pg_temp.items(jsonb, text) TO PUBLIC;
-- business items for Colton at a given moment (New York time)
CREATE OR REPLACE FUNCTION pg_temp.biz(at_ny timestamp) RETURNS jsonb LANGUAGE sql AS $$
  SELECT todo_business_items('440df399-17c0-46c7-b5ff-d9f3a2d87858', at_ny::date, at_ny AT TIME ZONE 'America/New_York') $$;
GRANT EXECUTE ON FUNCTION pg_temp.biz(timestamp) TO PUBLIC;

\echo SETUP: a clean slate for the business items (scratch data only)
BEGIN;
DELETE FROM website_shows WHERE user_id = :'colton';
UPDATE shows SET status = 'completed' WHERE user_id = :'colton';
UPDATE website_settings SET headliner_changed_at = TIMESTAMPTZ '2026-11-15 12:00-05', wanted_changed_at = TIMESTAMPTZ '2026-11-15 12:00-05'
WHERE owner_user_id = :'colton';
COMMIT;

\echo U1 Got Cards?: listed until answered; urgent email from 20 hours, once
BEGIN;
INSERT INTO web_sell_leads (id, user_id, seller_name, seller_email, status, card_count, categories, photo_paths, created_at)
VALUES ('d1000000-0000-0000-0000-000000000001', :'colton', 'Dave K', 'dave@example.com', 'new', 40, '{}', '{}', TIMESTAMPTZ '2026-11-16 09:00-05');
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE t jsonb; BEGIN
  t := pg_temp.items(pg_temp.biz('2026-11-16 14:00'), 'sell_lead');
  ASSERT jsonb_array_length(t) = 1 AND t->0->>'tier' = 'now' AND NOT (t->0->>'overdue')::boolean, 'listed: ' || t::text;
  ASSERT t->0->>'title' = 'Reply to Dave K (Got Cards?)' AND t->0->>'body' LIKE '40 cards. Sent Nov 16 at 9:00 AM. Reply by Tue 9:00 AM.', t->0->>'body';
  t := pg_temp.items(pg_temp.biz('2026-11-17 10:00'), 'sell_lead');
  ASSERT (t->0->>'overdue')::boolean AND t->0->>'body' LIKE '%Past the 24-hour reply promise.', 'overdue after 24h';
END $$;
RESET ROLE;
SELECT pg_temp.act_as_service();
DO $$ DECLARE c uuid := '440df399-17c0-46c7-b5ff-d9f3a2d87858'; p jsonb; BEGIN
  ASSERT NOT todo_email_pending(c, '2026-11-17 04:59-05') @> '[{"kind":"urgent"}]', 'no email before 20 hours';
  p := todo_email_pending(c, '2026-11-17 05:31-05');
  ASSERT p @> '[{"kind":"urgent","period_key":"sell_lead:d1000000-0000-0000-0000-000000000001:once"}]', 'urgent at 20.5 hours: ' || p::text;
  PERFORM todo_email_mark(c, 'urgent', 'sell_lead:d1000000-0000-0000-0000-000000000001:once', 'sent', 1);
  ASSERT NOT todo_email_pending(c, '2026-11-17 06:31-05') @> '[{"kind":"urgent"}]', 'once only';
END $$;
RESET ROLE;
UPDATE web_sell_leads SET status = 'offer_sent' WHERE id = 'd1000000-0000-0000-0000-000000000001';
SELECT pg_temp.act_as(:'colton');
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(pg_temp.biz('2026-11-17 10:00'), 'sell_lead')) = 0, 'answered clears it';
  RAISE NOTICE 'PASS U1';
END $$;
ROLLBACK;

\echo U2 offers waiting for an answer, cleared once answered
BEGIN;
INSERT INTO show_cards (id, user_id, lot_id, player_name) VALUES
  ('e1000000-0000-0000-0000-000000000001', :'colton', 'c0000000-0000-0000-0000-000000000001', 'Jalen Hurts');
INSERT INTO web_offers (id, user_id, show_card_id, buyer_name, buyer_email, amount, asking_at_offer, floor_at_offer, status, action_token)
VALUES ('e2000000-0000-0000-0000-000000000001', :'colton', 'e1000000-0000-0000-0000-000000000001', 'Sam P', 'sam@example.com',
        30, 45, 36, 'pending', 'tok-test-0000000000000000000000000001');
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE t jsonb := pg_temp.items(pg_temp.biz('2026-11-16 10:00'), 'offer'); BEGIN
  ASSERT jsonb_array_length(t) = 1 AND t->0->>'title' = 'Answer Sam P''s $30.00 offer'
     AND t->0->>'body' = 'On Jalen Hurts. Below your $36.00 floor. Accept, counter or decline.' AND t->0->>'link' = '/offers', 'offer: ' || t::text;
END $$;
RESET ROLE;
UPDATE web_offers SET status = 'declined' WHERE id = 'e2000000-0000-0000-0000-000000000001';
SELECT pg_temp.act_as(:'colton');
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(pg_temp.biz('2026-11-16 10:00'), 'offer')) = 0, 'answered clears it';
  RAISE NOTICE 'PASS U2';
END $$;
ROLLBACK;

\echo U3 orders to ship: from launch day only; overdue after 2 days; cleared when marked shipped
BEGIN;
INSERT INTO web_orders (id, user_id, order_number, status, buyer_name, buyer_email, subtotal, shipping, total, hold_expires_at, paid_at, source) VALUES
  ('e3000000-0000-0000-0000-000000000001', :'colton', 'CS-T01', 'paid', 'Larry B', 'l@example.com', 27, 6, 33, now(), TIMESTAMPTZ '2026-11-11 10:00-05', 'cart'),
  ('e3000000-0000-0000-0000-000000000002', :'colton', 'CS-T02', 'paid', 'Ann M', 'a@example.com', 19, 6, 25, now(), TIMESTAMPTZ '2026-11-16 10:00-05', 'cart'),
  ('e3000000-0000-0000-0000-000000000003', :'colton', 'CS-T03', 'pending', 'Not paid', 'n@example.com', 19, 6, 25, now(), NULL, 'cart');
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE t jsonb; BEGIN
  t := pg_temp.items(pg_temp.biz('2026-11-17 10:00'), 'order');
  ASSERT jsonb_array_length(t) = 1 AND t->0->>'title' = 'Ship CS-T02 to Ann M' AND NOT (t->0->>'overdue')::boolean, 'only the order paid after launch: ' || t::text;
  t := pg_temp.items(pg_temp.biz('2026-11-19 10:00'), 'order');
  ASSERT (t->0->>'overdue')::boolean, 'overdue after 2 days';
END $$;
RESET ROLE;
UPDATE web_orders SET shipped_at = now(), tracking_number = '9400TEST' WHERE id = 'e3000000-0000-0000-0000-000000000002';
SELECT pg_temp.act_as(:'colton');
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(pg_temp.biz('2026-11-19 10:00'), 'order')) = 0, 'shipped clears it';
  RAISE NOTICE 'PASS U3';
END $$;
ROLLBACK;

\echo U4 table shows: fee from 7 days out, get ready from 2 days out; buying shows get neither
BEGIN;
INSERT INTO website_shows (id, user_id, name, location, start_date, kind) VALUES
  ('e4000000-0000-0000-0000-000000000001', :'colton', 'PA State Card Show', 'Harrisburg, PA', DATE '2026-11-22', 'table'),
  ('e4000000-0000-0000-0000-000000000002', :'colton', 'Philly Card Show', 'Philadelphia, PA', DATE '2026-11-24', 'buying');
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE b jsonb; BEGIN
  b := pg_temp.biz('2026-11-14 10:00');
  ASSERT jsonb_array_length(pg_temp.items(b, 'show_fee')) = 0, 'nothing 8 days out';
  b := pg_temp.biz('2026-11-15 10:00');
  ASSERT pg_temp.items(b, 'show_fee')->0->>'tier' = 'week' AND jsonb_array_length(pg_temp.items(b, 'show_prep')) = 0, 'fee 7 days out, this week';
  ASSERT jsonb_array_length(pg_temp.items(b, 'show_fee')) = 1, 'no fee for the buying show';
  b := pg_temp.biz('2026-11-20 10:00');
  ASSERT pg_temp.items(b, 'show_fee')->0->>'tier' = 'now', 'fee is now 2 days out';
  ASSERT (pg_temp.items(b, 'show_prep')->0->>'needs_show')::boolean
     AND pg_temp.items(b, 'show_prep')->0->>'body' LIKE '%add the show in EndZone%', 'get ready, add the show';
END $$;
RESET ROLE;
INSERT INTO shows (user_id, name, location, show_date, status, table_cost) VALUES (:'colton', 'PA State', 'Harrisburg, PA', DATE '2026-11-22', 'planned', 75);
INSERT INTO reminders_state (user_id, reminder_key, period_key, dismissed_at) VALUES (:'colton', 'show_fee:e4000000-0000-0000-0000-000000000001', 'once', now());
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE b jsonb := pg_temp.biz('2026-11-20 10:00'); BEGIN
  ASSERT jsonb_array_length(pg_temp.items(b, 'show_fee')) = 0, '"Paid" dismisses the fee';
  ASSERT NOT (pg_temp.items(b, 'show_prep')->0->>'needs_show')::boolean
     AND pg_temp.items(b, 'show_prep')->0->>'body' = 'Pull inventory and check supplies.', 'show already in EndZone';
  ASSERT jsonb_array_length(pg_temp.items(pg_temp.biz('2026-11-23 10:00'), 'show_prep')) = 0, 'gone after the show';
  RAISE NOTICE 'PASS U4';
END $$;
ROLLBACK;

\echo U5 close shows: from launch day the day after; older open shows as one card
BEGIN;
INSERT INTO shows (id, user_id, name, location, show_date, status) VALUES
  ('e5000000-0000-0000-0000-000000000001', :'colton', 'Old A', 'X', DATE '2026-10-03', 'planned'),
  ('e5000000-0000-0000-0000-000000000002', :'colton', 'Old B', 'X', DATE '2026-11-01', 'active'),
  ('e5000000-0000-0000-0000-000000000003', :'colton', 'New C', 'X', DATE '2026-11-16', 'planned');
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE b jsonb; BEGIN
  b := pg_temp.biz('2026-11-16 10:00');
  ASSERT jsonb_array_length(pg_temp.items(b, 'show_close')) = 0, 'not on the show day';
  b := pg_temp.biz('2026-11-17 10:00');
  ASSERT pg_temp.items(b, 'show_close')->0->>'title' = 'Close New C' AND pg_temp.items(b, 'show_close')->0->>'link' = '/shows/e5000000-0000-0000-0000-000000000003', 'close the new one';
  ASSERT pg_temp.items(b, 'old_shows')->0->>'title' = '2 older shows are still open'
     AND jsonb_array_length(pg_temp.items(b, 'old_shows')->0->'show_ids') = 2 AND pg_temp.items(b, 'old_shows')->0->>'tier' = 'later', 'old ones as one card';
  UPDATE shows SET status = 'completed' WHERE id IN ('e5000000-0000-0000-0000-000000000001','e5000000-0000-0000-0000-000000000002','e5000000-0000-0000-0000-000000000003');
  b := pg_temp.biz('2026-11-17 10:00');
  ASSERT jsonb_array_length(pg_temp.items(b, 'show_close')) = 0 AND jsonb_array_length(pg_temp.items(b, 'old_shows')) = 0, 'closing clears both';
  RAISE NOTICE 'PASS U5';
END $$;
ROLLBACK;

\echo U6 drive prompts for website-schedule shows
BEGIN;
INSERT INTO website_shows (id, user_id, name, location, start_date, kind) VALUES
  ('e6000000-0000-0000-0000-000000000001', :'colton', 'Capital City Card Classic', 'Harrisburg, PA', DATE '2026-11-14', 'buying'),
  ('e6000000-0000-0000-0000-000000000002', :'colton', 'Gettysburg Card Show', 'Gettysburg, PA', DATE '2026-11-19', 'buying'),
  ('e6000000-0000-0000-0000-000000000003', :'colton', 'PA State Card Show', 'Harrisburg, PA', DATE '2026-11-20', 'table');
INSERT INTO shows (id, user_id, name, location, show_date, status) VALUES
  ('e6100000-0000-0000-0000-000000000001', :'colton', 'PA State', 'Harrisburg, PA', DATE '2026-11-20', 'completed');
INSERT INTO lots (id, user_id, source, purchase_date, total_cost, status, account_id) VALUES
  ('e6200000-0000-0000-0000-000000000001', :'colton', 'Dealer at Gettysburg', DATE '2026-11-19', 90, 'active', 'a0000000-0000-0000-0000-000000000001');
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE t jsonb; BEGIN
  t := pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-21'), 'trip');
  -- Capital City is before launch; Gettysburg (buying) prompts; PA State is an EndZone show that day (its own prompt);
  -- the Gettysburg lot is covered by the Gettysburg prompt
  ASSERT t @> '[{"key":"trip_wshow:e6000000-0000-0000-0000-000000000002"}]', 'Gettysburg: ' || t::text;
  ASSERT t @> '[{"key":"trip_show:e6100000-0000-0000-0000-000000000001"}]', 'PA State as the EndZone show';
  ASSERT NOT t @> '[{"key":"trip_wshow:e6000000-0000-0000-0000-000000000003"}]', 'no duplicate for PA State';
  ASSERT NOT t @> '[{"key":"trip_wshow:e6000000-0000-0000-0000-000000000001"}]', 'nothing before launch';
  ASSERT NOT t @> '[{"key":"trip_lot:e6200000-0000-0000-0000-000000000001"}]', 'lot bought at the show day is covered';
  SELECT x INTO t FROM jsonb_array_elements(t) x WHERE x->>'key' = 'trip_wshow:e6000000-0000-0000-0000-000000000002';
  ASSERT t->'trip'->>'purpose' = 'buying' AND t->'trip'->>'website_show_id' = 'e6000000-0000-0000-0000-000000000002' AND t->>'body' LIKE 'Buying trip on Nov 19.%', 'prefill';
END $$;
-- the drive is dated after today's real date, so insert it with the date guard off (rolled back)
RESET ROLE;
ALTER TABLE trips DISABLE TRIGGER trips_guard;
INSERT INTO trips (user_id, trip_date, destination, purpose, miles, website_show_id)
VALUES (:'colton', DATE '2026-11-19', 'Gettysburg, PA', 'buying', 92, 'e6000000-0000-0000-0000-000000000002');
ALTER TABLE trips ENABLE TRIGGER trips_guard;
SELECT pg_temp.act_as(:'colton');
DO $$ BEGIN
  ASSERT NOT pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-21'), 'trip')
         @> '[{"key":"trip_wshow:e6000000-0000-0000-0000-000000000002"}]', 'logged clears it';
  -- the checkup's drive list carries the website-show link too
  ASSERT get_checkup('2026-11', DATE '2026-11-21')->'trip_prompts' @> '[{"website_show_id":null}]', 'checkup list has the field';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'second');
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN INSERT INTO trips (user_id, trip_date, destination, purpose, miles, website_show_id)
        VALUES ('ee555162-724c-4327-ba21-180a5634ecb7', DATE '2026-11-15', 'X', 'buying', 5, 'e6000000-0000-0000-0000-000000000002');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%Show not found%'; END;
  ASSERT ok, 'another user''s website show refused';
  RAISE NOTICE 'PASS U6';
END $$;
ROLLBACK;

\echo U7 Weekly Headliner and Most Wanted: 7 days after the last change; editing resets; snooze a week
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE b jsonb; BEGIN
  b := pg_temp.biz('2026-11-22 11:00');
  ASSERT jsonb_array_length(pg_temp.items(b, 'headliner')) = 0 AND jsonb_array_length(pg_temp.items(b, 'wanted')) = 0, 'not before 7 days';
  b := pg_temp.biz('2026-11-22 12:30');
  ASSERT pg_temp.items(b, 'headliner')->0->>'link' = '/website?tab=headliner' AND pg_temp.items(b, 'wanted')->0->>'link' = '/website?tab=wanted', 'both due: ' || b::text;
END $$;
RESET ROLE;
-- editing as Colton: the triggers stamp the change
SELECT pg_temp.act_as(:'colton');
UPDATE website_settings SET headliner_note = 'Weekly test pick' WHERE owner_user_id = :'colton';
INSERT INTO website_wanted (user_id, sport, position, player_name) VALUES (:'colton', 'Football', 'Quarterbacks', 'Test Player');
RESET ROLE;
DO $$ DECLARE s record; BEGIN
  SELECT headliner_changed_at, wanted_changed_at INTO s FROM website_settings WHERE owner_user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858';
  ASSERT s.headliner_changed_at > now() - interval '1 minute' AND s.wanted_changed_at > now() - interval '1 minute', 'stamped';
END $$;
UPDATE website_settings SET offers_enabled = NOT offers_enabled WHERE owner_user_id = :'colton';
DO $$ BEGIN
  ASSERT (SELECT headliner_changed_at FROM website_settings WHERE owner_user_id = '440df399-17c0-46c7-b5ff-d9f3a2d87858') > now() - interval '1 minute',
    'an unrelated settings change keeps the Headliner date';
END $$;
UPDATE website_settings SET headliner_changed_at = TIMESTAMPTZ '2026-11-15 12:00-05' WHERE owner_user_id = :'colton';
INSERT INTO reminders_state (user_id, reminder_key, period_key, snoozed_until) VALUES (:'colton', 'wanted', 'weekly', DATE '2026-11-29');
UPDATE website_settings SET wanted_changed_at = TIMESTAMPTZ '2026-11-15 12:00-05' WHERE owner_user_id = :'colton';
SELECT pg_temp.act_as(:'colton');
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(pg_temp.biz('2026-11-23 10:00'), 'wanted')) = 0, '"Still good" snoozes a week';
  ASSERT jsonb_array_length(pg_temp.items(pg_temp.biz('2026-11-29 10:00'), 'wanted')) = 1, 'back after the week';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'scott');
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(todo_business_items('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-29', TIMESTAMPTZ '2026-11-29 10:00-05'), 'headliner')) = 1,
    'the mentor sees the same website items';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'second');
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM website_freshness('440df399-17c0-46c7-b5ff-d9f3a2d87858')), 'an unrelated user gets nothing';
  RAISE NOTICE 'PASS U7';
END $$;
ROLLBACK;

\echo U8 logged-out visitors can run none of the new functions; trigger functions are not callable
BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE f text; ok boolean; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'select todo_business_items(''440df399-17c0-46c7-b5ff-d9f3a2d87858'', current_date)',
    'select * from website_freshness(''440df399-17c0-46c7-b5ff-d9f3a2d87858'')',
    'select * from trip_prompts(''440df399-17c0-46c7-b5ff-d9f3a2d87858'', current_date)'] LOOP
    ok := false;
    BEGIN EXECUTE f; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    ASSERT ok, 'anon ran: ' || f;
  END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'public.website_wanted_touch()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.website_headliner_touch()', 'EXECUTE'), 'trigger functions not callable';
  RAISE NOTICE 'PASS U8';
END $$;
ROLLBACK;
