-- =====================================================================
-- EndZone 0031 — To Do list, monthly checkup, trips/mileage, tasks, To Do email (Scott, 15 Nov 2026)
-- Design: project doc claude/ToDo_and_Monthly_Checkup_Design.md (approved 15 Nov 2026), AD-012.
--
--  1. mileage_rates  IRS business standard mileage rates by effective date (data, not code)
--  2. trips          mileage log: date, destination, purpose, miles (a log only; no cash moves)
--  3. tasks          typed-in tasks; Colton owns them, Scott (mentor) can add and edit his own
--  4. monthly_checkups  one row per month when the checkup is finished; owner-only, never edited
--  5. todo_email_log    which To Do emails have gone out (no duplicates)
--  6. money_settings.weekly_email (off switch for the Sunday digest)
--  7. get_reminders: a bank check on or after the previous month's last Sunday now counts
--  8. functions: last_sunday_of_month, mileage_rate_for, checkup_done, get_checkup_status,
--     get_checkup, complete_checkup, get_todo, get_mileage_summary, todo_email_pending, todo_email_mark,
--     todo_email_tick
-- Everything is computed on read like the Round 4 reminders; only dismiss/snooze is stored (reminders_state).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MILEAGE RATES
-- ---------------------------------------------------------------------
CREATE TABLE public.mileage_rates (
  effective_from date PRIMARY KEY,
  rate           numeric(5,3) NOT NULL CHECK (rate > 0 AND rate < 5),
  source         text NOT NULL
);
ALTER TABLE public.mileage_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can read mileage rates" ON public.mileage_rates FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.mileage_rates TO authenticated;
GRANT ALL ON public.mileage_rates TO service_role;
INSERT INTO public.mileage_rates (effective_from, rate, source) VALUES
  (DATE '2025-01-01', 0.700, 'IRS Notice 2025-5'),
  (DATE '2026-01-01', 0.725, 'IRS Notice 2026-10'),
  (DATE '2026-07-01', 0.760, 'IRS Announcement 2026-11 (mid-year increase for fuel prices)');

CREATE FUNCTION public.mileage_rate_for(p_date date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT rate FROM mileage_rates WHERE effective_from <= p_date ORDER BY effective_from DESC LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 2. TRIPS (mileage log)
-- ---------------------------------------------------------------------
CREATE TABLE public.trips (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_date        date NOT NULL,
  destination      text NOT NULL CHECK (length(btrim(destination)) BETWEEN 2 AND 120),
  purpose          text NOT NULL CHECK (purpose IN ('show','seller_meetup','buying','post_office','supplies','other')),
  miles            numeric(7,1) NOT NULL CHECK (miles > 0 AND miles <= 2000),  -- total business miles for the trip
  round_trip       boolean NOT NULL DEFAULT true,
  notes            text CHECK (notes IS NULL OR length(notes) <= 500),
  show_id          uuid REFERENCES public.shows(id) ON DELETE SET NULL,
  lot_id           uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  sell_lead_id     uuid REFERENCES public.web_sell_leads(id) ON DELETE SET NULL,
  corrected_at     timestamptz,
  correction_count integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (trip_date >= DATE '2025-01-01')
);
CREATE INDEX trips_user_date_idx ON public.trips (user_id, trip_date DESC);
CREATE INDEX trips_show_idx ON public.trips (show_id) WHERE show_id IS NOT NULL;
CREATE INDEX trips_lot_idx ON public.trips (lot_id) WHERE lot_id IS NOT NULL;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own trips or as mentor" ON public.trips
  FOR SELECT USING ((auth.uid() = user_id) OR has_mentor_access(user_id));
CREATE POLICY "Users can insert own trips" ON public.trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON public.trips
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own trips" ON public.trips FOR DELETE USING (auth.uid() = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;

-- Dates can't be in the future; linked show/lot/lead must belong to the same user; edits are counted.
CREATE FUNCTION public.trips_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.trip_date > (now() AT TIME ZONE 'America/New_York')::date THEN
    RAISE EXCEPTION 'Trip date cannot be in the future';
  END IF;
  NEW.destination := btrim(NEW.destination);
  IF NEW.show_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM shows WHERE id = NEW.show_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Show not found';
  END IF;
  IF NEW.lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lots WHERE id = NEW.lot_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Lot not found';
  END IF;
  IF NEW.sell_lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM web_sell_leads WHERE id = NEW.sell_lead_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Seller not found';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'A trip cannot move to another user'; END IF;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
    IF (NEW.trip_date, NEW.destination, NEW.purpose, NEW.miles, NEW.round_trip)
       IS DISTINCT FROM (OLD.trip_date, OLD.destination, OLD.purpose, OLD.miles, OLD.round_trip) THEN
      NEW.corrected_at := now();
      NEW.correction_count := OLD.correction_count + 1;
    ELSE
      NEW.corrected_at := OLD.corrected_at;
      NEW.correction_count := OLD.correction_count;
    END IF;
  ELSE
    NEW.corrected_at := NULL;
    NEW.correction_count := 0;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trips_guard BEFORE INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trips_guard();

-- ---------------------------------------------------------------------
-- 3. TASKS (typed in by Colton, or by Scott for Colton)
-- ---------------------------------------------------------------------
CREATE TABLE public.tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,       -- whose list it is on
  created_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  notes       text CHECK (notes IS NULL OR length(notes) <= 1000),
  due_date    date,
  urgent      boolean NOT NULL DEFAULT false,
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_user_open_idx ON public.tasks (user_id, due_date) WHERE done_at IS NULL;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or mentor can view tasks" ON public.tasks
  FOR SELECT USING ((auth.uid() = user_id) OR has_mentor_access(user_id));
CREATE POLICY "Owner or mentor can add tasks" ON public.tasks
  FOR INSERT WITH CHECK (created_by = auth.uid() AND ((auth.uid() = user_id) OR has_mentor_access(user_id)));
CREATE POLICY "Owner edits any task, mentor edits the ones he added" ON public.tasks
  FOR UPDATE USING ((auth.uid() = user_id) OR (has_mentor_access(user_id) AND created_by = auth.uid()))
  WITH CHECK ((auth.uid() = user_id) OR (has_mentor_access(user_id) AND created_by = auth.uid()));
CREATE POLICY "Owner deletes any task, mentor deletes the ones he added" ON public.tasks
  FOR DELETE USING ((auth.uid() = user_id) OR (has_mentor_access(user_id) AND created_by = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

-- Only the list's owner can mark a task done or not done; owner and author never change.
CREATE FUNCTION public.tasks_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF TG_OP = 'INSERT' THEN
    IF NEW.done_at IS NOT NULL AND auth.uid() IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Only % can mark a task done', 'the list owner';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'A task cannot move to another list';
  END IF;
  IF NEW.done_at IS DISTINCT FROM OLD.done_at AND auth.uid() IS DISTINCT FROM NEW.user_id
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only % can mark a task done', 'the list owner';
  END IF;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER tasks_guard BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_guard();

-- ---------------------------------------------------------------------
-- 4. MONTHLY CHECKUPS (owner-only; insert once, never edited)
-- ---------------------------------------------------------------------
CREATE TABLE public.monthly_checkups (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period       text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  started_at   timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  answers      jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  items_added  integer NOT NULL DEFAULT 0 CHECK (items_added >= 0),
  note         text CHECK (note IS NULL OR length(note) <= 1000),
  PRIMARY KEY (user_id, period)
);
ALTER TABLE public.monthly_checkups ENABLE ROW LEVEL SECURITY;
-- Scott decided (15 Nov) he does not see the answers: owner-only read, no mentor policy.
CREATE POLICY "Owner can view own checkups" ON public.monthly_checkups FOR SELECT USING (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: complete_checkup writes the row.
GRANT SELECT ON public.monthly_checkups TO authenticated;
GRANT ALL ON public.monthly_checkups TO service_role;

-- ---------------------------------------------------------------------
-- 5. TO DO EMAIL LOG
-- ---------------------------------------------------------------------
CREATE TABLE public.todo_email_log (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('digest','urgent')),
  period_key text NOT NULL CHECK (length(period_key) BETWEEN 1 AND 80),
  status     text NOT NULL CHECK (status IN ('sent','skipped','failed')),
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, period_key)
);
ALTER TABLE public.todo_email_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can view own email log" ON public.todo_email_log FOR SELECT USING (auth.uid() = user_id);
GRANT SELECT ON public.todo_email_log TO authenticated;
GRANT ALL ON public.todo_email_log TO service_role;

-- ---------------------------------------------------------------------
-- 6. WEEKLY EMAIL SWITCH
-- ---------------------------------------------------------------------
ALTER TABLE public.money_settings ADD COLUMN IF NOT EXISTS weekly_email boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------
-- 7. DATE HELPERS
-- ---------------------------------------------------------------------
-- Last Sunday of the month containing p_date (the month's own last day if that is a Sunday).
CREATE FUNCTION public.last_sunday_of_month(p_date date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT d - (extract(isodow FROM d)::int % 7)
  FROM (SELECT (date_trunc('month', p_date::timestamp) + interval '1 month' - interval '1 day')::date AS d) x;
$$;

-- ---------------------------------------------------------------------
-- 8. get_reminders: monthly bank check now counts from the previous month's last Sunday
--    (the checkup's money step). Unchanged otherwise (0004 §12).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reminders(p_user_id uuid, p_today date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_today   date := COALESCE(p_today, (now() AT TIME ZONE 'America/New_York')::date);
  v_set     money_settings%ROWTYPE;
  v_tracker jsonb;
  v_items   jsonb := '[]'::jsonb;
  v_prev_month_end date := (date_trunc('month', v_today::timestamp) - interval '1 day')::date;
  v_check_from     date := last_sunday_of_month((date_trunc('month', v_today::timestamp) - interval '1 day')::date);
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
      AND NOT public.tax_quarter_paid(p_user_id, s.tax_period)
  LOOP
    v_items := v_items || jsonb_build_object('key','estimated_tax','period', r.tax_period,'kind','estimated_tax',
      'title', 'Estimated tax due ' || to_char(r.due_date, 'Mon FMDD'),
      'body',  CASE
                 WHEN EXISTS (SELECT 1 FROM cash_transactions c WHERE c.user_id = p_user_id AND c.transaction_type = 'tax_payment'
                              AND c.tax_period = r.tax_period AND c.tax_authority = 'irs')
                   THEN 'Federal payment recorded. PA payment for ' || r.tax_period || ' still to record.'
                 WHEN EXISTS (SELECT 1 FROM cash_transactions c WHERE c.user_id = p_user_id AND c.transaction_type = 'tax_payment'
                              AND c.tax_period = r.tax_period AND c.tax_authority = 'pa')
                   THEN 'PA payment recorded. Federal payment for ' || r.tax_period || ' still to record.'
                 ELSE 'Federal and PA payments for ' || r.tax_period || '. Record them here once paid.' END,
      'due', r.due_date, 'overdue', r.due_date < v_today);
  END LOOP;

  -- d) monthly bank check, from the first Monday of the month, once setup is done.
  --    0031: a check made in the previous month's checkup (on or after its last Sunday) counts.
  v_first_monday := date_trunc('month', v_today::timestamp)::date
                    + ((8 - extract(isodow FROM date_trunc('month', v_today::timestamp))::int) % 7);
  IF v_set.setup_completed_at IS NOT NULL AND v_today >= v_first_monday
     AND v_set.setup_completed_at::date <= v_prev_month_end THEN
    FOR r IN
      SELECT a.id, a.name FROM cash_accounts a
      WHERE a.user_id = p_user_id AND NOT a.archived
        AND NOT EXISTS (SELECT 1 FROM account_reconciliations x WHERE x.account_id = a.id AND x.as_of >= v_check_from)
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
-- 9. CHECKUP STATUS (the only checkup facts the mentor can see: which months are done, and when)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.checkup_done(p_user_id uuid, p_period text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.uid() = p_user_id OR has_mentor_access(p_user_id) OR COALESCE(auth.role(), '') = 'service_role'
          OR (auth.uid() IS NULL AND current_setting('role', true) = 'service_role')) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM monthly_checkups WHERE user_id = p_user_id AND period = p_period);
END; $$;

CREATE FUNCTION public.get_checkup_status(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.uid() = p_user_id OR has_mentor_access(p_user_id)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('period', period, 'completed_at', completed_at) ORDER BY period DESC)
    FROM (SELECT period, completed_at FROM monthly_checkups WHERE user_id = p_user_id ORDER BY period DESC LIMIT 12) q
  ), '[]'::jsonb);
END; $$;

-- ---------------------------------------------------------------------
-- 10. TRIP PROMPTS (shared by get_todo and get_checkup)
--     A show whose date has passed, or a lot bought away from a show, with no trip linked,
--     from launch day (15 Nov 2026), for 21 days. "No drive" = dismiss in reminders_state.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.trip_prompts(p_user_id uuid, p_today date, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (key text, kind text, event_date date, show_id uuid, lot_id uuid, sell_lead_id uuid,
               destination text, purpose text, title text, body text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH win AS (
    SELECT GREATEST(DATE '2026-11-15', COALESCE(p_from, p_today - 21)) AS f, LEAST(p_today, COALESCE(p_to, p_today)) AS t
  ), shows_p AS (
    SELECT 'trip_show:' || s.id AS key, 'trip'::text AS kind, s.show_date AS event_date, s.id AS show_id, NULL::uuid AS lot_id,
           NULL::uuid AS sell_lead_id, COALESCE(NULLIF(btrim(s.location), ''), s.name) AS destination, 'show'::text AS purpose,
           'Log the drive to ' || s.name AS title,
           'Show on ' || to_char(s.show_date, 'Mon FMDD') || '. Round-trip miles are a tax deduction.' AS body
    FROM shows s, win
    WHERE s.user_id = p_user_id AND s.show_date BETWEEN win.f AND win.t AND s.status <> 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM trips tr WHERE tr.show_id = s.id)
  ), lots_p AS (
    SELECT 'trip_lot:' || l.id, 'trip', l.purchase_date, NULL::uuid, l.id, sl.id,
           COALESCE(NULLIF(btrim(sl.seller_name), ''), NULLIF(btrim(l.source), ''), 'Seller'),
           CASE WHEN sl.id IS NOT NULL THEN 'seller_meetup' ELSE 'buying' END,
           'Did you drive to pick up ' || COALESCE('the lot from ' || NULLIF(btrim(sl.seller_name), ''), 'this lot') || '?',
           COALESCE(NULLIF(btrim(l.source), '') || ': b', 'B') || 'ought ' || to_char(l.purchase_date, 'Mon FMDD')
             || ' for $' || to_char(l.total_cost, 'FM999999990.00') || '.'
    FROM lots l
    CROSS JOIN win
    LEFT JOIN LATERAL (SELECT w.id, w.seller_name, w.handoff FROM web_sell_leads w
                       WHERE w.lot_id = l.id AND w.user_id = p_user_id ORDER BY w.updated_at DESC LIMIT 1) sl ON true
    WHERE l.user_id = p_user_id AND l.purchase_date BETWEEN win.f AND win.t AND l.show_id IS NULL
      AND (sl.id IS NULL OR sl.handoff IS DISTINCT FROM 'ship')
      AND NOT EXISTS (SELECT 1 FROM trips tr WHERE tr.lot_id = l.id)
  )
  SELECT p.* FROM (SELECT * FROM shows_p UNION ALL SELECT * FROM lots_p) p
  WHERE NOT EXISTS (SELECT 1 FROM reminders_state s WHERE s.user_id = p_user_id AND s.reminder_key = p.key
                    AND s.period_key = 'once' AND s.dismissed_at IS NOT NULL)
  ORDER BY p.event_date, p.key;
$$;

-- ---------------------------------------------------------------------
-- 11. get_todo: one list = reminders + checkup + trip prompts + typed-in tasks, each with a tier
--     tier: now (overdue / due today / needs doing), week (due within 7 days), later
-- ---------------------------------------------------------------------
CREATE FUNCTION public.get_todo(p_user_id uuid, p_today date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_today date := COALESCE(p_today, (now() AT TIME ZONE 'America/New_York')::date);
  v_items jsonb := '[]'::jsonb;
  v_rem   jsonb;
  v_month date;
  v_per   text;
  v_first boolean;
  r       record;
BEGIN
  -- a) Round 4 reminders (already filtered for dismiss/snooze). Monthly bank checks are added after the checkup
  --    step below: folded into the checkup when one is open, otherwise shown as one card for all accounts.
  FOR v_rem IN SELECT * FROM jsonb_array_elements(get_reminders(p_user_id, v_today)) WHERE value->>'kind' <> 'reconcile' LOOP
    v_items := v_items || (v_rem || jsonb_build_object('tier',
      CASE WHEN v_rem->>'kind' IN ('setup','tax_transfer','reconcile') THEN 'now'
           WHEN (v_rem->>'due') IS NULL THEN 'later'
           WHEN (v_rem->>'due')::date <= v_today THEN 'now'
           WHEN (v_rem->>'due')::date <= v_today + 7 THEN 'week'
           ELSE 'later' END));
  END LOOP;

  -- b) monthly checkups: every month from Nov 2026 whose last Sunday has come and that isn't done
  v_first := NOT EXISTS (SELECT 1 FROM monthly_checkups WHERE user_id = p_user_id)
             AND NOT checkup_done(p_user_id, '2026-11');
  v_month := DATE '2026-11-01';
  WHILE v_month <= v_today LOOP
    v_per := to_char(v_month, 'YYYY-MM');
    IF last_sunday_of_month(v_month) <= v_today AND NOT checkup_done(p_user_id, v_per)
       AND NOT EXISTS (SELECT 1 FROM reminders_state s WHERE s.user_id = p_user_id AND s.reminder_key = 'checkup'
                       AND s.period_key = v_per AND s.snoozed_until IS NOT NULL AND s.snoozed_until > v_today) THEN
      v_items := v_items || jsonb_build_object('key','checkup','period', v_per,'kind','checkup','tier','now',
        'title', to_char(v_month, 'FMMonth') || ' checkup',
        'body', 'About 5 minutes: fees, supplies, sales not entered, drives, and the bank check.',
        'due', last_sunday_of_month(v_month), 'overdue', last_sunday_of_month(v_month) < v_today - 7,
        'first', v_first AND v_per = '2026-11');
    END IF;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;

  -- b2) monthly bank checks
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x WHERE x->>'kind' = 'checkup') THEN
    SELECT jsonb_agg(value) INTO v_rem FROM jsonb_array_elements(get_reminders(p_user_id, v_today)) WHERE value->>'kind' = 'reconcile';
    IF jsonb_array_length(COALESCE(v_rem, '[]'::jsonb)) = 1 THEN
      v_items := v_items || ((v_rem->0) || jsonb_build_object('tier', 'now'));
    ELSIF jsonb_array_length(COALESCE(v_rem, '[]'::jsonb)) > 1 THEN
      v_items := v_items || jsonb_build_object('key', 'reconcile:all', 'period', v_rem->0->>'period', 'kind', 'reconcile',
        'tier', 'now', 'account_id', NULL, 'due', NULL,
        'title', 'Check ' || jsonb_array_length(v_rem) || ' accounts against the bank',
        'body', (SELECT string_agg(replace(replace(x->>'title', 'Check ', ''), ' against the bank', ''), ', ')
                 FROM jsonb_array_elements(v_rem) x) || '. ' || (v_rem->0->>'body'),
        'keys', (SELECT jsonb_agg(x->>'key') FROM jsonb_array_elements(v_rem) x));
    END IF;
  END IF;

  -- c) trip prompts
  FOR r IN SELECT * FROM trip_prompts(p_user_id, v_today) LOOP
    v_items := v_items || jsonb_build_object('key', r.key, 'period', 'once', 'kind', 'trip', 'tier', 'now',
      'title', r.title, 'body', r.body, 'due', r.event_date,
      'trip', jsonb_build_object('trip_date', r.event_date, 'destination', r.destination, 'purpose', r.purpose,
                                 'show_id', r.show_id, 'lot_id', r.lot_id, 'sell_lead_id', r.sell_lead_id));
  END LOOP;

  -- d) typed-in tasks that are not done
  FOR r IN
    SELECT t.* FROM tasks t WHERE t.user_id = p_user_id AND t.done_at IS NULL
    ORDER BY t.due_date NULLS LAST, t.created_at
  LOOP
    v_items := v_items || jsonb_build_object('key', 'task:' || r.id, 'period', 'once', 'kind', 'task',
      'task_id', r.id, 'title', r.title, 'body', COALESCE(r.notes, ''), 'due', r.due_date,
      'urgent', r.urgent, 'created_by', r.created_by, 'added_by_mentor', r.created_by <> r.user_id,
      'overdue', r.due_date IS NOT NULL AND r.due_date < v_today,
      'tier', CASE WHEN r.urgent OR (r.due_date IS NOT NULL AND r.due_date <= v_today) THEN 'now'
                   WHEN r.due_date IS NOT NULL AND r.due_date <= v_today + 7 THEN 'week'
                   ELSE 'later' END);
  END LOOP;

  RETURN COALESCE((
    SELECT jsonb_agg(i ORDER BY CASE i->>'tier' WHEN 'now' THEN 0 WHEN 'week' THEN 1 ELSE 2 END,
                     CASE WHEN i->>'kind' = 'checkup' THEN 0 ELSE 1 END,
                     CASE WHEN (i->>'overdue')::boolean THEN 0 ELSE 1 END, i->>'due' NULLS LAST, ord)
    FROM jsonb_array_elements(v_items) WITH ORDINALITY AS e(i, ord)
  ), '[]'::jsonb);
END; $$;

-- ---------------------------------------------------------------------
-- 12. get_checkup: what the app found for the month, plus the context the screens need (owner only)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.get_checkup(p_period text, p_today date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_today date := COALESCE(p_today, (now() AT TIME ZONE 'America/New_York')::date);
  v_start date;
  v_end   date;
  v_prev  date;
  v_res   jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Bad month'; END IF;
  v_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  v_end   := (v_start + interval '1 month' - interval '1 day')::date;
  v_prev  := (v_start - interval '2 months')::date;

  SELECT jsonb_build_object(
    'period', p_period,
    'month_name', to_char(v_start, 'FMMonth'),
    'start', v_start, 'end', v_end,
    'done', EXISTS (SELECT 1 FROM monthly_checkups WHERE user_id = v_user AND period = p_period),
    'first', NOT EXISTS (SELECT 1 FROM monthly_checkups WHERE user_id = v_user),
    -- shows this month (so far) with no booth fee recorded
    'shows_no_fee', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'show_date', s.show_date) ORDER BY s.show_date)
      FROM shows s
      WHERE s.user_id = v_user AND s.show_date BETWEEN v_start AND LEAST(v_end, v_today) AND s.status <> 'cancelled'
        AND COALESCE(s.table_cost, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.show_id = s.id AND e.category = 'Table / Booth Fees')), '[]'::jsonb),
    -- shows whose date has passed but that are still open (any month)
    'shows_open', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'show_date', s.show_date) ORDER BY s.show_date)
      FROM shows s
      WHERE s.user_id = v_user AND s.show_date < v_today AND s.status IN ('planned','active')), '[]'::jsonb),
    -- categories used in the two months before but not this month
    'missing_categories', COALESCE((
      SELECT jsonb_agg(c ORDER BY c) FROM (
        SELECT DISTINCT e.category AS c FROM expenses e
        WHERE e.user_id = v_user AND e.expense_date >= v_prev AND e.expense_date < v_start
          AND e.category NOT IN ('Other')
        EXCEPT
        SELECT DISTINCT e.category FROM expenses e
        WHERE e.user_id = v_user AND e.expense_date BETWEEN v_start AND v_end) q), '[]'::jsonb),
    -- expenses of $75+ this month without a receipt photo
    'no_receipt', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'category', e.category, 'amount', e.amount, 'expense_date', e.expense_date)
                       ORDER BY e.expense_date)
      FROM expenses e
      WHERE e.user_id = v_user AND e.expense_date BETWEEN v_start AND v_end AND e.amount >= 75
        AND NULLIF(btrim(e.receipt_photo_url), '') IS NULL), '[]'::jsonb),
    -- drives from this month not logged yet
    'trip_prompts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('key', t.key, 'title', t.title, 'body', t.body, 'trip_date', t.event_date,
                                          'destination', t.destination, 'purpose', t.purpose, 'show_id', t.show_id,
                                          'lot_id', t.lot_id, 'sell_lead_id', t.sell_lead_id))
      FROM trip_prompts(v_user, v_today, v_start, v_end) t), '[]'::jsonb),
    'trips_this_month', (SELECT jsonb_build_object('count', count(*), 'miles', COALESCE(sum(miles), 0))
                         FROM trips WHERE user_id = v_user AND trip_date BETWEEN v_start AND v_end),
    'accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind,
               'checked_today', EXISTS (SELECT 1 FROM account_reconciliations x WHERE x.account_id = a.id AND x.as_of >= LEAST(v_today, last_sunday_of_month(v_start))))
             ORDER BY a.sort_order, a.name)
      FROM cash_accounts a WHERE a.user_id = v_user AND NOT a.archived), '[]'::jsonb),
    'this_month', get_dashboard_metrics(v_user, v_start, LEAST(v_end, v_today)),
    'last_month', get_dashboard_metrics(v_user, (v_start - interval '1 month')::date, (v_start - interval '1 day')::date)
  ) INTO v_res;
  RETURN v_res;
END; $$;

-- ---------------------------------------------------------------------
-- 13. complete_checkup: record the finished checkup once (owner only)
--     items_added = rows the owner created while the checkup was open (expenses, sales, cash entries, trips, checks)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.complete_checkup(p_period text, p_started_at timestamptz, p_answers jsonb, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_today   date := (now() AT TIME ZONE 'America/New_York')::date;
  v_start   date;
  v_started timestamptz;
  v_added   integer;
  v_note    text := NULLIF(btrim(p_note), '');
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_period IS NULL OR p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Bad month'; END IF;
  v_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  IF last_sunday_of_month(v_start) > v_today THEN RAISE EXCEPTION 'The % checkup opens on %', to_char(v_start, 'FMMonth'),
       to_char(last_sunday_of_month(v_start), 'Mon FMDD'); END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN RAISE EXCEPTION 'Answers missing'; END IF;
  IF length(p_answers::text) > 8000 THEN RAISE EXCEPTION 'Answers too long'; END IF;
  IF v_note IS NOT NULL AND length(v_note) > 1000 THEN RAISE EXCEPTION 'Note must be 1000 characters or fewer'; END IF;
  -- a checkup can't claim to have been open for more than a day or to start in the future
  v_started := LEAST(now(), GREATEST(COALESCE(p_started_at, now()), now() - interval '24 hours'));

  PERFORM pg_advisory_xact_lock(hashtext('complete_checkup:' || v_user::text || ':' || p_period));
  IF EXISTS (SELECT 1 FROM monthly_checkups WHERE user_id = v_user AND period = p_period) THEN
    RAISE EXCEPTION 'The % checkup is already done', to_char(v_start, 'FMMonth');
  END IF;

  SELECT (SELECT count(*) FROM expenses WHERE user_id = v_user AND created_at >= v_started)
       + (SELECT count(*) FROM transactions WHERE user_id = v_user AND created_at >= v_started AND deleted IS NOT TRUE)
       + (SELECT count(*) FROM cash_transactions WHERE user_id = v_user AND created_at >= v_started
            AND transaction_type IN ('deposit','withdrawal','owner_contribution','owner_draw','reimbursement'))
       + (SELECT count(*) FROM trips WHERE user_id = v_user AND created_at >= v_started)
       + (SELECT count(*) FROM account_reconciliations WHERE user_id = v_user AND created_at >= v_started)
    INTO v_added;

  INSERT INTO monthly_checkups (user_id, period, started_at, answers, items_added, note)
  VALUES (v_user, p_period, v_started, p_answers, v_added, v_note);

  RETURN jsonb_build_object('period', p_period, 'items_added', v_added, 'completed_at', now());
END; $$;

-- ---------------------------------------------------------------------
-- 14. MILEAGE SUMMARY (by month, with the IRS rate for each trip's date)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.get_mileage_summary(p_user_id uuid, p_year int)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (
    SELECT to_char(trip_date, 'YYYY-MM') AS m, miles, round(miles * COALESCE(mileage_rate_for(trip_date), 0), 2) AS ded
    FROM trips WHERE user_id = p_user_id AND trip_date BETWEEN make_date(p_year, 1, 1) AND make_date(p_year, 12, 31)
  )
  SELECT jsonb_build_object(
    'year', p_year,
    'trips', (SELECT count(*) FROM t),
    'miles', (SELECT COALESCE(sum(miles), 0) FROM t),
    'deduction', (SELECT COALESCE(sum(ded), 0) FROM t),
    'months', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', m, 'trips', n, 'miles', mi, 'deduction', d) ORDER BY m DESC)
                        FROM (SELECT m, count(*) n, sum(miles) mi, sum(ded) d FROM t GROUP BY m) g), '[]'::jsonb),
    'rates', (SELECT jsonb_agg(jsonb_build_object('from', effective_from, 'rate', rate, 'source', source) ORDER BY effective_from)
              FROM mileage_rates WHERE extract(year FROM effective_from) = p_year));
$$;

-- ---------------------------------------------------------------------
-- 15. TO DO EMAIL (service role only; the todo-email Edge Function sends, pg_cron runs it hourly)
--     digest: Sundays from 18:00 ET, Now + This week items, once per Sunday (skipped if empty or switched off)
--     urgent: estimated tax due within 3 days and not recorded; tasks marked urgent. Once each.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.todo_email_pending(p_user_id uuid, p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_local timestamp := p_now AT TIME ZONE 'America/New_York';
  v_today date := v_local::date;
  v_todo  jsonb := get_todo(p_user_id, v_today);
  v_out   jsonb := '[]'::jsonb;
  v_items jsonb;
  v_on    boolean := COALESCE((SELECT weekly_email FROM money_settings WHERE user_id = p_user_id), true);
  i       jsonb;
BEGIN
  -- digest
  IF extract(isodow FROM v_today) = 7 AND extract(hour FROM v_local) >= 18
     AND NOT EXISTS (SELECT 1 FROM todo_email_log WHERE user_id = p_user_id AND kind = 'digest' AND period_key = v_today::text) THEN
    SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_items
    FROM jsonb_array_elements(v_todo) x WHERE x->>'tier' IN ('now','week');
    v_out := v_out || jsonb_build_object('kind','digest','period_key', v_today::text,
      'send', v_on AND jsonb_array_length(v_items) > 0,
      'checkup', EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x WHERE x->>'kind' = 'checkup'),
      'items', v_items);
  END IF;
  -- urgent
  FOR i IN SELECT * FROM jsonb_array_elements(v_todo) LOOP
    IF (i->>'kind' = 'estimated_tax' AND (i->>'due')::date <= v_today + 3)
       OR (i->>'kind' = 'task' AND (i->>'urgent')::boolean) THEN
      IF NOT EXISTS (SELECT 1 FROM todo_email_log WHERE user_id = p_user_id AND kind = 'urgent'
                     AND period_key = (i->>'key') || ':' || (i->>'period')) THEN
        v_out := v_out || jsonb_build_object('kind','urgent','period_key', (i->>'key') || ':' || (i->>'period'),
                                             'send', true, 'items', jsonb_build_array(i));
      END IF;
    END IF;
  END LOOP;
  RETURN v_out;
END; $$;

CREATE FUNCTION public.todo_email_mark(p_user_id uuid, p_kind text, p_period_key text, p_status text, p_item_count int)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO todo_email_log (user_id, kind, period_key, status, item_count)
  VALUES (p_user_id, p_kind, p_period_key, p_status, COALESCE(p_item_count, 0))
  ON CONFLICT (user_id, kind, period_key) DO NOTHING
  RETURNING true;
$$;

CREATE FUNCTION public.todo_email_tick() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT net.http_post(url := 'https://dtfizpxtpsmqqzpactdh.supabase.co/functions/v1/todo-email',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 60000);
$$;

-- ---------------------------------------------------------------------
-- 16. GRANTS (0004 §13: nothing runs for anon; the email functions are service role only)
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.mileage_rate_for(date), public.last_sunday_of_month(date),
  public.checkup_done(uuid, text), public.get_checkup_status(uuid), public.trip_prompts(uuid, date, date, date),
  public.get_todo(uuid, date), public.get_checkup(text, date), public.complete_checkup(text, timestamptz, jsonb, text),
  public.get_mileage_summary(uuid, int), public.todo_email_pending(uuid, timestamptz),
  public.todo_email_mark(uuid, text, text, text, int), public.todo_email_tick(),
  public.trips_guard(), public.tasks_guard() FROM PUBLIC, anon;
-- Supabase's default privileges also give every new function to authenticated: take the server-only ones back.
REVOKE EXECUTE ON FUNCTION public.todo_email_pending(uuid, timestamptz), public.todo_email_mark(uuid, text, text, text, int),
  public.todo_email_tick(), public.trips_guard(), public.tasks_guard() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mileage_rate_for(date), public.last_sunday_of_month(date),
  public.checkup_done(uuid, text), public.get_checkup_status(uuid), public.trip_prompts(uuid, date, date, date),
  public.get_todo(uuid, date), public.get_checkup(text, date), public.complete_checkup(text, timestamptz, jsonb, text),
  public.get_mileage_summary(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mileage_rate_for(date), public.last_sunday_of_month(date),
  public.checkup_done(uuid, text), public.trip_prompts(uuid, date, date, date), public.get_todo(uuid, date),
  public.todo_email_pending(uuid, timestamptz), public.todo_email_mark(uuid, text, text, text, int) TO service_role;

-- Scheduled once the todo-email function is deployed (hourly at :31, so the Sunday digest goes about 6:31 pm ET):
-- SELECT cron.schedule('todo-email', '31 * * * *', 'select public.todo_email_tick()');
