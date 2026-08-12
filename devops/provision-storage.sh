#!/usr/bin/env bash
# Provision the Blob Storage account that holds backups, and mint the SAS URL the VM uses
# to upload them.
#
# Cool tier, LRS, with a lifecycle rule that deletes blobs after 90 days. At the volume
# this project generates (a few hundred MB a month) the bill is in cents; the lifecycle
# rule exists so it stays that way without anyone remembering to prune.
#
# Idempotent. Re-run to mint a fresh SAS when the old one nears expiry.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

assert_azure_login

az_cli group exists -n "$AZ_RG" | grep -q true \
  || die "Resource group ${AZ_RG} missing — run ./devops/provision-vm.sh first."

if az_cli storage account show -g "$AZ_RG" -n "$STORAGE_ACCOUNT" -o none 2>/dev/null; then
  info "Storage account ${STORAGE_ACCOUNT} exists"
else
  info "Creating storage account ${STORAGE_ACCOUNT}"
  az_cli storage account create \
    --resource-group "$AZ_RG" \
    --name "$STORAGE_ACCOUNT" \
    --location "$AZ_LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --access-tier Cool \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    -o none
  ok "Storage account created"
fi

KEY="$(az_cli storage account keys list -g "$AZ_RG" -n "$STORAGE_ACCOUNT" \
  --query "[0].value" -o tsv)"

if az_cli storage container exists --account-name "$STORAGE_ACCOUNT" --account-key "$KEY" \
     -n "$BACKUP_CONTAINER" --query exists -o tsv | grep -q true; then
  info "Container ${BACKUP_CONTAINER} exists"
else
  az_cli storage container create \
    --account-name "$STORAGE_ACCOUNT" --account-key "$KEY" \
    -n "$BACKUP_CONTAINER" --public-access off -o none
  ok "Container ${BACKUP_CONTAINER} created"
fi

# 90-day lifecycle. Without it, backups accumulate forever and the "few cents" becomes a
# line item worth investigating in about two years.
info "Applying the 90-day delete lifecycle rule"
POLICY="$(mktemp)"
cat > "$POLICY" <<EOF
{
  "rules": [{
    "enabled": true,
    "name": "expire-backups",
    "type": "Lifecycle",
    "definition": {
      "actions": { "baseBlob": { "delete": { "daysAfterModificationGreaterThan": 90 } } },
      "filters": { "blobTypes": ["blockBlob"], "prefixMatch": ["${BACKUP_CONTAINER}/"] }
    }
  }]
}
EOF
az_cli storage account management-policy create \
  --account-name "$STORAGE_ACCOUNT" -g "$AZ_RG" --policy @"$POLICY" -o none
rm -f "$POLICY"
ok "Lifecycle rule applied"

# Write-only SAS, one year. Write+create but NOT read or delete: if the VM is ever
# compromised, the token cannot be used to read or destroy the backups it produced.
EXPIRY="$(date -u -v+1y '+%Y-%m-%dT%H:%MZ' 2>/dev/null || date -u -d '+1 year' '+%Y-%m-%dT%H:%MZ')"
SAS="$(az_cli storage container generate-sas \
  --account-name "$STORAGE_ACCOUNT" --account-key "$KEY" \
  -n "$BACKUP_CONTAINER" --permissions cw --expiry "$EXPIRY" -o tsv)"

echo
ok "Backup storage ready"
cat <<EOF

Add this line to ${REMOTE_DIR}/.env on the VM, then run ./devops/backup.sh --install-cron:

    BACKUP_SAS_URL=https://${STORAGE_ACCOUNT}.blob.core.windows.net/${BACKUP_CONTAINER}?${SAS}

The token is write+create only (no read, no delete) and expires ${EXPIRY}.
Re-run this script to mint a new one before then.

Restore, when you need it:
    az storage blob download --account-name ${STORAGE_ACCOUNT} -c ${BACKUP_CONTAINER} \\
      -n db-<stamp>.dump -f ./restore.dump --account-key '<key>'
    pg_restore --no-owner --no-acl -d "\$DATABASE_URL" ./restore.dump
EOF
