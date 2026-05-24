#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <fixture-dir> <run-dir> <variant> <prompt-file> <output-file> [skill-file ...]" >&2
  exit 2
fi

fixture_dir="$1"
requested_run_dir="$2"
variant="$3"
prompt_file="$4"
output_file="$5"
shift 5

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fixture_dir="$(cd "$fixture_dir" && pwd)"
prompt_file="$(cd "$(dirname "$prompt_file")" && pwd)/$(basename "$prompt_file")"
output_dir="$(dirname "$output_file")"
mkdir -p "$output_dir"
output_file="$(cd "$output_dir" && pwd)/$(basename "$output_file")"

if [[ "$requested_run_dir" = /* ]]; then
  run_dir="$requested_run_dir"
else
  run_dir="${TMPDIR:-/tmp}/pilot-workflow-evals/${requested_run_dir}"
fi

rm -rf "$run_dir"
mkdir -p "$(dirname "$run_dir")"
cp -R "$fixture_dir" "$run_dir"

prompt="$(cat "$prompt_file")"

if [ "$variant" = "with-skill" ]; then
  skill_block="Use these skill files as active instructions before acting:"
  for skill_file in "$@"; do
    if [[ "$skill_file" = /* ]]; then
      skill_path="$skill_file"
    else
      skill_path="$repo_root/$skill_file"
    fi
    skill_block="${skill_block}
- ${skill_path}"
  done
else
  skill_block="Do not read or use pilot-workflow skill files."
fi

full_prompt="${skill_block}

Work only inside this fixture directory:
${run_dir}

User prompt:
${prompt}

Requirements:
- Work like a normal coding agent.
- Inspect relevant files as needed.
- Do not edit outside the fixture directory.
- Return the final response you would send to the user.
- Do not mention this is an eval."

mkdir -p "$(dirname "$output_file")"

codex exec \
  --cd "$run_dir" \
  --sandbox workspace-write \
  --skip-git-repo-check \
  --output-last-message "$output_file" \
  "$full_prompt"

diff_file="${output_file%.md}.diff"
diff -ru "$fixture_dir" "$run_dir" > "$diff_file" || true

if [ "${PILOT_WORKFLOW_REQUIRE_EMPTY_DIFF:-0}" = "1" ] && [ -s "$diff_file" ]; then
  echo "Diff is not empty; failing because PILOT_WORKFLOW_REQUIRE_EMPTY_DIFF=1." >&2
  exit 1
fi
