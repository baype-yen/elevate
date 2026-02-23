drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
for select to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.document_shares ds
    where ds.document_id = public.documents.id
      and (
        (
          ds.class_id is not null
          and (public.is_class_teacher(ds.class_id) or public.is_class_student(ds.class_id))
        )
        or (
          ds.assignment_id is not null
          and exists (
            select 1
            from public.assignments a
            where a.id = ds.assignment_id
              and (
                (a.class_id is not null and (public.is_class_teacher(a.class_id) or public.is_class_student(a.class_id)))
                or (
                  a.school_id is not null
                  and public.has_school_role(
                    a.school_id,
                    array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]
                  )
                )
              )
          )
        )
      )
  )
);

drop policy if exists document_shares_select on public.document_shares;
create policy document_shares_select on public.document_shares
for select to authenticated
using (
  shared_by = auth.uid()
  or (
    class_id is not null
    and (public.is_class_teacher(class_id) or public.is_class_student(class_id))
  )
  or (
    assignment_id is not null
    and exists (
      select 1
      from public.assignments a
      where a.id = assignment_id
        and (
          (a.class_id is not null and (public.is_class_teacher(a.class_id) or public.is_class_student(a.class_id)))
          or (
            a.school_id is not null
            and public.has_school_role(
              a.school_id,
              array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]
            )
          )
        )
    )
  )
);

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
        or exists (
          select 1
          from public.document_shares ds
          where ds.document_id = d.id
            and (
              (
                ds.class_id is not null
                and (public.is_class_teacher(ds.class_id) or public.is_class_student(ds.class_id))
              )
              or (
                ds.assignment_id is not null
                and exists (
                  select 1
                  from public.assignments a
                  where a.id = ds.assignment_id
                    and (
                      (a.class_id is not null and (public.is_class_teacher(a.class_id) or public.is_class_student(a.class_id)))
                      or (
                        a.school_id is not null
                        and public.has_school_role(
                          a.school_id,
                          array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]
                        )
                      )
                    )
                )
              )
            )
        )
      )
  )
);
