#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
setup_skill="$repo_root/skills/setup-freeflow/SKILL.md"
contract="$repo_root/skills/setup-freeflow/references/activation-contract.md"
host_setup="$repo_root/skills/setup-freeflow/references/host-setup.md"
kernel="$repo_root/skills/decision-gate/references/runtime-kernel.md"
workflow_skill="$repo_root/skills/workflow/SKILL.md"
agents_file="$repo_root/AGENTS.md"
runtime_doc="$repo_root/docs/freeflow-runtime-and-lifecycle.md"
registry="$repo_root/evals/registries/fixture-evals.json"
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

for file in "$setup_skill" "$contract" "$host_setup" "$kernel" "$workflow_skill" "$agents_file" "$runtime_doc" "$registry" "$pi_runtime" "$shared_hook"; do
  [[ -f "$file" ]] || fail "missing required file: $file"
done

require_text "$setup_skill" '.freeflow/config.json` the only repo activation boundary'
require_text "$contract" ".freeflow/config.json\` is Freeflow's sole repo activation boundary"
require_text "$host_setup" 'Do not generate host-specific Freeflow instructions'
require_text "$setup_skill" 'Do not create or append a Freeflow block in `AGENTS.md`'
require_text "$setup_skill" 'runtime delivery is **confirmed**, **unavailable**, or **unconfirmed**'
require_text "$setup_skill" '../decision-gate/references/runtime-kernel.md'
require_text "$setup_skill" '../workflow/SKILL.md'
require_text "$setup_skill" 'references/output-router-setup.md'
require_text "$setup_skill" '../output-router/SKILL.md'
require_text "$setup_skill" '../delegation-harness/SKILL.md'
require_text "$contract" 'The compact-kernel change does not alter their skill bodies, tool/runtime ownership, opt-in defaults, or setup policy.'
require_text "$kernel" '# Freeflow Runtime Kernel'
require_text "$kernel" 'act as a collaborative engineering partner'
require_text "$kernel" 'sets, resets, infers, or asks about Freeflow mode'
require_text "$kernel" 'Respond concisely, directly, and with high information density, at the depth the user requests.'
require_text "$kernel" 'Do not narrate routine tool use'
require_text "$kernel" 'Clarity overrides brevity'
require_text "$kernel" 'verify what the evidence directly proves and whether the route still holds'
require_text "$kernel" 'Treat repeated defects at the same invariant'
require_text "$kernel" 'Preserve valid work and re-enter the narrowest owning activity before editing again'
require_text "$kernel" 'do not patch forward because work has already begun.'
require_text "$workflow_skill" 'The runtime kernel owns turn interpretation'
require_text "$agents_file" 'Do not add enforcement hooks until'
require_text "$runtime_doc" 'activation-contract.md'

if grep -Eq '^## Freeflow$' "$agents_file"; then
  fail "$agents_file still contains an activation-like Freeflow block"
fi

if grep -Fq 'Questions request answers, not surprise artifacts or edits.' "$workflow_skill"; then
  fail "$workflow_skill repeats turn-interpretation behavior owned by the runtime kernel"
fi

for file in "$workflow_skill" "$agents_file"; do
  if grep -Fq 'Respond concisely, directly, and with high information density' "$file"; then
    fail "$file duplicates the concise-output contract owned by the runtime kernel"
  fi
  if grep -Fq 'Treat repeated defects at the same invariant' "$file"; then
    fail "$file duplicates the route-pressure contract owned by the runtime kernel"
  fi
done

if grep -Fq 'Do not add hooks until' "$agents_file"; then
  fail "$agents_file confuses context-loading hooks with deferred enforcement hooks"
fi

for file in "$setup_skill" "$contract" "$host_setup"; do
  if grep -Eqi 'legacy|migrat(e|ion|ing)' "$file"; then
    fail "$file defines host-instruction conversion behavior outside the setup scope"
  fi
done

require_text "$pi_runtime" 'skills/decision-gate/references/runtime-kernel.md'
require_text "$pi_runtime" 'skills/workflow/SKILL.md'
require_text "$shared_hook" '"decision-gate", "references", "runtime-kernel.md"'
require_text "$shared_hook" '"workflow", "SKILL.md"'
for file in "$pi_runtime" "$shared_hook"; do
  if grep -Fq 'skills/mode-contract/SKILL.md' "$file" || \
     grep -Fq 'skills/decision-gate/SKILL.md' "$file"; then
    fail "$file loads Mode Contract or Decision Gate instead of leaving them on demand"
  fi
done

if grep -Eq 'AGENTS\.md|CLAUDE\.md|freeflow-core\.md|activeHosts|activation block/import' "$shared_hook"; then
  fail "$shared_hook still uses host instruction files as activation markers"
fi

while IFS= read -r fixture_file; do
  if grep -Fq 'Use Freeflow for consequential work' "$fixture_file"; then
    fail "$fixture_file still contains generated activation text"
  fi
done < <(find "$repo_root/evals/fixtures" -path '*/tiny-post-setup-*' -name AGENTS.md -type f | sort)

jq empty "$registry"

jq -e '
  [.evals[] | select(.id | startswith("STP-"))] as $stp
  | ($stp | length) == 11
  and ([$stp[] | select((.expected_output + " " + (.assertions | join(" "))) | test("^Adds exactly one ## Freeflow block|^Creates \\.claude/rules/freeflow-core\\.md|canonical activation contract|activation block count"; "i"))] | length) == 0
' "$registry" >/dev/null || fail "setup fixtures still require generated host activation artifacts"

jq -e '
  .evals[]
  | select(.id == "STP-010")
  | (any(.assertions[]; test("compact runtime kernel"; "i")) and any(.assertions[]; test("full Workflow skill"; "i")))
' "$registry" >/dev/null || fail "STP-010 must assert same-session kernel and Workflow loading"

jq -e '
  .evals[]
  | select(.id == "STP-012")
  | any(.assertions[]; test("untrusted or disabled SessionStart hook"; "i"))
' "$registry" >/dev/null || fail "STP-012 must cover unavailable or untrusted runtime delivery"

jq -e '
  [.evals[] | select(.id == "STP-001" or .id == "STP-002" or .id == "STP-005" or .id == "STP-006" or .id == "STP-007" or .id == "STP-008" or .id == "STP-009" or .id == "STP-010" or .id == "STP-011" or .id == "STP-012")
    | select(any(.assertions[]; test("runtime delivery"; "i")) | not)]
  | length == 0
' "$registry" >/dev/null || fail "successful setup fixtures must report runtime delivery separately"

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

printf 'Activation contract check passed: config-only activation, compact kernel loading, host-file preservation, and setup fixtures are aligned.\n'
