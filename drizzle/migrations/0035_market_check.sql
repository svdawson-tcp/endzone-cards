-- 0035 Market check (20 Nov 2026): what Colton found when he looked a card up on eBay sold / TCGplayer.
-- Filled by hand from the card page (EndZone opens the searches; neither site offers a price API to small sellers).
ALTER TABLE public.show_cards
  ADD COLUMN IF NOT EXISTS market_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS market_price_source text,
  ADD COLUMN IF NOT EXISTS market_price_at timestamptz;

ALTER TABLE public.show_cards
  ADD CONSTRAINT show_cards_market_price_check CHECK (market_price IS NULL OR market_price >= 0),
  ADD CONSTRAINT show_cards_market_price_source_check
    CHECK (market_price_source IS NULL OR market_price_source IN ('ebay_sold', 'tcgplayer', 'other'));
