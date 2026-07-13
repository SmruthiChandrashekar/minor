CREATE TABLE IF NOT EXISTS public.audit_logs (
  log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id UUID,
  actor_name TEXT,
  actor_role TEXT,
  target_grievance_id UUID REFERENCES grievances(grievance_id) ON DELETE SET NULL,
  old_value TEXT,
  new_value TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_target ON public.audit_logs(target_grievance_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
