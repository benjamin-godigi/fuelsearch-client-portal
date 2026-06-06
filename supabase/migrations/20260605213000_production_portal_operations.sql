alter table public.profiles
  add column admin_permissions jsonb not null default
    '{"manageTransactions":true,"manageUsers":false,"manageSupport":true,"viewActivityLog":false}'::jsonb,
  add column is_active boolean not null default true,
  add column must_change_password boolean not null default false;

create unique index profiles_email_ci_idx on public.profiles (lower(email));

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users (id) on delete restrict,
  title text not null,
  description text not null,
  category text not null,
  priority text not null,
  status text not null default 'Open',
  reported_by text not null,
  source text not null,
  order_reference text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issues_title_not_blank check (btrim(title) <> ''),
  constraint issues_description_not_blank check (btrim(description) <> ''),
  constraint issues_priority_valid check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  constraint issues_status_valid check (status in ('Open', 'In Progress', 'Resolved'))
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  admin_email text not null,
  action text not null,
  details text not null,
  performed_at timestamptz not null default now(),
  constraint activity_logs_action_not_blank check (btrim(action) <> '')
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid not null references auth.users (id) on delete restrict,
  imported_by_email text not null,
  filename text not null,
  rows_in_file integer not null,
  imported integer not null,
  skipped integer not null default 0,
  dropped_in_parser integer not null default 0,
  order_numbers text[] not null default '{}',
  imported_at timestamptz not null default now(),
  constraint import_batches_filename_not_blank check (btrim(filename) <> ''),
  constraint import_batches_counts_nonnegative check (
    rows_in_file >= 0 and imported >= 0 and skipped >= 0 and dropped_in_parser >= 0
  )
);

create trigger issues_set_updated_at
before update on public.issues
for each row execute function public.set_updated_at();

create or replace function private.is_portal_admin()
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
      and is_active
      and role in ('super_admin', 'admin')
  );
$$;

create or replace function private.is_portal_super_admin()
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
      and is_active
      and role = 'super_admin'
  );
$$;

create function private.has_portal_permission(permission_name text)
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
      and is_active
      and (
        role = 'super_admin'
        or (
          role = 'admin'
          and coalesce((admin_permissions ->> permission_name)::boolean, false)
        )
      )
  );
$$;

revoke all on function private.has_portal_permission(text) from public;
grant execute on function private.has_portal_permission(text) to authenticated;

create function private.set_activity_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.admin_user_id = (select auth.uid());
  select email into new.admin_email
  from public.profiles
  where user_id = new.admin_user_id and is_active;
  return new;
end;
$$;

create function private.set_import_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.imported_by = (select auth.uid());
  select email into new.imported_by_email
  from public.profiles
  where user_id = new.imported_by and is_active;
  return new;
end;
$$;

revoke all on function private.set_activity_actor() from public;
revoke all on function private.set_import_actor() from public;

create trigger activity_logs_set_actor
before insert on public.activity_logs
for each row execute function private.set_activity_actor();

create trigger import_batches_set_actor
before insert on public.import_batches
for each row execute function private.set_import_actor();

alter table public.issues enable row level security;
alter table public.activity_logs enable row level security;
alter table public.import_batches enable row level security;

revoke all on table public.issues from anon, authenticated;
revoke all on table public.activity_logs from anon, authenticated;
revoke all on table public.import_batches from anon, authenticated;

grant select, insert, update on table public.issues to authenticated;
grant select, insert on table public.activity_logs to authenticated;
grant select, insert on table public.import_batches to authenticated;
grant insert, update, delete on table public.depots to authenticated;
grant insert, update, delete on table public.transactions to authenticated;
grant usage, select on sequence public.depots_id_seq to authenticated;
grant usage, select on sequence public.transactions_id_seq to authenticated;

revoke update on table public.profiles from authenticated;
grant update (must_change_password) on table public.profiles to authenticated;

create policy "Users can complete their password change"
on public.profiles for update to authenticated
using ((select auth.uid()) = user_id and is_active)
with check ((select auth.uid()) = user_id and is_active);

drop policy "Admins can update all clients" on public.clients;
create policy "User admins can update all clients"
on public.clients for update to authenticated
using ((select private.has_portal_permission('manageUsers')))
with check ((select private.has_portal_permission('manageUsers')));

create policy "Users can create support requests"
on public.issues for insert to authenticated
with check ((select auth.uid()) = reporter_user_id);

create policy "Users can view their support requests"
on public.issues for select to authenticated
using (
  reporter_user_id = (select auth.uid())
  or (select private.has_portal_permission('manageSupport'))
);

create policy "Support admins can update requests"
on public.issues for update to authenticated
using ((select private.has_portal_permission('manageSupport')))
with check ((select private.has_portal_permission('manageSupport')));

create policy "Admins can view activity logs"
on public.activity_logs for select to authenticated
using ((select private.has_portal_permission('viewActivityLog')));

create policy "Admins can create activity logs"
on public.activity_logs for insert to authenticated
with check (
  admin_user_id = (select auth.uid())
  and (select private.is_portal_admin())
);

create policy "Transaction admins can view import batches"
on public.import_batches for select to authenticated
using ((select private.has_portal_permission('manageTransactions')));

create policy "Transaction admins can create import batches"
on public.import_batches for insert to authenticated
with check (
  imported_by = (select auth.uid())
  and (select private.has_portal_permission('manageTransactions'))
);

create policy "Transaction admins can create depots"
on public.depots for insert to authenticated
with check ((select private.has_portal_permission('manageTransactions')));

create policy "Transaction admins can update depots"
on public.depots for update to authenticated
using ((select private.has_portal_permission('manageTransactions')))
with check ((select private.has_portal_permission('manageTransactions')));

create policy "Transaction admins can delete depots"
on public.depots for delete to authenticated
using ((select private.has_portal_permission('manageTransactions')));

create policy "Transaction admins can create transactions"
on public.transactions for insert to authenticated
with check ((select private.has_portal_permission('manageTransactions')));

create policy "Transaction admins can update transactions"
on public.transactions for update to authenticated
using ((select private.has_portal_permission('manageTransactions')))
with check ((select private.has_portal_permission('manageTransactions')));

create policy "Transaction admins can delete transactions"
on public.transactions for delete to authenticated
using ((select private.has_portal_permission('manageTransactions')));

create index issues_reporter_created_idx on public.issues (reporter_user_id, created_at desc);
create index issues_status_updated_idx on public.issues (status, updated_at desc);
create index activity_logs_performed_idx on public.activity_logs (performed_at desc);
create index import_batches_imported_idx on public.import_batches (imported_at desc);
