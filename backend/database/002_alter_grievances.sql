-- Run this script in your Supabase SQL Editor to add the new metadata columns

ALTER TABLE public.grievances 
ADD COLUMN IF NOT EXISTS submitter_name text null,
ADD COLUMN IF NOT EXISTS contact_phone text null,
ADD COLUMN IF NOT EXISTS contact_email text null,
ADD COLUMN IF NOT EXISTS location text null,
ADD COLUMN IF NOT EXISTS incident_date text null,
ADD COLUMN IF NOT EXISTS is_anonymous boolean null default false;
