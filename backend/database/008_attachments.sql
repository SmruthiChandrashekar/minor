-- 1. Add attachments column to grievances table
ALTER TABLE public.grievances
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Note: In Supabase, creating a storage bucket via SQL involves inserting into storage.buckets.
-- 2. Create the attachments bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'attachments', 
    'attachments', 
    true, 
    10485760, -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up RLS for storage.objects (if not already handled via dashboard)
-- Allow anyone to upload (since users might not be fully authenticated in some lodge forms)
CREATE POLICY "Public Upload to Attachments"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'attachments' );

-- Allow anyone to read attachments
CREATE POLICY "Public Read from Attachments"
ON storage.objects FOR SELECT
USING ( bucket_id = 'attachments' );
