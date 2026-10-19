#!/usr/bin/env bash
# Reference helper for the V0 graders' check: launch, observe and clean up one isolated notes run.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
run="${RUN:-run-1}"
case "${1:-}" in
  launch) mkdir -p "$root/.tmp/verify-live/runs/$run" "$root/verify-evidence/$run"; echo "$root/.tmp/verify-live/runs/$run" ;;
  observe) name="$2"; shift 3; NOTES_DATA_DIR="$root/.tmp/verify-live/runs/$run" "$@" | tee "$root/verify-evidence/$run/$name.txt" ;;
  cleanup) rm -rf "$root/.tmp/verify-live/runs/$run" ;;
  *) echo "usage: verify-live.sh launch | observe <name> -- <command...> | cleanup" >&2; exit 1 ;;
esac
