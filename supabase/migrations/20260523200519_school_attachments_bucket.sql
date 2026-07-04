
-- Create private attachments bucket (not public; files served via signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  20971520,  -- 20 MB per file
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
on conflict (id) do nothing;

-- Storage RLS policies: workspace members only
-- SELECT (download)
create policy "workspace members can read attachments"
  on storage.objects for select
  using (
    bucket_id = 'attachments'
    and is_workspace_member()
  );

-- INSERT (upload)
create policy "workspace members can upload attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and is_workspace_member()
  );

-- DELETE
create policy "workspace members can delete attachments"
  on storage.objects for delete
  using (
    bucket_id = 'attachments'
    and is_workspace_member()
  );
;
