#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  run-fixture-eval.sh <eval-id> [--baseline|--with-skill] [--agent codex|claude]
                      [--run-dir DIR] [--output FILE] [--dry-run]
                      [--require-empty-diff] [--skill FILE ...]

Direct fixture mode, for compatibility wrappers:
  run-fixture-eval.sh --eval-id ID --fixture-dir DIR --prompt-file FILE
                      --variant baseline|with-skill --run-dir DIR --output FILE
                      [--agent codex|claude] [--skill FILE ...]
EOF
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

absolute_existing_dir_file() {
  local path="$1"
  local dir
  dir="$(cd "$(dirname "$path")" && pwd)"
  printf '%s/%s\n' "$dir" "$(basename "$path")"
}

absolute_maybe_missing() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    printf '%s\n' "$path"
  else
    printf '%s/%s\n' "$repo_root" "$path"
  fi
}

lower_id() {
  printf '%s\n' "$1" | tr '[:upper:]' '[:lower:]'
}

shell_join() {
  printf '%q' "$1"
  shift || true
  for arg in "$@"; do
    printf ' %q' "$arg"
  done
}

script_path="${BASH_SOURCE[0]}"
script_dir="$(cd "$(dirname "$script_path")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
plugin_root="$repo_root/plugins/freeflow"

eval_id=""
variant="with-skill"
agent="${FREEFLOW_FIXTURE_AGENT:-codex}"
registry="${FREEFLOW_FIXTURE_EVALS:-$plugin_root/evals/registries/fixture-evals.json}"
requested_run_dir=""
output_file=""
fixture_dir=""
prompt_file=""
dry_run="${FREEFLOW_DRY_RUN:-0}"
require_empty_diff="${FREEFLOW_REQUIRE_EMPTY_DIFF:-0}"
skill_files=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --eval-id)
      eval_id="${2:-}"
      shift 2
      ;;
    --variant)
      variant="${2:-}"
      shift 2
      ;;
    --baseline)
      variant="baseline"
      shift
      ;;
    --with-skill)
      variant="with-skill"
      shift
      ;;
    --agent)
      agent="${2:-}"
      shift 2
      ;;
    --registry)
      registry="${2:-}"
      shift 2
      ;;
    --run-dir)
      requested_run_dir="${2:-}"
      shift 2
      ;;
    --output)
      output_file="${2:-}"
      shift 2
      ;;
    --fixture-dir)
      fixture_dir="${2:-}"
      shift 2
      ;;
    --prompt-file)
      prompt_file="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run="1"
      shift
      ;;
    --require-empty-diff)
      require_empty_diff="1"
      shift
      ;;
    --skill)
      skill_files+=("${2:-}")
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      while [ "$#" -gt 0 ]; do
        skill_files+=("$1")
        shift
      done
      ;;
    -*)
      usage
      fail "Unsupported option: $1"
      ;;
    *)
      if [ -z "$eval_id" ]; then
        eval_id="$1"
      else
        skill_files+=("$1")
      fi
      shift
      ;;
  esac
done

[ -n "$eval_id" ] || { usage; exit 2; }

case "$variant" in
  baseline|with-skill) ;;
  *) fail "Unsupported variant: $variant. Expected baseline or with-skill." ;;
esac

case "$agent" in
  codex|claude) ;;
  *) fail "Unsupported agent: $agent. Expected codex or claude." ;;
esac

tmp_prompt_file=""
trap 'if [ -n "$tmp_prompt_file" ]; then rm -f "$tmp_prompt_file"; fi' EXIT

if [ -z "$fixture_dir" ] || [ -z "$prompt_file" ]; then
  registry="$(absolute_maybe_missing "$registry")"
  jq empty "$registry"

  match_count="$(jq -r --arg id "$eval_id" '[.evals[] | select(.id == $id)] | length' "$registry")"
  if [ "$match_count" != "1" ]; then
    fail "Eval $eval_id must resolve to exactly one registry entry; got $match_count."
  fi

  eval_json="$(jq -cer --arg id "$eval_id" '.evals[] | select(.id == $id)' "$registry")"

  fixture_root="$(jq -r '.fixture_root // empty' <<<"$eval_json")"
  if [ -z "$fixture_root" ]; then
    fixture_root="$(jq -r '.fixture_root // empty' "$registry")"
  fi
  [ -n "$fixture_root" ] || fail "Eval $eval_id has no fixture_root and registry has no default fixture_root."

  if [ "$variant" = "baseline" ]; then
    baseline_fixture_root="$(jq -r '.baseline_fixture_root // empty' <<<"$eval_json")"
    if [ -n "$baseline_fixture_root" ]; then
      fixture_root="$baseline_fixture_root"
    fi
  fi

  fixture_dir="$plugin_root/$fixture_root"

  prompt_ref="$(jq -r '.prompt_file // empty' <<<"$eval_json")"
  if [ -n "$prompt_ref" ]; then
    prompt_file="$plugin_root/$prompt_ref"
  else
    prompt="$(jq -r '.prompt // empty' <<<"$eval_json")"
    [ -n "$prompt" ] || fail "Eval $eval_id has no prompt_file or prompt."

    if [ "$dry_run" = "1" ]; then
      prompt_file="<inline prompt from registry>"
    else
      tmp_prompt_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-prompt-${eval_id}.XXXXXX")"
      printf '%s\n' "$prompt" > "$tmp_prompt_file"
      prompt_file="$tmp_prompt_file"
    fi
  fi
else
  fixture_dir="$(absolute_maybe_missing "$fixture_dir")"
  prompt_file="$(absolute_maybe_missing "$prompt_file")"
fi

[ -d "$fixture_dir" ] || fail "Fixture directory does not exist: $fixture_dir"
if [ "$prompt_file" != "<inline prompt from registry>" ]; then
  [ -f "$prompt_file" ] || fail "Prompt file does not exist: $prompt_file"
  prompt_file="$(absolute_existing_dir_file "$prompt_file")"
fi
fixture_dir="$(cd "$fixture_dir" && pwd)"

eval_stem="$(lower_id "$eval_id")"
if [ -z "$requested_run_dir" ]; then
  requested_run_dir="plugins/freeflow/evals/runs/manual/${eval_stem}-${variant}-${agent}"
fi

if [[ "$requested_run_dir" = /* ]]; then
  run_dir="$requested_run_dir"
else
  run_dir="${TMPDIR:-/tmp}/freeflow-evals/${requested_run_dir}"
fi

if [ -z "$output_file" ]; then
  output_file="plugins/freeflow/evals/runs/manual/${eval_stem}-${variant}-${agent}-output.md"
fi

if [ "$dry_run" = "1" ]; then
  resolved_output="$(absolute_maybe_missing "$output_file")"
else
  output_dir="$(dirname "$output_file")"
  mkdir -p "$output_dir"
  resolved_output="$(absolute_existing_dir_file "$output_file")"
fi

effective_skill_paths=()
if [ "$variant" = "with-skill" ]; then
  if [ "${#skill_files[@]}" -gt 0 ]; then
    for skill_file in "${skill_files[@]}"; do
      effective_skill_paths+=("$(absolute_maybe_missing "$skill_file")")
    done
  fi
fi

build_full_prompt() {
  local prompt
  prompt="$(cat "$prompt_file")"

  local skill_block
  if [ "$variant" = "with-skill" ]; then
    skill_block="Use these skill files as active instructions before acting:"
    if [ "${#effective_skill_paths[@]}" -gt 0 ]; then
      for skill_path in "${effective_skill_paths[@]}"; do
        skill_block="${skill_block}
- ${skill_path}"
      done
    fi
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
}

prepare_run_dir() {
  [ -n "$run_dir" ] || fail "Run directory is empty."
  [ "$run_dir" != "/" ] || fail "Refusing to use / as run directory."

  rm -rf "$run_dir"
  mkdir -p "$(dirname "$run_dir")"
  cp -R "$fixture_dir" "$run_dir"

  if [ -f "$run_dir/.freeflow-eval-setup.sh" ]; then
    (cd "$run_dir" && bash .freeflow-eval-setup.sh)
  fi
}

capture_evidence() {
  local output_stem="${resolved_output%.md}"
  local diff_file="${output_stem}.diff"

  diff -ru -x .git -x git-meta -x .freeflow-eval-setup.sh "$fixture_dir" "$run_dir" > "$diff_file" || true

  if git -C "$run_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$run_dir" status --short > "${output_stem}.git-status.txt" || true
    git -C "$run_dir" log --oneline --max-count=5 > "${output_stem}.git-log.txt" || true
    git -C "$run_dir" show --stat --oneline --name-only HEAD > "${output_stem}.git-head.txt" || true
  fi

  if [ "$require_empty_diff" = "1" ] && [ -s "$diff_file" ]; then
    echo "Diff is not empty; failing because FREEFLOW_REQUIRE_EMPTY_DIFF=1 or --require-empty-diff was set." >&2
    return 1
  fi
}

write_metadata() {
  local output_stem="${resolved_output%.md}"
  local skills_json
  if [ "${#effective_skill_paths[@]}" -eq 0 ]; then
    skills_json="[]"
  else
    skills_json="$(printf '%s\n' "${effective_skill_paths[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')"
  fi

  jq -n \
    --arg eval_id "$eval_id" \
    --arg variant "$variant" \
    --arg agent "$agent" \
    --arg registry "$registry" \
    --arg fixture_dir "$fixture_dir" \
    --arg run_dir "$run_dir" \
    --arg output "$resolved_output" \
    --arg diff "${output_stem}.diff" \
    --arg exit_status "${output_stem}.exit-status.txt" \
    --argjson skills "$skills_json" \
    '{
      eval_id: $eval_id,
      variant: $variant,
      agent: $agent,
      registry: $registry,
      fixture_dir: $fixture_dir,
      run_dir: $run_dir,
      output: $output,
      diff: $diff,
      exit_status: $exit_status,
      skills: $skills
    }' > "${output_stem}.metadata.json"
}

print_dry_run() {
  printf 'eval_id=%s\n' "$eval_id"
  printf 'agent=%s\n' "$agent"
  printf 'runner=%s\n' "$script_path"
  printf 'adapter=%s\n' "$agent"
  printf 'variant=%s\n' "$variant"
  printf 'fixture_action=would copy\n'
  printf 'fixture=%s\n' "$fixture_dir"
  printf 'prompt=%s\n' "$prompt_file"
  printf 'run_dir=%s\n' "$run_dir"
  printf 'output=%s\n' "$resolved_output"
  printf 'require_empty_diff=%s\n' "$require_empty_diff"
  if [ "$variant" = "baseline" ]; then
    printf 'runtime_context_disabled=1\n'
  fi
  printf 'skills=%s\n' "${effective_skill_paths[*]-}"
}

run_codex_adapter() {
  local codex_sandbox="${FREEFLOW_CODEX_SANDBOX:-workspace-write}"
  local command=(codex exec --cd "$run_dir" --sandbox "$codex_sandbox" --skip-git-repo-check --output-last-message "$resolved_output")

  if [ "$dry_run" = "1" ]; then
    print_dry_run
    printf 'command='
    shell_join "${command[@]}"
    printf ' <prompt>\n'
    return 0
  fi

  build_full_prompt

  set +e
  if [ "$variant" = "baseline" ]; then
    FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 "${command[@]}" "$full_prompt"
  else
    "${command[@]}" "$full_prompt"
  fi
  agent_status="$?"
  set -e
  printf '%s\n' "$agent_status" > "${resolved_output%.md}.exit-status.txt"
  return "$agent_status"
}

run_claude_adapter() {
  local default_plugin_dir="none"
  if [ "$variant" = "with-skill" ]; then
    default_plugin_dir="$plugin_root"
  fi

  local claude_plugin_dir="${FREEFLOW_CLAUDE_PLUGIN_DIR:-$default_plugin_dir}"
  local claude_args=(
    -p
    --no-session-persistence
    --permission-mode "${FREEFLOW_CLAUDE_PERMISSION_MODE:-dontAsk}"
    --tools "${FREEFLOW_CLAUDE_TOOLS:-Read,Edit,Bash}"
    --add-dir "$run_dir"
  )

  if [ "${FREEFLOW_CLAUDE_BARE:-1}" = "1" ]; then
    claude_args+=(--bare)
  fi

  if [ "$claude_plugin_dir" != "none" ]; then
    claude_args+=(--plugin-dir "$claude_plugin_dir")
  fi

  if [ "$dry_run" = "1" ]; then
    print_dry_run
    printf 'bare=%s\n' "${FREEFLOW_CLAUDE_BARE:-1}"
    printf 'plugin_dir=%s\n' "$claude_plugin_dir"
    printf 'command=claude'
    printf ' %q' "${claude_args[@]}"
    printf ' <prompt>\n'
    return 0
  fi

  build_full_prompt

  local stderr_file="${resolved_output%.md}.stderr.txt"

  set +e
  if [ "$variant" = "baseline" ]; then
    FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 claude "${claude_args[@]}" "$full_prompt" > "$resolved_output" 2> "$stderr_file"
  else
    claude "${claude_args[@]}" "$full_prompt" > "$resolved_output" 2> "$stderr_file"
  fi
  agent_status="$?"
  set -e
  printf '%s\n' "$agent_status" > "${resolved_output%.md}.exit-status.txt"
  return "$agent_status"
}

if [ "$dry_run" = "1" ]; then
  case "$agent" in
    codex) run_codex_adapter ;;
    claude) run_claude_adapter ;;
  esac
  exit 0
fi

write_metadata
prepare_run_dir

agent_status=0
case "$agent" in
  codex) run_codex_adapter || agent_status="$?" ;;
  claude) run_claude_adapter || agent_status="$?" ;;
esac

evidence_status=0
capture_evidence || evidence_status="$?"

if [ "$agent_status" -ne 0 ]; then
  echo "$agent exited with status $agent_status. See $resolved_output and sidecar files." >&2
  exit "$agent_status"
fi

exit "$evidence_status"
