-- Run this in the Supabase SQL Editor for project lbmukpsieexkdsvhhtvj

-- User metrics table
CREATE TABLE IF NOT EXISTS public.user_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  weight_kg numeric,
  height_cm numeric,
  age integer,
  activity_level numeric,
  goal text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.user_metrics ENABLE ROW LEVEL SECURITY;

-- Policies: users can only access their own data
CREATE POLICY "Users can read own metrics" ON public.user_metrics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metrics" ON public.user_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metrics" ON public.user_metrics
  FOR UPDATE USING (auth.uid() = user_id);
