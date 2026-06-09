-- Per-order change history. Imports upsert transactions by order_number, so a
-- re-import that flips an order (e.g. Pending -> Completed, litres/total filled
-- in) silently overwrites the previous values. This append-only log records what
-- changed, when, by whom, and whether it came from an import or a manual edit, so
-- admins can see an order's history. Written app-side (like activity_logs).

create table public.transaction_changes (
  id uuid primary key default gen_random_uuid(),
  transaction_id bigint references public.transactions (id) on delete cascade,
  order_number text not null,
  source text not null,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  changed_by_email text not null,
  changed_at timestamptz not null default now(),
  status_from text,
  status_to text,
  changes jsonb not null default '{}'::jsonb,
  constraint transaction_changes_order_number_not_blank check (btrim(order_number) <> ''),
  constraint transaction_changes_source_valid check (source in ('Created', 'Import', 'Manual'))
);

create index transaction_changes_tx_idx on public.transaction_changes (transaction_id, changed_at desc);
create index transaction_changes_order_idx on public.transaction_changes (order_number, changed_at desc);

alter table public.transaction_changes enable row level security;

revoke all on table public.transaction_changes from anon, authenticated;
grant select, insert on table public.transaction_changes to authenticated;

-- Admin-only: same gate as transaction management. Customers have no grant and
-- no policy, so they can never read or write the change log.
create policy "Support staff can view transaction changes"
on public.transaction_changes for select to authenticated
using ((select private.has_portal_permission('manageTransactions')));

create policy "Support staff can record transaction changes"
on public.transaction_changes for insert to authenticated
with check ((select private.has_portal_permission('manageTransactions')));
