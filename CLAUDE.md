# Project: FuelSearch Client Portal

React + Vite + TypeScript SPA on Vercel, backed by Supabase (DB, auth, edge
functions). Build with `npm run build`; type-check with `npm run check`.

## Environments — two isolated Supabase projects

| Environment | Branch                | Supabase project ref             | Database |
| ----------- | --------------------- | -------------------------------- | -------- |
| Production  | `main`                | `efjnltsombshrimuohtb`           | prod     |
| Staging     | `staging` (fixed URL) | `aykgexwofckejdozejoo`           | staging  |
| Local       | `npm run dev`         | `aykgexwofckejdozejoo` (staging) | staging  |

`main` is the Vercel **Production Branch**; every other branch (including
`staging`) deploys as a Preview and uses the **staging** database. Local `.env`
points at staging too. Only `main` ever touches production data. Staging shares
prod's **schema** but not its **data** (no production data is copied into
staging — privacy).

## Promotion workflow (always follow this)

```
feature branch ──merge──► staging ──► staging site (staging DB)   ← test
                                          │ open PR staging → main, merge
                                          ▼
                                        main ──► production (prod DB)   ← live
```

1. Branch off `staging` for each change.
2. Merge into `staging`; the staging site redeploys against the staging DB.
3. Test on the staging URL until happy.
4. PR `staging → main` and merge; production redeploys against the prod DB.

**Database migrations do NOT promote with Git.** When a change adds a migration
in `supabase/migrations/`, apply it to the **staging** DB when merging to
`staging`, and to the **production** DB when merging `staging → main`. Same for
the `manage-portal-user` edge function. `supabase/migrations/` is the source of
truth for both projects; never hand-edit a database out of band (doing so caused
prior drift that had to be reconciled).

## This machine (Windows) — tooling notes

- **GitHub CLI is installed but NOT on PATH.** Invoke it by full path:
  `"/c/Program Files/GitHub CLI/gh.exe"` (authenticated as `benjamin-godigi`,
  `repo` scope). Use it for PRs/issues.
- `python3` is not available; `node` and `curl` are. Parse JSON with `node -e`,
  not `python`.
- Default shell is PowerShell, but PowerShell invocation via the Bash tool is
  blocked — use the Bash tool's bash for scripts.

## Rollback runbook

### Tag convention
After every prod promotion, tag the new `main` HEAD:
```bash
git fetch origin main
git tag release/YYYY-MM-DD origin/main
git push origin release/YYYY-MM-DD
```
Use a sequence suffix if more than one release ships the same day: `release/2026-06-10-2`.

### Option A — Vercel instant rollback (fastest, no code change)
1. Open the Vercel dashboard → **fuelsearch-client-portal** project → **Deployments**.
2. Find the last known-good deployment (identified by the release tag date).
3. Click **⋯ → Promote to Production**.
4. Done — Vercel re-promotes that build in ~10 seconds, no rebuild.

This is the right choice for a hot incident. It does **not** revert the Git history, so
follow up with a code fix and a new promotion when ready.

### Option B — git revert (clean code history)
```bash
# Revert a single bad commit (creates a new commit, safe for shared history)
git revert <bad-commit-sha>
git push origin main   # triggers Vercel rebuild → new prod deployment

# Or revert back to a known release tag
git revert <release-tag>..HEAD   # reverts every commit since that tag
git push origin main
```
Then re-run any DB migrations that need to be undone manually (Vercel rollback does
not touch the database).

### Option C — hard reset to a release tag (destructive, last resort)
```bash
git checkout main
git reset --hard release/YYYY-MM-DD
git push --force-with-lease origin main
```
Only use this if `git revert` is not practical. It rewrites history — confirm with the
team before proceeding.

## More detail

See `DEPLOYMENT.md` (full Vercel + Supabase setup, env vars, auth URLs) and
`SUPABASE_INTEGRATION.md` (edge-function secrets, super-admin bootstrap).
