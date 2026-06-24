> **Doc ID:** PLAN-2026-06-24-freeflow-observed-output-routing-vault-index-script-derive
> **Date:** 2026-06-24
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** In progress — Slices 0-16 implemented; Slice 17 partially implemented for explicit QuickJS JavaScript execution; Python and jq execution remain unavailable
> **Source:** `docs/specs/freeflow-observed-output-routing-vault-index-and-script-derive-design.md`

# Freeflow Observed Output Routing, Vault Index, And Script Derive Implementation Plan

## Goal

Implement the Pi-first observed-output routing architecture from `docs/specs/freeflow-observed-output-routing-vault-index-and-script-derive-design.md` from start to finish, slice by slice:

- route enabled MCP/web/fetch/code-search tool outputs after direct Pi tool calls,
- keep host execution, permissions, and sandboxing with Pi,
- preserve exact recovery when policy allows,
- reduce huge/noisy output with deterministic producer-aware reducers,
- add setup/status support for explicit producer/server persistence choices,
- add vault-wide search/index over persisted evidence,
- extend `freeflow_derive` with sandboxed script operations under the same public tool,
- remove Pi public `freeflow_capture` and the hardcoded Serena bridge after Pi observed routing is proven.

Slices are execution units, not product versions. Do not describe incomplete slices as a shipped v1/MVP.

Claude and Codex adapters are deferred until Pi observed routing and the general output router are complete and proven. This plan should keep adapter seams clean, but it should not implement Claude or Codex hooks.

## Source Authority

Primary spec:

- `docs/specs/freeflow-observed-output-routing-vault-index-and-script-derive-design.md`

Superseded or updated source truth to reconcile during execution:

- `docs/specs/freeflow-universal-output-capture-and-derive-design.md`
- `docs/designs/freeflow-script-derive-sandbox-design.md`

Router and Pi implementation areas:

- `plugins/freeflow/router/src/`
- `plugins/freeflow/router/tests/`
- `plugins/freeflow/pi-extension/src/`
- `plugins/freeflow/pi-extension/dist/`
- `plugins/freeflow/router/dist/`

Docs, skills, setup, evals:

- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/setup-freeflow/SKILL.md`
- `plugins/freeflow/skills/setup-freeflow/references/output-router-setup.md`
- `plugins/freeflow/docs/`
- `plugins/freeflow/evals/README.md`
- `plugins/freeflow/evals/scripts/`
- `plugins/freeflow/evals/reports/runtime/`

Deferred adapter surfaces, not implemented by this plan:

- `plugins/freeflow/hooks/`
- `plugins/freeflow/.claude-plugin/`
- `plugins/freeflow/.codex-plugin/`

Live repo evidence overrides this plan. If source truth changes while implementing, update the plan or route back to discovery/spec before patching forward.

## Non-Goals

Do not:

- implement Claude or Codex observed-routing adapters in this plan,
- implement repo-wide indexing as a source-file search replacement,
- make Freeflow authorize or block mutating MCP/provider operations,
- require per-tool allowlists for observed routing,
- silently persist exact sensitive-provider content without explicit config,
- offer `redacted` persistence as a current option,
- keep public Pi `freeflow_capture` after Pi observed routing meets removal criteria,
- add unsandboxed script execution,
- claim superiority over Context Mode before benchmark evidence exists.

## Persistence Decision

Setup/runtime support only these observed-routing persistence modes:

- `exact`,
- `metadata-only`,
- `none`.

`redacted` does not exist yet. It is a possible future feature that requires its own policy, deterministic redactor, and adversarial tests. If a user hand-edits config to `redacted`, Freeflow should warn and fall back to a safe non-content mode such as `metadata-only`.

Setup must require the user to choose persistence for each enabled producer/server before writing config. Recommended setup defaults:

- public-ish evidence producers such as GitHub, web, fetch, and code search: `exact`,
- sensitive or unknown producers such as Gmail, Slack, private customer systems, or likely-secret outputs: `metadata-only`.

The agent/setup flow may recommend these defaults, but it must not silently make privacy/storage decisions for the user.

## Architecture Rules

Use deep modules. Keep public behavior simple and hide host/provider/storage/reducer/sandbox details behind stable interfaces.

Target module split:

```text
observed-routing core
  identify-producer
  normalize-output
  routing-policy
  risk-classifier
  reducer-registry
  observed-result-router

reducers
  generic-text
  json
  mcp
  web-search
  fetch
  code-search

host adapters
  pi tool_result adapter now
  claude/codex adapters later, outside this plan

vault-index
  chunk
  index
  query
  retention/cleanup

derive
  deterministic engine
  script engine
  source resolver
  operation hashing

sandbox adapters
  javascript
  python
  jq/equivalent
```

Avoid a single god module that owns host hook handling, config parsing, reducers, persistence, indexing, and script execution.

## Likely Files Touched

Router core:

- `plugins/freeflow/router/src/types.ts`
- `plugins/freeflow/router/src/config.ts`
- `plugins/freeflow/router/src/schema.ts`
- `plugins/freeflow/router/src/evidence.ts`
- `plugins/freeflow/router/src/vault.ts`
- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/derive.ts`
- possible new files:
  - `plugins/freeflow/router/src/observed-routing.ts`
  - `plugins/freeflow/router/src/observed-producers.ts`
  - `plugins/freeflow/router/src/observed-policy.ts`
  - `plugins/freeflow/router/src/reducers/*.ts`
  - `plugins/freeflow/router/src/vault-index/*.ts`
  - `plugins/freeflow/router/src/script-derive/*.ts`
  - `plugins/freeflow/router/src/sandbox/*.ts`

Pi extension:

- `plugins/freeflow/pi-extension/src/index.ts`
- `plugins/freeflow/pi-extension/src/native-safety-net.ts`
- `plugins/freeflow/pi-extension/src/status.ts`
- `plugins/freeflow/pi-extension/src/runtime-context.ts`
- `plugins/freeflow/pi-extension/src/renderers.ts`
- `plugins/freeflow/pi-extension/src/schemas.ts`
- possible new files:
  - `plugins/freeflow/pi-extension/src/observed-tool-routing.ts`
  - `plugins/freeflow/pi-extension/src/host-producer-identification.ts`

Tests/evals:

- `plugins/freeflow/router/tests/*.test.js`
- possible new tests:
  - `observed-routing.test.js`
  - `reducers.test.js`
  - `vault-index.test.js`
  - `script-derive.test.js`
  - `pi-extension-observed-routing.test.js`
- `plugins/freeflow/evals/scripts/`
- `plugins/freeflow/evals/reports/runtime/`

Generated output:

- `plugins/freeflow/router/dist/`
- `plugins/freeflow/pi-extension/dist/`

## Slice 0: Source Reconciliation, Baseline, And Artifact Review

Purpose: confirm the spec/plan are fit to execute and capture baseline behavior before structural edits.

Steps:

1. Review `docs/specs/freeflow-observed-output-routing-vault-index-and-script-derive-design.md` as the new source authority.
2. Inspect the previous universal capture/derive spec for conflicts that must be superseded explicitly.
3. Inspect current router/Pi extension baseline for `freeflow_capture`, native safety-net routing, status/config, and derive behavior.
4. Run baseline checks:
   - `npm run test:router`
   - `node --check plugins/freeflow/pi-extension/dist/index.js`
   - `git diff --check && git diff --cached --check`
5. Run an artifact review of the revised spec and this plan before Slice 1 implementation.

Stop if:

- artifact review finds a blocking source-truth conflict,
- owner decisions about persistence/privacy/config are still missing,
- baseline tests fail for unrelated reasons that would obscure later regressions.

## Slice 1: Observed Routing Config And Status Surface

Purpose: add the config contract without routing any output yet.

Steps:

1. Add `observedRouting` config types and parser support.
2. Support:
   - `observedRouting.enabled`,
   - `observedRouting.onRoutingFailure`,
   - `observedRouting.mcp.servers.<server>.enabled`,
   - server persistence mode,
   - `web`, `fetch`, and `codeSearch` enablement/persistence.
3. Support only `exact`, `metadata-only`, and `none` persistence modes.
4. Treat `redacted` as invalid/reserved: warn and fall back to `metadata-only`.
5. Preserve existing minimal config behavior: missing optional sections mean built-in defaults.
6. Keep observed routing effectively off unless explicitly configured.
7. Update `freeflow_status` to report observed routing config and warnings.
8. Add migration/status warnings without rewriting config.

Tests/checks:

- valid config parses,
- invalid config warns and falls back safely,
- `redacted` warns and falls back to `metadata-only`,
- minimal config remains valid,
- status reports observed routing off by default,
- status reports configured servers and persistence modes.

Stop if:

- config shape would dump defaults into `.freeflow/config.json`,
- persistence defaults would silently enable exact sensitive-provider capture.

## Slice 2: Observed Routing Core Contracts

Purpose: implement the host-agnostic backend that can route an already-completed tool result.

Steps:

1. Add an observed-output input contract:
   - host name,
   - host tool name,
   - tool input hash/summary,
   - producer descriptor,
   - raw visible result,
   - result shape/media type,
   - configured persistence policy,
   - session/vault config.
2. Add observed-output result contract:
   - toolStatus,
   - observed routing status,
   - persistence,
   - recoverability,
   - producer identity,
   - risk metadata,
   - evidence packets,
   - recovery instructions,
   - fail-open metadata.
3. Add output extraction/normalization for text, JSON, content blocks, and structured stdout/stderr-like shapes.
4. Add exact, metadata-only, and none persistence behavior.
5. Do not implement redacted persistence.
6. Add fail-open behavior for routing failures.
7. Reuse existing vault text records where possible; add metadata-only records only if the current vault model cannot represent them cleanly.

Tests/checks:

- exact observed text persists and recovers,
- metadata-only does not persist content or promise exact recovery,
- none does not persist or promise recovery,
- redacted input/config is rejected or safely downgraded before this core path,
- routing failure returns fail-open result,
- result shape keeps host status separate from routing/persistence/recoverability.

Stop if:

- exact recovery semantics become ambiguous,
- metadata-only records pretend content is recoverable,
- fail-open would drop the original tool output.

## Slice 3: Pi Producer Identification And Risk Metadata

Purpose: classify observed Pi tool results into producer descriptors and read/write/unknown metadata.

Steps:

1. Add Pi-specific producer identification helpers.
2. Detect MCP server/tool from Pi's observed MCP gateway/tool result shapes where available.
3. Detect Pi web/fetch/code-search producers by tool name and input shape.
4. Add risk classification metadata:
   - configured override placeholder,
   - MCP annotation placeholder,
   - built-in manifest knowledge placeholder,
   - deterministic name heuristics,
   - `unknown` fallback.
5. Ensure risk classification never blocks routing.
6. Keep generic host adapter interfaces clean enough for future Claude/Codex adapters, but do not implement those adapters.

Tests/checks:

- GitHub-like MCP search tool identifies server/tool and read-ish risk,
- GitHub-like MCP create tool identifies server/tool and write-ish risk,
- unknown MCP tool still identifies producer and risk unknown,
- Pi web/fetch/code-search producers identify correctly when representative events are available,
- disabled producer returns no route decision.

Stop if:

- Pi event shapes are too ambiguous to identify producer without unsafe guessing.

## Slice 4: Reducer Registry, Generic Text, And JSON Reducers

Purpose: create deterministic reduction infrastructure before producer-specific reducers.

Steps:

1. Add reducer registry keyed by producer kind and normalized output shape.
2. Implement generic text reducer:
   - exact small pass-through,
   - bounded large/noisy windows,
   - exact line ranges,
   - omitted counts.
3. Implement JSON reducer:
   - root type/shape summary,
   - list length,
   - selected stable fields,
   - compact item rows,
   - omitted count.
4. Ensure reducers return evidence packets with recovery/source pointers.
5. Keep reducer caps configurable through router thresholds and producer defaults, not many caller flags.

Tests/checks:

- small output passes through near-raw,
- large text output is bounded and recoverable,
- JSON array output returns compact rows and omitted count,
- JSON object output preserves key paths and important scalar fields,
- reducers preserve exact IDs, URLs, status, errors, and paths when present.

Stop if:

- reducer output becomes lossy prose without exact evidence,
- caller code must know reducer internals to use observed routing.

## Slice 5: MCP Reducer And Core Observed MCP Fixtures

Purpose: prove the main producer target in host-agnostic fixtures.

Steps:

1. Add MCP-specific reducer for:
   - text content blocks,
   - JSON/structured content,
   - mixed content arrays.
2. Add fixtures for:
   - GitHub issue search/list output,
   - GitHub create/update issue response,
   - Gmail-like sensitive search output,
   - Vercel deployment output,
   - Context7/library-doc-like output.
3. Verify read/write/unknown risk labels are metadata only.
4. Verify server-level persistence policy:
   - GitHub exact,
   - Gmail metadata-only,
   - disabled server no routing.
5. Add benchmark helpers for raw bytes/items vs returned evidence bytes/items.

Tests/checks:

- enabled MCP output routes,
- disabled MCP output is not modified,
- mutating MCP response routes and preserves object id/status/url,
- sensitive metadata-only result does not persist raw content,
- exact result recovers raw content.

Stop if:

- server-level persistence is insufficient for a fixture in a way that requires owner-approved tool-level policy.

## Slice 6: Pi Observed Routing Hook Integration

Purpose: wire observed routing into Pi's `tool_result` hook.

Steps:

1. Add `handleObservedToolRouting(event, ctx)` in the Pi extension.
2. Call it from `pi.on("tool_result")` before the native read/bash safety net.
3. Convert Freeflow observed result into Pi tool result content/details.
4. Preserve existing native safety-net behavior for read/bash.
5. Add Pi mock tests for MCP-like, web_search-like, fetch_content-like, and code_search-like events.
6. Add a live or fixture smoke for an MCP direct call where available.

Tests/checks:

- Pi observed routing modifies enabled MCP result,
- Pi observed routing leaves disabled producer result unchanged,
- Pi routing failure passes original output with warning,
- existing native safety-net tests still pass,
- `npm run test:router`,
- `npm run build:pi-extension`,
- `node --check plugins/freeflow/pi-extension/dist/index.js`.

Stop if:

- Pi event details do not provide enough exact output to route recoverably,
- Pi cannot preserve original result on routing failure.

## Slice 7: Web, Fetch, And Code-Search Reducers For Pi

Purpose: implement non-MCP producer reducers and Pi fixture coverage.

Steps:

1. Implement web-search reducer:
   - query,
   - title,
   - URL,
   - snippet,
   - citation/source,
   - omitted count.
2. Implement fetch reducer:
   - content-type aware HTML/markdown/JSON/plain text handling,
   - headings/title/canonical URL,
   - code blocks and relevant exact sections.
3. Implement code-search reducer:
   - repo/source,
   - file path,
   - line numbers,
   - symbol names,
   - exact snippets.
4. Add Pi producer identification for these tools where Pi exposes them in `tool_result`.
5. Add fixture benchmarks for raw vs routed output.

Tests/checks:

- web search preserves exact snippets and URLs,
- fetch preserves headings/code blocks/key paths,
- code-search preserves exact code snippets and line references,
- large outputs are bounded and recoverable when exact persistence is configured,
- unsupported/unidentified Pi tool shapes pass through unchanged.

Stop if:

- reducer needs model-assisted summarization to be useful; route back to design before adding it.

## Slice 8: Setup Flow, Status, And Config UX

Purpose: make observed routing configurable without runtime ambiguity.

Steps:

1. Update setup guidance so the evidence-routing decision point can enable observed routing.
2. When accepted, setup discovers or asks for producer/server entries and chooses persistence for each enabled producer/server.
3. Recommended defaults:
   - exact for public-ish evidence producers such as GitHub, web, fetch, and code search,
   - metadata-only for sensitive or unknown producers.
4. Ensure setup does not offer `redacted`.
5. Ensure setup persists explicit server entries only, not a volatile inventory of all installed MCP tools.
6. Update `freeflow_status` to report observed routing, persistence modes, unsupported redacted config, and Pi host capability.
7. Do not write config unless user/setup explicitly chooses observed routing.

Tests/checks:

- setup/reference docs describe per-producer persistence choice,
- no setup path writes `redacted`,
- status reports configured observed routing accurately,
- minimal setup still writes only `defaultMode` unless optional routing is explicitly chosen.

Stop if:

- setup would silently choose exact persistence for a sensitive producer.

## Slice 9: Pi Observed Routing Evals And Benchmark Report

Purpose: prove Pi observed routing before removing `freeflow_capture`.

Steps:

1. Add an eval script for Pi observed routing fixtures.
2. Cover:
   - direct raw MCP output vs observed routed output,
   - GitHub-like read output,
   - mutating MCP output,
   - sensitive metadata-only output,
   - web search,
   - fetch,
   - code-search,
   - Pi capability status.
3. Record raw bytes/lines/items vs returned evidence bytes/lines/items, including percentage byte reduction where a raw baseline exists.
4. Verify exact facts preserved and recoverability is accurate.
5. Write a runtime report under `plugins/freeflow/evals/reports/runtime/`.
6. Do not claim Context Mode superiority unless comparable benchmark evidence exists.

Checks:

- eval gates pass,
- report is generated and committed,
- `npm run test:router`,
- `npm run build`,
- `git diff --check && git diff --cached --check`.

Stop if:

- Pi observed routing does not materially reduce large/noisy fixture output,
- exact critical facts are lost,
- recovery instructions are wrong.

## Slice 10: Remove Pi Public `freeflow_capture` And Serena Bridge

Purpose: clean up the old public call-through path after Pi observed routing is proven.

Prerequisite: Slice 9 passes and reviewer agrees Pi observed routing meets removal criteria.

Steps:

1. Remove public Pi registration for `freeflow_capture`.
2. Remove or archive hardcoded Serena MCP bridge code.
3. Remove `freeflow_capture` prompt guidance from Pi extension runtime/tool snippets.
4. Update output-router skill/setup docs/status docs to present observed routing as the primary Pi provider path.
5. Update universal capture/derive spec or add a changelog note to avoid conflicting source truth.
6. Remove or rewrite capture-specific evals/tests that no longer apply.
7. Keep reusable core vault/routing/reducer code.

Tests/checks:

- no public `freeflow_capture` tool appears in Pi schemas,
- no Serena-only hardcoded capture path remains,
- observed routing tests remain green,
- docs/skills do not instruct agents to use removed tools,
- `npm run test:router`,
- `npm run build`.

Stop if:

- Pi still needs `freeflow_capture` as the only recoverable route. Ask before keeping or replacing it.

## Slice 11: Vault Index Storage Spike And Interface

Purpose: choose and isolate the vault indexing engine behind an interface.

Lifecycle contract:

- Fresh sessions start with an empty vault index.
- The vault remains source truth; the index is a sidecar search layer for persisted vault evidence.
- Indexing is incremental and write-through: each successful persisted append should call `indexRecord(record, text, metadata)` for that record.
- Thresholds may batch, debounce, compact, or rebuild storage as an optimization only; they must not decide whether persisted output is semantically indexable.
- `exact` persistence indexes deterministic chunks plus producer/recovery metadata.
- `metadata-only` indexes metadata, counts, hashes, producer identity, timestamps, and routing facts only; it must not index raw content.
- `none` creates no index entry.
- Index failure is non-blocking for routing and raw vault recovery; status reports degraded/stale index state and rebuild need.

Steps:

1. Define vault-index interfaces:
   - `indexRecord(record, text, metadata)`,
   - `queryVault(query, filters, caps)`,
   - `deleteExpired(session/retention)`,
   - `status()`.
2. Run a focused benchmark comparing storage candidates such as SQLite FTS and deterministic local index files.
3. Choose the engine based on:
   - query quality,
   - speed,
   - dependency footprint,
   - portability,
   - install complexity,
   - retention cleanup behavior.
4. Keep the storage engine hidden behind the interface.
5. Record benchmark evidence in a runtime report or plan update.

Slice 11 decision after benchmark:

- Use `local-json-sidecar` behind the vault-index interface for subsequent slices.
- Keep SQLite/FTS deferred because introducing a native dependency or relying on experimental runtime SQLite needs explicit owner approval.
- Evidence: `plugins/freeflow/evals/reports/runtime/vault-index-storage-spike-1-report.md`.

Tests/checks:

- interface tests run against a fixture implementation,
- benchmark output is saved,
- decision is documented in the plan/spec or a small decision note if surprising.

Stop if:

- storage choice introduces a new native dependency or platform requirement that needs owner approval.

## Slice 12: Vault Index Write Path

Purpose: index persisted evidence without changing retrieval behavior yet.

Steps:

1. Index command output, observed routed output, deterministic derive output, and future script-derived output immediately after each successful persisted append.
2. Start from an empty index for a fresh session and grow it record-by-record as Freeflow tools persist outputs.
3. Treat batching/debouncing/compaction thresholds as implementation optimizations only; they must not delay semantic indexability beyond the append that persisted the record.
4. Store metadata:
   - outputId,
   - recordId,
   - sessionId,
   - producer kind,
   - MCP server/tool,
   - host tool name,
   - stream,
   - createdAt,
   - content hash,
   - recoverability,
   - chunk id,
   - line/item range.
5. Chunk large output deterministically.
6. Ensure metadata-only/no-persist policies do not index raw content.
7. Make index failure non-blocking for routing and persistence.
8. Add status reporting for index state, last failure, stale/degraded state, and rebuild need.

Tests/checks:

- exact persisted output indexes on the append that stores it,
- a fresh session starts empty and grows record-by-record,
- metadata-only output does not index raw content,
- no-persist output does not index,
- batching/threshold settings do not change semantic indexability,
- index failure does not break routing,
- retention cleanup removes expired index chunks.

Slice 12 decision after implementation:

- Vault writes now call the local vault index after successful persisted append for command, text/observed, metadata-only, and repo-reference records.
- Index failures are non-blocking: vault persistence and exact recovery remain intact, and status can report the last index error/degraded availability.
- A process-local write lock protects local sidecar read-modify-write updates from concurrent in-process append races.
- The benchmark now measures automatic append indexing rather than a separate manual reindex step.
- Evidence: `npm run test:router` passed 254/254 tests; `npm run bench:router:vault-index` passed; `git diff --check && git diff --cached --check` passed.

Stop if:

- index writes can corrupt vault records or block core routing.

## Slice 13: Vault Query Integration In `freeflow_retrieve`

Purpose: make vault-wide search usable through the existing retrieval tool.

Steps:

1. Extend `freeflow_retrieve` vault `query` and `locate` actions to support vault-wide search when no specific `outputId` is supplied.
2. Add optional filters:
   - producerKind,
   - server,
   - tool,
   - hostToolName,
   - sessionId/current session,
   - stream,
   - time range if needed.
3. Return evidence packets with exact recovery paths to source output ids and line/item ranges.
4. Keep explicit outputId retrieval behavior unchanged.
5. Update Pi schema and renderer if needed.

Tests/checks:

- query finds chunks across multiple output ids,
- filters narrow results correctly,
- exact line recovery works from query evidence,
- repo retrieval behavior is unchanged,
- no repo source files are indexed or queried through vault index.

Slice 13 decision after implementation:

- `freeflow_retrieve` now supports vault-wide `query` and `locate` through the local vault index when `source.kind="vault"` omits `outputId`.
- Explicit `source.outputId` query/retrieve/expand/explain behavior remains available for exact recovery.
- Vault-wide results return evidence packets with source output ids, streams, line ranges where raw content is recoverable, and non-expandable metadata-only packets when raw content is not recoverable.
- Pi schema/normalization allows output-id-free vault query/locate and passes producer/server/tool/hostToolName/recordKind/recoverability/stream filters.
- Evidence: targeted Slice 13 tests passed for router retrieval, Pi tool execution, and vault-index behavior; full `npm run test:router` passed 259/259 tests and `git diff --check && git diff --cached --check` passed.

Stop if:

- vault query results cannot provide recoverable source pointers.

## Slice 14: Script Derive Source-Truth Reconciliation

Purpose: update the existing script-derive design before implementation.

Steps:

1. Update `docs/designs/freeflow-script-derive-sandbox-design.md` to reflect:
   - one public `freeflow_derive` tool,
   - `operation.kind="script"`,
   - this plan/spec as the source-truth revision for target languages JavaScript, Python, and jq/equivalent,
   - no separate public `freeflow_script_derive` tool.
2. Keep the sandbox requirements strict:
   - disabled by default,
   - setup must not enable script derive by default,
   - no network,
   - no env/home/repo/vault direct access,
   - copied read-only vault inputs,
   - bounded output/resources,
   - no unsandboxed fallback.
3. Keep each language unavailable until its adapter passes capability probes, adversarial isolation tests, and review.
4. Review the updated design artifact.

Checks:

- artifact review passes,
- source truth no longer conflicts on separate-tool vs single-tool decision,
- no code changes to execute scripts before review.

Slice 14 decision after review:

- `docs/designs/freeflow-script-derive-sandbox-design.md` now matches the current source-truth shape: one public `freeflow_derive` tool, `operation.kind="script"`, flat `sources[]` entries, top-level `limits`, JavaScript/Python/jq-or-equivalent target languages, disabled by default, and no unsandboxed fallback.
- `redacted` is documented as reserved/unsupported future work, not working script-derive recovery.
- Artifact confirmation review passed: fit to guide Slice 15.

Stop if:

- sandbox/language decisions reveal a new owner-owned security/privacy decision.

## Slice 15: Script Derive Schema, Config/Status, Source Resolver, And Structured Unavailable

Purpose: add the public API shape, default-off gate, status surface, and failure behavior before executing any code.

Steps:

1. Extend `freeflow_derive` schema with:
   - `sources[]` with aliases,
   - `operation.kind="script"`,
   - `operation.language`,
   - `operation.code`,
   - limits.
2. Preserve existing single `source` deterministic operation compatibility.
3. Add script-derive config/status support:
   - `scriptDerive.enabled` defaults to `false`,
   - setup must not enable script derive by default,
   - execution returns structured disabled/unavailable when disabled,
   - allowed languages are reported from config plus sandbox capability probes,
   - network policy, effective resource limits, and raw-script persistence state are reported.
4. Add source resolver for vault records:
   - recover selected streams,
   - enforce alias validation,
   - enforce max input bytes,
   - compute source hashes.
5. Add operation hashing without persisting raw script text by default.
6. Return structured `script_derive_disabled`, `adapter_unavailable`, or `derive_validation_failure` before any sandbox execution when applicable.
7. Do not execute code in this slice.

Tests/checks:

- deterministic derive calls still pass,
- script operation schema validates valid input,
- script derive is disabled by default,
- disabled script derive returns structured disabled/unavailable,
- setup/status do not imply script derive is enabled by observed routing,
- status reports enabled/off, adapter/language availability, no-network policy, limits, and raw-script persistence state,
- invalid aliases/streams/source ids fail clearly,
- no sandbox returns structured unavailable,
- raw script text is not persisted by default.

Stop if:

- adding script operation breaks deterministic derive compatibility,
- any path could execute script code while `scriptDerive.enabled` is false.

Slice 15 decision after implementation:

- `freeflow_derive operation.kind="script"` now has a public schema under the existing tool, flat `sources[]`, top-level `limits`, default-off `scriptDerive` config/status, and structured disabled/unavailable failure behavior.
- Per-call script limits only tighten configured `scriptDerive.limits`; calls cannot raise configured input/output/time caps.
- No script code executes in this slice, no unsandboxed fallback exists, and raw script text is represented by hashes rather than persisted/exposed by lineage.
- Evidence: targeted script-derive/Pi tests passed, full `npm run test:router` passed 264/264 tests, `git diff --check && git diff --cached --check` passed, and focused confirmation review passed with no blocking findings.

## Slice 16: Sandbox Adapter Selection And Proofs

Purpose: implement or select real sandbox adapters before script execution is enabled.

Steps:

1. Identify viable sandbox mechanisms for target platforms.
2. Implement a sandbox adapter interface:
   - language support,
   - capability probe,
   - execute mounted inputs,
   - enforce limits,
   - collect output,
   - cleanup.
3. Implement adapters for JavaScript, Python, and jq/equivalent only when the adapter can prove the required isolation.
4. Keep a language unavailable in status until its adapter proof passes; adapter availability alone must not enable execution while `scriptDerive.enabled` is false.
5. Add adversarial tests for each adapter:
   - env access,
   - home access,
   - repo root access,
   - direct vault path access,
   - network access,
   - symlink output escape,
   - stdout/stderr flood,
   - timeout/infinite loop.
6. If an adapter cannot prove isolation, keep that language unavailable and report it through status.

Tests/checks:

- adapter capability probes work,
- isolation tests pass for any enabled language,
- unsupported language returns structured unavailable,
- no unsandboxed fallback exists.

Stop if:

- no available sandbox can enforce the contract for a target language. Do not weaken the sandbox; report unavailable and ask before changing the security model.

Slice 16 decision after implementation:

- Added a router-level script sandbox adapter/probe seam with contract version, required adversarial proofs, language status, registered-adapter reporting, candidate mechanism reporting, and execution request/result types.
- Rejected unsafe mechanisms in status/source truth: Node `vm` or plain Node subprocess, plain Python subprocess, and plain jq subprocess are not sufficient without OS/container isolation.
- `freeflow_status` now reports proof-backed script sandbox availability, required proofs, rejected/candidate mechanisms, configured languages, and unavailable language reasons.
- Adapter probing is order-independent: every matching adapter is probed until one passes all required proofs; if none passes, the language remains unavailable with failure evidence.
- No real sandbox adapter is registered, no script code executes, and no unsandboxed fallback exists. Local checks found Docker daemon unavailable; macOS `sandbox-exec` can launch with an allow-all profile but no restrictive adapter/proof suite has been approved.
- Focused sandbox adapter spike now proves JavaScript (`quickjs-wasi`) and jq (`jq-wasm`) candidates against the contract, while Python remains unavailable. Slice 17 remains blocked until owner dependency/security decisions approve which optional adapter packages and residual risks may enter product implementation.
- Evidence: targeted sandbox/derive/Pi tests passed, full `npm run test:router` passed 269/269 tests, `git diff --check && git diff --cached --check` passed, and focused confirmation review passed with no findings after the adapter-order fix.

## Slice 17: Script Derive Execution Engine

Status: partial JavaScript implementation in progress. QuickJS JavaScript execution is implemented only for explicitly registered/provided adapter roots and remains disabled by default. Python remains unavailable. jq remains proof-backed but not product-enabled pending separate security review of the Worker-boundary large-output caveat.

Purpose: execute sandboxed scripts over vault sources and route output.

Steps:

1. Reject/return structured disabled output when `scriptDerive.enabled` is false.
2. Verify the requested language is allowed, available, and backed by a passing sandbox adapter proof.
3. Mount copied vault source inputs by alias into sandbox input directory.
4. Create input manifest with aliases, output ids, streams, byte counts, and hashes.
5. Execute script through sandbox adapter.
6. Capture stdout/result file/stderr according to design.
7. Enforce output caps before routing.
8. Store script-derived output as a new evidence record when policy allows.
9. Preserve lineage to source records/output ids and operation hash.
10. Route script output through existing reducer/evidence path.
11. Index script-derived output when persisted.

Tests/checks:

- disabled script derive does not execute and returns structured disabled output,
- successful JavaScript/Python/jq script derives bounded output only when enabled and adapters are available,
- multi-source script derives joined output,
- timeout/cap/nonzero exit failures are structured,
- lineage and operation hash are present,
- source recovery still works,
- script-derived output recovery works when exact.

Stop if:

- script stderr/stdout can bypass router caps,
- script execution can read outside mounted inputs.

Slice 17 partial progress:

- Added dependency-free QuickJS adapter support. No `package.json` dependency was added.
- Pi discovers QuickJS only through the explicit `FREEFLOW_QUICKJS_WASI_ROOT` package-root environment variable.
- `freeflow_derive operation.kind="script"` still returns disabled by default unless `scriptDerive.enabled=true` is configured.
- With a registered/provided QuickJS adapter, JavaScript scripts can read copied vault-source input through `readText(alias)` and write bounded stdout/stderr through `writeText`, `console.log`, and `console.error`.
- Raw script code is still represented by `codeSha256` only.
- Python execution remains unavailable. jq execution remains unimplemented in product code.
- Evidence: `plugins/freeflow/evals/reports/runtime/quickjs-script-derive-execution-1-report.md`.

## Slice 18: Final Docs, Evals, Benchmarks, And Cleanup

Purpose: close the full Pi implementation with evidence, not claims.

Steps:

1. Run all targeted unit tests and Pi integration smokes.
2. Run Pi observed routing evals and benchmark reports.
3. Run vault index evals.
4. Run script derive config/status, disabled-by-default, and adversarial evals.
5. Update output-router/setup skills and plugin docs to match implemented behavior.
6. Update eval README with current report paths.
7. Ensure docs say Claude/Codex adapters are deferred if mentioned at all.
8. Run implementation review and artifact review for changed docs/specs/plans if behavior diverged.
9. Create a handoff if any follow-up remains.

Final checks:

- `npm run test:router`
- `npm run build`
- `node --check plugins/freeflow/pi-extension/dist/index.js`
- `git diff --check && git diff --cached --check`
- Pi observed routing eval report passes,
- vault index eval report passes,
- script derive adversarial eval report passes,
- docs and skills no longer mention removed public `freeflow_capture` as available.

Stop if:

- benchmark/eval evidence does not support the public claims,
- host support is partial and docs imply universal behavior,
- security/privacy-sensitive behavior is implemented without source-truth approval.

## Deferred Adapter Notes

Claude and Codex adapters are future work after this plan. Future adapter plans should:

- verify current host docs and wire formats,
- smoke-test whether output can be replaced before model context,
- reuse observed-routing core contracts and reducers,
- avoid changing the core public behavior unless Pi evidence shows the interface is wrong.

Do not implement these adapters opportunistically inside the Pi plan.

## Review Checkpoints

Run focused review after:

- Slice 4 reducer framework,
- Slice 9 Pi observed routing benchmark report,
- Slice 10 `freeflow_capture` removal,
- Slice 11 vault-index engine choice,
- Slice 14 script-derive design reconciliation,
- Slice 16 sandbox adapter proofs,
- final Slice 18 closeout.

Reviewer findings are evidence, not commands. Separate blocking, non-blocking, and question findings before editing.

## Handoff Criteria

If pausing mid-plan, create a handoff that includes:

- completed slice,
- current source-truth decisions,
- changed files,
- tests/evals run and results,
- Pi host capability evidence,
- open source conflicts or owner decisions,
- next slice and stop conditions.
