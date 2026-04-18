import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://qcnxzravgrjdpwfqamzn.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbnh6cmF2Z3JqZHB3ZnFhbXpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjMzMzQsImV4cCI6MjA4OTkzOTMzNH0.Sam3JHUp17-_lAdjQOA9jwFmTHSbuOFNohGIOaVkmVw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
