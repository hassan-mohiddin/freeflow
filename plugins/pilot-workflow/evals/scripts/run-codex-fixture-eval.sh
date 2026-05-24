#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 5 ]; then
  echo "Usage: $0 <fixture-dir> <run-dir> <variant> <prompt-file> <output-file> [skill-file ...]" >&2
  exit 2
fi

fixture_dir="$1"
run_dir="$2"
variant="$3"
prompt_file="$4"
output_file="$5"
shift 5

rm -rf "$run_dir"
mkdir -p "$(dirname "$run_dir")"
cp -R "$fixture_dir" "$run_dir"

prompt="$(cat "$prompt_file")"

if [ "$variant" = "with-skill" ]; then
  skill_block="Use these skill files as active instructions before acting:"
  for skill_file in "$@"; do
    skill_block="${skill_block}
- ${skill_file}"
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

diff -ru "$fixture_dir" "$run_dir" > "${output_file%.md}.diff" || true
