alter table public.profiles
add column if not exists active_school_id uuid references public.schools(id) on delete set null;
create index if not exists idx_profiles_active_school_id on public.profiles(active_school_id);
create or replace function public.can_set_active_school(p_school_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_school_id is null or exists (
    select 1
    from public.school_memberships sm
    where sm.school_id = p_school_id
      and sm.user_id = p_user_id
      and sm.status = 'active'
  );
$$;
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and public.can_set_active_school(active_school_id, id));
