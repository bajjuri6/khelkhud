#!/usr/bin/env bash
# Print the DNS records khelkhud.org needs, and verify them once they exist.
#
# This script deliberately does NOT create anything. khelkhud.org is still being purchased
# (approval in progress as of 2026-08-12) and the registrar is not yet known, so there is
# no zone to write to. Azure DNS would also add ~$0.50/mo for a hosted zone that the
# registrar's own nameservers can host for free — use the registrar's DNS unless there is
# a reason not to.
#
# Usage:
#   ./devops/provision-dns.sh           # show the records to create
#   ./devops/provision-dns.sh --verify  # check that they resolve to this VM

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

assert_azure_login

VM_IP="$(vm_public_ip)"
[[ -n "$VM_IP" ]] || die "VM ${VM_NAME} not found — run ./devops/provision-vm.sh first."

TARGET_DOMAIN="${DOMAIN:-khelkhud.org}"

if [[ "${1:-}" == "--verify" ]]; then
  require_cmd dig
  fail=0
  for host in "$TARGET_DOMAIN" "www.${TARGET_DOMAIN}"; do
    got="$(dig +short A "$host" | tail -n1)"
    if [[ "$got" == "$VM_IP" ]]; then
      ok "${host} -> ${got}"
    elif [[ -z "$got" ]]; then
      err "${host} does not resolve yet (propagation can take up to an hour)"
      fail=1
    else
      err "${host} -> ${got}, expected ${VM_IP}"
      fail=1
    fi
  done
  [[ $fail -eq 0 ]] || die "DNS is not ready. Do not enable TLS yet — failed ACME attempts count against Let's Encrypt's per-hostname weekly limit."
  echo
  ok "DNS is ready. Enable TLS with:"
  echo "    DOMAIN=${TARGET_DOMAIN} ./devops/bootstrap-env.sh   # rewrites WEB_URL / API_URL"
  echo "    DOMAIN=${TARGET_DOMAIN} ./devops/build.sh           # NEXT_PUBLIC_SITE_URL bakes in at build time"
  echo "    DOMAIN=${TARGET_DOMAIN} ./devops/push.sh"
  echo "    DOMAIN=${TARGET_DOMAIN} ./devops/deploy.sh"
  exit 0
fi

cat <<EOF

Create these at the registrar for ${TARGET_DOMAIN}:

  TYPE   NAME    VALUE              TTL
  ────   ────    ─────              ───
  A      @       ${VM_IP}      300
  A      www     ${VM_IP}      300

Use a short TTL (300s) until things are stable — it makes a mistake cheap to correct.

The public IP is static and allocated to this resource group, so it survives a VM
stop/deallocate. It does NOT survive deleting the VM's network interface, so if you ever
rebuild the VM, check the IP before assuming these records are still correct.

No CNAME for www: it is an A record here so both names resolve independently, and Caddy
301s www to the apex.

Then verify before switching on TLS:

  ./devops/provision-dns.sh --verify

Nothing about TLS is manual — Caddy obtains and renews the certificates itself once
DOMAIN is set and the records resolve.
EOF
