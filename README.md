# khelkhud

**Support Talent. Build Futures.** A sports talent & sponsorship platform connecting local and
emerging athletes with sponsors, built around transparent sponsorship tracking:
**Discover → Sponsor → Track → Impact**.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **`apps/web`**: Next.js 15 (App Router, TS), Tailwind v4, shadcn/ui
- **`apps/api`**: Express 5 (TS), Prisma 6, PostgreSQL
- **`packages/shared`**: zod schemas + types shared by both apps
- **`devops/`**: intentionally empty — owned by a separate developer (EC2 + Docker deployment)
- **Auth**: Sign in with Google (backend-driven OAuth, JWT session cookie)
- **Payments**: Razorpay test mode, with a built-in stub when keys are absent
- **Email**: AWS SES, with console logging fallback in dev
- **Files**: S3 presigned uploads, with a local-disk driver in dev

## Local development

Prerequisites: Node 22, pnpm 10 (`corepack enable pnpm`), Docker Desktop.

```sh
pnpm install
docker compose up -d          # Postgres 16 on port 5433 (5432 is taken by a local install)
copy .env.example .env        # then fill in the values below
pnpm db:migrate
pnpm db:seed                  # sports, locations, admin, demo players/sponsors
pnpm dev                      # web: http://localhost:3000, api: http://localhost:4000
```

Required `.env` values:

- `SESSION_SECRET` — any 64-char hex string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud Console OAuth client (Web type)
  with redirect URI `http://localhost:4000/api/auth/google/callback`
- `ADMIN_EMAILS` — comma-separated emails that get the ADMIN role on login

Optional (features degrade gracefully without them):

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` — blank runs payments in
  **stub mode** (a "Simulate payment" dialog replaces checkout)
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — blank logs emails to the API console and stores
  uploads on local disk (`STORAGE_DRIVER=local`)

## Smoke test

With the dev servers running:

```sh
cd apps/api
pnpm exec dotenv -e ../../.env -- tsx scripts/smoke.ts
```

Exercises the whole core journey over HTTP: profile setup, uploads, discovery filters,
sponsorship + stub payment, allocations/receipts/updates, admin verification, notifications and
dashboards.

## Demo accounts

The seed creates demo players (4 verified / 1 pending / 1 rejected), 3 sponsors and 2 paid
sponsorships with tracking state, so every screen renders with data. Demo users are browseable
data only; sign in with real Google accounts to walk the flows.
