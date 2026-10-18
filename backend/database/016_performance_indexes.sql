-- 016_performance_indexes.sql
-- Indexes for the columns the app filters/sorts on most. Safe to re-run.
-- Run in Supabase -> SQL Editor. (On a big table, indexes build in seconds; no downtime.)

CREATE INDEX IF NOT EXISTS idx_grievances_status        ON public.grievances (status);
CREATE INDEX IF NOT EXISTS idx_grievances_department    ON public.grievances (department);
CREATE INDEX IF NOT EXISTS idx_grievances_assigned_tier ON public.grievances (assigned_tier);
CREATE INDEX IF NOT EXISTS idx_grievances_created_at    ON public.grievances (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grievances_user_id       ON public.grievances (user_id);
-- SLA monitor: "tickets being handled by humans whose deadline has passed"
CREATE INDEX IF NOT EXISTS idx_grievances_sla_status    ON public.grievances (status, sla_deadline);
