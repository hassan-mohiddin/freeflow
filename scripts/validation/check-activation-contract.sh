#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
setup_skill="$repo_root/skills/setup-freeflow/SKILL.md"
contract="$repo_root/skills/setup-freeflow/references/activation-contract.md"
host_setup="$repo_root/skills/setup-freeflow/references/host-setup.md"
core_prompt="$repo_root/runtime/prompts/core.md"
interaction_contract="$repo_root/runtime/prompts/interaction-contract.md"
workflow_skill="$repo_root/skills/workflow/SKILL.md"
action_selection_skill="$repo_root/skills/action-selection/SKILL.md"
cognitive_routing_prompt="$repo_root/runtime/prompts/cognitive-routing.md"
context_virtualization_prompt="$repo_root/runtime/prompts/context-virtualization.md"
conversation_history_prompt="$repo_root/runtime/prompts/conversation-history.md"
agents_file="$repo_root/AGENTS.md"
runtime_doc="$repo_root/plugin-docs/architecture.md"
architecture_doc="$repo_root/plugin-docs/architecture.md"
workflow_doc="$repo_root/plugin-docs/workflow.md"
pi_runtime="$repo_root/pi-extension/src/runtime/runtime-context.ts"
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
	"$core_prompt" \
	"$interaction_contract" \
	"$workflow_skill" \
	"$action_selection_skill" \
	"$cognitive_routing_prompt" \
	"$context_virtualization_prompt" \
	"$conversation_history_prompt" \
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
require_text "$setup_skill" '../../runtime/prompts/interaction-contract.md'
require_text "$setup_skill" '../workflow/SKILL.md'

require_text "$interaction_contract" '# Freeflow Interaction Contract'
require_text "$interaction_contract" 'Questions, criticism, examples, hypotheses, and tentative ideas do not authorize action by themselves.'
require_text "$core_prompt" '## Shared Terms'
require_text "$workflow_skill" 'Own the outer Interaction Lifecycle.'
require_text "$workflow_skill" 'When the owner needs an environment interaction and the action or tool choice is not already obvious'
require_text "$action_selection_skill" 'Choose one covered environment interaction'
require_text "$action_selection_skill" 'return the changed evidence to the current owner.'
require_text "$runtime_doc" 'runtime/prompts/'
require_text "$runtime_doc" 'Workflow, Action Selection, and Supported Exit cues'
require_text "$workflow_doc" 'Interaction Lifecycle'

require_text "$pi_runtime" '../../../runtime/prompts/core.md'
require_text "$pi_runtime" '../../../runtime/prompts/interaction-contract.md'
require_text "$pi_runtime" '../../../runtime/prompts/cognitive-routing.md'
require_text "$pi_runtime" '../../../runtime/prompts/context-virtualization.md'
require_text "$pi_runtime" '../../../runtime/prompts/conversation-history.md'
require_text "$shared_hook" '"runtime", "prompts", "interaction-contract.md"'
require_text "$shared_hook" 'return eventName === "SessionStart";'

for file in \
	"$agents_file" \
	"$repo_root/CONTEXT.md" \
	"$repo_root/README.md" \
	"$repo_root/plugin-docs/README.md" \
	"$workflow_doc" \
	"$repo_root/plugin-docs/release.md" \
	"$repo_root/plugin-docs/integrations/pi.md" \
	"$repo_root/plugin-docs/integrations/piflow.md" \
	"$architecture_doc" \
	"$repo_root/plugin-docs/release-evidence/README.md"; do
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

if grep -Eq 'AGENTS\.md|CLAUDE\.md|freeflow-core\.md|activeHosts|activation block/import' "$shared_hook"; then
	fail "$shared_hook still uses host instruction files as activation markers"
fi

if grep -Eqi 'output router|output-router|outputRouter' "$setup_skill" "$contract" "$host_setup"; then
	fail "Codex/Claude core setup guidance still exposes the Pi-only Output Router capability"
fi

if grep -Eq 'outputRouterEnabled|Loaded Output Router|Output router:' "$shared_hook"; then
	fail "Codex/Claude lifecycle context still inspects or exposes effective Output Router state"
fi

if [[ "$failures" -gt 0 ]]; then
	exit 1
fi

printf 'Activation contract check passed: layered config, prompt fragments, discoverable skills, and host-file preservation are aligned.\n'
