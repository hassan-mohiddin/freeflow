# Release Evidence

Freeflow v0.3.0 is based on the v0.1 local acceptance suite plus targeted runtime, setup, and output-router evidence from the development repository. The current Interaction Lifecycle, layered configuration, Interaction Contract, Workflow bootstrap, and revised candidate skills have not yet received behavioral evaluation; the workflow and prior setup evidence below is historical and does not verify that candidate snapshot.

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
- 19 direct skill calls: 17 canonical commands plus 2 published Pi compatibility aliases.
- 3 developer skill calls.
- 2 Pi native settings commands.

Codex/Claude native slash handlers are not shipped in this release. In those hosts, commands are model-routed through natural language and skill activation. Pi registers direct Freeflow commands through its extension, including unified `/freeflow` and compatibility `/output-router` settings commands.

## Runtime Context

Freeflow ships plugin-bundled context hooks that stay inert until `.freeflow/config.json` is valid and any `.freeflow/local.json` core layer is missing or valid. When configured and enabled, they load the Interaction Contract when effective, the full Workflow skill once while Skills are effective, compact mode/capability state, and effective capability context at supported lifecycle boundaries. The Pi extension appends effective compact context before every agent turn and stores Workflow as one hidden persistent custom message. An effective top-level disabled state suppresses Freeflow context and capabilities; an effective Skills-disabled state suppresses Workflow and model-skill exposure while the Interaction Contract and enabled capabilities retain independent switches. Pi session overrides sit above configured core values but cannot bypass missing or invalid repository activation. Mode Contract, Decision Gate, and other workflow skills remain on demand. These hooks do not run after edit/write tools, enforce behavior, block tools, or create repo-local hook files.

For the same session that runs setup, `setup-freeflow` reads newly effective Interaction Contract, Workflow, Mode Contract, and explicitly configured capability guidance following successful verification. It reports those direct reads separately from automatic lifecycle delivery.

Host trust prompts for plugin hooks are expected host behavior. Setup reports runtime delivery as confirmed, unavailable, or unconfirmed. `STP-012` registers the untrusted-hook pressure case but remains Unverified. Local metadata validation checks hook packaging and deterministic output, not end-to-end host trust UI.

Isolated local install smoke passed for Codex marketplace add/install, Claude marketplace validation/add/install, Pi local-package install, and npm-tarball extension registration. Remote GitHub installation and live model behavior remain deferred.

## Output Router Evidence

Output-router behavior is backed by deterministic runtime reports under `router/evals/reports/`.

Verified in the development repo:

- Retrieval benchmark: improved router passed 7/7 gated fixtures and fixed the generated-artifact Sandbox Permissions false-positive shape.
- Command-output benchmark: `freeflow_run` passed 8/8 fixtures, preserved exact facts, and verified raw vault recovery.
- Historical capture/transform/provider eval: targeted eval passed 14/14 objective gates before provider-summary config was removed; observed routing now owns producer output routing.
- Pi observed-routing eval: targeted eval passed 28/28 gates with 82.2% overall byte reduction across MCP/web/fetch/code-search fixtures, exact recovery where configured, metadata-only no-raw recovery, and Pi capability status.
- Vault-index storage/write/query path: selected deterministic local JSON sidecar for vault evidence indexing without adding native dependencies, indexes persisted appends immediately, supports vault-wide `freeflow_search` query/locate with recovery pointers, preserves metadata-only/no-persist rules, and keeps index failures non-blocking; SQLite/FTS remains deferred pending owner approval.
- Script execution schema/status gate: `freeflow_search action=transform operation.kind="script"` and `freeflow_run` script producers are shaped under existing public tools, disabled by default, report status/config/limits/raw-script persistence, and return structured disabled/unavailable before execution when script transform or a requested adapter is unavailable. Transform scripts resolve vault sources; run script producers execute with an empty source manifest and capture stdout/stderr as run output.
- Script-sandbox proof gate: router exposes a sandbox adapter/probe interface, required adversarial proofs, rejected unsafe mechanisms, and status-visible candidate-unproven mechanisms; no unsandboxed fallback exists. JavaScript, Python, and jq product execution are implemented only after setup/user config opts in and proof-backed adapters are available. Python uses the Eryx adapter from the global adapter cache or `FREEFLOW_ERYX_ROOT`; when the host lacks JSPI, the adapter launches the setup-installed `node@24` child process with `--experimental-wasm-jspi` and enables Python only after that runner passes proofs. Earlier adapter evidence is in `router/evals/reports/eryx-python-proof-spike-2-report.md`; current transform-routing evidence is in `router/evals/reports/output-router-transform-eval-1-report.md`; current setup smoke verifies Python availability through the child runner. Probe resource hardening reduced flood fixture sizes and caches proof results by adapter hash/probe limits.
- Optional repo-source local index benchmark: scanner remains default, index is not adopted by default, and the no-dependency repo-source index remains experimental. The latest repo search backend benchmark compares scanner-only, local lexical index, Node `node:sqlite` FTS5/BM25/trigram, and conservative hybrid scanner+index; all pass the current fixtures with recall@3 3/3 and zero generated false positives. FTS was tested through the experimental Node runtime available in this environment; no package dependency was added.
- Storage-policy benchmark/adoption: `hybrid-dedupe` is the `freeflow_run` command/script capture default after benchmark evidence; failures/verification/diagnostics, `preserve=full`, filters/script filters, script producers, and large/noisy outputs remain exact; small non-sensitive command successes may be metadata-only; exact duplicates may point to a prior exact output.
- Context Mode normalized benchmark: Freeflow-owned tools and the normalized Context Mode-style proxy both pass 6/6 fixtures. Freeflow preserves exact facts/recovery on 6/6, but visible answer accuracy is 4/6 and the proxy is smaller on model-visible bytes for these normalized fixtures; no public superiority claim is made.
- Context Mode real deep final benchmark: Freeflow improved from 17/28 correct and 76/92 facts to 35/36 correct and 124/124 facts, with weighted reduction improving from 76.28% to 95.76%. Freeflow beats Context Mode for covered reducers and batch aggregation on context size, but Context Mode still wins indexed repo/docs search compactness and latency. Evidence: `router/evals/reports/context-mode-real-deep-final-slice-11-report.md` and `router/evals/reports/context-mode-real-deep-final-slice-11-review.md`.
- Codex Structured Q&A macro benchmark: improved router passed the first Sandbox Permissions Q&A fixture while the native broad-search proxy selected `graphify-out/graph.html`.
- Large Codex scanner benchmark: scanner remains the retrieval backend; latest recorded report-refresh evidence kept scanner at 6/8 strict fixtures with bounded context.
- Historical setup/config eval: the predecessor setup flow proved optional capability config (`outputRouter`, `observedRouting`, `scriptTransform`) remained explicit while minimal config used only `defaultMode`; it does not verify the revised config-only activation flow.

Adoption decisions:

- Scanner improvements ship as default behavior.
- Native post-tool safety-net routing remains off unless explicitly configured.
- The no-dependency local index stays experimental.
- SQLite/FTS, model-assisted routing, Graphify, and Claude Context remain optional/non-default comparison paths, not product dependencies.

## Release Metadata

Run `scripts/validation/validate-release-metadata.sh` for local prepublish checks across marketplace metadata, host manifests, command-surface routing, release-boundary docs, package cleanliness, and deferred install-smoke status. The npm runtime tarball excludes GitHub-only `plugin-docs/`, `.skill-eval/`, `router/evals/`, and `deprecated/` content.

Run `hooks/tests/check-runtime-context-hook.sh` after changing lifecycle context hooks.

## Known Deferred Work

- Live Claude smoke evals after Hassan confirms Claude testing is available again.
- GitHub-install smoke tests in separate Codex, Claude, and fresh Pi environments.
- Enforcement hooks or CLI checks only after repeated behavior failures justify them.
- Public marketplace submission only after GitHub install works for required hosts.

Full eval reports are development evidence and are not included in the runtime package.
