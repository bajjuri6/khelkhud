#!/usr/bin/env bash
# Nightly backup: a pg_dump of the database and a tarball of the uploads volume, both
# pushed to Azure Blob Storage.
#
# Usage:
#   ./devops/backup.sh                 # run one backup now, from your laptop
#   ./devops/backup.sh --install-cron  # install it on the VM to run nightly at 02:30 IST
#
# Why bother, given Flexible Server already has 7-day point-in-time restore?
#   - PITR only covers the database. Receipts and profile photos live on a docker volume
#     on the VM and are covered by nothing at all.
#   - PITR is trapped inside the Azure server resource. If the server is deleted — by an
#     expired sponsorship subscription, or by a mistake — the backups go with it. A
#     pg_dump in Blob Storage restores anywhere.
#   - Blob is priced in cents at this volume. There is no reason not to.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

MODE="${1:-run}"

# ---- install the cron job on the VM ------------------------------------------
if [[ "$MODE" == "--install-cron" ]]; then
  assert_azure_login
  info "Installing the nightly backup cron on the VM"

  scp_vm "$(dirname "${BASH_SOURCE[0]}")/backup.sh" "${REMOTE_DIR}/backup.sh"
  ssh_vm "chmod +x ${REMOTE_DIR}/backup.sh"

  # 02:30 IST = 21:00 UTC. Azure VMs run UTC unless told otherwise.
  ssh_vm "sudo tee /etc/cron.d/khelkhud-backup >/dev/null" <<EOF
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
0 21 * * * ${VM_ADMIN} ${REMOTE_DIR}/backup.sh --on-vm >> /var/log/khelkhud-backup.log 2>&1
EOF
  ok "Cron installed. Logs: /var/log/khelkhud-backup.log on the VM."
  exit 0
fi

# ---- run on the VM ------------------------------------------------------------
# Invoked by cron with --on-vm. Everything it needs is already on the box: the .env with
# DATABASE_URL, pg_dump (installed by cloud-init), and a SAS URL for the blob container.
if [[ "$MODE" == "--on-vm" ]]; then
  set -euo pipefail
  cd "$REMOTE_DIR"
  # shellcheck disable=SC1091
  set -a; source ./.env; set +a

  STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  echo "[backup] ${STAMP} starting"

  # --no-owner / --no-acl so the dump restores into a server with a different admin role,
  # which is the whole point of having a portable copy.
  pg_dump --no-owner --no-acl --format=custom "$DATABASE_URL" > "${TMP}/db-${STAMP}.dump"
  echo "[backup] pg_dump $(du -h "${TMP}/db-${STAMP}.dump" | cut -f1)"

  # The uploads volume, read through a throwaway container so this works regardless of
  # where docker keeps its volumes.
  docker run --rm \
    -v khelkhud_api_uploads:/data:ro \
    -v "${TMP}:/out" \
    alpine tar czf "/out/uploads-${STAMP}.tar.gz" -C /data .
  echo "[backup] uploads $(du -h "${TMP}/uploads-${STAMP}.tar.gz" | cut -f1)"

  if [[ -z "${BACKUP_SAS_URL:-}" ]]; then
    echo "[backup] BACKUP_SAS_URL not set in .env — keeping local copies only" >&2
    mkdir -p "${REMOTE_DIR}/backups"
    cp "${TMP}"/*.dump "${TMP}"/*.tar.gz "${REMOTE_DIR}/backups/"
    # Local copies are a fallback, not an archive — prune hard so they cannot fill the disk.
    find "${REMOTE_DIR}/backups" -type f -mtime +3 -delete
    exit 0
  fi

  # BACKUP_SAS_URL is a container-scoped SAS: https://<acct>.blob.core.windows.net/<c>?<sas>
  base="${BACKUP_SAS_URL%%\?*}"
  sas="${BACKUP_SAS_URL#*\?}"
  for f in "${TMP}"/*; do
    name="$(basename "$f")"
    curl -fsS -X PUT -T "$f" \
      -H "x-ms-blob-type: BlockBlob" \
      "${base}/${name}?${sas}" \
      && echo "[backup] uploaded ${name}" \
      || { echo "[backup] FAILED to upload ${name}" >&2; exit 1; }
  done

  echo "[backup] ${STAMP} done"
  exit 0
fi

# ---- run once, from the operator's machine ------------------------------------
assert_azure_login
info "Running a backup on the VM now"
scp_vm "$(dirname "${BASH_SOURCE[0]}")/backup.sh" "${REMOTE_DIR}/backup.sh"
ssh_vm "chmod +x ${REMOTE_DIR}/backup.sh && ${REMOTE_DIR}/backup.sh --on-vm"
ok "Backup complete"
