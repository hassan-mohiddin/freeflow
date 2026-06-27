#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
plugin_root="$repo_root"
registry="$plugin_root/command-surface.json"
manifest="$plugin_root/.codex-plugin/plugin.json"
command_docs="$plugin_root/evals/reports/by-command-surface/command-surface-matrix.md"
skills_dir="$plugin_root/skills"
pi_extension="$plugin_root/pi-extension/src/runtime-context.ts"

failures=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

pi_workflow_commands="$(mktemp)"
pi_contributor_commands="$(mktemp)"
trap 'rm -f "$pi_workflow_commands" "$pi_contributor_commands"' EXIT

extract_pi_commands() {
  local constant_name="$1"
  local output_file="$2"

  node - "$pi_extension" "$constant_name" >"$output_file" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const constantName = process.argv[3];
const source = fs.readFileSync(path, 'utf8');
const match = source.match(new RegExp(`const ${constantName} = \\[([\\s\\S]*?)\\];`));
if (!match) {
  console.error(`Missing ${constantName}`);
  process.exit(2);
}
const block = match[1];
const objectPattern = /\{\s*command:\s*"([^"]+)",\s*skill:\s*"([^"]+)"\s*\}/g;
let foundObject = false;
for (const item of block.matchAll(objectPattern)) {
  foundObject = true;
  console.log(`/${item[1]}\t${item[2]}`);
}
if (!foundObject) {
  const stringPattern = /"([^"]+)"/g;
  for (const item of block.matchAll(stringPattern)) {
    console.log(`/${item[1]}\t${item[1]}`);
  }
}
NODE
}

pair_exists() {
  local file="$1"
  local command="$2"
  local skill="$3"
  awk -F '\t' -v command="$command" -v skill="$skill" '$1 == command && $2 == skill { found = 1 } END { exit found ? 0 : 1 }' "$file"
}

command_exists() {
  local file="$1"
  local command="$2"
  awk -F '\t' -v command="$command" '$1 == command { found = 1 } END { exit found ? 0 : 1 }' "$file"
}

registry_has_direct_command() {
  local command="$1"
  jq -e --arg command "$command" '.directSkillCalls[] | select(.command == $command)' "$registry" >/dev/null
}

jq empty "$registry"
jq empty "$manifest"

extract_pi_commands WORKFLOW_COMMANDS "$pi_workflow_commands"
extract_pi_commands CONTRIBUTOR_COMMANDS "$pi_contributor_commands"

if [ "$(jq -r '.nativeSlashHandlers' "$registry")" != "false" ]; then
  fail "nativeSlashHandlers should remain false until host-level slash handlers exist"
fi

if jq -e 'has("commands") or has("slashCommands")' "$manifest" >/dev/null; then
  fail "plugin manifest declares command handlers but registry says nativeSlashHandlers=false"
fi

while IFS=$'\t' read -r command skill; do
  if [[ "$command" != /* ]]; then
    fail "direct skill command does not start with slash: $command"
  fi

  if [ ! -f "$skills_dir/$skill/SKILL.md" ]; then
    fail "$command maps to missing skill: $skill"
  fi

  if ! rg -Fq "$command" "$command_docs"; then
    fail "$command is missing from command-surface matrix"
  fi

  if ! pair_exists "$pi_workflow_commands" "$command" "$skill"; then
    if command_exists "$pi_workflow_commands" "$command"; then
      fail "$command maps to a different skill in Pi command registration than registry skill: $skill"
    else
      fail "$command is missing from Pi command registration"
    fi
  fi
done < <(jq -r '.directSkillCalls[] | [.command, .skill] | @tsv' "$registry")

while IFS=$'\t' read -r command skill; do
  if ! registry_has_direct_command "$command"; then
    fail "Pi registers direct workflow command not in registry: $command -> $skill"
  fi
done <"$pi_workflow_commands"

while IFS=$'\t' read -r command skill; do
  if [[ "$command" != /* ]]; then
    fail "developer skill command does not start with slash: $command"
  fi

  if [ ! -f "$skills_dir/$skill/SKILL.md" ]; then
    fail "$command maps to missing developer skill: $skill"
  fi

  if ! rg -Fq "$command" "$command_docs"; then
    fail "$command is missing from command-surface matrix"
  fi

  if ! pair_exists "$pi_contributor_commands" "$command" "$skill"; then
    if command_exists "$pi_contributor_commands" "$command"; then
      fail "$command maps to a different skill in Pi contributor command registration than registry skill: $skill"
    else
      fail "$command is missing from Pi contributor command registration"
    fi
  fi
done < <(jq -r '.developerSkillCalls[]? | [.command, .skill] | @tsv' "$registry")

while IFS=$'\t' read -r command skill; do
  if [[ "$command" != /workflow\ * ]]; then
    fail "mode command should use /workflow prefix: $command"
  fi

  if [ "$skill" != "mode-contract" ]; then
    fail "$command should route to mode-contract, got: $skill"
  fi

  if [ ! -f "$skills_dir/$skill/SKILL.md" ]; then
    fail "$command maps to missing skill: $skill"
  fi

  if ! rg -Fq "$command" "$command_docs"; then
    fail "$command is missing from command-surface matrix"
  fi
done < <(jq -r '.modeCommands[] | [.command, .routesTo] | @tsv' "$registry")

if [ "$failures" -gt 0 ]; then
  exit 1
fi

printf 'Command surface audit passed: %s direct skill calls, %s developer skill calls, %s mode commands, native slash handlers disabled.\n' \
  "$(jq '.directSkillCalls | length' "$registry")" \
  "$(jq '.developerSkillCalls | length' "$registry")" \
  "$(jq '.modeCommands | length' "$registry")"
