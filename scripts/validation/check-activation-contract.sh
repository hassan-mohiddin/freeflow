#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
setup_skill="$repo_root/skills/setup-freeflow/SKILL.md"
contract="$repo_root/skills/setup-freeflow/references/activation-contract.md"
host_setup="$repo_root/skills/setup-freeflow/references/host-setup.md"
kernel="$repo_root/skills/decision-gate/references/runtime-kernel.md"
workflow_skill="$repo_root/skills/workflow/SKILL.md"
write_plan_skill="$repo_root/skills/write-plan/SKILL.md"
execute_plan_skill="$repo_root/skills/execute-plan/SKILL.md"
review_work_skill="$repo_root/skills/review-work/SKILL.md"
review_artifact_skill="$repo_root/skills/review-artifact/SKILL.md"
verify_work_skill="$repo_root/skills/verify-work/SKILL.md"
agents_file="$repo_root/AGENTS.md"
runtime_doc="$repo_root/docs/freeflow-runtime-and-lifecycle.md"
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

for file in "$setup_skill" "$contract" "$host_setup" "$kernel" "$workflow_skill" "$write_plan_skill" "$execute_plan_skill" "$review_work_skill" "$review_artifact_skill" "$verify_work_skill" "$agents_file" "$runtime_doc" "$pi_runtime" "$shared_hook"; do
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
require_text "$kernel" 'act as a responsible collaborative engineer'
require_text "$kernel" 'sets, resets, infers, or asks about Freeflow mode'
require_text "$kernel" 'Respond concisely, directly, and with high information density, at the depth the user requests.'
require_text "$kernel" 'Do not narrate routine tool use'
require_text "$kernel" 'Clarity overrides brevity'
require_text "$kernel" 'Before a consequential action or asking the user, silently check'
require_text "$kernel" 'the action is locally owned'
require_text "$kernel" 'ask one owner question'
require_text "$kernel" 'Tests and direct verification are primary feedback.'
require_text "$kernel" 'self-check in order: self-verify the outcome'
require_text "$kernel" 'only if evidence supports it, silently self-review'
require_text "$kernel" 'silently self-review your own work once'
require_text "$kernel" 'Correct local reversible mistakes directly.'
require_text "$kernel" 'diagnose before redesigning.'
require_text "$kernel" 'preserve valid work and re-enter the narrowest owning activity before editing again'
require_text "$kernel" 'do not patch forward because work began.'
require_text "$workflow_skill" 'The runtime kernel owns turn interpretation'
require_text "$workflow_skill" 'silently self-review your own work once'
require_text "$workflow_skill" 'Reading a skill enhances self-verification or self-review and never dispatches another context by itself.'
require_text "$workflow_skill" 'artifact-review route selected by `write-spec`'
require_text "$workflow_skill" 'Treat every phase exit as a review decision point'
require_text "$workflow_skill" 'plan-selected consequential phase-exit review carries scoped authorization'
require_text "$workflow_skill" 'one verifier plus a different reviewer in parallel'
require_text "$workflow_skill" 'frozen implementation'
require_text "$workflow_skill" 'Final roles use distinct fresh contexts and independent outputs.'
require_text "$workflow_skill" 'Reading skills never dispatches.'
require_text "$write_plan_skill" 'decide which phase exits need independent review'
require_text "$write_plan_skill" 'approval of the plan grants scoped authorization for that review'
require_text "$execute_plan_skill" "At a phase exit, run the approved plan's selected independent review"
require_text "$review_work_skill" 'Reading it does not imply independence'
require_text "$review_work_skill" 'approved plan-selected phase-exit review'
require_text "$review_work_skill" '**Enhanced self-review:**'
require_text "$review_work_skill" '`/review-work` selects this mode by default unless the user explicitly says inline'
require_text "$review_artifact_skill" 'Reading it does not imply independence'
require_text "$review_artifact_skill" '**Enhanced self-review:**'
require_text "$verify_work_skill" '**Enhanced self-verification:**'
require_text "$verify_work_skill" 'Reading the skill or calling `/verify-work` selects this mode by default and never claims independence.'
require_text "$verify_work_skill" 'run one standing-authorized independent verification against the frozen integrated implementation in parallel with the final reviewer'
require_text "$verify_work_skill" 'Collect its result with the independent review before adjudicating.'
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

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

printf 'Activation contract check passed: config-only activation, compact kernel loading, and host-file preservation are aligned.\n'
