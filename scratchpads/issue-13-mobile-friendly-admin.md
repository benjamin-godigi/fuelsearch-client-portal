# Issue #13: Admin portal not mobile friendly

Issue link: https://github.com/benjamin-godigi/fuelsearch-client-portal/issues/13

## Problem Summary
On mobile, the admin portal shows only the sidebar tabs; content is clipped and unreachable.

## Root Cause
`.admin-shell` (height:100vh; overflow:hidden), `.sidebar` (height:100vh), and
`.admin-content` (height:100vh; overflow:auto) are desktop two-column rules. The
max-width:900px media query stacks the grid but never resets the 100vh/overflow,
so the sidebar fills the viewport and content can't be scrolled to.

## Relevant Files
- src/index.css — @media (max-width:900px) block (~551-566); .admin-shell (240),
  .sidebar (241), .admin-content (283).

## Implementation Plan (CSS-only, additive; desktop untouched)
In @media (max-width:900px):
- .admin-shell { height:auto; min-height:100vh; overflow:visible; }
- .sidebar { height:auto; overflow:visible; position:static; border-right:0; border-bottom:1px solid var(--line); }
- .admin-content { height:auto; overflow:visible; }
- .table-card { overflow-x:auto; }

## Verified non-issues
- Viewport meta tag present (index.html).
- Customer statement page has no 100vh wrapper (flows fine); has its own 760px rules.
- Modals use width:min(...,100%), max-height:92vh (fine).

## Test Plan
- [ ] npm run check (tsc)
- [ ] npm run build (CI placeholder env)
- [ ] Manual (Benjamin): resize browser / phone — admin content visible below tabs, scrolls; desktop unchanged.

## Final Test Results
(pending)
