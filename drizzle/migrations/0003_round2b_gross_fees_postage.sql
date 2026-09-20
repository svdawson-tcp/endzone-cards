-- =====================================================================
-- EndZone Round 2B — gross sales, platform fees, out-of-pocket postage, channel reporting
-- =====================================================================

ALTER TABLE public.transactions
  ADD COLUMN gross_amount           numeric(10,2) CHECK (gross_amount IS NULL OR gross_amount >= 0),
  ADD COLUMN shipping_out_of_pocket numeric(10,2) CHECK (shipping_out_of_pocket IS NULL OR shipping_out_of_pocket >= 0),
  ADD CONSTRAINT gross_not_below_net CHECK (gross_amount IS NULL OR gross_amount >= revenue);

ALTER TABLE public.transactions
  ADD COLUMN platform_fee numeric(10,2)
  GENERATED ALWAYS AS (CASE WHEN gross_amount IS NULL THEN NULL ELSE gross_amount - revenue END) STORED;

ALTER TABLE public.expenses
  ADD COLUMN related_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX expenses_related_transaction_idx ON public.expenses (related_transaction_id)
  WHERE related_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_shipping_expense_from_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_date date := (NEW.transaction_date AT TIME ZONE 'UTC')::date;
BEGIN
  IF NEW.shipping_out_of_pocket IS NULL OR NEW.shipping_out_of_pocket <= 0 OR COALESCE(NEW.deleted, false) THEN
    DELETE FROM expenses WHERE related_transaction_id = NEW.id;
    RETURN NEW;
  END IF;

  UPDATE expenses
  SET amount = NEW.shipping_out_of_pocket, expense_date = v_date, paid_personally = true
  WHERE related_transaction_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO expenses (user_id, expense_date, amount, category, paid_personally, related_transaction_id, notes)
    VALUES (NEW.user_id, v_date, NEW.shipping_out_of_pocket, 'Shipping & Postage', true, NEW.id,
            'Postage covered personally on sale ' || NEW.id);
  END IF;

  RETURN NEW;
END; $$;

CREATE TRIGGER trigger_shipping_expense_from_sale
AFTER INSERT OR UPDATE OF shipping_out_of_pocket, transaction_date, deleted ON public.transactions
FOR EACH ROW EXECUTE FUNCTION sync_shipping_expense_from_sale();

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
    SELECT account_id INTO v_acct FROM cash_transactions
    WHERE related_transaction_id = p_transaction_id AND transaction_type = 'auto_sale'
    LIMIT 1;

    INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, related_transaction_id, entry_date, notes)
    VALUES (v_user, v_acct, 'adjustment', -v_tx.revenue, p_transaction_id,
            (v_tx.transaction_date AT TIME ZONE 'UTC')::date,
            'Reversal for deleted sale ' || p_transaction_id);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_user_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH sales AS (
    SELECT t.transaction_type, t.revenue, t.gross_amount, t.platform_fee,
           COALESCE(t.sales_channel, 'unknown') AS channel
    FROM transactions t
    WHERE t.user_id = p_user_id
      AND t.transaction_type IN ('show_card_sale','bulk_sale')
      AND COALESCE(t.deleted, false) = false
      AND (p_start IS NULL OR (t.transaction_date AT TIME ZONE 'UTC')::date >= p_start)
      AND (p_end   IS NULL OR (t.transaction_date AT TIME ZONE 'UTC')::date <= p_end)
  ),
  s AS (
    SELECT COALESCE(SUM(revenue),0) AS revenue,
           COALESCE(SUM(revenue) FILTER (WHERE transaction_type='show_card_sale'),0) AS premium_revenue,
           COALESCE(SUM(revenue) FILTER (WHERE transaction_type='bulk_sale'),0) AS bulk_revenue,
           COUNT(*) AS sale_count,
           COALESCE(SUM(COALESCE(gross_amount, revenue)),0) AS gross_sales,
           COALESCE(SUM(platform_fee),0) AS platform_fees,
           COUNT(*) FILTER (WHERE gross_amount IS NOT NULL) AS sales_with_gross
    FROM sales
  ),
  b AS (
    SELECT COALESCE(SUM(l.total_cost),0) AS purchased, COUNT(*) AS lots_purchased
    FROM lots l
    WHERE l.user_id = p_user_id
      AND (p_start IS NULL OR l.purchase_date >= p_start)
      AND (p_end   IS NULL OR l.purchase_date <= p_end)
  ),
  e AS (
    SELECT COALESCE(SUM(x.amount),0) AS expenses, COUNT(*) AS expense_count
    FROM expenses x
    WHERE x.user_id = p_user_id
      AND (p_start IS NULL OR x.expense_date >= p_start)
      AND (p_end   IS NULL OR x.expense_date <= p_end)
  ),
  o AS (
    SELECT COALESCE(SUM(c.amount) FILTER (WHERE c.transaction_type='owner_contribution'),0)  AS contributions,
           COALESCE(-SUM(c.amount) FILTER (WHERE c.transaction_type='owner_draw'),0)         AS draws,
           COALESCE(-SUM(c.amount) FILTER (WHERE c.transaction_type='reimbursement'),0)      AS reimbursements
    FROM cash_transactions c
    WHERE c.user_id = p_user_id
      AND (p_start IS NULL OR c.entry_date >= p_start)
      AND (p_end   IS NULL OR c.entry_date <= p_end)
  ),
  ch AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'channel', channel, 'revenue', revenue, 'sale_count', n,
             'gross', gross, 'fees', fees) ORDER BY revenue DESC), '[]'::jsonb) AS by_channel
    FROM (
      SELECT channel, SUM(revenue) AS revenue, COUNT(*) AS n,
             SUM(COALESCE(gross_amount, revenue)) AS gross,
             COALESCE(SUM(platform_fee),0) AS fees
      FROM sales GROUP BY channel
    ) q
  )
  SELECT jsonb_build_object(
    'revenue',             s.revenue,
    'gross_sales',         s.gross_sales,
    'platform_fees',       s.platform_fees,
    'sales_with_gross',    s.sales_with_gross,
    'premium_revenue',     s.premium_revenue,
    'bulk_revenue',        s.bulk_revenue,
    'sale_count',          s.sale_count,
    'avg_sale',            CASE WHEN s.sale_count > 0 THEN ROUND(s.revenue / s.sale_count, 2) ELSE 0 END,
    'inventory_purchased', b.purchased,
    'lots_purchased',      b.lots_purchased,
    'expenses',            e.expenses,
    'expense_count',       e.expense_count,
    'cash_in_minus_out',   s.revenue - b.purchased - e.expenses,
    'tax_setaside',        ROUND(s.gross_sales * 0.04, 2),
    'owner_contributions', o.contributions,
    'owner_draws',         o.draws,
    'reimbursements',      o.reimbursements,
    'by_channel',          ch.by_channel,
    'cash_on_hand',        (SELECT COALESCE(SUM(c.amount),0) FROM cash_transactions c WHERE c.user_id = p_user_id),
    'owed_to_owner',       (SELECT COALESCE(SUM(x.amount),0) FROM expenses x WHERE x.user_id = p_user_id AND x.paid_personally)
                         + (SELECT COALESCE(SUM(c.amount),0) FROM cash_transactions c WHERE c.user_id = p_user_id AND c.transaction_type = 'reimbursement'),
    'accounts',            (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                'id', a.id, 'name', a.name, 'kind', a.kind, 'target', a.target_amount,
                                'is_default', a.is_default,
                                'balance', (SELECT COALESCE(SUM(c.amount),0) FROM cash_transactions c WHERE c.account_id = a.id))
                              ORDER BY a.sort_order, a.name), '[]'::jsonb)
                            FROM cash_accounts a WHERE a.user_id = p_user_id AND NOT a.archived),
    'active_lots',         (SELECT COUNT(*) FROM lots l2 WHERE l2.user_id = p_user_id AND l2.status = 'active'),
    'listed_cards',        (SELECT COUNT(*) FROM show_cards sc WHERE sc.user_id = p_user_id AND sc.status = 'available'),
    'listed_cards_value',  (SELECT COALESCE(SUM(sc.asking_price),0) FROM show_cards sc WHERE sc.user_id = p_user_id AND sc.status = 'available')
  )
  FROM s, b, e, o, ch;
$$;
