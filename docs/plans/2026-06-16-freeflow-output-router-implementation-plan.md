# Freeflow Output Router Implementation Plan

> **Doc ID:** PLAN-2026-06-16-freeflow-output-router
> **Date:** 2026-06-16
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft
> **Source:** `docs/specs/freeflow-output-router-design.md`; reviewed current `package.json`; `plugin-docs/architecture.md`; `pi-extension/index.js`.

## Goal

Implement Freeflow Router's output-routing layer in vertical slices, starting with explicit routed tools for Pi while keeping native host tools direct by default.

The implementation should prove:

- `freeflow_retrieve` can return targeted evidence packets from local repo files and vaulted outputs.
- `freeflow_run` can execute commands, capture raw output, and return routed evidence without flooding context.
- The Pi adapter can expose the routed tools and inject the host-portable output-router skill.
- Optional post-tool safety net remains off by default and is transparent when enabled.

## Source Authority

Primary source:

- `docs/specs/freeflow-output-router-design.md`

Supporting repo evidence:

- `package.json` currently loads `skills` and `pi-extension/index.js` through the Pi package manifest.
- `package.json` uses a `files` whitelist; any new shipped router path must be included or the npm package can omit it.
- `plugin-docs/architecture.md` says the repo root is the single runtime source of truth and host runtimes control tools, sandboxing, approvals, and permissions.
- `pi-extension/index.js` is the current Pi adapter and already injects Freeflow runtime context during `before_agent_start`.

## Plan Status

This plan is **Approved for Slice 1**. Later slices still need their own confirmation when they reach unresolved decisions.

Chosen Slice 1 boundary:

- Keep the router as an optional companion runtime under the repo root.
- Router path: `router/`.
- TypeScript source: `router/src/`.
- Compiled JavaScript runtime: `router/dist/`.
- Host-portable output-router skill: `skills/output-router/SKILL.md`.
- Default non-repo vault root: `~/.cache/freeflow-router/vault/`.
- Default vault retention for normal non-durable outputs: 7-day TTL metadata.
- Package whitelist includes skills and compiled router runtime.
- Existing Pi extension remains JavaScript for this slice.
- Do not add public CLI behavior in the first execution pass.
- Do not make existing Freeflow skills depend on the output-router runtime being available; when the router is available, the output-router skill should still prefer routed tools for their intended cases.
- Do not override native `read` or `bash`.
- Do not let the host-neutral core execute shell commands directly.

Resolved before Slice 2:

- Default vault retention TTL is 7 days and recorded in `docs/issues/2026-06-16-output-router-vault-retention-default.md`.

If implementation requires changing the public package shape beyond the agreed TypeScript router build/package whitelist, adding runtime dependencies, exposing a CLI, or bypassing host command-execution controls, stop and confirm before proceeding.

## Command Execution Boundary

`freeflow_run` must execute commands through an adapter-provided, host-approved runner.

The host-neutral router core may define a runner interface and route captured output, but it must not call Node shell APIs such as `child_process.spawn` directly as its default behavior.

For Pi, the adapter should use Pi's host execution API where available, such as `pi.exec` or an equivalent Pi-provided command execution path. This preserves the Freeflow architecture boundary: host runtimes control tools, sandboxing, approvals, and permissions; Freeflow controls output routing and evidence preservation.

## Non-Goals

- No capability/skill router implementation.
- No Claude Code or Codex adapter implementation.
- No MCP server implementation.
- No semantic index or symbol/callsite index.
- No default interception of native `read` or `bash`.
- No model-assisted summarization, classification, or interpretation inside the router runtime.
- No repo-local raw output storage by default.
- No generated package mirror.

## Likely Files Touched

Likely new files/directories:

- `router/` or equivalent internal router package path.
- Host-neutral `output-router` skill with runtime-facing references.
- Router source modules for schemas, vault, retrieval, command routing, output policy, and config.
- Router tests/fixtures under `router/` or `evals/`.
- Optional safety policy reference if the implementation needs runtime-facing detail.

Likely modified files:

- `pi-extension/index.js` to register `freeflow_retrieve`, `freeflow_run`, inject the output-router skill plus safety-policy context, and render Freeflow tool calls/results with compact/expanded Pi TUI views.
- `package.json` if build/test scripts, package metadata, or the `files` whitelist must change to include the router runtime.
- `.freeflow/config.json` only if repo-local output-router defaults are intentionally recorded for this repo.
- `plugin-docs/architecture.md` only after implementation changes the runtime boundary enough that docs would otherwise be stale.

## Slice 1: Lock Package Boundary And Core Schemas

Purpose: establish the implementation skeleton without committing to broad runtime behavior.

Steps:

- Confirm the internal router path under the repo root.
- Decide whether the router path must be included in the npm package `files` whitelist.
- Decide the minimal TypeScript/Node build strategy for this repo.
- Decide the initial session-linked vault root and retention defaults before implementing storage.
- Decide the exact path/name for the reusable output-router skill.
- Define core schemas/types:
  - `PreserveMode`: `summary | important | full`.
  - retrieval actions: `query | locate | retrieve | expand | explain`.
  - evidence packet.
  - routed result.
  - command output record with `executionStatus`, not ambiguous `status`.
  - vault record.
  - decision record.
  - status concepts: `toolStatus`, `execution.status`, and `routing.status`.
  - router config.
- Keep schemas host-neutral.
- Add lightweight schema validation where practical.
- Document that natural-language fields such as `reason`, `why`, `summary`, and `recovery.how` are generated by deterministic runtime code/templates/parsers.

Checks:

- Source files parse/build under the chosen build strategy.
- Schema tests cover valid and invalid minimal examples.
- Initial vault root and retention defaults are documented in code/config or a follow-up issue before vault implementation starts.
- Output-router skill path/name is documented.
- If router files must ship, package whitelist coverage is confirmed.
- No Pi behavior changes yet.

Stop if:

- A public CLI or exported public API needs to be added.
- TypeScript build wiring would materially change package publishing behavior.
- Runtime dependencies are needed and their package impact is unclear.
- A safe non-repo vault root cannot be chosen without an owner decision.

## Slice 2: Implement Session-Linked Vault

Purpose: preserve exact raw evidence before any routing or compression.

Steps:

- Use the vault root and retention defaults decided in Slice 1; do not invent storage location during implementation.
- Implement immutable object storage plus per-session index.
- Support command output records with:
  - `stdout`,
  - `stderr`,
  - `combined`,
  - execution status,
  - exit code,
  - timing,
  - line/byte counts,
  - content hash,
  - decision ids.
- Support native routed text records as raw text records.
- Support repo file retrieval metadata records without copying whole repo files by default.
- Implement TTL-ready metadata, but keep pruning conservative until tested.

Checks:

- Unit tests write and read command records.
- Unit tests confirm execution-status grouping in session index.
- Unit tests confirm repo file retrieval metadata does not copy full files by default.
- Manual smoke: create a vault record and retrieve exact lines from it.

Stop if:

- The vault would store raw outputs in the repo by default.
- Fork/session identity cannot be represented without host-specific assumptions.

## Slice 3: Implement `freeflow_retrieve` For Local Repo Files

Purpose: prove targeted retrieval before full read for existing repo content.

Steps:

- Implement `query`, `locate`, `retrieve`, `expand`, and `explain` for `source.kind = repo`.
- Start with cheap retrieval:
  - path/name matching,
  - heading matching,
  - lexical search/snippets,
  - bounded line windows.
- Return evidence packets by default.
- Generate `why`, `reason`, and recovery hints from deterministic matching/templates only.
- Implement expansion levels:
  - exact/small,
  - ±30 lines,
  - ±80 lines,
  - section/heading/symbol-like block when detectable,
  - full only with recorded reason.
- Support `preserve: summary | important | full` without lossy full-fidelity behavior.

Checks:

- Fixture: large docs file query returns bounded evidence, not whole file.
- Fixture: expand widens the same evidence packet.
- Fixture: `preserve: full` over cap returns exact chunk metadata rather than summary.
- Verify routed result includes `decisionId`, reason, evidence ids, and recovery hint.

Stop if:

- Retrieval requires semantic indexing to be useful for the first slice.
- Full file content is returned without a recorded reason.

## Slice 4: Implement `freeflow_retrieve` For Vault Sources

Purpose: make captured output recoverable without rerunning commands.

Steps:

- Support `source.kind = vault` with `outputId`.
- Query exact command output records by line range, stream, or textual query.
- Expand prior evidence against vault records.
- Explain routed command decisions by `decisionId` or `outputId`.

Checks:

- Fixture: query a vaulted failed command output for the second failure stack.
- Fixture: retrieve exact lines from `stdout`, `stderr`, and combined output.
- Fixture: explain returns why the output was routed and how to recover more.

Stop if:

- Vault retrieval requires rerunning the original command.
- Raw output cannot be recovered after a routed result.

## Slice 5: Implement `freeflow_run`

Purpose: run commands once, capture raw output, and return routed command evidence.

Steps:

- Define the host-approved runner interface used by the router core.
- Execute commands through the adapter-provided runner with cwd and timeout support.
- For Pi, use Pi's host execution API where available rather than direct Node shell execution in the core.
- Capture stdout, stderr, combined output, execution status, exit code, and timing.
- Write raw output to the vault before transformation.
- Route output according to `goal`, size, execution status, and `preserve`.
- Use deterministic parsers/templates only; no model-assisted summarization or classification.
- Preserve exact failure evidence for failed commands.
- Preserve exact verification evidence needed for completion claims.
- Return `outputId`, `toolStatus`, execution status/exit code, routing status, routed result, and recovery hint.

Checks:

- Core command-routing tests use a fake runner rather than spawning a real shell.
- Small successful command returns raw or near-raw output with output id.
- Large noisy fixture returns deterministic summary/important lines plus output id.
- Failed command returns exact error evidence and raw output id.
- Verification fixture preserves exact pass/fail summary lines and exit code.
- Result separates Freeflow tool status from command execution status and routing status.
- Router failure path does not silently lose command output.

Stop if:

- Command output is transformed before raw capture succeeds.
- A failed command can be summarized in a way that looks successful.
- Verification output needed for a completion claim is paraphrased instead of preserved exactly.
- `freeflow_run` can only be implemented by bypassing host command-execution controls.

## Slice 6: Add Pi Extension Tools

Purpose: expose routed tools to Pi without changing native tool semantics.

Steps:

- Register `freeflow_retrieve` as a Pi custom tool.
- Register `freeflow_run` as a Pi custom tool.
- Wire `freeflow_run` to the Pi adapter's host-approved runner.
- Keep native `read`, `bash`, `edit`, and `write` unchanged.
- Return compact, labeled routed results from Freeflow tools.
- Ensure tool descriptions make the native-vs-routed distinction clear.

Checks:

- Pi starts with the extension loaded.
- Tool metadata appears for `freeflow_retrieve` and `freeflow_run`.
- Manual smoke: `freeflow_retrieve` returns repo evidence.
- Manual smoke: `freeflow_run` captures command output and returns an output id.
- Native `read` and `bash` still behave normally when safety net is off.

Stop if:

- Implementing tools requires overriding native Pi tools.
- Tool descriptions become long enough to recreate context bloat.

## Slice 7: Add Output-Router Skill Context Injection

Purpose: make the agent aware of the routed tools and tool-choice policy.

Steps:

- Create or update the reusable host-neutral `output-router` skill decided in Slice 1.
- Inject that compact contract and its safety-policy reference through Pi `before_agent_start` context.
- Keep it short and separate from full router docs.
- Apply mode-specific guidance strength:
  - conversation: minimal/soft guidance,
  - workflow: strong tool-choice guidance,
  - strict-workflow: strongest warnings/recommendations.
- Do not mention post-tool safety net unless it is enabled.
- Keep wording strong as guidance, not hidden enforcement.

Checks:

- System prompt includes the compact tool-awareness contract and safety-policy reference.
- The same output-router skill can be reused by future host adapters.
- If post-tool safety net is off, prompt does not imply native outputs may be routed.
- If safety net is enabled, prompt includes the recovery rule.
- Mode changes guidance wording only; they do not silently enable post-tool routing.
- Existing workflow/interview-gate context still loads.

Stop if:

- Output-router skill context duplicates the full spec or large registry details.
- The context claims enforcement that is not enabled.

## Slice 7b: Add Pi TUI Rendering For Routed Tools

Purpose: make Freeflow tool output readable for humans without changing model-facing routed results.

Steps:

- Add `renderCall` / `renderResult` for `freeflow_retrieve`.
- Add `renderCall` / `renderResult` for `freeflow_run`.
- Keep collapsed views compact: action/command, status, source/path/outputId, and `ctrl+o` hint.
- Use expanded views for structured sections: routing, status, evidence, and recovery.
- Do not dump huge raw output in expanded mode; point to vault retrieval instead.
- Keep this as Pi adapter UI only; router core should continue returning structured routed results.

Checks:

- Renderer tests cover collapsed and expanded `freeflow_retrieve` UI.
- Renderer tests cover collapsed and expanded `freeflow_run` UI.
- Result rendering includes `toolStatus`, `execution.status`, `routing.status`, evidence, `outputId`, and recovery text where applicable.
- Fallback model-facing `content` remains routed JSON/recoverable text.

Stop if:

- Better TUI requires changing router result schemas or native tool behavior.
- Expanded view would inject huge raw output instead of a bounded evidence/recovery view.

## Slice 8: Add Config Support

Purpose: make routing behavior explicit and controllable.

Steps:

- Read `outputRouter` from `.freeflow/config.json` with built-in defaults.
- Add config shape for:
  - `postToolRouting`,
  - large byte/line thresholds,
  - vault retention,
  - generated/noisy path hints,
  - noisy command hints.
- Preserve config precedence design:
  - host/session override,
  - repo config,
  - global config,
  - defaults.
- Implement repo config first if global config path is not yet settled; leave global support explicit in code comments or follow-up issue.

Checks:

- Missing `outputRouter` uses defaults.
- `postToolRouting: off` keeps native outputs unchanged.
- Freeflow mode does not silently change `postToolRouting`.
- Invalid config values fall back safely with clear warnings.

Stop if:

- Repo config can override user/global safety caps in risky ways.
- Config changes silently enable post-tool routing.

## Slice 9: Optional Pi Post-Tool Safety Net

Purpose: protect context from oversized native output when explicitly enabled.

Steps:

- Add Pi `tool_result` handling for native `read` and `bash` only when config enables it.
- Route only large/noisy outputs by conservative thresholds and heuristics.
- Capture raw native output to vault before returning a transformed result.
- Label transformed native output clearly.
- Include recovery instructions through `freeflow_retrieve`.
- Fail open with warning if safety-net routing fails.

Checks:

- With safety net off, native outputs pass through unchanged.
- With safety net on, large native output is vaulted and labeled.
- Small native output is not routed.
- Recovery via `freeflow_retrieve` returns exact raw chunks.
- Safety-net failure does not lose output silently.

Stop if:

- Native output can be shortened without a visible Freeflow label.
- Safety net routes exactness-sensitive output without preserving exact evidence.

## Slice 10: Add Safety Policy Reference

Purpose: keep exactness-sensitive cases explicit without bloating the main spec or output-router skill.

Steps:

- Create a safety policy reference in the destination chosen during implementation.
- Include no-compress/no-silent-summary cases:
  - user-requested exact/full output,
  - small outputs,
  - verification evidence for completion claims,
  - failure evidence,
  - source-truth conflict evidence,
  - security/privacy/billing/data-loss/public API evidence,
  - `preserve: full`.
- Link it from implementation docs or code comments where the policy is enforced.

Checks:

- Policy is referenced by routing logic or tests.
- Safety policy does not become long agent-facing skill text.

Stop if:

- The reference introduces new safety/product decisions not present in the spec.

## Slice 11: Add Evals And Regression Fixtures

Purpose: prove accuracy, token savings, recoverability, and exactness preservation.

Steps:

- Add deterministic fixtures for:
  - big docs targeted query,
  - noisy test output summary/failures,
  - whole-artifact full read case,
  - native safety-net large output,
  - failed command exact evidence,
  - verification output exact evidence,
  - split status semantics for tool success vs command failure vs routing success.
- Prefer deterministic scripts over model-based evals for the router core.
- Do not add model-assisted runtime evals unless a later spec changes the deterministic-runtime decision.

Checks:

- Fixtures verify routed output is smaller than raw output where expected.
- Fixtures verify exact evidence is preserved.
- Fixtures verify raw output is recoverable.
- Fixtures verify full-read/full-fidelity cases are not lossy-summarized.

Stop if:

- Evals measure token savings without checking answer/evidence correctness.

## Slice 12: Documentation And Handoff

Purpose: make the new runtime behavior understandable without rewriting the whole plugin docs.

Steps:

- Update architecture docs if runtime boundaries changed.
- Add concise docs for the two routed tools.
- Document config defaults and safety-net opt-in behavior.
- Record any deferred decisions as issues rather than burying them in code comments.

Checks:

- Docs say native tools remain native by default.
- Docs say post-tool safety net is opt-in.
- Docs do not claim Claude/Codex adapters exist before they do.

## Final Verification

Before claiming implementation complete:

- Run syntax/build checks for new router code.
- Run router unit tests/fixtures.
- Run Pi extension smoke checks.
- Run relevant existing Freeflow validation scripts if package metadata or runtime context changed.
- Verify package `files` whitelist includes any router runtime files that must ship.
- Verify `freeflow_retrieve` and `freeflow_run` both return recovery paths.
- Verify raw command output is captured before transformation.
- Verify no router runtime path calls a model for summarization/classification.
- Verify result schemas separate `toolStatus`, `execution.status`, and `routing.status`.
- Verify native `read`/`bash` behavior is unchanged when post-tool routing is off.

## Stop Conditions

Stop and ask before continuing if:

- implementation requires a public CLI decision,
- package/build changes affect publishing behavior,
- router storage would write raw output into the repo by default,
- native tool override becomes necessary,
- `freeflow_run` would bypass host command-execution controls,
- exact verification evidence cannot be preserved,
- implementation would require model-assisted runtime summarization/classification,
- mode handling would silently enable post-tool routing,
- global/user config behavior is needed but no safe config location is agreed,
- Claude/Codex adapter details are needed before Pi-first behavior works.
