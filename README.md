# FuelSearch Client Portal

React and Vite client portal for FuelSearch customers.

## Local Development

```bash
npm install
npm run dev
```

Copy `example.env` to `.env.local` and add the browser-safe Supabase values.
Keep `VITE_DATA_SOURCE=demo` until the remaining UI repositories are connected
to Supabase.

## Build

```bash
npm run build
```

The production output is written to `dist/`.

## Deployment

The intended deployment flow is:

```text
Local workspace -> GitHub main branch -> Vercel production
```

See `DEPLOYMENT.md` for the Vercel and Supabase environment setup.
