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
plugin_root="$repo_root/plugins/freeflow"
fixture_dir="$(cd "$fixture_dir" && pwd)"
prompt_file="$(cd "$(dirname "$prompt_file")" && pwd)/$(basename "$prompt_file")"
output_dir="$(dirname "$output_file")"
mkdir -p "$output_dir"
output_file="$(cd "$output_dir" && pwd)/$(basename "$output_file")"

if [[ "$requested_run_dir" = /* ]]; then
  run_dir="$requested_run_dir"
else
  run_dir="${TMPDIR:-/tmp}/freeflow-evals/${requested_run_dir}"
fi

if [ "${FREEFLOW_DRY_RUN:-0}" = "1" ]; then
  fixture_action="would copy"
else
  rm -rf "$run_dir"
  mkdir -p "$(dirname "$run_dir")"
  cp -R "$fixture_dir" "$run_dir"

  if [ -f "$run_dir/.freeflow-eval-setup.sh" ]; then
    (cd "$run_dir" && bash .freeflow-eval-setup.sh)
  fi
  fixture_action="copied"
fi

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
  skill_block="Do not read or use freeflow skill files."
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

claude_args=(
  -p
  --no-session-persistence
  --permission-mode "${FREEFLOW_CLAUDE_PERMISSION_MODE:-dontAsk}"
  --tools "${FREEFLOW_CLAUDE_TOOLS:-Read,Edit,Bash}"
  --add-dir "$run_dir"
)

if [ "${FREEFLOW_CLAUDE_BARE:-1}" = "1" ]; then
  claude_args+=(--bare)
fi

default_plugin_dir="none"
if [ "$variant" = "with-skill" ]; then
  default_plugin_dir="$plugin_root"
fi
claude_plugin_dir="${FREEFLOW_CLAUDE_PLUGIN_DIR:-$default_plugin_dir}"

if [ "$claude_plugin_dir" != "none" ]; then
  claude_args+=(--plugin-dir "$claude_plugin_dir")
fi

if [ "${FREEFLOW_DRY_RUN:-0}" = "1" ]; then
  printf 'runner=claude\n'
  printf 'fixture_action=%s\n' "$fixture_action"
  printf 'fixture=%s\n' "$fixture_dir"
  printf 'run_dir=%s\n' "$run_dir"
  printf 'variant=%s\n' "$variant"
  printf 'prompt=%s\n' "$prompt_file"
  printf 'output=%s\n' "$output_file"
  printf 'bare=%s\n' "${FREEFLOW_CLAUDE_BARE:-1}"
  printf 'plugin_dir=%s\n' "$claude_plugin_dir"
  printf 'skills=%s\n' "$*"
  printf 'command=claude'
  printf ' %q' "${claude_args[@]}"
  printf ' <prompt>\n'
  exit 0
fi

mkdir -p "$(dirname "$output_file")"

stderr_file="${output_file%.md}.stderr.txt"
status_file="${output_file%.md}.exit-status.txt"

set +e
claude "${claude_args[@]}" "$full_prompt" > "$output_file" 2> "$stderr_file"
claude_status="$?"
set -e
printf '%s\n' "$claude_status" > "$status_file"

diff_file="${output_file%.md}.diff"
diff -ru -x .git -x git-meta -x .freeflow-eval-setup.sh "$fixture_dir" "$run_dir" > "$diff_file" || true

if git -C "$run_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$run_dir" status --short > "${output_file%.md}.git-status.txt" || true
  git -C "$run_dir" log --oneline --max-count=5 > "${output_file%.md}.git-log.txt" || true
  git -C "$run_dir" show --stat --oneline --name-only HEAD > "${output_file%.md}.git-head.txt" || true
fi

if [ "${FREEFLOW_REQUIRE_EMPTY_DIFF:-0}" = "1" ] && [ -s "$diff_file" ]; then
  echo "Diff is not empty; failing because FREEFLOW_REQUIRE_EMPTY_DIFF=1." >&2
  exit 1
fi

if [ "$claude_status" -ne 0 ]; then
  echo "Claude exited with status $claude_status. See $output_file and $stderr_file." >&2
  exit "$claude_status"
fi
