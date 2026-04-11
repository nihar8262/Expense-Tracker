# Expense Tracker

Minimal full-stack expense tracker with a Vercel-ready API, hosted Postgres persistence, and a React UI.

Expense Tracker is a small personal finance app for recording daily spending, filtering expenses by category, sorting them by date, and seeing the total for the current view. It is built to behave reliably under real-world conditions such as repeated submits, page refreshes, and temporary network failures.

## Stack

- Backend: Node.js, TypeScript, Express for local development, Vercel serverless API routes in production, hosted Postgres via `postgres`
- Frontend: React, TypeScript, Vite

## Why hosted Postgres

The app now uses a hosted Postgres-compatible database so the same persistence model works on Vercel's serverless runtime. Local filesystem-backed SQLite is not a safe production option on Vercel because serverless functions do not provide durable writable storage between invocations. For money, the API stores `amount` internally as integer minor units and returns a normalized decimal string to avoid floating-point drift.

## Core design decisions

- `POST /api/expenses` requires an `Idempotency-Key` header. The backend stores the request hash alongside the created expense so safe retries return the original record instead of creating duplicates.
- The frontend stores a pending submission in `localStorage` before sending it. If the page refreshes or the client loses the response, the app retries with the same idempotency key on the next load.
- Filtering and sorting are server-driven through `GET /api/expenses?category=...&sort=date_desc`.
- The frontend defaults to same-origin `/api` calls. In local development, Vite proxies `/api` to the Express server on port `4101`, which avoids CORS setup entirely.

## Trade-offs

- Authentication, authorization, and multi-user support are intentionally out of scope.
- Category management is free-form text instead of a normalized lookup table.
- The UI is intentionally small and clear rather than building a larger dashboard.

## Deployment status

The repo now includes a `vercel.json` configuration and serverless API routes under `api/` so the frontend and API can be deployed together on Vercel.

## Intentionally not done

- Edit/delete flows
- Pagination
- Full infrastructure automation outside Vercel project configuration
- Stronger observability such as structured logs and metrics

## Environment variables

Create a local `.env` file or set variables in your shell using the values from `.env.example`.

- `DATABASE_URL`: required. A hosted Postgres connection string.
- `VITE_API_BASE_URL`: optional. Leave empty for same-origin API calls. This is only useful if you want the frontend to call an external API URL instead.

## Run locally

```bash
npm install
npm run dev
```

Local requirements:

- A reachable hosted Postgres database
- `DATABASE_URL` exported in your shell or present in a local `.env` loader you use externally

Local URLs:

- Frontend: `http://localhost:5173`
- API server: `http://localhost:4101`
- Health check: `http://localhost:4101/api/health`

The frontend talks to `/api` and Vite proxies those requests to `4101` during development.

## Deploy to Vercel

1. Create a hosted Postgres database. Vercel Postgres, Neon, and Supabase Postgres will all work as long as you provide a standard connection string.
2. In Vercel, import the repository.
3. Set the `DATABASE_URL` environment variable in the Vercel project.
4. Leave `VITE_API_BASE_URL` unset unless you want the frontend to call a different API host.
5. Deploy. Vercel will build the frontend from `frontend/dist` and serve the API routes from `api/`.

After deployment, your API endpoints will be:

- `/api/health`
- `/api/expenses`

## Test

```bash
npm test
```