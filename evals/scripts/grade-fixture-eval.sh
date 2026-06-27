#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  grade-fixture-eval.sh <eval-id> --output FILE [--registry FILE] [--format text|json]

Grades only objective fixture evidence: output sidecars, diffs, changed files,
and configured fixed-string checks. Human reasoning assertions remain manual.
EOF
}

fail_usage() {
  usage
  printf 'FAIL: %s\n' "$1" >&2
  exit 2
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
plugin_root="$repo_root"

eval_id=""
registry="$plugin_root/evals/registries/fixture-evals.json"
output_file=""
format="text"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --registry)
      registry="${2:-}"
      shift 2
      ;;
    --output)
      output_file="${2:-}"
      shift 2
      ;;
    --format)
      format="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      fail_usage "Unsupported argument: $1"
      ;;
    *)
      if [ -z "$eval_id" ]; then
        eval_id="$1"
      else
        fail_usage "Unexpected argument: $1"
      fi
      shift
      ;;
  esac
done

[ -n "$eval_id" ] || fail_usage "Missing eval id."
[ -n "$output_file" ] || fail_usage "Missing --output FILE."

case "$format" in
  text|json) ;;
  *) fail_usage "Unsupported format: $format" ;;
esac

if [[ "$registry" != /* ]]; then
  registry="$repo_root/$registry"
fi

if [[ "$output_file" != /* ]]; then
  output_file="$repo_root/$output_file"
fi

[ -f "$registry" ] || fail_usage "Registry not found: $registry"
jq empty "$registry"

match_count="$(jq -r --arg id "$eval_id" '[.evals[] | select(.id == $id)] | length' "$registry")"
[ "$match_count" = "1" ] || fail_usage "Eval $eval_id must resolve exactly once in registry; got $match_count."

eval_json="$(jq -cer --arg id "$eval_id" '.evals[] | select(.id == $id)' "$registry")"
output_stem="${output_file%.md}"
diff_file="${output_stem}.diff"
metadata_file="${output_stem}.metadata.json"
exit_status_file="${output_stem}.exit-status.txt"

fixture_root="$(jq -r '.fixture_root // empty' <<<"$eval_json")"
if [ -z "$fixture_root" ]; then
  fixture_root="$(jq -r '.fixture_root // empty' "$registry")"
fi

inferred_fixture_dir=""
if [ -n "$fixture_root" ] && [ -d "$plugin_root/$fixture_root" ]; then
  inferred_fixture_dir="$(cd "$plugin_root/$fixture_root" && pwd)"
fi

inferred_run_dir=""
runs_root="$plugin_root/evals/runs"
if [[ "$output_stem" == "$runs_root/"* ]]; then
  output_rel="${output_stem#"$runs_root"/}"
  run_rel="${output_rel%-output}"
  possible_run_dir="${TMPDIR:-/tmp}/freeflow-evals/evals/runs/$run_rel"
  if [ -d "$possible_run_dir" ]; then
    inferred_run_dir="$(cd "$possible_run_dir" && pwd)"
  fi
fi

if [ -f "$metadata_file" ]; then
  metadata_json="$(jq -c '.' "$metadata_file")"
  diff_file="$(jq -r '.diff // empty' "$metadata_file")"
  exit_status_file="$(jq -r '.exit_status // empty' "$metadata_file")"
else
  metadata_json="$(jq -cn --arg fixture_dir "$inferred_fixture_dir" --arg run_dir "$inferred_run_dir" '{fixture_dir:$fixture_dir, run_dir:$run_dir}')"
fi

checks_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-grade-checks.XXXXXX")"
changed_files_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-grade-changed.XXXXXX")"
trap 'rm -f "$checks_file" "$changed_files_file"' EXIT

status="pass"

record_check() {
  local check_id="$1"
  local check_status="$2"
  local message="$3"
  printf '%s\t%s\t%s\n' "$check_id" "$check_status" "$message" >> "$checks_file"
  if [ "$check_status" = "fail" ]; then
    status="fail"
  fi
}

contains_fixed() {
  local file="$1"
  local value="$2"
  [ -f "$file" ] && rg -Fq -- "$value" "$file"
}

canonical_path() {
  local path="$1"
  local dir

  if [[ "$path" = /* ]] && [ -e "$path" ]; then
    dir="$(cd "$(dirname "$path")" && pwd)"
    printf '%s/%s\n' "$dir" "$(basename "$path")"
  else
    printf '%s\n' "$path"
  fi
}

normalize_path() {
  local path="$1"
  local fixture_dir run_dir
  fixture_dir="$(jq -r '.fixture_dir // empty' <<<"$metadata_json")"
  run_dir="$(jq -r '.run_dir // empty' <<<"$metadata_json")"
  fixture_dir="$(canonical_path "$fixture_dir")"
  run_dir="$(canonical_path "$run_dir")"

  path="$(canonical_path "$path")"
  path="${path#./}"
  if [ -n "$fixture_dir" ] && [[ "$path" == "$fixture_dir/"* ]]; then
    printf '%s\n' "${path#"$fixture_dir"/}"
  elif [ -n "$run_dir" ] && [[ "$path" == "$run_dir/"* ]]; then
    printf '%s\n' "${path#"$run_dir"/}"
  else
    printf '%s\n' "$path"
  fi
}

append_changed_path() {
  local path="$1"
  if [ -d "$path" ]; then
    find "$path" -type f -print | while IFS= read -r nested_path; do
      normalize_path "$nested_path" >> "$changed_files_file"
    done
  else
    normalize_path "$path" >> "$changed_files_file"
  fi
}

extract_changed_files() {
  : > "$changed_files_file"
  [ -f "$diff_file" ] || return 0

  while IFS= read -r line; do
    case "$line" in
      diff\ -ru*)
        old_path="$(awk '{print $(NF-1)}' <<<"$line")"
        new_path="$(awk '{print $NF}' <<<"$line")"
        append_changed_path "$old_path"
        append_changed_path "$new_path"
        ;;
      Only\ in\ *:\ *)
        dir="${line#Only in }"
        name="${dir#*: }"
        dir="${dir%%: *}"
        append_changed_path "$dir/$name"
        ;;
    esac
  done < "$diff_file"

  sort -u "$changed_files_file" -o "$changed_files_file"
}

has_changed_file() {
  local value="$1"
  rg -Fxq -- "$value" "$changed_files_file"
}

is_allowed_changed_file() {
  local value="$1"
  jq -e --arg file "$value" '(.allow // []) | index($file)' <<<"$check_json" >/dev/null
}

changed_file_count() {
  wc -l < "$changed_files_file" | tr -d ' '
}

run_diff_empty_check() {
  local check_json="$1"
  local check_id expected actual
  check_id="$(jq -r '.id // "diff-empty"' <<<"$check_json")"
  expected="$(jq -r '.expect // true' <<<"$check_json")"

  if [ ! -f "$diff_file" ]; then
    record_check "$check_id" "fail" "Missing diff sidecar: $diff_file"
    return
  fi

  if [ -s "$diff_file" ]; then
    actual="false"
  else
    actual="true"
  fi

  if [ "$actual" = "$expected" ]; then
    record_check "$check_id" "pass" "diff_empty=$actual"
  else
    record_check "$check_id" "fail" "Expected diff_empty=$expected, got $actual"
  fi
}

run_changed_files_check() {
  local check_json="$1"
  local check_id ok allow_count file prefix
  check_id="$(jq -r '.id // "changed-files"' <<<"$check_json")"
  ok=1

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if ! has_changed_file "$file"; then
      record_check "$check_id" "fail" "Required changed file missing: $file"
      ok=0
    fi
  done < <(jq -r '.require[]? // empty' <<<"$check_json")

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if has_changed_file "$file"; then
      record_check "$check_id" "fail" "Forbidden changed file present: $file"
      ok=0
    fi
  done < <(jq -r '.forbid[]? // empty' <<<"$check_json")

  while IFS= read -r prefix; do
    [ -n "$prefix" ] || continue
    if awk -v prefix="$prefix" '
      index($0, prefix) == 1 { found = 1 }
      index($0, "/" prefix) > 0 { found = 1 }
      END { exit found ? 0 : 1 }
    ' "$changed_files_file"; then
      record_check "$check_id" "fail" "Forbidden changed path prefix present: $prefix"
      ok=0
    fi
  done < <(jq -r '.forbid_prefixes[]? // empty' <<<"$check_json")

  allow_count="$(jq -r '(.allow // []) | length' <<<"$check_json")"
  if [ "$allow_count" != "0" ]; then
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      if ! is_allowed_changed_file "$file"; then
        record_check "$check_id" "fail" "Unexpected changed file: $file"
        ok=0
      fi
    done < "$changed_files_file"
  fi

  if [ "$ok" = "1" ]; then
    record_check "$check_id" "pass" "Changed files match objective rule ($(changed_file_count) file(s))."
  fi
}

run_output_contains_check() {
  local check_json="$1"
  local check_id ok value any_count any_ok
  check_id="$(jq -r '.id // "output-contains"' <<<"$check_json")"
  ok=1

  if [ ! -f "$output_file" ]; then
    record_check "$check_id" "fail" "Missing output file: $output_file"
    return
  fi

  while IFS= read -r value; do
    [ -n "$value" ] || continue
    if ! contains_fixed "$output_file" "$value"; then
      record_check "$check_id" "fail" "Output missing required text: $value"
      ok=0
    fi
  done < <(jq -r '.all[]? // empty' <<<"$check_json")

  while IFS= read -r value; do
    [ -n "$value" ] || continue
    if contains_fixed "$output_file" "$value"; then
      record_check "$check_id" "fail" "Output contains forbidden text: $value"
      ok=0
    fi
  done < <(jq -r '.none[]? // empty' <<<"$check_json")

  any_count="$(jq -r '(.any // []) | length' <<<"$check_json")"
  if [ "$any_count" != "0" ]; then
    any_ok=0
    while IFS= read -r value; do
      [ -n "$value" ] || continue
      if contains_fixed "$output_file" "$value"; then
        any_ok=1
      fi
    done < <(jq -r '.any[]? // empty' <<<"$check_json")
    if [ "$any_ok" = "0" ]; then
      record_check "$check_id" "fail" "Output does not contain any accepted text."
      ok=0
    fi
  fi

  if [ "$ok" = "1" ]; then
    record_check "$check_id" "pass" "Output text checks passed."
  fi
}

run_diff_contains_check() {
  local check_json="$1"
  local check_id ok value
  check_id="$(jq -r '.id // "diff-contains"' <<<"$check_json")"
  ok=1

  if [ ! -f "$diff_file" ]; then
    record_check "$check_id" "fail" "Missing diff sidecar: $diff_file"
    return
  fi

  while IFS= read -r value; do
    [ -n "$value" ] || continue
    if ! contains_fixed "$diff_file" "$value"; then
      record_check "$check_id" "fail" "Diff missing required text: $value"
      ok=0
    fi
  done < <(jq -r '.all[]? // empty' <<<"$check_json")

  while IFS= read -r value; do
    [ -n "$value" ] || continue
    if contains_fixed "$diff_file" "$value"; then
      record_check "$check_id" "fail" "Diff contains forbidden text: $value"
      ok=0
    fi
  done < <(jq -r '.none[]? // empty' <<<"$check_json")

  if [ "$ok" = "1" ]; then
    record_check "$check_id" "pass" "Diff text checks passed."
  fi
}

run_exit_status_check() {
  local check_json="$1"
  local check_id expected actual
  check_id="$(jq -r '.id // "exit-status"' <<<"$check_json")"
  expected="$(jq -r '.expect // 0' <<<"$check_json")"

  if [ ! -f "$exit_status_file" ]; then
    record_check "$check_id" "fail" "Missing exit status sidecar: $exit_status_file"
    return
  fi

  actual="$(tr -d '[:space:]' < "$exit_status_file")"
  if [ "$actual" = "$expected" ]; then
    record_check "$check_id" "pass" "exit_status=$actual"
  else
    record_check "$check_id" "fail" "Expected exit_status=$expected, got $actual"
  fi
}

extract_changed_files

if [ ! -f "$output_file" ]; then
  record_check "output-file" "fail" "Missing output file: $output_file"
fi

objective_count="$(jq -r '(.objective_checks // []) | length' <<<"$eval_json")"
if [ "$objective_count" = "0" ]; then
  status="manual"
  record_check "objective-checks" "manual" "No objective_checks configured for $eval_id."
else
  while IFS= read -r check_json; do
    check_type="$(jq -r '.type' <<<"$check_json")"
    case "$check_type" in
      diff_empty) run_diff_empty_check "$check_json" ;;
      changed_files) run_changed_files_check "$check_json" ;;
      output_contains) run_output_contains_check "$check_json" ;;
      diff_contains) run_diff_contains_check "$check_json" ;;
      exit_status) run_exit_status_check "$check_json" ;;
      *) record_check "$(jq -r '.id // "unknown"' <<<"$check_json")" "fail" "Unsupported objective check type: $check_type" ;;
    esac
  done < <(jq -c '.objective_checks[]?' <<<"$eval_json")
fi

if [ "$format" = "json" ]; then
  checks_json="$(jq -Rn '[inputs | split("\t") | {id:.[0], status:.[1], message:.[2]}]' "$checks_file")"
  changed_json="$(jq -R -s 'split("\n") | map(select(length > 0))' "$changed_files_file")"
  jq -n \
    --arg status "$status" \
    --arg eval_id "$eval_id" \
    --arg output "$output_file" \
    --arg diff "$diff_file" \
    --argjson checks "$checks_json" \
    --argjson changed_files "$changed_json" \
    '{status:$status, eval_id:$eval_id, output:$output, diff:$diff, changed_files:$changed_files, checks:$checks}'
else
  printf 'Fixture objective grade: %s\n' "$status"
  printf 'Eval: %s\n' "$eval_id"
  printf 'Output: %s\n' "$output_file"
  printf 'Diff: %s\n' "$diff_file"
  printf '\nChanged files:\n'
  if [ -s "$changed_files_file" ]; then
    sed 's/^/- /' "$changed_files_file"
  else
    printf '%s\n' '- none'
  fi
  printf '\nChecks:\n'
  while IFS=$'\t' read -r check_id check_status message; do
    printf '%s\n' "- $check_status: $check_id - $message"
  done < "$checks_file"
fi

if [ "$status" = "fail" ]; then
  exit 1
fi
