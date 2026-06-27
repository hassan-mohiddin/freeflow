#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <eval-id> <variant> <run-dir> <output-file> [skill-file ...]" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

eval_id="$1"
variant="$2"
run_dir="$3"
output_file="$4"
shift 4

exec "$script_dir/run-fixture-eval.sh" \
  "$eval_id" \
  --variant "$variant" \
  --agent "${FREEFLOW_FIXTURE_AGENT:-codex}" \
  --run-dir "$run_dir" \
  --output "$output_file" \
  "$@"
