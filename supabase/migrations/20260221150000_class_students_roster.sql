create table if not exists public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  company text,
  city text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, first_name, last_name)
);

create index if not exists idx_class_students_class_sort
on public.class_students(class_id, sort_order, last_name, first_name);

drop trigger if exists trg_class_students_updated_at on public.class_students;
create trigger trg_class_students_updated_at
before update on public.class_students
for each row execute function public.set_updated_at();

alter table public.class_students enable row level security;

drop policy if exists class_students_select on public.class_students;
create policy class_students_select on public.class_students
for select to authenticated
using (public.is_class_teacher(class_id) or public.is_class_student(class_id));

drop policy if exists class_students_manage on public.class_students;
create policy class_students_manage on public.class_students
for all to authenticated
using (public.is_class_teacher(class_id))
with check (public.is_class_teacher(class_id));

create or replace function public.import_bts_mco_roster(p_class_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if not public.is_class_teacher(p_class_id, auth.uid()) then
    raise exception 'Not authorized to import roster for this class';
  end if;

  insert into public.class_students (class_id, last_name, first_name, company, city, sort_order)
  values
    (p_class_id, 'ALLIOUA', 'Cheyma', 'CEGELEC B.V. (BUREAU VALLEE)', 'THIONVILLE', 1),
    (p_class_id, 'DI LUIGI', 'Lisa', 'MNA GROUPE (MISS COOKIES COFFEE)', 'THIONVILLE', 2),
    (p_class_id, 'FIEFEL', 'Romain', 'LORPAUL SARL', 'THIONVILLE', 3),
    (p_class_id, 'FIGUEIREDO', 'Jessica', 'ETAM LINGERIE S.A.', 'TERVILLE', 4),
    (p_class_id, 'FREYWALD', 'Emma', 'LORPAUL', 'THIONVILLE', 5),
    (p_class_id, 'HILT', 'Emma', 'EMBDIS (INTERMARCHE)', 'BASSE-HAM', 6),
    (p_class_id, 'OLIVAREZ', 'Matys', 'PAUL (Thionville centre ville)', 'THIONVILLE', 7),
    (p_class_id, 'PINNA', 'Tom', 'SARL BOURGERY', 'HAYANGE', 8),
    (p_class_id, 'RAHMI', 'Soumiya', 'Point B', 'FAMECK', 9),
    (p_class_id, 'SCHEIBER', 'TOM', 'Supermarché MATCH', 'GUENANGE', 10),
    (p_class_id, 'SCHMIDLIN', 'Lylian', 'ALDI TERVILLE', 'TERVILLE', 11)
  on conflict (class_id, first_name, last_name) do update
    set company = excluded.company,
        city = excluded.city,
        sort_order = excluded.sort_order,
        updated_at = now();

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.import_bts_mco_roster(uuid) to authenticated;
