#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  skill-evidence.sh <skill> [--format summary|json|commands] [--audience public|internal]
  skill-evidence.sh --validate

Examples:
  plugins/freeflow/evals/scripts/skill-evidence.sh verify-work
  plugins/freeflow/evals/scripts/skill-evidence.sh write-plan --format commands
  plugins/freeflow/evals/scripts/skill-evidence.sh review-work --format json
EOF
}

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

script_path="${BASH_SOURCE[0]}"
script_dir="$(cd "$(dirname "$script_path")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
plugin_root="$repo_root/plugins/freeflow"
metadata="$plugin_root/evals/registries/skill-evidence.json"
command_surface="$plugin_root/command-surface.json"
reports_dir="$plugin_root/evals/reports/by-skill"

format="summary"
audience="public"
validate_all=0
skill=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --format)
      format="${2:-}"
      shift 2
      ;;
    --audience)
      audience="${2:-}"
      shift 2
      ;;
    --validate)
      validate_all=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      usage
      fail "Unsupported option: $1"
      ;;
    *)
      if [ -z "$skill" ]; then
        skill="$1"
      else
        usage
        fail "Unexpected argument: $1"
      fi
      shift
      ;;
  esac
done

case "$format" in
  summary|json|commands) ;;
  *) fail "Unsupported format: $format. Expected summary, json, or commands." ;;
esac

case "$audience" in
  public|internal) ;;
  *) fail "Unsupported audience: $audience. Expected public or internal." ;;
esac

jq empty "$metadata"
jq empty "$command_surface"

skill_exists() {
  local name="$1"
  [ -f "$plugin_root/skills/$name/SKILL.md" ]
}

skill_in_metadata() {
  local name="$1"
  jq -e --arg skill "$name" '.skills[$skill] != null' "$metadata" >/dev/null
}

find_registry_for_eval() {
  local eval_id="$1"
  local registry_rel
  local found=""
  local count=0

  while IFS= read -r registry_rel; do
    local registry_path="$plugin_root/$registry_rel"
    local matches
    matches="$(jq -r --arg id "$eval_id" '[.evals[] | select(.id == $id)] | length' "$registry_path")"
    if [ "$matches" != "0" ]; then
      count=$((count + matches))
      found="$registry_rel"
    fi
  done < <(jq -r '.registries[]' "$metadata")

  if [ "$count" != "1" ]; then
    printf 'ERROR:%s' "$count"
  else
    printf '%s' "$found"
  fi
}

eval_acceptance_suites_json() {
  local eval_id="$1"
  jq -c --arg id "$eval_id" '[.suites[] | select(.evals | index($id)) | {id, path}]' "$metadata"
}

command_routes_json() {
  local name="$1"
  jq -c --arg skill "$name" '
    [
      (.directSkillCalls[]? | select(.skill == $skill) | {kind:"direct", command, skill}),
      (.developerSkillCalls[]? | select(.skill == $skill) | {kind:"developer", command, skill}),
      (.modeCommands[]? | select(.routesTo == $skill) | {kind:"mode", command, skill:.routesTo})
    ]
  ' "$command_surface"
}

reports_json() {
  local name="$1"
  find "$reports_dir" -maxdepth 1 -type f -name "${name}-[0-9]*-report.md" -print \
    | sed "s#^$plugin_root/##" \
    | sort \
    | jq -R -s 'split("\n")[:-1]'
}

build_bundle() {
  local name="$1"
  local tmp_evals
  tmp_evals="$(mktemp "${TMPDIR:-/tmp}/freeflow-skill-evals.XXXXXX")"

  local eval_id
  while IFS= read -r eval_id; do
    [ -n "$eval_id" ] || continue

    local registry_rel
    registry_rel="$(find_registry_for_eval "$eval_id")"
    if [[ "$registry_rel" == ERROR:* ]]; then
      jq -cn --arg id "$eval_id" --arg error "eval must resolve exactly once; got ${registry_rel#ERROR:}" \
        '{id:$id, error:$error}' >> "$tmp_evals"
      continue
    fi

    local registry_path="$plugin_root/$registry_rel"
    local eval_json
    eval_json="$(jq -cer --arg id "$eval_id" '.evals[] | select(.id == $id)' "$registry_path")"

    local fixture_root
    fixture_root="$(jq -r '.fixture_root // empty' <<<"$eval_json")"
    if [ -z "$fixture_root" ]; then
      fixture_root="$(jq -r '.fixture_root // empty' "$registry_path")"
    fi

    local prompt_ref prompt_kind
    prompt_ref="$(jq -r '.prompt_file // empty' <<<"$eval_json")"
    if [ -n "$prompt_ref" ]; then
      prompt_kind="file"
    else
      prompt_ref="<inline>"
      prompt_kind="inline"
    fi

    local fixture_exists="false"
    if [ -n "$fixture_root" ] && [ -d "$plugin_root/$fixture_root" ]; then
      fixture_exists="true"
    fi

    local prompt_exists="true"
    if [ "$prompt_kind" = "file" ] && [ ! -f "$plugin_root/$prompt_ref" ]; then
      prompt_exists="false"
    fi

    local suites
    suites="$(eval_acceptance_suites_json "$eval_id")"

    jq -cn \
      --arg id "$eval_id" \
      --arg registry "$registry_rel" \
      --arg fixture "$fixture_root" \
      --arg prompt "$prompt_ref" \
      --arg promptKind "$prompt_kind" \
      --argjson fixtureExists "$fixture_exists" \
      --argjson promptExists "$prompt_exists" \
      --argjson suites "$suites" \
      '{id:$id, registry:$registry, fixture_root:$fixture, fixture_exists:$fixtureExists, prompt:$prompt, prompt_kind:$promptKind, prompt_exists:$promptExists, suites:$suites}' >> "$tmp_evals"
  done < <(jq -r --arg skill "$name" '.skills[$skill].evals[]?' "$metadata")

  local evals_json routes_json reports
  evals_json="$(jq -s '.' "$tmp_evals")"
  routes_json="$(command_routes_json "$name")"
  reports="$(reports_json "$name")"

  local bundle_json
  bundle_json="$(jq -n \
    --arg skill "$name" \
    --arg skillFile "skills/$name/SKILL.md" \
    --arg audience "$audience" \
    --arg runPolicy "generated runs are internal; this output does not include evals/runs bodies" \
    --argjson evals "$evals_json" \
    --argjson commands "$routes_json" \
    --argjson reports "$reports" \
    '{
      subject: {kind:"skill", name:$skill},
      skill_file:$skillFile,
      audience:$audience,
      command_routes:$commands,
      evals:$evals,
      reports:$reports,
      run_policy:$runPolicy,
      gaps: (
        [
          (if ($commands | length) == 0 then "no command-surface route" else empty end),
          (if ($evals | length) == 0 then "no grouped evals" else empty end),
          (if ($reports | length) == 0 then "no by-skill reports" else empty end)
        ]
        + [ $evals[]? | select(.error != null) | "eval " + .id + ": " + .error ]
        + [ $evals[]? | select(.fixture_exists == false) | "eval " + .id + ": missing fixture " + .fixture_root ]
        + [ $evals[]? | select(.prompt_exists == false) | "eval " + .id + ": missing prompt " + .prompt ]
      )
    }')"

  rm -f "$tmp_evals"
  printf '%s\n' "$bundle_json"
}

validate_skill() {
  local name="$1"
  local status=0

  if ! skill_exists "$name"; then
    printf 'FAIL %s: missing skills/%s/SKILL.md\n' "$name" "$name" >&2
    return 1
  fi

  if ! skill_in_metadata "$name"; then
    printf 'FAIL %s: missing skill-evidence metadata\n' "$name" >&2
    return 1
  fi

  local bundle
  bundle="$(build_bundle "$name")"

  if jq -e '.gaps[]? | select(test("^eval .*:"))' <<<"$bundle" >/dev/null; then
    jq -r --arg name "$name" '.gaps[]? | select(test("^eval .*:")) | "FAIL " + $name + ": " + .' <<<"$bundle" >&2
    status=1
  fi

  if jq -e '.gaps[]? | select(. == "no grouped evals")' <<<"$bundle" >/dev/null; then
    printf 'FAIL %s: no grouped evals\n' "$name" >&2
    status=1
  fi

  return "$status"
}

if [ "$validate_all" = "1" ]; then
  status=0

  while IFS= read -r item; do
    if ! skill_in_metadata "$item"; then
      printf 'FAIL %s: command-surface route has no skill-evidence metadata\n' "$item" >&2
      status=1
    fi
  done < <(jq -r '[.directSkillCalls[]?.skill, .developerSkillCalls[]?.skill, .modeCommands[]?.routesTo] | unique[]' "$command_surface")

  while IFS= read -r item; do
    validate_skill "$item" || status=1
  done < <(jq -r '.skills | keys[]' "$metadata")
  exit "$status"
fi

[ -n "$skill" ] || { usage; exit 2; }
skill_exists "$skill" || fail "Skill not found: skills/$skill/SKILL.md"
skill_in_metadata "$skill" || fail "No skill-evidence metadata for skill: $skill"

bundle="$(build_bundle "$skill")"

case "$format" in
  json)
    jq '.' <<<"$bundle"
    ;;
  commands)
    jq -r --arg runner "plugins/freeflow/evals/scripts/run-fixture-eval.sh" --arg skill_file "plugins/freeflow/skills/$skill/SKILL.md" '
      .evals[]
      | select(.error == null)
      | $runner + " " + .id + " --with-skill --registry plugins/freeflow/" + .registry + " --skill " + $skill_file
    ' <<<"$bundle"
    ;;
  summary)
    jq -r '
      "Skill: " + .subject.name,
      "Skill file: " + .skill_file,
      "Commands:",
      (if (.command_routes | length) == 0 then "  - none" else (.command_routes[] | "  - " + .command + " -> " + .skill + " (" + .kind + ")") end),
      "Evals:",
      (if (.evals | length) == 0 then "  - none" else (.evals[] | "  - " + .id + " [" + .registry + "]" + (if (.suites | length) > 0 then " suites: " + ((.suites | map(.id)) | join(",")) else "" end)) end),
      "Reports:",
      (if (.reports | length) == 0 then "  - none" else (.reports[] | "  - " + .) end),
      "Gaps:",
      (if (.gaps | length) == 0 then "  - none" else (.gaps[] | "  - " + .) end),
      "Run policy: " + .run_policy
    ' <<<"$bundle"
    ;;
esac
