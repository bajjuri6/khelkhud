#!/usr/bin/env bash
# Version management. Source of truth: the root package.json. Bumps cascade nowhere —
# workspace package.jsons keep their own versions; the image tags and the compose
# VERSION variable all read from the root.
#
# Usage: ./devops/version.sh [current|bump|set] [args]
#   ./devops/version.sh current
#   ./devops/version.sh bump patch|minor|major [--no-confirm]
#   ./devops/version.sh set 1.2.3

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

PACKAGE_JSON="$(repo_root)/package.json"

set_version() {
  local v="$1"
  [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Version must be semver, e.g. 1.2.3 (got: $v)"
  ( cd "$(repo_root)" && npm version "$v" --no-git-tag-version --workspaces=false >/dev/null )
  ok "package.json -> $v"
}

bump() {
  local type="${1:-patch}" confirm_flag="${2:-}"
  local cur; cur="$(current_version)"
  IFS='.' read -r major minor patch <<<"$cur"

  case "$type" in
    patch) patch=$((patch + 1)) ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    major) major=$((major + 1)); minor=0; patch=0 ;;
    *) die "Unknown bump type: $type (expected patch|minor|major)" ;;
  esac

  local next="${major}.${minor}.${patch}"
  if [[ "$confirm_flag" != "--no-confirm" ]]; then
    info "$cur  ->  $next"
    confirm "Bump?"
  fi
  set_version "$next"
  echo "$next"
}

case "${1:-current}" in
  current) current_version ;;
  bump)    bump "${2:-patch}" "${3:-}" ;;
  set)     set_version "${2:?version required}" ;;
  *)       die "Unknown command: $1 (expected current|bump|set)" ;;
esac
