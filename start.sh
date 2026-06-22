#!/bin/bash
set -e

# APP_PORT is injected by the sandbox (3000-3099 range)
# Vite dev server listens on APP_PORT so the sandbox proxy can reach it
VITE_PORT=${APP_PORT:-5173}

# Port conflict guard — active in Workshop sandbox, skipped elsewhere
if [ -f /usr/local/lib/workshop-devguard.sh ]; then
    source /usr/local/lib/workshop-devguard.sh
    devguard_acquire "$VITE_PORT"
fi

# Startup timing — GNU date supports %3N (sandbox/Linux); BSD date (macOS) does not
if [[ "$(date +%s%3N 2>/dev/null)" =~ ^[0-9]+$ ]]; then
  now_ms() { date +%s%3N; }
else
  now_ms() { python3 -c "import time;print(int(time.time()*1000))"; }
fi
T0=$(now_ms)
elapsed() { echo $(( $(now_ms) - T0 )); }

# Install JS deps with lockfile hash guard
BUN_HASH=$(md5sum bun.lock 2>/dev/null | cut -d' ' -f1)
if [ ! -f "node_modules/.bun-hash-$BUN_HASH" ]; then
  echo "[+$(elapsed)ms] bun install starting..."
  bun install --frozen-lockfile
  rm -f node_modules/.bun-hash-* 2>/dev/null
  touch "node_modules/.bun-hash-$BUN_HASH"
  echo "[+$(elapsed)ms] bun install done"
else
  echo "[+$(elapsed)ms] bun install skipped (lockfile unchanged)"
fi

echo "[+$(elapsed)ms] Starting Vite on port $VITE_PORT"
exec bunx vite --host 0.0.0.0 --port $VITE_PORT --strictPort
