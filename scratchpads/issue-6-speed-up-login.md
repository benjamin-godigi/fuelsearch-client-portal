# Issue #6: Speed up login

Issue link: https://github.com/benjamin-godigi/fuelsearch-client-portal/issues/6

## Problem Summary
Login blocks on `loadPortalData` loading the full transaction history (~14,851 rows)
via a **sequential** 1,000-row pagination loop (~15 round-trips). Auth listener also
reloads the whole dataset redundantly (getSession + INITIAL_SESSION double-load; full
reload on every TOKEN_REFRESHED).

## Relevant Files
- src/services/portalData.ts — transactions pagination loop (~161-175)
- src/App.tsx — auth useEffect (~339-379), getSupabaseSession import (39)

## Implementation Plan
1. portalData.ts: count transactions once, then fetch all pages with bounded
   concurrency (limit 6). Add `id` tiebreaker to order for stable paging.
2. App.tsx: drive auth solely from onAuthStateChange; skip non-reload events
   (TOKEN_REFRESHED) and repeat loads for the same user. Remove getSupabaseSession import.

## Behavior preservation
- Same rows end up in `state.transactions` (full history), just fetched in parallel + once.
- UI components unchanged.

## Test Plan
- [ ] `npm run check` (tsc)
- [ ] `npm run build` (CI placeholder env)
- [ ] Manual (Benjamin before merge): admin login + customer login, statements/transactions load.

## Final Test Results
- `npm run check` (tsc) → exit 0.
- `npm run build` (CI placeholder env) → exit 0; only the known SheetJS chunk warning.
- Re-verified after merging main (PR #5 help-tab removal) into the branch.
