-- Run this script in your Supabase SQL Editor to create the public.grievances table

create table public.grievances (
  grievance_id uuid not null default gen_random_uuid (),
  user_id uuid null,
  category text not null,
  description text not null,
  severity text null,
  department text null,
  status text null default 'Open'::text,
  assigned_to uuid null,
  created_at timestamp without time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp without time zone null default CURRENT_TIMESTAMP,
  constraint grievances_pkey primary key (grievance_id),
  constraint grievances_user_id_fkey foreign KEY (user_id) references users (user_id) on delete CASCADE,
  constraint grievances_severity_check check (
    (
      severity = any (array['Low'::text, 'Medium'::text, 'High'::text, 'Critical'::text])
    )
  ),
  constraint grievances_status_check check (
    (
      status = any (
        array[
          'Open'::text,
          'Investigating'::text,
          'Resolved'::text,
          'Closed'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

-- Note: I added 'Critical' to severity check since backend model classifies severities into: Low, Medium, High, Critical.
