#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat >&2 <<'EOF'
Usage:
  validate-release-metadata.sh [--mode local|prepublish|release]
                               [--release-version VERSION]
                               [--format text|json]

Default:
  validate-release-metadata.sh --mode prepublish --format text
  (release version is read from package.json)
EOF
}

fail_usage() {
	usage
	printf 'FAIL: %s\n' "$1" >&2
	exit 2
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir" rev-parse --show-toplevel)"
plugin_root="$repo_root"

mode="prepublish"
release_version=""
format="text"
product_description="Feedback-based control system for coding agents."
short_description="Feedback-based control for coding agents."
long_description="Freeflow gives coding agents an Interaction Contract, adaptive Workflow, focused methods, and durable task memory."

while [ "$#" -gt 0 ]; do
	case "$1" in
	--mode)
		mode="${2:-}"
		shift 2
		;;
	--release-version)
		release_version="${2:-}"
		shift 2
		;;
	--format)
		format="${2:-}"
		shift 2
		;;
	--help | -h)
		usage
		exit 0
		;;
	*)
		fail_usage "Unsupported argument: $1"
		;;
	esac
done

case "$mode" in
local | prepublish | release) ;;
*) fail_usage "Unsupported mode: $mode" ;;
esac

case "$format" in
text | json) ;;
*) fail_usage "Unsupported format: $format" ;;
esac

codex_marketplace="$repo_root/.agents/plugins/marketplace.json"
claude_marketplace="$repo_root/.claude-plugin/marketplace.json"
agent_plugins_manifest="$plugin_root/plugin.json"
gemini_extension_manifest="$plugin_root/gemini-extension.json"
opencode_config="$plugin_root/opencode.json"
cursor_manifest="$plugin_root/.cursor-plugin/plugin.json"
codex_manifest="$plugin_root/.codex-plugin/plugin.json"
claude_manifest="$plugin_root/.claude-plugin/plugin.json"
command_surface="$plugin_root/command-surface.json"
package_json="$plugin_root/package.json"
if [ -z "$release_version" ]; then
	release_version="$(node -e 'const fs = require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).version)' "$package_json")"
fi
command_audit="$plugin_root/scripts/validation/audit-command-surface.sh"
skill_routing_check="$plugin_root/scripts/validation/check-skill-routing-doc.mjs"
runtime_hooks_json="$plugin_root/hooks/hooks.json"
runtime_hook_script="$plugin_root/hooks/freeflow-runtime-context.mjs"
runtime_hook_check="$plugin_root/hooks/tests/check-runtime-context-hook.sh"
codex_hooks_json="$plugin_root/hooks/codex/hooks.json"
claude_hooks_json="$plugin_root/hooks/claude/hooks.json"
gemini_hooks_json="$plugin_root/hooks/hooks.json"
cursor_hooks_json="$plugin_root/hooks/cursor/hooks.json"
copilot_hooks_json="$plugin_root/com.github.copilot/hooks/hooks.json"
host_manifest_check="$plugin_root/scripts/validation/check-host-manifests.mjs"
host_adapter_check="$plugin_root/hooks/tests/check-host-adapters.test.mjs"
command_audit_stdout="$(mktemp "${TMPDIR:-/tmp}/freeflow-command-surface-audit.out.XXXXXX")"
command_audit_stderr="$(mktemp "${TMPDIR:-/tmp}/freeflow-command-surface-audit.err.XXXXXX")"
skill_routing_stdout="$(mktemp "${TMPDIR:-/tmp}/freeflow-skill-routing.out.XXXXXX")"
skill_routing_stderr="$(mktemp "${TMPDIR:-/tmp}/freeflow-skill-routing.err.XXXXXX")"
runtime_hook_stdout="$(mktemp "${TMPDIR:-/tmp}/freeflow-runtime-hook.out.XXXXXX")"
runtime_hook_stderr="$(mktemp "${TMPDIR:-/tmp}/freeflow-runtime-hook.err.XXXXXX")"
host_manifest_stdout="$(mktemp "${TMPDIR:-/tmp}/freeflow-host-manifest.out.XXXXXX")"
host_manifest_stderr="$(mktemp "${TMPDIR:-/tmp}/freeflow-host-manifest.err.XXXXXX")"
host_adapter_stdout="$(mktemp "${TMPDIR:-/tmp}/freeflow-host-adapter.out.XXXXXX")"
host_adapter_stderr="$(mktemp "${TMPDIR:-/tmp}/freeflow-host-adapter.err.XXXXXX")"
readme="$plugin_root/README.md"
architecture_doc="$plugin_root/plugin-docs/architecture.md"
release_doc="$plugin_root/plugin-docs/release.md"
release_evidence="$plugin_root/plugin-docs/release-evidence/v${release_version}.md"
release_boundary_adr="$plugin_root/plugin-docs/adr/0003-release-boundary.md"

checks_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-release-checks.XXXXXX")"
findings_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-release-findings.XXXXXX")"
warnings_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-release-warnings.XXXXXX")"
deferred_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-release-deferred.XXXXXX")"
evidence_file="$(mktemp "${TMPDIR:-/tmp}/freeflow-release-evidence.XXXXXX")"
trap 'rm -f "$checks_file" "$findings_file" "$warnings_file" "$deferred_file" "$evidence_file" "$command_audit_stdout" "$command_audit_stderr" "$skill_routing_stdout" "$skill_routing_stderr" "$runtime_hook_stdout" "$runtime_hook_stderr" "$host_manifest_stdout" "$host_manifest_stderr" "$host_adapter_stdout" "$host_adapter_stderr"' EXIT

status="pass"

record_line() {
	local file="$1"
	local value="$2"
	printf '%s\n' "$value" >>"$file"
}

record_check() {
	local check="$1"
	local check_status="$2"
	local message="$3"
	printf '%s\t%s\t%s\n' "$check" "$check_status" "$message" >>"$checks_file"
	if [ "$check_status" = "fail" ]; then
		status="fail"
		record_line "$findings_file" "$check: $message"
	elif [ "$check_status" = "warn" ]; then
		record_line "$warnings_file" "$check: $message"
	fi
}

record_deferred() {
	local check="$1"
	local message="$2"
	printf '%s\t%s\n' "$check" "$message" >>"$deferred_file"
}

record_evidence() {
	record_line "$evidence_file" "$1"
}

rel_path() {
	local file="$1"
	printf '%s\n' "${file#"$repo_root"/}"
}

require_file() {
	local check="$1"
	local file="$2"
	if [ -f "$file" ]; then
		record_evidence "$file"
		return 0
	fi
	record_check "$check" "fail" "Missing required file: $(rel_path "$file")"
	return 1
}

json_get() {
	local file="$1"
	local filter="$2"
	jq -r "$filter | if . == null then empty else . end" "$file"
}

same_value() {
	local check="$1"
	local label="$2"
	local expected="$3"
	local actual="$4"
	if [ "$actual" = "$expected" ]; then
		return 0
	fi
	record_check "$check" "fail" "$label expected '$expected', got '$actual'"
	return 1
}

contains_fixed() {
	local file="$1"
	local needle="$2"
	rg -Fq "$needle" "$file"
}

check_json_shape() {
	local check="json-shape"
	local ok=1
	for file in "$codex_marketplace" "$claude_marketplace" "$agent_plugins_manifest" "$gemini_extension_manifest" "$opencode_config" "$cursor_manifest" "$codex_manifest" "$claude_manifest" "$command_surface" "$codex_hooks_json" "$claude_hooks_json" "$gemini_hooks_json" "$cursor_hooks_json" "$copilot_hooks_json" "$package_json"; do
		require_file "$check" "$file" || ok=0
		if [ -f "$file" ]; then
			if ! jq empty "$file" >/dev/null; then
				record_check "$check" "fail" "Invalid JSON: $(rel_path "$file")"
				ok=0
			fi
		fi
	done

	if [ "$ok" = "1" ]; then
		record_check "$check" "pass" "Required marketplace, host manifest, hook, and command-surface JSON files parse."
	fi
}

check_marketplace_locality() {
	local check="marketplace-locality"
	local ok=1
	local codex_path
	local claude_source
	codex_path="$(json_get "$codex_marketplace" '.plugins[0].source.path')"
	claude_source="$(json_get "$claude_marketplace" '.plugins[0].source')"

	same_value "$check" "Codex marketplace source path" "." "$codex_path" || ok=0
	same_value "$check" "Claude marketplace source" "./" "$claude_source" || ok=0
	same_value "$check" "Codex marketplace plugin name" "freeflow" "$(json_get "$codex_marketplace" '.plugins[0].name')" || ok=0
	same_value "$check" "Claude marketplace plugin name" "freeflow" "$(json_get "$claude_marketplace" '.plugins[0].name')" || ok=0

	if [ "$ok" = "1" ]; then
		record_check "$check" "pass" "Root marketplace files use host-valid local source paths."
	fi
}

check_manifest_consistency() {
	local check="manifest-consistency"
	local ok=1
	local field

	for field in name version license homepage repository; do
		same_value "$check" "$field" "$(json_get "$codex_manifest" ".$field")" "$(json_get "$claude_manifest" ".$field")" || ok=0
	done

	same_value "$check" "release version" "$release_version" "$(json_get "$codex_manifest" '.version')" || ok=0
	same_value "$check" "Agent Plugins release version" "$release_version" "$(json_get "$agent_plugins_manifest" '.version')" || ok=0
	same_value "$check" "Gemini extension release version" "$release_version" "$(json_get "$gemini_extension_manifest" '.version')" || ok=0
	same_value "$check" "Cursor release version" "$release_version" "$(json_get "$cursor_manifest" '.version')" || ok=0
	same_value "$check" "author.name" "$(json_get "$codex_manifest" '.author.name')" "$(json_get "$claude_manifest" '.author.name')" || ok=0
	same_value "$check" "Codex displayName" "Freeflow" "$(json_get "$codex_manifest" '.interface.displayName')" || ok=0
	same_value "$check" "Codex skills path" "./skills/" "$(json_get "$codex_manifest" '.skills')" || ok=0
	same_value "$check" "Codex hooks path" "./hooks/codex/hooks.json" "$(json_get "$codex_manifest" '.hooks')" || ok=0
	same_value "$check" "Claude skills path" "./skills/" "$(json_get "$claude_manifest" '.skills')" || ok=0
	same_value "$check" "Claude hooks path" "./hooks/claude/hooks.json" "$(json_get "$claude_manifest" '.hooks')" || ok=0
	same_value "$check" "Cursor skills path" "./skills/" "$(json_get "$cursor_manifest" '.skills')" || ok=0
	same_value "$check" "Cursor hooks path" "./hooks/cursor/hooks.json" "$(json_get "$cursor_manifest" '.hooks')" || ok=0
	same_value "$check" "Claude marketplace version" "$release_version" "$(json_get "$claude_marketplace" '.plugins[0].version')" || ok=0
	same_value "$check" "Claude marketplace homepage" "$(json_get "$claude_manifest" '.homepage')" "$(json_get "$claude_marketplace" '.plugins[0].homepage')" || ok=0
	same_value "$check" "Claude marketplace author" "$(json_get "$claude_manifest" '.author.name')" "$(json_get "$claude_marketplace" '.plugins[0].author.name')" || ok=0
	same_value "$check" "npm package description" "$product_description" "$(json_get "$package_json" '.description')" || ok=0
	same_value "$check" "Codex manifest description" "$product_description" "$(json_get "$codex_manifest" '.description')" || ok=0
	same_value "$check" "Codex short description" "$short_description" "$(json_get "$codex_manifest" '.interface.shortDescription')" || ok=0
	same_value "$check" "Codex long description" "$long_description" "$(json_get "$codex_manifest" '.interface.longDescription')" || ok=0
	same_value "$check" "Claude manifest description" "$long_description" "$(json_get "$claude_manifest" '.description')" || ok=0
	same_value "$check" "Claude marketplace description" "$product_description" "$(json_get "$claude_marketplace" '.description')" || ok=0
	same_value "$check" "Claude marketplace plugin description" "$short_description" "$(json_get "$claude_marketplace" '.plugins[0].description')" || ok=0
	same_value "$check" "Agent Plugins name" "freeflow" "$(json_get "$agent_plugins_manifest" '.name')" || ok=0
	same_value "$check" "Agent Plugins schema" "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json" "$(json_get "$agent_plugins_manifest" '.["$schema"]')" || ok=0
	same_value "$check" "Gemini extension name" "freeflow" "$(json_get "$gemini_extension_manifest" '.name')" || ok=0
	same_value "$check" "Cursor name" "freeflow" "$(json_get "$cursor_manifest" '.name')" || ok=0

	if [ "$ok" = "1" ]; then
		record_check "$check" "pass" "Package and marketplace manifests agree on release identity and product descriptions."
	fi
}

check_host_skill_surface() {
	local check="host-skill-surface"
	local ok=1
	local skill_count

	skill_count="$(find "$plugin_root/skills" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print | wc -l | tr -d ' ')"
	if [ "$skill_count" != "25" ]; then
		record_check "$check" "fail" "Codex/Claude skills directory must contain exactly 25 skill packages; found $skill_count."
		ok=0
	fi

	for retired_path in \
		"$plugin_root/router" \
		"$plugin_root/capabilities/output-router" \
		"$plugin_root/pi-extension/src/output-router" \
		"$plugin_root/pi-extension/dist/output-router"; do
		if [ -e "$retired_path" ]; then
			record_check "$check" "fail" "Retired Output Router runtime path remains active: $(rel_path "$retired_path")."
			ok=0
		fi
	done

	if rg -n 'Output Router|output-router|outputRouter' "$plugin_root/skills" >/dev/null; then
		record_check "$check" "fail" "Codex/Claude model-facing skills still expose retired Output Router guidance or setup."
		ok=0
	fi

	if [ "$ok" = "1" ]; then
		record_check "$check" "pass" "Supported host surfaces expose the canonical 25 functional skills with no retired Output Router runtime or discovery surface."
	fi
}

check_command_surface() {
	local check="command-surface"
	require_file "$check" "$command_audit" || return
	if "$command_audit" >"$command_audit_stdout" 2>"$command_audit_stderr"; then
		record_check "$check" "pass" "Existing command-surface audit passed."
	else
		record_check "$check" "fail" "Existing command-surface audit failed."
	fi
}

check_skill_routing() {
	local check="skill-routing"
	require_file "$check" "$skill_routing_check" || return
	if node "$skill_routing_check" >"$skill_routing_stdout" 2>"$skill_routing_stderr"; then
		record_check "$check" "pass" "Contributor skill-routing map matches active sibling routes and direct resource dependencies."
	else
		record_check "$check" "fail" "Contributor skill-routing map drifted from active skills."
	fi
}

check_runtime_context_hooks() {
	local check="runtime-context-hooks"
	local ok=1

	require_file "$check" "$runtime_hooks_json" || ok=0
	require_file "$check" "$runtime_hook_script" || ok=0
	require_file "$check" "$runtime_hook_check" || ok=0
	require_file "$check" "$host_manifest_check" || ok=0
	require_file "$check" "$host_adapter_check" || ok=0
	for file in "$codex_hooks_json" "$claude_hooks_json" "$gemini_hooks_json" "$cursor_hooks_json" "$copilot_hooks_json"; do
		require_file "$check" "$file" || ok=0
	done

	if [ "$ok" = "1" ]; then
		if "$runtime_hook_check" >"$runtime_hook_stdout" 2>"$runtime_hook_stderr"; then
			record_check "$check" "pass" "Legacy Codex/Claude runtime-context compatibility checks passed."
		else
			record_check "$check" "fail" "Legacy Codex/Claude runtime-context compatibility check failed."
		fi
		if node "$host_manifest_check" >"$host_manifest_stdout" 2>"$host_manifest_stderr"; then
			record_check "$check" "pass" "Host manifest and path checks passed."
		else
			record_check "$check" "fail" "Host manifest and path checks failed."
		fi
		if node --test "$host_adapter_check" >"$host_adapter_stdout" 2>"$host_adapter_stderr"; then
			record_check "$check" "pass" "Host adapter fixture checks passed."
		else
			record_check "$check" "fail" "Host adapter fixture checks failed."
		fi
	fi
}

check_release_boundary() {
	local check="release-boundary"
	local ok=1

	for file in "$architecture_doc" "$release_doc" "$release_evidence" "$release_boundary_adr"; do
		require_file "$check" "$file" || ok=0
	done

	contains_fixed "$release_boundary_adr" "The npm tarball is the installable runtime artifact" || {
		record_check "$check" "fail" "ADR 0003 no longer states the npm runtime boundary."
		ok=0
	}

	contains_fixed "$release_boundary_adr" 'It excludes GitHub-only `plugin-docs/`, `.skill-eval/`, `.deprecated/`' || {
		record_check "$check" "fail" "ADR 0003 no longer excludes GitHub-only docs, evaluation evidence, and deprecated artifacts from npm."
		ok=0
	}

	contains_fixed "$architecture_doc" "does not ship a CLI, duplicate manifest command handlers, enforcement hooks, or a new agent runtime in this release" || {
		record_check "$check" "fail" "Architecture doc no longer preserves the host-native invocation and deferred enforcement boundary."
		ok=0
	}

	contains_fixed "$architecture_doc" "shared runtime-context renderer" || {
		record_check "$check" "fail" "Architecture doc no longer documents the shared runtime-context renderer."
		ok=0
	}

	contains_fixed "$release_doc" "Release preparation is an authorized local preparation step" || {
		record_check "$check" "fail" "Release docs no longer document the preparation boundary."
		ok=0
	}

	contains_fixed "$release_evidence" "one shared runtime hook" || {
		record_check "$check" "fail" "Release evidence no longer documents the shared runtime hook."
		ok=0
	}

	contains_fixed "$release_evidence" "Freeflow uses host-native skill invocation instead of duplicate manifest command handlers" || {
		record_check "$check" "fail" "Release evidence no longer states the host-native skill invocation boundary."
		ok=0
	}

	contains_fixed "$release_evidence" "Live Claude smoke evals" || {
		record_check "$check" "fail" "Release evidence no longer records deferred Claude smoke evals."
		ok=0
	}

	if [ "$ok" = "1" ]; then
		record_check "$check" "pass" "Release docs preserve runtime context hooks, deferred enforcement boundary, and deferred-smoke status."
	fi
}

check_package_cleanliness() {
	local check="package-cleanliness"
	local ok=1
	local pack_manifest=""

	duplicate_codex_manifests="$(
		find "$repo_root" -path "$repo_root/.git" -prune -o -path '*/.codex-plugin/plugin.json' -print |
			grep -Fvx "$codex_manifest" || true
	)"
	if [ -n "$duplicate_codex_manifests" ]; then
		record_check "$check" "fail" "Found another Codex plugin manifest outside the repo root."
		ok=0
	fi

	duplicate_claude_manifests="$(
		find "$repo_root" -path "$repo_root/.git" -prune -o -path '*/.claude-plugin/plugin.json' -print |
			grep -Fvx "$claude_manifest" || true
	)"
	if [ -n "$duplicate_claude_manifests" ]; then
		record_check "$check" "fail" "Found another Claude plugin manifest outside the repo root."
		ok=0
	fi

	if rg -n '(^|[^[:alnum:]_-])orchestra:' "$plugin_root/command-surface.json" "$plugin_root/skills" "$plugin_root/.codex-plugin" "$plugin_root/.claude-plugin" >/dev/null; then
		record_check "$check" "fail" "Runtime contains old Orchestra command compatibility syntax."
		ok=0
	fi

	if rg -n '(^|[^[:alnum:]_-])/orchestra' "$plugin_root/command-surface.json" "$plugin_root/skills" "$plugin_root/.codex-plugin" "$plugin_root/.claude-plugin" >/dev/null; then
		record_check "$check" "fail" "Runtime contains old /orchestra command compatibility syntax."
		ok=0
	fi

	if jq -e '.files[] | select(startswith("plugin-docs/") or startswith(".skill-eval/") or startswith(".deprecated/"))' "$package_json" >/dev/null; then
		record_check "$check" "fail" "The npm runtime package includes GitHub-only docs, evaluation evidence, or deprecated artifacts."
		ok=0
	fi

	if rg -n '\]\((plugin-docs|\.skill-eval|deprecated)/' "$plugin_root/README.md" >/dev/null; then
		record_check "$check" "fail" "README contains relative links to files excluded from the npm tarball."
		ok=0
	fi

	if ! pack_manifest="$(cd "$plugin_root" && npm pack --dry-run --json 2>/dev/null)"; then
		record_check "$check" "fail" "npm pack dry-run failed."
		ok=0
	elif ! jq -e '
    .[0] as $pack
    | ([$pack.files[].path | select(startswith("plugin-docs/") or startswith(".skill-eval/") or startswith(".deprecated/") or startswith("plans/"))] | length) == 0
      and ([$pack.files[].path | select(. == "skills/workflow/SKILL.md")] | length) == 1
      and ([$pack.files[].path | select(. == "runtime/prompts/interaction-contract.md")] | length) == 1
      and ([$pack.files[].path | select(. == "plugin.json")] | length) == 1
      and ([$pack.files[].path | select(. == "gemini-extension.json")] | length) == 1
      and ([$pack.files[].path | select(. == ".cursor-plugin/plugin.json")] | length) == 1
      and ([$pack.files[].path | select(. == "com.github.copilot/hooks/hooks.json")] | length) == 1
      and ([$pack.files[].path | select(. == "hooks/shared/runtime-context.mjs")] | length) == 1
      and ([$pack.files[].path | select(. == "hooks/adapters/claude-session-start.mjs" or . == "hooks/adapters/codex-session-start.mjs" or . == "hooks/adapters/gemini-session-start.mjs" or . == "hooks/adapters/cursor-session-start.mjs" or . == "hooks/adapters/copilot-session-start.mjs")] | length) == 5
      and ([$pack.files[].path | select(. == "opencode.json")] | length) == 0
      and ([$pack.files[].path | select(startswith(".github/skills/") or startswith(".agents/skills/") or startswith(".gemini/skills/") or startswith(".kiro/skills/"))] | length) == 0
      and ([$pack.files[].path | select(. == "capabilities/output-router/SKILL.md" or startswith("router/") or startswith("pi-extension/src/output-router/") or startswith("pi-extension/dist/output-router/"))] | length) == 0
      and ([$pack.files[].path | select(. == "pi-extension/freeflow/index.js")] | length) == 1
  ' <<<"$pack_manifest" >/dev/null; then
		record_check "$check" "fail" "npm pack contents do not match the multi-host runtime boundary."
		ok=0
	fi

	if [ "$ok" = "1" ]; then
		record_check "$check" "pass" "GitHub-only/deprecated material is excluded from npm, no duplicate manifests were found, and the retired Output Router is absent from the package."
	fi
}

check_docs_drift() {
	local check="docs-drift"
	local ok=1

	if [ "$(json_get "$command_surface" '.nativeSlashHandlers')" != "false" ]; then
		record_check "$check" "fail" "command-surface.json should keep duplicate manifest slash handlers disabled."
		ok=0
	fi

	if [ "$(json_get "$command_surface" '.hostNativeSkillInvocation.claude')" != "namespaced-slash-skill" ] ||
		[ "$(json_get "$command_surface" '.hostNativeSkillInvocation.codex')" != "skill-mention" ]; then
		record_check "$check" "fail" "command-surface.json does not declare Claude and Codex host-native skill invocation."
		ok=0
	fi

	if jq -e 'has("commands") or has("slashCommands")' "$codex_manifest" >/dev/null; then
		record_check "$check" "fail" "Codex manifest declares duplicate command handlers instead of using native skill mentions."
		ok=0
	fi

	if jq -e 'has("commands") or has("slashCommands")' "$claude_manifest" >/dev/null; then
		record_check "$check" "fail" "Claude manifest declares duplicate command handlers instead of native namespaced skill commands."
		ok=0
	fi

	contains_fixed "$architecture_doc" 'local source `.`, while Claude' || {
		record_check "$check" "fail" "Architecture docs do not preserve the Codex local source path."
		ok=0
	}

	contains_fixed "$architecture_doc" 'host-valid local source `./`' || {
		record_check "$check" "fail" "Architecture docs do not preserve the Claude local source path."
		ok=0
	}

	contains_fixed "$architecture_doc" '`pi-extension/freeflow/index.js`' || {
		record_check "$check" "fail" "Architecture docs do not name the Pi manifest entrypoint."
		ok=0
	}

	for host in OpenCode Hermes; do
		contains_fixed "$architecture_doc" "$host" || {
			record_check "$check" "fail" "Architecture docs do not preserve the $host compatibility boundary."
		ok=0
		}
	done

	contains_fixed "$readme" '**A feedback-based control system for coding agents.**' || {
		record_check "$check" "fail" "README no longer states the accepted product identity."
		ok=0
	}

	local direct_count developer_count pi_native_count
	direct_count="$(json_get "$command_surface" '.directSkillCalls | length')"
	developer_count="$(json_get "$command_surface" '.developerSkillCalls | length')"
	pi_native_count="$(json_get "$command_surface" '.piNativeCommands | length')"

	if [ "$mode" = "release" ]; then
		contains_fixed "$release_evidence" "$direct_count direct skill calls" || {
			record_check "$check" "fail" "Release evidence no longer lists $direct_count direct skill calls."
			ok=0
		}

		contains_fixed "$release_evidence" "$developer_count developer skill calls" || {
			record_check "$check" "fail" "Release evidence no longer lists $developer_count developer skill calls."
			ok=0
		}

		contains_fixed "$release_evidence" "$pi_native_count Pi native settings commands" || {
			record_check "$check" "fail" "Release evidence no longer lists $pi_native_count Pi native settings commands."
			ok=0
		}
	else
		record_check "$check" "pass" "Versioned release evidence is immutable; current command-surface counts are validated separately."
	fi

	if [ "$ok" = "1" ]; then
		record_check "$check" "pass" "Docs and manifests agree with the current command-surface boundary."
	fi
}

check_install_smoke() {
	record_deferred "install-smoke" "GitHub/Codex, Claude, Gemini, Cursor, Copilot/VS Code, Kiro, OpenCode, Hermes, and fresh Pi install smoke checks are not run by local metadata validation."
	if [ "$mode" = "release" ] && [ "$status" = "pass" ]; then
		status="blocked"
		record_line "$warnings_file" "install-smoke: release mode is blocked until GitHub/Codex, Claude, Gemini, Cursor, Copilot/VS Code, Kiro, OpenCode, Hermes, and fresh Pi install smoke checks run or are explicitly waived."
	fi
}

emit_json_array_from_lines() {
	jq -R -s 'split("\n") | map(select(length > 0))' "$1"
}

emit_checks_json() {
	jq -Rn '
    [inputs
      | split("\t")
      | {name:.[0], status:.[1], message:.[2]}]
  ' "$checks_file"
}

emit_deferred_json() {
	jq -Rn '
    [inputs
      | split("\t")
      | {name:.[0], message:.[1]}]
  ' "$deferred_file"
}

emit_report_json() {
	local checks_json findings_json warnings_json deferred_json evidence_json
	checks_json="$(emit_checks_json)"
	findings_json="$(emit_json_array_from_lines "$findings_file")"
	warnings_json="$(emit_json_array_from_lines "$warnings_file")"
	deferred_json="$(emit_deferred_json)"
	evidence_json="$(emit_json_array_from_lines "$evidence_file")"

	jq -n \
		--arg status "$status" \
		--arg version "$release_version" \
		--arg mode "$mode" \
		--arg summary "Release metadata validation ${status} for Freeflow ${release_version} in ${mode} mode." \
		--argjson checks "$checks_json" \
		--argjson findings "$findings_json" \
		--argjson warnings "$warnings_json" \
		--argjson deferred "$deferred_json" \
		--argjson evidence "$evidence_json" \
		'{
      status: $status,
      version: $version,
      mode: $mode,
      summary: $summary,
      checks: $checks,
      findings: $findings,
      warnings: $warnings,
      deferred: $deferred,
      evidence: $evidence
    }'
}

emit_text_report() {
	printf 'Release metadata validation: %s\n' "$status"
	printf 'Version: %s\n' "$release_version"
	printf 'Mode: %s\n' "$mode"
	printf '\nChecks:\n'
	while IFS=$'\t' read -r name check_status message; do
		[ -n "$name" ] || continue
		printf '%s\n' "- $check_status: $name - $message"
	done <"$checks_file"

	if [ -s "$findings_file" ]; then
		printf '\nFindings:\n'
		sed 's/^/- /' "$findings_file"
	fi

	if [ -s "$warnings_file" ]; then
		printf '\nWarnings:\n'
		sed 's/^/- /' "$warnings_file"
	fi

	if [ -s "$deferred_file" ]; then
		printf '\nDeferred:\n'
		while IFS=$'\t' read -r name message; do
			[ -n "$name" ] || continue
			printf '%s\n' "- $name: $message"
		done <"$deferred_file"
	fi
}

check_json_shape
check_marketplace_locality
check_manifest_consistency
check_host_skill_surface
check_command_surface
check_skill_routing
check_runtime_context_hooks
check_release_boundary
check_package_cleanliness
check_docs_drift
check_install_smoke

case "$format" in
json) emit_report_json ;;
text) emit_text_report ;;
esac

case "$status" in
pass) exit 0 ;;
blocked) exit 3 ;;
fail) exit 1 ;;
esac
