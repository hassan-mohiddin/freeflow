#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <fixture-dir> <run-dir> <variant> <prompt-file> <output-file> [skill-file ...]" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fixture_dir="$1"
run_dir="$2"
variant="$3"
prompt_file="$4"
output_file="$5"
shift 5

exec "$script_dir/run-fixture-eval.sh" \
  --eval-id direct-codex \
  --agent codex \
  --fixture-dir "$fixture_dir" \
  --prompt-file "$prompt_file" \
  --variant "$variant" \
  --run-dir "$run_dir" \
  --output "$output_file" \
  "$@"
