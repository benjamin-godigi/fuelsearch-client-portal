# Supabase Setup

This portal uses a deliberately small data model:

- Supabase Auth handles passwordless email sign-in.
- One Auth user can own one or more rows in `clients`.
- Every Auth user has a trusted `profiles` row with a `customer`, `admin`, or
  `super_admin` role.
- `transactions` belong to a client through `client_id`.
- `depots` are shared reference data that signed-in users may read.
- There are no teams, subscriptions, permission matrices, or feedback tables.

Super admins can preview the portal as another user from the admin sidebar.
Preview mode changes only the visible UI perspective; database queries continue
to run as the signed-in super admin and remain protected by RLS.

## 1. Database Schema

Run `supabase/migrations/20260605114500_create_client_portal_schema.sql`.

### `clients`

| Column | Purpose |
| --- | --- |
| `id` | Internal primary key. |
| `user_id` | Required foreign key to `auth.users.id`; this is the ownership field. |
| `name` | Company/client name. |
| `contact_name`, `contact_email`, `phone` | Main contact details. |
| `vat_number`, `registration_number` | Optional company identifiers. |
| `address_line_1`, `address_line_2`, `city`, `province`, `postal_code` | Optional address. |
| `is_active` | Allows a client to be disabled without deleting history. |
| `created_at`, `updated_at` | Audit timestamps. |

### `depots`

| Column | Purpose |
| --- | --- |
| `id` | Internal primary key. |
| `name` | Unique depot name, compared case-insensitively. |
| `city`, `province` | Optional location. |
| `is_active` | Hides retired depots without deleting transaction history. |
| `created_at`, `updated_at` | Audit timestamps. |

### `transactions`

| Column | Purpose |
| --- | --- |
| `id` | Internal primary key. |
| `client_id` | Required foreign key to `clients.id`. |
| `depot_id` | Optional foreign key to `depots.id`. |
| `order_number` | Unique FuelSearch order reference. |
| `status` | `Completed`, `Pending`, `Open`, `Expired`, or `Cancelled`. |
| `vehicle_registration`, `driver_name`, `odometer_km` | Vehicle details. |
| `requested_litres`, `filled_litres` | Fuel quantities. |
| `parking_nights`, `parking_fee` | Optional parking details. |
| `fuel_price_per_litre`, `total_amount` | Client-visible amounts. |
| `ordered_at`, `completed_at`, `expires_at` | Transaction dates. |
| `notes` | Optional client-visible notes. |
| `created_at`, `updated_at` | Audit timestamps. |

The schema intentionally omits internal cost price, profit, balances, pricing
tiers, invoices, support requests, and feedback. Add those only when there is a
clear product requirement and matching RLS.

## 2. Row-Level Security

RLS is enabled on every public table.

- A signed-in user can select and update only `clients` rows where
  `clients.user_id = auth.uid()`.
- A signed-in user can select only transactions whose `client_id` belongs to
  one of their client rows.
- Signed-in users can read the depot directory.
- Browser users cannot insert or delete clients.
- Browser users cannot insert, update, or delete transactions or depots.
- Unauthenticated (`anon`) requests have no table access.

Provisioning and imports should be performed through the Supabase Dashboard,
Codex MCP, or another trusted server-side process. Never use a secret key in
the React app.

## 3. Magic-Link Authentication

In Supabase Dashboard:

1. Open **Authentication > Providers > Email** and leave Email enabled.
2. Open **Authentication > URL Configuration**.
3. Set **Site URL** to the deployed portal URL.
4. Add local development as a redirect URL:
   `http://127.0.0.1:5173/**`
5. Add the deployed portal URL as another redirect, for example:
   `https://portal.example.com/**`

`requestMagicLink()` uses `signInWithOtp()` and sends a magic link. It sets
`shouldCreateUser: false`, making the portal invite-only.

To add a customer:

1. Create the user under **Authentication > Users**.
2. Copy the new Auth user's UUID.
3. Insert a `clients` row whose `user_id` is that UUID.
4. Import transactions using that client's `id`.
5. The customer can now request a magic link with the same email address.

One Auth user may own multiple client rows. This supports an operator who needs
to view more than one company without introducing teams or membership tables.

## 4. Environment Variables

Create `.env.local` beside `package.json`:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

Use only browser-safe values in `VITE_` variables. Production and Vercel should
define both variables in Development, Preview, and Production. The frontend
does not bundle a demo data source.

Portal records fetched from Supabase are held in memory and are cleared on
logout or page close. Only the Supabase authentication session uses the SDK's
standard browser persistence.

Codex MCP uses a personal access token stored outside the repository:

```powershell
[Environment]::SetEnvironmentVariable(
  "SUPABASE_ACCESS_TOKEN",
  "sbp_your-personal-access-token",
  "User"
)
```

The project MCP config should reference the environment variable:

```toml
[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&features=database,docs"
bearer_token_env_var = "SUPABASE_ACCESS_TOKEN"
enabled = true
```

Do not place `SUPABASE_ACCESS_TOKEN`, an `sb_secret_` key, or a legacy
`service_role` key in `.env.local`, frontend code, or any `VITE_` variable.

## 5. Useful Provisioning SQL

After creating a user in Supabase Auth, replace the example values:

```sql
insert into public.clients (
  user_id,
  name,
  contact_name,
  contact_email
)
values (
  'AUTH_USER_UUID',
  'Example Transport',
  'Example Person',
  'person@example.com'
);
```

Then add a depot and transaction:

```sql
insert into public.depots (name, city, province)
values ('Example Fuel Depot', 'Johannesburg', 'Gauteng')
on conflict (lower(name)) do nothing;

insert into public.transactions (
  client_id,
  depot_id,
  order_number,
  status,
  total_amount,
  ordered_at
)
select
  c.id,
  d.id,
  'ORD-EXAMPLE-001',
  'Completed',
  1250.00,
  now()
from public.clients c
cross join public.depots d
where c.user_id = 'AUTH_USER_UUID'
  and d.name = 'Example Fuel Depot';
```
