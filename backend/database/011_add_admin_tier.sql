-- 011_add_admin_tier.sql
-- Add admin_tier column to users table for Tier-Specific Admins (Option B)

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS admin_tier VARCHAR(10) DEFAULT NULL;

ALTER TABLE public.users 
  DROP CONSTRAINT IF EXISTS users_admin_tier_check;

ALTER TABLE public.users 
  ADD CONSTRAINT users_admin_tier_check 
  CHECK (admin_tier IN ('L1', 'L2', 'L3', 'HEAD') OR admin_tier IS NULL);

CREATE INDEX IF NOT EXISTS idx_users_dept_tier ON public.users(department, admin_tier);

-- Verify
COMMENT ON COLUMN public.users.admin_tier IS 'Operational grievance handling tier: L1, L2, L3, HEAD, or NULL for general department admins / super admins';
