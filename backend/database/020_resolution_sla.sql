-- =====================================================================
-- Migration 020: Resolution SLA (GRM framework §7, "Timelines for Resolution")
-- Run this in the Supabase SQL Editor after 019.
--
--   Acknowledgement ........ real-time            (acknowledged_at, set on filing)
--   Preliminary assessment . real-time            (AI triage on filing)
--   Resolution ............. within 30 days, depending on complexity (resolve_by)
--   Communication .......... as soon as resolved  (resolved_at + existing email)
--   Escalated cases ........ within 45 working days of acknowledgement (final_resolve_by)
--
-- The existing sla_hours / sla_deadline columns stay as the per-level PICKUP timer.
-- resolve_by and final_resolve_by never reset when a ticket moves between levels.
-- =====================================================================

-- ─── 1. Rules table: resolution time per complaint type ─────────────
-- The most specific active rule wins:
--   department+category+severity > department+category > department+severity
--   > department > category+severity > category > severity > global default.
-- NULL in department / category / severity means "any".

CREATE TABLE IF NOT EXISTS public.sla_policies (
  rule_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       TEXT NOT NULL,
  department                 TEXT,
  category                   TEXT,
  severity                   TEXT,
  resolution_days            INTEGER NOT NULL CHECK (resolution_days > 0),
  resolution_calendar        TEXT NOT NULL DEFAULT 'calendar'
                               CHECK (resolution_calendar IN ('calendar', 'working')),
  escalated_resolution_days  INTEGER NOT NULL DEFAULT 45 CHECK (escalated_resolution_days > 0),
  escalated_calendar         TEXT NOT NULL DEFAULT 'working'
                               CHECK (escalated_calendar IN ('calendar', 'working')),
  warn_at_pct                INTEGER[] NOT NULL DEFAULT '{50,75}',
  is_active                  BOOLEAN NOT NULL DEFAULT true,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default rules. "Within 30 days depending upon complexity": severity is the complexity signal,
-- and every rule stays inside the 30-day ceiling. Edit these rows to change the timelines;
-- the rule in force is snapshotted on each ticket, so edits only affect new complaints.
INSERT INTO public.sla_policies (name, severity, resolution_days, resolution_calendar)
SELECT * FROM (VALUES
  ('Default (30 days)',  NULL::text,  30, 'calendar'),
  ('Low (after chatbot handoff)', 'Low', 30, 'calendar'),
  ('Medium',             'Medium',    15, 'working'),
  ('High',               'High',       7, 'working'),
  ('Critical',           'Critical',   3, 'working')
) AS v(name, severity, resolution_days, resolution_calendar)
WHERE NOT EXISTS (SELECT 1 FROM public.sla_policies);

-- ─── 2. Holiday calendar for working-day deadlines ──────────────────
-- Working days are Monday–Saturday (Sunday off) minus the holidays below.
-- location: state code ('KA', 'MH', ...) or NULL for all locations. The SLA engine
-- uses SLA_HOLIDAY_LOCATION (default KA, the Bengaluru head office).

CREATE TABLE IF NOT EXISTS public.holidays (
  holiday_date DATE NOT NULL,
  name         TEXT NOT NULL,
  location     TEXT,
  PRIMARY KEY (holiday_date, name)
);

-- Karnataka 2025 list from "LIST OF HOLIDAYS FOR 2025" (national & festival holidays).
-- Add the 2026 and later lists here once HR publishes them.
INSERT INTO public.holidays (holiday_date, name, location) VALUES
  ('2025-01-14', 'Makara Sankranti / Pongal',        'KA'),
  ('2025-03-31', 'Id-Ul-Fitr (Ramzan)',              NULL),
  ('2025-05-01', 'May Day & Maharashtra Day',        NULL),
  ('2025-08-15', 'Independence Day',                 NULL),
  ('2025-08-27', 'Ganesha Chaturthi',                'KA'),
  ('2025-10-01', 'Maha Navami / Ayudapooja',         'KA'),
  ('2025-10-02', 'Gandhi Jayanti',                   NULL),
  ('2025-10-20', 'Naraka Chaturdasi (Deepavali)',    'KA'),
  ('2025-10-22', 'Balipadyami (Diwali)',             'KA'),
  ('2025-11-01', 'Kannada Rajyothsava',              'KA'),
  ('2025-12-25', 'Christmas Day',                    NULL)
ON CONFLICT DO NOTHING;

-- ─── 3. Resolution SLA columns on grievances ────────────────────────

ALTER TABLE public.grievances
  ADD COLUMN IF NOT EXISTS sla_rule_id            UUID,
  ADD COLUMN IF NOT EXISTS sla_rule_snapshot      JSONB,
  ADD COLUMN IF NOT EXISTS acknowledged_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolve_by             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS final_resolve_by       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_breached    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_breached         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolution_sla_met     BOOLEAN,
  ADD COLUMN IF NOT EXISTS sla_alerts_sent        JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.grievances.acknowledged_at   IS 'When the complainant was acknowledged (real-time, on filing or chatbot handoff)';
COMMENT ON COLUMN public.grievances.first_response_at IS 'First status change by a staff member';
COMMENT ON COLUMN public.grievances.resolve_by        IS 'Resolution deadline from the matching sla_policies rule (within 30 days)';
COMMENT ON COLUMN public.grievances.final_resolve_by  IS 'Ceiling for escalated cases: 45 working days from acknowledged_at';
COMMENT ON COLUMN public.grievances.resolved_at       IS 'When the ticket reached Resolved / Rejected / Closed (cleared on reopen)';
COMMENT ON COLUMN public.grievances.resolution_breached IS 'resolve_by passed while open; the case was escalated to HEAD';
COMMENT ON COLUMN public.grievances.final_breached    IS 'final_resolve_by passed while open';
COMMENT ON COLUMN public.grievances.resolution_sla_met IS 'Set on resolution: true if resolved_at <= resolve_by';
COMMENT ON COLUMN public.grievances.sla_alerts_sent   IS 'Alert keys already sent (e.g. resolve_50, resolve_breach) so each alert fires once';

CREATE INDEX IF NOT EXISTS idx_grievances_resolve_by
  ON public.grievances(resolve_by)
  WHERE resolved_at IS NULL AND resolve_by IS NOT NULL;

-- ─── 4. Lock the new tables down (backend uses the service-role key) ─

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sla_policies_read ON public.sla_policies;
CREATE POLICY sla_policies_read ON public.sla_policies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS holidays_read ON public.holidays;
CREATE POLICY holidays_read ON public.holidays
  FOR SELECT TO authenticated USING (true);
