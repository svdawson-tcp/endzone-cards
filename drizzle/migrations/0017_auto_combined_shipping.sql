-- =====================================================================
-- EndZone 0017 — automatic combined shipping (Colton, Nov 5 2026)
-- Larry Brasiel paid for CS-1022, then went back to the shop on his own (not through the
-- "ADD TO MY ORDER, SHIP FREE" link) and paid $6 shipping again on CS-1023.
-- Now, when a website order is paid, the webhook asks web_auto_combine_shipping():
--   * same buyer email, an earlier paid order that hasn't shipped and is still inside its free-shipping
--     window, same street + ZIP  -> this order joins that window: shipping becomes $0 here, the sale rows
--     in EndZone drop the shipping, and the webhook refunds the shipping in Stripe.
--   * same buyer and open window, but a different address -> nothing is refunded; the order gets a
--     "check this order" note so Colton decides.
-- Stack links are untouched (Colton runs those by hand). The rule for "window still open" is the same
-- one the link uses (web_ship_link_valid): 48 hours from the first order, or until Colton marks it shipped.
-- =====================================================================

ALTER TABLE public.web_orders
  ADD COLUMN shipping_refunded  numeric(10,2) CHECK (shipping_refunded IS NULL OR shipping_refunded > 0),
  ADD COLUMN shipping_refund_id text;
COMMENT ON COLUMN public.web_orders.shipping_refunded IS
  'Shipping paid at checkout and refunded because the order was combined with an earlier one (0017).';
COMMENT ON COLUMN public.web_orders.shipping_refund_id IS 'Stripe refund id for shipping_refunded, once made.';

-- Street + ZIP, letters and digits only, lower case. Same comparison the webhook and EndZone use.
CREATE FUNCTION public.web_addr_key(a jsonb) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT lower(regexp_replace(coalesce(a->>'line1', ''), '[^A-Za-z0-9]', '', 'g'))
      || '|' || left(regexp_replace(coalesce(a->>'postal_code', ''), '[^A-Za-z0-9]', '', 'g'), 5);
$$;

CREATE FUNCTION public.web_auto_combine_shipping(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  o          web_orders;
  e          web_orders;
  l          web_ship_links;
  v_ship     numeric(10,2);
  v_mismatch text;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'paid' THEN RETURN jsonb_build_object('action', 'none'); END IF;

  -- Already combined (a webhook retry): report it again so a refund that didn't go through is retried.
  IF o.shipping_refunded IS NOT NULL THEN
    RETURN jsonb_build_object('action', 'refund', 'amount', o.shipping_refunded, 'refund_id', o.shipping_refund_id,
      'order_number', (SELECT f.order_number FROM web_ship_links sl JOIN web_orders f ON f.id = sl.order_id
                       WHERE sl.id = o.ship_link_id));
  END IF;
  IF o.ship_link_id IS NOT NULL OR o.shipping <= 0 OR o.shipped_at IS NOT NULL
     OR nullif(btrim(o.buyer_email), '') IS NULL THEN
    RETURN jsonb_build_object('action', 'none');
  END IF;

  FOR e IN
    SELECT * FROM web_orders
    WHERE user_id = o.user_id AND id <> o.id AND status = 'paid' AND shipped_at IS NULL
      AND lower(btrim(buyer_email)) = lower(btrim(o.buyer_email))
      AND (paid_at, created_at) < (o.paid_at, o.created_at)   -- only ever the later order joins the earlier
    ORDER BY paid_at, created_at
  LOOP
    -- The window the earlier order belongs to: the one it came through, or its own (made here if its
    -- confirmation email hasn't gone out yet).
    IF e.ship_link_id IS NOT NULL THEN
      SELECT * INTO l FROM web_ship_links WHERE id = e.ship_link_id;
    ELSE
      INSERT INTO web_ship_links (user_id, kind, token, order_id, expires_at)
      VALUES (e.user_id, 'order', web_new_link_token(), e.id, coalesce(e.paid_at, now()) + interval '48 hours')
      ON CONFLICT (order_id) DO NOTHING;
      SELECT * INTO l FROM web_ship_links WHERE order_id = e.id;
    END IF;
    IF l.id IS NULL OR l.kind <> 'order' THEN CONTINUE; END IF;
    l := web_ship_link_valid(l.token);
    IF l.id IS NULL THEN CONTINUE; END IF;

    IF web_addr_key(e.shipping_address) <> web_addr_key(o.shipping_address) THEN
      v_mismatch := coalesce(v_mismatch, e.order_number);
      CONTINUE;
    END IF;

    -- Combine: take the shipping out of this order and its EndZone sale rows (cash follows via trigger).
    v_ship := o.shipping;
    UPDATE transactions t
    SET revenue = greatest(t.revenue - (t.gross_amount - oi.price), 0), gross_amount = oi.price
    FROM web_order_items oi
    WHERE oi.order_id = o.id AND oi.transaction_id = t.id AND t.gross_amount > oi.price;
    UPDATE web_orders SET shipping = 0, total = subtotal, ship_link_id = l.id, shipping_refunded = v_ship
    WHERE id = o.id;
    RETURN jsonb_build_object('action', 'refund', 'amount', v_ship, 'refund_id', NULL,
      'order_number', (SELECT order_number FROM web_orders WHERE id = l.order_id));
  END LOOP;

  IF v_mismatch IS NOT NULL THEN
    UPDATE web_orders
    SET problem_note = concat_ws('; ', problem_note,
      'Same buyer has open order ' || v_mismatch || ' going to a different address. Shipping was charged. '
      || 'If you ship them together, refund the shipping in Stripe')
    WHERE id = o.id;
    RETURN jsonb_build_object('action', 'different_address', 'order_number', v_mismatch);
  END IF;
  RETURN jsonb_build_object('action', 'none');
END; $$;
REVOKE ALL ON FUNCTION public.web_auto_combine_shipping(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_auto_combine_shipping(uuid) TO service_role;
