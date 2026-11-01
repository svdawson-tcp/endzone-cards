-- =====================================================================
-- EndZone 0011 — Colton can release a card that's on hold for an online buyer (Nov 1 2026).
-- The release-hold edge function closes the buyer's Stripe checkout first, then calls this.
-- For an accepted/countered offer the offer is withdrawn too, so its pay link can't re-hold the card.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.web_owner_release_hold(p_card_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c show_cards; o web_orders; f web_offers;
BEGIN
  SELECT * INTO c FROM show_cards WHERE id = p_card_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CARD_NOT_FOUND'; END IF;
  IF c.held_for IS NULL OR c.held_until IS NULL OR c.held_until < now() THEN
    UPDATE show_cards SET held_until = NULL, held_for = NULL WHERE id = c.id;  -- tidy a lapsed hold
    RETURN jsonb_build_object('released', true, 'was_held', false);
  END IF;
  SELECT * INTO o FROM web_orders WHERE id = c.held_for FOR UPDATE;
  IF FOUND AND o.status = 'paid' THEN RAISE EXCEPTION 'ORDER_PAID'; END IF;
  IF FOUND AND o.status = 'pending' THEN
    PERFORM web_release_order(o.id, 'canceled');
    IF o.offer_id IS NOT NULL THEN
      UPDATE web_offers SET status = 'withdrawn', pay_expires_at = now()
      WHERE id = o.offer_id AND status IN ('accepted','countered')
      RETURNING * INTO f;
    END IF;
  ELSE
    UPDATE show_cards SET held_until = NULL, held_for = NULL WHERE id = c.id;
  END IF;
  RETURN jsonb_build_object('released', true, 'was_held', true, 'order_number', o.order_number,
                            'offer_withdrawn', f.id IS NOT NULL, 'offer_id', f.id);
END; $$;

REVOKE ALL ON FUNCTION public.web_owner_release_hold(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_owner_release_hold(uuid, uuid) TO service_role;

-- The in-person sale block now points Colton at the button instead of at Scott.
CREATE OR REPLACE FUNCTION public.block_sale_of_held_card()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_until timestamptz;
BEGIN
  IF NEW.transaction_type = 'show_card_sale' AND NEW.show_card_id IS NOT NULL
     AND NEW.sales_channel IS DISTINCT FROM 'website' THEN
    SELECT held_until INTO v_until FROM show_cards WHERE id = NEW.show_card_id;
    IF v_until IS NOT NULL AND v_until > now() THEN
      RAISE EXCEPTION 'This card is on hold for an online buyer until %. Tap "Release hold" on the card first, then record the sale.',
        to_char(v_until AT TIME ZONE 'America/New_York', 'Mon DD HH12:MI AM');
    END IF;
  END IF;
  RETURN NEW;
END; $$;
