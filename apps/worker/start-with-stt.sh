#!/bin/sh
set -eu

python3 -m stt_sarvam &
STT_PID=$!
trap 'kill "$STT_PID" 2>/dev/null || true; wait "$STT_PID" 2>/dev/null || true' EXIT INT TERM

python3 - <<'PY'
import sys
import time
import urllib.error
import urllib.request

url = "http://127.0.0.1:8091/health"
for _ in range(40):
    try:
        urllib.request.urlopen(url, timeout=0.5)
        sys.exit(0)
    except (urllib.error.URLError, TimeoutError, OSError):
        time.sleep(0.25)
print("stt sidecar failed to start on 127.0.0.1:8091", file=sys.stderr)
sys.exit(1)
PY

node dist/apps/worker/main.js start
