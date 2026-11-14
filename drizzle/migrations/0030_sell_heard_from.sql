-- =====================================================================
-- EndZone 0030 — "How did you hear about us?" on the Got Cards? form (Scott, 14 Nov 2026)
-- One optional answer per seller, so Colton can see which local promotion brings in sellers.
-- web_create_sell_lead gains p_heard_from with DEFAULT NULL: the deployed sell-submit (which doesn't send it)
-- keeps working until the new version is deployed.
-- =====================================================================
ALTER TABLE public.web_sell_leads ADD COLUMN IF NOT EXISTS heard_from text
  CHECK (heard_from IS NULL OR heard_from IN
    ('google','facebook','instagram','craigslist_nextdoor','show','card_flyer','friend','other'));

DROP FUNCTION IF EXISTS public.web_create_sell_lead(uuid, text, text, text, text, text[], text, text, text, text, numeric, text, text[], text, text);

CREATE OR REPLACE FUNCTION public.web_create_sell_lead(
  p_id uuid, p_name text, p_email text, p_phone text, p_zip text, p_categories text[], p_card_count text,
  p_graded text, p_era text, p_details text, p_asking numeric, p_handoff text, p_photo_paths text[],
  p_ip_hash text, p_source_page text, p_heard_from text DEFAULT NULL)
 RETURNS public.web_sell_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w website_settings;
  r web_sell_leads;
  v_cats text[];
  v_heard text := nullif(btrim(p_heard_from), '');
BEGIN
  SELECT * INTO w FROM website_settings LIMIT 1;
  IF w.owner_user_id IS NULL THEN RAISE EXCEPTION 'NO_OWNER'; END IF;

  IF (SELECT count(*) FROM web_sell_leads
      WHERE lower(seller_email) = lower(btrim(p_email)) AND created_at > now() - interval '24 hours') >= 5
     OR (p_ip_hash IS NOT NULL AND (SELECT count(*) FROM web_sell_leads
      WHERE ip_hash = p_ip_hash AND created_at > now() - interval '24 hours') >= 8) THEN
    RAISE EXCEPTION 'TOO_MANY_LEADS';
  END IF;

  SELECT coalesce(array_agg(DISTINCT c), '{}') INTO v_cats
  FROM unnest(coalesce(p_categories, '{}')) c
  WHERE c IN ('football','basketball','baseball','hockey','soccer','pokemon','disney','marvel','not sure');

  -- An unknown answer is dropped rather than refusing the whole submission.
  IF v_heard NOT IN ('google','facebook','instagram','craigslist_nextdoor','show','card_flyer','friend','other') THEN
    v_heard := NULL;
  END IF;

  INSERT INTO web_sell_leads (id, user_id, seller_name, seller_email, seller_phone, zip, categories, card_count,
    graded, era, details, asking_price, handoff, photo_paths, ip_hash, source_page, heard_from)
  VALUES (coalesce(p_id, gen_random_uuid()), w.owner_user_id, btrim(p_name), btrim(p_email),
    nullif(btrim(p_phone), ''), nullif(btrim(p_zip), ''), v_cats, nullif(btrim(p_card_count), ''),
    nullif(btrim(p_graded), ''), nullif(btrim(p_era), ''), nullif(btrim(p_details), ''), p_asking,
    nullif(btrim(p_handoff), ''), coalesce(p_photo_paths, '{}'), p_ip_hash, nullif(btrim(p_source_page), ''), v_heard)
  RETURNING * INTO r;
  RETURN r;
END; $function$;

REVOKE ALL ON FUNCTION public.web_create_sell_lead(uuid, text, text, text, text, text[], text, text, text, text, numeric, text, text[], text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_create_sell_lead(uuid, text, text, text, text, text[], text, text, text, text, numeric, text, text[], text, text, text) TO service_role;
