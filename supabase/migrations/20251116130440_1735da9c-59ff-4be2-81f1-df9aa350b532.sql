-- Add action items column to user_goals table
ALTER TABLE public.user_goals ADD COLUMN action_items JSONB DEFAULT '{}';