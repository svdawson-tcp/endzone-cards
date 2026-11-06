-- =====================================================================
-- EndZone 0020 — Stripe refunds flow into EndZone's books; ticker lines for the EndZone Hide button
-- (Nov 6 2026)
--
-- Refunds. Until now a refund made in Stripe left the sale in EndZone (Larry's $6 on CS-1023, Colton's test
-- orders). web_apply_refund() is called with the payment's total refunded so far (from the charge.refunded
-- webhook and from the hourly sync-refunds job), applies only what is new, and follows soft_delete_sale's
-- pattern:
--   * Full refund, order not shipped: each sale row is deleted (reason "Refunded in Stripe …") with a cash
--     reversal dated the refund day, the card goes back to available (it is still on hand and relists if it
--     was on the website), and the Stripe fee, which Stripe keeps, becomes a "Bank & Payment Fees" expense.
--   * Full refund after shipping: the sale rows go to $0 (cash follows), the card stays sold, the fee becomes
--     an expense, and the order gets a "check this order" note.
--   * Partial refund: the sale rows are reduced by the amount (cash follows). A refund equal to the order's
--     shipping comes out of the shipping part of each row; anything else is spread by each row's amount.
--   Shipping already refunded by automatic combined shipping (0017) counts as done, so it isn't taken twice.
--
-- Ticker. get_big_games_admin() lists the matched lines of the last 8 days, hidden ones included, for the
-- owner, so EndZone can show Hide / Show buttons (web_hide_big_game already exists, owner-only).
-- =====================================================================

ALTER TABLE public.web_orders
  ADD COLUMN refunded_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  ADD COLUMN refunded_at     timestamptz;
COMMENT ON COLUMN public.web_orders.refunded_amount IS
  'Refunded in Stripe and applied to EndZone, not counting shipping_refunded (automatic combined shipping).';

CREATE FUNCTION public.web_apply_refund(p_payment_intent text, p_refunded numeric, p_refunded_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o         web_orders;
  t         record;
  v_total   numeric(10,2) := round(coalesce(p_refunded, 0), 2);
  v_charged numeric(10,2);
  v_done    numeric(10,2);
  v_delta   numeric(10,2);
  v_full    boolean;
  v_date    date := (coalesce(p_refunded_at, now()) AT TIME ZONE 'America/New_York')::date;
  v_reason  text;
  v_acct    uuid;
  v_base    numeric(10,2);
  v_left    numeric(10,2);
  v_share   numeric(10,2);
  v_ship    boolean;
  n integer; i integer := 0;
  v_action  text;
BEGIN
  SELECT * INTO o FROM web_orders WHERE stripe_payment_intent_id = p_payment_intent AND status = 'paid' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('action', 'none', 'why', 'no paid order for this payment'); END IF;

  v_charged := o.total + coalesce(o.shipping_refunded, 0);          -- what Stripe actually charged
  v_done    := o.refunded_amount + coalesce(o.shipping_refunded, 0); -- refunds already in the books
  v_delta   := v_total - v_done;
  IF v_delta <= 0 THEN RETURN jsonb_build_object('action', 'none', 'why', 'nothing new'); END IF;
  v_full   := v_total >= v_charged;
  v_reason := 'Refunded in Stripe (website order ' || o.order_number || ')';

  IF v_full AND o.shipped_at IS NULL THEN
    -- ---- like soft_delete_sale, row by row
    FOR t IN SELECT tr.* FROM transactions tr JOIN web_order_items oi ON oi.transaction_id = tr.id
             WHERE oi.order_id = o.id AND NOT coalesce(tr.deleted, false) FOR UPDATE OF tr
    LOOP
      UPDATE transactions SET deleted = true, deleted_at = now(), deletion_reason = v_reason WHERE id = t.id;
      IF t.show_card_id IS NOT NULL THEN
        UPDATE show_cards SET status = 'available', updated_at = now()
        WHERE id = t.show_card_id AND user_id = t.user_id AND status = 'sold';
      END IF;
      IF t.revenue > 0 THEN
        SELECT account_id INTO v_acct FROM cash_transactions
        WHERE related_transaction_id = t.id AND transaction_type = 'auto_sale' LIMIT 1;
        INSERT INTO cash_transactions (user_id, account_id, transaction_type, amount, related_transaction_id, entry_date, notes)
        VALUES (t.user_id, v_acct, 'adjustment', -t.revenue, t.id, v_date, 'Reversal: ' || v_reason);
      END IF;
    END LOOP;
    v_action := 'full_unshipped';
  ELSE
    -- ---- reduce the sale rows by v_delta (all of what's left when the refund is full)
    SELECT count(*), sum(CASE WHEN tr.gross_amount > oi.price - oi.discount THEN tr.gross_amount - (oi.price - oi.discount) ELSE 0 END)
      INTO n, v_base
    FROM transactions tr JOIN web_order_items oi ON oi.transaction_id = tr.id
    WHERE oi.order_id = o.id AND NOT coalesce(tr.deleted, false);
    v_ship := NOT v_full AND o.shipping > 0 AND v_delta = o.shipping AND coalesce(v_base, 0) >= v_delta;
    IF NOT v_ship THEN
      SELECT sum(tr.gross_amount) INTO v_base
      FROM transactions tr JOIN web_order_items oi ON oi.transaction_id = tr.id
      WHERE oi.order_id = o.id AND NOT coalesce(tr.deleted, false);
    END IF;
    v_left := least(v_delta, coalesce(v_base, 0));
    FOR t IN SELECT tr.*, oi.price - oi.discount AS net_price
             FROM transactions tr JOIN web_order_items oi ON oi.transaction_id = tr.id
             WHERE oi.order_id = o.id AND NOT coalesce(tr.deleted, false)
             ORDER BY oi.price, oi.id FOR UPDATE OF tr
    LOOP
      i := i + 1;
      IF v_full THEN
        v_share := t.gross_amount;
      ELSIF i = n THEN
        v_share := v_left;
      ELSIF v_ship THEN
        v_share := round(least(v_delta, coalesce(v_base, 0)) * greatest(t.gross_amount - t.net_price, 0) / nullif(v_base, 0), 2);
      ELSE
        v_share := round(least(v_delta, coalesce(v_base, 0)) * t.gross_amount / nullif(v_base, 0), 2);
      END IF;
      v_share := least(greatest(coalesce(v_share, 0), 0), t.gross_amount);
      v_left := v_left - v_share;
      UPDATE transactions
      SET gross_amount = t.gross_amount - v_share,
          revenue = CASE WHEN v_full THEN 0 ELSE greatest(t.revenue - v_share, 0) END,
          notes = coalesce(notes, '') || ' · ' || to_char(v_share, 'FM$999990.00') || ' refunded ' || to_char(v_date, 'Mon DD')
      WHERE id = t.id;
    END LOOP;
    IF v_full THEN
      UPDATE web_orders SET problem_note = concat_ws('; ', problem_note,
        'Fully refunded after it was marked shipped. The cards stay sold in EndZone; change them if they came back')
      WHERE id = o.id;
    END IF;
    v_action := CASE WHEN v_full THEN 'full_shipped' WHEN v_ship THEN 'partial_shipping' ELSE 'partial' END;
  END IF;

  -- Stripe keeps its fee on a refund: record it once the whole payment is refunded.
  IF v_full AND coalesce(o.stripe_fee, 0) > 0 THEN
    INSERT INTO expenses (user_id, expense_date, amount, category, paid_personally, notes)
    VALUES (o.user_id, v_date, o.stripe_fee, 'Bank & Payment Fees', false,
            'Stripe fee kept on refunded website order ' || o.order_number);
  END IF;

  UPDATE web_orders SET refunded_amount = v_total - coalesce(shipping_refunded, 0), refunded_at = coalesce(p_refunded_at, now())
  WHERE id = o.id;
  RETURN jsonb_build_object('action', v_action, 'order_number', o.order_number, 'applied', v_delta, 'refunded_total', v_total);
END; $$;
REVOKE ALL ON FUNCTION public.web_apply_refund(text, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_apply_refund(text, numeric, timestamptz) TO service_role;

-- Payments the hourly sync looks at: paid website orders from the last 120 days.
CREATE FUNCTION public.web_refund_candidates()
RETURNS TABLE (order_number text, payment_intent text, accounted numeric, charged numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT order_number, stripe_payment_intent_id,
         refunded_amount + coalesce(shipping_refunded, 0), total + coalesce(shipping_refunded, 0)
  FROM web_orders
  WHERE status = 'paid' AND stripe_payment_intent_id IS NOT NULL AND paid_at > now() - interval '120 days'
    AND refunded_amount + coalesce(shipping_refunded, 0) < total + coalesce(shipping_refunded, 0)
  ORDER BY paid_at DESC;
$$;
REVOKE ALL ON FUNCTION public.web_refund_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_refund_candidates() TO service_role;

CREATE FUNCTION public.web_refund_sync_tick() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT net.http_post(url := 'https://dtfizpxtpsmqqzpactdh.supabase.co/functions/v1/sync-refunds',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 120000);
$$;
REVOKE ALL ON FUNCTION public.web_refund_sync_tick() FROM PUBLIC, anon, authenticated;
-- applied once the sync-refunds function is live:
-- Applied 6 Nov 2026 once sync-refunds was live (hourly at :41):
-- SELECT cron.schedule('sync-refunds', '41 * * * *', 'select public.web_refund_sync_tick()');

-- ---------- ticker lines for EndZone's Hide / Show buttons (owner only)
CREATE FUNCTION public.get_big_games_admin()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM website_settings WHERE owner_user_id = auth.uid()) THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  RETURN (
    WITH shop AS (
      SELECT s.sport, s.in_bin, ' ' || web_name_key(s.player_name) || ' ' AS k FROM get_shop_cards() s
    ), hits AS (
      SELECT g.id, g.league, g.player, g.line, g.opponent, g.game_at, g.score, g.hidden,
             count(*) FILTER (WHERE NOT shop.in_bin) AS case_cards,
             count(*) FILTER (WHERE shop.in_bin) AS bin_cards
      FROM web_big_games g
      JOIN shop ON shop.sport = g.sport AND shop.k LIKE '% ' || g.name_key || ' %'
      WHERE g.game_at > now() - interval '8 days'
      GROUP BY g.id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', id, 'league', league, 'player', player, 'line', line, 'opponent', opponent,
             'game_at', game_at, 'hidden', hidden, 'case_cards', case_cards, 'bin_cards', bin_cards)
           ORDER BY game_at DESC, score DESC), '[]'::jsonb)
    FROM hits);
END; $$;
REVOKE ALL ON FUNCTION public.get_big_games_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_big_games_admin() TO authenticated;
