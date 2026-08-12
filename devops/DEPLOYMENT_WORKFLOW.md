# Deployment Workflow — khelkhud

One Azure VM in Central India running `web`, `api` and `caddy` under docker compose, in
front of a managed Azure Database for PostgreSQL Flexible Server. Images live on GitHub
Container Registry. Build on your Mac, push to GHCR, roll the stack over SSH.

Target domain: **khelkhud.org** (purchase pending approval as of 2026-08-12). Everything
below works before the domain exists — the stack serves plain HTTP on the VM's public IP
until `DOMAIN` is set.

---

## Read this first: what was actually there

The plan assumed an existing Azure VM to deploy alongside. There isn't one.

Subscription `Microsoft Azure Sponsorship` (2d975288…) contains exactly two VMs:

| VM | State | What it is |
|---|---|---|
| `kt-win-build-x64` | deallocated | Windows x64 build agent |
| `raviga-visual-ml` | deallocated | ML box |

Neither is a Linux app server, and there is no App Service, Container App, AKS cluster or
ACR anywhere in the subscription. The "existing instance with other services" is the nybr
EC2 box, which lives in a **separate AWS account** (099771437951) and cannot be shared
from here.

So khelkhud is provisioned fresh. Nothing was reused, and nothing existing is at risk.

---

## What it costs

Central India list prices, pulled from the Azure retail API on 2026-08-12.

| Resource | SKU | $/mo |
|---|---|---|
| VM | `Standard_B2pls_v2` — ARM, 2 vCPU, 4 GB | 16.35 |
| OS disk | 32 GB StandardSSD (E4) + mount | 3.00 |
| Static public IP | Standard | ~3.65 |
| PostgreSQL compute | Flexible Server `Standard_B1ms`, 1 vCore / 2 GiB | 17.89 |
| PostgreSQL storage | 32 GB | 4.19 |
| Backups (Blob, Cool LRS) | a few hundred MB | ~0.05 |
| GHCR | two private images | 0.00 |
| **Total** | | **~$45/mo** |

This is **above the original $20 ceiling**, which you accepted in exchange for managed
Postgres — patching, and 7-day point-in-time restore. The $20 shape was one VM running
Postgres in a container at ~$23/mo.

Ways down, if the bill matters later:

- **1-year reserved instance on the VM** — roughly 35–40% off compute, about **−$6/mo**.
  No downside beyond the commitment.
- **Drop the static IP** and use a DNS provider with a dynamic-update API: −$3.65/mo,
  and a new failure mode. Not worth it.
- **Move Postgres onto the VM** — back to ~$23/mo total, and you lose PITR. Only sensible
  if `backup.sh` is proven and you accept a nightly RPO.
- This is a **Sponsorship** subscription. If it still carries credit, the cash cost is
  zero and none of the above matters.

---

## One-time setup

Run in order. Every script is idempotent; re-running is the supported way to refresh
firewall rules after your IP changes.

```sh
az login
az account set --subscription 2d975288-b362-47ae-affb-f21b04620dba

./devops/provision-vm.sh          # RG, SSH key, VM + cloud-init (Docker), static IP, NSG
./devops/provision-postgres.sh    # Flexible Server B1ms  ← PRINTS THE ADMIN PASSWORD ONCE
./devops/provision-storage.sh     # backup blob container + a write-only SAS
./devops/bootstrap-env.sh         # writes /opt/khelkhud/.env on the VM (interactive)
./devops/backup.sh --install-cron # nightly 02:30 IST
```

`provision-postgres.sh` prints the generated admin password **exactly once**. Azure will
not show it again. Put it in your password manager before pressing anything else.

Then create the Google OAuth client (Web type) with the redirect URI that
`bootstrap-env.sh` prints, and ship:

```sh
export GHCR_TOKEN=ghp_...   # classic PAT, write:packages
./devops/build.sh
./devops/push.sh
./devops/deploy.sh
```

---

## Shipping a change

```sh
git add . && git commit -m "feat(web): ..."
./devops/build.sh patch        # bump, then build both images
./devops/push.sh
./devops/deploy.sh
git push origin main
```

`deploy.sh` refreshes the SSH firewall rule, copies `compose.prod.yml` and `Caddyfile`,
pulls the images, runs `prisma migrate deploy` **before** starting the new containers, then
rolls the stack and polls `/api/health`. If migrations fail it aborts without touching the
running containers.

Build one image only when that is all that changed:

```sh
./devops/build.sh --web-only && ./devops/push.sh && ./devops/deploy.sh
```

---

## Turning on the domain

`NEXT_PUBLIC_SITE_URL` is baked into the client bundle at build time, so switching domains
means a rebuild, not just a redeploy.

```sh
./devops/provision-dns.sh              # prints the A records to create at the registrar
# ... create them, wait for propagation ...
./devops/provision-dns.sh --verify     # must pass BEFORE you enable TLS

export DOMAIN=khelkhud.org
./devops/bootstrap-env.sh              # rewrites WEB_URL / API_URL to https://khelkhud.org
./devops/build.sh && ./devops/push.sh && ./devops/deploy.sh
```

Verify DNS first. Let's Encrypt rate-limits failed authorisations to 5 per hostname per
week, and a redeploy loop against a domain that doesn't resolve will exhaust that quickly.
There is a staging-CA line commented into the `Caddyfile` for testing.

Also update, or sign-in and payments break:

- Google Cloud Console → authorised origin `https://khelkhud.org`, redirect URI
  `https://khelkhud.org/api/auth/google/callback`
- Razorpay → webhook `https://khelkhud.org/api/webhooks/razorpay`

---

## How requests flow

The browser only ever sees one origin. Caddy dispatches by path:

```
  /api/*   ->  api:4000      Express
  /*       ->  web:3000      Next.js standalone server
```

Two consequences worth knowing:

- **No CORS in production.** `NEXT_PUBLIC_API_URL` is built as an *empty string*, so the
  browser sends relative `/api/*` requests. Note that empty and unset differ:
  `lib/api.ts` reads `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"`, which an
  empty string satisfies and an unset variable does not. Unset it and every production
  browser calls localhost.
- **The session cookie is first-party**, so no SameSite=None or third-party-cookie
  problems.

Server-side rendering skips Caddy entirely and calls `http://api:4000` over the compose
network (`API_URL` in `compose.prod.yml`) — one less hop, and it keeps working during a
certificate renewal.

---

## Architecture decisions

**One VM, not container orchestration.** Container Apps and AKS both cost more than the
entire budget for a service with no traffic yet. A VM with compose is boring, cheap, and
debuggable over SSH.

**Two images, not one.** Next.js and Express each want their own process and their own
restart semantics. A single container would mean an API crash taking the marketing site
with it — the tradeoff Kautilya accepted, and it makes less sense here where the public
site is doing the acquisition work.

**GHCR, not ACR.** ACR Basic is $5/mo for two images. GHCR is free, the repo is already on
GitHub, and the only cost is a classic PAT.

**ARM (`Standard_B2pls_v2`), not x86.** Best RAM-per-rupee in the burstable family, and the
only build machine is an Apple Silicon Mac, so `linux/arm64` builds are native. Cross-
building amd64 under QEMU makes the Next.js build roughly ten times slower. If you ever
build on an x86 CI runner, flip `VM_SIZE` **and** `BUILD_PLATFORM` in `_lib.sh` together —
a mismatch produces a container that exits instantly with `exec format error`.

**Postgres public endpoint + firewall allowlist, not VNet integration.** The allowlist is
two entries: the VM's static IP and the operator's current IP. VNet integration is tighter
but makes the database unreachable from a laptop, which matters a lot for a one-person
project that will need `psql` at 2am.

**Secrets live only on the VM**, in `/opt/khelkhud/.env` (mode 600), written by
`bootstrap-env.sh`. Not in git, not in the build context, not in any image. Key Vault plus
a managed identity is the upgrade path when there is more than one operator.

**Uploads on a docker volume, not object storage.** The API ships `local` and `s3` drivers
and no Azure Blob driver. S3 would mean an AWS account for one bucket; writing a Blob
driver is real work. The volume is backed up nightly. Revisit when uploads outgrow the
disk or a second app server is needed — that is the point at which local storage actually
breaks.

---

## Operations

```sh
# shell on the box
ssh -i ~/.ssh/khelkhud-deploy azureuser@$(az vm show -d -g khelkhud-rg -n khelkhud-app --query publicIps -o tsv)

# logs
cd /opt/khelkhud && docker compose -f compose.prod.yml logs -f api
docker compose -f compose.prod.yml logs -f caddy   # TLS issuance lives here

# psql (your IP must be in the Postgres firewall — re-run provision-postgres.sh)
psql "$(grep '^DATABASE_URL=' /opt/khelkhud/.env | cut -d= -f2-)"

# backup now
./devops/backup.sh

# roll back: images are tagged by version and GHCR keeps them
./devops/deploy.sh 1.1.0
```

**Rollback caveat:** `deploy.sh` re-runs `prisma migrate deploy`, which only moves
forward. Rolling the *image* back does not roll the *schema* back. If a release included a
destructive migration, restore the database from the pg_dump instead — see the restore
command printed by `provision-storage.sh`.

---

## Troubleshooting

**`exec format error` on container start.** Architecture mismatch. The VM is ARM and the
image was built for amd64, or vice versa. Check `BUILD_PLATFORM` against `VM_SIZE`.

**Build fails at `next build`.** Run it locally first: `NODE_ENV=production pnpm --filter
@khelkhud/web exec next build`. Note the `NODE_ENV` — a `NODE_ENV=development` inherited
from your shell makes the production build fail during `/500` prerendering with the
famously unhelpful `<Html> should not be imported outside of pages/_document`.

**API boots then exits.** Almost always env validation: `config.ts` prints the failing
keys and calls `process.exit(1)`. `docker compose logs api` shows exactly which.

**API can't reach the database.** The VM's IP is not in the Postgres firewall. Re-run
`./devops/provision-postgres.sh`. Also confirm `sslmode=require` is on the connection
string — Flexible Server rejects unencrypted connections.

**Certificates won't issue.** `docker compose logs caddy`. Check DNS resolves to the VM
(`./devops/provision-dns.sh --verify`), that NSG ports 80 and 443 are open, and that you
have not exhausted the Let's Encrypt rate limit.

**Site up, styles missing.** The theme CSS is generated from `tokens.ts`. `Dockerfile.web`
runs `pnpm --filter @khelkhud/theme build` before `next build` for exactly this reason —
if you have restructured that stage, confirm it still runs.

**Disk filling up.** cloud-init installs a weekly `docker image prune`. Check it:
`cat /etc/cron.d/khelkhud-prune`, then `docker system df`.
