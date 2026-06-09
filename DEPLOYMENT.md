# Vercel Deployment

## GitHub

Repository:

`https://github.com/benjamin-godigi/fuelsearch-client-portal`

The portal application lives at the repository root. Generated folders,
local environment files, spreadsheets, screenshots, and Codex credentials are
not committed.

## Import Into Vercel

1. In Vercel, choose **Add New > Project**.
2. Import `benjamin-godigi/fuelsearch-client-portal`.
3. Use the `main` branch for production.
4. Vercel should detect **Vite** automatically.
5. Confirm these build settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm ci` |
| Node.js version | `20.x` |

`vercel.json` sends application routes back to `index.html`, allowing direct
visits to React Router paths.

## Environments

Two isolated environments keep testing away from live customer data:

| Environment | Frontend (Vercel)          | Database (Supabase)              | Used for                        |
| ----------- | -------------------------- | -------------------------------- | ------------------------------- |
| Production  | `main` branch → Production | `efjnltsombshrimuohtb` (prod)    | Live customers                  |
| Staging     | Every PR → Preview deploy  | `aykgexwofckejdozejoo` (staging) | Testing features before go-live |
| Local       | `npm run dev`              | `aykgexwofckejdozejoo` (staging) | Day-to-day development          |

Local dev and Preview deploys both point at the **staging** database, so work in
progress can never touch production records. Only `main` (Production) uses the
production database.

Release flow:

```text
feature branch ──open PR──► Vercel Preview URL (staging DB)   ← test, share for review
                                   │  approve + merge
                                   ▼
                              main ──► Vercel Production (prod DB)   ← live
```

## Vercel Environment Variables

Add these under **Project Settings > Environment Variables**, giving the same
two variable names **different values per scope**:

| Variable                        | Production scope                           | Preview + Development scope                      |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `VITE_SUPABASE_URL`             | `https://efjnltsombshrimuohtb.supabase.co` | `https://aykgexwofckejdozejoo.supabase.co`       |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | prod publishable key                       | `sb_publishable_-m7Dh7ZawA0fCaPPZxwVrw_2u0f3wTa` |

In the Vercel variable editor, untick **Production** when entering the staging
values, and tick only **Production** when entering the prod values.

Never add any of these to Vercel frontend variables:

- `SUPABASE_ACCESS_TOKEN`
- `sb_secret_...`
- legacy `service_role` keys

Builds fail when either variable is absent, preventing an unusable deployment
from being published.

## Supabase Auth URLs and Providers

After Vercel assigns the production domain:

1. Open **Supabase Dashboard > Authentication > URL Configuration**.
2. Set **Site URL** to `https://fuelsearch-client-portal.vercel.app`.
3. Add `https://fuelsearch-client-portal.vercel.app/**` to Redirect URLs.
4. Add `https://*-benjamins-projects-fa59627f.vercel.app/**` for Vercel preview deployments.
5. Keep `http://127.0.0.1:5173/**` for local development.

Password-reset redirects must match one of these allowed URLs.

The **staging** Supabase project (`aykgexwofckejdozejoo`) has its own, separate
Auth URL configuration. In that project add the Vercel preview wildcard
(`https://*-fuelsearchadmin-8386s-projects.vercel.app/**`) and the local
`http://127.0.0.1:5173/**` to Redirect URLs so sign-in works on preview deploys
and locally against staging.

Disable new-user signup in **Authentication > Providers > Email** after all
approved users have been provisioned. Existing users can still sign in.

Password recovery is handled by an authorized portal administrator issuing a
new temporary password. This avoids Supabase's built-in email sending limit.
Custom SMTP is optional until email-based recovery is enabled later.

## Supabase Release

The frontend depends on the latest database migration and
`manage-portal-user` Edge Function. Schema in `supabase/migrations/` is the
source of truth for both projects. Apply changes to **staging first**, verify on
a Preview deploy, then apply the same migration to **production** when merging to
`main`:

```powershell
# Staging first
supabase link --project-ref aykgexwofckejdozejoo
supabase db push
supabase functions deploy manage-portal-user

# Production, after verifying on staging
supabase link --project-ref efjnltsombshrimuohtb
supabase db push
supabase functions deploy manage-portal-user
```

Staging was baselined as a structural clone of production on 2026-06-08 (all six
migrations replayed). The two databases share schema but **not** data: staging
starts empty and holds only test data created by using the staging app. The
`manage-portal-user` Edge Function is live on production but not yet deployed to
staging — deploy it there (with staging secrets) when you need to test
user-invite flows on staging.

Use `scripts/bootstrap-super-admin.ps1` once to create the initial Benjamin
super-admin account. See `SUPABASE_INTEGRATION.md` for the one-time secret
setup and removal steps.

## Release Checks

`.github/workflows/build.yml` runs `npm ci`, TypeScript checks, and the
production build on pull requests and pushes to `main`. Configure `main` branch
protection in GitHub to require the **Build** check before merging.
