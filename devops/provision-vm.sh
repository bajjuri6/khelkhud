#!/usr/bin/env bash
# Provision the application VM: resource group, SSH key, VM with cloud-init (Docker +
# compose plugin), a static public IP, and NSG rules.
#
# Idempotent — safe to re-run. Re-running is in fact the supported way to refresh the SSH
# firewall rule after your home/office IP rotates.
#
# NOTE ON THE PREMISE: there was no existing Azure Linux VM to co-locate onto. The
# subscription's only two VMs are kt-win-build-x64 (a deallocated Windows build agent) and
# raviga-visual-ml (a deallocated ML box) — neither is an app server, and there is no App
# Service, Container App, AKS cluster or ACR anywhere in the subscription. The other
# services that felt like "the existing instance" are the nybr EC2 box, which lives in a
# separate AWS account (099771437951). So khelkhud gets its own VM.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

require_cmd ssh-keygen
assert_azure_login

info "Subscription: $(az_cli account show --query name -o tsv)"
info "Region:       ${AZ_LOCATION}    VM: ${VM_NAME} (${VM_SIZE})"

# ---- resource group ----------------------------------------------------------
if az_cli group exists -n "$AZ_RG" | grep -q true; then
  info "Resource group ${AZ_RG} exists"
else
  info "Creating resource group ${AZ_RG}"
  az_cli group create -n "$AZ_RG" -l "$AZ_LOCATION" -o none
  ok "Resource group created"
fi

# ---- ssh key -----------------------------------------------------------------
if [[ ! -f "$SSH_KEY" ]]; then
  info "Generating deploy key at ${SSH_KEY}"
  mkdir -p "$(dirname "$SSH_KEY")"
  ssh-keygen -t ed25519 -N "" -C "khelkhud-deploy" -f "$SSH_KEY"
  ok "Key generated — back up ${SSH_KEY}; losing it means losing shell access to the VM."
fi

MY_IP="$(my_ip)"
info "Operator IP: ${MY_IP}"

# ---- vm ----------------------------------------------------------------------
if az_cli vm show -g "$AZ_RG" -n "$VM_NAME" -o none 2>/dev/null; then
  info "VM ${VM_NAME} already exists — skipping creation"
else
  info "Creating VM ${VM_NAME}. This takes 2-3 minutes."
  # --public-ip-sku Standard is mandatory: Basic public IPs were retired in Sept 2025.
  az_cli vm create \
    --resource-group "$AZ_RG" \
    --name "$VM_NAME" \
    --image "$VM_IMAGE" \
    --size "$VM_SIZE" \
    --admin-username "$VM_ADMIN" \
    --ssh-key-values "${SSH_KEY}.pub" \
    --public-ip-sku Standard \
    --public-ip-address-allocation static \
    --os-disk-size-gb "$VM_OS_DISK_GB" \
    --storage-sku "$VM_OS_DISK_SKU" \
    --custom-data "$(dirname "${BASH_SOURCE[0]}")/cloud-init.yaml" \
    --nsg-rule NONE \
    -o none
  ok "VM created"
fi

VM_IP="$(vm_public_ip)"
[[ -n "$VM_IP" ]] || die "VM has no public IP after creation — inspect it in the portal."

# ---- network security group --------------------------------------------------
NSG="$(az_cli network nsg list -g "$AZ_RG" --query "[0].name" -o tsv)"
[[ -n "$NSG" && "$NSG" != "None" ]] || die "No NSG found in ${AZ_RG}."

# SSH is pinned to the operator's current address, never left open to the internet. This
# rule is rewritten on every run precisely because that address changes.
info "Pinning SSH (22) to ${MY_IP}/32 on ${NSG}"
az_cli network nsg rule create -g "$AZ_RG" --nsg-name "$NSG" -n allow-ssh-operator \
  --priority 300 --access Allow --protocol Tcp --direction Inbound \
  --source-address-prefixes "${MY_IP}/32" --destination-port-ranges 22 \
  -o none 2>/dev/null \
|| az_cli network nsg rule update -g "$AZ_RG" --nsg-name "$NSG" -n allow-ssh-operator \
     --source-address-prefixes "${MY_IP}/32" -o none

for spec in "allow-http:310:80" "allow-https:320:443"; do
  IFS=: read -r name prio port <<<"$spec"
  az_cli network nsg rule create -g "$AZ_RG" --nsg-name "$NSG" -n "$name" \
    --priority "$prio" --access Allow --protocol Tcp --direction Inbound \
    --source-address-prefixes Internet --destination-port-ranges "$port" \
    -o none 2>/dev/null && ok "NSG rule ${name} created" || info "NSG rule ${name} already present"
done

# UDP/443 for HTTP/3. Caddy publishes it; without the rule QUIC silently fails and every
# client quietly falls back to TCP, which is easy to never notice and mildly slower.
az_cli network nsg rule create -g "$AZ_RG" --nsg-name "$NSG" -n allow-https-quic \
  --priority 330 --access Allow --protocol Udp --direction Inbound \
  --source-address-prefixes Internet --destination-port-ranges 443 \
  -o none 2>/dev/null && ok "NSG rule allow-https-quic created" || info "NSG rule allow-https-quic already present"

echo
ok "VM ready at ${VM_IP}"
cat <<EOF

  ssh -i ${SSH_KEY} ${VM_ADMIN}@${VM_IP}

cloud-init installs Docker on first boot and takes ~60s after the VM reports ready.
Check it finished before deploying:

  ssh -i ${SSH_KEY} ${VM_ADMIN}@${VM_IP} 'cloud-init status --wait && docker --version'

Next:
  ./devops/provision-postgres.sh     # the managed database
  ./devops/provision-dns.sh          # prints the DNS records to create
  ./devops/build.sh && ./devops/push.sh && ./devops/deploy.sh
EOF
