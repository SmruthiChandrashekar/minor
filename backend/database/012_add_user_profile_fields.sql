-- 012_add_user_profile_fields.sql
-- Add profile photo, tailored contact details according to user type:
-- Internal Employee, Contract Workforce, or External Stakeholder

ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS designation TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stakeholder_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS associated_project TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agency_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS employee_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT DEFAULT NULL;

COMMENT ON COLUMN public.users.avatar_url IS 'Public URL of user profile picture';
COMMENT ON COLUMN public.users.designation IS 'Job title / trade role (for Internal & Contract)';
COMMENT ON COLUMN public.users.location IS 'Base office / site / residential city';
COMMENT ON COLUMN public.users.stakeholder_type IS 'Category for External Stakeholder (e.g. Homebuyer, Vendor, Resident)';
COMMENT ON COLUMN public.users.associated_project IS 'Associated property or project name/unit';
COMMENT ON COLUMN public.users.agency_name IS 'Contracting agency name (for Contract Workforce)';
COMMENT ON COLUMN public.users.employee_id IS 'Official employee ID (for Internal staff)';
COMMENT ON COLUMN public.users.preferred_contact_method IS 'Preferred channel: Email, Phone, WhatsApp, SMS';
