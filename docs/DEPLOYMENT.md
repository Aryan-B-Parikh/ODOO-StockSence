# Demo Deployment Guide

> `03_ARCHITECTURE.md` §6: "No staging/prod infra required for a hackathon — local + a single
> demo deployment is sufficient, set up in Phase 4 by Person 4." This guide is the Phase 4
> deployment deliverable; the stack is verified locally with Docker Compose and ready for any
> Docker-capable host.

## What gets deployed

| Component | Image / build | Notes |
|---|---|---|
| PostgreSQL | `postgres:16-alpine` | Managed Postgres (Render/Railway/Neon/Supabase) is fine too |
| backend | `backend/Dockerfile` (context: repo root) | runs `prisma migrate deploy` then the API on `$PORT` |
| frontend | `frontend/Dockerfile` (context: repo root) | Vite dev server for the demo; a static build can be served by any CDN/nginx |

## Required environment

| Variable | Example | Used by |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?schema=public` | backend |
| `JWT_SECRET` | long random string | backend |
| `JWT_EXPIRES_IN` | `12h` | backend |
| `CORS_ORIGIN` | public frontend URL | backend |
| `NODE_ENV` | `production` (hides `debugOtp`) | backend |
| `VITE_USE_MSW` | `false` | frontend (live API) |
| `VITE_PROXY_TARGET` | backend URL (e.g. `https://stocksense-api.onrender.com`) | frontend dev proxy |

## Option A — Docker Compose on a single VM (simplest demo)

```bash
cp .env.example .env      # set JWT_SECRET + POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec backend npm run seed          # optional demo data (idempotent)
```

Ports: frontend `5173`, backend `4000`, Postgres `5432` (see `.env`).

## Option B — Render / Railway

1. **Database**: create a managed PostgreSQL instance and copy its connection string.
2. **Backend** (Docker service):
   - Build context: repository root; Dockerfile: `backend/Dockerfile`
   - Env: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN=12h`, `NODE_ENV=production`,
     `CORS_ORIGIN=<frontend URL>`
   - The container applies migrations automatically on boot; run the seed once via the
     provider's shell: `npm run seed` (or `SEED_RESET=1 npm run seed` to reseed inventory).
3. **Frontend** (Docker service):
   - Build context: repository root; Dockerfile: `frontend/Dockerfile`
   - Env: `VITE_USE_MSW=false`, `VITE_PROXY_TARGET=<backend URL>`
   - Health check path `/` (or build a static bundle with `npm run build` and serve `frontend/dist`
     from any static host, pointing `VITE_API_BASE_URL` at `<backend>/api/v1`).

## Option C — Fly.io

```bash
fly launch --dockerfile backend/Dockerfile     # from repo root; set the env vars above
fly postgres create && fly postgres attach <db>
fly deploy
```

Repeat for the frontend image (`frontend/Dockerfile`) with `VITE_PROXY_TARGET` pointing at the
backend app.

## Post-deploy verification

```bash
node scripts/smoke-auth.mjs        # SMOKE_BASE_URL=https://<backend>/api/v1
node scripts/smoke-phase2.mjs
node scripts/smoke-phase3.mjs
node scripts/smoke-phase4.mjs      # full lifecycle incl. move history + dashboard
```

Then open the frontend, sign in with the seeded demo user (`demo01 / Demo@123!`, if seeded) and
walk: Dashboard → Products/Stock → Receipt (validate) → Transfer → Delivery → Adjustment →
Move History.

## Notes & limits

- OTPs are mocked for the demo: outside production the API returns `debugOtp`; with
  `NODE_ENV=production` the code is only logged server-side (documented OPEN DECISION).
- No object storage/CDN is required — the frontend is static assets plus the API.
- The demo seed is idempotent; `SEED_RESET=1` wipes inventory tables only (never auth data).
- Managed Postgres must allow the backend host (IP allow-list) and use `?schema=public`.
