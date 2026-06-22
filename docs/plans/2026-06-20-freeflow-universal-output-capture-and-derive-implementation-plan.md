> **Doc ID:** PLAN-2026-06-20-freeflow-universal-output-capture-derive
> **Date:** 2026-06-20
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft — Slice 4 implemented with Pi MCP stdio bridge; Ready for Slice 5A or implementation review
> **Source:** `docs/specs/freeflow-universal-output-capture-and-derive-design.md` reviewed Pass on 2026-06-20; Slice 0 decisions owner-approved on 2026-06-22; Slices 1-3 verified on 2026-06-22; Slice 4 capability inspection on 2026-06-22

# Freeflow Universal Output Capture And Derive Implementation Plan

## Goal

Implement the universal evidence direction from `docs/specs/freeflow-universal-output-capture-and-derive-design.md` without changing Freeflow's core philosophy:

- the agent deliberately chooses Freeflow tools,
- no hidden primary interception,
- `freeflow_capture` is read-only/evidence-producing,
- mutating provider tools remain direct provider calls after explicit user intent,
- every produced/captured/derived result separates routing, persistence, recoverability, and lineage.

Slice 0 public-contract decisions were approved on 2026-06-22. Slices 1-3 were implemented and verified on 2026-06-22. Continue slice-by-slice: later slices should still stop rather than guess if source truth, config shape, result identity, or adapter capability contradicts the spec.

Progress:

- 2026-06-22: Slice 0 decisions recorded in the spec and plan; artifact review passed with no blocking findings.
- 2026-06-22: Slice 1 added universal evidence metadata and recoverability compatibility; `npm run test:router` passed with 169 tests, `node --check plugins/freeflow/pi-extension/index.js` passed, and `git diff --check` passed.
- 2026-06-22: Slice 2 added shared failure-contract helpers for capture/derive foundations; `npm run test:router` passed with 174 tests, `node --check plugins/freeflow/pi-extension/index.js` passed, and `git diff --check` passed.
- 2026-06-22: Slice 3 added the internal `freeflow_capture` interface, fixture adapter contract, read-only enforcement, bounded routing, and capture tests without public Pi registration; `npm run test:router` passed with 179 tests, `node --check plugins/freeflow/pi-extension/index.js` passed, and `git diff --check` passed.
- 2026-06-22: Slice 4 capability inspection initially stopped public exposure: Pi extension docs expose custom tools, `pi.exec`, and tool metadata/activation APIs, but no extension API for invoking MCP/provider tools by name; the MCP gateway had no Serena server connected.
- 2026-06-22: Serena was installed and configured through `pi-mcp-adapter`; Pi MCP connected to Serena. Slice 4 added an explicit Pi MCP stdio bridge for allowlisted Serena read-only symbol/reference/diagnostic tools and registered public `freeflow_capture`; mutating Serena tools remain rejected through capture and available only as direct MCP calls after explicit user intent. Review fix: MCP child env now uses a safe allowlist plus explicit server env interpolation, with fake stdio MCP coverage for successful capture and secret non-forwarding. Verification: `npm run test:router` passed with 183 tests, `node --check plugins/freeflow/pi-extension/index.js` passed, `git diff --check && git diff --cached --check` passed, and live Serena capture smoke returned routed exact-recoverable evidence.
- 2026-06-22: Before Slice 5A, the Pi extension was converted to TypeScript source modules. Modules now separate runtime context, schemas, renderers, native safety-net routing, MCP capture bridge, and router tool registration. The root Pi manifest now loads `plugins/freeflow/pi-extension/dist/index.js` directly; the old `plugins/freeflow/pi-extension/index.js` wrapper was removed because there are no external users to preserve. The migration uses `tsc` without `@ts-nocheck`, while keeping `strict` off for incremental typing. Verification after the split: `npm run test:router` passed with 183 tests, `node --check plugins/freeflow/pi-extension/dist/index.js` passed, and `git diff --check && git diff --cached --check` passed.

## Source Authority

Primary spec:

- `docs/specs/freeflow-universal-output-capture-and-derive-design.md`

Foundational router contract:

- `docs/specs/freeflow-output-router-design.md`
- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/output-router/references/safety-policy.md`

Setup/config source truth:

- `plugins/freeflow/skills/setup-freeflow/SKILL.md`
- `plugins/freeflow/skills/setup-freeflow/references/output-router-setup.md`
- `.freeflow/config.json`

Current implementation areas:

- `plugins/freeflow/router/src/`
- `plugins/freeflow/router/tests/`
- `plugins/freeflow/pi-extension/src/`
- `plugins/freeflow/pi-extension/dist/`
- `plugins/freeflow/router/dist/`
- `plugins/freeflow/evals/README.md`
- `plugins/freeflow/evals/reports/runtime/`

Reference research:

- Serena clone/research at `/tmp/freeflow-external-tools/serena` when available.
- codebase-memory-mcp research captured in `docs/handoffs/2026-06-19-external-code-intelligence-integration-handoff.md`.
- Context Mode research from `/tmp/pi-github-repos/mksglu/context-mode` when available.

Live repo evidence overrides this plan.

## Non-Goals

Do not:

- rename existing `freeflow_retrieve` actions,
- make `freeflow_capture` mediate mutating provider actions,
- implement script derive before sandbox/security design,
- enable direct host-tool capture by default,
- dump every low-level default into `.freeflow/config.json`,
- promise universal host-tool proxying across all agent harnesses,
- require Serena, codebase-memory-mcp, Context Mode, or any external service as a Freeflow dependency,
- add hidden model-assisted summarization inside the router runtime,
- document measured improvement before eval evidence exists,
- store raw captured output in the repo by default.

## Architecture Rules

Use the spec's deep-module split:

- `freeflow_run`: local command producer.
- `freeflow_capture`: read-only service/protocol producer.
- `freeflow_retrieve`: query/recover/expand/explain existing evidence.
- `freeflow_derive`: deterministic transformation of existing evidence.

Keep these seams real:

- router core owns producer/capture/result contracts,
- host adapters implement producer adapters,
- provider manifests describe bounded capability categories,
- vault/evidence storage owns lineage and recoverability.

Apply the deletion test before adding modules. If a new helper only forwards arguments without concentrating policy, validation, recovery, or lineage, fold it into an existing module.

## Likely Files Touched

Router source:

- `plugins/freeflow/router/src/types.ts`
- `plugins/freeflow/router/src/schema.ts`
- `plugins/freeflow/router/src/vault.ts`
- `plugins/freeflow/router/src/index.ts`
- `plugins/freeflow/router/src/evidence.ts`
- `plugins/freeflow/router/src/run.ts`
- `plugins/freeflow/router/src/retrieve.ts`
- possible new files:
  - `plugins/freeflow/router/src/capture.ts`
  - `plugins/freeflow/router/src/derive.ts`
  - `plugins/freeflow/router/src/producers.ts`
  - `plugins/freeflow/router/src/provider-manifests.ts`
  - `plugins/freeflow/router/src/recoverability.ts`

Pi adapter:

- `plugins/freeflow/pi-extension/src/`
- `plugins/freeflow/pi-extension/dist/`

Tests:

- `plugins/freeflow/router/tests/schema.test.js`
- `plugins/freeflow/router/tests/run.test.js`
- `plugins/freeflow/router/tests/retrieve.test.js`
- possible new tests:
  - `plugins/freeflow/router/tests/capture.test.js`
  - `plugins/freeflow/router/tests/derive.test.js`
  - `plugins/freeflow/router/tests/provider-manifests.test.js`
  - `plugins/freeflow/router/tests/recoverability.test.js`
  - `plugins/freeflow/router/tests/pi-extension-capture.test.js`

Generated output, if build emits it:

- `plugins/freeflow/router/dist/`

Skills/docs/config:

- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/setup-freeflow/SKILL.md`
- `plugins/freeflow/skills/setup-freeflow/references/output-router-setup.md`
- `plugins/freeflow/docs/architecture.md` only after behavior is verified
- `.freeflow/config.json` only when intentionally changing this repo's own config

Provider manifests:

- possible new directory: `plugins/freeflow/providers/`

## Slice 0: Design Consolidation And Approval Gate

Purpose: settle source-truth decisions before code creates accidental public contracts.

Slice contract:

- **Source truth:** primary spec, foundational output-router design, output-router skill, setup skill.
- **Module/interface changed:** no runtime module yet; this slice changes the plan/spec interface only if needed.
- **Verification:** existing tests still pass; reviewed decision checkpoint exists.
- **Review checkpoint:** artifact review after decisions/spec updates.
- **Stop conditions:** any public result-shape, config-shape, setup-flow, or adapter-scope decision remains owner-unapproved.

Approved decisions:

- Split identity and recovery: `recordId` for universal record identity, `recoveryOutputId` for persisted recovery, and existing `outputId` retained as exact command-output recovery compatibility.
- Keep `capture` and `providers` as top-level config sections; keep `outputRouter` focused on routing thresholds, vault settings, and native post-tool routing.
- Validate capture with a deterministic fixture adapter first, then MCP read-only as the first real adapter target, using Serena read-only symbol/reference/diagnostic calls as the live smoke provider when host capability exists.

Steps:

1. Reopen the primary spec and foundational output-router design.
2. Inspect current router result types and vault metadata.
3. Decide the implementation schema for identity and recovery:
   - whether to keep one `outputId`,
   - or split conceptual identity into `recordId` and recovery identity into `recoveryOutputId` / `outputId`.
4. Decide where capture/provider config lives:
   - top-level `capture` / `providers`,
   - or nested under `outputRouter`.
5. Decide the first concrete read-only producer adapter to validate the interface.
6. Record the decisions in the spec or a short decision checkpoint.
7. Review the updated artifact.
8. Do not start Slice 1 until the owner approves the Slice 0 decisions and artifact review reports no blocking findings.

Checks:

- Existing router tests still pass before implementation work starts.
- `npm run test:router`
- `node --check plugins/freeflow/pi-extension/dist/index.js`
- Artifact review reports no blocking findings for the Slice 0 decisions.

Stop if:

- the chosen schema would break existing `freeflow_run` or `freeflow_retrieve` recovery without a compatibility path,
- config nesting would contradict current setup docs without an approved spec update,
- adapter support requires a host capability that Pi/current target does not expose,
- owner approval is missing for any public result-shape, config-shape, setup-flow, or adapter-scope decision beyond the approved Slice 0 decisions.

## Slice 1: Universal Evidence Record And Recoverability

Purpose: generalize vault/result metadata without changing user-visible behavior yet.

Steps:

1. Add internal types for:
   - producer descriptor,
   - persistence status,
   - recoverability mode,
   - lineage metadata,
   - evidence record identity.
2. Extend vault metadata to support non-command producers while preserving existing command-output records.
3. Keep current `ffout_*` recovery working.
4. Update `freeflow_run` result assembly to populate recoverability/persistence fields without changing its core behavior.
5. Extend `freeflow_retrieve` vault querying to understand producer/persistence metadata when present.

Tests:

- existing `freeflow_run` output ids remain recoverable,
- legacy vault records still retrieve,
- new metadata stores and round-trips,
- recoverability modes render correct recovery messages,
- `routing.status` remains separate from persistence and execution/tool status.

Stop if:

- existing recovery semantics become ambiguous,
- metadata-only/redacted records accidentally promise exact recovery.

## Slice 2: Failure Contract Foundation

Purpose: make future capture/derive failures deterministic and explainable.

Steps:

1. Add shared result helpers for structured failure cases:
   - adapter unavailable,
   - unsupported producer,
   - mutating producer rejected,
   - producer execution failure,
   - partial capture,
   - storage/vault failure,
   - redaction failure,
   - derive source unavailable,
   - derive validation/execution failure.
2. Ensure results separate:
   - `toolStatus`,
   - producer/execution status,
   - `routing.status`,
   - `persistence.status`,
   - `recoverability`.
3. Add tests for each failure case before wiring real producers.

Checks:

- Failure results do not throw uncaught errors for expected operational failures.
- If partial output was captured, recovery is accurately described.
- If nothing was persisted, recovery is explicitly unavailable.

## Slice 3: Internal `freeflow_capture` Interface And Read-Only Enforcement

Purpose: add the service/protocol producer interface internally without exposing a public tool before a real read-only adapter exists.

Slice contract:

- **Source truth:** spec tool-boundary and read-only capture rules.
- **Module/interface changed:** internal capture module/interface only; no public Pi tool registration yet.
- **Verification:** fixture-backed core tests prove capture/routing/lineage/failure behavior.
- **Review checkpoint:** not required unless the internal interface diverges from the spec.
- **Stop conditions:** capture becomes a shallow proxy, or public exposure is needed before a real adapter is proven.

Steps:

1. Define internal `freeflow_capture` input schema with a `producer` object and `args`.
2. Define the read-only producer adapter interface.
3. Implement a deterministic fixture/test producer adapter to validate:
   - capture,
   - routing,
   - recoverability,
   - lineage,
   - failure contracts.
4. Reject mutating producers through the capture path with a clear result.
5. Keep public Pi tool registration disabled/internal until Slice 4 proves at least one production-safe read-only adapter.

Tests:

- successful read-only fixture capture returns bounded evidence and recovery,
- large captured output routes instead of dumping raw content,
- unsupported producer returns structured failure,
- mutating producer returns structured rejection,
- producer unavailable returns structured failure,
- internal schema validates expected arguments.

Stop if:

- implementing the first real producer requires magical host-tool proxying,
- `freeflow_capture` starts looking like a shallow pass-through without capture/routing/lineage value,
- no real read-only adapter is available and public exposure is being considered anyway.

## Slice 4: First Real Read-Only Producer Adapter And Public Exposure Gate

Purpose: validate adapter design against a real service/protocol producer before exposing `freeflow_capture` publicly.

2026-06-22 update: Pi public exposure is now unblocked through an explicit adapter bridge, not hidden interception. Serena is installed/configured through `pi-mcp-adapter`, and the Freeflow Pi extension owns a minimal MCP stdio bridge for the allowlisted Serena read-only symbol/reference/diagnostic tools. Keep broader MCP/provider capture out of scope until provider manifests/config and read-only policy are implemented.

Candidate order:

1. MCP read-only adapter if the host exposes a safe MCP call surface; use Serena read-only symbol/reference/diagnostic calls as the live smoke provider.
2. Web/fetch adapter if the host exposes a safe callable surface.
3. Code-search or other service/protocol read-only adapter if it has a stable host call surface.

Steps:

1. Inspect host/adapter capability before choosing.
2. Implement only read-only producer calls.
3. Add provider/producer metadata to result records.
4. Add large-output and exact/recoverability tests.
5. Add an integration smoke where possible.
6. After at least one production-safe read-only adapter is verified, add `freeflow_capture` to Pi extension tool schemas.
7. Render `freeflow_capture` results in Pi with the same status separation as existing routed tools.

Checks:

- The chosen adapter works without requiring external services in core tests.
- External-service tests are skippable or fixture-backed.
- Direct provider/tool calls remain available outside Freeflow.
- Pi schema validates expected arguments after public exposure.
- Pi renderer labels producer, routing, persistence, and recovery after public exposure.

Stop if:

- no real read-only producer adapter is available,
- the adapter would need to call mutating provider tools,
- credentials/secrets would be persisted without explicit policy,
- host support is too weak and would force hidden interception,
- public exposure would create a tool with only fixture/internal producers.

## Slice 5: Deterministic `freeflow_derive`

Purpose: add bounded transformation over existing evidence through vertical operation slices.

Operations in scope for this slice group:

- regex filter with context,
- count matches,
- JSON pointer/path extraction,
- group by regex,
- dedupe,
- top N / sort-limited extraction,
- extract URLs/citations,
- line stats / size stats.

Shared steps:

1. Define `freeflow_derive` schema with source, operation, preserve, and caps.
2. Support vault sources first.
3. Add repo-source support only if it reuses existing retrieval confinement rules.
4. Always create at least a metadata/lineage record when possible; content recoverability follows persistence policy.
5. Preserve source lineage.
6. Route derived output before returning it.
7. Add Pi extension schema and renderer after core tests pass.

Operation sub-slices:

- **Slice 5A:** schema + vault source + regex filter with context + count matches + lineage/routing tests.
- **Slice 5B:** JSON pointer/path extraction + invalid JSON/path failure tests.
- **Slice 5C:** group by regex + dedupe + top N / sort-limited extraction tests.
- **Slice 5D:** extract URLs/citations + line stats / size stats tests.
- **Slice 5E:** Pi schema/renderer tests and integration smoke after core derive behavior is stable.

Tests:

- each deterministic operation has success tests,
- invalid operation inputs fail structurally,
- huge derived output is routed and recoverable according to policy,
- derived evidence points to source output ids,
- missing source output fails clearly,
- derived output recovery works when exact recovery is available,
- Pi schema validates derive arguments after public exposure,
- Pi renderer labels source, operation, lineage, routing, persistence, and recovery.

Stop if:

- derive begins executing arbitrary code,
- source lineage is lost,
- derived output bypasses router caps.

## Slice 6: Provider Manifests And Runtime Context Summary

Purpose: help the agent choose tools without prompt bloat.

Steps:

1. Add provider manifest schema.
2. Add built-in manifest support.
3. Add compact deterministic runtime rendering.
4. Add custom manifest validation and labeling.
5. Add provider availability status if the host adapter can detect it.
6. Inject only compact summaries, not raw provider docs.

Built-in manifest candidates:

- Serena read-only symbol/reference/diagnostic capabilities.
- codebase-memory-mcp read-only graph/search/architecture capabilities.

Tests:

- manifest schema validation,
- compact rendering stays under budget,
- custom manifests are labeled custom/unverified,
- capabilities describe bounded use-cases and do not enumerate every provider operation,
- unavailable configured providers render concise unavailable notes only when useful.

Stop if:

- provider summaries become long manuals,
- manifests claim capabilities not supported by installed adapters,
- custom manifest text is injected raw by default.

## Slice 7: Setup And Config

Purpose: make capture/provider setup discoverable while avoiding stale default dumps.

Steps:

1. Update setup skill/docs so `/setup-freeflow` asks one Output Router/capture/provider decision point.
2. If declined, keep normal setup path.
3. If accepted, ask only path-changing follow-ups:
   - router profile,
   - direct host-tool capture policy,
   - providers to enable,
   - read-only provider categories.
4. Write high-level decisions and intentional overrides only.
5. Keep direct host-tool capture off unless explicitly enabled.
6. Verify config parsing and effective config.

Tests/checks:

- config accepts high-level capture/provider decisions,
- config rejects invalid recoverability/capture/provider values,
- existing minimal config remains valid,
- setup does not dump all effective defaults,
- setup does not enable direct host-tool capture silently.

Stop if:

- setup would write repo-local storage or direct host capture without explicit user choice,
- setup would overwrite existing repo instructions without resolving source-truth conflicts.

## Slice 8: Doctor / Status / Migration

Purpose: make effective behavior inspectable.

Steps:

1. Add status/doctor surface for:
   - router enabled/profile,
   - vault path/writability,
   - capture policy,
   - enabled providers,
   - provider availability,
   - custom manifest validity,
   - recoverability defaults,
   - stale/deprecated config keys.
2. Add migration recommendations for stale explicit config.
3. Require confirmation before rewriting config.

Tests:

- doctor reports effective defaults without writing config,
- invalid config produces warnings and safe fallback,
- migrate recommendations are non-destructive until confirmed.

## Slice 9: Docs, Evals, And Review

Purpose: prove behavior before public claims.

Steps:

1. Update output-router skill guidance after tools exist.
2. Add concise public docs only after verification.
3. Add evals comparing:
   - direct read-only provider output vs `freeflow_capture`,
   - long log manual inspection vs `freeflow_derive`,
   - web/MCP-shaped output capture and recovery,
   - provider-summary tool-choice accuracy.
4. Run an artifact review on updated docs/spec/plan if behavior diverges.
5. Run implementation review before closeout.

Checks:

- `npm run test:router`
- `node --check plugins/freeflow/pi-extension/dist/index.js`
- `git diff --check`
- targeted eval/report artifact for capture/derive behavior

Stop if:

- docs imply measured superiority without eval evidence,
- docs imply `freeflow_capture` mediates mutating provider tools,
- output-router skill guidance conflicts with direct/native tool semantics.

## Slice 10: Script Derive Design Only

Purpose: prepare later script derive without smuggling execution into deterministic derive.

Steps:

1. Write a separate sandbox/security design before implementation.
2. Define allowed languages, input mounting, filesystem permissions, network policy, timeouts, output caps, failure behavior, and lineage hashing.
3. Review the design before coding.

Stop if:

- arbitrary code execution is added to `freeflow_retrieve`,
- script derive is implemented without sandbox/security review,
- script output can bypass router capture/routing.

## Final Verification Before Completion Claims

Before claiming implementation complete:

- all relevant router tests pass,
- Pi extension syntax check passes,
- recoverability modes are tested,
- direct host-tool capture is off by default,
- `freeflow_capture` rejects mutating producers,
- derived evidence points back to source evidence,
- exact recovery works where promised,
- redacted/metadata-only/no-recovery cases do not promise exact recovery,
- docs and skills match implemented behavior,
- review findings are adjudicated.

## Handoff Criteria

If pausing mid-plan, create a handoff that includes:

- completed slice,
- current schema decisions,
- changed files,
- tests run and results,
- open source-truth conflicts or owner decisions,
- next slice and stop conditions.
