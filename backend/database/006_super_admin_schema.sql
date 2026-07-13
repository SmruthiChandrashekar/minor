-- 1. Fix the users role constraint to allow super_admin
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE public.users SET role = 'super_admin' WHERE role = 'admin';
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'super_admin', 'hr', 'safety'));

-- 2. Add is_active column for user deactivation
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 3. Create the audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_logs (
  log_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  actor_email TEXT,
  target_email TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster retrieval
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
