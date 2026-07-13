import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend/.env");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
