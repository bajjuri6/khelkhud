# khelkhud

**Support Talent. Build Futures.** A sports talent & sponsorship platform connecting local and
emerging athletes with sponsors, built around transparent sponsorship tracking:
**Discover → Sponsor → Track → Impact**.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **`apps/web`**: Next.js 15 (App Router, TS), Tailwind v4, shadcn/ui
- **`apps/api`**: Express 5 (TS), Prisma 6, PostgreSQL
- **`packages/shared`**: zod schemas + types shared by both apps
- **`packages/theme`**: the **First Light** brand as code — pure tokens plus the generated
  Tailwind/shadcn CSS contracts. See `docs/brand-guidelines.md` (the source of truth) and
  `packages/theme/README.md`. **No app may hardcode a colour, font or radius.**
- **`devops/`**: Azure deployment — one VM (web + api + Caddy under compose) in front of a
  managed PostgreSQL Flexible Server. See `devops/DEPLOYMENT_WORKFLOW.md`.
- **Auth**: email + password (scrypt, no native dependency) **and** Sign in with Google.
  Both issue the same JWT session cookie. Login is rate-limited per IP+email; see
  `apps/api/src/lib/password.ts` and `apps/api/src/middleware/rate-limit.ts`.
- **Payments**: Razorpay test mode, with a built-in stub when keys are absent
- **Email**: AWS SES, with console logging fallback in dev
- **Files**: S3 presigned uploads, with a local-disk driver in dev

## Local development

Prerequisites: Node 22, pnpm 10 (`corepack enable pnpm`), Docker Desktop.

```sh
pnpm install
docker compose up -d          # Postgres 16 on port 5434 (see docker-compose.yml for why not 5432/5433)
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

Google is **optional** in dev: without `GOOGLE_CLIENT_ID`/`SECRET` the "Continue with
Google" button 503s, but email + password signup and signin work fully.

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

## Running it

```sh
pnpm dev:up        # Postgres + api (:4000) + web (:3000), backgrounded, HMR
pnpm dev:status
pnpm dev:restart
pnpm dev:stop      # leaves Postgres up; `docker compose down` to stop that too
```

`pnpm dev:up` also regenerates the theme CSS from `packages/theme/src/tokens.ts` before
starting, so a token edit is never silently stale. (`pnpm dev` is the plain
`turbo dev` — both apps in the foreground, no database, no theme step.)

To exercise the **production images** in the production shape — Caddy in front, one origin
on :8080, exactly what runs on the VM — before shipping:

```sh
./devops/build.sh
pnpm local         # http://localhost:8080
pnpm local:down
```

Both stacks can run at once; they don't share ports.

## Deployment

```sh
./devops/build.sh patch && ./devops/push.sh && ./devops/deploy.sh
```

Full setup, cost breakdown and troubleshooting: **`devops/DEPLOYMENT_WORKFLOW.md`**.

## Demo accounts

The seed creates demo players (4 verified / 1 pending / 1 rejected), 3 sponsors and 2 paid
sponsorships with tracking state, so every screen renders with data. Demo users are browseable
data only; sign in with real Google accounts to walk the flows.
