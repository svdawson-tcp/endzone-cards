-- Create mentor_access table to manage mentor-mentee relationships
CREATE TABLE mentor_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mentee_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  access_level TEXT DEFAULT 'read_only' CHECK (access_level IN ('read_only', 'full')),
  granted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(mentor_user_id, mentee_user_id)
);

-- Enable RLS
ALTER TABLE mentor_access ENABLE ROW LEVEL SECURITY;

-- Mentors can see their access grants
CREATE POLICY "Mentors can view their access"
  ON mentor_access FOR SELECT
  USING (auth.uid() = mentor_user_id);

-- Mentees can see who has access to their account
CREATE POLICY "Mentees can view their mentors"
  ON mentor_access FOR SELECT
  USING (auth.uid() = mentee_user_id);

-- Create mentor_activity_log table for transparency
CREATE TABLE mentor_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_user_id UUID REFERENCES auth.users(id) NOT NULL,
  mentee_user_id UUID REFERENCES auth.users(id) NOT NULL,
  action TEXT NOT NULL,
  page_path TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE mentor_activity_log ENABLE ROW LEVEL SECURITY;

-- Mentors can insert their own activity
CREATE POLICY "Mentors can log activity"
  ON mentor_activity_log FOR INSERT
  WITH CHECK (auth.uid() = mentor_user_id);

-- Mentees can view activity on their account
CREATE POLICY "Mentees can view access logs"
  ON mentor_activity_log FOR SELECT
  USING (auth.uid() = mentee_user_id);

-- Create mentor_sessions table for real-time notifications
CREATE TABLE mentor_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_user_id UUID REFERENCES auth.users(id) NOT NULL,
  mentee_user_id UUID REFERENCES auth.users(id) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_activity TIMESTAMPTZ DEFAULT now() NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL
);

-- Enable RLS
ALTER TABLE mentor_sessions ENABLE ROW LEVEL SECURITY;

-- Policies for mentor_sessions
CREATE POLICY "Mentors can manage their sessions"
  ON mentor_sessions FOR ALL
  USING (auth.uid() = mentor_user_id);

CREATE POLICY "Mentees can view active sessions"
  ON mentor_sessions FOR SELECT
  USING (auth.uid() = mentee_user_id AND is_active = true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE mentor_sessions;

-- Create helper function to check mentor access
CREATE OR REPLACE FUNCTION public.has_mentor_access(_mentee_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mentor_access
    WHERE mentor_user_id = auth.uid()
      AND mentee_user_id = _mentee_user_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Update RLS policies on transactions table
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions or as mentor"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id OR public.has_mentor_access(user_id));

-- Update RLS policies on lots table
DROP POLICY IF EXISTS "Users can view own lots" ON lots;
CREATE POLICY "Users can view own lots or as mentor"
  ON lots FOR SELECT
  USING (auth.uid() = user_id OR public.has_mentor_access(user_id));

-- Update RLS policies on show_cards table
DROP POLICY IF EXISTS "Users can view own show cards" ON show_cards;
CREATE POLICY "Users can view own show cards or as mentor"
  ON show_cards FOR SELECT
  USING (auth.uid() = user_id OR public.has_mentor_access(user_id));

-- Update RLS policies on shows table
DROP POLICY IF EXISTS "Users can view own shows" ON shows;
CREATE POLICY "Users can view own shows or as mentor"
  ON shows FOR SELECT
  USING (auth.uid() = user_id OR public.has_mentor_access(user_id));

-- Update RLS policies on expenses table
DROP POLICY IF EXISTS "Users can view own expenses" ON expenses;
CREATE POLICY "Users can view own expenses or as mentor"
  ON expenses FOR SELECT
  USING (auth.uid() = user_id OR public.has_mentor_access(user_id));

-- Update RLS policies on cash_transactions table
DROP POLICY IF EXISTS "Users can view own cash transactions" ON cash_transactions;
CREATE POLICY "Users can view own cash transactions or as mentor"
  ON cash_transactions FOR SELECT
  USING (auth.uid() = user_id OR public.has_mentor_access(user_id));

-- Update RLS policies on user_goals table
DROP POLICY IF EXISTS "Users can view own goals" ON user_goals;
CREATE POLICY "Users can view own goals or as mentor"
  ON user_goals FOR SELECT
  USING (auth.uid() = user_id OR public.has_mentor_access(user_id));

-- Grant Scott access to Colton's account
INSERT INTO mentor_access (mentor_user_id, mentee_user_id, access_level)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'svdawson@gmail.com'),
  (SELECT id FROM auth.users WHERE email = 'denvernuggets0697@gmail.com'),
  'read_only'
);