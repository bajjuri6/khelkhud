#!/usr/bin/env bash
# Shared config + helpers, sourced by every devops script. ONE place for all deployment
# configuration — if you find yourself typing a resource name into a second script, it
# belongs here instead.
#
# Target shape (see DEPLOYMENT_WORKFLOW.md for the why):
#   one Azure VM in Central India running web + api + Caddy under docker compose,
#   one Azure Database for PostgreSQL Flexible Server (managed, B1ms),
#   images hosted on GitHub Container Registry (free — an Azure Container Registry
#   would add $5/mo to a budget that is already tight).

set -euo pipefail

# ---- service identity --------------------------------------------------------
SERVICE_NAME="khelkhud"
WEB_IMAGE_NAME="khelkhud-web"
API_IMAGE_NAME="khelkhud-api"

APP_PORT_WEB=3000
APP_PORT_API=4000

# ---- domain ------------------------------------------------------------------
# khelkhud.org is pending purchase (approval in progress as of 2026-08-12). Until the DNS
# A record exists, leave DOMAIN empty: Caddy then serves plain HTTP on the VM's public IP
# so the stack is testable, and `provision-dns.sh` prints what to point where. Set DOMAIN
# and re-run deploy.sh to switch on automatic Let's Encrypt TLS.
DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-bajjuri6@gmail.com}"   # Let's Encrypt registration + expiry notices

# ---- container registry ------------------------------------------------------
# GHCR, not ACR. ACR Basic is $5/mo, which is 25% of the original budget for a registry
# that will hold two images. GHCR is free for this repo and needs only a PAT with
# write:packages. Owner must be lowercase — GHCR rejects uppercase paths.
GHCR_OWNER="${GHCR_OWNER:-bajjuri6}"
REGISTRY="ghcr.io/${GHCR_OWNER}"

# ---- azure -------------------------------------------------------------------
# Central India: nearest region to Telangana (the entire initial user base) and the
# cheapest of the Indian regions for both the VM and Flexible Server SKUs.
AZ_SUBSCRIPTION="${AZ_SUBSCRIPTION:-2d975288-b362-47ae-affb-f21b04620dba}"  # Microsoft Azure Sponsorship
AZ_LOCATION="${AZ_LOCATION:-centralindia}"
AZ_RG="${AZ_RG:-khelkhud-rg}"

# VM. Standard_B2pls_v2 is ARM (Ampere): 2 vCPU / 4 GB at ~$16.35/mo, the best
# RAM-per-rupee in the burstable family and ~$1.60/mo cheaper than the AMD equivalent.
#
# ARM is chosen deliberately because the only machine that builds these images is an
# Apple Silicon Mac, so linux/arm64 builds are NATIVE and fast. Cross-building amd64
# under QEMU makes a Next.js build roughly ten times slower.
#
# If you ever need to build on an x86 CI runner, switch BOTH of these together:
#   VM_SIZE=Standard_B2als_v2   BUILD_PLATFORM=linux/amd64
# A mismatch produces a container that exits immediately with "exec format error".
VM_SIZE="${VM_SIZE:-Standard_B2pls_v2}"
VM_NAME="${VM_NAME:-khelkhud-app}"
VM_ADMIN="${VM_ADMIN:-azureuser}"
VM_IMAGE="${VM_IMAGE:-Canonical:ubuntu-24_04-lts:server-arm64:latest}"
VM_OS_DISK_GB="${VM_OS_DISK_GB:-32}"
VM_OS_DISK_SKU="${VM_OS_DISK_SKU:-StandardSSD_LRS}"
BUILD_PLATFORM="${BUILD_PLATFORM:-linux/arm64}"

SSH_KEY="${SSH_KEY:-$HOME/.ssh/khelkhud-deploy}"

# PostgreSQL Flexible Server. B1ms (1 vCore / 2 GiB) + 32 GB is the smallest managed
# configuration Azure sells: ~$17.89 compute + ~$4.19 storage. Backup retention up to the
# provisioned storage size is included at no charge, which is where point-in-time restore
# comes from.
PG_SERVER="${PG_SERVER:-khelkhud-pg}"
PG_SKU="${PG_SKU:-Standard_B1ms}"
PG_TIER="${PG_TIER:-Burstable}"
PG_VERSION="${PG_VERSION:-16}"
PG_STORAGE_GB="${PG_STORAGE_GB:-32}"
PG_BACKUP_RETENTION_DAYS="${PG_BACKUP_RETENTION_DAYS:-7}"
PG_ADMIN_USER="${PG_ADMIN_USER:-khelkhud}"
PG_DATABASE="${PG_DATABASE:-khelkhud}"

# Storage account for pg_dump archives and uploaded-file backups. Lowercase alphanumeric
# only, 3-24 chars — Azure rejects anything else.
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-khelkhudbackups}"
BACKUP_CONTAINER="${BACKUP_CONTAINER:-backups}"

# Where the compose stack lives on the VM.
REMOTE_DIR="/opt/khelkhud"

# ---- helpers -----------------------------------------------------------------
# Log to stderr so helpers whose stdout is command-substituted stay clean.
info() { printf '\033[36m[info]\033[0m %s\n' "$*" >&2; }
ok()   { printf '\033[32m[ ok ]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[33m[warn]\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[31m[err ]\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

confirm() {
  local prompt="${1:-Continue?}"
  read -r -p "$prompt [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || die "Aborted."
}

repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
}

current_version() {
  node -p "require('$(repo_root)/package.json').version"
}

az_cli() {
  az --subscription "$AZ_SUBSCRIPTION" "$@"
}

assert_azure_login() {
  require_cmd az
  az account show >/dev/null 2>&1 || die "Not logged in. Run: az login"
  az account show --subscription "$AZ_SUBSCRIPTION" >/dev/null 2>&1 \
    || die "Subscription $AZ_SUBSCRIPTION not accessible by this account."
}

# Public IP of the app VM. Empty string if the VM does not exist yet, so callers can
# branch rather than crashing on a half-provisioned environment.
vm_public_ip() {
  az_cli vm show -d -g "$AZ_RG" -n "$VM_NAME" \
    --query publicIps -o tsv 2>/dev/null || true
}

# The operator's current egress IP. The SSH and Postgres firewall rules are pinned to it,
# and home/office IPs rotate, so every script that needs access refreshes the rule.
my_ip() {
  curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null \
    || die "Could not determine your public IP (needed for the SSH/Postgres firewall rules)."
}

ssh_vm() {
  local host
  host="$(vm_public_ip)"
  [[ -n "$host" ]] || die "VM $VM_NAME has no public IP — has provision-vm.sh run?"
  ssh -i "$SSH_KEY" \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=15 \
      "${VM_ADMIN}@${host}" "$@"
}

scp_vm() {
  local host src dest
  src="$1"; dest="$2"
  host="$(vm_public_ip)"
  [[ -n "$host" ]] || die "VM $VM_NAME has no public IP — has provision-vm.sh run?"
  scp -i "$SSH_KEY" \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=15 \
      "$src" "${VM_ADMIN}@${host}:${dest}"
}
