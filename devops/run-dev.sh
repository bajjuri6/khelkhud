#!/usr/bin/env bash
# Local development launcher. Starts the Postgres container, the API (:4000) and the web
# app (:3000) in the background, logs each to logs/local/, and tracks PIDs so a second
# invocation can stop or restart cleanly.
#
# Counterpart to ./devops/run-local.sh, which exercises the production IMAGES. This one is
# for day-to-day work: turbopack HMR, tsx watch, no Docker build.
#
# Usage:
#   ./devops/run-dev.sh              # db + api + web
#   ./devops/run-dev.sh api|web      # just one (safe: restarting the api leaves web alone)
#   ./devops/run-dev.sh stop|restart|status
#
# `stop` stops the two Node processes but deliberately LEAVES Postgres running — it holds
# your seeded data and starting it again costs several seconds. To stop it too:
#   docker compose down          # keeps the data volume
#   docker compose down -v       # deletes it; you will need db:migrate + db:seed again

source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

cd "$(repo_root)"

LOG_DIR="logs/local"
mkdir -p "$LOG_DIR"
STAMP="$(date +%d%m%Y-%H-%M)"

# -sTCP:LISTEN everywhere. A bare `lsof -i :4000` also matches ESTABLISHED sockets, so the
# web server counts as "on port 4000" for as long as it holds an SSR connection to the API
# — which meant `run-dev.sh api` would kill the web server too, but only sometimes,
# depending on whether a request happened to be in flight.
listening_pids() { lsof -t -i :"$1" -sTCP:LISTEN 2>/dev/null || true; }

is_port_in_use() { [[ -n "$(listening_pids "$1")" ]]; }

kill_port() {
  local pids
  pids="$(listening_pids "$1")"
  [[ -n "$pids" ]] && { warn "Killing process(es) on :$1 — $pids"; echo "$pids" | xargs kill -9 2>/dev/null || true; }
  return 0
}

start_db() {
  require_cmd docker
  if docker compose ps db --status running 2>/dev/null | grep -q khelkhud-db; then
    info "Postgres already running on :5434"
  else
    info "Starting Postgres on :5434"
    docker compose up -d db
  fi
}

start_service() {
  # Takes the workspace name, not a pre-joined command string. Quoting "--filter=X dev" as
  # one argument makes pnpm treat the whole thing as a single script name and fail.
  local svc="$1" port="$2" workspace="$3"
  local log="${LOG_DIR}/${svc}-${STAMP}.log"

  if is_port_in_use "$port"; then
    warn "Port ${port} (${svc}) in use — freeing it"
    kill_port "$port"
    sleep 1
  fi

  info "Starting ${svc} on http://localhost:${port}  (log: ${log})"
  nohup pnpm --filter "$workspace" dev >"$log" 2>&1 &
  echo $! >"${LOG_DIR}/.${svc}.pid"

  # Poll the port so the verdict reflects the actual bind rather than a guess. Next with
  # turbopack is ~4s cold; tsx watch ~1s.
  local waited=0
  while ! is_port_in_use "$port" && [[ $waited -lt 20 ]]; do sleep 1; waited=$((waited + 1)); done
  if is_port_in_use "$port"; then
    ok "${svc} listening"
  else
    warn "${svc} not bound after ${waited}s — check ${log}"
  fi
}

# Kill a process AND everything it spawned, children first.
#
# `pnpm --filter X dev` is three processes deep: pnpm -> tsx watch (or next) -> the server
# that actually binds the port. Killing only the listener and the recorded pnpm pid leaves
# the middle supervisor alive, still holding a full set of file watchers.
#
# That leaked one watcher process per restart here, and it is not a cosmetic leak: after
# about nine restarts the orphans exhausted the machine's file-descriptor budget, turbopack
# could no longer watch the app directory, and EVERY route started returning 404 with only
# `EMFILE: too many open files` in the log to explain it.
#
# Children before parents, so a supervisor cannot respawn a child on the way down.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child"
  done
  kill -9 "$pid" 2>/dev/null || true
}

# `quiet` suppresses the "stopped" line when there was nothing to stop, so a bare
# `run-dev.sh` on a cold machine doesn't announce that it stopped two things that were
# never running.
stop_service() {
  local svc="$1" port="$2" quiet="${3:-}"
  local pidfile="${LOG_DIR}/.${svc}.pid"
  local was_running=0

  is_port_in_use "$port" && was_running=1

  if [[ -f "$pidfile" ]]; then
    kill_tree "$(cat "$pidfile")"
    rm -f "$pidfile"
  fi
  # Backstop for anything the tree walk missed (a pid file lost to a hard kill, say).
  kill_port "$port"

  if [[ -n "$quiet" && $was_running -eq 0 ]]; then
    return 0
  fi
  ok "${svc} stopped"
}

# Sweep orphans from before kill_tree existed, or from a session that ended abruptly.
#
# The pattern matches the real command line, which is NOT "tsx watch": tsx is invoked as
# `node <repo>/apps/api/node_modules/.bin/../tsx/dist/cli.mjs watch src`. An earlier
# version of this matched the literal "tsx watch" and therefore reaped nothing at all.
#
# kill -9, not the default SIGTERM: these are the processes that already survived a normal
# stop, which is precisely why they are still here.
#
# Anchored on the repo root so it can never touch another project's dev server.
reap_orphans() {
  local root pids
  root="$(repo_root)"
  pids="$(pgrep -f "${root}.*tsx/dist/cli\.mjs watch" 2>/dev/null || true)"
  [[ -z "$pids" ]] && return 0
  warn "Reaping $(echo "$pids" | wc -w | tr -d ' ') orphaned watcher process(es) from earlier runs"
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
}

status_service() {
  local svc="$1" port="$2"
  if is_port_in_use "$port"; then
    ok "${svc}: running on :${port} (pid $(listening_pids "$port" | tr '\n' ' '))"
  else
    warn "${svc}: stopped"
  fi
}

case "${1:-both}" in
  api)
    start_db
    start_service api "$APP_PORT_API" "@khelkhud/api"
    ;;
  web)
    start_service web "$APP_PORT_WEB" "@khelkhud/web"
    ;;
  both|all|"")
    [[ -f .env ]] || warn "No .env at the repo root — copy .env.example first or the API will refuse to boot."
    # Stop the tracked processes FIRST, so a bare invocation on an already-running stack is
    # a clean restart rather than a half-kill. It also means reap_orphans below only ever
    # sees genuine orphans — run the other way round it reports the LIVE watcher as
    # "orphaned from earlier runs", which is both alarming and untrue.
    stop_service web "$APP_PORT_WEB" quiet
    stop_service api "$APP_PORT_API" quiet
    reap_orphans
    start_db
    # The theme's CSS is a build artifact of tokens.ts. Regenerate before web starts, or a
    # token change edited during the last session silently won't be in the dev server.
    # `|| die` rather than `&&`: under `set -e` a bare `cmd && ok` that fails takes the
    # whole script down with no explanation of which step broke.
    pnpm --filter @khelkhud/theme build >/dev/null || die "Theme CSS generation failed."
    # @khelkhud/shared is now a BUILT package — its exports point at dist, not src, so the
    # api and web both fail to resolve it on a clean checkout until this has run once.
    pnpm --filter @khelkhud/shared build >/dev/null || die "@khelkhud/shared build failed."
    ok "Theme CSS and @khelkhud/shared rebuilt"
    start_service api "$APP_PORT_API" "@khelkhud/api"
    start_service web "$APP_PORT_WEB" "@khelkhud/web"
    echo
    ok "Running — web http://localhost:${APP_PORT_WEB}   api http://localhost:${APP_PORT_API}"
    echo "  Logs: tail -f ${LOG_DIR}/{api,web}-${STAMP}.log"
    echo "  Stop: ./devops/run-dev.sh stop"
    ;;
  stop)
    stop_service web "$APP_PORT_WEB"
    stop_service api "$APP_PORT_API"
    ;;
  restart)
    stop_service web "$APP_PORT_WEB"
    stop_service api "$APP_PORT_API"
    exec "$0" both
    ;;
  status)
    status_service web "$APP_PORT_WEB"
    status_service api "$APP_PORT_API"
    ;;
  *)
    die "Unknown command: $1 (expected api|web|both|stop|restart|status)"
    ;;
esac
