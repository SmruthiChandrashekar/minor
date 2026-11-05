-- 019_fix_audit_logs.sql
-- The live audit_logs table came from 006_super_admin_schema.sql
-- (actor_email, target_email, details), but backend/utils/audit.py writes the
-- columns from 005_audit_logs.sql, so every insert was rejected and nothing
-- was ever logged. Add the missing columns; nothing is dropped.
--
-- Safe to re-run.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS actor_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS target_user_id UUID,
  ADD COLUMN IF NOT EXISTS old_value TEXT,
  ADD COLUMN IF NOT EXISTS new_value TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- Make the API (PostgREST) see the new columns right away
NOTIFY pgrst, 'reload schema';
