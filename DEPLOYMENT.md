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
| Install command | `npm install` |

`vercel.json` sends application routes back to `index.html`, allowing direct
visits to React Router paths.

## Vercel Environment Variables

Add these under **Project Settings > Environment Variables**:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your-key
VITE_DATA_SOURCE=demo
```

Use the values from **Supabase Dashboard > Connect**.

Never add any of these to Vercel frontend variables:

- `SUPABASE_ACCESS_TOKEN`
- `sb_secret_...`
- legacy `service_role` keys

Keep `VITE_DATA_SOURCE=demo` until the portal's data screens have been moved
from local demo storage to Supabase queries.

## Supabase Auth URLs

After Vercel assigns the production domain:

1. Open **Supabase Dashboard > Authentication > URL Configuration**.
2. Set **Site URL** to the Vercel production URL.
3. Add `https://your-vercel-domain.vercel.app/**` to Redirect URLs.
4. Keep `http://127.0.0.1:5173/**` for local development.

Magic-link redirects must match one of these allowed URLs.
