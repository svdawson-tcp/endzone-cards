-- =====================================================================
-- EndZone 0015 — combined shipping links (Colton, Nov 3 2026)
-- * 'order' links: every paid website order gets a private "add to your order" link in the buyer's
--   confirmation email. Orders placed through it ship free for 48 hours after payment, or until Colton
--   marks the first order shipped, whichever comes first.
-- * 'stack' links: Colton makes one in EndZone for a regular with an open stack. Website orders through it
--   ship free until he closes the stack (he charges shipping when the stack is complete).
-- The link is the proof of who the buyer is: 32 random bytes, only ever sent to that buyer.
-- =====================================================================

CREATE TABLE public.web_ship_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('order', 'stack')),
  token          text NOT NULL UNIQUE,
  order_id       uuid UNIQUE REFERENCES public.web_orders(id) ON DELETE CASCADE,
  customer_name  text CHECK (customer_name IS NULL OR char_length(customer_name) BETWEEN 1 AND 80),
  customer_email text CHECK (customer_email IS NULL OR char_length(customer_email) <= 200),
  note           text CHECK (note IS NULL OR char_length(note) <= 300),
  expires_at     timestamptz,
  closed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'order' AND order_id IS NOT NULL AND expires_at IS NOT NULL)
      OR (kind = 'stack' AND order_id IS NULL AND customer_name IS NOT NULL))
);
ALTER TABLE public.web_ship_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or mentor can view ship links" ON public.web_ship_links
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_mentor_access(user_id));
REVOKE ALL ON public.web_ship_links FROM anon, authenticated;
GRANT SELECT ON public.web_ship_links TO authenticated;

ALTER TABLE public.web_orders ADD COLUMN ship_link_id uuid REFERENCES public.web_ship_links(id) ON DELETE SET NULL;
CREATE INDEX idx_web_orders_ship_link ON public.web_orders (ship_link_id) WHERE ship_link_id IS NOT NULL;

CREATE FUNCTION public.web_new_link_token() RETURNS text LANGUAGE sql VOLATILE SET search_path TO 'public' AS $$
  SELECT replace(replace(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+', '-'), '/', '_');
$$;
REVOKE ALL ON FUNCTION public.web_new_link_token() FROM PUBLIC, anon, authenticated;

-- ---------- the one rule for "does this link still give free shipping?"
CREATE FUNCTION public.web_ship_link_valid(p_token text)
RETURNS public.web_ship_links
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT l.* FROM web_ship_links l
  LEFT JOIN web_orders o ON o.id = l.order_id
  WHERE l.token = p_token AND l.closed_at IS NULL
    AND (l.kind = 'stack'
         OR (l.expires_at > now() AND o.status = 'paid' AND o.shipped_at IS NULL));
$$;
REVOKE ALL ON FUNCTION public.web_ship_link_valid(text) FROM PUBLIC, anon, authenticated;

-- ---------- website: what the free-shipping banner and cart show (no buyer details beyond a first name)
CREATE FUNCTION public.web_ship_link_info(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l web_ship_links; v_num text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{30,60}$' THEN RETURN jsonb_build_object('valid', false); END IF;
  l := web_ship_link_valid(p_token);
  IF l.id IS NULL THEN RETURN jsonb_build_object('valid', false); END IF;
  SELECT order_number INTO v_num FROM web_orders WHERE id = l.order_id;
  RETURN jsonb_build_object('valid', true, 'kind', l.kind, 'order_number', v_num,
    'first_name', nullif(split_part(btrim(coalesce(l.customer_name, '')), ' ', 1), ''),
    'expires_at', l.expires_at);
END; $$;
REVOKE ALL ON FUNCTION public.web_ship_link_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.web_ship_link_info(text) TO anon, authenticated, service_role;

-- ---------- checkout: a pending cart order placed through a valid link ships free
CREATE FUNCTION public.web_apply_ship_link(p_order_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o web_orders; l web_ship_links; v_num text;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'pending' OR o.source <> 'cart' THEN RAISE EXCEPTION 'ORDER_NOT_PENDING'; END IF;
  l := web_ship_link_valid(p_token);
  IF l.id IS NULL OR l.user_id <> o.user_id THEN RETURN jsonb_build_object('applied', false); END IF;
  UPDATE web_orders SET shipping = 0, total = subtotal, ship_link_id = l.id WHERE id = o.id;
  SELECT order_number INTO v_num FROM web_orders WHERE id = l.order_id;
  RETURN jsonb_build_object('applied', true, 'kind', l.kind, 'order_number', v_num);
END; $$;
REVOKE ALL ON FUNCTION public.web_apply_ship_link(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_apply_ship_link(uuid, text) TO service_role;

-- ---------- confirmation email: the link to offer this buyer (null = none, e.g. the order already shipped)
-- An order placed through a link reuses that link (the 48 hours run from the first order).
CREATE FUNCTION public.web_order_ship_link(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o web_orders; l web_ship_links;
BEGIN
  SELECT * INTO o FROM web_orders WHERE id = p_order_id;
  IF NOT FOUND OR o.status <> 'paid' OR o.shipped_at IS NOT NULL THEN RETURN NULL; END IF;
  IF o.ship_link_id IS NOT NULL THEN
    SELECT * INTO l FROM web_ship_links WHERE id = o.ship_link_id;
  ELSE
    INSERT INTO web_ship_links (user_id, kind, token, order_id, expires_at)
    VALUES (o.user_id, 'order', web_new_link_token(), o.id, coalesce(o.paid_at, now()) + interval '48 hours')
    ON CONFLICT (order_id) DO NOTHING;
    SELECT * INTO l FROM web_ship_links WHERE order_id = o.id;
  END IF;
  l := web_ship_link_valid(l.token);
  IF l.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('token', l.token, 'kind', l.kind, 'expires_at', l.expires_at,
    'order_number', (SELECT order_number FROM web_orders WHERE id = l.order_id),
    'customer_name', l.customer_name);
END; $$;
REVOKE ALL ON FUNCTION public.web_order_ship_link(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.web_order_ship_link(uuid) TO service_role;

-- ---------- EndZone: Colton opens and closes stack links
CREATE FUNCTION public.web_create_stack_link(p_name text, p_email text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS public.web_ship_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l web_ship_links;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM website_settings WHERE owner_user_id = auth.uid()) THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  IF nullif(btrim(p_name), '') IS NULL THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  INSERT INTO web_ship_links (user_id, kind, token, customer_name, customer_email, note)
  VALUES (auth.uid(), 'stack', web_new_link_token(), btrim(p_name), nullif(btrim(p_email), ''), nullif(btrim(p_note), ''))
  RETURNING * INTO l;
  RETURN l;
END; $$;
REVOKE ALL ON FUNCTION public.web_create_stack_link(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_create_stack_link(text, text, text) TO authenticated;

CREATE FUNCTION public.web_close_stack_link(p_link_id uuid, p_reopen boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE web_ship_links SET closed_at = CASE WHEN p_reopen THEN NULL ELSE now() END
  WHERE id = p_link_id AND user_id = auth.uid() AND kind = 'stack';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.web_close_stack_link(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.web_close_stack_link(uuid, boolean) TO authenticated;
