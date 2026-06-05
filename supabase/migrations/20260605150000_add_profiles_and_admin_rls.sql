create schema if not exists private;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_display_name_not_blank check (btrim(display_name) <> ''),
  constraint profiles_role_valid check (role in ('super_admin', 'admin', 'customer'))
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create function private.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role in ('super_admin', 'admin')
  );
$$;

create function private.is_portal_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role = 'super_admin'
  );
$$;

revoke all on function private.is_portal_admin() from public;
revoke all on function private.is_portal_super_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_portal_admin() to authenticated;
grant execute on function private.is_portal_super_admin() to authenticated;

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, update on table public.profiles to authenticated;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using ((select private.is_portal_admin()));

create policy "Super admins can update profiles"
on public.profiles
for update
to authenticated
using ((select private.is_portal_super_admin()))
with check ((select private.is_portal_super_admin()));

create policy "Admins can view all clients"
on public.clients
for select
to authenticated
using ((select private.is_portal_admin()));

create policy "Admins can update all clients"
on public.clients
for update
to authenticated
using ((select private.is_portal_admin()))
with check ((select private.is_portal_admin()));

create policy "Admins can view all transactions"
on public.transactions
for select
to authenticated
using ((select private.is_portal_admin()));

