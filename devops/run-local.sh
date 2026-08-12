#!/usr/bin/env bash
# Run the PRODUCTION images locally, in the production shape (Caddy in front, web and api
# behind it, one origin on :8080). This is the sanity test before pushing — it catches the
# things `pnpm dev` never will: a bad standalone trace, a missing Prisma engine, an env
# var that only existed in your shell.
#
# NOT the dev workflow. For that use ./devops/run-dev.sh.
#
# Usage:
#   ./devops/run-local.sh          # the version in package.json (same default as build.sh)
#   ./devops/run-local.sh 1.2.0
#   ./devops/run-local.sh down
#
# The database is whatever DATABASE_URL in the repo-root .env points at — normally the
# docker-compose Postgres on :5434. It does NOT touch production unless you point it there,
# so read your .env before running this against anything that matters.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

require_cmd docker
cd "$(repo_root)"

if [[ "${1:-}" == "down" ]]; then
  docker rm -f khelkhud-local-caddy khelkhud-local-web khelkhud-local-api >/dev/null 2>&1 || true
  docker network rm khelkhud-local 2>/dev/null || true
  ok "Local stack stopped"
  exit 0
fi

# Default to the version in package.json, matching build.sh / push.sh / deploy.sh. This
# used to default to `latest`, which disagreed with every sibling script and meant a bare
# `./devops/run-local.sh` failed on a tag nobody had necessarily created.
VERSION="${1:-$(current_version)}"
[[ -f .env ]] || die "No .env at the repo root — copy .env.example and fill it in."

for image in "$WEB_IMAGE_NAME" "$API_IMAGE_NAME"; do
  docker image inspect "${image}:${VERSION}" >/dev/null 2>&1 \
    || die "${image}:${VERSION} not found. Run: ./devops/build.sh ${VERSION}"
done

# The dev .env points DATABASE_URL at localhost:5434 (the docker-compose Postgres, as seen
# from the host). Inside a container `localhost` is the container itself, so the API would
# boot and then fail every query. Rewrite the host for the container's point of view.
#
# Passed with -e AFTER --env-file so it wins: later flags override env-file entries. The
# repo's .env is never modified.
DB_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2-)"
[[ -n "$DB_URL" ]] || die "DATABASE_URL missing from .env"
CONTAINER_DB_URL="${DB_URL//@localhost:/@host.docker.internal:}"
CONTAINER_DB_URL="${CONTAINER_DB_URL//@127.0.0.1:/@host.docker.internal:}"
if [[ "$CONTAINER_DB_URL" != "$DB_URL" ]]; then
  info "Rewrote DATABASE_URL host to host.docker.internal for the container"
fi

docker rm -f khelkhud-local-caddy khelkhud-local-web khelkhud-local-api >/dev/null 2>&1 || true
docker network create khelkhud-local >/dev/null 2>&1 || true

# host.docker.internal lets the API reach a Postgres running on the host (the compose one
# on :5434). Explicit --add-host because it is not automatic on Linux.
#
# WEB_URL / API_URL are overridden to :8080 because that is the single origin this stack
# actually serves. The dev .env names :3000 and :4000, which would make the API mint
# upload URLs and OAuth redirects pointing at the dev servers instead of this one.
info "Starting api"
docker run -d --name khelkhud-local-api --network khelkhud-local \
  --network-alias api \
  --add-host host.docker.internal:host-gateway \
  --env-file .env \
  -e NODE_ENV=production \
  -e API_PORT=4000 \
  -e DATABASE_URL="$CONTAINER_DB_URL" \
  -e WEB_URL="http://localhost:8080" \
  -e API_URL="http://localhost:8080" \
  "${API_IMAGE_NAME}:${VERSION}" >/dev/null

info "Starting web"
docker run -d --name khelkhud-local-web --network khelkhud-local \
  --network-alias web \
  -e NODE_ENV=production -e PORT=3000 -e API_URL=http://api:4000 \
  "${WEB_IMAGE_NAME}:${VERSION}" >/dev/null

# The repo's Caddyfile is mounted directly. An earlier version staged it into a mktemp
# directory cleaned up by an EXIT trap — which deleted the file out from under the
# still-running container, so Caddy survived on its in-memory config and then failed on
# the next restart with a missing-file error that pointed nowhere useful.
info "Starting caddy on :8080"
docker run -d --name khelkhud-local-caddy --network khelkhud-local \
  -p 8080:80 \
  -e SITE_ADDRESS=":80" -e DOMAIN="domain.invalid" -e ADMIN_EMAIL="${ADMIN_EMAIL}" \
  -v "$(repo_root)/devops/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine >/dev/null

info "Waiting for health"
for i in $(seq 1 30); do
  if curl -fsS http://localhost:8080/api/health >/dev/null 2>&1; then
    ok "Stack healthy"
    break
  fi
  [[ $i -eq 30 ]] && {
    err "Never became healthy. Logs:"
    docker logs --tail=40 khelkhud-local-api || true
    die "Local run failed."
  }
  sleep 2
done

cat <<EOF

  Site:    http://localhost:8080/
  API:     http://localhost:8080/api/health
  Logs:    docker logs -f khelkhud-local-api
  Stop:    ./devops/run-local.sh down

EOF
