-- =====================================================================
-- EndZone 0016 — "Big games" ticker for cssportscards.com (Scott & Colton, 4 Nov 2026)
-- The big-games edge function reads finished NFL / NBA / WNBA / MLB box scores from ESPN every hour and
-- stores standout stat lines here (e.g. Joe Burrow 462 pass yds, 5 TD). The website shows only the ones
-- for players Colton has cards listed for, with how many cards: "→ 2 CARDS IN THE CASE".
-- Matching to inventory happens when the site asks (get_big_games), so cards listed later light up too.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- "C.J. Stroud Rookie Lot" -> "cj stroud rookie lot"; "Luka Dončić" -> "luka doncic"
CREATE FUNCTION public.web_name_key(p text) RETURNS text
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(extensions.unaccent(coalesce(p, ''))), '[.''’]', '', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

CREATE TABLE public.web_big_games (
  id          bigserial PRIMARY KEY,
  league      text NOT NULL CHECK (league IN ('nfl', 'nba', 'wnba', 'mlb')),
  sport       text NOT NULL CHECK (sport IN ('football', 'basketball', 'baseball')),
  event_id    text NOT NULL,
  athlete_id  text NOT NULL,
  player      text NOT NULL,           -- ESPN display name, e.g. "Joe Burrow"
  name_key    text NOT NULL,           -- web_name_key of the name without Jr./III, e.g. "joe burrow"
  line        text NOT NULL,           -- "462 pass yds, 5 TD"
  opponent    text NOT NULL,           -- "vs TEN" or "@ TEN"
  game_at     timestamptz NOT NULL,
  score       numeric NOT NULL DEFAULT 0,  -- how big the game was, for ordering
  hidden      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league, event_id, athlete_id)
);
CREATE INDEX idx_web_big_games_recent ON public.web_big_games (game_at DESC) WHERE NOT hidden;

-- name_key: the ESPN name without Jr./Sr./II/III, keyed the same way as card player names
CREATE FUNCTION public.web_big_games_set_key() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.name_key := web_name_key(regexp_replace(NEW.player, '\s+(Jr\.?|Sr\.?|II|III|IV|V)$', '', 'i'));
  RETURN NEW;
END; $$;
CREATE TRIGGER web_big_games_set_key BEFORE INSERT OR UPDATE OF player ON public.web_big_games
  FOR EACH ROW EXECUTE FUNCTION public.web_big_games_set_key();

-- games already read (so each box score is fetched once)
CREATE TABLE public.web_big_game_events (
  league       text NOT NULL,
  event_id     text NOT NULL,
  lines        integer NOT NULL DEFAULT 0,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league, event_id)
);

ALTER TABLE public.web_big_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_big_game_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_big_games, public.web_big_game_events FROM anon, authenticated;
-- Colton (and his mentor) can see the lines in EndZone; changes go through web_hide_big_game.
CREATE POLICY "Signed-in users can view big games" ON public.web_big_games FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.web_big_games TO authenticated;

-- ---------- website: recent big games for players with cards listed (newest first, at most 15)
CREATE FUNCTION public.get_big_games()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH shop AS (
    SELECT s.sport, s.in_bin, ' ' || web_name_key(s.player_name) || ' ' AS k FROM get_shop_cards() s
  ), hits AS (
    SELECT g.id, g.league, g.player, g.line, g.opponent, g.game_at, g.score,
           count(*) FILTER (WHERE NOT shop.in_bin) AS case_cards,
           count(*) FILTER (WHERE shop.in_bin) AS bin_cards
    FROM web_big_games g
    JOIN shop ON shop.sport = g.sport AND shop.k LIKE '% ' || g.name_key || ' %'
    WHERE NOT g.hidden AND g.game_at > now() - interval '8 days'
    GROUP BY g.id
    ORDER BY g.game_at DESC, g.score DESC
    LIMIT 15
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'league', league, 'player', player, 'line', line, 'opponent', opponent, 'game_at', game_at,
           'search', regexp_replace(player, '\s+(Jr\.?|Sr\.?|II|III|IV|V)$', '', 'i'),
           'case_cards', case_cards, 'bin_cards', bin_cards)
         ORDER BY game_at DESC, score DESC), '[]'::jsonb)
  FROM hits;
$$;
REVOKE ALL ON FUNCTION public.get_big_games() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_big_games() TO anon, authenticated, service_role;

-- ---------- EndZone: hide (or unhide) a line, e.g. a wrong-player match
CREATE FUNCTION public.web_hide_big_game(p_id bigint, p_hidden boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM website_settings WHERE owner_user_id = auth.uid()) THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  UPDATE web_big_games SET hidden = p_hidden WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.web_hide_big_game(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_hide_big_game(bigint, boolean) TO authenticated;

-- ---------- hourly: ask the big-games function to read new finished games
CREATE FUNCTION public.web_big_games_tick() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT net.http_post(url := 'https://dtfizpxtpsmqqzpactdh.supabase.co/functions/v1/big-games',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 120000);
$$;
REVOKE ALL ON FUNCTION public.web_big_games_tick() FROM PUBLIC, anon, authenticated;
