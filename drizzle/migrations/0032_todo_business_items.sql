-- =====================================================================
-- EndZone 0032 — To Do, build 2 (Scott, 15 Nov 2026): the items Colton picked (1–5, 10, 11)
-- Builds on 0031 (AD-012). Every item is computed and clears itself, except where noted.
--
--  1. Got Cards? submissions waiting for a reply (urgent email at 20 hours; the promise is 24)
--  2. Offers waiting for Colton's answer (pending = below the auto-accept floor)
--  3. Paid website orders not marked shipped (paid from 15 Nov 2026; the six earlier ones are with Colton)
--  4. Table shows on the website schedule: pay the table fee (7 days before), get ready (2 days before)
--  5. EndZone shows over but still open: close them (from 15 Nov); one card for the older ones
--  +  Drive prompts for website-schedule shows (buying trips aren't EndZone shows)
-- 10. Weekly Headliner unchanged for 7 days
-- 11. Most Wanted list unchanged for 7 days
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. When the Headliner and the Most Wanted list last changed
-- ---------------------------------------------------------------------
ALTER TABLE public.website_settings
  ADD COLUMN IF NOT EXISTS headliner_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS wanted_changed_at timestamptz;
-- Starting points: the Headliner's last change isn't recorded, so count from today; Most Wanted from its newest row.
UPDATE public.website_settings SET headliner_changed_at = now() WHERE headliner_changed_at IS NULL;
UPDATE public.website_settings s SET wanted_changed_at = (
  SELECT max(GREATEST(w.created_at, w.updated_at)) FROM public.website_wanted w WHERE w.user_id = s.owner_user_id)
WHERE wanted_changed_at IS NULL;

CREATE FUNCTION public.website_headliner_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.headliner_card_id IS DISTINCT FROM OLD.headliner_card_id OR NEW.headliner_note IS DISTINCT FROM OLD.headliner_note THEN
    NEW.headliner_changed_at := now();
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER website_headliner_touch BEFORE UPDATE ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.website_headliner_touch();

CREATE FUNCTION public.website_wanted_touch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE website_settings SET wanted_changed_at = now()
  WHERE owner_user_id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN NULL;
END; $$;
CREATE TRIGGER website_wanted_touch AFTER INSERT OR UPDATE OR DELETE ON public.website_wanted
  FOR EACH ROW EXECUTE FUNCTION public.website_wanted_touch();

-- Read for To Do (website_settings is owner-only; the mentor sees the same dates)
CREATE FUNCTION public.website_freshness(p_user_id uuid)
RETURNS TABLE (headliner_changed_at timestamptz, wanted_changed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.headliner_changed_at, s.wanted_changed_at FROM website_settings s
  WHERE s.owner_user_id = p_user_id
    AND (auth.uid() = p_user_id OR has_mentor_access(p_user_id) OR COALESCE(auth.role(), '') = 'service_role'
         OR (auth.uid() IS NULL AND current_setting('role', true) = 'service_role'))
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- 2. Trips can point at a show on the website schedule
-- ---------------------------------------------------------------------
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS website_show_id uuid REFERENCES public.website_shows(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS trips_website_show_idx ON public.trips (website_show_id) WHERE website_show_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trips_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
  IF NEW.website_show_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM website_shows WHERE id = NEW.website_show_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Show not found';
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

-- ---------------------------------------------------------------------
-- 3. Drive prompts: add shows on the website schedule (not already an EndZone show that day)
-- ---------------------------------------------------------------------
DROP FUNCTION public.trip_prompts(uuid, date, date, date);
CREATE FUNCTION public.trip_prompts(p_user_id uuid, p_today date, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (key text, kind text, event_date date, show_id uuid, lot_id uuid, sell_lead_id uuid,
               destination text, purpose text, title text, body text, website_show_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH win AS (
    SELECT GREATEST(DATE '2026-11-15', COALESCE(p_from, p_today - 21)) AS f, LEAST(p_today, COALESCE(p_to, p_today)) AS t
  ), shows_p AS (
    SELECT 'trip_show:' || s.id AS key, 'trip'::text AS kind, s.show_date AS event_date, s.id AS show_id, NULL::uuid AS lot_id,
           NULL::uuid AS sell_lead_id, COALESCE(NULLIF(btrim(s.location), ''), s.name) AS destination, 'show'::text AS purpose,
           'Log the drive to ' || s.name AS title,
           'Show on ' || to_char(s.show_date, 'Mon FMDD') || '. Round-trip miles are a tax deduction.' AS body,
           NULL::uuid AS website_show_id
    FROM shows s, win
    WHERE s.user_id = p_user_id AND s.show_date BETWEEN win.f AND win.t AND s.status <> 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM trips tr WHERE tr.show_id = s.id)
  ), web_p AS (
    SELECT 'trip_wshow:' || w.id, 'trip', w.start_date, NULL::uuid, NULL::uuid, NULL::uuid,
           COALESCE(NULLIF(btrim(w.location), ''), w.name),
           CASE WHEN w.kind = 'table' THEN 'show' ELSE 'buying' END,
           'Log the drive to ' || w.name,
           CASE WHEN w.kind = 'table' THEN 'Show' ELSE 'Buying trip' END || ' on ' || to_char(w.start_date, 'Mon FMDD')
             || '. Round-trip miles are a tax deduction.',
           w.id
    FROM website_shows w, win
    WHERE w.user_id = p_user_id AND w.start_date BETWEEN win.f AND win.t
      AND NOT EXISTS (SELECT 1 FROM trips tr WHERE tr.website_show_id = w.id)
      AND NOT EXISTS (SELECT 1 FROM shows s WHERE s.user_id = p_user_id AND s.show_date = w.start_date AND s.status <> 'cancelled')
  ), lots_p AS (
    SELECT 'trip_lot:' || l.id, 'trip', l.purchase_date, NULL::uuid, l.id, sl.id,
           COALESCE(NULLIF(btrim(sl.seller_name), ''), NULLIF(btrim(l.source), ''), 'Seller'),
           CASE WHEN sl.id IS NOT NULL THEN 'seller_meetup' ELSE 'buying' END,
           'Did you drive to pick up ' || COALESCE('the lot from ' || NULLIF(btrim(sl.seller_name), ''), 'this lot') || '?',
           COALESCE(NULLIF(btrim(l.source), '') || ': b', 'B') || 'ought ' || to_char(l.purchase_date, 'Mon FMDD')
             || ' for $' || to_char(l.total_cost, 'FM999999990.00') || '.',
           NULL::uuid
    FROM lots l
    CROSS JOIN win
    LEFT JOIN LATERAL (SELECT w.id, w.seller_name, w.handoff FROM web_sell_leads w
                       WHERE w.lot_id = l.id AND w.user_id = p_user_id ORDER BY w.updated_at DESC LIMIT 1) sl ON true
    WHERE l.user_id = p_user_id AND l.purchase_date BETWEEN win.f AND win.t AND l.show_id IS NULL
      AND (sl.id IS NULL OR sl.handoff IS DISTINCT FROM 'ship')
      AND NOT EXISTS (SELECT 1 FROM trips tr WHERE tr.lot_id = l.id)
      -- a lot bought at a website-schedule show that day is covered by that show's prompt
      AND NOT EXISTS (SELECT 1 FROM website_shows w WHERE w.user_id = p_user_id AND w.start_date = l.purchase_date)
  )
  SELECT p.* FROM (SELECT * FROM shows_p UNION ALL SELECT * FROM web_p UNION ALL SELECT * FROM lots_p) p
  WHERE NOT EXISTS (SELECT 1 FROM reminders_state s WHERE s.user_id = p_user_id AND s.reminder_key = p.key
                    AND s.period_key = 'once' AND s.dismissed_at IS NOT NULL)
  ORDER BY p.event_date, p.key;
$$;

-- ---------------------------------------------------------------------
-- 4. The business items (1–5, 10, 11) as To Do items
-- ---------------------------------------------------------------------
CREATE FUNCTION public.todo_business_items(p_user_id uuid, p_today date, p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_items jsonb := '[]'::jsonb;
  v_launch constant date := DATE '2026-11-15';
  v_fresh record;
  v_old   jsonb;
  r       record;
BEGIN
  -- 1. Got Cards? submissions with no reply yet (24-hour promise)
  FOR r IN
    SELECT l.id, l.seller_name, l.card_count, l.created_at,
           extract(epoch FROM (p_now - l.created_at)) / 3600.0 AS hours
    FROM web_sell_leads l WHERE l.user_id = p_user_id AND l.status = 'new' ORDER BY l.created_at
  LOOP
    v_items := v_items || jsonb_build_object('key', 'sell_lead:' || r.id, 'period', 'once', 'kind', 'sell_lead', 'tier', 'now',
      'title', 'Reply to ' || COALESCE(NULLIF(btrim(r.seller_name), ''), 'a seller') || ' (Got Cards?)',
      'body', COALESCE(r.card_count::text || ' cards. ', '') || 'Sent '
              || to_char(r.created_at AT TIME ZONE 'America/New_York', 'Mon FMDD at FMHH12:MI AM')
              || CASE WHEN r.hours >= 24 THEN '. Past the 24-hour reply promise.'
                      ELSE '. Reply by ' || to_char((r.created_at + interval '24 hours') AT TIME ZONE 'America/New_York', 'Dy FMHH12:MI AM') || '.' END,
      'due', ((r.created_at + interval '24 hours') AT TIME ZONE 'America/New_York')::date,
      'overdue', r.hours >= 24, 'hours_waiting', round(r.hours::numeric, 2), 'link', '/sellers');
  END LOOP;

  -- 2. Offers waiting for an answer
  FOR r IN
    SELECT o.id, o.buyer_name, o.amount, o.floor_at_offer, o.created_at, c.player_name
    FROM web_offers o LEFT JOIN show_cards c ON c.id = o.show_card_id
    WHERE o.user_id = p_user_id AND o.status = 'pending' ORDER BY o.created_at
  LOOP
    v_items := v_items || jsonb_build_object('key', 'offer:' || r.id, 'period', 'once', 'kind', 'offer', 'tier', 'now',
      'title', 'Answer ' || COALESCE(NULLIF(btrim(r.buyer_name), ''), 'a buyer') || '''s $' || to_char(r.amount, 'FM999999990.00') || ' offer',
      'body', COALESCE('On ' || r.player_name || '. ', '')
              || COALESCE('Below your $' || to_char(r.floor_at_offer, 'FM999999990.00') || ' floor. ', '')
              || 'Accept, counter or decline.',
      'due', (r.created_at AT TIME ZONE 'America/New_York')::date, 'link', '/offers');
  END LOOP;

  -- 3. Paid website orders not marked shipped (from launch day)
  FOR r IN
    SELECT o.id, o.order_number, o.buyer_name, o.total, o.paid_at
    FROM web_orders o
    WHERE o.user_id = p_user_id AND o.status = 'paid' AND o.shipped_at IS NULL
      AND (o.paid_at AT TIME ZONE 'America/New_York')::date >= v_launch
    ORDER BY o.paid_at
  LOOP
    v_items := v_items || jsonb_build_object('key', 'order:' || r.id, 'period', 'once', 'kind', 'order', 'tier', 'now',
      'title', 'Ship ' || r.order_number || COALESCE(' to ' || NULLIF(btrim(r.buyer_name), ''), ''),
      'body', 'Paid ' || to_char(r.paid_at AT TIME ZONE 'America/New_York', 'Mon FMDD') || ', $' || to_char(r.total, 'FM999999990.00')
              || '. Mark it shipped with the tracking number.',
      'due', (r.paid_at AT TIME ZONE 'America/New_York')::date,
      'overdue', (r.paid_at AT TIME ZONE 'America/New_York')::date < p_today - 2, 'link', '/web-orders');
  END LOOP;

  -- 4. Table shows on the website schedule: fee from 7 days out, get ready from 2 days out
  FOR r IN
    SELECT w.id, w.name, w.location, w.start_date FROM website_shows w
    WHERE w.user_id = p_user_id AND w.kind = 'table' AND w.start_date BETWEEN p_today AND p_today + 7
    ORDER BY w.start_date
  LOOP
    v_items := v_items || jsonb_build_object('key', 'show_fee:' || r.id, 'period', 'once', 'kind', 'show_fee',
      'tier', CASE WHEN r.start_date <= p_today + 2 THEN 'now' ELSE 'week' END,
      'title', 'Pay the table fee for ' || r.name,
      'body', to_char(r.start_date, 'Dy Mon FMDD') || COALESCE(' at ' || NULLIF(btrim(r.location), ''), '') || '.',
      'due', r.start_date, 'show_date', r.start_date, 'website_show_id', r.id);
    IF r.start_date <= p_today + 2 THEN
      v_items := v_items || jsonb_build_object('key', 'show_prep:' || r.id, 'period', 'once', 'kind', 'show_prep', 'tier', 'now',
        'title', 'Get ready for ' || r.name,
        'body', 'Pull inventory and check supplies'
                || CASE WHEN EXISTS (SELECT 1 FROM shows s WHERE s.user_id = p_user_id AND s.show_date = r.start_date)
                        THEN '.' ELSE ', and add the show in EndZone so sales land on it.' END,
        'due', r.start_date, 'show_date', r.start_date, 'website_show_id', r.id,
        'needs_show', NOT EXISTS (SELECT 1 FROM shows s WHERE s.user_id = p_user_id AND s.show_date = r.start_date));
    END IF;
  END LOOP;

  -- 5. EndZone shows that are over but still open (from launch day) ...
  FOR r IN
    SELECT s.id, s.name, s.show_date FROM shows s
    WHERE s.user_id = p_user_id AND s.status IN ('planned','active') AND s.show_date >= v_launch AND s.show_date < p_today
    ORDER BY s.show_date
  LOOP
    v_items := v_items || jsonb_build_object('key', 'show_close:' || r.id, 'period', 'once', 'kind', 'show_close', 'tier', 'now',
      'title', 'Close ' || r.name,
      'body', 'Count the cash box and check the booth fee is logged, then close the show so its results are final.',
      'due', r.show_date, 'show_id', r.id, 'link', '/shows/' || r.id);
  END LOOP;
  -- ... and one card for the older ones
  SELECT jsonb_agg(s.id ORDER BY s.show_date) INTO v_old FROM shows s
  WHERE s.user_id = p_user_id AND s.status IN ('planned','active') AND s.show_date < v_launch;
  IF jsonb_array_length(COALESCE(v_old, '[]'::jsonb)) > 0 THEN
    v_items := v_items || jsonb_build_object('key', 'old_shows', 'period', 'once', 'kind', 'old_shows', 'tier', 'later',
      'title', jsonb_array_length(v_old) || ' older show' || CASE WHEN jsonb_array_length(v_old) = 1 THEN ' is' ELSE 's are' END
               || ' still open',
      'body', 'From before Nov 15. Close them in one tap so their results are final.',
      'due', NULL, 'show_ids', v_old);
  END IF;

  -- 10/11. Website upkeep: 7 days after the last change ("keep it" snoozes a week)
  SELECT * INTO v_fresh FROM website_freshness(p_user_id);
  IF FOUND THEN
    IF v_fresh.headliner_changed_at IS NULL OR v_fresh.headliner_changed_at < p_now - interval '7 days' THEN
      v_items := v_items || jsonb_build_object('key', 'headliner', 'period', 'weekly', 'kind', 'headliner', 'tier', 'week',
        'title', 'Pick this week''s Weekly Headliner',
        'body', 'Last changed ' || COALESCE(to_char(v_fresh.headliner_changed_at AT TIME ZONE 'America/New_York', 'Mon FMDD'), 'a while ago') || '.',
        'due', NULL, 'link', '/website?tab=headliner');
    END IF;
    IF v_fresh.wanted_changed_at IS NULL OR v_fresh.wanted_changed_at < p_now - interval '7 days' THEN
      v_items := v_items || jsonb_build_object('key', 'wanted', 'period', 'weekly', 'kind', 'wanted', 'tier', 'week',
        'title', 'Look over the Most Wanted list',
        'body', 'Last changed ' || COALESCE(to_char(v_fresh.wanted_changed_at AT TIME ZONE 'America/New_York', 'Mon FMDD'), 'a while ago') || '.',
        'due', NULL, 'link', '/website?tab=wanted');
    END IF;
  END IF;

  -- drop dismissed or snoozed ones
  RETURN COALESCE((
    SELECT jsonb_agg(i ORDER BY ord) FROM jsonb_array_elements(v_items) WITH ORDINALITY AS e(i, ord)
    WHERE NOT EXISTS (SELECT 1 FROM reminders_state s WHERE s.user_id = p_user_id AND s.reminder_key = i->>'key'
                      AND s.period_key = i->>'period'
                      AND (s.dismissed_at IS NOT NULL OR (s.snoozed_until IS NOT NULL AND s.snoozed_until > p_today)))
  ), '[]'::jsonb);
END; $$;

-- ---------------------------------------------------------------------
-- 5. get_todo: add the business items and the website-show drive link (otherwise as 0031)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_todo(p_user_id uuid, p_today date DEFAULT NULL)
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
                                 'show_id', r.show_id, 'lot_id', r.lot_id, 'sell_lead_id', r.sell_lead_id,
                                 'website_show_id', r.website_show_id));
  END LOOP;

  -- c2) customers, shows and website upkeep (0032)
  v_items := v_items || todo_business_items(p_user_id, v_today);

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
-- 6. get_checkup: its drive list carries the website-show link (otherwise as 0031)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_checkup(p_period text, p_today date DEFAULT NULL)
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
                                          'lot_id', t.lot_id, 'sell_lead_id', t.sell_lead_id,
                                          'website_show_id', t.website_show_id))
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
-- 7. Urgent email: a Got Cards? submission waiting 20 hours or more (the promise is 24)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.todo_email_pending(p_user_id uuid, p_now timestamptz DEFAULT now())
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
  -- the hours a seller has waited depend on the time, not just the day
  v_todo := (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(v_todo) x WHERE x->>'kind' <> 'sell_lead')
            || (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(todo_business_items(p_user_id, v_today, p_now)) x
                WHERE x->>'kind' = 'sell_lead');
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
       OR (i->>'kind' = 'task' AND (i->>'urgent')::boolean)
       OR (i->>'kind' = 'sell_lead' AND (i->>'hours_waiting')::numeric >= 20) THEN
      IF NOT EXISTS (SELECT 1 FROM todo_email_log WHERE user_id = p_user_id AND kind = 'urgent'
                     AND period_key = (i->>'key') || ':' || (i->>'period')) THEN
        v_out := v_out || jsonb_build_object('kind','urgent','period_key', (i->>'key') || ':' || (i->>'period'),
                                             'send', true, 'items', jsonb_build_array(i));
      END IF;
    END IF;
  END LOOP;
  RETURN v_out;
END; $$;

-- ---------------------------------------------------------------------
-- 8. GRANTS
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.website_freshness(uuid), public.trip_prompts(uuid, date, date, date),
  public.todo_business_items(uuid, date, timestamptz), public.website_headliner_touch(), public.website_wanted_touch()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.website_headliner_touch(), public.website_wanted_touch() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.website_freshness(uuid), public.trip_prompts(uuid, date, date, date),
  public.todo_business_items(uuid, date, timestamptz) TO authenticated, service_role;
