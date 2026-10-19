#!/usr/bin/env bash
# Start, drive and stop one isolated bookmarks service; see dev-docs/guides/verify-live.md.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
run="${RUN:-run-1}"
dir="$root/.tmp/verify-live/runs/$run"
evidence="$root/verify-evidence/$run"
token=verify-live

running() { [ -f "$dir/pid" ] && kill -0 "$(cat "$dir/pid")" 2>/dev/null; }

case "${1:-}" in
  start)
    mkdir -p "$dir/data" "$evidence"
    running && { echo "already running at $(cat "$dir/url")"; exit 0; }
    : >"$dir/service.log"
    BOOKMARKS_PORT=0 BOOKMARKS_DATA_DIR="$dir/data" BOOKMARKS_TOKEN="$token" \
      nohup node "$root/bin/serve.js" >"$dir/service.log" 2>&1 &
    echo $! >"$dir/pid"
    for _ in $(seq 150); do
      url=$(sed -n 's/.*"msg":"listening","url":"\([^"]*\)".*/\1/p' "$dir/service.log" | tail -1)
      if [ -n "$url" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/healthz")" = 200 ]; then
        echo "$url" >"$dir/url"
        echo "ready at $url"
        exit 0
      fi
      running || break
      sleep 0.1
    done
    echo "the service did not get ready:" >&2
    cat "$dir/service.log" >&2
    exit 1
    ;;
  call)
    name="$2" method="$3" path="$4" body="${5:-}"
    args=(-s -X "$method" -H "Authorization: Bearer $token" -w '\n%{http_code}\n')
    [ -n "$body" ] && args+=(-H 'content-type: application/json' -d "$body")
    curl "${args[@]}" "$(cat "$dir/url")$path" | tee "$evidence/$name.txt"
    ;;
  stop)
    if running; then
      pid=$(cat "$dir/pid")
      kill -TERM "$pid"
      while kill -0 "$pid" 2>/dev/null; do sleep 0.1; done
    fi
    rm -f "$dir/pid" "$dir/url"
    echo stopped
    ;;
  cleanup)
    "$0" stop
    rm -rf "$dir"
    ;;
  *)
    echo "usage: verify-live.sh start | call <name> <METHOD> <path> [json] | stop | cleanup" >&2
    exit 1
    ;;
esac
