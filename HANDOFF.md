# FuelSearch Client Portal Handoff

## Production

- App: https://fuelsearch-client-portal.vercel.app
- Supabase project ref: `efjnltsombshrimuohtb`
- GitHub: `benjamin-godigi/fuelsearch-client-portal`
- Vercel project: `fuelsearch-client-portal`
- Branch: `main`
- Stack: React 18, TypeScript, Vite, Supabase, jsPDF, SheetJS

The Supabase access token is stored outside the repository in the Windows user environment as `SUPABASE_ACCESS_TOKEN`. Never commit service-role keys or access tokens.

## Current Architecture

- `src/App.tsx` contains the SPA routes and UI.
- `src/services/portalData.ts` hydrates profiles, clients, transactions, support requests, logs, and import history.
- `src/services/portalOperations.ts` handles transactions, imports, support requests, and audit activity.
- `src/services/portalUsers.ts` invokes the protected `manage-portal-user` Edge Function.
- `supabase/functions/manage-portal-user/index.ts` creates, updates, deactivates, and resets portal users.
- `supabase/migrations/` contains the complete production schema history.

## Authentication and Roles

- Email/password only. Google authentication is hidden.
- Self-registration is disabled.
- Roles: `super_admin`, `admin`, and `customer`.
- New users receive a one-time temporary password and must create a permanent password of at least 12 characters.
- Admin permissions are stored in `profiles.admin_permissions`.
- Customer users link to companies through `profiles.client_id`; multiple users may share one client.
- RLS restricts customer transactions and client data to their linked client.
- Benjamin's super-admin account is `benjamin.godigi@gmail.com`.

## Customer Preview

- Super admins can preview another portal user.
- Preview identity is separate from the authenticated super-admin identity.
- The preview user ID is stored in `sessionStorage` under `fuelsearch-preview-user-id`.
- Auth refreshes and same-tab reloads restore the preview instead of redirecting to admin.
- Permissions always use the real signed-in admin.
- A visible preview banner provides Return to Admin Portal.

## Transactions and Imports

- Imports accept XLSX, XLS, and CSV.
- Client and depot references are resolved in bulk.
- Transactions upsert by unique Order #, so repeat and older imports are safe.
- Transaction writes run in 250-row batches with progress.
- The Transactions page initially renders 100 rows and loads 100 more per click.
- Full transaction history is loaded from Supabase in 1,000-row pages.
- Admins can export transactions or reset all transactions after typing `DELETE`.
- Import success closes the modal and displays a persistent confirmation.

## Statements and Invoices

- Customer statements filter by month and status.
- CSV statement exports include every transaction in the selected month, not only visible rows.
- Current-month files use Month-to-Date naming and include an as-at date.
- Invoice PDFs are generated directly with pinned `jspdf`.
- The local logo asset is `public/fuelsearch-logo.svg`.
- Invoice banking details are centralized in `BANKING_DETAILS` in `src/App.tsx` and used by both HTML and PDF invoices.

Banking details:

- FNB: account `63026817544`, branch `250655`
- Nedbank: account `1238798306`, branch `198765`
- ABSA: account `4105937663`, branch `632005`
- Standard Bank: account `10184309490`, branch `001509`
- Account name: `FUELSEARCH`

## Support

- Customers can submit requests and view My Requests.
- Statuses: Open, In Progress, Resolved.
- Admin resolution notes are visible to the reporting customer.
- `customer_update_at` and `customer_seen_at` provide unread customer alerts.
- Customers can acknowledge only their own request updates through `mark_issue_seen`.

## Help

- Admin Help is available at `/admin/help`.
- Customers have a Help button in the statement header.
- Help is searchable and filtered by role.
- Topics cover passwords, previewing, user setup, imports, older records, transactions, statements, invoices, support, and troubleshooting.

## Deployment and Verification

Typical checks:

```powershell
npm run check
$env:VITE_SUPABASE_URL='https://efjnltsombshrimuohtb.supabase.co'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='<publishable-key>'
npm run build
npm audit --omit=dev
```

Supabase:

```powershell
$env:SUPABASE_ACCESS_TOKEN=(Get-ItemProperty -Path 'HKCU:\Environment' -Name 'SUPABASE_ACCESS_TOKEN').SUPABASE_ACCESS_TOKEN
npx supabase migration list --linked
npx supabase db lint --linked --level warning
npx supabase db push --linked --yes
npx supabase functions deploy manage-portal-user --project-ref efjnltsombshrimuohtb --use-api
```

Vercel deploys automatically after pushing `main`. Confirm that the deployment commit matches the pushed SHA and reaches `READY`.

## Known Notes

- Leaked-password protection is disabled because it requires a paid Supabase feature.
- The SheetJS import chunk is approximately 500 KB and produces a build-size warning; it is already dynamically imported.
- Do not delete the unlinked client and depot references created by imports. They are intentional and allow users to be linked later.
- Avoid destructive database operations unless explicitly requested and backed up.
