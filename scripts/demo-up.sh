#!/usr/bin/env bash
#
# Start the whole demo stack in one terminal: provider API, agent server, web app.
# Ctrl-C stops all three.
#
#   pnpm demo:up
#
# Reads ./.env if present (copy .env.example). With PROVIDER_STORE=postgres it also
# starts Postgres and applies migrations; otherwise the provider runs in memory mode
# and packet uploads are lost on restart.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  echo "==> Loaded .env"
else
  echo "==> No .env found (using defaults; copy .env.example to change modes)"
fi

PROVIDER_STORE="${PROVIDER_STORE:-memory}"
LOG_DIR=".demo-logs"
mkdir -p "$LOG_DIR"

pids=()
cleaned=0
cleanup() {
  # Ctrl-C delivers INT to the whole process group, so without this guard the
  # handler runs once per signal path and prints the banner several times.
  [ "$cleaned" = 1 ] && return
  cleaned=1
  echo ""
  echo "==> Stopping services"
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT TERM

port_busy() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

for port in 3000 4021 4022; do
  if port_busy "$port"; then
    echo "Port $port is already in use. Stop the process using it and retry." >&2
    echo "  ss -ltnp | grep :$port" >&2
    exit 1
  fi
done

# Port 3000 is not negotiable: the Slush wallet session in .playwright-wallet-profile
# is bound to that origin, and NEXT_PUBLIC_* URLs are baked against it at build time.

if [ "$PROVIDER_STORE" = "postgres" ]; then
  echo "==> Starting Postgres"
  docker compose up -d postgres
  export DATABASE_URL="${DATABASE_URL:-postgres://casium:casium@localhost:5432/casium}"

  echo "==> Waiting for Postgres"
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U casium >/dev/null 2>&1; then break; fi
    sleep 1
  done

  echo "==> Applying migrations"
  node apps/provider-api/scripts/migrate.mjs
else
  echo "==> PROVIDER_STORE=memory (packets and applications are lost on restart)"
fi

echo "==> Building workspace"
pnpm -r --if-present build >"$LOG_DIR/build.log" 2>&1 || {
  echo "Build failed. See $LOG_DIR/build.log" >&2
  exit 1
}

wait_for_http() {
  local url="$1" name="$2"
  for _ in $(seq 1 60); do
    if curl -sf -m 2 "$url" >/dev/null 2>&1; then
      echo "==> $name ready"
      return 0
    fi
    sleep 1
  done
  echo "$name did not become ready — see $LOG_DIR/" >&2
  return 1
}

echo "==> Starting provider API (:4021)"
pnpm --filter @casium/provider-api start >"$LOG_DIR/provider.log" 2>&1 &
pids+=($!)
wait_for_http http://localhost:4021/health "Provider API"

echo "==> Starting agent server (:4022)"
pnpm --filter @casium/agent start:server >"$LOG_DIR/agent.log" 2>&1 &
pids+=($!)
wait_for_http http://localhost:4022/health "Agent"

echo "==> Starting web app (:3000)"
pnpm --filter @casium/web start >"$LOG_DIR/web.log" 2>&1 &
pids+=($!)
wait_for_http http://localhost:3000 "Web app"

cat <<EOF

  All services up.

    Web        http://localhost:3000
    Provider   http://localhost:4021/health   (store: $PROVIDER_STORE)
    Agent      http://localhost:4022/health

  Logs stream into $LOG_DIR/. Ctrl-C stops everything.

EOF

wait
