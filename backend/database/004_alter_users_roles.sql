-- Expand role column to support new roles
ALTER TABLE public.users 
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users 
  ADD CONSTRAINT users_role_check CHECK (
    role IN ('user', 'admin', 'hr', 'safety', 'compliance', 'super_admin')
  );

-- Add is_active column for account deactivation
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Note: We will drop the password column after migrating all admins to Supabase Auth
-- ALTER TABLE public.users DROP COLUMN IF EXISTS password;
