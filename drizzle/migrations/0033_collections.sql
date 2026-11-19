-- =====================================================================
-- EndZone 0033 — Website collections (Colton, 18 Nov 2026)
-- Two new collections on cssportscards.com alongside The Case and the Bargain Bin:
--   * Turn Back the Clock: cards from 1969 and earlier (automatic, from the card's year).
--   * Homefield Advantage: Pennsylvania teams, sorted by stadium (current and historic). EndZone suggests
--     the stadium from team + year; Colton can pick another, add a PA-born player on another team
--     ("Born in PA"), or keep a card out. No minor-league stadiums (Colton); Penn State stays.
-- A card keeps its own shelf: case cards still take offers, bin cards still count toward the bin deal.
-- =====================================================================

-- Stadiums (shown on the Homefield Advantage page; names editable here without re-tagging cards).
CREATE TABLE IF NOT EXISTS public.web_stadiums (
  slug          text PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]+$'),
  name          text NOT NULL,
  region        text NOT NULL CHECK (region IN ('philadelphia', 'pittsburgh', 'central', 'historic')),
  kind          text NOT NULL CHECK (kind IN ('football', 'baseball', 'arena')),
  teams_label   text NOT NULL,
  years_label   text,
  photo         text CHECK (photo IS NULL OR photo ~ '^[a-z0-9-]+\.jpg$'),   -- file in /img/stadiums/ on the site
  photo_credit  text,
  photo_source  text CHECK (photo_source IS NULL OR photo_source ~ '^https://commons\.wikimedia\.org/'),
  sort_order    integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true
);
ALTER TABLE public.web_stadiums ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users can read stadiums" ON public.web_stadiums;
CREATE POLICY "Signed-in users can read stadiums" ON public.web_stadiums FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.web_stadiums FROM anon;
GRANT SELECT ON public.web_stadiums TO authenticated;

INSERT INTO public.web_stadiums (slug, name, region, kind, teams_label, years_label, photo, photo_credit, photo_source, sort_order) VALUES
 ('lincoln-financial-field', 'Lincoln Financial Field', 'philadelphia', 'football', 'Eagles · Temple', NULL,
  'lincoln-financial-field.jpg', 'Ron Reiring · CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Lincoln_Financial_Field_(Aerial_view).jpg', 10),
 ('citizens-bank-park', 'Citizens Bank Park', 'philadelphia', 'baseball', 'Phillies', NULL,
  'citizens-bank-park.jpg', 'Chris6d · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Citizens_Bank_Park_2021.jpg', 20),
 ('xfinity-mobile-arena', 'Xfinity Mobile Arena', 'philadelphia', 'arena', 'Flyers · 76ers', NULL,
  'xfinity-mobile-arena.jpg', 'Wildcat7176 · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Wells_Fargo_Center_2019.jpg', 30),
 ('acrisure-stadium', 'Acrisure Stadium', 'pittsburgh', 'football', 'Steelers · Pitt', NULL,
  'acrisure-stadium.jpg', 'Cbaile19 · CC0', 'https://commons.wikimedia.org/wiki/File:Acrisure_Stadium,_2023-03-01.jpg', 40),
 ('pnc-park', 'PNC Park', 'pittsburgh', 'baseball', 'Pirates', NULL,
  'pnc-park.jpg', 'David Wilson · CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:20050607_30_PNC_Park_(10987773103).jpg', 50),
 ('ppg-paints-arena', 'PPG Paints Arena', 'pittsburgh', 'arena', 'Penguins', NULL,
  'ppg-paints-arena.jpg', 'Jleedev · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:PPG_Paints_Arena_-_March_2017.jpg', 60),
 ('beaver-stadium', 'Beaver Stadium', 'central', 'football', 'Penn State', NULL,
  'beaver-stadium.jpg', 'Greenstrat · Public domain', 'https://commons.wikimedia.org/wiki/File:Beaver_Stadium_OUTSIDE.jpg', 70),
 ('veterans-stadium', 'Veterans Stadium', 'historic', 'baseball', 'Phillies · Eagles', '1971–2003',
  'veterans-stadium.jpg', 'Squelle · CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Mike_Schmidt_HR_vs._Cincinnati_Reds_at_Veterans_Stadium_July_20,_1987.jpg', 80),
 ('three-rivers-stadium', 'Three Rivers Stadium', 'historic', 'football', 'Steelers · Pirates', '1970–2000',
  'three-rivers-stadium.jpg', 'Steve Tiesdell Legacy Collection · CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Three_Rivers_Stadium_Pittsburgh_Sept_1992_(27778070911).jpg', 90),
 ('the-spectrum', 'The Spectrum', 'historic', 'arena', 'Flyers · 76ers', '1967–1996',
  'the-spectrum.jpg', 'Bruce C. Cooper · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:The_Spectrum_Philadelphia_PA.jpg', 100),
 ('civic-arena', 'Civic Arena (The Igloo)', 'historic', 'arena', 'Penguins', '1967–2010',
  'civic-arena.jpg', 'Derek Jensen (Tysto) · Public domain', 'https://commons.wikimedia.org/wiki/File:Pittsburgh-pennsylvania-mellon-arena-2007.jpg', 110),
 ('forbes-field', 'Forbes Field', 'historic', 'baseball', 'Pirates · Steelers', '1909–1970',
  'forbes-field.jpg', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Forbes_Field_exterior.jpg', 120),
 ('connie-mack-stadium', 'Connie Mack Stadium', 'historic', 'baseball', 'Phillies · Athletics · Eagles', '1909–1970',
  NULL, NULL, NULL, 130)
ON CONFLICT (slug) DO NOTHING;

-- Which stadium a team's cards go under, by card year. Team is matched case-insensitively.
CREATE TABLE IF NOT EXISTS public.web_stadium_teams (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stadium_slug  text NOT NULL REFERENCES public.web_stadiums(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  team_pattern  text NOT NULL,
  sport         text NOT NULL,
  year_from     integer,
  year_to       integer
);
ALTER TABLE public.web_stadium_teams ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_stadium_teams FROM anon, authenticated;

INSERT INTO public.web_stadium_teams (stadium_slug, team_pattern, sport, year_from, year_to)
SELECT * FROM (VALUES
  ('connie-mack-stadium',     'eagles',                     'football',   NULL::int, 1957),
  ('veterans-stadium',        'eagles',                     'football',   1971, 2002),
  ('lincoln-financial-field', 'eagles',                     'football',   2003, NULL),
  ('lincoln-financial-field', 'temple',                     'football',   2003, NULL),
  ('connie-mack-stadium',     'phillies',                   'baseball',   NULL, 1970),
  ('veterans-stadium',        'phillies',                   'baseball',   1971, 2003),
  ('citizens-bank-park',      'phillies',                   'baseball',   2004, NULL),
  ('connie-mack-stadium',     'philadelphia (athletics|a''s)', 'baseball', NULL, 1954),
  ('the-spectrum',            '76ers|sixers',               'basketball', 1967, 1996),
  ('xfinity-mobile-arena',    '76ers|sixers',               'basketball', 1997, NULL),
  ('the-spectrum',            'flyers',                     'hockey',     1967, 1996),
  ('xfinity-mobile-arena',    'flyers',                     'hockey',     1997, NULL),
  ('forbes-field',            'steelers',                   'football',   NULL, 1963),
  ('three-rivers-stadium',    'steelers',                   'football',   1970, 2000),
  ('acrisure-stadium',        'steelers',                   'football',   2001, NULL),
  ('acrisure-stadium',        'pitt(sburgh)? panthers',     'football',   2001, NULL),
  ('forbes-field',            'pirates',                    'baseball',   NULL, 1970),
  ('three-rivers-stadium',    'pirates',                    'baseball',   1971, 2000),
  ('pnc-park',                'pirates',                    'baseball',   2001, NULL),
  ('civic-arena',             'penguins',                   'hockey',     1967, 2010),
  ('ppg-paints-arena',        'penguins',                   'hockey',     2011, NULL),
  ('beaver-stadium',          'penn state|nittany lions',   'football',   NULL, NULL)
) v(stadium_slug, team_pattern, sport, year_from, year_to)
WHERE NOT EXISTS (SELECT 1 FROM public.web_stadium_teams);

-- Colton's choice per card: NULL = automatic, 'none' = keep out, 'pa_born' = Born in PA, or a stadium slug.
ALTER TABLE public.show_cards ADD COLUMN IF NOT EXISTS homefield text;
ALTER TABLE public.show_cards DROP CONSTRAINT IF EXISTS show_cards_homefield_format;
ALTER TABLE public.show_cards ADD CONSTRAINT show_cards_homefield_format CHECK (homefield IS NULL OR homefield ~ '^[a-z0-9_-]{1,40}$');

CREATE OR REPLACE FUNCTION public.show_cards_homefield_check()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.homefield IS NOT NULL AND NEW.homefield NOT IN ('none', 'pa_born')
     AND NOT EXISTS (SELECT 1 FROM public.web_stadiums s WHERE s.slug = NEW.homefield) THEN
    RAISE EXCEPTION 'Unknown stadium: %', NEW.homefield;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS show_cards_homefield_check ON public.show_cards;
CREATE TRIGGER show_cards_homefield_check BEFORE INSERT OR UPDATE OF homefield ON public.show_cards
  FOR EACH ROW EXECUTE FUNCTION public.show_cards_homefield_check();

-- The card's year as a number (first 19xx/20xx in the text: "2024", "2023-24" → 2023), or NULL.
CREATE OR REPLACE FUNCTION public.web_card_year(p_year text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT substring(p_year FROM '(?:19|20)\d\d')::integer;
$$;

-- Suggested stadium for a team/sport/year (used by EndZone's card form and the shop feed).
CREATE OR REPLACE FUNCTION public.web_homefield_suggest(p_team text, p_sport text, p_year text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.stadium_slug
  FROM public.web_stadium_teams t
  JOIN public.web_stadiums s ON s.slug = t.stadium_slug AND s.active
  WHERE t.sport = p_sport
    AND coalesce(p_team, '') ~* t.team_pattern
    AND (t.year_from IS NULL OR public.web_card_year(p_year) >= t.year_from)
    AND (t.year_to IS NULL OR public.web_card_year(p_year) <= t.year_to)
    AND (t.year_from IS NULL AND t.year_to IS NULL OR public.web_card_year(p_year) IS NOT NULL)
  ORDER BY t.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.web_homefield_suggest(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_homefield_suggest(text, text, text) TO authenticated, service_role;

-- Where a card shows on the Homefield page: Colton's pick, else the suggestion. NULL = not shown.
CREATE OR REPLACE FUNCTION public.web_homefield_of(p_pick text, p_team text, p_sport text, p_year text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p_pick = 'none' THEN NULL
    WHEN p_pick = 'pa_born' THEN 'pa_born'
    WHEN p_pick IS NOT NULL THEN (SELECT s.slug FROM public.web_stadiums s WHERE s.slug = p_pick AND s.active)
    ELSE public.web_homefield_suggest(p_team, p_sport, p_year)
  END;
$$;
REVOKE ALL ON FUNCTION public.web_homefield_of(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_homefield_of(text, text, text, text) TO service_role;

-- Shop feed: same as before plus vintage (1969 and earlier) and homefield.
DROP FUNCTION IF EXISTS public.get_shop_cards();
CREATE FUNCTION public.get_shop_cards()
 RETURNS TABLE(id uuid, player_name text, year text, brand text, set_name text, card_number text, condition text,
               sport text, team text, price numeric, photo_front_url text, photo_back_url text,
               listed_at timestamp with time zone, offers_open boolean, rookie boolean, autograph boolean,
               parallel text, serial_number text, in_bin boolean, vintage boolean, homefield text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT c.id, btrim(c.player_name), nullif(btrim(c.year), ''),
         nullif(btrim(c.card_details->>'brand'), ''), nullif(btrim(c.card_details->>'set'), ''),
         nullif(btrim(c.card_details->>'card_number'), ''), nullif(btrim(c.card_details->>'condition'), ''),
         c.sport, nullif(btrim(c.team), ''), c.asking_price,
         c.photo_front_url,
         CASE WHEN c.photo_back_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_back_url END,
         c.website_listed_at,
         w.offers_enabled AND NOT c.in_bargain_bin AND c.asking_price >= 10,
         coalesce(c.card_details->'rookie' = 'true'::jsonb, false),
         coalesce(c.card_details->'autograph' = 'true'::jsonb, false),
         nullif(btrim(c.card_details->>'parallel'), ''),
         nullif(btrim(c.card_details->>'serial_number'), ''),
         c.in_bargain_bin,
         coalesce(public.web_card_year(c.year) <= 1969, false),
         public.web_homefield_of(c.homefield, c.team, c.sport, c.year)
  FROM public.show_cards c
  JOIN public.website_settings w ON w.owner_user_id = c.user_id
  WHERE c.show_on_website
    AND c.status = 'available'
    AND (c.asking_price >= 10 OR (c.in_bargain_bin AND c.asking_price >= 2))
    AND c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%'
    AND (c.held_until IS NULL OR c.held_until < now())
  ORDER BY c.website_listed_at DESC NULLS LAST, c.id;
$function$;
REVOKE ALL ON FUNCTION public.get_shop_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_cards() TO anon, authenticated, service_role;

-- Stadium list for the Homefield page (public).
CREATE OR REPLACE FUNCTION public.get_web_stadiums()
RETURNS TABLE(slug text, name text, region text, kind text, teams_label text, years_label text,
              photo text, photo_credit text, photo_source text, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.slug, s.name, s.region, s.kind, s.teams_label, s.years_label, s.photo, s.photo_credit, s.photo_source, s.sort_order
  FROM public.web_stadiums s WHERE s.active ORDER BY s.sort_order, s.slug;
$$;
REVOKE ALL ON FUNCTION public.get_web_stadiums() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_web_stadiums() TO anon, authenticated, service_role;
