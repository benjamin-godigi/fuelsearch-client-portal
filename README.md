# FuelSearch Client Portal

React and Vite client portal for FuelSearch customers.

Authentication uses email and password through Supabase. The frontend has no
signup flow, and every authenticated user must also have an approved `profiles`
row before any portal data is loaded.

## Local Development

```bash
npm install
npm run dev
```

Copy `example.env` to `.env.local` and add the browser-safe Supabase values.
The application uses Supabase exclusively; no customer or transaction fixtures
are bundled into the frontend.

## Build

```bash
npm run build
```

The production output is written to `dist/`.

`npm run build` fails when either required Supabase variable is missing.

## Deployment

The portal runs on Vercel with two isolated Supabase databases so features can
be tested before they reach customers:

```text
feature branch -> PR -> Vercel Preview (staging DB)  -> verify
                                                         |
                                          merge to main -> Vercel Production (prod DB)
```

Local dev and Preview deploys use the staging database; only `main` uses
production. See `DEPLOYMENT.md` for the full Vercel and Supabase environment
setup.
