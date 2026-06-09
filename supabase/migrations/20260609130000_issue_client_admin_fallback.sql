-- Let support staff file a request on behalf of a client while previewing that
-- client's portal.
--
-- The set_issue_client trigger (see 20260609120000_scope_issues_to_client.sql)
-- always derived client_id from the reporter's own profile. An admin has no
-- client of their own, so any request they logged while previewing a customer
-- produced an orphaned issue (client_id = null) that never appeared in that
-- customer's "My Support Requests".
--
-- New behaviour:
--   * A reporter who belongs to a client account still gets that account stamped
--     on the request, ignoring whatever the caller sent (callers cannot spoof
--     which account a request belongs to).
--   * A reporter with no client of their own keeps the client_id supplied by the
--     caller ONLY if they hold the manageSupport permission (i.e. support staff
--     logging a request for the client they are previewing). Everyone else still
--     gets null, so an ordinary user can never attach a request to an arbitrary
--     client.

create or replace function private.set_issue_client()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter_client bigint;
begin
  select client_id into reporter_client
  from public.profiles
  where user_id = new.reporter_user_id
    and is_active;

  if reporter_client is not null then
    new.client_id := reporter_client;
  elsif not private.has_portal_permission('manageSupport') then
    new.client_id := null;
  end if;

  return new;
end;
$$;
