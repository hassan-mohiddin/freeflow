#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
plugin_root="$repo_root/plugins/freeflow"
registry="$plugin_root/command-surface.json"
manifest="$plugin_root/.codex-plugin/plugin.json"
command_docs="$plugin_root/evals/reports/by-command-surface/command-surface-matrix.md"
skills_dir="$plugin_root/skills"

failures=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

jq empty "$registry"
jq empty "$manifest"

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
done < <(jq -r '.directSkillCalls[] | [.command, .skill] | @tsv' "$registry")

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
