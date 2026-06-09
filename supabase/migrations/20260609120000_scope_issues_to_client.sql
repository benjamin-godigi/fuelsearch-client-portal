-- Scope support requests to the customer account (client), not just the reporter.
-- Previously a request was only visible to the single user who created it, which both
-- under-shared within a multi-user client account and (in admin preview) let every issue
-- load into the client. Issues now belong to a client, mirroring clients/transactions.

alter table public.issues
  add column client_id bigint references public.clients (id) on delete restrict;

update public.issues i
set client_id = p.client_id
from public.profiles p
where p.user_id = i.reporter_user_id
  and p.client_id is not null;

create index issues_client_id_idx on public.issues (client_id);

-- Derive the client from the reporter's profile so the value is trustworthy and
-- callers cannot spoof which account a request belongs to.
create or replace function private.set_issue_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select client_id into new.client_id
  from public.profiles
  where user_id = new.reporter_user_id
    and is_active;
  return new;
end;
$$;

revoke all on function private.set_issue_client() from public;

create trigger issues_set_client
before insert on public.issues
for each row execute function private.set_issue_client();

drop policy "Users can view their support requests" on public.issues;
create policy "Users can view their account support requests"
on public.issues for select to authenticated
using (
  reporter_user_id = (select auth.uid())
  or (
    client_id is not null
    and client_id in (
      select client_id
      from public.profiles
      where user_id = (select auth.uid())
        and is_active
        and role = 'customer'
    )
  )
  or (select private.has_portal_permission('manageSupport'))
);
