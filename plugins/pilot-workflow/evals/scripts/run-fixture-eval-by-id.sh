#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <eval-id> <variant> <run-dir> <output-file> [skill-file ...]" >&2
  exit 2
fi

eval_id="$1"
variant="$2"
run_dir="$3"
output_file="$4"
shift 4

repo_root="$(git rev-parse --show-toplevel)"
plugin_root="$repo_root/plugins/pilot-workflow"
registry="${PILOT_WORKFLOW_FIXTURE_EVALS:-$plugin_root/evals/fixture-evals.json}"

eval_json="$(jq -cer --arg id "$eval_id" '.evals[] | select(.id == $id)' "$registry")"

fixture_root="$(jq -r '.fixture_root // empty' <<<"$eval_json")"
if [ -z "$fixture_root" ]; then
  fixture_root="$(jq -r '.fixture_root' "$registry")"
fi

if [ "$variant" = "baseline" ]; then
  baseline_fixture_root="$(jq -r '.baseline_fixture_root // empty' <<<"$eval_json")"
  if [ -n "$baseline_fixture_root" ]; then
    fixture_root="$baseline_fixture_root"
  fi
fi

prompt_file="$(jq -r '.prompt_file // empty' <<<"$eval_json")"
tmp_prompt_file=""
if [ -z "$prompt_file" ]; then
  prompt="$(jq -r '.prompt // empty' <<<"$eval_json")"
  if [ -z "$prompt" ]; then
    echo "Eval $eval_id has no prompt_file or prompt." >&2
    exit 1
  fi

  if [ "${PILOT_WORKFLOW_DRY_RUN:-0}" = "1" ]; then
    prompt_path="<inline prompt from registry>"
  else
    tmp_prompt_file="$(mktemp "${TMPDIR:-/tmp}/pilot-workflow-prompt-${eval_id}.XXXXXX")"
    trap 'rm -f "$tmp_prompt_file"' EXIT
    printf '%s\n' "$prompt" > "$tmp_prompt_file"
    prompt_path="$tmp_prompt_file"
  fi
else
  prompt_path="$plugin_root/$prompt_file"
fi

fixture_path="$plugin_root/$fixture_root"
runner="$plugin_root/evals/scripts/run-codex-fixture-eval.sh"

if [ "${PILOT_WORKFLOW_DRY_RUN:-0}" = "1" ]; then
  printf 'eval_id=%s\n' "$eval_id"
  printf 'variant=%s\n' "$variant"
  printf 'fixture=%s\n' "$fixture_path"
  printf 'prompt=%s\n' "$prompt_path"
  printf 'run_dir=%s\n' "$run_dir"
  printf 'output=%s\n' "$output_file"
  printf 'skills=%s\n' "$*"
  exit 0
fi

"$runner" "$fixture_path" "$run_dir" "$variant" "$prompt_path" "$output_file" "$@"
