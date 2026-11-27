-- =====================================================================
-- EndZone 0040 — "Your cards are on the way" email (Scott, 27 Nov 2026)
-- When Colton marks a website order shipped, EndZone can email the buyer (tracking link, the cards,
-- and a Google review button). The order-shipped edge function sends it and stamps shipped_email_at,
-- so the same order is never emailed twice. Only the service role writes this column.
-- =====================================================================
ALTER TABLE public.web_orders ADD COLUMN IF NOT EXISTS shipped_email_at timestamptz;
