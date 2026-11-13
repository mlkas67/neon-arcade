#!/usr/bin/env bash
# Publish the arcade on a public HTTPS address with a real, browser-trusted
# certificate (Cloudflare quick tunnel — no account needed).
#
#   ./scripts/share.sh          print the public https:// URL
#
# The link lives as long as this machine and the tunnel process do, so keep the
# terminal open. Ctrl-C stops the tunnel; the game itself keeps running locally.
set -uo pipefail

PORT="${PORT:-8080}"
HOST_TUNNEL="${HOST_TUNNEL:-http://localhost:$PORT}"
CF="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"

if ! curl -fsS -o /dev/null --max-time 3 "http://localhost:$PORT/"; then
  echo "The arcade server is not answering on http://localhost:$PORT" >&2
  echo "Start it first with:  npm start" >&2
  exit 1
fi

if [ ! -x "$CF" ]; then
  echo "cloudflared not found. Install it with one of:" >&2
  echo "  brew install cloudflared" >&2
  echo "  curl -fsSL -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x ~/.local/bin/cloudflared" >&2
  exit 1
fi

LOG="$(mktemp -t arcade-tunnel.XXXXXX.log)"
echo "Opening a tunnel to $HOST_TUNNEL ..." >&2
# QUIC is blocked on some networks; HTTP/2 works everywhere we have tried.
"$CF" tunnel --url "$HOST_TUNNEL" --no-autoupdate --protocol http2 >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null' INT TERM EXIT

URL=""
for _ in $(seq 1 40); do
  URL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  if [ -n "$URL" ] && curl -fsS -o /dev/null --max-time 5 "$URL/"; then break; fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Tunnel did not come up. Log: $LOG" >&2
  exit 1
fi

echo
echo "  $URL"
echo
echo "Share that link. It stays up while this command runs and this machine is awake."
wait "$TUNNEL_PID"
