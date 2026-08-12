#!/usr/bin/env bash
# Point DOMAIN at the Azure VM via Route53.
#
#   ./devops/provision-dns.sh            # show what would change (no writes)
#   ./devops/provision-dns.sh --apply    # UPSERT the A record
#   ./devops/provision-dns.sh --verify   # check it resolves to this VM
#
# kautilya.app is a BUSY PRODUCTION ZONE: Outlook mail, SPF/DKIM/DMARC, ACM validation
# CNAMEs, and several live products (ai., api., auth., www., skyhigh., tm.). This script
# therefore uses UPSERT on exactly one record name and never enumerates-and-rewrites. Do
# not "tidy" it into something that submits a batch of changes.
#
# A plain A record to the VM's IP — not an ALIAS, which only targets AWS resources, and
# not a CNAME, which would be illegal at a name that may later need other record types.
# Caddy obtains the certificate itself over HTTP-01, so no ACM validation record is needed.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

MODE="${1:-plan}"

assert_azure_login
assert_aws_login

[[ -n "$DOMAIN" ]] || die "DOMAIN is empty — nothing to point. Set it in devops/_lib.sh."

VM_IP="$(vm_public_ip)"
[[ -n "$VM_IP" ]] || die "VM ${VM_NAME} has no public IP — run ./devops/provision-vm.sh first."

ZONE_NAME="$(aws_cli route53 get-hosted-zone --id "$ROUTE53_ZONE_ID" \
  --query 'HostedZone.Name' --output text 2>/dev/null || true)"
[[ -n "$ZONE_NAME" && "$ZONE_NAME" != "None" ]] \
  || die "Hosted zone ${ROUTE53_ZONE_ID} not readable with AWS profile '${AWS_PROFILE}'."

# Guard against pointing a record in the wrong zone at our VM.
case "${DOMAIN}." in
  *".${ZONE_NAME}") : ;;
  "${ZONE_NAME}")   : ;;
  *) die "DOMAIN '${DOMAIN}' is not inside hosted zone '${ZONE_NAME%.}'." ;;
esac

current="$(aws_cli route53 list-resource-record-sets --hosted-zone-id "$ROUTE53_ZONE_ID" \
  --query "ResourceRecordSets[?Name=='${DOMAIN}.' && Type=='A'].ResourceRecords[0].Value | [0]" \
  --output text 2>/dev/null || true)"
[[ "$current" == "None" ]] && current=""

echo
info "Zone      ${ZONE_NAME%.}  (${ROUTE53_ZONE_ID})"
info "Record    ${DOMAIN}  A"
info "Current   ${current:-<none>}"
info "Target    ${VM_IP}"
echo

# ---- verify -------------------------------------------------------------------
if [[ "$MODE" == "--verify" ]]; then
  require_cmd dig
  got="$(dig +short A "$DOMAIN" | tail -n1)"
  if [[ "$got" == "$VM_IP" ]]; then
    ok "${DOMAIN} resolves to ${got}"
    echo
    echo "Safe to enable TLS. Caddy will request the certificate on the first request;"
    echo "watch it with: docker compose -f ${REMOTE_DIR}/compose.prod.yml logs -f caddy"
    exit 0
  fi
  [[ -z "$got" ]] && die "${DOMAIN} does not resolve yet. Route53 is usually <60s; recursive resolvers can cache an NXDOMAIN for longer."
  die "${DOMAIN} resolves to ${got}, expected ${VM_IP}."
fi

# ---- plan ---------------------------------------------------------------------
if [[ "$MODE" != "--apply" ]]; then
  if [[ "$current" == "$VM_IP" ]]; then
    ok "Already correct — nothing to do."
  else
    warn "DRY RUN. Re-run with --apply to UPSERT this one record."
  fi
  exit 0
fi

if [[ "$current" == "$VM_IP" ]]; then
  ok "Already correct — nothing to do."
  exit 0
fi

# ---- apply --------------------------------------------------------------------
# TTL 60 while things are moving. Raise it once the address is settled; a low TTL on a
# record nobody is changing is just extra queries.
BATCH="$(mktemp)"
trap 'rm -f "$BATCH"' EXIT
cat > "$BATCH" <<EOF
{
  "Comment": "khelkhud app -> Azure VM ${VM_NAME}",
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "${DOMAIN}.",
      "Type": "A",
      "TTL": 60,
      "ResourceRecords": [{ "Value": "${VM_IP}" }]
    }
  }]
}
EOF

CHANGE_ID="$(aws_cli route53 change-resource-record-sets \
  --hosted-zone-id "$ROUTE53_ZONE_ID" \
  --change-batch "file://${BATCH}" \
  --query 'ChangeInfo.Id' --output text)"
ok "Submitted ${CHANGE_ID}"

info "Waiting for the change to propagate to all Route53 nameservers..."
aws_cli route53 wait resource-record-sets-changed --id "$CHANGE_ID" \
  && ok "Route53 reports INSYNC"

echo
echo "Next:"
echo "  ./devops/provision-dns.sh --verify"
echo "  DOMAIN=${DOMAIN} ./devops/build.sh && ./devops/push.sh && ./devops/deploy.sh"
