-- =====================================================================
-- EndZone 0006 — Card reader (read card details from the photos)
-- Design: EZ_Read mockups (canvas, approved by Scott 31 Oct 2026). Model: Claude Sonnet 5.5.
-- Must run as ONE transaction. Additive only: nothing already in production changes.
--
-- card_reads is the log of every photo read: who, when, which model, tokens used, and what came
-- back. It is used for two things only:
--   1. the daily cap (each user gets at most N reads per New York calendar day), and
--   2. cost tracking.
-- Only the read-card Edge Function writes to it, through claim_card_read() and the secret key.
-- Signed-in users can read their own rows; nobody can write to it from the app or the website.
-- =====================================================================

CREATE TABLE public.card_reads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'eval')),
  model         text,
  input_tokens  integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  ok            boolean,             -- NULL while the read is in progress
  error         text,
  result        jsonb
);

CREATE INDEX idx_card_reads_user_created ON public.card_reads (user_id, created_at DESC);

ALTER TABLE public.card_reads ENABLE ROW LEVEL SECURITY;

-- Users may look at their own read history (e.g. a future "reads used today" counter). No writes.
CREATE POLICY "Users can view their own card reads"
  ON public.card_reads FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.card_reads FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.card_reads FROM authenticated;
GRANT SELECT ON public.card_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.card_reads TO service_role;  -- the Edge Function records results

-- ---------------------------------------------------------------------
-- claim_card_read: start a read if the user is under today's cap.
-- Returns the new card_reads id, or NULL when the cap is reached.
-- A per-user lock makes two reads started at the same moment count correctly.
-- Only the Edge Function (service_role) may call it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_card_read(p_user uuid, p_daily_cap integer, p_source text DEFAULT 'app')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York';
  used integer;
  new_id uuid;
BEGIN
  IF p_user IS NULL OR p_daily_cap IS NULL OR p_daily_cap < 1 THEN
    RAISE EXCEPTION 'claim_card_read: bad arguments';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('card_reads:' || p_user::text, 0));

  SELECT count(*) INTO used
  FROM card_reads
  WHERE user_id = p_user AND created_at >= day_start AND source = p_source;

  IF used >= p_daily_cap THEN
    RETURN NULL;
  END IF;

  INSERT INTO card_reads (user_id, source) VALUES (p_user, p_source) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_card_read(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_card_read(uuid, integer, text) TO service_role;
