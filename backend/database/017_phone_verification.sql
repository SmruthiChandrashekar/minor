-- 017: phone verification (OTP at registration)
-- Run in the Supabase SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

-- One verified account per phone number.
CREATE UNIQUE INDEX IF NOT EXISTS users_verified_phone_unique
  ON public.users (phone) WHERE phone_verified;

-- A logged-in user must not be able to mark their own phone as verified, and changing
-- a verified phone number drops the verified status. The backend (service role) sets
-- phone, phone_verified and phone_verified_at together after a correct code.
CREATE OR REPLACE FUNCTION public.protect_user_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.admin_tier IS DISTINCT FROM OLD.admin_tier
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR (OLD.role <> 'user' AND NEW.department IS DISTINCT FROM OLD.department) THEN
      RAISE EXCEPTION 'You are not allowed to change role, tier, status or admin department';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
       OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
      RAISE EXCEPTION 'Phone verification can only be set by the server';
    END IF;
  END IF;

  -- phone edited without going through verification -> no longer verified
  IF NEW.phone IS DISTINCT FROM OLD.phone
     AND NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at THEN
    NEW.phone_verified := false;
    NEW.phone_verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
