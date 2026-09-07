-- =====================================================================
-- Migration 013: Add RAG Policy Recommendations to Grievances
-- Run this in the Supabase SQL Editor
-- =====================================================================

ALTER TABLE public.grievances
  ADD COLUMN IF NOT EXISTS rag_recommendation JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS policy_matched BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.grievances.rag_recommendation IS 'AI-generated grounded resolution recommendations and policy citations retrieved from Puravankara policy vectorstore';
COMMENT ON COLUMN public.grievances.policy_matched IS 'True if the grievance matches specific internal policy clauses in the vector store';

-- Index for quickly filtering tickets that have RAG recommendations
CREATE INDEX IF NOT EXISTS idx_grievances_policy_matched ON public.grievances(policy_matched);
