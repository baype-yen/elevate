alter table public.classes
add column if not exists archived_at timestamptz;

create index if not exists idx_classes_school_archived
on public.classes (school_id, archived_at, created_at desc);

create unique index if not exists uq_classes_school_code_active
on public.classes (school_id, lower(class_code))
where class_code is not null and archived_at is null;

create or replace function public.generate_class_code(p_name text)
returns text
language plpgsql
as $$
declare
  cleaned text;
  base text;
  suffix text;
begin
  cleaned := regexp_replace(upper(coalesce(p_name, 'CLASS')), '[^A-Z0-9]+', '', 'g');
  base := left(cleaned, 6);
  if base = '' then
    base := 'CLASS';
  end if;
  suffix := right(replace(gen_random_uuid()::text, '-', ''), 4);
  return base || suffix;
end;
$$;
