-- =====================================================================
-- EndZone 0029 — "On the Hunt" photos on the Got Cards? page (Colton, 14 Nov 2026)
-- Colton posts photos of cards/inventory he's looking for. He manages them in EndZone → Website → On the Hunt;
-- cssportscards.com/sell shows the visible ones (get_hunt_list, public). Photos live in the public show_cards
-- bucket under <owner id>/hunt/ (the existing owner-folder storage policies cover uploads and deletes).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.website_hunt (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
  note        text CHECK (note IS NULL OR char_length(note) <= 140),
  pay_up_to   numeric(12,2) CHECK (pay_up_to IS NULL OR pay_up_to > 0),
  photo_url   text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  visible     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Only the owner's own photos in this project's public card-photo bucket.
  CONSTRAINT website_hunt_photo_url CHECK (
    photo_url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/show_cards/' || user_id::text || '/hunt/[A-Za-z0-9_.-]+$'))
);
CREATE INDEX IF NOT EXISTS website_hunt_user_order ON public.website_hunt (user_id, sort_order);

DROP TRIGGER IF EXISTS update_website_hunt_updated_at ON public.website_hunt;
CREATE TRIGGER update_website_hunt_updated_at
  BEFORE UPDATE ON public.website_hunt FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- At most 12 visible at once (the page shows them all).
CREATE OR REPLACE FUNCTION public.website_hunt_limit()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  NEW.title := btrim(regexp_replace(NEW.title, '\s+', ' ', 'g'));
  NEW.note := nullif(btrim(regexp_replace(coalesce(NEW.note, ''), '\s+', ' ', 'g')), '');
  IF NEW.visible AND (TG_OP = 'INSERT' OR NOT OLD.visible) THEN
    PERFORM pg_advisory_xact_lock(hashtext('website_hunt:' || NEW.user_id::text));
    IF (SELECT count(*) FROM website_hunt WHERE user_id = NEW.user_id AND visible AND id <> NEW.id) >= 12 THEN
      RAISE EXCEPTION 'HUNT_FULL' USING HINT = 'Twelve on the page already. Hide or delete one first.';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
DROP TRIGGER IF EXISTS website_hunt_limit ON public.website_hunt;
CREATE TRIGGER website_hunt_limit BEFORE INSERT OR UPDATE ON public.website_hunt
  FOR EACH ROW EXECUTE FUNCTION website_hunt_limit();

ALTER TABLE public.website_hunt ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner and mentor can view hunt" ON public.website_hunt
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_mentor_access(user_id));
CREATE POLICY "Owner can add hunt" ON public.website_hunt
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner can update hunt" ON public.website_hunt
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner can delete hunt" ON public.website_hunt
  FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.website_hunt FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_hunt TO authenticated;
REVOKE ALL ON FUNCTION public.website_hunt_limit() FROM PUBLIC, anon, authenticated;

-- Website: the visible list, in Colton's order.
CREATE OR REPLACE FUNCTION public.get_hunt_list()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'note', h.note,
                                               'pay_up_to', h.pay_up_to, 'photo', h.photo_url)
                            ORDER BY h.sort_order, h.created_at), '[]'::jsonb)
  FROM website_hunt h JOIN website_settings w ON w.owner_user_id = h.user_id
  WHERE h.visible;
$function$;
REVOKE ALL ON FUNCTION public.get_hunt_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hunt_list() TO anon, authenticated;
