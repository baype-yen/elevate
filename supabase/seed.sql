-- Baseline seed data for app lookups.

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

create or replace function public.bootstrap_demo_workspace()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_school_id uuid;
  v_class_id uuid;
begin
  if v_user_id is null then
    raise exception 'Must be authenticated to bootstrap workspace';
  end if;

  insert into public.schools (name, slug, owner_id)
  values (
    'My School',
    'my-school-' || substring(replace(v_user_id::text, '-', '') from 1 for 8),
    v_user_id
  )
  on conflict (slug) do update set name = excluded.name
  returning id into v_school_id;

  update public.profiles
  set active_school_id = v_school_id
  where id = v_user_id;

  insert into public.school_memberships (school_id, user_id, role, status, joined_at)
  values (
    v_school_id,
    v_user_id,
    case
      when (select default_role from public.profiles where id = v_user_id) = 'teacher' then 'teacher'::public.membership_role
      else 'student'::public.membership_role
    end,
    'active',
    now()
  )
  on conflict (school_id, user_id) do update
    set status = 'active',
        joined_at = coalesce(public.school_memberships.joined_at, excluded.joined_at),
        updated_at = now();

  if (select default_role from public.profiles where id = v_user_id) = 'teacher' then
    insert into public.classes (school_id, teacher_id, name, cefr_level)
    values (v_school_id, v_user_id, 'Year 10A — English B1', 'b1')
    returning id into v_class_id;

    insert into public.activity_events (school_id, class_id, actor_id, event_type, payload)
    values (v_school_id, v_class_id, v_user_id, 'milestone', '{"text":"Welcome! Your demo class is ready."}'::jsonb);
  end if;

  return v_school_id;
end;
$$;

grant execute on function public.bootstrap_demo_workspace() to authenticated;
