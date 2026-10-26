-- 015_enable_rls.sql
-- Turn on Row-Level Security for public.users and public.grievances.
--
-- PREREQUISITES (do these first or the app will break):
--   1. backend/.env has SUPABASE_SERVICE_ROLE_KEY set, and the backend has been restarted.
--      The service-role key bypasses RLS; the anon key does not.
--   2. The frontend build includes the new Track page (reads /api/track/{id} from the backend).
--
-- Safe to re-run: policies are dropped and re-created.
-- Rollback (if something breaks):
--   ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.grievances DISABLE ROW LEVEL SECURITY;

-- ── Helper: is the logged-in user an admin? ────────────────────────────────
-- SECURITY DEFINER so it can read public.users without triggering that table's own policies.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
      AND COALESCE(is_active, true)
      AND role IN ('admin', 'super_admin', 'hr', 'safety', 'compliance')
  );
$$;

-- ── USERS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Signup: a person may create ONLY their own row, and only as a plain 'user'.
DROP POLICY IF EXISTS users_insert_own ON public.users;
CREATE POLICY users_insert_own ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND COALESCE(role, 'user') = 'user'
    AND admin_tier IS NULL
  );

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RLS cannot restrict individual columns, so this trigger stops a logged-in user
-- from editing their own privileged fields (role, tier, active flag, admin department).
-- The backend (service-role key, auth.uid() is NULL) is not affected.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_privileged_columns ON public.users;
CREATE TRIGGER trg_protect_user_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_privileged_columns();

-- ── GRIEVANCES ─────────────────────────────────────────────────────────────
ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;

-- A user sees their own tickets; any active admin sees all tickets
-- (per-department filtering is still done by the dashboard / backend).
DROP POLICY IF EXISTS grievances_select ON public.grievances;
CREATE POLICY grievances_select ON public.grievances
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user());

-- Direct insert (fallback path in the Lodge pages): only as yourself.
DROP POLICY IF EXISTS grievances_insert_own ON public.grievances;
CREATE POLICY grievances_insert_own ON public.grievances
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE / DELETE policies on purpose: those go through the backend only.
-- No policies for the 'anon' role: logged-out visitors can no longer read either table.
