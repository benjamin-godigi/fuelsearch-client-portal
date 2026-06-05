# FuelSearch Client Portal

React and Vite client portal for FuelSearch customers.

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

The intended deployment flow is:

```text
Local workspace -> GitHub main branch -> Vercel production
```

See `DEPLOYMENT.md` for the Vercel and Supabase environment setup.
