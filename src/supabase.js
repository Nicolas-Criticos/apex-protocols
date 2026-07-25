import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lbmukpsieexkdsvhhtvj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxibXVrcHNpZWV4a2RzdmhodHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NTM5MTIsImV4cCI6MjEwMDUyOTkxMn0.Nx8kEiCAZdfPd_EwRXKUkDZdTBBlG34tsd9662jodk4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
