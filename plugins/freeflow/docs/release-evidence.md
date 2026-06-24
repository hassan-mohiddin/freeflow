# Release Evidence

Freeflow v0.2.0 is based on the v0.1 local acceptance suite plus targeted runtime, setup, and output-router evidence from the development repository.

## Acceptance Summary

The local v0.1 acceptance suite passed after measured fixes and was rerun during prepublish verification on 2026-05-26.

High-signal behaviors covered:

- Source-truth conflicts stop before edits.
- Strict public API specs ask for owner decisions.
- Execution stops when verification reveals a bad plan.
- Commit flow refuses mixed staged sensitive changes.
- Discovery checkpoints replace separate briefing, grilling, and decision-capture commands for discovery work.
- Bypass skips ceremony, not judgment.

## Command Surface

The development registry covers:

- 4 mode commands.
- 12 direct skill calls.
- 3 developer skill calls.

Codex/Claude native slash handlers are not shipped in this release. In those hosts, commands are model-routed through natural language and skill activation. Pi registers direct Freeflow commands through its extension, including `/output-router`.

## Runtime Context

Freeflow ships plugin-bundled context hooks that load the existing `workflow` skill, workflow map, and `interview-gate` skill at session start. The Pi extension also loads output-router context, including its safety-policy reference, when the routed tools are available. These hooks do not run after edit/write tools, enforce behavior, block tools, or create repo-local hook files.

For the same session that runs setup, `setup-freeflow` reads the workflow skill, workflow map, and interview-gate skill after successful setup verification before saying workflow and interview-gate context is loaded.

Host trust prompts for plugin hooks are expected host behavior. Local metadata validation checks hook packaging and deterministic output, not end-to-end host trust UI.

## Output Router Evidence

Output-router behavior is backed by deterministic runtime reports under `plugins/freeflow/evals/reports/runtime/`.

Verified in the development repo:

- Retrieval benchmark: improved router passed 7/7 gated fixtures and fixed the generated-artifact Sandbox Permissions false-positive shape.
- Command-output benchmark: `freeflow_run` passed 8/8 fixtures, preserved exact facts, and verified raw vault recovery.
- Capture/derive/provider eval: targeted historical eval passed 14/14 objective gates for read-only provider capture, web-shaped capture recovery, long-log derive, and provider-summary category scoping.
- Pi observed-routing eval: targeted eval passed 28/28 gates with 82.2% overall byte reduction across MCP/web/fetch/code-search fixtures, exact recovery where configured, metadata-only no-raw recovery, and Pi capability status.
- Vault-index storage/write/query path: selected deterministic local JSON sidecar for vault evidence indexing without adding native dependencies, indexes persisted appends immediately, supports vault-wide `freeflow_retrieve` query/locate with recovery pointers, preserves metadata-only/no-persist rules, and keeps index failures non-blocking; SQLite/FTS remains deferred pending owner approval.
- Script-derive schema/status gate: `freeflow_derive operation.kind="script"` is shaped under the existing public tool, disabled by default, reports status/config/limits/raw-script persistence, resolves vault sources only when enabled, and returns structured disabled/unavailable without executing script code.
- Script-sandbox proof gate: router exposes a sandbox adapter/probe interface, required adversarial proofs, rejected unsafe mechanisms, and status-visible candidate-unproven mechanisms; no unsandboxed fallback exists. JavaScript and jq product execution are implemented only for explicitly configured/provided package roots and remain disabled by default; Python is unavailable.
- Optional repo-source local index benchmark: scanner remains default, index is not adopted by default, and the no-dependency repo-source index remains experimental.
- Codex Structured Q&A macro benchmark: improved router passed the first Sandbox Permissions Q&A fixture while the native broad-search proxy selected `graphify-out/graph.html`.
- Large Codex scanner benchmark: scanner remains the retrieval backend; latest recorded report-refresh evidence kept scanner at 6/8 strict fixtures with bounded context.
- Setup/config eval: `setup-freeflow` supports optional evidence-routing repo config (`outputRouter`, `observedRouting`, `providers`) only after an explicit setup branch/request; minimal setup still writes only `defaultMode`.

Adoption decisions:

- Scanner improvements ship as default behavior.
- Native post-tool safety-net routing remains off unless explicitly configured.
- The no-dependency local index stays experimental.
- SQLite/FTS, model-assisted routing, Graphify, and Claude Context remain optional/non-default comparison paths, not product dependencies.

## Release Metadata

Run `plugins/freeflow/evals/scripts/validate-release-metadata.sh` for local prepublish checks across marketplace metadata, host manifests, command-surface routing, release-boundary docs, package cleanliness, and deferred install-smoke status.

Run `plugins/freeflow/evals/scripts/check-runtime-context-hook.sh` after changing lifecycle context hooks.

## Known Deferred Work

- Live Claude smoke evals after Hassan confirms Claude testing is available again.
- GitHub-install smoke tests in separate Codex, Claude, and fresh Pi environments.
- Enforcement hooks or CLI checks only after repeated behavior failures justify them.
- Public marketplace submission only after GitHub install works for required hosts.

Full eval reports are development evidence and are not included in the runtime package.
