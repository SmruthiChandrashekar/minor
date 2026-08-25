-- Supabase migration: Create grievance_states table for Phase 2
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS grievance_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    intent TEXT,
    category TEXT,
    severity TEXT,
    collected_information JSONB DEFAULT '{}',
    missing_information JSONB DEFAULT '[]',
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(session_id)
);

-- Enable RLS (Row Level Security) — open for now, tighten later
ALTER TABLE grievance_states ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (matches existing pattern)
CREATE POLICY "Allow all for service role" ON grievance_states
    FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_grievance_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_grievance_states_updated_at
    BEFORE UPDATE ON grievance_states
    FOR EACH ROW
    EXECUTE FUNCTION update_grievance_state_timestamp();
