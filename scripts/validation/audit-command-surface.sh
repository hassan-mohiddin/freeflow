#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
plugin_root="$repo_root"
registry="$plugin_root/command-surface.json"
manifest="$plugin_root/.codex-plugin/plugin.json"
command_docs="$plugin_root/README.md"
skills_dir="$plugin_root/skills"
mode_skill="$skills_dir/mode-contract/SKILL.md"
pi_extension="$plugin_root/pi-extension/src/runtime/runtime-context.ts"
pi_extension_dist="$plugin_root/pi-extension/dist/runtime/runtime-context.js"

failures=0

fail() {
	printf 'FAIL: %s\n' "$1" >&2
	failures=$((failures + 1))
}

pi_workflow_commands="$(mktemp)"
pi_contributor_commands="$(mktemp)"
pi_native_commands="$(mktemp)"
trap 'rm -f "$pi_workflow_commands" "$pi_contributor_commands" "$pi_native_commands"' EXIT

extract_pi_native_commands() {
	local output_file="$1"

	node - "$plugin_root/pi-extension/src/index.ts" >"$output_file" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const source = fs.readFileSync(path, 'utf8');
const pattern = /pi\.registerCommand\("([^"]+)"/g;
for (const item of source.matchAll(pattern)) {
  console.log(`/${item[1]}`);
}
if (source.includes("handleCognitiveRoutingProfileCommand") && source.includes("cognitiveRoutingProfileCompletions")) {
  console.log("/freeflow profile <standard|reasoning|auto>");
}
NODE
}

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
extract_pi_native_commands "$pi_native_commands"

if [ "$(jq -r '.nativeSlashHandlers' "$registry")" != "false" ]; then
	fail "nativeSlashHandlers should remain false because Freeflow uses host-native skill invocation rather than manifest command handlers"
fi

if jq -e 'has("commands") or has("slashCommands")' "$manifest" >/dev/null; then
	fail "plugin manifest declares duplicate command handlers while Freeflow uses host-native skill invocation"
fi

if [ "$(jq -r '.hostNativeSkillInvocation.claude' "$registry")" != "namespaced-slash-skill" ] ||
	[ "$(jq -r '.hostNativeSkillInvocation.codex' "$registry")" != "skill-mention" ] ||
	[ "$(jq -r '.hostNativeSkillInvocation.pi' "$registry")" != "registered-command" ]; then
	fail "host-native skill invocation metadata is incomplete"
fi

if [ "$(jq -r '.sessionModeControls.claude' "$registry")" != '/freeflow:mode-contract <mode|reset>' ] ||
	[ "$(jq -r '.sessionModeControls.codex' "$registry")" != '$mode-contract <mode|reset>' ] ||
	[ "$(jq -r '.sessionModeControls.pi' "$registry")" != '/freeflow mode <mode|reset>' ] ||
	[ "$(jq -r '.sessionModeControls.naturalLanguage' "$registry")" != "true" ]; then
	fail "session mode control metadata is incomplete"
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

if jq -e '.directSkillCalls[] | select(.aliasFor != null)' "$registry" >/dev/null; then
\tfail "compatibility aliases are not supported in the active command surface"
fi

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
	if [[ "$command" != /freeflow\ mode\ * ]]; then
		fail "mode command should use /freeflow mode prefix: $command"
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

	if ! rg -Fq "$command" "$mode_skill"; then
		fail "$command is missing from mode-contract"
	fi
done < <(jq -r '.modeCommands[] | [.command, .routesTo] | @tsv' "$registry")

if rg -n '^/workflow (conversation|workflow|strict-workflow|reset)$' "$mode_skill" >/dev/null; then
	fail "stale /workflow mode alias remains in the active mode skill"
fi

if ! rg -Fq 'Task shape does not change mode.' "$mode_skill"; then
	fail "mode-contract does not preserve the configured effective mode across task shapes"
fi
if rg -Fq 'If no current conversation override exists and the user asks to implement' "$mode_skill"; then
	fail "mode-contract still infers workflow from task type instead of honoring the effective mode"
fi

for legacy_skill in deprecation-and-migration shipping-and-launch; do
	if [ -e "$skills_dir/$legacy_skill" ]; then
		fail "legacy skill directory remains: $legacy_skill"
	fi

	if rg -n "$legacy_skill" \
		"$registry" \
		"$pi_extension" \
		"$pi_extension_dist" \
		"$plugin_root/README.md" \
		"$plugin_root/plugin-docs/skill-routing.md" \
		"$plugin_root/README.md" \
		"$plugin_root/plugin-docs" \
		"$command_docs" \
		"$skills_dir" >/dev/null; then
		fail "legacy skill identity remains in active runtime or docs: $legacy_skill"
	fi
done

for stale_active_label in discovery-light "Deprecation and migration" "Shipping and launch"; do
	if rg -n -F "$stale_active_label" \
		"$skills_dir" \
		"$pi_extension" \
		"$pi_extension_dist" \
		"$plugin_root/README.md" \
		"$plugin_root/plugin-docs" \
		"$command_docs" >/dev/null; then
		fail "stale active skill label remains: $stale_active_label"
	fi
done

while IFS=$'\t' read -r command handler kind; do
	if [[ "$command" != /* ]]; then
		fail "Pi native command does not start with slash: $command"
	fi

	if ! command_exists "$pi_native_commands" "$command"; then
		fail "$command is missing from Pi native command registration"
	fi

	if ! rg -Fq "$command" "$command_docs" "$registry"; then
		fail "$command is missing from command-surface documentation"
	fi

	if [ -z "$handler" ] || [ -z "$kind" ]; then
		fail "$command Pi native command must declare handler and kind"
	fi
done < <(jq -r '.piNativeCommands[]? | [.command, .handler, .kind] | @tsv' "$registry")

if [ "$failures" -gt 0 ]; then
	exit 1
fi

printf 'Command surface audit passed: %s direct skill calls, %s developer skill calls, %s mode commands, %s Pi native commands, host-native skill invocation declared.\n' \
	"$(jq '.directSkillCalls | length' "$registry")" \
	"$(jq '.developerSkillCalls | length' "$registry")" \
	"$(jq '.modeCommands | length' "$registry")" \
	"$(jq '.piNativeCommands // [] | length' "$registry")"
