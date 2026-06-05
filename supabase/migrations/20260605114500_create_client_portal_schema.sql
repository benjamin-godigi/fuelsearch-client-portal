create table public.clients (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  name text not null,
  contact_name text,
  contact_email text,
  phone text,
  vat_number text,
  registration_number text,
  address_line_1 text,
  address_line_2 text,
  city text,
  province text,
  postal_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_name_not_blank check (btrim(name) <> '')
);

create table public.depots (
  id bigint generated always as identity primary key,
  name text not null,
  city text,
  province text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint depots_name_not_blank check (btrim(name) <> '')
);

create table public.transactions (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.clients (id) on delete cascade,
  depot_id bigint references public.depots (id) on delete restrict,
  order_number text not null unique,
  status text not null default 'Pending',
  vehicle_registration text,
  driver_name text,
  odometer_km numeric(12, 1),
  requested_litres numeric(12, 2),
  filled_litres numeric(12, 2),
  parking_nights integer,
  parking_fee numeric(12, 2),
  fuel_price_per_litre numeric(12, 4),
  total_amount numeric(14, 2) not null default 0,
  ordered_at timestamptz not null,
  completed_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_order_number_not_blank check (btrim(order_number) <> ''),
  constraint transactions_status_valid check (
    status in ('Completed', 'Pending', 'Open', 'Expired', 'Cancelled')
  ),
  constraint transactions_odometer_nonnegative check (odometer_km is null or odometer_km >= 0),
  constraint transactions_requested_litres_nonnegative check (
    requested_litres is null or requested_litres >= 0
  ),
  constraint transactions_filled_litres_nonnegative check (
    filled_litres is null or filled_litres >= 0
  ),
  constraint transactions_parking_nights_nonnegative check (
    parking_nights is null or parking_nights >= 0
  ),
  constraint transactions_parking_fee_nonnegative check (
    parking_fee is null or parking_fee >= 0
  ),
  constraint transactions_fuel_price_nonnegative check (
    fuel_price_per_litre is null or fuel_price_per_litre >= 0
  ),
  constraint transactions_total_amount_nonnegative check (total_amount >= 0)
);

create index clients_user_id_idx on public.clients (user_id);
create unique index depots_name_ci_idx on public.depots (lower(name));
create index transactions_client_id_idx on public.transactions (client_id);
create index transactions_depot_id_idx on public.transactions (depot_id);
create index transactions_client_ordered_at_idx
  on public.transactions (client_id, ordered_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger depots_set_updated_at
before update on public.depots
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.depots enable row level security;
alter table public.transactions enable row level security;

revoke all on table public.clients from anon, authenticated;
revoke all on table public.depots from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;

grant select, update on table public.clients to authenticated;
grant select on table public.depots to authenticated;
grant select on table public.transactions to authenticated;

create policy "Users can view their own clients"
on public.clients
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own clients"
on public.clients
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Authenticated users can view depots"
on public.depots
for select
to authenticated
using (true);

create policy "Users can view transactions for their clients"
on public.transactions
for select
to authenticated
using (
  client_id in (
    select id
    from public.clients
    where user_id = (select auth.uid())
  )
);

