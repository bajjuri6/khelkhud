#!/usr/bin/env bash
# Build the web and api images.
#
# Usage:
#   ./devops/build.sh                # current version from package.json
#   ./devops/build.sh 1.2.0          # a specific version
#   ./devops/build.sh patch|minor|major   # bump first, then build
#   ./devops/build.sh --api-only | --web-only
#
# Single-architecture by design (BUILD_PLATFORM in _lib.sh, default linux/arm64 to match
# the ARM VM). A mismatch between the image arch and the VM arch produces a container that
# exits instantly with "exec format error" — if you see that, this is the reason.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

require_cmd docker
cd "$(repo_root)"

BUILD_WEB=1
BUILD_API=1
VERSION_ARG=""

for arg in "$@"; do
  case "$arg" in
    --api-only) BUILD_WEB=0 ;;
    --web-only) BUILD_API=0 ;;
    *)          VERSION_ARG="$arg" ;;
  esac
done

case "$VERSION_ARG" in
  "")                     VERSION="$(current_version)"; info "Version: ${VERSION}" ;;
  patch|minor|major)      VERSION="$(./devops/version.sh bump "$VERSION_ARG" --no-confirm | tail -n1)"
                          ok "Bumped to ${VERSION}" ;;
  [0-9]*)                 VERSION="$VERSION_ARG" ;;
  *)                      die "Unknown argument: ${VERSION_ARG}" ;;
esac

docker buildx version >/dev/null 2>&1 || die "docker buildx required (ships with Docker Desktop)."

# NEXT_PUBLIC_* bake into the client bundle at build time and cannot be changed later.
# NEXT_PUBLIC_API_URL stays EMPTY so the browser sends same-origin /api/* requests through
# Caddy — see the note in Dockerfile.web.
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-${DOMAIN:+https://$DOMAIN}}"
NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://khelkhud.org}"
NEXT_PUBLIC_INDEXABLE="${NEXT_PUBLIC_INDEXABLE:-true}"

build_image() {
  local name="$1" dockerfile="$2"; shift 2
  info "Building ${name}:${VERSION} for ${BUILD_PLATFORM}"
  docker buildx build \
    --platform "$BUILD_PLATFORM" \
    --load \
    -f "$dockerfile" \
    -t "${name}:${VERSION}" \
    -t "${name}:latest" \
    "$@" \
    .
  ok "${name}:${VERSION} built"
}

if [[ $BUILD_API -eq 1 ]]; then
  build_image "$API_IMAGE_NAME" devops/Dockerfile.api
fi

if [[ $BUILD_WEB -eq 1 ]]; then
  build_image "$WEB_IMAGE_NAME" devops/Dockerfile.web \
    --build-arg "NEXT_PUBLIC_API_URL=" \
    --build-arg "NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}" \
    --build-arg "NEXT_PUBLIC_INDEXABLE=${NEXT_PUBLIC_INDEXABLE}"
fi

echo
ok "Built version ${VERSION}"
echo "Next: ./devops/push.sh ${VERSION}"
