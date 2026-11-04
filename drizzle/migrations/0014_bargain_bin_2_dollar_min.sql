-- =====================================================================
-- EndZone 0014 — Bargain Bin cards may be listed from $2 (was $5). Colton, Nov 3 2026. Case cards stay $10+.
-- Same rule in three places: the show_cards_website_ready check, get_shop_cards, web_create_order.
-- =====================================================================
ALTER TABLE public.show_cards DROP CONSTRAINT show_cards_website_ready;
ALTER TABLE public.show_cards ADD CONSTRAINT show_cards_website_ready CHECK (
  NOT show_on_website OR (
    (asking_price >= 10 OR (in_bargain_bin AND asking_price >= 2))
    AND photo_front_url IS NOT NULL AND sport IS NOT NULL AND team IS NOT NULL));

DO $m$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['get_shop_cards', 'web_create_order'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f;
    IF position('in_bargain_bin AND c.asking_price >= 5' IN d) = 0 THEN RAISE EXCEPTION '% not as expected', f; END IF;
    EXECUTE replace(d, 'in_bargain_bin AND c.asking_price >= 5', 'in_bargain_bin AND c.asking_price >= 2');
  END LOOP;
END $m$;
