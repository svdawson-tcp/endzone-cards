-- 0036 Area shows (20 Nov 2026): other card shows near Harrisburg on the site's Shows page.
-- kind 'area' = a show Colton isn't going to, listed for collectors. Shows pulled from public listings
-- start unapproved (approved = false) until Colton checks them in EndZone (Website → Shows).
ALTER TABLE public.website_shows
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.website_shows DROP CONSTRAINT IF EXISTS website_shows_kind_check;
ALTER TABLE public.website_shows
  ADD CONSTRAINT website_shows_kind_check CHECK (kind IN ('buying', 'table', 'area')),
  ADD CONSTRAINT website_shows_start_time_check CHECK (start_time IS NULL OR length(start_time) <= 30),
  ADD CONSTRAINT website_shows_link_check CHECK (link IS NULL OR (link ~ '^https://' AND length(link) <= 300)),
  ADD CONSTRAINT website_shows_source_check CHECK (source IS NULL OR length(source) <= 60);

-- Public feed: 'shows' stays Colton's own (buying / table) so the home page's "next show" is unchanged;
-- 'area_shows' adds approved area listings.
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
                                          'end', s.end_date, 'kind', s.kind, 'time', s.start_time, 'link', s.link)
                       ORDER BY s.start_date, s.name)
      FROM website_shows s, w, today
      WHERE s.user_id = w.owner_user_id AND s.kind IN ('buying', 'table') AND s.approved
        AND coalesce(s.end_date, s.start_date) >= today.d), '[]'::jsonb),
    'area_shows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', s.name, 'location', s.location, 'start', s.start_date,
                                          'end', s.end_date, 'time', s.start_time, 'link', s.link)
                       ORDER BY s.start_date, s.name)
      FROM website_shows s, w, today
      WHERE s.user_id = w.owner_user_id AND s.kind = 'area' AND s.approved
        AND coalesce(s.end_date, s.start_date) >= today.d
        AND s.start_date <= today.d + 120), '[]'::jsonb),
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
