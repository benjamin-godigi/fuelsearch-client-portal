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

## Vercel Environment Variables

Add these under **Project Settings > Environment Variables**:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
```

Use the values from **Supabase Dashboard > Connect**.

Never add any of these to Vercel frontend variables:

- `SUPABASE_ACCESS_TOKEN`
- `sb_secret_...`
- legacy `service_role` keys

Set both variables for Development, Preview, and Production. Builds fail when
either variable is absent, preventing an unusable deployment from being
published.

## Supabase Auth URLs and Providers

After Vercel assigns the production domain:

1. Open **Supabase Dashboard > Authentication > URL Configuration**.
2. Set **Site URL** to `https://fuelsearch-client-portal.vercel.app`.
3. Add `https://fuelsearch-client-portal.vercel.app/**` to Redirect URLs.
4. Add `https://*-benjamins-projects-fa59627f.vercel.app/**` for Vercel preview deployments.
5. Keep `http://127.0.0.1:5173/**` for local development.

Password-reset redirects must match one of these allowed URLs.

Disable new-user signup in **Authentication > Providers > Email** after all
approved users have been provisioned. Existing users can still sign in.

Password recovery is handled by an authorized portal administrator issuing a
new temporary password. This avoids Supabase's built-in email sending limit.
Custom SMTP is optional until email-based recovery is enabled later.

## Supabase Release

The frontend depends on the latest database migration and
`manage-portal-user` Edge Function. Apply and deploy those before publishing
the matching frontend commit:

```powershell
supabase link --project-ref efjnltsombshrimuohtb
supabase db push
supabase functions deploy manage-portal-user
```

Use `scripts/bootstrap-super-admin.ps1` once to create the initial Benjamin
super-admin account. See `SUPABASE_INTEGRATION.md` for the one-time secret
setup and removal steps.

## Release Checks

`.github/workflows/build.yml` runs `npm ci`, TypeScript checks, and the
production build on pull requests and pushes to `main`. Configure `main` branch
protection in GitHub to require the **Build** check before merging.
