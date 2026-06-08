#!/usr/bin/env bash
# Rewire dev server. The app is static files but MUST be served over HTTP —
# file:// breaks fetch (the per-song track loader) and some audio APIs.
#
#   ./serve.sh          serve on http://localhost:8731 and open a browser
#   ./serve.sh 9000     use a different port
#
# No dependencies beyond python3. Binds localhost only (not exposed on the LAN).
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8731}"
URL="http://localhost:${PORT}/index.html"

open_browser() {
  ( sleep "${1:-0}"
    if   command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
    elif command -v open     >/dev/null 2>&1; then open "$URL"
    fi
  ) >/dev/null 2>&1 &
}

# Already serving on this port? Don't double-start — just open it.
if python3 -c "import socket,sys; sys.exit(0 if socket.socket().connect_ex(('127.0.0.1',${PORT}))==0 else 1)" 2>/dev/null; then
  echo "Rewire already serving → ${URL} (opening browser)"
  open_browser 0
  exit 0
fi

echo "Serving Rewire at ${URL}  (Ctrl-C to stop)"
open_browser 1
exec python3 -m http.server "${PORT}" --bind 127.0.0.1
