create table if not exists public.personalized_exercises (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  source_submission_id uuid references public.submissions(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  instructions text not null,
  exercise_type public.assignment_type not null default 'exercise',
  cefr_level public.cefr_level,
  is_completed boolean not null default false,
  completed_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personalized_exercises_completed_check check (
    (not is_completed and completed_at is null)
    or (is_completed and completed_at is not null)
  )
);

create index if not exists idx_personalized_exercises_student_status
on public.personalized_exercises(student_id, is_completed, created_at desc);

create index if not exists idx_personalized_exercises_submission
on public.personalized_exercises(source_submission_id);

drop trigger if exists trg_personalized_exercises_updated_at on public.personalized_exercises;
create trigger trg_personalized_exercises_updated_at
before update on public.personalized_exercises
for each row execute function public.set_updated_at();

alter table public.personalized_exercises enable row level security;

drop policy if exists personalized_exercises_select on public.personalized_exercises;
create policy personalized_exercises_select on public.personalized_exercises
for select to authenticated
using (
  student_id = auth.uid()
  or (
    school_id is not null
    and public.can_teach_student(school_id, student_id)
  )
  or (
    school_id is not null
    and public.has_school_role(
      school_id,
      array['owner'::public.membership_role, 'admin'::public.membership_role]
    )
  )
);

drop policy if exists personalized_exercises_teacher_manage on public.personalized_exercises;
create policy personalized_exercises_teacher_manage on public.personalized_exercises
for all to authenticated
using (
  school_id is not null
  and (
    public.can_teach_student(school_id, student_id)
    or public.has_school_role(
      school_id,
      array['owner'::public.membership_role, 'admin'::public.membership_role]
    )
  )
)
with check (
  school_id is not null
  and created_by = auth.uid()
  and (
    public.can_teach_student(school_id, student_id)
    or public.has_school_role(
      school_id,
      array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]
    )
  )
  and (
    class_id is null
    or public.is_class_teacher(class_id)
    or public.has_school_role(
      school_id,
      array['owner'::public.membership_role, 'admin'::public.membership_role]
    )
  )
);

drop policy if exists personalized_exercises_student_update on public.personalized_exercises;
create policy personalized_exercises_student_update on public.personalized_exercises
for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

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
                (a.class_id is not null and public.is_class_teacher(a.class_id))
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
          (a.class_id is not null and public.is_class_teacher(a.class_id))
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

drop policy if exists document_shares_manage on public.document_shares;
create policy document_shares_manage on public.document_shares
for all to authenticated
using (
  shared_by = auth.uid()
  or public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
)
with check (
  shared_by = auth.uid()
  and (
    (
      class_id is not null
      and assignment_id is null
      and exists (
        select 1
        from public.classes c
        where c.id = class_id
          and c.school_id = school_id
      )
      and public.is_class_teacher(class_id)
    )
    or (
      assignment_id is not null
      and class_id is null
      and exists (
        select 1
        from public.assignments a
        where a.id = assignment_id
          and a.school_id = school_id
          and (
            (a.class_id is not null and public.is_class_teacher(a.class_id))
            or public.has_school_role(
              a.school_id,
              array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]
            )
            or (
              a.class_id is not null
              and exists (
                select 1
                from public.class_enrollments ce
                where ce.class_id = a.class_id
                  and ce.student_id = auth.uid()
                  and ce.status = 'active'
              )
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
                      (a.class_id is not null and public.is_class_teacher(a.class_id))
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
