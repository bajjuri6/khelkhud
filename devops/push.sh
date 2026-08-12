#!/usr/bin/env bash
# Push the built images to GitHub Container Registry.
#
# Usage:
#   ./devops/push.sh              # current version
#   ./devops/push.sh 1.2.0
#
# Auth: a classic PAT with `write:packages`, exported as GHCR_TOKEN (or CR_PAT). Create it
# at https://github.com/settings/tokens. A fine-grained token will NOT work — GHCR still
# requires a classic PAT for package writes.
#
# First push of each image creates a PRIVATE package. The VM pulls with the same
# credentials via deploy.sh, so leaving it private is correct; there is no reason for
# these images to be public.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

require_cmd docker

VERSION="${1:-$(current_version)}"
TOKEN="${GHCR_TOKEN:-${CR_PAT:-}}"

[[ -n "$TOKEN" ]] || die "Set GHCR_TOKEN to a GitHub classic PAT with write:packages."

info "Logging in to ghcr.io as ${GHCR_OWNER}"
printf '%s' "$TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin >/dev/null \
  || die "GHCR login failed. Is the PAT classic, unexpired, and scoped write:packages?"

for image in "$WEB_IMAGE_NAME" "$API_IMAGE_NAME"; do
  docker image inspect "${image}:${VERSION}" >/dev/null 2>&1 \
    || die "${image}:${VERSION} not built locally. Run: ./devops/build.sh ${VERSION}"
done

for image in "$WEB_IMAGE_NAME" "$API_IMAGE_NAME"; do
  remote="${REGISTRY}/${image}"
  info "Pushing ${remote}:${VERSION}"
  docker tag "${image}:${VERSION}" "${remote}:${VERSION}"
  docker tag "${image}:${VERSION}" "${remote}:latest"
  docker push "${remote}:${VERSION}"
  docker push "${remote}:latest"
  ok "${remote}:${VERSION} pushed"
done

echo
ok "Version ${VERSION} is in the registry"
echo "Next: ./devops/deploy.sh ${VERSION}"
