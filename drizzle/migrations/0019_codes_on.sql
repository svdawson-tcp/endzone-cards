-- EndZone 0019 — discount codes switched on (Nov 5 2026)
-- Colton confirmed CSTHANKS10 at 10% for 30 days and asked for a card for new buyers (show table and
-- packages from sales that aren't on the site): CSWELCOME10, 10% off a first website order.
UPDATE public.web_discount_codes SET active = true, percent = 10, window_days = 30 WHERE code = 'CSTHANKS10';
INSERT INTO public.web_discount_codes (code, user_id, kind, percent, window_days, active)
SELECT 'CSWELCOME10', owner_user_id, 'welcome', 10, NULL, true FROM public.website_settings LIMIT 1;
