# Issue #2: New customers can't sign in when linked to an existing inactive client

Issue link: https://github.com/benjamin-godigi/fuelsearch-client-portal/issues/2

## Problem Summary

Admin adds a new customer → customer enters correct temp password + email → gets bounced
back to the login screen ("can't sign in").

Mechanism: `hydrateSupabaseUser` (src/App.tsx:329) force-signs-out the user whenever
`loadPortalData` throws. For a customer, `loadPortalData` (src/services/portalData.ts)
filters clients by `is_active = true` and throws "no active client account is linked"
when none is found.

Root cause: the edge function create path links a new customer to an existing client
without ensuring it is active. The update path already reactivates (index.ts ~296);
create does not. Live DB confirms 1/5 customers linked to inactive client #81.

## Acceptance Criteria

- [ ] Create path reactivates the linked existing client.
- [ ] Newly added customer can sign in with temp password + email.
- [ ] Sign-in failure with no active client shows a clear, actionable message.
- [ ] `npm run check` and `npm run build` pass.

## Relevant Files

- supabase/functions/manage-portal-user/index.ts (create path, ~line 168-201)
- src/services/portalData.ts (error messages, ~line 139, 157)
- src/App.tsx (forced sign-out on throw, ~line 329)

## Implementation Plan

1. Edge function: when linking a new customer to an existing client, set `is_active = true`
   on that client (mirrors the update path). Roll back the auth user on failure.
2. Frontend: make the two `loadPortalData` "not linked yet" messages clearly direct the
   user to contact FuelSearch support (clearer than a silent bounce).

## Test Plan

- [ ] `npm install`
- [ ] `npm run check` (tsc)
- [ ] `npm run build` (with VITE_SUPABASE_* set)
- [ ] Manual: add a user whose client name matches a deactivated client → confirm sign-in works.

## Progress Notes

- Production migration drift noted (live has 20260606175634 not in repo); tracked separately,
  out of scope for this PR.
- Edge-function fix only takes effect once deployed (`npx supabase functions deploy
  manage-portal-user`) — deploy is a separate, confirmed step.
- Existing broken customer (client #81) still needs a one-time reactivation OR an admin re-save
  after deploy — confirm with Benjamin before any production data write.

## Final Test Results

- `npm run check` (tsc) → exit 0.
- `npm run build` (CI placeholder env) → exit 0; only the known SheetJS ~500 kB chunk warning.
- Edge function not type-checked by tsc (Deno; `include: ["src"]`) — change reviewed against the
  existing update-path pattern in the same file.
- Manual end-to-end (add user → sign in) pending edge-function deploy to production.
