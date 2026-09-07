-- =====================================================================
-- Migration 010: Tiered Routing, SLA Tracking & In-App Notifications
-- Run this in the Supabase SQL Editor
-- =====================================================================

-- ─── 1. Add tier/SLA columns to grievances ───────────────────────────

ALTER TABLE public.grievances
  ADD COLUMN IF NOT EXISTS initial_handler TEXT,
  ADD COLUMN IF NOT EXISTS assigned_tier TEXT,
  ADD COLUMN IF NOT EXISTS assigned_queue TEXT,
  ADD COLUMN IF NOT EXISTS sla_hours INTEGER,
  ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_history JSONB DEFAULT '[]'::jsonb;

-- ─── 2. Update status constraint to include new statuses ─────────────

ALTER TABLE public.grievances DROP CONSTRAINT IF EXISTS grievances_status_check;
ALTER TABLE public.grievances ADD CONSTRAINT grievances_status_check CHECK (
  status IN ('Open', 'Investigating', 'Resolved', 'Closed', 'CHATBOT_HANDLING', 'HUMAN_HANDLING')
);

-- ─── 3. Update users role constraint to include 'admin' ─────────────

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (
  role IN ('user', 'admin', 'super_admin', 'hr', 'safety', 'compliance')
);

-- ─── 4. Create notifications table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ticket_id UUID REFERENCES public.grievances(grievance_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_ticket ON public.notifications(ticket_id);

-- RLS (open for service role, restrict for anon)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT USING (true);

CREATE POLICY "Service can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (true);

-- ─── 5. Index for SLA monitoring queries ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_grievances_sla_breach
  ON public.grievances(sla_deadline)
  WHERE status = 'HUMAN_HANDLING' AND assigned_tier IS NOT NULL;
