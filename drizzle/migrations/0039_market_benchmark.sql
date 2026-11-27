-- =====================================================================
-- EndZone 0039 — Market tracker: Colton's monthly sales next to the overall sports card market (Scott, 27 Nov 2026)
--
-- Benchmark (Scott's choice): GemRate's monthly total of single sports cards sold on eBay. Sports only (no
-- Pokémon / TCG), singles only (no lots, packs or wax). GemRate has no API, so figures are copied from its
-- published monthly recaps; a monthly scheduled task adds each new month with its source link.
--
-- 1. market_benchmarks: one row per series per month. Anyone signed in can read it; nobody can write it
--    from the app (no write policies). Rows are added by the postgres role (the scheduled task).
-- 2. get_market_comparison(p_user_id, p_months): the last p_months months, with the user's sales, the
--    market figure, and both as an index (100 = their average over the first three full months where
--    both exist, after the month of the first recorded sale, which is usually only part of a month). Same sales rule and business-date convention as get_period_series.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.market_benchmarks (
  series      text          NOT NULL DEFAULT 'gemrate_ebay_sports_singles',
  month       date          NOT NULL,
  value_usd   numeric(14,2) NOT NULL,
  source_url  text          NOT NULL,
  source_note text,
  added_at    timestamptz   NOT NULL DEFAULT now(),
  PRIMARY KEY (series, month),
  CONSTRAINT market_benchmarks_month_check CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT market_benchmarks_value_check CHECK (value_usd > 0),
  CONSTRAINT market_benchmarks_series_check CHECK (series IN ('gemrate_ebay_sports_singles'))
);

ALTER TABLE public.market_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users can read market benchmarks" ON public.market_benchmarks;
CREATE POLICY "Signed-in users can read market benchmarks" ON public.market_benchmarks
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.market_benchmarks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.market_benchmarks FROM authenticated;

-- History found 27 Nov 2026. Jul–Aug 2025 were published only as a combined figure; Aug–Oct 2026 had not
-- turned up in public reports yet. The scheduled task fills gaps when it finds them.
INSERT INTO public.market_benchmarks (month, value_usd, source_url, source_note) VALUES
  ('2025-09-01', 156000000, 'https://www.sportscollectorsdaily.com/tag/ebay-sales/', 'SC Daily: October $163M, up from $156M in September'),
  ('2025-10-01', 163000000, 'https://www.sportscollectorsdaily.com/tag/ebay-sales/', 'SC Daily: October $163M'),
  ('2025-11-01', 161000000, 'https://x.com/gemrate/status/2011994249789612396', 'GemRate December recap: November $161M'),
  ('2025-12-01', 166000000, 'https://x.com/gemrate/status/2021037967955869784', 'GemRate January recap: December $166M (first reported $165M)'),
  ('2026-01-01', 198000000, 'https://x.com/gemrate/status/2021037967955869784', 'GemRate January recap'),
  ('2026-02-01', 191000000, 'https://www.sportscollectorsdaily.com/ebay-sports-card-sales-hit-233-million-in-march-2026-as-market-surges/', 'SC Daily: February $191M'),
  ('2026-03-01', 233000000, 'https://www.sportscollectorsdaily.com/ebay-sports-card-sales-hit-233-million-in-march-2026-as-market-surges/', 'SC Daily: March $233M'),
  ('2026-04-01', 227000000, 'https://www.sportscollectorsdaily.com/ohtani-jordan-wemby-lead-list-as-monthly-ebay-card-sales-hit-227m/', 'SC Daily: April $227M'),
  ('2026-05-01', 247000000, 'https://www.sportscollectorsdaily.com/jalen-brunson-leads-june-surge-in-ebay-card-sales-as-sports-singles-market-continues/', 'SC Daily: May $247M; June up 6% to $262M'),
  ('2026-06-01', 262000000, 'https://www.sportscollectorsdaily.com/jalen-brunson-leads-june-surge-in-ebay-card-sales-as-sports-singles-market-continues/', 'SC Daily: June $262M'),
  ('2026-07-01', 290000000, 'https://www.sportscollectorsdaily.com/jordan-lebron-world-cup-stars-push-ebay-july-sales-to-290-million/', 'SC Daily: July $290M')
ON CONFLICT (series, month) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_market_comparison(p_user_id uuid, p_months integer DEFAULT 18)
RETURNS TABLE(month date, sales numeric, sale_count bigint, market_usd numeric, source_url text,
              is_partial boolean, is_base boolean, sales_index numeric, market_index numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH today AS (SELECT (now() AT TIME ZONE 'America/New_York')::date AS d),
  months AS (
    SELECT gs::date AS m
    FROM today,
         generate_series(date_trunc('month', today.d::timestamp) - make_interval(months => greatest(least(coalesce(p_months, 18), 36), 1) - 1),
                         date_trunc('month', today.d::timestamp), interval '1 month') gs
  ),
  first_sale AS (
    SELECT date_trunc('month', min((t.transaction_date AT TIME ZONE 'UTC')::date)::timestamp)::date AS m
    FROM transactions t
    WHERE t.user_id = p_user_id AND t.transaction_type IN ('show_card_sale', 'bulk_sale') AND NOT coalesce(t.deleted, false)
  ),
  sales AS (
    SELECT date_trunc('month', ((t.transaction_date AT TIME ZONE 'UTC')::date)::timestamp)::date AS m,
           sum(t.revenue) AS revenue, count(*) AS n
    FROM transactions t
    WHERE t.user_id = p_user_id AND t.transaction_type IN ('show_card_sale', 'bulk_sale') AND NOT coalesce(t.deleted, false)
    GROUP BY 1
  ),
  rows AS (
    SELECT k.m,
           -- months before the first recorded sale have no sales figure (not $0)
           CASE WHEN f.m IS NOT NULL AND k.m >= f.m THEN coalesce(s.revenue, 0) END AS sales,
           coalesce(s.n, 0) AS n,
           b.value_usd AS market, b.source_url,
           k.m = date_trunc('month', (SELECT d FROM today)::timestamp)::date AS partial
    FROM months k
    CROSS JOIN first_sale f
    LEFT JOIN sales s ON s.m = k.m
    LEFT JOIN market_benchmarks b ON b.series = 'gemrate_ebay_sports_singles' AND b.month = k.m
  ),
  base_months AS (
    -- skip the month of the first recorded sale: record-keeping usually starts part-way through it
    SELECT r.m FROM rows r CROSS JOIN first_sale f
    WHERE r.sales IS NOT NULL AND r.market IS NOT NULL AND NOT r.partial AND r.m > f.m
    ORDER BY r.m LIMIT 3
  ),
  base AS (
    SELECT avg(r.sales) AS sales, avg(r.market) AS market FROM rows r JOIN base_months USING (m)
  )
  SELECT r.m, r.sales, r.n, r.market, r.source_url, r.partial,
         r.m IN (SELECT m FROM base_months),
         CASE WHEN b.sales > 0 AND r.sales IS NOT NULL THEN round(100 * r.sales / b.sales, 1) END,
         CASE WHEN b.market > 0 AND r.market IS NOT NULL THEN round(100 * r.market / b.market, 1) END
  FROM rows r CROSS JOIN base b
  ORDER BY r.m;
$function$;

REVOKE ALL ON FUNCTION public.get_market_comparison(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_market_comparison(uuid, integer) TO authenticated, service_role;
