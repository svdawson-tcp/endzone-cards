-- =====================================================================
-- EndZone 0038 — Buyers tiles show the average sale (Scott, 26 Nov 2026)
-- get_buyer_kpis adds new_count / repeat_count: how many purchases (website orders + named Facebook/show
-- sales) made up first-time and repeat sales, and new_avg / repeat_avg (average sale,
-- computed here so the Dashboard does no money math).
-- =====================================================================
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
    'new_count',       (SELECT count(*) FROM per WHERE NOT is_repeat),
    'repeat_count',    (SELECT count(*) FROM per WHERE is_repeat),
    'new_avg',         (SELECT round(avg(amt), 2) FROM per WHERE NOT is_repeat),
    'repeat_avg',      (SELECT round(avg(amt), 2) FROM per WHERE is_repeat),
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
