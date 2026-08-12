#!/usr/bin/env bash
# Safe git pull — fetch and fast-forward only. Refuses to pull with uncommitted changes or
# on a diverged branch, so a deploy is never built from a half-merged tree.

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cd "$(repo_root)"

[[ -z "$(git status --porcelain)" ]] \
  || die "Working tree has uncommitted changes. Commit or stash first."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
info "Fetching origin"
git fetch origin

LOCAL="$(git rev-parse "$BRANCH")"
REMOTE="$(git rev-parse "origin/${BRANCH}")"
BASE="$(git merge-base "$BRANCH" "origin/${BRANCH}")"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  ok "Already up to date"
elif [[ "$LOCAL" == "$BASE" ]]; then
  info "Fast-forwarding"
  git merge --ff-only "origin/${BRANCH}"
  ok "Pulled cleanly"
elif [[ "$REMOTE" == "$BASE" ]]; then
  die "Local is ahead of origin — push first."
else
  die "Branch has diverged. Rebase or merge manually."
fi
