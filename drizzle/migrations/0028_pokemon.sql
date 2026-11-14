-- =====================================================================
-- EndZone 0028 — Pokémon category (Colton, 14 Nov 2026)
-- Adds 'pokemon' to the show_cards.sport values so Pokémon cards can be listed and filtered on
-- cssportscards.com, like Marvel and Disney (0022). Additive only.
-- =====================================================================
ALTER TABLE public.show_cards DROP CONSTRAINT show_cards_sport_check;
ALTER TABLE public.show_cards ADD CONSTRAINT show_cards_sport_check
  CHECK (sport IS NULL OR sport IN ('football','basketball','baseball','hockey','soccer','marvel','disney','pokemon','other'));
