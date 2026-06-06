alter table public.clients
  alter column user_id drop not null;

grant insert on table public.clients to authenticated;
grant usage, select on sequence public.clients_id_seq to authenticated;

create policy "Transaction admins can create unassigned clients"
on public.clients for insert to authenticated
with check (
  (select private.has_portal_permission('manageTransactions'))
  and user_id is null
);
