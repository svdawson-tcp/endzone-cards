-- 0027 "Got Cards?" seller intake (14 Nov 2026)
-- Colton picked the seller-intake idea (14 Nov) to bring in volume. The site's /sell form used Netlify Forms
-- (3 photos, emailed only). Now:
--   * cssportscards.com/sell posts to the sell-submit edge function, which saves a row here and stores the
--     seller's photos in the PRIVATE bucket sell-photos (path <lead id>/<n>.jpg). Nothing here is public.
--   * EndZone → Sellers lists them. Colton sends an offer / asks for more / passes (sell-respond emails the
--     seller), or logs a call or text. "Mark bought" opens Create Lot pre-filled; saving the lot links it
--     here (web_sell_lead_link_lot) so lots bought through the site can be counted by channel.
--   * Scott (14 Nov): on bigger buys keep the seller's name and contact with the lot → lot notes carry them.
-- Writes from the website go only through web_create_sell_lead (service role). The owner reads and
-- updates through RLS; mentors can read.

CREATE TABLE IF NOT EXISTS public.web_sell_leads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- business owner
  seller_name    text NOT NULL CHECK (char_length(btrim(seller_name)) BETWEEN 1 AND 80),
  seller_email   text NOT NULL CHECK (seller_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' AND char_length(seller_email) <= 200),
  seller_phone   text CHECK (seller_phone IS NULL OR char_length(seller_phone) <= 30),
  zip            text CHECK (zip IS NULL OR zip ~ '^[0-9]{5}$'),
  categories     text[] NOT NULL DEFAULT '{}',
  card_count     text CHECK (card_count IS NULL OR char_length(card_count) <= 60),
  graded         text CHECK (graded IS NULL OR graded IN ('yes','no','not sure')),
  era            text CHECK (era IS NULL OR char_length(era) <= 40),
  details        text CHECK (details IS NULL OR char_length(details) <= 3000),
  asking_price   numeric(12,2) CHECK (asking_price IS NULL OR asking_price > 0),
  handoff        text CHECK (handoff IS NULL OR handoff IN ('show','meetup','ship','not sure')),
  photo_paths    text[] NOT NULL DEFAULT '{}' CHECK (cardinality(photo_paths) <= 10),
  status         text NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','offer_sent','asked_more','accepted','declined','passed','bought')),
  offer_amount   numeric(12,2) CHECK (offer_amount IS NULL OR offer_amount > 0),
  last_message   text CHECK (last_message IS NULL OR char_length(last_message) <= 2000),
  owner_notes    text CHECK (owner_notes IS NULL OR char_length(owner_notes) <= 2000),
  responded_at   timestamptz,
  lot_id         uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  ip_hash        text,
  source_page    text CHECK (source_page IS NULL OR char_length(source_page) <= 200),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_sell_leads_user_created ON public.web_sell_leads (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS web_sell_leads_email_created ON public.web_sell_leads (lower(seller_email), created_at DESC);
CREATE INDEX IF NOT EXISTS web_sell_leads_ip_created ON public.web_sell_leads (ip_hash, created_at DESC) WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS web_sell_leads_lot ON public.web_sell_leads (lot_id) WHERE lot_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_web_sell_leads_updated_at ON public.web_sell_leads;
CREATE TRIGGER update_web_sell_leads_updated_at
  BEFORE UPDATE ON public.web_sell_leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.web_sell_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner and mentor can view sell leads" ON public.web_sell_leads
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_mentor_access(user_id));
CREATE POLICY "Owner can update sell leads" ON public.web_sell_leads
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.web_sell_leads FROM anon, authenticated;
GRANT SELECT ON public.web_sell_leads TO authenticated;
-- The owner may log a call/text result and keep private notes from EndZone; everything else goes through
-- sell-respond (emails) or web_sell_lead_link_lot.
GRANT UPDATE (status, offer_amount, owner_notes, responded_at) ON public.web_sell_leads TO authenticated;

-- A lead can't be set to 'bought' by hand: that only happens when a lot is linked.
CREATE OR REPLACE FUNCTION public.web_sell_leads_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'bought' AND NEW.lot_id IS NULL THEN
    RAISE EXCEPTION 'LEAD_NEEDS_LOT';
  END IF;
  IF NEW.lot_id IS NOT NULL AND NEW.lot_id IS DISTINCT FROM OLD.lot_id
     AND NOT EXISTS (SELECT 1 FROM lots WHERE id = NEW.lot_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS web_sell_leads_guard ON public.web_sell_leads;
CREATE TRIGGER web_sell_leads_guard
  BEFORE UPDATE ON public.web_sell_leads FOR EACH ROW EXECUTE FUNCTION web_sell_leads_guard();

-- Website: save a submission. Service role only (sell-submit). Limits: 5 a day per email, 8 a day per device.
CREATE OR REPLACE FUNCTION public.web_create_sell_lead(
  p_id uuid, p_name text, p_email text, p_phone text, p_zip text, p_categories text[], p_card_count text,
  p_graded text, p_era text, p_details text, p_asking numeric, p_handoff text, p_photo_paths text[],
  p_ip_hash text, p_source_page text)
 RETURNS public.web_sell_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w website_settings;
  r web_sell_leads;
  v_cats text[];
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

  INSERT INTO web_sell_leads (id, user_id, seller_name, seller_email, seller_phone, zip, categories, card_count,
    graded, era, details, asking_price, handoff, photo_paths, ip_hash, source_page)
  VALUES (coalesce(p_id, gen_random_uuid()), w.owner_user_id, btrim(p_name), btrim(p_email),
    nullif(btrim(p_phone), ''), nullif(btrim(p_zip), ''), v_cats, nullif(btrim(p_card_count), ''),
    nullif(btrim(p_graded), ''), nullif(btrim(p_era), ''), nullif(btrim(p_details), ''), p_asking,
    nullif(btrim(p_handoff), ''), coalesce(p_photo_paths, '{}'), p_ip_hash, nullif(btrim(p_source_page), ''))
  RETURNING * INTO r;
  RETURN r;
END; $function$;

-- EndZone (via sell-respond, service role): record what Colton sent the seller.
CREATE OR REPLACE FUNCTION public.web_sell_lead_record_reply(
  p_lead_id uuid, p_owner uuid, p_status text, p_offer numeric, p_message text)
 RETURNS public.web_sell_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r web_sell_leads;
BEGIN
  IF p_status NOT IN ('offer_sent','asked_more','passed') THEN RAISE EXCEPTION 'BAD_STATUS'; END IF;
  IF p_status = 'offer_sent' AND (p_offer IS NULL OR p_offer <= 0) THEN RAISE EXCEPTION 'OFFER_REQUIRED'; END IF;
  UPDATE web_sell_leads
  SET status = p_status,
      offer_amount = CASE WHEN p_status = 'offer_sent' THEN p_offer ELSE offer_amount END,
      last_message = nullif(btrim(p_message), ''),
      responded_at = now()
  WHERE id = p_lead_id AND user_id = p_owner AND status <> 'bought'
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'LEAD_NOT_FOUND'; END IF;
  RETURN r;
END; $function$;

-- EndZone: after Colton saves the lot from "Mark bought", link it and mark the lead bought.
CREATE OR REPLACE FUNCTION public.web_sell_lead_link_lot(p_lead_id uuid, p_lot_id uuid)
 RETURNS public.web_sell_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r web_sell_leads; v_cost numeric;
BEGIN
  SELECT total_cost INTO v_cost FROM lots WHERE id = p_lot_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND'; END IF;
  UPDATE web_sell_leads
  SET lot_id = p_lot_id, status = 'bought', offer_amount = coalesce(v_cost, offer_amount),
      responded_at = coalesce(responded_at, now())
  WHERE id = p_lead_id AND user_id = auth.uid()
  RETURNING * INTO r;
  IF r.id IS NULL THEN RAISE EXCEPTION 'LEAD_NOT_FOUND'; END IF;
  RETURN r;
END; $function$;

REVOKE ALL ON FUNCTION public.web_create_sell_lead(uuid, text, text, text, text, text[], text, text, text, text, numeric, text, text[], text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_sell_lead_record_reply(uuid, uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.web_sell_lead_link_lot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_create_sell_lead(uuid, text, text, text, text, text[], text, text, text, text, numeric, text, text[], text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.web_sell_lead_record_reply(uuid, uuid, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.web_sell_lead_link_lot(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.web_sell_leads_guard() FROM PUBLIC, anon, authenticated;

-- Private bucket for sellers' photos. Uploads come only from sell-submit (service role).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sell-photos', 'sell-photos', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/jpeg'];

-- Owner and mentor may read (signed URLs from EndZone) photos of their own leads. Folder = lead id.
DROP POLICY IF EXISTS "Owner can view sell photos" ON storage.objects;
CREATE POLICY "Owner can view sell photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sell-photos'
    AND EXISTS (
      SELECT 1 FROM public.web_sell_leads l
      WHERE l.id::text = (storage.foldername(name))[1]
        AND (l.user_id = auth.uid() OR public.has_mentor_access(l.user_id))
    )
  );
