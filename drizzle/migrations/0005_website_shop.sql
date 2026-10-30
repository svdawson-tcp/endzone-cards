-- =====================================================================
-- EndZone 0005 — "Shop the Case" on cssportscards.com
-- Design: Shop the Case mockups (canvas, approved by Scott 30 Oct 2026).
-- Must run as ONE transaction. Additive only: code already in production keeps working after it runs.
--
-- What the public website may see: ONLY the rows returned by get_shop_cards(), which are the
-- business owner's unsold cards that Colton switched on, priced $10+, with a front photo, and
-- ONLY these columns: player, year, brand, set, card number, condition, sport, team, asking price,
-- photo links, listed time. Cost basis, lot, status history and every financial table stay private.
-- get_shop_cards() is the one SECURITY DEFINER function that is deliberately public (no auth.uid()
-- check): it is read-only, takes no arguments and returns a fixed, safe column list.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SHOW CARDS: website fields
-- ---------------------------------------------------------------------
ALTER TABLE public.show_cards
  ADD COLUMN sport text
    CHECK (sport IS NULL OR sport IN ('football','basketball','baseball','hockey','soccer','other')),
  ADD COLUMN team text
    CHECK (team IS NULL OR (team = btrim(team) AND char_length(team) BETWEEN 1 AND 60)),
  ADD COLUMN show_on_website boolean NOT NULL DEFAULT false,
  ADD COLUMN website_listed_at timestamptz;

-- A card can only be switched on when it is ready to sell online.
ALTER TABLE public.show_cards ADD CONSTRAINT show_cards_website_ready CHECK (
  NOT show_on_website
  OR (asking_price >= 10 AND photo_front_url IS NOT NULL AND sport IS NOT NULL AND team IS NOT NULL));

-- website_listed_at = when the card went on the site (drives "Newest first"); cleared when switched off.
CREATE OR REPLACE FUNCTION public.set_website_listed_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NOT NEW.show_on_website THEN
    NEW.website_listed_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NOT OLD.show_on_website THEN
    NEW.website_listed_at := now();
  ELSE
    NEW.website_listed_at := OLD.website_listed_at;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER show_cards_website_listed_at
  BEFORE INSERT OR UPDATE ON public.show_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_website_listed_at();

CREATE INDEX idx_show_cards_on_website ON public.show_cards (website_listed_at DESC)
  WHERE show_on_website AND status = 'available';

-- ---------------------------------------------------------------------
-- 2. WEBSITE SETTINGS: whose cards the website shows (one row)
-- ---------------------------------------------------------------------
CREATE TABLE public.website_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;  -- no policies: nobody reads it directly
REVOKE ALL ON public.website_settings FROM anon, authenticated;

INSERT INTO public.website_settings (owner_user_id)
SELECT id FROM auth.users WHERE email = 'denvernuggets0697@gmail.com';

-- ---------------------------------------------------------------------
-- 3. THE ONE PUBLIC READ: cards for Shop the Case
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shop_cards()
RETURNS TABLE (
  id uuid, player_name text, year text, brand text, set_name text, card_number text,
  condition text, sport text, team text, price numeric,
  photo_front_url text, photo_back_url text, listed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id, c.player_name, c.year,
         c.card_details->>'brand', c.card_details->>'set',
         c.card_details->>'card_number', c.card_details->>'condition',
         c.sport, c.team, c.asking_price,
         c.photo_front_url,
         CASE WHEN c.photo_back_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_back_url END,
         c.website_listed_at
  FROM public.show_cards c
  JOIN public.website_settings w ON w.owner_user_id = c.user_id
  WHERE c.show_on_website
    AND c.status = 'available'
    AND c.asking_price >= 10
    AND c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%'
  ORDER BY c.website_listed_at DESC NULLS LAST, c.id;
$$;

REVOKE ALL ON FUNCTION public.get_shop_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_cards() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.set_website_listed_at() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. CARD PHOTOS: stop anyone from LISTING the whole bucket.
-- Photos still load by their direct link (the bucket stays public), which is how both EndZone and
-- the website show them. Owners can still see (and therefore delete/replace) their own files.
-- ---------------------------------------------------------------------
DROP POLICY "Users can view all show card photos" ON storage.objects;
CREATE POLICY "Users can view their own show card photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'show_cards' AND (storage.foldername(name))[1] = (auth.uid())::text);
