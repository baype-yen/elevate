create extension if not exists pgcrypto;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('student', 'teacher', 'self_learner');
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_role') then
    create type public.membership_role as enum ('owner', 'admin', 'teacher', 'student');
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_status') then
    create type public.membership_status as enum ('invited', 'active', 'suspended', 'removed');
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cefr_level') then
    create type public.cefr_level as enum ('a1', 'a2', 'b1', 'b2', 'c1', 'c2');
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'enrollment_status') then
    create type public.enrollment_status as enum ('active', 'completed', 'dropped');
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'assignment_type') then
    create type public.assignment_type as enum (
      'quiz', 'grammar', 'reading', 'writing', 'listening', 'speaking', 'vocabulary', 'exercise', 'project', 'mixed'
    );
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'submission_status') then
    create type public.submission_status as enum ('draft', 'submitted', 'graded');
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'practice_status') then
    create type public.practice_status as enum ('missed', 'partial', 'full');
  end if;
end $$;
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type public.event_type as enum (
      'submission', 'completion', 'start', 'alert', 'badge', 'share', 'milestone', 'assignment_created', 'grade_posted', 'document_uploaded'
    );
  end if;
end $$;
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  default_role public.app_role not null default 'student',
  cefr_level public.cefr_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.membership_role not null default 'student',
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  class_code text,
  cefr_level public.cefr_level,
  academic_year text,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status public.enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id),
  constraint class_enrollments_left_after_enrolled check (left_at is null or left_at >= enrolled_at)
);
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint skills_key_format check (key ~ '^[a-z0-9_]+$')
);
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  type public.assignment_type not null,
  cefr_level public.cefr_level,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  description text,
  type public.assignment_type not null,
  cefr_level public.cefr_level,
  due_at timestamptz,
  max_score numeric(8,2) not null default 100 check (max_score > 0),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  status public.submission_status not null default 'draft',
  submitted_at timestamptz,
  graded_at timestamptz,
  graded_by uuid references public.profiles(id) on delete set null,
  score numeric(8,2),
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id),
  constraint submissions_score_nonnegative check (score is null or score >= 0),
  constraint submissions_status_fields check (
    (status = 'draft' and submitted_at is null and graded_at is null and graded_by is null and score is null)
    or (status = 'submitted' and submitted_at is not null and graded_at is null and graded_by is null)
    or (status = 'graded' and submitted_at is not null and graded_at is not null and graded_by is not null and score is not null)
  )
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  file_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.document_shares (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  shared_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint document_shares_target_check check (num_nonnulls(class_id, assignment_id) = 1)
);
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  icon text,
  created_at timestamptz not null default now()
);
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_by uuid references public.profiles(id) on delete set null,
  note text,
  awarded_at timestamptz not null default now()
);
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  event_type public.event_type not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.student_skill_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  trend integer not null default 0,
  as_of_date date not null default current_date,
  created_at timestamptz not null default now()
);
create table if not exists public.score_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  month_date date not null,
  overall_score numeric(5,2) not null check (overall_score >= 0 and overall_score <= 100),
  created_at timestamptz not null default now(),
  constraint score_history_month_first_day check (month_date = date_trunc('month', month_date)::date)
);
create table if not exists public.practice_daily (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  practice_date date not null,
  completed_count integer not null default 0 check (completed_count >= 0),
  target_count integer not null default 3 check (target_count > 0),
  status public.practice_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint practice_daily_count_within_target check (completed_count <= target_count)
);
create table if not exists public.teacher_feedback (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete cascade,
  feedback text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.user_xp_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null check (points <> 0),
  reason text not null,
  source_type public.event_type,
  source_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_school_memberships_user on public.school_memberships(user_id, status);
create index if not exists idx_school_memberships_school on public.school_memberships(school_id, role, status);
create index if not exists idx_classes_school_teacher on public.classes(school_id, teacher_id);
create index if not exists idx_class_enrollments_class on public.class_enrollments(class_id, status);
create index if not exists idx_class_enrollments_student on public.class_enrollments(student_id, status);
create index if not exists idx_lessons_school_created on public.lessons(school_id, created_at desc);
create index if not exists idx_assignments_class_due on public.assignments(class_id, due_at);
create index if not exists idx_submissions_assignment_status on public.submissions(assignment_id, status);
create index if not exists idx_submissions_student_status on public.submissions(student_id, status, submitted_at desc);
create index if not exists idx_documents_school_created on public.documents(school_id, created_at desc);
create index if not exists idx_activity_events_school_created on public.activity_events(school_id, created_at desc);
create index if not exists idx_activity_events_class_created on public.activity_events(class_id, created_at desc);
create index if not exists idx_student_skill_scores_user_date on public.student_skill_scores(user_id, as_of_date desc);
create index if not exists idx_score_history_user_month on public.score_history(user_id, month_date desc);
create index if not exists idx_practice_daily_user_date on public.practice_daily(user_id, practice_date desc);
create index if not exists idx_teacher_feedback_student_created on public.teacher_feedback(student_id, created_at desc);
create index if not exists idx_user_badges_user_awarded on public.user_badges(user_id, awarded_at desc);
create index if not exists idx_user_xp_events_user_created on public.user_xp_events(user_id, created_at desc);
create unique index if not exists uq_badges_scope_code
  on public.badges (coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
create unique index if not exists uq_student_skill_scores_scope
  on public.student_skill_scores (user_id, skill_id, as_of_date, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists uq_score_history_scope
  on public.score_history (user_id, month_date, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists uq_practice_daily_scope
  on public.practice_daily (user_id, practice_date, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists uq_document_shares_class
  on public.document_shares(document_id, class_id)
  where assignment_id is null and class_id is not null;
create unique index if not exists uq_document_shares_assignment
  on public.document_shares(document_id, assignment_id)
  where class_id is null and assignment_id is not null;
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists trg_schools_updated_at on public.schools;
create trigger trg_schools_updated_at before update on public.schools
for each row execute function public.set_updated_at();
drop trigger if exists trg_school_memberships_updated_at on public.school_memberships;
create trigger trg_school_memberships_updated_at before update on public.school_memberships
for each row execute function public.set_updated_at();
drop trigger if exists trg_classes_updated_at on public.classes;
create trigger trg_classes_updated_at before update on public.classes
for each row execute function public.set_updated_at();
drop trigger if exists trg_class_enrollments_updated_at on public.class_enrollments;
create trigger trg_class_enrollments_updated_at before update on public.class_enrollments
for each row execute function public.set_updated_at();
drop trigger if exists trg_lessons_updated_at on public.lessons;
create trigger trg_lessons_updated_at before update on public.lessons
for each row execute function public.set_updated_at();
drop trigger if exists trg_assignments_updated_at on public.assignments;
create trigger trg_assignments_updated_at before update on public.assignments
for each row execute function public.set_updated_at();
drop trigger if exists trg_submissions_updated_at on public.submissions;
create trigger trg_submissions_updated_at before update on public.submissions
for each row execute function public.set_updated_at();
drop trigger if exists trg_documents_updated_at on public.documents;
create trigger trg_documents_updated_at before update on public.documents
for each row execute function public.set_updated_at();
drop trigger if exists trg_practice_daily_updated_at on public.practice_daily;
create trigger trg_practice_daily_updated_at before update on public.practice_daily
for each row execute function public.set_updated_at();
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
begin
  v_role := case coalesce(new.raw_user_meta_data ->> 'role', '')
    when 'teacher' then 'teacher'::public.app_role
    when 'self_learner' then 'self_learner'::public.app_role
    else 'student'::public.app_role
  end;

  insert into public.profiles (id, full_name, avatar_url, default_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), ''),
    new.raw_user_meta_data ->> 'avatar_url',
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
create or replace function public.add_school_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.school_memberships (school_id, user_id, role, status, invited_at, joined_at)
  values (new.id, new.owner_id, 'owner', 'active', now(), now())
  on conflict (school_id, user_id) do update
    set role = excluded.role,
        status = excluded.status,
        joined_at = coalesce(public.school_memberships.joined_at, excluded.joined_at),
        updated_at = now();

  return new;
end;
$$;
drop trigger if exists on_school_created_add_owner on public.schools;
create trigger on_school_created_add_owner
after insert on public.schools
for each row execute function public.add_school_owner_membership();
create or replace function public.is_active_school_member(p_school_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = p_user_id
      and sm.status = 'active'
  );
$$;
create or replace function public.has_school_role(
  p_school_id uuid,
  p_roles public.membership_role[],
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = p_user_id
      and sm.status = 'active'
      and sm.role = any(p_roles)
  );
$$;
create or replace function public.is_class_teacher(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    left join public.school_memberships sm
      on sm.school_id = c.school_id
     and sm.user_id = p_user_id
     and sm.status = 'active'
    where c.id = p_class_id
      and (c.teacher_id = p_user_id or sm.role in ('owner', 'admin'))
  );
$$;
create or replace function public.is_class_student(p_class_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_enrollments ce
    where ce.class_id = p_class_id
      and ce.student_id = p_user_id
      and ce.status = 'active'
  );
$$;
create or replace function public.shares_school_with_user(p_target_user_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.school_memberships t
    join public.school_memberships me
      on me.school_id = t.school_id
    where t.user_id = p_target_user_id
      and me.user_id = p_user_id
      and t.status = 'active'
      and me.status = 'active'
  );
$$;
create or replace function public.can_teach_student(
  p_school_id uuid,
  p_student_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_school_id is not null and exists (
    select 1
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where c.school_id = p_school_id
      and ce.student_id = p_student_id
      and ce.status = 'active'
      and public.is_class_teacher(c.id, p_user_id)
  );
$$;
alter table public.profiles enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.skills enable row level security;
alter table public.lessons enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.activity_events enable row level security;
alter table public.student_skill_scores enable row level security;
alter table public.score_history enable row level security;
alter table public.practice_daily enable row level security;
alter table public.teacher_feedback enable row level security;
alter table public.user_xp_events enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.shares_school_with_user(id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert to authenticated
with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());
drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools
for select to authenticated
using (public.is_active_school_member(id));
drop policy if exists schools_insert on public.schools;
create policy schools_insert on public.schools
for insert to authenticated
with check (owner_id = auth.uid());
drop policy if exists schools_manage on public.schools;
create policy schools_manage on public.schools
for all to authenticated
using (
  owner_id = auth.uid()
  or public.has_school_role(id, array['owner'::public.membership_role, 'admin'::public.membership_role])
)
with check (
  owner_id = auth.uid()
  or public.has_school_role(id, array['owner'::public.membership_role, 'admin'::public.membership_role])
);
drop policy if exists school_memberships_select on public.school_memberships;
create policy school_memberships_select on public.school_memberships
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
);
drop policy if exists school_memberships_manage on public.school_memberships;
create policy school_memberships_manage on public.school_memberships
for all to authenticated
using (public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
with check (public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]));
drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes
for select to authenticated
using (public.is_class_teacher(id) or public.is_class_student(id));
drop policy if exists classes_manage on public.classes;
create policy classes_manage on public.classes
for all to authenticated
using (
  teacher_id = auth.uid()
  or public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
)
with check (
  public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role])
  and (teacher_id = auth.uid() or public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists class_enrollments_select on public.class_enrollments;
create policy class_enrollments_select on public.class_enrollments
for select to authenticated
using (student_id = auth.uid() or public.is_class_teacher(class_id));
drop policy if exists class_enrollments_manage on public.class_enrollments;
create policy class_enrollments_manage on public.class_enrollments
for all to authenticated
using (public.is_class_teacher(class_id))
with check (public.is_class_teacher(class_id));
drop policy if exists skills_select on public.skills;
create policy skills_select on public.skills
for select to authenticated
using (true);
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons
for select to authenticated
using (
  (school_id is null and created_by = auth.uid())
  or (school_id is not null and public.is_active_school_member(school_id))
);
drop policy if exists lessons_manage on public.lessons;
create policy lessons_manage on public.lessons
for all to authenticated
using (
  created_by = auth.uid()
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
)
with check (
  (school_id is null and created_by = auth.uid())
  or (
    school_id is not null
    and created_by = auth.uid()
    and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role])
  )
);
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments
for select to authenticated
using (
  (school_id is null and created_by = auth.uid())
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]))
  or (class_id is not null and public.is_class_student(class_id))
);
drop policy if exists assignments_manage on public.assignments;
create policy assignments_manage on public.assignments
for all to authenticated
using (
  created_by = auth.uid()
  or (class_id is not null and public.is_class_teacher(class_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
)
with check (
  (school_id is null and class_id is null and created_by = auth.uid())
  or (
    school_id is not null
    and created_by = auth.uid()
    and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role])
    and (class_id is null or public.is_class_teacher(class_id))
  )
);
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
for select to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.assignments a
    where a.id = public.submissions.assignment_id
      and ((a.class_id is not null and public.is_class_teacher(a.class_id))
      or (a.school_id is not null and public.has_school_role(a.school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])))
  )
);
drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
for insert to authenticated
with check (student_id = auth.uid());
drop policy if exists submissions_update_student on public.submissions;
create policy submissions_update_student on public.submissions
for update to authenticated
using (student_id = auth.uid() and status <> 'graded')
with check (student_id = auth.uid());
drop policy if exists submissions_update_teacher on public.submissions;
create policy submissions_update_teacher on public.submissions
for update to authenticated
using (
  exists (
    select 1
    from public.assignments a
    where a.id = public.submissions.assignment_id
      and ((a.class_id is not null and public.is_class_teacher(a.class_id))
      or (a.school_id is not null and public.has_school_role(a.school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role])))
  )
)
with check (
  exists (
    select 1
    from public.assignments a
    where a.id = public.submissions.assignment_id
      and ((a.class_id is not null and public.is_class_teacher(a.class_id))
      or (a.school_id is not null and public.has_school_role(a.school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role])))
  )
);
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
for select to authenticated
using (owner_id = auth.uid() or (school_id is not null and public.is_active_school_member(school_id)));
drop policy if exists documents_manage on public.documents;
create policy documents_manage on public.documents
for all to authenticated
using (
  owner_id = auth.uid()
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
)
with check (
  owner_id = auth.uid()
  and (school_id is null or public.is_active_school_member(school_id))
);
drop policy if exists document_shares_select on public.document_shares;
create policy document_shares_select on public.document_shares
for select to authenticated
using (public.is_active_school_member(school_id));
drop policy if exists document_shares_manage on public.document_shares;
create policy document_shares_manage on public.document_shares
for all to authenticated
using (
  shared_by = auth.uid()
  or public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
)
with check (
  shared_by = auth.uid()
  and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role])
  and (class_id is null or public.is_class_teacher(class_id))
);
drop policy if exists badges_select on public.badges;
create policy badges_select on public.badges
for select to authenticated
using (school_id is null or public.is_active_school_member(school_id));
drop policy if exists badges_manage on public.badges;
create policy badges_manage on public.badges
for all to authenticated
using (
  school_id is not null
  and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
)
with check (
  school_id is not null
  and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
);
drop policy if exists user_badges_select on public.user_badges;
create policy user_badges_select on public.user_badges
for select to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists user_badges_manage on public.user_badges;
create policy user_badges_manage on public.user_badges
for all to authenticated
using (
  (school_id is null and user_id = auth.uid())
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]))
)
with check (
  (school_id is null and user_id = auth.uid())
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]))
);
drop policy if exists activity_events_select on public.activity_events;
create policy activity_events_select on public.activity_events
for select to authenticated
using (
  (school_id is null and (actor_id = auth.uid() or target_user_id = auth.uid()))
  or (school_id is not null and public.is_active_school_member(school_id))
);
drop policy if exists activity_events_manage on public.activity_events;
create policy activity_events_manage on public.activity_events
for all to authenticated
using (
  actor_id = auth.uid()
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
)
with check (
  actor_id = auth.uid()
  and (school_id is null or public.is_active_school_member(school_id))
);
drop policy if exists student_skill_scores_select on public.student_skill_scores;
create policy student_skill_scores_select on public.student_skill_scores
for select to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists student_skill_scores_manage on public.student_skill_scores;
create policy student_skill_scores_manage on public.student_skill_scores
for all to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
)
with check (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists score_history_select on public.score_history;
create policy score_history_select on public.score_history
for select to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists score_history_manage on public.score_history;
create policy score_history_manage on public.score_history
for all to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
)
with check (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists practice_daily_select on public.practice_daily;
create policy practice_daily_select on public.practice_daily
for select to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists practice_daily_manage on public.practice_daily;
create policy practice_daily_manage on public.practice_daily
for all to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
)
with check (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists teacher_feedback_select on public.teacher_feedback;
create policy teacher_feedback_select on public.teacher_feedback
for select to authenticated
using (
  student_id = auth.uid()
  or teacher_id = auth.uid()
  or public.can_teach_student(school_id, student_id)
  or public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
);
drop policy if exists teacher_feedback_manage on public.teacher_feedback;
create policy teacher_feedback_manage on public.teacher_feedback
for all to authenticated
using (
  teacher_id = auth.uid()
  or public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role])
)
with check (
  teacher_id = auth.uid()
  and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role])
  and (class_id is null or public.is_class_teacher(class_id))
);
drop policy if exists user_xp_events_select on public.user_xp_events;
create policy user_xp_events_select on public.user_xp_events
for select to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.can_teach_student(school_id, user_id))
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role]))
);
drop policy if exists user_xp_events_manage on public.user_xp_events;
create policy user_xp_events_manage on public.user_xp_events
for all to authenticated
using (
  user_id = auth.uid()
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]))
)
with check (
  user_id = auth.uid()
  or (school_id is not null and public.has_school_role(school_id, array['owner'::public.membership_role, 'admin'::public.membership_role, 'teacher'::public.membership_role]))
);
insert into public.skills (key, label, display_order)
values
  ('reading', 'Reading', 1),
  ('grammar', 'Grammar', 2),
  ('listening', 'Listening', 3),
  ('speaking', 'Speaking', 4),
  ('writing', 'Writing', 5),
  ('vocabulary', 'Vocabulary', 6)
on conflict (key) do update
set
  label = excluded.label,
  display_order = excluded.display_order;
