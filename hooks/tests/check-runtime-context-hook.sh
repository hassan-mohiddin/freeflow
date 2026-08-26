#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)"
HOOK_PATH="$ROOT_DIR/hooks/freeflow-runtime-context.mjs"
HOOKS_JSON="$ROOT_DIR/hooks/hooks.json"
CORE_PROMPT="$ROOT_DIR/runtime/prompts/core.md"
INTERACTION_PROMPT="$ROOT_DIR/runtime/prompts/interaction-contract.md"

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
[[ -f "$CORE_PROMPT" ]] || fail "missing core prompt"
[[ -f "$INTERACTION_PROMPT" ]] || fail "missing interaction contract prompt"
[[ ! -f "$ROOT_DIR/runtime/prompts/skills.md" ]] || fail "retired skills prompt remains"
node --check "$HOOK_PATH"
node -e '
const fs = require("fs");
const hooks = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).hooks || {};
if (!Array.isArray(hooks.SessionStart) || hooks.SessionStart.length !== 1) process.exit(1);
if (hooks.SessionStart[0]?.matcher !== "startup|resume|clear|compact") process.exit(1);
if (hooks.UserPromptSubmit || hooks.SessionEnd) process.exit(1);
' "$HOOKS_JSON" || fail "hooks.json does not expose only SessionStart"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
mkdir -p "$tmp_dir/.freeflow"
printf '{}\n' >"$tmp_dir/.freeflow/config.json"

codex_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
disabled_by_env="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 node "$HOOK_PATH" SessionStart)"
[[ -z "$disabled_by_env" ]] || fail "FREEFLOW_DISABLE_RUNTIME_CONTEXT=1 should suppress injection"

for unsupported_event in PostToolUse UserPromptSubmit SessionEnd; do
  unsupported_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | node "$HOOK_PATH" "$unsupported_event")"
  [[ -z "$unsupported_output" ]] || fail "$unsupported_event should not inject runtime context"
done

for expected in \
  '"hookEventName":"SessionStart"' \
  "# Freeflow Stable Guidance" \
  "## Shared Terms" \
  "## Three Nested Loops" \
  "## Workflow Cue" \
  "## Action Selection Cue" \
  "## Supported Exit" \
  "# Freeflow Interaction Contract" \
  "Treat questions, criticism, examples, hypotheses, and tentative ideas as" \
  "Freeflow: active"; do
  assert_contains "$codex_output" "$expected" "configured core context"
done
assert_not_contains "$codex_output" "## Mode" "configured core context"
assert_not_contains "$codex_output" "Default mode" "configured core context"
assert_not_contains "$codex_output" "Active mode" "configured core context"
assert_not_contains "$codex_output" "Interaction Contract: enabled" "configured core context"
assert_not_contains "$codex_output" "Skills: enabled" "configured core context"
assert_not_contains "$codex_output" "session-modes" "configured core context"

# Empty mandatory fragments fail closed rather than emitting a partial active surface.
whitespace_root="$(mktemp -d)"
mkdir -p "$whitespace_root/hooks" "$whitespace_root/runtime/prompts" "$whitespace_root/repo/.freeflow"
cp "$HOOK_PATH" "$whitespace_root/hooks/freeflow-runtime-context.mjs"
cp -R "$ROOT_DIR/runtime/prompts/." "$whitespace_root/runtime/prompts/"
printf ' \n\t\n' >"$whitespace_root/runtime/prompts/core.md"
printf '{}\n' >"$whitespace_root/repo/.freeflow/config.json"
whitespace_output="$(printf '{\"cwd\":\"%s\"}\n' "$whitespace_root/repo" | node "$whitespace_root/hooks/freeflow-runtime-context.mjs" SessionStart)"
[[ -z "$whitespace_output" ]] || fail "whitespace-only mandatory prompt should fail closed"
rm -rf "$whitespace_root"

claude_output="$(printf '{"hook_event_name":"SessionStart","source":"startup","cwd":"%s"}\n' "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$claude_output" '"hookEventName":"SessionStart"' "Claude wrapper"
assert_contains "$claude_output" "# Freeflow Interaction Contract" "Claude core context"
assert_contains "$claude_output" "## Shared Terms" "Claude core context"
assert_contains "$claude_output" "Freeflow: active" "Claude core context"

# Every supported lifecycle start receives the same mandatory core surface.
for source in startup resume clear compact; do
  output="$(printf '{"hook_event_name":"SessionStart","source":"%s","cwd":"%s"}\n' "$source" "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
  assert_contains "$output" "# Freeflow Stable Guidance" "$source SessionStart context"
  assert_contains "$output" "# Freeflow Interaction Contract" "$source SessionStart context"
  assert_contains "$output" "Freeflow: active" "$source SessionStart context"
done

# Pi-only configuration remains isolated from the shared non-Pi hook.
cognitive_dir="$(mktemp -d)"
mkdir -p "$cognitive_dir/.freeflow"
printf '{"cognitiveRouting":{"enabled":true}}\n' >"$cognitive_dir/.freeflow/config.json"
cognitive_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$cognitive_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$cognitive_output" "# Freeflow Stable Guidance" "Pi-only capability tolerance"
assert_not_contains "$cognitive_output" "Cognitive Routing" "non-Pi capability isolation"
rm -rf "$cognitive_dir"

# Old mode and core-toggle configuration is a breaking invalidation, not a compatibility path.
for obsolete_config in \
  '{"defaultMode":"workflow"}' \
  '{"interactionContract":false}' \
  '{"skills":{"enabled":false}}'; do
  obsolete_dir="$(mktemp -d)"
  mkdir -p "$obsolete_dir/.freeflow"
  printf '%s\n' "$obsolete_config" >"$obsolete_dir/.freeflow/config.json"
  obsolete_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$obsolete_dir" | node "$HOOK_PATH" SessionStart)"
  [[ -z "$obsolete_output" ]] || fail "obsolete config should not activate: $obsolete_config"
  rm -rf "$obsolete_dir"
done

# No prompt-submit or clear-transfer path may create or consume legacy session state.
state_dir="$(mktemp -d)"
printf '{"hook_event_name":"UserPromptSubmit","session_id":"old-session","cwd":"%s","prompt":"Switch to conversation mode."}\n' "$tmp_dir" |
  PLUGIN_DATA="$state_dir" node "$HOOK_PATH" UserPromptSubmit >/dev/null
printf '{"hook_event_name":"SessionEnd","reason":"clear","session_id":"old-session","cwd":"%s"}\n' "$tmp_dir" |
  PLUGIN_DATA="$state_dir" node "$HOOK_PATH" SessionEnd >/dev/null
[[ ! -e "$state_dir/session-modes" ]] || fail "legacy session-mode state directory was created"
rm -rf "$state_dir"

# Missing, invalid, disabled, and invalid-local activation remain inert.
missing_dir="$(mktemp -d)"
invalid_dir="$(mktemp -d)"
mkdir -p "$invalid_dir/.freeflow"
printf '{invalid\n' >"$invalid_dir/.freeflow/config.json"
missing_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$missing_dir" | node "$HOOK_PATH" SessionStart)"
invalid_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$invalid_dir" | node "$HOOK_PATH" SessionStart)"
[[ -z "$missing_output" ]] || fail "missing config should not activate runtime context"
[[ -z "$invalid_output" ]] || fail "invalid config should not activate runtime context"
rm -rf "$missing_dir" "$invalid_dir"

disabled_dir="$(mktemp -d)"
mkdir -p "$disabled_dir/.freeflow"
printf '{"enabled":false}\n' >"$disabled_dir/.freeflow/config.json"
disabled_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$disabled_dir" | node "$HOOK_PATH" SessionStart)"
[[ -z "$disabled_output" ]] || fail "disabled Freeflow should suppress hook prompt delivery"
rm -rf "$disabled_dir"

invalid_local_dir="$(mktemp -d)"
mkdir -p "$invalid_local_dir/.freeflow"
printf '{}\n' >"$invalid_local_dir/.freeflow/config.json"
printf '{"enabled":"no"}\n' >"$invalid_local_dir/.freeflow/local.json"
invalid_local_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$invalid_local_dir" | node "$HOOK_PATH" SessionStart)"
[[ -z "$invalid_local_output" ]] || fail "invalid local config should fail closed"
rm -rf "$invalid_local_dir"

# Personal disablement remains separate from shared activation.
local_disabled_dir="$(mktemp -d)"
mkdir -p "$local_disabled_dir/.freeflow"
printf '{}\n' >"$local_disabled_dir/.freeflow/config.json"
printf '{"enabled":false}\n' >"$local_disabled_dir/.freeflow/local.json"
local_disabled_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$local_disabled_dir" | node "$HOOK_PATH" SessionStart)"
[[ -z "$local_disabled_output" ]] || fail "local master override should suppress hook prompt delivery"
rm -rf "$local_disabled_dir"

# Repo-owned host instructions are not activation markers and are not modified.
printf '# Repo agents\n\nKeep this guidance.\n' >"$tmp_dir/AGENTS.md"
printf '# Repo Claude\n\nKeep this guidance too.\n' >"$tmp_dir/CLAUDE.md"
cp "$tmp_dir/AGENTS.md" "$tmp_dir/AGENTS.before"
cp "$tmp_dir/CLAUDE.md" "$tmp_dir/CLAUDE.before"
host_output="$(printf '{"cwd":"%s","model":"gpt-5"}\n' "$tmp_dir" | node "$HOOK_PATH" SessionStart)"
assert_contains "$host_output" "# Freeflow Interaction Contract" "host-independent activation"
cmp -s "$tmp_dir/AGENTS.before" "$tmp_dir/AGENTS.md" || fail "hook modified AGENTS.md"
cmp -s "$tmp_dir/CLAUDE.before" "$tmp_dir/CLAUDE.md" || fail "hook modified CLAUDE.md"

echo "runtime-context hook checks passed"
