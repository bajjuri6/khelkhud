#!/usr/bin/env bash
# Provision Azure Database for PostgreSQL Flexible Server — the managed database.
#
# SKU: Standard_B1ms (1 vCore / 2 GiB) + 32 GB, the smallest managed configuration Azure
# sells. ~$17.89/mo compute + ~$4.19/mo storage in Central India. Backup retention up to
# the provisioned storage size is included, which is where point-in-time restore comes
# from — that, plus patching, is what the money buys over a Postgres container.
#
# Access model: public endpoint with a firewall allowlist, not VNet integration. The
# allowlist is exactly two entries — the app VM's static IP and the operator's current IP.
# VNet integration would be tighter, but it also makes the database unreachable from a
# laptop, which matters a great deal for a one-person project that will need psql at 2am.
#
# Idempotent. Re-run it after your IP rotates to refresh the operator firewall rule.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

assert_azure_login

az_cli group exists -n "$AZ_RG" | grep -q true \
  || die "Resource group ${AZ_RG} missing — run ./devops/provision-vm.sh first."

MY_IP="$(my_ip)"
VM_IP="$(vm_public_ip)"
[[ -n "$VM_IP" ]] || warn "App VM has no public IP yet; its firewall rule will be skipped."

# ---- server ------------------------------------------------------------------
if az_cli postgres flexible-server show -g "$AZ_RG" -n "$PG_SERVER" -o none 2>/dev/null; then
  info "Flexible Server ${PG_SERVER} already exists — skipping creation"
  PG_PASSWORD=""
else
  # Generated here and shown exactly once. Azure will not reveal it again; the only other
  # recovery path is `az postgres flexible-server update --admin-password`.
  # NOT `tr -dc ... </dev/urandom | head -c 32`: head exits after 32 bytes, tr dies on
  # SIGPIPE, and under `set -o pipefail` that non-zero status kills the script — silently,
  # right after the password is generated and before anything is created.
  # `cut` reads its input to EOF, so no SIGPIPE. The Kk/9 bookends guarantee Azure's
  # complexity rule (3 of upper/lower/digit/special) regardless of what random produces.
  PG_PASSWORD="Kk$(openssl rand -base64 48 | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-28)9"

  info "Creating ${PG_SERVER} (${PG_SKU}, ${PG_STORAGE_GB}GB, PG${PG_VERSION}). Takes 5-10 minutes."
  az_cli postgres flexible-server create \
    --resource-group "$AZ_RG" \
    --name "$PG_SERVER" \
    --location "$AZ_LOCATION" \
    --tier "$PG_TIER" \
    --sku-name "$PG_SKU" \
    --version "$PG_VERSION" \
    --storage-size "$PG_STORAGE_GB" \
    --backup-retention "$PG_BACKUP_RETENTION_DAYS" \
    --admin-user "$PG_ADMIN_USER" \
    --admin-password "$PG_PASSWORD" \
    --database-name "$PG_DATABASE" \
    --public-access None \
    --yes \
    -o none
  ok "Flexible Server created"
fi

PG_HOST="$(az_cli postgres flexible-server show -g "$AZ_RG" -n "$PG_SERVER" \
  --query fullyQualifiedDomainName -o tsv)"

# ---- extension allow-list -----------------------------------------------------
#
# Azure Flexible Server gates CREATE EXTENSION behind the `azure.extensions` server
# parameter, SEPARATELY from whether the extension is available. Querying
# pg_available_extensions shows all three as present and tells you nothing about whether
# you may create them — which is exactly how the village_search migration got written,
# reviewed, tested locally, and then failed in production with
# "extension pg_trgm is not allow-listed for users".
#
# Set at provisioning time so a fresh environment never repeats that. Dynamic parameter,
# so no restart and no downtime.
#
#   pg_trgm        trigram similarity + the GIN index behind village search
#   unaccent       diacritic folding in the match score
#   fuzzystrmatch  transliteration tolerance
info "Allow-listing the extensions village search needs"
az_cli postgres flexible-server parameter set \
  --resource-group "$AZ_RG" --server-name "$PG_SERVER" \
  --name azure.extensions --value "PG_TRGM,UNACCENT,FUZZYSTRMATCH" \
  -o none \
  && ok "azure.extensions set" \
  || warn "Could not set azure.extensions — the village_search migration will fail until it is."

# ---- firewall ----------------------------------------------------------------
add_fw_rule() {
  local name="$1" ip="$2"
  az_cli postgres flexible-server firewall-rule create \
    --resource-group "$AZ_RG" --name "$PG_SERVER" --rule-name "$name" \
    --start-ip-address "$ip" --end-ip-address "$ip" -o none 2>/dev/null \
  && ok "Firewall rule ${name} -> ${ip}" \
  || {
    az_cli postgres flexible-server firewall-rule update \
      --resource-group "$AZ_RG" --name "$PG_SERVER" --rule-name "$name" \
      --start-ip-address "$ip" --end-ip-address "$ip" -o none
    ok "Firewall rule ${name} updated -> ${ip}"
  }
}

add_fw_rule "operator" "$MY_IP"
[[ -n "$VM_IP" ]] && add_fw_rule "app-vm" "$VM_IP"

echo
ok "PostgreSQL ready at ${PG_HOST}"

if [[ -n "$PG_PASSWORD" ]]; then
  cat <<EOF

  ─────────────────────────────────────────────────────────────────────────────
  ADMIN PASSWORD — SHOWN ONCE. Azure will not display it again.
  Put it in your password manager now, then into the VM's .env as DATABASE_URL.

      ${PG_PASSWORD}

  DATABASE_URL for .env (sslmode=require is enforced by the server, not optional):

      postgresql://${PG_ADMIN_USER}:${PG_PASSWORD}@${PG_HOST}:5432/${PG_DATABASE}?sslmode=require

  ─────────────────────────────────────────────────────────────────────────────
EOF
else
  cat <<EOF

  Server already existed, so no password was generated. The connection string shape is:

      postgresql://${PG_ADMIN_USER}:<password>@${PG_HOST}:5432/${PG_DATABASE}?sslmode=require

  Lost the password? Reset it:
      az postgres flexible-server update -g ${AZ_RG} -n ${PG_SERVER} --admin-password '<new>'
EOF
fi
