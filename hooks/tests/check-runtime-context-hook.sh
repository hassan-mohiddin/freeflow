#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)"
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
workflow_self_review_line="$(grep -m1 '^Self-review is required ' "$WORKFLOW_SKILL" || true)"
[[ -n "$workflow_owner_line" ]] || fail "canonical Workflow owner sentinel missing"
[[ -n "$workflow_self_review_line" ]] || fail "canonical Workflow self-review sentinel missing"
node --check "$HOOK_PATH"
node -e '
const fs = require("fs");
const hooks = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).hooks || {};
if (!Array.isArray(hooks.SessionStart) || hooks.SessionStart.length === 0) process.exit(1);
if (hooks.SessionStart[0]?.matcher !== "startup|resume|clear|compact") process.exit(1);
if (!Array.isArray(hooks.UserPromptSubmit) || hooks.UserPromptSubmit.length !== 1) process.exit(1);
if (hooks.UserPromptSubmit[0]?.matcher != null) process.exit(1);
if (!Array.isArray(hooks.SessionEnd) || hooks.SessionEnd.length !== 1) process.exit(1);
if (hooks.SessionEnd[0]?.matcher !== "clear") process.exit(1);
' "$HOOKS_JSON" || fail "hooks.json does not register the expected non-overlapping runtime events"

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
	'"hookEventName":"SessionStart"' \
	"# Freeflow Runtime Context" \
	'Runtime delivery: confirmed for this lifecycle-hook invocation.' \
	'Configured default: `workflow` (repository)' \
	'Effective mode: `workflow` (configured default, active)' \
	"# Freeflow Interaction Contract" \
	"Treat questions, criticism, examples, hypotheses, and tentative ideas as" \
	"# Freeflow Workflow Bootstrap" \
	"Use feedback to choose the smallest useful next action." \
	"$workflow_owner_line" \
	"$workflow_self_review_line" \
	'Interaction Contract: enabled' \
	'Skills: enabled'; do
	assert_contains "$codex_output" "$expected" "Codex config-only context"
done
assert_not_contains "$codex_output" "Output Router" "Codex host context"
assert_not_contains "$codex_output" "Output router:" "Codex host context"

# The Pi-only capability key is tolerated by shared host validators but is not
# injected into Codex or Claude runtime context.
cognitive_dir="$(mktemp -d)"
mkdir -p "$cognitive_dir/.freeflow"
printf '{"defaultMode":"workflow","cognitiveRouting":{"enabled":true,"profiles":{"standard":{"provider":"faux","model":"standard","thinkingLevel":"high"},"reasoning":{"provider":"faux","model":"reasoning","thinkingLevel":"max"}}}}\n' >"$cognitive_dir/.freeflow/config.json"
cognitive_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$cognitive_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$cognitive_output" "# Freeflow Runtime Context" "Pi-only capability tolerance"
assert_not_contains "$cognitive_output" "Cognitive Routing" "non-Pi capability isolation"
rm -rf "$cognitive_dir"
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
assert_not_contains "$codex_output" "## Conversation Mode Boundary" "workflow context"
assert_not_contains "$codex_output" "## Strict Workflow Overlay" "workflow context"

claude_output="$(printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s"}\n' "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_output" '"hookEventName":"SessionStart"' "Claude wrapper"
assert_contains "$claude_output" "# Freeflow Interaction Contract" "Claude config-only context"
assert_contains "$claude_output" "# Freeflow Workflow Bootstrap" "Claude first-turn context"
assert_contains "$claude_output" "Treat questions, criticism, examples, hypotheses, and tentative ideas as" "Claude config-only context"

# Session mode changes are host-managed state: they apply before the same model request,
# survive lifecycle restoration, remain isolated by session id, and never edit repo config.
session_data_dir="$(mktemp -d)"
session_id="session/with unsafe path characters"
config_before="$(shasum -a 256 "$tmp_dir/.freeflow/config.json" | awk '{print $1}')"
mode_change_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"Switch to conversation mode."}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
assert_contains "$mode_change_output" '"hookEventName":"UserPromptSubmit"' "same-turn mode change wrapper"
assert_contains "$mode_change_output" 'Session override: `conversation`' "same-turn mode change"
assert_contains "$mode_change_output" 'Effective mode: `conversation` (session override, active)' "same-turn mode change"
assert_contains "$mode_change_output" "## Conversation Mode Boundary" "same-turn mode change"

restored_mode_output="$(printf '{"hook_event_name":"SessionStart","source":"compact","session_id":"%s","cwd":"%s","model":"gpt-5"}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" SessionStart)"
assert_contains "$restored_mode_output" 'Configured default: `workflow` (repository)' "restored session mode"
assert_contains "$restored_mode_output" 'Session override: `conversation`' "restored session mode"
assert_contains "$restored_mode_output" 'Effective mode: `conversation` (session override, active)' "restored session mode"

other_session_output="$(printf '{"hook_event_name":"SessionStart","source":"resume","session_id":"other-session","cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" SessionStart)"
assert_contains "$other_session_output" 'Session override: none' "session mode isolation"
assert_contains "$other_session_output" 'Effective mode: `workflow` (configured default, active)' "session mode isolation"

ordinary_prompt_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"Please explain this function."}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
[[ -z "$ordinary_prompt_output" ]] || fail "ordinary prompts should not duplicate runtime context"
question_prompt_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"Should we switch to strict-workflow mode?"}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
[[ -z "$question_prompt_output" ]] || fail "mode questions should not mutate session state"
hypothetical_prompt_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"Suppose the mode were workflow."}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
[[ -z "$hypothetical_prompt_output" ]] || fail "mode hypotheticals should not mutate session state"
default_prompt_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"Change the default mode to strict-workflow."}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
[[ -z "$default_prompt_output" ]] || fail "default-mode requests should remain agent-routed configuration decisions"

native_change_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"$mode-contract strict-workflow"}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
assert_contains "$native_change_output" 'Session override: `strict-workflow`' "Codex native skill mode control"
assert_contains "$native_change_output" "## Strict Workflow Overlay" "Codex native skill mode control"

claude_data_dir="$(mktemp -d)"
claude_mode_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"claude-session","cwd":"%s","prompt":"/freeflow:mode-contract conversation"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
assert_contains "$claude_mode_output" '"hookEventName":"UserPromptSubmit"' "Claude native skill mode control"
assert_contains "$claude_mode_output" 'Session override: `conversation`' "Claude native skill mode control"
claude_restored_output="$(printf '{"hook_event_name":"SessionStart","source":"resume","session_id":"claude-session","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_restored_output" 'Effective mode: `conversation` (session override, active)' "Claude restored session mode"

# Claude /clear ends one session and starts another. SessionEnd transfers only the
# active override for this host process/workspace, and SessionStart consumes it exactly once.
claude_clear_end_output="$(printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"claude-session","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-a" node "$HOOK_PATH" SessionEnd)"
[[ -z "$claude_clear_end_output" ]] || fail "SessionEnd clear should not emit model context"
claude_clear_output="$(printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-session-after-clear","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-a" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_clear_output" 'Session override: `conversation`' "Claude clear session transfer"
assert_contains "$claude_clear_output" 'Effective mode: `conversation` (session override, active)' "Claude clear session transfer"
claude_unrelated_output="$(printf '{"hook_event_name":"SessionStart","source":"startup","session_id":"claude-unrelated-session","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_unrelated_output" 'Session override: none' "Claude clear transfer isolation"
claude_second_clear_output="$(printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-second-clear","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_second_clear_output" 'Session override: none' "Claude clear transfer one-shot consumption"

# A stale clear handoff is consumed without applying it.
claude_stale_mode_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"claude-stale-source","cwd":"%s","prompt":"Switch to strict-workflow mode."}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
assert_contains "$claude_stale_mode_output" 'Session override: `strict-workflow`' "Claude stale clear setup"
printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"claude-stale-source","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-stale" node "$HOOK_PATH" SessionEnd >/dev/null
clear_transfer_file="$(find "$claude_data_dir/session-modes/claude-clear" -type f -name '*.json' -print -quit)"
node - "$clear_transfer_file" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const state = JSON.parse(fs.readFileSync(path, "utf8"));
state.createdAt = new Date(Date.now() - 120000).toISOString();
fs.writeFileSync(path, `${JSON.stringify(state)}\n`);
NODE
claude_stale_clear_output="$(printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-stale-target","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-stale" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_stale_clear_output" 'Session override: none' "Claude stale clear transfer"
[[ ! -e "$clear_transfer_file" ]] || fail "stale Claude clear transfer should be consumed"

# Malformed plugin-owned transfer content fails closed without suppressing the
# normal SessionStart context and is consumed rather than retried forever.
printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"claude-stale-source","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-malformed" node "$HOOK_PATH" SessionEnd >/dev/null
malformed_transfer_file="$(find "$claude_data_dir/session-modes/claude-clear" -type f -name '*.json' -print -quit)"
printf 'null\n' >"$malformed_transfer_file"
claude_malformed_clear_output="$(printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-malformed-target","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-malformed" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_malformed_clear_output" '# Freeflow Runtime Context' "Claude malformed clear transfer"
assert_contains "$claude_malformed_clear_output" 'Session override: none' "Claude malformed clear transfer"
[[ ! -e "$malformed_transfer_file" ]] || fail "malformed Claude clear transfer should be consumed"

# Overlapping clears in one workspace remain isolated by the host process ID.
printf '{"hook_event_name":"UserPromptSubmit","session_id":"claude-overlap-a","cwd":"%s","prompt":"Switch to conversation mode."}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" node "$HOOK_PATH" UserPromptSubmit >/dev/null
printf '{"hook_event_name":"UserPromptSubmit","session_id":"claude-overlap-b","cwd":"%s","prompt":"Switch to strict-workflow mode."}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" node "$HOOK_PATH" UserPromptSubmit >/dev/null
printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"claude-overlap-a","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-overlap-a" node "$HOOK_PATH" SessionEnd >/dev/null
printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"claude-overlap-b","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-overlap-b" node "$HOOK_PATH" SessionEnd >/dev/null
claude_overlap_b_output="$(printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-overlap-b-new","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-overlap-b" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_overlap_b_output" 'Session override: `strict-workflow`' "Claude overlapping clear B"
claude_overlap_a_output="$(printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-overlap-a-new","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-overlap-a" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_overlap_a_output" 'Session override: `conversation`' "Claude overlapping clear A"

# A no-override clear removes any stale transfer for the same process/workspace.
printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"claude-no-override","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-overlap-a" node "$HOOK_PATH" SessionEnd >/dev/null
claude_no_override_clear_output="$(printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-no-override-new","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-overlap-a" node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_no_override_clear_output" 'Session override: none' "Claude no-override clear"

# Transfer consumption claims the handoff atomically: two concurrent starts can
# never both receive the same override.
printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"claude-overlap-b-new","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-race" node "$HOOK_PATH" SessionEnd >/dev/null
race_output_a="$(mktemp)"
race_output_b="$(mktemp)"
printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-race-a","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-race" node "$HOOK_PATH" SessionStart >"$race_output_a" &
race_pid_a=$!
printf '{"hook_event_name":"SessionStart","source":"clear","session_id":"claude-race-b","cwd":"%s"}\n' "$tmp_dir" | CLAUDE_PLUGIN_DATA="$claude_data_dir" CLAUDE_PID="claude-process-race" node "$HOOK_PATH" SessionStart >"$race_output_b" &
race_pid_b=$!
wait "$race_pid_a" "$race_pid_b"
race_override_count="$(grep -Fh 'Session override: `strict-workflow`' "$race_output_a" "$race_output_b" | wc -l | tr -d ' ')"
[[ "$race_override_count" == "1" ]] || fail "Claude clear transfer should have exactly one concurrent consumer"
rm -f "$race_output_a" "$race_output_b"

# Codex currently reports SessionEnd reason=other, so it must never stage a
# Claude-style clear handoff.
codex_clear_data_dir="$(mktemp -d)"
printf '{"hook_event_name":"UserPromptSubmit","session_id":"codex-source","cwd":"%s","prompt":"Switch to conversation mode."}\n' "$tmp_dir" | PLUGIN_DATA="$codex_clear_data_dir" node "$HOOK_PATH" UserPromptSubmit >/dev/null
printf '{"hook_event_name":"SessionEnd","reason":"other","session_id":"codex-source","cwd":"%s"}\n' "$tmp_dir" | PLUGIN_DATA="$codex_clear_data_dir" node "$HOOK_PATH" SessionEnd >/dev/null
if [[ -d "$codex_clear_data_dir/session-modes/claude-clear" ]]; then
	fail "Codex SessionEnd should not stage Claude clear state"
fi
rm -rf "$codex_clear_data_dir" "$claude_data_dir"

reset_output="$(printf '{"hook_event_name":"UserPromptSubmit","session_id":"%s","cwd":"%s","prompt":"Reset the session mode."}\n' "$session_id" "$tmp_dir" | PLUGIN_DATA="$session_data_dir" node "$HOOK_PATH" UserPromptSubmit)"
assert_contains "$reset_output" 'Session override: cleared' "session mode reset"
assert_contains "$reset_output" 'Effective mode: `workflow` (configured default, active)' "session mode reset"
config_after="$(shasum -a 256 "$tmp_dir/.freeflow/config.json" | awk '{print $1}')"
[[ "$config_before" == "$config_after" ]] || fail "session mode controls modified repository config"
if find "$session_data_dir" -type f -print | grep -Fq "$session_id"; then
	fail "raw session id leaked into the session-state path"
fi
rm -rf "$session_data_dir"

for source in startup resume clear compact; do
	codex_event_output="$(printf '{"hook_event_name":"SessionStart","source":"%s","cwd":"%s","model":"gpt-5"}\n' "$source" "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
	claude_event_output="$(printf '{"hook_event_name":"SessionStart","source":"%s","cwd":"%s"}\n' "$source" "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
	for host in codex claude; do
		if [[ "$host" == "codex" ]]; then
			event_output="$codex_event_output"
		else
			event_output="$claude_event_output"
			assert_contains "$event_output" '"hookEventName":"SessionStart"' "Claude $source wrapper"
		fi
		assert_contains "$event_output" "# Freeflow Interaction Contract" "$host $source SessionStart context"
		assert_contains "$event_output" "# Freeflow Workflow Bootstrap" "$host $source SessionStart context"
		contract_count="$(grep -Fo '# Freeflow Interaction Contract' <<<"$event_output" | wc -l | tr -d ' ')"
		bootstrap_count="$(grep -Fo '# Freeflow Workflow Bootstrap' <<<"$event_output" | wc -l | tr -d ' ')"
		[[ "$contract_count" == "1" ]] || fail "$host $source SessionStart should load the Interaction Contract exactly once"
		[[ "$bootstrap_count" == "1" ]] || fail "$host $source SessionStart should load Workflow exactly once"
	done
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
assert_contains "$local_output" 'Configured default: `strict-workflow` (personal)' "local default override"
assert_contains "$local_output" 'Effective mode: `strict-workflow` (configured default, active)' "local default source"
assert_contains "$local_output" "## Strict Workflow Overlay" "local strict overlay"
assert_contains "$local_output" "security, privacy, billing, data loss, migrations, public interfaces" "local strict overlay"
assert_contains "$local_output" "# Freeflow Interaction Contract" "local default override"
assert_contains "$local_output" "# Freeflow Workflow Bootstrap" "local default override"
rm -rf "$local_dir"

local_interaction_dir="$(mktemp -d)"
mkdir -p "$local_interaction_dir/.freeflow"
printf '{"defaultMode":"workflow"}\n' >"$local_interaction_dir/.freeflow/config.json"
printf '{"interactionContract":false}\n' >"$local_interaction_dir/.freeflow/local.json"
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
assert_contains "$local_skills_output" 'Resolved mode: `conversation` (dormant because Skills are disabled)' "local dormant mode"
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
assert_contains "$local_disabled_output" 'Configured but inactive: `enabled` is false (personal).' "local master source"
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
assert_contains "$router_output" "Skills: disabled" "Codex context with legacy router config"
assert_contains "$router_output" "# Freeflow Interaction Contract" "Codex context with legacy router config"
assert_not_contains "$router_output" "# Freeflow Workflow Bootstrap" "Codex context with disabled skills"
assert_not_contains "$router_output" "Output Router" "Codex context with legacy router config"
assert_not_contains "$router_output" "Output router:" "Codex context with legacy router config"
rm -rf "$router_dir"

all_dir="$(mktemp -d)"
mkdir -p "$all_dir/.freeflow"
printf '{"defaultMode":"strict-workflow","outputRouter":{"enabled":true}}\n' >"$all_dir/.freeflow/config.json"
all_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$all_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$all_output" "# Freeflow Interaction Contract" "Codex strict context"
assert_contains "$all_output" "# Freeflow Workflow Bootstrap" "Codex strict context"
assert_not_contains "$all_output" "Output Router" "Codex strict context"
assert_not_contains "$all_output" "Output router:" "Codex strict context"
assert_contains "$all_output" 'Effective mode: `strict-workflow` (configured default, active)' "Codex strict context"
assert_contains "$all_output" "## Strict Workflow Overlay" "all-capabilities strict overlay"
rm -rf "$all_dir"

conversation_dir="$(mktemp -d)"
mkdir -p "$conversation_dir/.freeflow"
printf '{"defaultMode":"conversation"}\n' >"$conversation_dir/.freeflow/config.json"
conversation_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$conversation_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$conversation_output" 'Configured default: `conversation` (repository)' "conversation context"
assert_contains "$conversation_output" 'Effective mode: `conversation` (configured default, active)' "conversation context"
assert_contains "$conversation_output" "## Conversation Mode Boundary" "conversation overlay"
assert_contains "$conversation_output" "Do not call write, edit, or mutating tools" "conversation overlay"
assert_contains "$conversation_output" "an execution skill does not override this boundary" "conversation overlay"
rm -rf "$conversation_dir"

observed_dir="$(mktemp -d)"
mkdir -p "$observed_dir/.freeflow"
printf '{"defaultMode":"workflow","outputRouter":{"enabled":true,"observedRouting":{"enabled":true}},"scriptTransform":{"enabled":false}}\n' >"$observed_dir/.freeflow/config.json"
observed_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$observed_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$observed_output" "# Freeflow Interaction Contract" "Codex context with observed-routing config"
assert_contains "$observed_output" "# Freeflow Workflow Bootstrap" "Codex context with observed-routing config"
assert_not_contains "$observed_output" "Output Router" "Codex context with observed-routing config"
assert_not_contains "$observed_output" "Output router:" "Codex context with observed-routing config"
rm -rf "$observed_dir"

echo "runtime-context hook checks passed"
