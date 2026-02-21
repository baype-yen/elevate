insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "Documents read" on storage.objects;
create policy "Documents read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_path = storage.objects.name
      and (
        d.owner_id = auth.uid()
        or (d.school_id is not null and public.is_active_school_member(d.school_id))
      )
  )
);

drop policy if exists "Documents upload" on storage.objects;
create policy "Documents upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_path = storage.objects.name
      and d.owner_id = auth.uid()
  )
);

drop policy if exists "Documents update" on storage.objects;
create policy "Documents update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_path = storage.objects.name
      and (
        d.owner_id = auth.uid()
        or (d.school_id is not null and public.has_school_role(d.school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
      )
  )
)
with check (
  bucket_id = 'documents'
);

drop policy if exists "Documents delete" on storage.objects;
create policy "Documents delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.documents d
    where d.file_path = storage.objects.name
      and (
        d.owner_id = auth.uid()
        or (d.school_id is not null and public.has_school_role(d.school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
      )
  )
);
