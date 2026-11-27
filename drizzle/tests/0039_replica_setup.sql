-- Minimal scratch replica for 0039: Supabase roles and auth.uid(), plus transactions and mentor_access with the
-- production RLS policies and has_mentor_access (copied from production 27 Nov 2026). Run on an empty database.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- Supabase default privileges: new tables and functions in public are granted to all three roles
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.mentor_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mentor_user_id uuid NOT NULL, mentee_user_id uuid NOT NULL,
  access_level text, is_active boolean DEFAULT true, expires_at timestamptz);
ALTER TABLE public.mentor_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mentees can view their mentors" ON public.mentor_access FOR SELECT USING (auth.uid() = mentee_user_id);
CREATE POLICY "Mentors can view their access" ON public.mentor_access FOR SELECT USING (auth.uid() = mentor_user_id);

CREATE FUNCTION public.has_mentor_access(_mentee_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.mentor_access WHERE mentor_user_id = auth.uid() AND mentee_user_id = _mentee_user_id
    AND is_active = true AND (expires_at IS NULL OR expires_at > now())) $$;

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, transaction_type text NOT NULL,
  revenue numeric, transaction_date timestamptz, deleted boolean DEFAULT false, sales_channel text);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions or as mentor" ON public.transactions FOR SELECT
  USING ((auth.uid() = user_id) OR has_mentor_access(user_id));
