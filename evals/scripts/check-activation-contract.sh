#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
setup_skill="$repo_root/skills/setup-freeflow/SKILL.md"
contract="$repo_root/skills/setup-freeflow/references/activation-contract.md"
host_setup="$repo_root/skills/setup-freeflow/references/host-setup.md"
kernel="$repo_root/skills/decision-gate/references/runtime-kernel.md"
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

for file in "$setup_skill" "$contract" "$host_setup" "$kernel" "$runtime_doc" "$registry" "$pi_runtime" "$shared_hook"; do
  [[ -f "$file" ]] || fail "missing required file: $file"
done

require_text "$setup_skill" '.freeflow/config.json` the only repo activation boundary'
require_text "$contract" ".freeflow/config.json\` is Freeflow's sole repo activation boundary"
require_text "$host_setup" 'Do not generate host-specific Freeflow instructions'
require_text "$setup_skill" 'Do not create or append a Freeflow block in `AGENTS.md`'
require_text "$setup_skill" 'runtime delivery is **confirmed**, **unavailable**, or **unconfirmed**'
require_text "$setup_skill" '../decision-gate/references/runtime-kernel.md'
require_text "$setup_skill" 'references/output-router-setup.md'
require_text "$setup_skill" '../output-router/SKILL.md'
require_text "$setup_skill" '../delegation-harness/SKILL.md'
require_text "$contract" 'The compact-kernel change does not alter their skill bodies, tool/runtime ownership, opt-in defaults, or setup policy.'
require_text "$kernel" '# Freeflow Runtime Kernel'
require_text "$kernel" 'act as a collaborative engineering partner'
require_text "$runtime_doc" 'activation-contract.md'

for file in "$setup_skill" "$contract" "$host_setup"; do
  if grep -Eqi 'legacy|migrat(e|ion|ing)' "$file"; then
    fail "$file defines host-instruction conversion behavior outside the setup scope"
  fi
done

require_text "$pi_runtime" 'skills/decision-gate/references/runtime-kernel.md'
require_text "$shared_hook" '"decision-gate", "references", "runtime-kernel.md"'
for file in "$pi_runtime" "$shared_hook"; do
  if grep -Fq 'skills/mode-contract/SKILL.md' "$file" || \
     grep -Fq 'skills/workflow/SKILL.md' "$file" || \
     grep -Fq 'skills/decision-gate/SKILL.md' "$file"; then
    fail "$file still loads full always-on core skill bodies"
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
  | any(.assertions[]; test("compact runtime kernel"; "i"))
' "$registry" >/dev/null || fail "STP-010 must assert same-session compact runtime-kernel loading"

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
