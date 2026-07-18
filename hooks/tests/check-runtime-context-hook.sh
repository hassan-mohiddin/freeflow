#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
HOOK_PATH="$ROOT_DIR/hooks/freeflow-runtime-context.mjs"
HOOKS_JSON="$ROOT_DIR/hooks/hooks.json"
WORKFLOW_SKILL="$ROOT_DIR/skills/workflow/SKILL.md"

fail() {
	echo "runtime-context hook check failed: $*" >&2
	exit 1
}

assert_contains() {
	local text="$1"
	local expected="$2"
	local label="$3"
	grep -Fq -- "$expected" <<<"$text" || fail "$label missing '$expected'"
}

assert_not_contains() {
	local text="$1"
	local unexpected="$2"
	local label="$3"
	if grep -Fq -- "$unexpected" <<<"$text"; then
		fail "$label unexpectedly contains '$unexpected'"
	fi
}

[[ -f "$HOOK_PATH" ]] || fail "missing hook script"
[[ -f "$HOOKS_JSON" ]] || fail "missing hooks manifest"
[[ -f "$WORKFLOW_SKILL" ]] || fail "missing canonical Workflow skill"
workflow_owner_line="$(grep -m1 '^The active agent owns ' "$WORKFLOW_SKILL" || true)"
workflow_self_review_line="$(grep -m1 '^Self-review is silent ' "$WORKFLOW_SKILL" || true)"
[[ -n "$workflow_owner_line" ]] || fail "canonical Workflow owner sentinel missing"
[[ -n "$workflow_self_review_line" ]] || fail "canonical Workflow self-review sentinel missing"
node --check "$HOOK_PATH"
node -e '
const fs = require("fs");
const hooks = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).hooks || {};
if (!Array.isArray(hooks.SessionStart) || hooks.SessionStart.length === 0) process.exit(1);
if (hooks.SessionStart[0]?.matcher !== "startup|resume|clear|compact") process.exit(1);
' "$HOOKS_JSON" || fail "hooks.json does not register the expected SessionStart lifecycle matcher"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/.freeflow"
printf '{"defaultMode":"workflow"}\n' >"$tmp_dir/.freeflow/config.json"

codex_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
disabled_by_env="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 node "$HOOK_PATH" SessionStart)"
[[ -z "$disabled_by_env" ]] || fail "FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 should suppress injection"

post_tool_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | node "$HOOK_PATH" PostToolUse)"
[[ -z "$post_tool_output" ]] || fail "PostToolUse should not inject runtime context"
user_prompt_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | node "$HOOK_PATH" UserPromptSubmit)"
[[ -z "$user_prompt_output" ]] || fail "UserPromptSubmit should not duplicate session-start runtime context"

for expected in \
	"# Freeflow Runtime Context" \
	'Setup status: configured by `.freeflow/config.json`' \
	"Runtime delivery: confirmed for this lifecycle-hook invocation." \
	"# Freeflow Interaction Contract" \
	"Answer questions without inferring action." \
	"# Freeflow Workflow Bootstrap" \
	"Use feedback to choose the smallest useful next action." \
	"$workflow_owner_line" \
	"$workflow_self_review_line" \
	'Current Freeflow default mode: `workflow`.' \
	'Interaction Contract: enabled' \
	'Skills: enabled' \
	'Output router: disabled'; do
	assert_contains "$codex_output" "$expected" "Codex config-only context"
done
for excluded_heading in \
	"# Freeflow Runtime Kernel" \
	"## Freeflow Runtime Priority" \
	"## Loaded Mode Contract Skill" \
	"## Loaded Workflow Skill" \
	"## Loaded Decision Gate Skill" \
	"## Discovery-light" \
	"## Loaded Output Router Skill"; do
	assert_not_contains "$codex_output" "$excluded_heading" "default context"
done
workflow_bootstrap_count="$(grep -Fo '# Freeflow Workflow Bootstrap' <<<"$codex_output" | wc -l | tr -d ' ')"
[[ "$workflow_bootstrap_count" == "1" ]] || fail "Codex SessionStart should load Workflow exactly once"

claude_output="$(printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s"}\n' "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_output" '"hookEventName":"SessionStart"' "Claude wrapper"
assert_contains "$claude_output" "# Freeflow Interaction Contract" "Claude config-only context"
assert_contains "$claude_output" "# Freeflow Workflow Bootstrap" "Claude first-turn context"
assert_contains "$claude_output" "Answer questions without inferring action." "Claude config-only context"

for source in startup resume clear compact; do
	event_output="$(printf '{"hook_event_name":"SessionStart","source":"%s","cwd":"%s","model":"gpt-5"}\n' "$source" "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
	assert_contains "$event_output" "# Freeflow Interaction Contract" "$source SessionStart context"
done

# Repo-owned host instructions are neither required for activation nor modified by the read-only hook.
printf '# Repo agents\n\nKeep this guidance.\n' >"$tmp_dir/AGENTS.md"
printf '# Repo Claude\n\nKeep this guidance too.\n' >"$tmp_dir/CLAUDE.md"
cp "$tmp_dir/AGENTS.md" "$tmp_dir/AGENTS.before"
cp "$tmp_dir/CLAUDE.md" "$tmp_dir/CLAUDE.before"
host_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$host_output" "# Freeflow Interaction Contract" "host-independent activation"
cmp -s "$tmp_dir/AGENTS.before" "$tmp_dir/AGENTS.md" || fail "hook modified AGENTS.md"
cmp -s "$tmp_dir/CLAUDE.before" "$tmp_dir/CLAUDE.md" || fail "hook modified CLAUDE.md"

# Repository config remains the only activation boundary; local config only overrides it.
missing_dir="$(mktemp -d)"
invalid_dir="$(mktemp -d)"
mkdir -p "$invalid_dir/.freeflow"
printf '{invalid\n' >"$invalid_dir/.freeflow/config.json"
missing_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$missing_dir" | node "$HOOK_PATH" SessionStart)"
invalid_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$invalid_dir" | node "$HOOK_PATH" SessionStart)"
[[ -z "$missing_output" ]] || fail "missing config should not activate runtime context"
[[ -z "$invalid_output" ]] || fail "invalid config should not activate runtime context"
rm -rf "$missing_dir" "$invalid_dir"

local_dir="$(mktemp -d)"
mkdir -p "$local_dir/.freeflow"
printf '{"defaultMode":"workflow"}\n' >"$local_dir/.freeflow/config.json"
printf '{"defaultMode":"strict-workflow"}\n' >"$local_dir/.freeflow/local.json"
local_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$local_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$local_output" 'Current Freeflow default mode: `strict-workflow`.' "local default override"
assert_contains "$local_output" 'defaultMode `strict-workflow` from local' "local default source"
assert_contains "$local_output" "# Freeflow Interaction Contract" "local default override"
assert_contains "$local_output" "# Freeflow Workflow Bootstrap" "local default override"
rm -rf "$local_dir"

local_interaction_dir="$(mktemp -d)"
mkdir -p "$local_interaction_dir/.freeflow"
printf '{"defaultMode":"workflow"}\n' > "$local_interaction_dir/.freeflow/config.json"
printf '{"interactionContract":false}\n' > "$local_interaction_dir/.freeflow/local.json"
local_interaction_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$local_interaction_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$local_interaction_output" 'Interaction Contract: disabled' "independent local interaction override"
assert_contains "$local_interaction_output" 'Skills: enabled' "independent local interaction override"
assert_not_contains "$local_interaction_output" "# Freeflow Interaction Contract" "independent local interaction override"
assert_contains "$local_interaction_output" "# Freeflow Workflow Bootstrap" "independent local interaction override"
rm -rf "$local_interaction_dir"

local_skills_dir="$(mktemp -d)"
mkdir -p "$local_skills_dir/.freeflow"
printf '{"defaultMode":"workflow"}\n' >"$local_skills_dir/.freeflow/config.json"
printf '{"defaultMode":"conversation","interactionContract":false,"skills":{"enabled":false}}\n' >"$local_skills_dir/.freeflow/local.json"
local_skills_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$local_skills_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$local_skills_output" 'Resolved default mode: `conversation` (dormant because Skills are disabled).' "local dormant mode"
assert_contains "$local_skills_output" 'Interaction Contract: disabled' "local interaction override"
assert_contains "$local_skills_output" 'Skills: disabled' "local skills override"
assert_not_contains "$local_skills_output" "# Freeflow Interaction Contract" "local interaction override"
assert_not_contains "$local_skills_output" "# Freeflow Workflow Bootstrap" "local skills override"
rm -rf "$local_skills_dir"

invalid_local_dir="$(mktemp -d)"
mkdir -p "$invalid_local_dir/.freeflow"
printf '{"defaultMode":"workflow"}\n' >"$invalid_local_dir/.freeflow/config.json"
printf '{"skills":{"enabled":"no"}}\n' >"$invalid_local_dir/.freeflow/local.json"
invalid_local_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$invalid_local_dir" | node "$HOOK_PATH" SessionStart)"
[[ -z "$invalid_local_output" ]] || fail "invalid local config should fail closed"
rm -rf "$invalid_local_dir"

local_disabled_dir="$(mktemp -d)"
mkdir -p "$local_disabled_dir/.freeflow"
printf '{"enabled":true,"defaultMode":"workflow"}\n' >"$local_disabled_dir/.freeflow/config.json"
printf '{"enabled":false,"processing":{"unsafeUnsandboxed":{"enabled":true}}}\n' >"$local_disabled_dir/.freeflow/local.json"
local_disabled_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$local_disabled_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$local_disabled_output" "# Freeflow Disabled" "local master override"
assert_contains "$local_disabled_output" "effective \`enabled\` is false from local" "local master source"
assert_not_contains "$local_disabled_output" "# Freeflow Interaction Contract" "local master override"
rm -rf "$local_disabled_dir"

disabled_dir="$(mktemp -d)"
mkdir -p "$disabled_dir/.freeflow"
printf '{"enabled":false,"defaultMode":"workflow"}\n' >"$disabled_dir/.freeflow/config.json"
disabled_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$disabled_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$disabled_output" "# Freeflow Disabled" "disabled context"
assert_not_contains "$disabled_output" "# Freeflow Runtime Kernel" "disabled context"
rm -rf "$disabled_dir"

router_dir="$(mktemp -d)"
mkdir -p "$router_dir/.freeflow"
printf '{"defaultMode":"workflow","skills":{"enabled":false},"outputRouter":{"enabled":true}}\n' >"$router_dir/.freeflow/config.json"
router_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$router_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$router_output" "Skills: disabled" "router-only context"
assert_contains "$router_output" "## Loaded Output Router Skill" "router-only context"
assert_contains "$router_output" "# Freeflow Interaction Contract" "router-only context"
assert_not_contains "$router_output" "# Freeflow Workflow Bootstrap" "router-only context"
rm -rf "$router_dir"

all_dir="$(mktemp -d)"
mkdir -p "$all_dir/.freeflow"
printf '{"defaultMode":"strict-workflow","outputRouter":{"enabled":true}}\n' >"$all_dir/.freeflow/config.json"
all_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$all_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$all_output" "# Freeflow Interaction Contract" "all-capabilities context"
assert_contains "$all_output" "## Loaded Output Router Skill" "all-capabilities context"
assert_contains "$all_output" 'Current Freeflow default mode: `strict-workflow`.' "all-capabilities context"
rm -rf "$all_dir"

conversation_dir="$(mktemp -d)"
mkdir -p "$conversation_dir/.freeflow"
printf '{"defaultMode":"conversation"}\n' >"$conversation_dir/.freeflow/config.json"
conversation_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$conversation_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$conversation_output" 'Current Freeflow default mode: `conversation`.' "conversation context"
assert_contains "$conversation_output" '`conversation`: answer, discuss, critique, and inspect read-only' "conversation context"
rm -rf "$conversation_dir"

observed_dir="$(mktemp -d)"
mkdir -p "$observed_dir/.freeflow"
printf '{"defaultMode":"workflow","outputRouter":{"enabled":true,"observedRouting":{"enabled":true}},"scriptTransform":{"enabled":false}}\n' >"$observed_dir/.freeflow/config.json"
observed_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$observed_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$observed_output" "# Freeflow Interaction Contract" "observed-routing config"
assert_contains "$observed_output" "## Loaded Output Router Skill" "observed-routing config"
rm -rf "$observed_dir"

echo "runtime-context hook checks passed"
