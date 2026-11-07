-- 0021: Most Wanted page, Direction A (Wanted posters + checklist).
--  * Colton stars up to 6 players as "Top targets" in EndZone (Website → Most Wanted). Each can carry a
--    short stamp line such as "ROOKIES · AUTOS". top_rank keeps them in the order he starred them.
--  * get_website_lists() now also returns, for each wanted player: top (rank or null), stamp, and big
--    (the stat line of their latest big game in the last 8 days, from web_big_games, or null).
--    Big games hidden from the ticker in EndZone don't earn a badge either.

ALTER TABLE public.website_wanted
  ADD COLUMN top_rank smallint,
  ADD COLUMN stamp text,
  ADD CONSTRAINT website_wanted_stamp_len CHECK (stamp IS NULL OR char_length(stamp) BETWEEN 1 AND 28),
  ADD CONSTRAINT website_wanted_top_rank_pos CHECK (top_rank IS NULL OR top_rank > 0);

-- At most 6 top targets per account.
CREATE OR REPLACE FUNCTION public.website_wanted_top_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.top_rank IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.top_rank IS NULL) THEN
    PERFORM pg_advisory_xact_lock(hashtext('website_wanted_top:' || NEW.user_id::text));
    IF (SELECT count(*) FROM website_wanted
        WHERE user_id = NEW.user_id AND top_rank IS NOT NULL AND id <> NEW.id) >= 6 THEN
      RAISE EXCEPTION 'TOP_TARGETS_FULL' USING HINT = 'Six top targets already. Unstar one first.';
    END IF;
  END IF;
  NEW.stamp := nullif(btrim(regexp_replace(coalesce(NEW.stamp, ''), '\s+', ' ', 'g')), '');
  RETURN NEW;
END; $$;

CREATE TRIGGER website_wanted_top_limit BEFORE INSERT OR UPDATE ON public.website_wanted
  FOR EACH ROW EXECUTE FUNCTION public.website_wanted_top_limit();

CREATE OR REPLACE FUNCTION public.get_website_lists()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH w AS (SELECT owner_user_id, headliner_card_id, headliner_note FROM website_settings LIMIT 1),
  today AS (SELECT (now() AT TIME ZONE 'America/New_York')::date d),
  big AS (
    SELECT DISTINCT ON (ww.id) ww.id, g.line
    FROM website_wanted ww, w, web_big_games g
    WHERE ww.user_id = w.owner_user_id
      AND NOT g.hidden AND g.game_at > now() - interval '8 days'
      AND g.league = CASE ww.sport WHEN 'Football' THEN 'nfl' WHEN 'Men''s Basketball' THEN 'nba'
                                   WHEN 'Women''s Basketball' THEN 'wnba' WHEN 'Baseball' THEN 'mlb'
                                   WHEN 'Hockey' THEN 'nhl' END
      AND g.name_key = web_name_key(regexp_replace(ww.player_name, '\s+(Jr\.?|Sr\.?|II|III|IV|V)$', '', 'i'))
    ORDER BY ww.id, g.game_at DESC, g.score DESC
  )
  SELECT jsonb_build_object(
    'wanted', coalesce((
      SELECT jsonb_agg(jsonb_build_object('sport', ww.sport, 'position', ww.position, 'player', ww.player_name,
                                          'top', ww.top_rank, 'stamp', ww.stamp, 'big', big.line)
             ORDER BY array_position(ARRAY['Football','Men''s Basketball','Women''s Basketball','Baseball','Hockey','Soccer','Other'], ww.sport),
                      g.first_order, lower(ww.position), lower(ww.player_name))
      FROM website_wanted ww
      JOIN (SELECT sport, lower(position) pos, min(sort_order) first_order FROM website_wanted, w
            WHERE user_id = w.owner_user_id GROUP BY 1, 2) g ON g.sport = ww.sport AND g.pos = lower(ww.position)
      LEFT JOIN big ON big.id = ww.id
      , w WHERE ww.user_id = w.owner_user_id), '[]'::jsonb),
    'wanted_updated', (SELECT max(updated_at) FROM website_wanted, w WHERE user_id = w.owner_user_id),
    'shows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', s.name, 'location', s.location, 'start', s.start_date,
                                          'end', s.end_date, 'kind', s.kind) ORDER BY s.start_date, s.name)
      FROM website_shows s, w, today
      WHERE s.user_id = w.owner_user_id AND coalesce(s.end_date, s.start_date) >= today.d), '[]'::jsonb),
    'headliner', (
      SELECT jsonb_build_object(
        'id', c.id, 'player_name', btrim(c.player_name), 'year', c.year,
        'brand', nullif(btrim(c.card_details->>'brand'), ''), 'set_name', nullif(btrim(c.card_details->>'set'), ''),
        'parallel', nullif(btrim(c.card_details->>'parallel'), ''), 'card_number', nullif(btrim(c.card_details->>'card_number'), ''),
        'condition', nullif(btrim(c.card_details->>'condition'), ''),
        'rookie', coalesce(c.card_details->'rookie' = 'true'::jsonb, false),
        'autograph', coalesce(c.card_details->'autograph' = 'true'::jsonb, false),
        'serial_number', nullif(btrim(c.card_details->>'serial_number'), ''),
        'sport', c.sport, 'team', c.team, 'price', c.asking_price,
        'photo_front_url', CASE WHEN c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_front_url END,
        'sold', c.status = 'sold',
        'note', nullif(btrim(w.headliner_note), ''))
      FROM w JOIN show_cards c ON c.id = w.headliner_card_id AND c.user_id = w.owner_user_id
      WHERE c.show_on_website AND c.status IN ('available', 'sold'))
  );
$function$;
