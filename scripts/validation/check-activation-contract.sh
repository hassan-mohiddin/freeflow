#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
setup_skill="$repo_root/skills/setup-freeflow/SKILL.md"
contract="$repo_root/skills/setup-freeflow/references/activation-contract.md"
host_setup="$repo_root/skills/setup-freeflow/references/host-setup.md"
interaction_contract="$repo_root/runtime/interaction-contract.md"
workflow_skill="$repo_root/skills/workflow/SKILL.md"
mode_skill="$repo_root/skills/mode-contract/SKILL.md"
agents_file="$repo_root/AGENTS.md"
runtime_doc="$repo_root/docs/freeflow-runtime-and-lifecycle.md"
architecture_doc="$repo_root/plugin-docs/architecture.md"
pi_runtime="$repo_root/pi-extension/src/runtime-context.ts"
shared_hook="$repo_root/hooks/freeflow-runtime-context.mjs"

failures=0
fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

require_text() {
  local file="$1"
  local text="$2"
  grep -Fq -- "$text" "$file" || fail "$file is missing: $text"
}

reject_text() {
  local file="$1"
  local text="$2"
  if grep -Fiq -- "$text" "$file"; then
    fail "$file retains obsolete text: $text"
  fi
}

for file in \
  "$setup_skill" \
  "$contract" \
  "$host_setup" \
  "$interaction_contract" \
  "$workflow_skill" \
  "$mode_skill" \
  "$agents_file" \
  "$runtime_doc" \
  "$architecture_doc" \
  "$pi_runtime" \
  "$shared_hook"; do
  [[ -f "$file" ]] || fail "missing required file: $file"
done

require_text "$setup_skill" '.freeflow/config.json` is the required shared repository activation config'
require_text "$setup_skill" '.freeflow/local.json` is an optional per-checkout personal override'
require_text "$contract" '.freeflow/config.json` is the required shared activation boundary'
require_text "$contract" '.freeflow/local.json` is optional per-checkout state'
require_text "$contract" 'An invalid existing local file blocks effective Freeflow'
require_text "$host_setup" 'Do not generate host-specific Freeflow instructions'
require_text "$setup_skill" 'automatic runtime delivery as **confirmed**, **unavailable**, or **unconfirmed**'
require_text "$setup_skill" '../../runtime/interaction-contract.md'
require_text "$setup_skill" '../workflow/SKILL.md'
require_text "$setup_skill" '../mode-contract/SKILL.md'
require_text "$setup_skill" 'references/output-router-setup.md'

require_text "$interaction_contract" '# Freeflow Interaction Contract'
require_text "$interaction_contract" 'Answer questions without inferring action.'
require_text "$workflow_skill" 'Treat work as an **Interaction Lifecycle** with an internal **Feedback Loop**'
require_text "$workflow_skill" 'The active agent owns understanding, routing, authorized work, verification, correction, and completion.'
require_text "$workflow_skill" 'When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation'
require_text "$mode_skill" 'Effective mode:'

require_text "$runtime_doc" 'runtime/interaction-contract.md'
require_text "$runtime_doc" 'skills/workflow/SKILL.md'
require_text "$architecture_doc" 'The Interaction Contract is the only compact interaction-guidance artifact.'

require_text "$pi_runtime" '../../runtime/interaction-contract.md'
require_text "$pi_runtime" '../../skills/workflow/SKILL.md'
require_text "$shared_hook" '"runtime", "interaction-contract.md"'
require_text "$shared_hook" '"workflow", "SKILL.md"'

for file in \
  "$agents_file" \
  "$repo_root/CONTEXT.md" \
  "$repo_root/README.md" \
  "$repo_root/docs/freeflow-current-state.md" \
  "$repo_root/docs/freeflow-packaging-and-publishing-design.md" \
  "$runtime_doc" \
  "$repo_root/docs/plugin-contract.md" \
  "$repo_root/plugin-docs/README.md" \
  "$repo_root/plugin-docs/workflow.md" \
  "$architecture_doc" \
  "$repo_root/plugin-docs/release-evidence.md"; do
  reject_text "$file" 'runtime kernel'
done

if grep -Eq '^## Freeflow$' "$agents_file"; then
  fail "$agents_file still contains an activation-like Freeflow block"
fi

for file in "$setup_skill" "$contract" "$host_setup"; do
  if grep -Eqi 'activation block/import|freeflow-core\.md|activeHosts' "$file"; then
    fail "$file defines obsolete host-instruction activation behavior"
  fi
done

for file in "$pi_runtime" "$shared_hook"; do
  if grep -Fq 'skills/mode-contract/SKILL.md' "$file" || \
     grep -Fq 'skills/decision-gate/SKILL.md' "$file"; then
    fail "$file eagerly loads Mode Contract or Decision Gate instead of leaving them on demand"
  fi
done

if grep -Eq 'AGENTS\.md|CLAUDE\.md|freeflow-core\.md|activeHosts|activation block/import' "$shared_hook"; then
  fail "$shared_hook still uses host instruction files as activation markers"
fi

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

printf 'Activation contract check passed: layered config, Interaction Contract delivery, Workflow bootstrap, and host-file preservation are aligned.\n'
