# Issue #4: Remove the Help tab (admin portal + customer statement)

Issue link: https://github.com/benjamin-godigi/fuelsearch-client-portal/issues/4

## Problem Summary
Remove Help entry points from the admin sidebar and the customer statement header.

## Relevant Files
- src/App.tsx
  - import `HelpCircle` (line 19)
  - customer `helpOpen` state (632), Help button (701), help Modal (789)
  - admin Help NavLink (958), admin Help Route (1084)
  - `HelpGuide` component (1839-1867)

## Implementation Plan
1. Remove customer: helpOpen state, Help button, help modal.
2. Remove admin: Help NavLink + Route.
3. Remove now-unused `HelpGuide` component and `HelpCircle` import.
4. Leave help-* CSS (some classes shared; out of scope).

## Test Plan
- [ ] `npm run check` (tsc)
- [ ] `npm run build` (CI placeholder env)

## Final Test Results
- `npm run check` (tsc) → exit 0.
- `npm run build` (CI placeholder env) → exit 0; only the known SheetJS chunk warning.
- Verified no remaining references to HelpGuide / helpOpen / HelpCircle / /admin/help.
