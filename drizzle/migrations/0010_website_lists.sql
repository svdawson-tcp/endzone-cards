-- =====================================================================
-- EndZone 0010 — Colton edits the website's Most Wanted list and show schedule in EndZone.
-- cssportscards.com reads both through get_website_lists() (public, read-only).
-- =====================================================================

-- ---------- Most Wanted: one row per player, grouped by sport and position
CREATE TABLE public.website_wanted (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sport       text NOT NULL CHECK (sport IN ('Football','Men''s Basketball','Women''s Basketball','Baseball','Hockey','Soccer','Other')),
  position    text NOT NULL CHECK (length(btrim(position)) BETWEEN 1 AND 40),
  player_name text NOT NULL CHECK (length(btrim(player_name)) BETWEEN 1 AND 60),
  sort_order  integer NOT NULL DEFAULT 0,  -- orders the position groups (players are A–Z)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX website_wanted_unique ON public.website_wanted (user_id, sport, lower(position), lower(player_name));

-- ---------- Show schedule shown on the website (separate from EndZone's money "Shows")
CREATE TABLE public.website_shows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  location    text CHECK (location IS NULL OR length(location) <= 80),
  start_date  date NOT NULL,
  end_date    date CHECK (end_date IS NULL OR end_date >= start_date),
  kind        text NOT NULL DEFAULT 'buying' CHECK (kind IN ('buying','table')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX website_shows_user_date ON public.website_shows (user_id, start_date);

CREATE TRIGGER update_website_wanted_updated_at BEFORE UPDATE ON public.website_wanted
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_website_shows_updated_at BEFORE UPDATE ON public.website_shows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- Row-level security: the owner edits; a mentor can look
ALTER TABLE public.website_wanted ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_shows  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or mentor can view wanted" ON public.website_wanted FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_mentor_access(user_id));
CREATE POLICY "Owner can add wanted" ON public.website_wanted FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner can edit wanted" ON public.website_wanted FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner can remove wanted" ON public.website_wanted FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Owner or mentor can view website shows" ON public.website_shows FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_mentor_access(user_id));
CREATE POLICY "Owner can add website shows" ON public.website_shows FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner can edit website shows" ON public.website_shows FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner can remove website shows" ON public.website_shows FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.website_wanted, public.website_shows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_wanted, public.website_shows TO authenticated;

-- ---------- What the website reads (only the website owner's lists; past shows drop off by themselves)
CREATE OR REPLACE FUNCTION public.get_website_lists()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH w AS (SELECT owner_user_id FROM website_settings LIMIT 1),
  today AS (SELECT (now() AT TIME ZONE 'America/New_York')::date d)
  SELECT jsonb_build_object(
    'wanted', coalesce((
      SELECT jsonb_agg(jsonb_build_object('sport', ww.sport, 'position', ww.position, 'player', ww.player_name)
             ORDER BY array_position(ARRAY['Football','Men''s Basketball','Women''s Basketball','Baseball','Hockey','Soccer','Other'], ww.sport),
                      g.first_order, lower(ww.position), lower(ww.player_name))
      FROM website_wanted ww
      JOIN (SELECT sport, lower(position) pos, min(sort_order) first_order FROM website_wanted, w
            WHERE user_id = w.owner_user_id GROUP BY 1, 2) g ON g.sport = ww.sport AND g.pos = lower(ww.position)
      , w WHERE ww.user_id = w.owner_user_id), '[]'::jsonb),
    'wanted_updated', (SELECT max(updated_at) FROM website_wanted, w WHERE user_id = w.owner_user_id),
    'shows', coalesce((
      SELECT jsonb_agg(jsonb_build_object('name', s.name, 'location', s.location, 'start', s.start_date,
                                          'end', s.end_date, 'kind', s.kind) ORDER BY s.start_date, s.name)
      FROM website_shows s, w, today
      WHERE s.user_id = w.owner_user_id AND coalesce(s.end_date, s.start_date) >= today.d), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_website_lists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_website_lists() TO anon, authenticated;

-- ---------- Start both lists from what is on cssportscards.com today (Nov 1 2026)
WITH o AS (SELECT owner_user_id u FROM website_settings LIMIT 1),
v(sport, position, ord, players) AS (VALUES
  ('Football','Quarterbacks',10, ARRAY['Bo Nix','Bryce Young','Caleb Williams','Cam Ward','Dak Prescott','Drake Maye','Jaxson Dart','Jayden Daniels','Joe Burrow','Josh Allen','Justin Herbert','Lamar Jackson','Michael Penix Jr.','Patrick Mahomes','Peyton Manning','Tom Brady','Trevor Lawrence']),
  ('Football','Running Backs',20, ARRAY['Bijan Robinson','Cam Skattebo','Jahmyr Gibbs','James Cook','Jonathan Taylor','Kenneth Walker III','Kyren Williams','Omarion Hampton','TreVeyon Henderson']),
  ('Football','Wide Receivers',30, ARRAY['Amon-Ra St. Brown','CeeDee Lamb','Chris Olave','Garrett Wilson','George Pickens','Jaxon Smith-Njigba','Justin Jefferson','Malik Nabers','Puka Nacua','Tetairoa McMillan','Zay Flowers']),
  ('Football','Tight Ends',40, ARRAY['Brock Bowers','Colston Loveland','Travis Kelce','Trey McBride']),
  ('Football','Defensive End / Edge',50, ARRAY['J.J. Watt','Maxx Crosby','T.J. Watt']),
  ('Football','Wide Receiver / Cornerback',60, ARRAY['Travis Hunter']),
  ('Men''s Basketball','Point / Combo Guards',10, ARRAY['Allen Iverson','Cade Cunningham','Darryn Peterson','Dylan Harper','Luka Dončić','Shai Gilgeous-Alexander','Stephen Curry','Stephon Castle']),
  ('Men''s Basketball','Shooting Guards',20, ARRAY['Anthony Edwards','Kobe Bryant','Michael Jordan']),
  ('Men''s Basketball','Guard / Forward',30, ARRAY['Kon Knueppel','Vince Carter']),
  ('Men''s Basketball','Small / Power Forwards',40, ARRAY['AJ Dybantsa','Cooper Flagg','Jayson Tatum','LeBron James']),
  ('Men''s Basketball','Power Forwards',50, ARRAY['Caleb Wilson','Giannis Antetokounmpo']),
  ('Men''s Basketball','Centers',60, ARRAY['Nikola Jokić','Shaquille O''Neal','Victor Wembanyama']),
  ('Women''s Basketball','Point Guard',10, ARRAY['Caitlin Clark']),
  ('Baseball','Modern',10, ARRAY['Paul Skenes','Shohei Ohtani']),
  ('Baseball','Vintage',20, ARRAY['Babe Ruth','Jackie Robinson','Mickey Mantle']))
INSERT INTO website_wanted (user_id, sport, position, player_name, sort_order)
SELECT o.u, v.sport, v.position, p, v.ord FROM o, v, unnest(v.players) p;

INSERT INTO website_shows (user_id, name, start_date, end_date, kind)
SELECT owner_user_id, x.name, x.s::date, x.e::date, x.k FROM website_settings,
  (VALUES ('Capital City Card Classic','2026-11-14',NULL,'buying'),
          ('PA State Card Show','2026-11-22',NULL,'table'),
          ('Philly Card Show','2026-12-11','2026-12-13','buying'),
          ('Gettysburg Card Show','2026-12-19',NULL,'buying'),
          ('Brotherly Love Card Show','2026-12-26',NULL,'buying')) x(name, s, e, k)
LIMIT 5;
