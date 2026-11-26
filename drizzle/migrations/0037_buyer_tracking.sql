-- =====================================================================
-- EndZone 0037 — Where buyers come from, and first-time vs repeat buyers (Scott, 26 Nov 2026)
--
-- 1. Website orders keep "How did you hear about us?" (optional question in the cart and on the offer pay page)
--    plus where the buyer's first visit came from (referring site, landing page, utm tags), saved by the
--    browser on the buyer's first visit and sent with checkout.
-- 2. Facebook / show / other sales get an optional buyer name, so they count toward repeat buyers too.
-- 3. get_buyer_kpis(p_user_id, p_start, p_end) for the Dashboard's Buyers section.
--
-- A buyer is: a website email address, or a buyer name typed on a Facebook/show sale. A typed name that
-- matches the name on a website order counts as that website buyer. A "repeat" purchase is one on a later
-- day than the buyer's first purchase, so a buyer paying for several offers in one evening is still new.
-- =====================================================================

-- Same choices as the Got Cards? form, plus ChatGPT / AI (already sending visitors to the site).
ALTER TABLE public.web_sell_leads DROP CONSTRAINT IF EXISTS web_sell_leads_heard_from_check;
ALTER TABLE public.web_sell_leads ADD CONSTRAINT web_sell_leads_heard_from_check CHECK (heard_from IS NULL OR heard_from IN
  ('google','facebook','instagram','craigslist_nextdoor','show','card_flyer','friend','ai','other'));

ALTER TABLE public.web_orders
  ADD COLUMN IF NOT EXISTS heard_from text,
  ADD COLUMN IF NOT EXISTS first_referrer text,
  ADD COLUMN IF NOT EXISTS first_landing text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS first_visit_at timestamptz;

ALTER TABLE public.web_orders DROP CONSTRAINT IF EXISTS web_orders_heard_from_check;
ALTER TABLE public.web_orders DROP CONSTRAINT IF EXISTS web_orders_source_lengths_check;
ALTER TABLE public.web_orders
  ADD CONSTRAINT web_orders_heard_from_check CHECK (heard_from IS NULL OR heard_from IN
    ('google','facebook','instagram','craigslist_nextdoor','show','card_flyer','friend','ai','repeat','other')),
  ADD CONSTRAINT web_orders_source_lengths_check CHECK (
    coalesce(length(first_referrer), 0) <= 300 AND coalesce(length(first_landing), 0) <= 300 AND
    coalesce(length(utm_source), 0) <= 100 AND coalesce(length(utm_medium), 0) <= 100 AND
    coalesce(length(utm_campaign), 0) <= 100);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS buyer_name text;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_buyer_name_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_buyer_name_check
  CHECK (buyer_name IS NULL OR (length(btrim(buyer_name)) BETWEEN 1 AND 80));

-- Called by shop-checkout / shop-offer-pay (service role) right after the order is created.
-- Only fills blanks, only on an unpaid order; bad values are dropped rather than failing checkout.
CREATE OR REPLACE FUNCTION public.web_set_order_source(
  p_order_id uuid, p_heard_from text, p_referrer text, p_landing text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_first_visit_at timestamptz)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE web_orders SET
    heard_from     = coalesce(heard_from, CASE WHEN p_heard_from IN
                       ('google','facebook','instagram','craigslist_nextdoor','show','card_flyer','friend','ai','repeat','other')
                       THEN p_heard_from END),
    first_referrer = coalesce(first_referrer, left(nullif(btrim(p_referrer), ''), 300)),
    first_landing  = coalesce(first_landing,  left(nullif(btrim(p_landing), ''), 300)),
    utm_source     = coalesce(utm_source,     left(nullif(btrim(p_utm_source), ''), 100)),
    utm_medium     = coalesce(utm_medium,     left(nullif(btrim(p_utm_medium), ''), 100)),
    utm_campaign   = coalesce(utm_campaign,   left(nullif(btrim(p_utm_campaign), ''), 100)),
    first_visit_at = coalesce(first_visit_at, CASE WHEN p_first_visit_at <= now() THEN p_first_visit_at END)
  WHERE id = p_order_id AND paid_at IS NULL;
$function$;
REVOKE ALL ON FUNCTION public.web_set_order_source(uuid, text, text, text, text, text, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_set_order_source(uuid, text, text, text, text, text, text, timestamptz) TO service_role;

-- Where a website order came from, in one word: the buyer's answer first, else the first-visit tags.
CREATE OR REPLACE FUNCTION public.web_order_found_via(o public.web_orders)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN o.heard_from IS NOT NULL AND o.heard_from <> 'repeat' THEN o.heard_from
    WHEN lower(coalesce(o.utm_source, '')) ~ 'chatgpt|openai|perplexity|claude|gemini|copilot' THEN 'ai'
    WHEN lower(coalesce(o.first_referrer, '')) ~ 'chatgpt|openai|perplexity|claude\.ai|gemini|copilot' THEN 'ai'
    WHEN lower(coalesce(o.utm_source, '') || ' ' || coalesce(o.first_referrer, '')) ~ 'facebook|fb\.|messenger' THEN 'facebook'
    WHEN lower(coalesce(o.first_landing, '')) ~ 'fbclid' THEN 'facebook'
    WHEN lower(coalesce(o.utm_source, '') || ' ' || coalesce(o.first_referrer, '')) ~ 'instagram' THEN 'instagram'
    WHEN lower(coalesce(o.utm_source, '') || ' ' || coalesce(o.first_referrer, '')) ~ 'google|bing|duckduckgo|yahoo' THEN 'google'
    WHEN lower(coalesce(o.utm_source, '') || ' ' || coalesce(o.first_referrer, '')) ~ 'craigslist|nextdoor' THEN 'craigslist_nextdoor'
    WHEN o.first_referrer IS NOT NULL THEN 'other_site'
    WHEN o.first_visit_at IS NOT NULL THEN 'direct'
    ELSE 'unknown'
  END;
$function$;

-- Names Colton has typed before plus website buyers' names, for the buyer box's suggestions.
CREATE OR REPLACE FUNCTION public.get_buyer_names(p_user_id uuid)
 RETURNS TABLE(name text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (lower(regexp_replace(btrim(n), '\s+', ' ', 'g'))) btrim(n)
  FROM (
    SELECT buyer_name AS n FROM transactions
     WHERE user_id = p_user_id AND buyer_name IS NOT NULL AND NOT coalesce(deleted, false)
    UNION ALL
    SELECT buyer_name FROM web_orders WHERE user_id = p_user_id AND paid_at IS NOT NULL AND buyer_name IS NOT NULL
  ) x
  ORDER BY lower(regexp_replace(btrim(n), '\s+', ' ', 'g')), btrim(n);
$function$;

CREATE OR REPLACE FUNCTION public.get_buyer_kpis(p_user_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH web AS (
    SELECT o.buyer_email, o.buyer_name, o.paid_at, web_order_found_via(o) AS via,
           (o.paid_at AT TIME ZONE 'America/New_York')::date AS d,
           greatest(o.total - coalesce(o.shipping, 0) + coalesce(o.shipping_refunded, 0) - coalesce(o.refunded_amount, 0), 0) AS amt
    FROM web_orders o
    WHERE o.user_id = p_user_id AND o.paid_at IS NOT NULL AND o.buyer_email IS NOT NULL
  ),
  -- website names → that buyer's email (earliest order wins if a name was used with two emails)
  web_names AS (
    SELECT DISTINCT ON (lower(regexp_replace(btrim(buyer_name), '\s+', ' ', 'g')))
           lower(regexp_replace(btrim(buyer_name), '\s+', ' ', 'g')) AS nk, 'e:' || lower(btrim(buyer_email)) AS k
    FROM web WHERE buyer_name IS NOT NULL ORDER BY 1, paid_at
  ),
  offline AS (
    SELECT t.revenue AS amt, (t.transaction_date AT TIME ZONE 'UTC')::date AS d,
           t.buyer_name, lower(regexp_replace(btrim(t.buyer_name), '\s+', ' ', 'g')) AS nk
    FROM transactions t
    WHERE t.user_id = p_user_id AND t.transaction_type IN ('show_card_sale', 'bulk_sale')
      AND NOT coalesce(t.deleted, false) AND coalesce(t.sales_channel, '') <> 'website'
  ),
  buys AS (
    SELECT 'e:' || lower(btrim(buyer_email)) AS k, d, amt, 'website' AS channel, via, paid_at AS ts
    FROM web
    UNION ALL
    SELECT coalesce(wn.k, 'n:' || o.nk), o.d, o.amt, 'offline', NULL, o.d::timestamptz
    FROM offline o LEFT JOIN web_names wn ON wn.nk = o.nk
    WHERE o.buyer_name IS NOT NULL
  ),
  firsts AS (SELECT k, min(d) AS first_d FROM buys GROUP BY k),
  first_via AS (   -- how a website buyer found us: their first website order
    SELECT DISTINCT ON (k) k, via FROM buys WHERE channel = 'website' ORDER BY k, ts
  ),
  tagged AS (
    SELECT b.*, f.first_d, b.d > f.first_d AS is_repeat
    FROM buys b JOIN firsts f USING (k)
  ),
  per AS (SELECT * FROM tagged WHERE (p_start IS NULL OR d >= p_start) AND (p_end IS NULL OR d <= p_end)),
  -- all-time to the end of the period: buyers with purchases on 2+ different days
  upto AS (SELECT k, count(DISTINCT d) AS days FROM tagged WHERE p_end IS NULL OR d <= p_end GROUP BY k),
  new_b AS (SELECT DISTINCT k FROM per WHERE d = first_d),
  untagged AS (
    SELECT coalesce(sum(amt), 0) AS amt, count(*) AS n FROM offline
    WHERE buyer_name IS NULL AND (p_start IS NULL OR d >= p_start) AND (p_end IS NULL OR d <= p_end)
  )
  SELECT jsonb_build_object(
    'buyers',          (SELECT count(DISTINCT k) FROM per),
    'new_buyers',      (SELECT count(*) FROM new_b),
    'returning_buyers',(SELECT count(DISTINCT k) FROM per WHERE is_repeat),
    'buyer_sales',     (SELECT coalesce(sum(amt), 0) FROM per),
    'repeat_sales',    (SELECT coalesce(sum(amt), 0) FROM per WHERE is_repeat),
    'new_sales',       (SELECT coalesce(sum(amt), 0) FROM per WHERE NOT is_repeat),
    'buyers_to_date',  (SELECT count(*) FROM upto),
    'repeat_to_date',  (SELECT count(*) FROM upto WHERE days >= 2),
    'untagged_sales',  (SELECT amt FROM untagged),
    'untagged_count',  (SELECT n FROM untagged),
    'new_found_via',   coalesce((
       SELECT jsonb_agg(jsonb_build_object('via', via, 'buyers', n) ORDER BY n DESC, via)
       FROM (SELECT coalesce(fv.via, 'not_website') AS via, count(*) AS n
             FROM new_b LEFT JOIN first_via fv USING (k) GROUP BY 1) v), '[]'::jsonb)
  );
$function$;
