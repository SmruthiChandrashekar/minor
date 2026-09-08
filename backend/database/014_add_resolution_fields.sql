-- 014_add_resolution_fields.sql
-- Add resolution_reason, report_url, and Rejected status to grievances

ALTER TABLE public.grievances
  ADD COLUMN IF NOT EXISTS resolution_reason TEXT,
  ADD COLUMN IF NOT EXISTS report_url TEXT;

-- Add Rejected to valid statuses
ALTER TABLE public.grievances DROP CONSTRAINT IF EXISTS grievances_status_check;
ALTER TABLE public.grievances ADD CONSTRAINT grievances_status_check CHECK (
  status IN (
    'Open',
    'Investigating',
    'Resolved',
    'Rejected',
    'Closed',
    'CHATBOT_HANDLING',
    'HUMAN_HANDLING'
  )
);

COMMENT ON COLUMN public.grievances.resolution_reason IS 'Admin-provided reason when resolving or rejecting a grievance';
COMMENT ON COLUMN public.grievances.report_url IS 'URL of the auto-generated employee PDF report in Supabase Storage';

-- Ensure grievance-reports storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('grievance-reports', 'grievance-reports', true)
ON CONFLICT (id) DO NOTHING;

