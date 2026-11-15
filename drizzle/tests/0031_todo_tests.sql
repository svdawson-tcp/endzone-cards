-- 0031 To Do / checkup / trips / tasks / email tests. Run against a scratch database with 0031 applied:
--   psql -v ON_ERROR_STOP=1 -f drizzle/tests/0031_todo_tests.sql
-- Setup is committed (scratch data for three test users); every test then runs in its own transaction and
-- rolls back. A failed assertion stops the run.
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
-- items of one kind in a to do list
CREATE OR REPLACE FUNCTION pg_temp.items(t jsonb, k text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(t) x WHERE x->>'kind' = k $$;
GRANT EXECUTE ON FUNCTION pg_temp.items(jsonb, text) TO PUBLIC;

\echo SETUP scratch data
BEGIN;
INSERT INTO mentor_access (mentor_user_id, mentee_user_id, access_level)
SELECT :'scott', :'colton', 'read_only'
WHERE NOT EXISTS (SELECT 1 FROM mentor_access WHERE mentor_user_id = :'scott' AND mentee_user_id = :'colton');
INSERT INTO cash_accounts (id, user_id, name, kind, is_default, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', :'colton', 'Operating', 'operating', true, 1),
  ('a0000000-0000-0000-0000-000000000002', :'colton', 'Travel & Shows', 'travel', false, 2),
  ('a0000000-0000-0000-0000-000000000003', :'colton', 'Tax', 'tax', false, 3),
  ('a0000000-0000-0000-0000-000000000004', :'colton', 'Reserve', 'reserve', false, 4)
ON CONFLICT DO NOTHING;
-- 0032 adds drive prompts for the website show schedule; these tests cover EndZone shows and lots only
DELETE FROM website_shows WHERE user_id = :'colton';
INSERT INTO money_settings (user_id, setup_completed_at) VALUES (:'colton', '2026-10-12 12:00-04') ON CONFLICT DO NOTHING;
INSERT INTO shows (id, user_id, name, location, show_date, status, table_cost) VALUES
  ('b0000000-0000-0000-0000-000000000001', :'colton', 'Hershey Card Show', 'Hershey, PA', DATE '2026-11-14', 'completed', 0),
  ('b0000000-0000-0000-0000-000000000002', :'colton', 'Old October Show', 'York, PA', DATE '2026-10-10', 'completed', 50),
  ('b0000000-0000-0000-0000-000000000003', :'second', 'Someone else''s show', 'Elsewhere', DATE '2026-11-14', 'completed', 0)
ON CONFLICT DO NOTHING;
INSERT INTO lots (id, user_id, source, purchase_date, total_cost, status, account_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', :'colton', 'Facebook seller', DATE '2026-11-15', 120, 'active', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', :'colton', 'Mail-in seller', DATE '2026-11-15', 80, 'active', 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', :'colton', 'Before launch', DATE '2026-11-10', 60, 'active', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
INSERT INTO web_sell_leads (id, user_id, seller_name, seller_email, handoff, status, lot_id, categories, photo_paths)
VALUES ('d0000000-0000-0000-0000-000000000001', :'colton', 'Mike R', 'mike@example.com', 'ship', 'bought',
        'c0000000-0000-0000-0000-000000000002', '{}', '{}')
ON CONFLICT DO NOTHING;
INSERT INTO expenses (id, user_id, expense_date, amount, category, account_id) VALUES
  ('f0000000-0000-0000-0000-000000000001', :'colton', DATE '2026-10-05', 20, 'Supplies', 'a0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', :'colton', DATE '2026-11-03', 90, 'Grading', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
COMMIT;

\echo T1 last Sunday of the month, including months that end on a Sunday
DO $$ BEGIN
  ASSERT last_sunday_of_month(DATE '2026-11-15') = DATE '2026-11-29', 'Nov 2026';
  ASSERT last_sunday_of_month(DATE '2026-05-01') = DATE '2026-05-31', 'May 2026 ends on a Sunday';
  ASSERT last_sunday_of_month(DATE '2027-02-01') = DATE '2027-02-28', 'Feb 2027 ends on a Sunday';
  ASSERT last_sunday_of_month(DATE '2026-08-31') = DATE '2026-08-30', 'Aug 2026 ends on a Monday';
  ASSERT last_sunday_of_month(DATE '2026-12-01') = DATE '2026-12-27', 'Dec 2026';
  RAISE NOTICE 'PASS T1';
END $$;

\echo T2 the checkup appears on its last Sunday (not before), stays until done, and the mentor sees the same item
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE c uuid := '440df399-17c0-46c7-b5ff-d9f3a2d87858'; t jsonb; BEGIN
  t := pg_temp.items(get_todo(c, DATE '2026-11-28'), 'checkup');
  ASSERT jsonb_array_length(t) = 0, 'no checkup before Nov 29';
  t := pg_temp.items(get_todo(c, DATE '2026-11-29'), 'checkup');
  ASSERT jsonb_array_length(t) = 1 AND t->0->>'period' = '2026-11' AND t->0->>'tier' = 'now', 'Nov checkup on Nov 29: ' || t;
  ASSERT (t->0->>'first')::boolean, 'first checkup flagged (catch-up drives question)';
  t := pg_temp.items(get_todo(c, DATE '2026-12-03'), 'checkup');
  ASSERT jsonb_array_length(t) = 1, 'still there in December until done';
  t := pg_temp.items(get_todo(c, DATE '2026-12-27'), 'checkup');
  ASSERT jsonb_array_length(t) = 2, 'Nov and Dec both open on Dec 27';
END $$;
RESET ROLE;
INSERT INTO monthly_checkups (user_id, period, started_at) VALUES (:'colton', '2026-11', now());
SELECT pg_temp.act_as(:'colton');
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-12-03'), 'checkup')) = 0, 'done clears it';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'scott');
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-12-03'), 'checkup')) = 0,
    'mentor sees it as done too (checkup_done works for the mentor)';
  ASSERT jsonb_array_length(pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-12-27'), 'checkup')) = 1,
    'mentor sees December open';
  RAISE NOTICE 'PASS T2';
END $$;
ROLLBACK;

\echo T3 snoozing the checkup hides it until the snooze date
BEGIN;
SELECT pg_temp.act_as(:'colton');
INSERT INTO reminders_state (user_id, reminder_key, period_key, snoozed_until) VALUES (:'colton', 'checkup', '2026-11', DATE '2026-11-30');
DO $$ DECLARE c uuid := '440df399-17c0-46c7-b5ff-d9f3a2d87858'; BEGIN
  ASSERT jsonb_array_length(pg_temp.items(get_todo(c, DATE '2026-11-29'), 'checkup')) = 0, 'snoozed on the 29th';
  ASSERT jsonb_array_length(pg_temp.items(get_todo(c, DATE '2026-11-30'), 'checkup')) = 1, 'back on the 30th';
  RAISE NOTICE 'PASS T3';
END $$;
ROLLBACK;

\echo T4 checkup records: written once by complete_checkup, never edited, owner-only to read
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE r jsonb; ok boolean; BEGIN
  -- the November checkup can't be completed before Nov 29 (real clock is before then in this run)
  ok := false;
  BEGIN PERFORM complete_checkup('2027-01', now(), '{}'); EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%opens on%'; END;
  ASSERT ok, 'future month refused';
  r := complete_checkup('2026-10', now() - interval '10 minutes', '{"fees":"none","supplies":"yes"}', 'test');
  ASSERT (r->>'items_added')::int >= 0, 'completed';
  ok := false;
  BEGIN PERFORM complete_checkup('2026-10', now(), '{}'); EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%already done%'; END;
  ASSERT ok, 'second completion refused';
  ok := false;
  BEGIN UPDATE monthly_checkups SET note = 'edited' WHERE period = '2026-10';
        ok := NOT FOUND; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'owner cannot edit a checkup';
  ok := false;
  BEGIN INSERT INTO monthly_checkups (user_id, period, started_at) VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', '2026-09', now());
        EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'owner cannot insert directly';
  ASSERT (SELECT count(*) FROM monthly_checkups WHERE period = '2026-10') = 1, 'owner reads own';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'scott');
DO $$ DECLARE s jsonb; BEGIN
  ASSERT (SELECT count(*) FROM monthly_checkups) = 0, 'mentor cannot read checkup rows (answers)';
  s := get_checkup_status('440df399-17c0-46c7-b5ff-d9f3a2d87858');
  ASSERT jsonb_array_length(s) = 1 AND s->0->>'period' = '2026-10' AND s->0 ? 'completed_at' AND NOT (s->0 ? 'answers'),
    'mentor sees only month and date: ' || s;
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'second');
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN PERFORM get_checkup_status('440df399-17c0-46c7-b5ff-d9f3a2d87858'); EXCEPTION WHEN others THEN ok := true; END;
  ASSERT ok, 'unrelated user refused';
  ASSERT NOT checkup_done('440df399-17c0-46c7-b5ff-d9f3a2d87858', '2026-10'), 'checkup_done tells an unrelated user nothing';
  RAISE NOTICE 'PASS T4';
END $$;
ROLLBACK;

\echo T5 trip prompts: shows and lots from launch day, not shipped lots, cleared by a trip or by "No drive"
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE c uuid := '440df399-17c0-46c7-b5ff-d9f3a2d87858'; t jsonb; BEGIN
  t := pg_temp.items(get_todo(c, DATE '2026-11-15'), 'trip');
  -- Nov 14 show is before launch (Nov 15) -> no prompt; lot 1 (Nov 15, no seller) -> prompt; lot 2 shipped -> none; lot 3 before launch
  ASSERT jsonb_array_length(t) = 1 AND t->0->>'key' = 'trip_lot:c0000000-0000-0000-0000-000000000001', 'only lot 1: ' || t;
  ASSERT t->0->'trip'->>'purpose' = 'buying' AND t->0->'trip'->>'destination' = 'Facebook seller', 'prefill';
END $$;
-- a show after launch
INSERT INTO shows (id, user_id, name, location, show_date, status, table_cost)
VALUES ('b0000000-0000-0000-0000-000000000009', :'colton', 'Harrisburg Show', 'Harrisburg, PA', DATE '2026-11-15', 'active', 40);
DO $$ DECLARE c uuid := '440df399-17c0-46c7-b5ff-d9f3a2d87858'; t jsonb; BEGIN
  t := pg_temp.items(get_todo(c, DATE '2026-11-16'), 'trip');
  ASSERT jsonb_array_length(t) = 2, 'show and lot: ' || t;
  ASSERT jsonb_array_length(pg_temp.items(get_todo(c, DATE '2026-12-06'), 'trip')) = 2, 'still there 21 days later';
  ASSERT jsonb_array_length(pg_temp.items(get_todo(c, DATE '2026-12-07'), 'trip')) = 0, 'expired after 21 days';
END $$;
INSERT INTO trips (user_id, trip_date, destination, purpose, miles, show_id)
VALUES (:'colton', DATE '2026-11-15', 'Harrisburg, PA', 'show', 46, 'b0000000-0000-0000-0000-000000000009');
INSERT INTO reminders_state (user_id, reminder_key, period_key, dismissed_at)
VALUES (:'colton', 'trip_lot:c0000000-0000-0000-0000-000000000001', 'once', now());
DO $$ BEGIN
  ASSERT jsonb_array_length(pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-16'), 'trip')) = 0,
    'trip logged clears the show; No drive clears the lot';
  RAISE NOTICE 'PASS T5';
END $$;
ROLLBACK;

\echo T6 a Got Cards? meetup buy prompts with the seller's name
BEGIN;
UPDATE web_sell_leads SET handoff = 'meetup' WHERE id = 'd0000000-0000-0000-0000-000000000001';
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE t jsonb; BEGIN
  t := pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-15'), 'trip');
  ASSERT jsonb_array_length(t) = 2, 'both lots now: ' || t;
  SELECT x INTO t FROM jsonb_array_elements(t) x WHERE x->>'key' = 'trip_lot:c0000000-0000-0000-0000-000000000002';
  ASSERT t->>'title' = 'Did you drive to pick up the lot from Mike R?', t->>'title';
  ASSERT t->'trip'->>'purpose' = 'seller_meetup' AND t->'trip'->>'sell_lead_id' = 'd0000000-0000-0000-0000-000000000001', 'meetup prefill';
  RAISE NOTICE 'PASS T6';
END $$;
ROLLBACK;

\echo T7 trips: no future dates, no other user's show, edits counted, mentor read-only, unrelated user sees nothing
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE ok boolean; v uuid; BEGIN
  ok := false;
  BEGIN INSERT INTO trips (user_id, trip_date, destination, purpose, miles)
        VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', (now() AT TIME ZONE 'America/New_York')::date + 1, 'Tomorrow', 'other', 5);
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%future%'; END;
  ASSERT ok, 'future date refused';
  ok := false;
  BEGIN INSERT INTO trips (user_id, trip_date, destination, purpose, miles, show_id)
        VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-14', 'X', 'show', 5, 'b0000000-0000-0000-0000-000000000003');
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%Show not found%'; END;
  ASSERT ok, 'another user''s show refused';
  ok := false;
  BEGIN INSERT INTO trips (user_id, trip_date, destination, purpose, miles)
        VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-14', 'Zero', 'other', 0);
  EXCEPTION WHEN check_violation THEN ok := true; END;
  ASSERT ok, 'zero miles refused';
  INSERT INTO trips (user_id, trip_date, destination, purpose, miles) VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-14', 'Post office', 'post_office', 6)
  RETURNING id INTO v;
  UPDATE trips SET notes = 'just a note' WHERE id = v;
  ASSERT (SELECT correction_count FROM trips WHERE id = v) = 0, 'note-only edit is not a correction';
  UPDATE trips SET miles = 8 WHERE id = v;
  ASSERT (SELECT correction_count = 1 AND corrected_at IS NOT NULL FROM trips WHERE id = v), 'miles edit counted';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'scott');
DO $$ DECLARE ok boolean := false; BEGIN
  ASSERT (SELECT count(*) FROM trips) = 1, 'mentor reads trips';
  BEGIN INSERT INTO trips (user_id, trip_date, destination, purpose, miles)
        VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-14', 'Mentor', 'other', 5);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'mentor cannot add trips';
  UPDATE trips SET miles = 99;
  ASSERT (SELECT miles FROM trips) = 8, 'mentor cannot edit trips';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'second');
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM trips) = 0, 'unrelated user sees no trips';
  RAISE NOTICE 'PASS T7';
END $$;
ROLLBACK;

\echo T8 tasks: mentor adds and edits his own, cannot complete or touch the owner's; owner does everything
BEGIN;
SELECT pg_temp.act_as(:'scott');
INSERT INTO tasks (id, user_id, title, due_date, urgent)
VALUES ('e0000000-0000-0000-0000-000000000001', :'colton', 'Order the package-insert cards', DATE '2026-11-18', false);
DO $$ DECLARE ok boolean; BEGIN
  UPDATE tasks SET title = 'Order the insert cards (10% off)' WHERE id = 'e0000000-0000-0000-0000-000000000001';
  ASSERT (SELECT title FROM tasks WHERE id = 'e0000000-0000-0000-0000-000000000001') = 'Order the insert cards (10% off)', 'mentor edits own';
  ok := false;
  BEGIN UPDATE tasks SET done_at = now() WHERE id = 'e0000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN others THEN ok := SQLERRM LIKE '%Only the list owner%'; END;
  ASSERT ok, 'mentor cannot complete';
  ok := false;
  BEGIN INSERT INTO tasks (user_id, title) VALUES ('ee555162-724c-4327-ba21-180a5634ecb7', 'Not my mentee');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'mentor cannot add to someone he does not mentor';
  ok := false;
  BEGIN INSERT INTO tasks (user_id, created_by, title) VALUES ('440df399-17c0-46c7-b5ff-d9f3a2d87858', '440df399-17c0-46c7-b5ff-d9f3a2d87858', 'Spoofed author');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'mentor cannot pretend the owner wrote it';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'colton');
INSERT INTO tasks (id, user_id, title) VALUES ('e0000000-0000-0000-0000-000000000002', :'colton', 'Set up Google Business Profile');
DO $$ DECLARE t jsonb; ok boolean; BEGIN
  t := pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-15'), 'task');
  ASSERT jsonb_array_length(t) = 2, 'both tasks listed';
  ASSERT t->0->>'task_id' = 'e0000000-0000-0000-0000-000000000001' AND t->0->>'tier' = 'week' AND (t->0->>'added_by_mentor')::boolean, 'dated task this week, from mentor: ' || t;
  ASSERT t->1->>'tier' = 'later', 'undated task later';
  ASSERT pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-18'), 'task')->0->>'tier' = 'now', 'due today -> now';
  UPDATE tasks SET done_at = now() WHERE id = 'e0000000-0000-0000-0000-000000000001';
  ASSERT jsonb_array_length(pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-15'), 'task')) = 1, 'done drops off';
  ok := false;
  BEGIN UPDATE tasks SET user_id = 'ee555162-724c-4327-ba21-180a5634ecb7' WHERE id = 'e0000000-0000-0000-0000-000000000002';
  EXCEPTION WHEN others THEN ok := true; END;
  ASSERT ok, 'a task cannot move lists';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'scott');
DO $$ BEGIN
  UPDATE tasks SET title = 'Hijacked' WHERE id = 'e0000000-0000-0000-0000-000000000002';
  DELETE FROM tasks WHERE id = 'e0000000-0000-0000-0000-000000000002';
  ASSERT (SELECT title FROM tasks WHERE id = 'e0000000-0000-0000-0000-000000000002') = 'Set up Google Business Profile', 'mentor cannot edit or delete the owner''s task';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'second');
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM tasks) = 0, 'unrelated user sees no tasks';
  ASSERT jsonb_array_length(pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-11-15'), 'task')) = 0, 'nor through get_todo';
  RAISE NOTICE 'PASS T8';
END $$;
ROLLBACK;

\echo T9 bank check: a check on or after the previous month's last Sunday satisfies the monthly reminder
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE c uuid := '440df399-17c0-46c7-b5ff-d9f3a2d87858'; BEGIN
  ASSERT jsonb_array_length(pg_temp.items(get_reminders(c, DATE '2026-12-07'), 'reconcile')) = 4, 'four checks due Dec 7';
  -- To Do shows them as one card while no checkup is open (Nov checkup done here), and inside the checkup otherwise
  ASSERT jsonb_array_length(pg_temp.items(get_todo(c, DATE '2026-12-07'), 'reconcile')) = 0, 'Nov checkup open on Dec 7: folded in';
END $$;
RESET ROLE;
INSERT INTO monthly_checkups (user_id, period, started_at) VALUES (:'colton', '2026-11', now());
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE r jsonb := pg_temp.items(get_todo('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-12-07'), 'reconcile'); BEGIN
  ASSERT jsonb_array_length(r) = 1 AND jsonb_array_length(r->0->'keys') = 4 AND r->0->>'title' = 'Check 4 accounts against the bank', 'one card for four: ' || r;
END $$;
RESET ROLE;
INSERT INTO account_reconciliations (user_id, account_id, as_of, bank_balance, app_balance) VALUES
  (:'colton', 'a0000000-0000-0000-0000-000000000001', DATE '2026-11-28', 0, 0),   -- day before the last Sunday: doesn't count
  (:'colton', 'a0000000-0000-0000-0000-000000000002', DATE '2026-11-29', 0, 0),   -- the checkup day: counts
  (:'colton', 'a0000000-0000-0000-0000-000000000003', DATE '2026-11-30', 0, 0);   -- month end: counts
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE r jsonb := pg_temp.items(get_reminders('440df399-17c0-46c7-b5ff-d9f3a2d87858', DATE '2026-12-07'), 'reconcile'); BEGIN
  ASSERT jsonb_array_length(r) = 2, 'Operating and Reserve still due: ' || r;
  ASSERT r @> '[{"account_id":"a0000000-0000-0000-0000-000000000001"}]' AND r @> '[{"account_id":"a0000000-0000-0000-0000-000000000004"}]', 'the right two';
  RAISE NOTICE 'PASS T9';
END $$;
ROLLBACK;

\echo T10 get_checkup flags: show with no booth fee, missing categories, $75+ without receipt, accounts
BEGIN;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE g jsonb := get_checkup('2026-11', DATE '2026-11-29'); BEGIN
  ASSERT g->'shows_no_fee' @> '[{"name":"Hershey Card Show"}]' AND jsonb_array_length(g->'shows_no_fee') = 1, 'Hershey has no fee: ' || (g->'shows_no_fee');
  ASSERT g->'missing_categories' = '["Supplies"]', 'Supplies in Oct, none in Nov: ' || (g->'missing_categories');
  ASSERT jsonb_array_length(g->'no_receipt') = 1 AND (g->'no_receipt'->0->>'amount')::numeric = 90, 'grading $90 no receipt';
  ASSERT jsonb_array_length(g->'accounts') = 4, 'four accounts';
  ASSERT (g->>'first')::boolean AND NOT (g->>'done')::boolean, 'first, not done';
  ASSERT g->'this_month' ? 'gross_sales' AND g->'last_month' ? 'expenses', 'metrics present';
END $$;
INSERT INTO expenses (user_id, expense_date, amount, category, account_id, show_id)
VALUES (:'colton', DATE '2026-11-14', 45, 'Table / Booth Fees', 'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  ASSERT jsonb_array_length(get_checkup('2026-11', DATE '2026-11-29')->'shows_no_fee') = 0, 'booth fee entered clears the flag';
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'second');
DO $$ DECLARE g jsonb := get_checkup('2026-11', DATE '2026-11-29'); BEGIN
  ASSERT jsonb_array_length(g->'no_receipt') = 0 AND jsonb_array_length(g->'accounts') = 0, 'another user sees only their own';
  RAISE NOTICE 'PASS T10';
END $$;
ROLLBACK;

\echo T11 email: digest only Sundays from 6 pm ET, once; urgent tasks once; switch off = not sent
BEGIN;
INSERT INTO tasks (user_id, created_by, title, urgent) VALUES (:'colton', :'scott', 'Call the accountant today', true);
SELECT pg_temp.act_as_service();
DO $$ DECLARE c uuid := '440df399-17c0-46c7-b5ff-d9f3a2d87858'; p jsonb; d jsonb; BEGIN
  p := todo_email_pending(c, '2026-11-29 17:59-05');
  ASSERT NOT p @> '[{"kind":"digest"}]', 'no digest before 6 pm';
  ASSERT p @> '[{"kind":"urgent"}]', 'urgent task pending any time';
  p := todo_email_pending(c, '2026-11-28 19:00-05');
  ASSERT NOT p @> '[{"kind":"digest"}]', 'no digest on Saturday';
  p := todo_email_pending(c, '2026-11-29 18:31-05');
  SELECT x INTO d FROM jsonb_array_elements(p) x WHERE x->>'kind' = 'digest';
  ASSERT d->>'period_key' = '2026-11-29' AND (d->>'send')::boolean AND (d->>'checkup')::boolean, 'Sunday digest leads with the checkup: ' || d;
  ASSERT todo_email_mark(c, 'digest', '2026-11-29', 'sent', 3), 'marked';
  ASSERT todo_email_mark(c, 'digest', '2026-11-29', 'sent', 3) IS NULL, 'second mark is a no-op';
  p := todo_email_pending(c, '2026-11-29 19:31-05');
  ASSERT NOT p @> '[{"kind":"digest"}]', 'digest goes once per Sunday';
  SELECT x INTO d FROM jsonb_array_elements(p) x WHERE x->>'kind' = 'urgent';
  PERFORM todo_email_mark(c, 'urgent', d->>'period_key', 'sent', 1);
  ASSERT NOT todo_email_pending(c, '2026-11-29 20:31-05') @> '[{"kind":"urgent"}]', 'urgent goes once';
END $$;
RESET ROLE;
INSERT INTO monthly_checkups (user_id, period, started_at) VALUES (:'colton', '2026-11', now());
SELECT pg_temp.act_as_service();
DO $$ DECLARE d jsonb; BEGIN
  SELECT x INTO d FROM jsonb_array_elements(todo_email_pending('440df399-17c0-46c7-b5ff-d9f3a2d87858', '2026-12-06 18:31-05')) x WHERE x->>'kind' = 'digest';
  ASSERT NOT (d->>'checkup')::boolean, 'a finished checkup is not in the next digest: ' || d;
END $$;
RESET ROLE;
UPDATE money_settings SET weekly_email = false WHERE user_id = :'colton';
SELECT pg_temp.act_as_service();
DO $$ DECLARE d jsonb; BEGIN
  SELECT x INTO d FROM jsonb_array_elements(todo_email_pending('440df399-17c0-46c7-b5ff-d9f3a2d87858', '2026-12-06 18:31-05')) x WHERE x->>'kind' = 'digest';
  ASSERT NOT (d->>'send')::boolean, 'switched off -> not sent (still logged as skipped)';
  RAISE NOTICE 'PASS T11';
END $$;
ROLLBACK;

\echo T12 estimated tax due within 3 days triggers an urgent email
BEGIN;
SELECT pg_temp.act_as_service();
DO $$ DECLARE p jsonb; BEGIN
  p := todo_email_pending('440df399-17c0-46c7-b5ff-d9f3a2d87858', '2027-01-11 09:00-05');
  ASSERT NOT p @> '[{"kind":"urgent"}]', '4 days out: not yet urgent';
  p := todo_email_pending('440df399-17c0-46c7-b5ff-d9f3a2d87858', '2027-01-12 09:00-05');
  ASSERT p @> '[{"kind":"urgent","period_key":"estimated_tax:2026-Q4"}]', '3 days out: urgent: ' || p;
  RAISE NOTICE 'PASS T12';
END $$;
ROLLBACK;

\echo T13 mileage summary uses the rate for each trip's date (72.5c to June, 76c from July 2026)
BEGIN;
INSERT INTO trips (user_id, trip_date, destination, purpose, miles) VALUES
  (:'colton', DATE '2026-06-30', 'June', 'other', 100),
  (:'colton', DATE '2026-07-01', 'July', 'other', 100);
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE s jsonb := get_mileage_summary('440df399-17c0-46c7-b5ff-d9f3a2d87858', 2026); BEGIN
  ASSERT (s->>'miles')::numeric = 200 AND (s->>'deduction')::numeric = 148.50, 'deduction 72.50 + 76.00: ' || s;
  ASSERT jsonb_array_length(s->'rates') = 2, 'two 2026 rates';
  RAISE NOTICE 'PASS T13';
END $$;
ROLLBACK;

\echo T14 logged-out visitors can run none of the new functions and read none of the new tables
BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE f text; ok boolean; n int; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'select get_todo(''440df399-17c0-46c7-b5ff-d9f3a2d87858'')', 'select get_checkup(''2026-11'')',
    'select complete_checkup(''2026-10'', now(), ''{}'')', 'select get_checkup_status(''440df399-17c0-46c7-b5ff-d9f3a2d87858'')',
    'select todo_email_pending(''440df399-17c0-46c7-b5ff-d9f3a2d87858'')', 'select todo_email_tick()',
    'select get_mileage_summary(''440df399-17c0-46c7-b5ff-d9f3a2d87858'', 2026)'] LOOP
    ok := false;
    BEGIN EXECUTE f; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    ASSERT ok, 'anon ran: ' || f;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['trips','tasks','monthly_checkups','todo_email_log','mileage_rates'] LOOP
    ok := false;
    BEGIN EXECUTE 'select count(*) from ' || f INTO n; ok := n = 0; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    ASSERT ok, 'anon read ' || f;
  END LOOP;
END $$;
RESET ROLE;
SELECT pg_temp.act_as(:'colton');
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN PERFORM todo_email_pending('440df399-17c0-46c7-b5ff-d9f3a2d87858'); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  ASSERT ok, 'signed-in users cannot call the email functions';
  RAISE NOTICE 'PASS T14';
END $$;
ROLLBACK;
