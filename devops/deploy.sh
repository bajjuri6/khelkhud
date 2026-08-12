#!/usr/bin/env bash
# Roll the stack on the Azure VM: refresh the SSH firewall rule, ship the compose files,
# pull the new images, run migrations, then restart the app containers.
#
# Usage:
#   ./devops/deploy.sh              # current version from package.json
#   ./devops/deploy.sh 1.2.0
#   ./devops/deploy.sh --skip-migrate
#
# The VM's .env is NOT managed by this script. It is written once by
# ./devops/bootstrap-env.sh and lives only on the VM at /opt/khelkhud/.env — secrets
# never enter this repo, the build context, or the image.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

require_cmd ssh
require_cmd scp
assert_azure_login

SKIP_MIGRATE=0
VERSION=""
for arg in "$@"; do
  case "$arg" in
    --skip-migrate) SKIP_MIGRATE=1 ;;
    *)              VERSION="$arg" ;;
  esac
done
VERSION="${VERSION:-$(current_version)}"

VM_IP="$(vm_public_ip)"
[[ -n "$VM_IP" ]] || die "VM ${VM_NAME} not found — run ./devops/provision-vm.sh first."

# SSH is pinned to the operator's IP, which rotates. Refresh it every deploy rather than
# discovering it is stale halfway through one.
MY_IP="$(my_ip)"
NSG="$(az_cli network nsg list -g "$AZ_RG" --query "[0].name" -o tsv)"
if [[ -n "$NSG" && "$NSG" != "None" ]]; then
  az_cli network nsg rule update -g "$AZ_RG" --nsg-name "$NSG" -n allow-ssh-operator \
    --source-address-prefixes "${MY_IP}/32" -o none 2>/dev/null \
    && info "SSH rule refreshed for ${MY_IP}" \
    || warn "Could not refresh the SSH rule — continuing; it may already match."
fi

info "Deploying ${VERSION} to ${VM_ADMIN}@${VM_IP}"

ssh_vm "test -f ${REMOTE_DIR}/.env" \
  || die "${REMOTE_DIR}/.env is missing on the VM. Run ./devops/bootstrap-env.sh first."

# ---- ship the compose files --------------------------------------------------
info "Copying compose.prod.yml and Caddyfile"
scp_vm "$(dirname "${BASH_SOURCE[0]}")/compose.prod.yml" "${REMOTE_DIR}/compose.prod.yml"
scp_vm "$(dirname "${BASH_SOURCE[0]}")/Caddyfile"        "${REMOTE_DIR}/Caddyfile"

# ---- derive the Caddy site address -------------------------------------------
# Empty DOMAIN -> plain HTTP on the bare IP. Set -> apex + www with automatic TLS.
if [[ -n "$DOMAIN" ]]; then
  SITE_ADDRESS="${DOMAIN} www.${DOMAIN}"
  info "TLS enabled for ${DOMAIN} (+ www)"
else
  SITE_ADDRESS=":80"
  warn "DOMAIN is unset — serving plain HTTP on ${VM_IP}. Set DOMAIN once khelkhud.org resolves."
fi

# Deploy-time variables go in .deploy.env, which compose reads via --env-file. They are
# kept OUT of the app's .env so that a redeploy can change the version or the domain
# without any risk of rewriting the file that holds the secrets.
ssh_vm "cat > ${REMOTE_DIR}/.deploy.env" <<EOF
REGISTRY=${REGISTRY}
VERSION=${VERSION}
DOMAIN=${DOMAIN:-domain.invalid}
SITE_ADDRESS=${SITE_ADDRESS}
ADMIN_EMAIL=${ADMIN_EMAIL}
EOF

COMPOSE="docker compose --env-file ${REMOTE_DIR}/.deploy.env -f ${REMOTE_DIR}/compose.prod.yml"

# ---- registry login on the VM ------------------------------------------------
# The packages are private, so the VM needs credentials to pull. Piped over the existing
# SSH session and never written to the VM's shell history.
TOKEN="${GHCR_TOKEN:-${CR_PAT:-}}"
if [[ -n "$TOKEN" ]]; then
  info "Logging the VM in to ghcr.io"
  printf '%s' "$TOKEN" | ssh_vm "docker login ghcr.io -u ${GHCR_OWNER} --password-stdin >/dev/null" \
    || die "GHCR login failed on the VM."
else
  warn "GHCR_TOKEN unset — relying on a login the VM already has."
fi

info "Pulling ${VERSION}"
ssh_vm "cd ${REMOTE_DIR} && ${COMPOSE} pull web api"

# ---- migrations --------------------------------------------------------------
# Before the new containers start, so the schema is never behind the code that queries it.
# `prisma migrate deploy` applies only pending migrations and is a no-op when there are
# none, which makes it safe on every deploy.
if [[ $SKIP_MIGRATE -eq 0 ]]; then
  info "Applying database migrations"
  ssh_vm "cd ${REMOTE_DIR} && ${COMPOSE} --profile migrate run --rm migrate" \
    || die "Migrations failed — the running stack was NOT touched. Fix and re-run."
  ok "Migrations applied"
else
  warn "Skipping migrations (--skip-migrate)"
fi

# ---- roll ---------------------------------------------------------------------
info "Starting the stack"
ssh_vm "cd ${REMOTE_DIR} && ${COMPOSE} up -d --remove-orphans"

# ---- verify --------------------------------------------------------------------
info "Waiting for health"
for i in $(seq 1 30); do
  if ssh_vm "curl -fsS http://localhost/api/health >/dev/null 2>&1"; then
    ok "API healthy"
    break
  fi
  [[ $i -eq 30 ]] && {
    err "API did not become healthy within 60s. Recent logs:"
    ssh_vm "cd ${REMOTE_DIR} && ${COMPOSE} logs --tail=60 api caddy" || true
    die "Deploy failed health check."
  }
  sleep 2
done

ssh_vm "cd ${REMOTE_DIR} && ${COMPOSE} ps"

echo
ok "Deployed ${VERSION}"
if [[ -n "$DOMAIN" ]]; then
  echo "  https://${DOMAIN}"
  echo "  Certificates can take ~30s on the first request for a new hostname."
else
  echo "  http://${VM_IP}"
fi
