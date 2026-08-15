# CLAUDE.md

Working notes for agents in this repo. `README.md` covers the stack and local setup — this
file is deliberately only the things that have already cost someone hours. If you learn a
new one, add it here rather than in a commit message where it will be lost.

## Commands

```sh
pnpm dev:up          # background dev stack (run-dev.sh); dev:status / dev:stop / dev:restart
pnpm build           # turbo, all 6 workspaces
pnpm typecheck
pnpm db:migrate      # prisma migrate dev
pnpm db:seed
```

Run `pnpm build` / `typecheck` / `install` from the root **only when nothing else is
running against the repo**. Parallel agents racing on the same `node_modules` and
`.prisma` output corrupt the generated client. Scope to one workspace instead:

```sh
pnpm --filter @khelkhud/api exec tsc --noEmit
```

## Traps

**`NODE_ENV=development` in your shell breaks the production build.** `next build` picks it
up and silently produces a dev bundle. Use `env -u NODE_ENV pnpm build`.

**Two theme systems, and only one of them re-scopes.** `packages/theme` emits
`firstlight.css` (`:root`, the marketing brand) and `app.css` (`.theme-app`, the dashboard).
The brand colours — `cream`, `slate`, `ink`, `sweat`, `ground` — are literal `@theme`
values. They do **not** change under `.theme-app`. Only the shadcn indirection variables
(`--border`, `--card`, `--muted-foreground`, `--destructive`, …) re-scope.

So inside `/admin` or `/dashboard` (both wrapped in `.theme-app`), use `border-border`,
`bg-card`, `bg-muted`, `text-muted-foreground`, `text-foreground`. Using `bg-cream-2` or
`text-slate` there renders warm cream inside the cool dashboard palette — it compiles, it
just looks wrong, which is why it survived several rounds of review.

`text-marigold` is the exception: marigold is the accent in *both* systems, so it is
correct in either. Never hardcode a hex value; see `docs/brand-guidelines.md`.

**`pnpm` does not exist inside the containers.** Invoking it at runtime makes corepack
write to a home directory that isn't there and you get `EACCES`. Call the binaries
directly (`tsx`, `prisma`). Likewise `pnpm prune --prod` both prompts (hanging in a
non-TTY) and reinstalls from scratch, destroying the generated Prisma client.

**Azure has zero ARM quota on this subscription** (Bpsv2/Bsv2/Basv2), and the self-service
increase was refused. The VM is `Standard_B1ms` and images build `linux/amd64`. A
cross-build from Apple Silicon takes ~80s — fine, don't route around it.

**Postgres extension availability is not permission.** `pg_available_extensions` listing
`pg_trgm` means nothing on Flexible Server; it must also be in the `azure.extensions`
server parameter. `provision-postgres.sh` sets this now. Getting it wrong takes production
down *after* migrations have already applied.

**`tr -dc … | head -c N` with `pipefail` dies to SIGPIPE**, silently, mid-script. Use
`openssl rand … | cut`.

**Stale `tsx watch` processes leak file watchers** until you hit `EMFILE` and every route
404s. `pnpm dev:status` before assuming your code is broken. Match on
`tsx/dist/cli.mjs watch`, not `"tsx watch"`.

**cloud-init must be ASCII.** An em-dash in a comment fails with a latin-1 codec error.

## Conventions

- **`packages/shared` and `packages/theme` are compiled.** They export from `dist/`, so
  relative imports inside them need explicit `.js` extensions, and a consumer sees stale
  types until that package is rebuilt.
- **Express 5 types `req.params` as `string | string[]`.** Wrap in `String(...)`.
- **Money is always integer paise.** Rupees exist only in form inputs; convert at the edge
  with `rupeesToPaise`. Never store or compute a float.
- **Totals are computed server-side.** Never trust a client-supplied `totalEstimatedPaise`
  or `status` — an athlete must not be able to inflate an ask or self-approve.
- **Coordinator authority runs through one chokepoint.** Everything goes via
  `assertCoordinatorCovers` in `coordinator.service.ts`. Do not query `Request` from a
  route and act on it. Out-of-scope and non-existent return the *same* 403 so the API
  cannot be used to enumerate records.
- **Admins are a safety net, not a bypass.** They may only decide requests in villages with
  no active coordinator (`409 HAS_COORDINATOR` otherwise), and doing so does not verify the
  athlete — a coordinator vouching is a neighbour; an admin is not.
- **Minors are never indexed.** `isIndexableAthlete()` fails closed and gates both
  `sitemap.ts` and per-page robots meta. Keep the two agreeing.

## Deploying

```sh
./devops/build.sh 0.3.1 && ./devops/deploy.sh 0.3.1
```

Bump the root `package.json` version first — reusing a tag overwrites the image currently
running and destroys the rollback target. Images ship over SSH by default (`gh` tokens
here lack `write:packages`).

**Known flaw:** `deploy.sh` applies migrations *before* rolling the containers, so a
schema-changing release has a window of new schema against old code. For an additive
migration this is harmless; for a destructive one, deploy the code first.

## Data

Pre-launch, everything in the database is seed data and can be freely reset — the user has
said so explicitly. That stops applying the moment real athletes exist.

Locations come from LGD codes plus the India Post PIN directory
(`prisma/data/pilot-locations.json`), resolved by PIN first and trigram-fuzzy name second.
Note the directory still uses pre-2016 district names — it says "Medak" for what is now
Sangareddy and Siddipet. Unresolved; see `docs/architecture/v2-village-model.md`.
