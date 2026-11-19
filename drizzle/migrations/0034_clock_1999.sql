-- =====================================================================
-- EndZone 0034 — Turn Back the Clock cutoff is 1999 and earlier (Scott, 18 Nov 2026; was 1969 in 0033)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_shop_cards()
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
         coalesce(public.web_card_year(c.year) <= 1999, false),
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
