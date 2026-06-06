alter table public.profiles
  add column client_id bigint references public.clients (id) on delete restrict;

update public.profiles p
set client_id = c.id
from public.clients c
where p.role = 'customer'
  and c.user_id = p.user_id
  and p.client_id is null;

create index profiles_client_id_idx on public.profiles (client_id);

alter table public.issues
  add column customer_update_at timestamptz,
  add column customer_seen_at timestamptz;

update public.issues
set customer_update_at = updated_at,
    customer_seen_at = updated_at
where source = 'Customer Statement';

drop policy "Users can view their own clients" on public.clients;
create policy "Customers can view their linked client"
on public.clients for select to authenticated
using (
  id in (
    select client_id
    from public.profiles
    where user_id = (select auth.uid())
      and is_active
      and role = 'customer'
  )
);

drop policy "Users can update their own clients" on public.clients;
create policy "Customers can update their linked client"
on public.clients for update to authenticated
using (
  id in (
    select client_id
    from public.profiles
    where user_id = (select auth.uid())
      and is_active
      and role = 'customer'
  )
)
with check (
  id in (
    select client_id
    from public.profiles
    where user_id = (select auth.uid())
      and is_active
      and role = 'customer'
  )
);

drop policy "Users can view transactions for their clients" on public.transactions;
create policy "Customers can view transactions for their linked client"
on public.transactions for select to authenticated
using (
  client_id in (
    select client_id
    from public.profiles
    where user_id = (select auth.uid())
      and is_active
      and role = 'customer'
  )
);

create or replace function private.set_issue_customer_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     or old.resolution_notes is distinct from new.resolution_notes then
    new.customer_update_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.set_issue_customer_update() from public;

create trigger issues_set_customer_update
before update on public.issues
for each row execute function private.set_issue_customer_update();

create function public.mark_issue_seen(issue_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.issues
  set customer_seen_at = now()
  where id = issue_id
    and reporter_user_id = (select auth.uid());
end;
$$;

revoke all on function public.mark_issue_seen(uuid) from public;
grant execute on function public.mark_issue_seen(uuid) to authenticated;

revoke update on table public.issues from authenticated;
grant update (status, priority, resolution_notes) on table public.issues to authenticated;
