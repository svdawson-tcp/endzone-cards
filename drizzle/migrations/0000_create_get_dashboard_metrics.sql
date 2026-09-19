-- ISS-004 / ISS-005 / ISS-006: all homepage money math in the database.
-- SECURITY INVOKER: existing RLS policies (incl. mentor access) still decide which rows are visible.
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_user_id uuid,
  p_start   date DEFAULT NULL,   -- NULL = all time
  p_end     date DEFAULT NULL    -- NULL = no upper bound
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH sales AS (
    SELECT t.transaction_type, t.revenue
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.transaction_type IN ('show_card_sale', 'bulk_sale')
      AND COALESCE(t.deleted, false) = false
      -- transaction_date is timestamptz holding midnight UTC for the business day
      AND (p_start IS NULL OR (t.transaction_date AT TIME ZONE 'UTC')::date >= p_start)
      AND (p_end   IS NULL OR (t.transaction_date AT TIME ZONE 'UTC')::date <= p_end)
  ),
  s AS (
    SELECT
      COALESCE(SUM(revenue), 0)                                                    AS revenue,
      COALESCE(SUM(revenue) FILTER (WHERE transaction_type = 'show_card_sale'), 0) AS premium_revenue,
      COALESCE(SUM(revenue) FILTER (WHERE transaction_type = 'bulk_sale'), 0)      AS bulk_revenue,
      COUNT(*)                                                                     AS sale_count
    FROM sales
  ),
  b AS (
    SELECT COALESCE(SUM(l.total_cost), 0) AS purchased, COUNT(*) AS lots_purchased
    FROM lots l
    WHERE l.user_id = p_user_id
      AND (p_start IS NULL OR l.purchase_date >= p_start)
      AND (p_end   IS NULL OR l.purchase_date <= p_end)
  ),
  e AS (
    SELECT COALESCE(SUM(x.amount), 0) AS expenses, COUNT(*) AS expense_count
    FROM expenses x
    WHERE x.user_id = p_user_id
      AND (p_start IS NULL OR x.expense_date >= p_start)
      AND (p_end   IS NULL OR x.expense_date <= p_end)
  )
  SELECT jsonb_build_object(
    -- period metrics
    'revenue',             s.revenue,
    'premium_revenue',     s.premium_revenue,
    'bulk_revenue',        s.bulk_revenue,
    'sale_count',          s.sale_count,
    'avg_sale',            CASE WHEN s.sale_count > 0 THEN ROUND(s.revenue / s.sale_count, 2) ELSE 0 END,
    'inventory_purchased', b.purchased,
    'lots_purchased',      b.lots_purchased,
    'expenses',            e.expenses,
    'expense_count',       e.expense_count,
    'cash_in_minus_out',   s.revenue - b.purchased - e.expenses,
    'tax_setaside',        ROUND(s.revenue * 0.04, 2),
    -- point-in-time metrics (ignore the period)
    'cash_on_hand',        (SELECT COALESCE(SUM(c.amount), 0) FROM cash_transactions c WHERE c.user_id = p_user_id),
    'active_lots',         (SELECT COUNT(*) FROM lots l2 WHERE l2.user_id = p_user_id AND l2.status = 'active'),
    'listed_cards',        (SELECT COUNT(*) FROM show_cards sc WHERE sc.user_id = p_user_id AND sc.status = 'available'),
    'listed_cards_value',  (SELECT COALESCE(SUM(sc.asking_price), 0) FROM show_cards sc WHERE sc.user_id = p_user_id AND sc.status = 'available')
  )
  FROM s, b, e;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(uuid, date, date) TO authenticated;