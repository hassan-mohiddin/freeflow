#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
plugin_root="$repo_root/plugins/freeflow"
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

require_contains "Claude SessionStart output" "$claude_session_output" "hookSpecificOutput"
require_contains "Claude SessionStart output" "$claude_session_output" "additionalContext"
require_contains "Claude SessionStart output" "$claude_session_output" "Freeflow Runtime Context"
require_contains "Claude SessionStart output" "$claude_session_output" "Setup status: this repo does not appear to be set up for Freeflow yet."
require_contains "Claude SessionStart output" "$claude_session_output" "Repo default mode: missing \`.freeflow/config.json\`; effective default mode falls back to \`workflow\`."
require_contains "Claude SessionStart output" "$claude_session_output" "Required user-facing notice: in the next assistant reply, tell the user Freeflow is installed but this repo is not set up yet, and recommend \`/setup-freeflow\`."
require_contains "Claude SessionStart output" "$claude_session_output" "Loaded Workflow Skill"
require_contains "Claude SessionStart output" "$claude_session_output" "Loaded Interview Gate Skill"
require_contains "Claude SessionStart output" "$claude_session_output" "Loaded Workflow Map"
require_contains "Claude SessionStart output" "$claude_session_output" "Question means answer. Do not turn a question into a file edit"
require_contains "Claude SessionStart output" "$claude_session_output" "Stop before silent decisions."

codex_session_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Codex SessionStart output" "$codex_session_output" "Freeflow Runtime Context"
require_contains "Codex SessionStart output" "$codex_session_output" "effective default mode falls back to \`workflow\`"
require_contains "Codex SessionStart output" "$codex_session_output" "Do this even if the user's prompt is casual, such as a greeting."
require_contains "Codex SessionStart output" "$codex_session_output" "Loaded Workflow Skill"
require_contains "Codex SessionStart output" "$codex_session_output" "Loaded Interview Gate Skill"
if [[ "$codex_session_output" == *"hookSpecificOutput"* ]]; then
  fail "Codex SessionStart output should be plain context, not Claude hook JSON."
fi

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
  "defaultMode": "workflow",
  "outputRouter": {
    "postToolRouting": "off",
    "largeOutputLines": 2000,
    "generatedPaths": ["graphify-out/**", "dist/**"]
  }
}
JSON

router_configured_output="$(
  printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s","model":"gpt-test"}' "$workspace" |
    PLUGIN_ROOT="$plugin_root" CLAUDE_PLUGIN_ROOT="$plugin_root" node "$hook_script" SessionStart
)"

require_contains "Output-router configured SessionStart output" "$router_configured_output" "Setup status: configured for Codex AGENTS.md with defaultMode \`workflow\`."
require_contains "Output-router configured SessionStart output" "$router_configured_output" "Current Freeflow default mode: \`workflow\`."
if [[ "$router_configured_output" == *"partial setup"* || "$router_configured_output" == *"invalid \`.freeflow/config.json\`"* ]]; then
  fail "Output-router config should not make setup partial or invalid."
fi

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

printf 'Runtime context hook check passed: hook config parses, startup injects workflow and interview-gate context, disable env suppresses output, and PostToolUse stays disabled.\n'
