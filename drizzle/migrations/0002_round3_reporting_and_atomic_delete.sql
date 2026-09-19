-- =====================================================================
-- EndZone Round 3 — reporting functions + atomic sale deletion
-- =====================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_transaction_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tx   transactions%ROWTYPE;
  v_acct uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN RAISE EXCEPTION 'Deletion reason must be at least 10 characters'; END IF;
  IF length(btrim(p_reason)) > 500 THEN RAISE EXCEPTION 'Deletion reason must be less than 500 characters'; END IF;

  SELECT * INTO v_tx FROM transactions
  WHERE id = p_transaction_id AND user_id = v_user
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF COALESCE(v_tx.deleted, false) THEN RAISE EXCEPTION 'Transaction is already deleted'; END IF;

  UPDATE transactions
  SET deleted = true, deleted_at = now(), deletion_reason = btrim(p_reason)
  WHERE id = p_transaction_id;

  IF v_tx.transaction_type = 'show_card_sale' AND v_tx.show_card_id IS NOT NULL THEN
    UPDATE show_cards SET status = 'available', updated_at = now()
    WHERE id = v_tx.show_card_id AND user_id = v_user;
  END IF;

  IF v_tx.transaction_type IN ('show_card_sale','bulk_sale') AND v_tx.revenue > 0 THEN
    -- Reverse from the same account the sale landed in; fall back to the default account.
    SELECT account_id INTO v_acct FROM cash_transactions
    WHERE related_transaction_id = p_transaction_id AND transaction_type = 'auto_sale'
    LIMIT 1;

    INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, related_transaction_id, entry_date, notes)
    VALUES (v_user, v_acct, 'adjustment', -v_tx.revenue, p_transaction_id,
            (v_tx.transaction_date AT TIME ZONE 'UTC')::date,
            'Reversal for deleted sale ' || p_transaction_id);
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.soft_delete_sale(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. TREND SERIES
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_period_series(
  p_user_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_grain text DEFAULT 'week')
RETURNS TABLE (
  period_start    date,
  revenue         numeric,
  purchased       numeric,
  expenses        numeric,
  sale_count      bigint,
  rolling_revenue numeric
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH bounds AS (
    SELECT
      COALESCE(p_start, LEAST(
        (SELECT MIN((t.transaction_date AT TIME ZONE 'UTC')::date) FROM transactions t WHERE t.user_id = p_user_id),
        (SELECT MIN(l.purchase_date) FROM lots l WHERE l.user_id = p_user_id),
        (p_end))) AS s,
      COALESCE(p_end, (now() AT TIME ZONE 'America/New_York')::date) AS e,
      CASE WHEN p_grain = 'month' THEN 'month' ELSE 'week' END AS g
  ),
  buckets AS (
    SELECT gs::date AS bstart
    FROM bounds b,
         generate_series(date_trunc(b.g, b.s::timestamp), date_trunc(b.g, b.e::timestamp),
                         CASE WHEN b.g = 'month' THEN interval '1 month' ELSE interval '1 week' END) gs
    WHERE b.s IS NOT NULL
  ),
  sales AS (
    SELECT date_trunc(b.g, ((t.transaction_date AT TIME ZONE 'UTC')::date)::timestamp)::date AS bstart,
           SUM(t.revenue) AS revenue, COUNT(*) AS n
    FROM transactions t, bounds b
    WHERE t.user_id = p_user_id
      AND t.transaction_type IN ('show_card_sale','bulk_sale')
      AND COALESCE(t.deleted, false) = false
      AND (t.transaction_date AT TIME ZONE 'UTC')::date BETWEEN b.s AND b.e
    GROUP BY 1
  ),
  buys AS (
    SELECT date_trunc(b.g, l.purchase_date::timestamp)::date AS bstart, SUM(l.total_cost) AS purchased
    FROM lots l, bounds b
    WHERE l.user_id = p_user_id AND l.purchase_date BETWEEN b.s AND b.e
    GROUP BY 1
  ),
  exps AS (
    SELECT date_trunc(b.g, x.expense_date::timestamp)::date AS bstart, SUM(x.amount) AS expenses
    FROM expenses x, bounds b
    WHERE x.user_id = p_user_id AND x.expense_date BETWEEN b.s AND b.e
    GROUP BY 1
  ),
  joined AS (
    SELECT k.bstart,
           COALESCE(s.revenue, 0)   AS revenue,
           COALESCE(y.purchased, 0) AS purchased,
           COALESCE(x.expenses, 0)  AS expenses,
           COALESCE(s.n, 0)         AS sale_count
    FROM buckets k
    LEFT JOIN sales s ON s.bstart = k.bstart
    LEFT JOIN buys  y ON y.bstart = k.bstart
    LEFT JOIN exps  x ON x.bstart = k.bstart
  )
  SELECT j.bstart, j.revenue, j.purchased, j.expenses, j.sale_count,
         ROUND(CASE WHEN (SELECT g FROM bounds) = 'month'
                    THEN AVG(j.revenue) OVER (ORDER BY j.bstart ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
                    ELSE AVG(j.revenue) OVER (ORDER BY j.bstart ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) END, 2)
  FROM joined j
  ORDER BY j.bstart;
$$;

GRANT EXECUTE ON FUNCTION public.get_period_series(uuid, date, date, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. EXPENSE SUMMARY
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_expense_summary(p_user_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH x AS (
    SELECT * FROM expenses e
    WHERE e.user_id = p_user_id
      AND (p_start IS NULL OR e.expense_date >= p_start)
      AND (p_end   IS NULL OR e.expense_date <= p_end)
  )
  SELECT jsonb_build_object(
    'total',                 COALESCE((SELECT SUM(amount) FROM x), 0),
    'count',                 (SELECT COUNT(*) FROM x),
    'paid_personally_total', COALESCE((SELECT SUM(amount) FROM x WHERE paid_personally), 0),
    'by_category',           COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'total', total, 'count', n)
                                                   ORDER BY total DESC, category)
                                       FROM (SELECT category, SUM(amount) AS total, COUNT(*) AS n FROM x GROUP BY category) c),
                                      '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_expense_summary(uuid, date, date) TO authenticated;