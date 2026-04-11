# Expense Tracker

Minimal full-stack expense tracker with an Express API, SQLite persistence, and a React UI.

Expense Tracker is a small personal finance app for recording daily spending, filtering expenses by category, sorting them by date, and seeing the total for the current view. It is built to behave reliably under real-world conditions such as repeated submits, page refreshes, and temporary network failures.

## Stack

- Backend: Node.js, TypeScript, Express, SQLite via `better-sqlite3`
- Frontend: React, TypeScript, Vite

## Why SQLite

SQLite keeps the exercise lightweight while still giving durable local persistence, transactional writes, and a realistic path for idempotent request handling. For money, the API stores `amount` internally as integer minor units and returns a normalized decimal string to avoid floating-point drift.

## Core design decisions

- `POST /expenses` requires an `Idempotency-Key` header. The backend stores the request hash alongside the created expense so safe retries return the original record instead of creating duplicates.
- The frontend stores a pending submission in `localStorage` before sending it. If the page refreshes or the client loses the response, the app retries with the same idempotency key on the next load.
- Filtering and sorting are server-driven through `GET /expenses?category=...&sort=date_desc`.

## Trade-offs

- Authentication, authorization, and multi-user support are intentionally out of scope.
- Category management is free-form text instead of a normalized lookup table.
- The UI is intentionally small and clear rather than building a larger dashboard.

## Deployment status

The app is not deployed from this environment. A live URL can be added after pushing the repo to your preferred host for the API and frontend.

## Intentionally not done

- Edit/delete flows
- Pagination
- Deployment automation and infrastructure config
- Stronger observability such as structured logs and metrics

## Run locally

```bash
npm install
npm run dev
```

Backend runs on `http://localhost:4101` by default and frontend runs on `http://localhost:5173`.
The backend default uses `4101` to avoid common local conflicts on `3001`. If you override the backend port, also set `VITE_API_BASE_URL` for the frontend.

## Test

```bash
npm test
```