-- =====================================================================
-- EndZone 0022 — Marvel and Disney categories (Colton, 7 Nov 2026)
-- Adds 'marvel' and 'disney' to the show_cards.sport values so non-sports cards
-- can be listed and filtered on cssportscards.com. Additive only.
-- =====================================================================
ALTER TABLE public.show_cards DROP CONSTRAINT show_cards_sport_check;
ALTER TABLE public.show_cards ADD CONSTRAINT show_cards_sport_check
  CHECK (sport IS NULL OR sport IN ('football','basketball','baseball','hockey','soccer','marvel','disney','other'));
