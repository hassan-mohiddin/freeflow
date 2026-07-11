#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
plugin_root="$repo_root"
hooks_json="$plugin_root/hooks/hooks.json"
hook_script="$plugin_root/hooks/freeflow-runtime-context.mjs"

failures=0

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  failures=$((failures + 1))
}

require_contains() {
  local label="$1"
  local haystack="$2"
  local needle="$3"
  if [[ "$haystack" != *"$needle"* ]]; then
    fail "$label did not contain: $needle"
  fi
}

[ -f "$hooks_json" ] || fail "Missing hooks.json"
[ -f "$hook_script" ] || fail "Missing runtime context hook script"

if [ -f "$hooks_json" ]; then
  jq empty "$hooks_json"
  jq -e '.hooks.SessionStart[0].matcher == "startup|resume|clear|compact"' "$hooks_json" >/dev/null ||
    fail "SessionStart hook must cover startup, resume, clear, and compact."
  jq -e 'has("hooks") and (.hooks | has("PostToolUse") | not)' "$hooks_json" >/dev/null ||
    fail "Runtime context hooks must not include PostToolUse."
fi

node --check "$hook_script"

workspace="$(mktemp -d "${TMPDIR:-/tmp}/freeflow-runtime-hook.XXXXXX")"
trap 'rm -rf "$workspace"' EXIT

claude_session_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

[ -z "$claude_session_output" ] || fail "Claude SessionStart should stay inert before .freeflow/config.json exists."

codex_session_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

[ -z "$codex_session_output" ] || fail "Codex SessionStart should stay inert before .freeflow/config.json exists."

disabled_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

[ -z "$disabled_output" ] || fail "FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 should disable runtime context injection."

mkdir -p "$workspace/.freeflow"
cat >"$workspace/.freeflow/config.json" <<'JSON'
{
  "defaultMode": "strict-workflow"
}
JSON
cat >"$workspace/AGENTS.md" <<'MD'
## Freeflow

Use Freeflow for consequential work. Default mode: `.freeflow/config.json`.
MD

configured_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Configured SessionStart output" "$configured_output" "Setup status: configured for Codex AGENTS.md with defaultMode \`strict-workflow\`."
require_contains "Configured SessionStart output" "$configured_output" "Current Freeflow default mode: \`strict-workflow\`."
require_contains "Configured SessionStart output" "$configured_output" "For mode changes or mode interpretation, use \`mode-contract\`."

cat >"$workspace/.freeflow/config.json" <<'JSON'
{
  "enabled": false,
  "defaultMode": "workflow",
  "skills": { "enabled": true },
  "outputRouter": { "enabled": true },
  "delegationHarness": { "enabled": true }
}
JSON

freeflow_disabled_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Disabled Freeflow SessionStart output" "$freeflow_disabled_output" "Freeflow Disabled"
if [[ "$freeflow_disabled_output" == *"Loaded Workflow Skill"* || "$freeflow_disabled_output" == *"Loaded Output Router Skill"* || "$freeflow_disabled_output" == *"Loaded Delegation Harness Skill"* ]]; then
  fail "Freeflow enabled=false should suppress all skill and capability context."
fi

cat >"$workspace/.freeflow/config.json" <<'JSON'
{
  "defaultMode": "workflow",
  "skills": { "enabled": false },
  "outputRouter": { "enabled": true }
}
JSON

skills_disabled_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Skills-disabled SessionStart output" "$skills_disabled_output" "Skills: disabled"
require_contains "Skills-disabled SessionStart output" "$skills_disabled_output" "Loaded Output Router Skill"
if [[ "$skills_disabled_output" == *"Loaded Workflow Skill"* || "$skills_disabled_output" == *"Loaded Decision Gate Skill"* || "$skills_disabled_output" == *"## Discovery-light"* ]]; then
  fail "skills.enabled=false should suppress base Freeflow skill context."
fi

cat >"$workspace/.freeflow/config.json" <<'JSON'
{
  "defaultMode": "workflow",
  "outputRouter": {
    "enabled": true,
    "thresholds": { "largeOutputLines": 2000 },
    "hints": { "generatedPathGlobs": ["graphify-out/**", "dist/**"] }
  }
}
JSON

router_configured_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Output-router configured SessionStart output" "$router_configured_output" "Setup status: configured for Codex AGENTS.md with defaultMode \`workflow\`."
require_contains "Output-router configured SessionStart output" "$router_configured_output" "Current Freeflow default mode: \`workflow\`."
require_contains "Output-router configured SessionStart output" "$router_configured_output" "Output router: enabled"
require_contains "Output-router configured SessionStart output" "$router_configured_output" "Loaded Output Router Skill"
if [[ "$router_configured_output" == *"partial setup"* || "$router_configured_output" == *"invalid \`.freeflow/config.json\`"* ]]; then
  fail "Output-router config should not make setup partial or invalid."
fi

cat >"$workspace/.freeflow/config.json" <<'JSON'
{
  "defaultMode": "workflow",
  "outputRouter": {
    "enabled": true,
    "observedRouting": {
      "enabled": true,
      "mcp": {
        "servers": {
          "github": { "enabled": true, "persistence": "metadata-only" }
        }
      }
    },
    "scriptTransform": {
      "enabled": false
    }
  }
}
JSON

observed_routing_configured_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Observed-routing configured SessionStart output" "$observed_routing_configured_output" "Setup status: configured for Codex AGENTS.md with defaultMode \`workflow\`."
if [[ "$observed_routing_configured_output" == *"partial setup"* || "$observed_routing_configured_output" == *"invalid \`.freeflow/config.json\`"* ]]; then
  fail "observedRouting/scriptTransform config should not make setup partial or invalid."
fi

cat >"$workspace/.freeflow/config.json" <<'JSON'
{
  "defaultMode": "workflow",
  "delegationHarness": { "enabled": true }
}
JSON

delegation_configured_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Delegation configured SessionStart output" "$delegation_configured_output" "Delegation harness: enabled"
require_contains "Delegation configured SessionStart output" "$delegation_configured_output" "Loaded Delegation Harness Skill"

cat >"$workspace/.freeflow/config.json" <<'JSON'
{
  "defaultMode": "conversation"
}
JSON

conversation_output="$(
  printf '{"hook_event_name":"SessionStart","source":"resume","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Conversation SessionStart output" "$conversation_output" "Current Freeflow default mode: \`conversation\`."
require_contains "Conversation SessionStart output" "$conversation_output" "Treat this as the repo default at session start, resume, clear, and compact."

post_tool_output="$(
  printf '{"hook_event_name":"PostToolUse","tool_name":"Write","cwd":"%s","tool_input":{"file_path":".freeflow/config.json"}}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" PostToolUse
)"

[ -z "$post_tool_output" ] || fail "PostToolUse should not inject runtime context."

if [ "$failures" -gt 0 ]; then
  exit 1
fi

printf 'Runtime context hook check passed: missing setup stays inert, configured startup injects enabled context, top-level/skills toggles gate context, disable env suppresses output, and PostToolUse stays disabled.\n'
