-- =====================================================================
-- EndZone 0012 — the shop shows what collectors filter on (Nov 2 2026):
-- rookie, autograph, parallel and serial number, plus the grade (a graded card's condition is its grade,
-- e.g. "PSA 10"). Text is trimmed on the way out so stray spaces typed in EndZone never show.
-- Return columns change, so the function is dropped and recreated (same name, same grants).
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_shop_cards();
CREATE FUNCTION public.get_shop_cards()
RETURNS TABLE(id uuid, player_name text, year text, brand text, set_name text, card_number text, condition text,
              sport text, team text, price numeric, photo_front_url text, photo_back_url text,
              listed_at timestamp with time zone, offers_open boolean,
              rookie boolean, autograph boolean, parallel text, serial_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT c.id, btrim(c.player_name), nullif(btrim(c.year), ''),
         nullif(btrim(c.card_details->>'brand'), ''), nullif(btrim(c.card_details->>'set'), ''),
         nullif(btrim(c.card_details->>'card_number'), ''), nullif(btrim(c.card_details->>'condition'), ''),
         c.sport, nullif(btrim(c.team), ''), c.asking_price,
         c.photo_front_url,
         CASE WHEN c.photo_back_url LIKE '%/storage/v1/object/public/show_cards/%' THEN c.photo_back_url END,
         c.website_listed_at,
         w.offers_enabled,
         coalesce(c.card_details->'rookie' = 'true'::jsonb, false),
         coalesce(c.card_details->'autograph' = 'true'::jsonb, false),
         nullif(btrim(c.card_details->>'parallel'), ''),
         nullif(btrim(c.card_details->>'serial_number'), '')
  FROM public.show_cards c
  JOIN public.website_settings w ON w.owner_user_id = c.user_id
  WHERE c.show_on_website
    AND c.status = 'available'
    AND c.asking_price >= 10
    AND c.photo_front_url LIKE '%/storage/v1/object/public/show_cards/%'
    AND (c.held_until IS NULL OR c.held_until < now())
  ORDER BY c.website_listed_at DESC NULLS LAST, c.id;
$function$;
REVOKE ALL ON FUNCTION public.get_shop_cards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_cards() TO anon, authenticated, service_role;
