# Output Router Audit Fix Plan

> **Doc ID:** PLAN-2026-07-09-output-router-audit-fix
> **Date:** 2026-07-09
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft
> **Source:** `docs/issues/output-router/2026-07-09-output-router-audit-issues.md`, latest output-router handoff, live router/Pi source, and runtime benchmark reports.

## Goal

Fix the output-router audit findings in small, verifiable slices while preserving Freeflow's core output-router contract:

```text
smallest sufficient evidence in context
+ exact recovery when exactness matters
+ no surprise native tool semantics
```

The plan prioritizes correctness, recovery integrity, and contract clarity before compactness/performance polish.

## Non-Goals

- Do not change public tool names.
- Do not add persistent indexing by default.
- Do not make command-mode `freeflow_run` a sandbox or project-boundary file processor; sandboxed `freeflow_run` script producers remain supported.
- Do not enable unsafe/YOLO processing in shared config.
- Do not add model-assisted summaries/reducers.
- Do not resurrect removed public `freeflow_retrieve`, `freeflow_derive`, or `freeflow_capture` tools.
- Do not move JSON benchmark artifacts back under `evals/reports/`.
- Do not claim Freeflow is globally better than Context Mode.

## Current Preconditions

Before implementation, check the working tree. At the time this plan was written, unrelated WIP existed under delegation and Pi extension files. Do not mix those changes with output-router fixes unless the owner explicitly asks.

Recommended start:

```sh
git status --short
npm run build:router
node --test router/tests/tools/run.test.js router/tests/tools/search.test.js router/tests/vault/vault.test.js router/tests/processing/engine.test.js router/tests/processing/renderers.test.js
```

If targeted tests do not exist yet, create them as failing regression tests in the relevant slice.

## Stop Conditions

Stop and ask before:

- changing public tool names, public config keys, or public batch step kinds;
- deleting, migrating, or invalidating existing user vault data;
- exposing delegation batch operations as public output-router API;
- making persistent indexing default behavior;
- changing storage policy defaults;
- changing script-transform safety policy;
- changing public superiority claims over Context Mode;
- resolving a compatibility tradeoff that would affect existing users' recovery paths.

## Phase 0 — Baseline And Regression Harness

**Purpose:** make the current issues reproducible before fixing them.

### Tasks

1. Record current focused test status.
   - Run targeted router tests if present.
   - Note missing test files that need creation.

2. Add failing regression tests for correctness/recovery issues.
   - `router/tests/tools/run.test.js`: global regex flag adjacent-line case for declarative filters.
   - `router/tests/vault/vault.test.js`: session ID collision isolation.
   - `router/tests/tools/search.test.js`: vault expand outputId/stream mismatch.
   - `router/tests/processing/engine.test.js`: stored processing result persistence includes recovery identifiers.
   - `router/tests/tools/batch.test.js`: mutating internal delegation steps serialize or reject under concurrency, if delegation batch kinds remain in router core.

3. Add validation and public-contract tests.
   - `router/tests/config/schema.test.js`: missing `enabled/profile` fails config validation.
   - `router/tests/config/schema.test.js`: `route="run"` result without `outputId/execution` fails.
   - `pi-extension/tests/pi-extension-search.test.js`: `freeflow_search action=transform` contract coverage starts as either a failing regression for one stable routed contract or a characterization fixture that is explicitly marked to flip during Task 2.2.
   - `pi-extension/tests/pi-extension-search.test.js`: repo/local deterministic `operation` combinations are either supported or rejected by schema/normalization with a clear structured validation error.

4. Add renderer/benchmark guardrails for output issues.
   - `router/tests/processing/renderers.test.js`: normal truncation respects `maxVisibleBytes`.
   - Add or extend renderer/public-path benchmark tests for Pi compact output helpers.

### Acceptance Criteria

- Each P0/P1 issue has at least one failing test or explicit reproduction fixture before implementation.
- Tests are narrow and describe behavior, not internal implementation details.
- No unrelated WIP is modified.

### Verification

```sh
npm run build
node --test router/tests/tools/run.test.js router/tests/tools/search.test.js router/tests/vault/vault.test.js router/tests/processing/engine.test.js router/tests/processing/renderers.test.js router/tests/config/schema.test.js
node --test pi-extension/tests/pi-extension-search.test.js
```

Expected at the start of Phase 0: newly added tests fail until later phases land.

---

## Phase 1 — Correctness And Recovery Integrity

**Purpose:** fix issues that can return wrong evidence, lose exact recovery identity, or blur session boundaries.

### Task 1.1 — Fix `freeflow_run` filter regex global flag behavior

**Issue:** OR-001
**Likely files:**

- `router/src/routing/run-filters.ts`
- `router/tests/tools/run.test.js`
- `pi-extension/src/schemas.ts` if schema wording changes
- `plugin-docs/output-router.md` only if user-facing filter docs mention `g`

**Recommended implementation:** reject `g` for run-output filters.

Why reject rather than reset:

- Filtering is boolean per line; global matching adds no useful line-filter semantics.
- Rejection removes a footgun and keeps implementation simpler.
- Extraction operations can still have their own flag behavior where `g` is internally appropriate.

If compatibility concerns appear, reset `lastIndex` before every `.test()` instead and document why `g` remains accepted.

**Acceptance criteria:**

- Adjacent matching lines are all selected.
- Validation message is clear if `g` is rejected.
- Existing include/exclude/head/tail/maxLines/maxBytes tests still pass.

**Verification:**

```sh
npm run build:router
node --test router/tests/tools/run.test.js
```

### Task 1.2 — Make vault session pathing collision-free

**Issue:** OR-002
**Likely files:**

- `router/src/vault/vault.ts`
- `router/tests/vault/vault.test.js`
- maybe `router/src/vault/vault-index.ts` if index paths include session identity assumptions

**Recommended implementation:** add a single helper for session directory names, e.g. `sessionPathSegment(sessionId)`, based on `sha256(sessionId)` or reversible base64url encoding.

Suggested shape:

```text
sessions/sid_<sha256(sessionId)>/index.json
```

Store the original session ID inside index contents as metadata if useful for debugging/status.

**Compatibility decision:** existing vaults may already have sanitized session directories. Implementation must choose one of:

1. **Backward-compatible read:** read new path first, then legacy sanitized path only when it uniquely corresponds to the requested session ID.
2. **Forward-only:** new writes use collision-free paths, legacy sessions are not automatically readable.
3. **Migration command/status recommendation:** report old paths and ask before moving data.

Do not silently delete or rewrite old session directories.

**Acceptance criteria:**

- `tenant/a` and `tenant_a` cannot read each other's records.
- New writes use collision-free paths.
- Any legacy fallback is explicit and tested.
- `readVaultRecord`, session index, auto-indexing, and vault status still work.

**Verification:**

```sh
npm run build:router
node --test router/tests/vault/vault.test.js router/tests/vault/vault-index.test.js router/tests/tools/search.test.js
```

### Task 1.3 — Validate vault expand evidence identity

**Issue:** OR-007
**Likely files:**

- `router/src/tools/search.ts`
- `router/tests/tools/search.test.js`

**Implementation:** before reading/expanding vault output, validate that the evidence packet belongs to the requested source.

Checks:

- `evidence.source.kind === "vault"`
- `evidence.source.outputId === options.source.outputId`
- requested stream is absent or matches evidence stream/resolved stream
- evidence line range is valid

If mismatch, return structured error with `toolStatus: "error"`, `routing.status: "failed"`, and a clear recovery hint.

**Acceptance criteria:**

- Expanding A evidence against B fails.
- Expanding A evidence against A still works.
- Existing vault expand tests pass.

**Verification:**

```sh
npm run build:router
node --test router/tests/tools/search.test.js
```

### Task 1.4 — Preserve exact persistence identifiers for processing results

**Issue:** OR-008
**Likely files:**

- `router/src/processing/engine.ts`
- `router/tests/processing/engine.test.js`
- maybe `router/tests/vault/vault-index.test.js`

**Implementation:** stop overriding `storeTextOutput` persistence with a partial exact object. Let the vault helper create exact persistence, or route all exact persistence creation through one helper that always includes `outputId` and `recoveryOutputId`.

**Acceptance criteria:**

- `processSource()` result persistence and stored record persistence agree.
- Stored processing result persistence includes `outputId` and `recoveryOutputId`.
- Vault search/retrieve can recover the processing result.

**Verification:**

```sh
npm run build:router
node --test router/tests/processing/engine.test.js router/tests/vault/vault.test.js router/tests/tools/search.test.js
```

### Phase 1 Checkpoint

Run:

```sh
npm run test:router
git diff --check && git diff --cached --check
```

Do not proceed to contract reshaping if P0/P1 recovery tests are still failing.

---

## Phase 2 — Public Contract And Module Ownership

**Purpose:** make public tool contracts coherent and move internal concerns behind clearer seams.

### Task 2.1 — Decide and enforce batch ownership boundary

**Issue:** OR-003
**Likely files:**

- `router/src/config/types.ts`
- `router/src/tools/batch.ts`
- `router/tests/tools/batch.test.js`
- `pi-extension/src/schemas.ts`
- delegation module files, only if delegation batching moves there
- `plugin-docs/output-router.md` if public docs need clarification

**Recommended direction:** keep public output-router `freeflow_batch` to `run`/`search` only. Move `delegate_*` batch operations to delegation-owned code or mark them as internal adapter-only with a separate type/interface.

If internal delegation steps remain temporarily:

- split `PublicBatchStepKind = "run" | "search"` from internal delegation kinds;
- ensure Pi public schema still exposes only public kinds;
- serialize or reject `mutatesHarnessState` steps under `concurrency > 1`;
- include explicit operation metadata in result details for internal callers.

**Acceptance criteria:**

- Public docs/schema/types agree.
- Mutating delegation steps cannot run concurrently.
- Existing public batch run/search tests pass.
- If delegation tests depend on internal batch, they use internal interfaces rather than public output-router docs.

**Stop condition:** ask before exposing delegation operations publicly or removing delegation behavior that current delegation WIP relies on.

### Task 2.2 — Unify `freeflow_search action=transform` result contract

**Issue:** OR-004
**Likely files:**

- `pi-extension/src/router-tools.ts`
- `pi-extension/src/renderers.ts`
- `pi-extension/src/utils.ts`
- `router/src/processing/engine.ts`
- `router/src/transform/engine.ts`
- tests under `router/tests/processing/`, `router/tests/transform/`, and Pi extension tests

**Recommended direction:** keep one public action and normalize both paths to a `TransformRoutedResult`-like shape before returning to Pi users/agents.

Implementation options:

1. Add an adapter function near Pi/router tool normalization, e.g. `processingResultToTransformRoutedResult`.
2. Move that adapter into router core if non-Pi hosts will use it.
3. Eventually retire `implementation: "processing-engine-skeleton-v1"` from public result details after tests and docs are updated.

**Acceptance criteria:**

- `freeflow_search action=transform` result details always include stable routed fields.
- Renderers no longer need a skeleton-specific branch, or the branch is retained only for backward-compatible legacy results.
- Existing transform/reducer/script behavior remains unchanged.

**Stop condition:** ask before removing a result field that downstream users/tools may rely on.

### Task 2.3 — Align transform schema, docs, and runtime behavior

**Issue:** OR-005
**Likely files:**

- `pi-extension/src/schemas.ts`
- `pi-extension/src/router-tools.ts`
- `plugin-docs/output-router.md`
- `skills/output-router/SKILL.md`
- Pi extension tests

**Decision point:** choose whether deterministic `operation` should support explicit repo/local sources now.

Recommended near-term path:

- Make schema/docs explicit: deterministic `operation` currently operates on vaulted output; processing/reducer/script path supports explicit repo/local/vault source without `operation`.
- Add a structured validation failure for unsupported combinations.

Longer-term path:

- Add repo/local source loading into deterministic operation path by first loading explicit sources through a shared source loader, with lineage and exact recovery.

**Acceptance criteria:**

- The chosen behavior is represented in schema/normalization: repo/local deterministic `operation` calls are either supported, or they are not advertised as schema-valid.
- Unsupported combinations fail with clear validation messages and tests.
- Docs and skill wording match runtime.

### Task 2.4 — Harden validators to match TypeScript contracts

**Issue:** OR-006
**Likely files:**

- `router/src/config/schema.ts`
- `router/tests/config/schema.test.js`

**Implementation:** make validation route-discriminated and config-complete after normalization.

Minimum checks:

- Router config requires `enabled`, `profile`, `postToolRouting`, `storagePolicy`, `thresholds`, and `vault`.
- Run results require `outputId` and `execution`.
- Batch results require `stepCount`, `okCount`, `failedCount`, `steps`, and `concurrency`.
- Transform results require appropriate transform/persistence fields depending on success/failure.
- Retrieval results require evidence array and recovery/source shape according to action where practical.

**Acceptance criteria:**

- Invalid examples from OR-006 fail.
- Valid fixture results still pass.
- Tests cover at least one valid and invalid result per route kind.

### Task 2.5 — Reduce runtime import coupling

**Issues:** OR-014, OR-015
**Likely files:**

- `router/src/index.ts`
- possibly new `router/src/runtime.ts`
- `pi-extension/src/*.ts`
- `pi-extension/src/router-tools.ts`
- `pi-extension/src/renderers.ts`

**Implementation:**

- Add a runtime-only barrel or switch Pi imports to compiled subpaths that exclude benchmark modules.
- Wire `renderFreeflowTransformCall` for `args.action === "transform"`, or delete it.

**Acceptance criteria:**

- Pi runtime no longer imports benchmark modules via the broad barrel.
- Transform calls show operation/source information in TUI, or no unused transform call renderer remains.
- `npm run build` passes.

### Phase 2 Checkpoint

Run:

```sh
npm run build
npm run test:router
npm run test:pi-extension
node --test router/tests/config/schema.test.js router/tests/tools/batch.test.js
```

Update docs only after live behavior is verified.

---

## Phase 3 — Performance Guardrails And Scale Evidence

**Purpose:** prevent broad searches and vault-wide retrieval from becoming slow or memory-heavy as usage grows.

### Task 3.1 — Add repo broad traversal budgets

**Issue:** OR-009
**Likely files:**

- `router/src/repo/repo-traversal.ts`
- `router/src/tools/search.ts`
- `router/tests/repo/repo-traversal.test.js`
- `router/tests/tools/search.test.js`

**Implementation:** mirror local broad-scan budgets for repo traversal:

- max directories
- max files
- max total bytes

Keep explicit path traversal/retrieval outside broad-scan budget where safe, but keep per-file caps.

When budget is exceeded, return a routed error through `freeflow_search` that tells the agent to narrow `source.path` or query.

**Acceptance criteria:**

- Synthetic large repo fails boundedly with a clear message.
- Normal repo fixtures still pass.
- Explicit path retrieval remains available.

### Task 3.2 — Extend vault-index scale benchmark

**Issue:** OR-010
**Likely files:**

- `router/src/benchmarks/vault-index-benchmarks.ts`
- `router/tests/benchmarks/vault-index-benchmarks.test.js`
- `evals/reports/runtime/vault-index-storage-spike-1-report.md` or a new report after benchmark run

**Implementation:** add scale rows for at least:

- 1k chunks
- 10k chunks, if locally tolerable
- query topK latency
- write/update latency
- memory/RSS if stable enough

Do not optimize until benchmark evidence exists.

**Acceptance criteria:**

- Benchmark writes machine-readable JSON under ignored `evals/runs/output-router/`.
- Markdown report records scale numbers and caveats.
- Benchmark is deterministic enough for local regression review.

### Task 3.3 — Optimize measured vault-index bottlenecks

**Issue:** OR-010
**Likely files:**

- `router/src/vault/vault-index.ts`
- vault-index tests/benchmarks

**Implementation candidates:**

- Replace full sort with bounded topK heap for query.
- Avoid pretty JSON if write size is a measured bottleneck.
- Consider append-only or sharded sidecar only if benchmark shows heap/sort changes are insufficient.

**Stop condition:** ask before adopting SQLite or a new persistent backend.

### Phase 3 Checkpoint

Run:

```sh
npm run build:router
node --test router/tests/repo/repo-traversal.test.js router/tests/tools/search.test.js router/tests/vault/vault-index.test.js router/tests/benchmarks/vault-index-benchmarks.test.js
npm run bench:router:vault-index
```

---

## Phase 4 — Model-Visible Output And Public-Path Benchmarks

**Purpose:** close the current handoff's main UX gap after correctness and contract fixes land.

### Task 4.1 — Make processing renderer byte caps real

**Issue:** OR-011
**Likely files:**

- `router/src/processing/renderers.ts`
- `router/tests/processing/renderers.test.js`

**Implementation:** subtract truncation marker bytes before slicing in normal truncation. Preserve explicit unsafe-policy prefix behavior only if intentionally allowed, and test it separately.

**Acceptance criteria:**

- Normal output byte length is `<= maxVisibleBytes`.
- Unsafe prefix behavior is explicit and documented by test.

### Task 4.2 — Add tiny-success compact output path

**Issue:** OR-012
**Likely files:**

- `pi-extension/src/utils.ts`
- `pi-extension/src/renderers.ts`
- `router/src/tools/run.ts` only if result metadata needs a clearer tiny-output signal
- benchmark/tests under router/pi extension

**Implementation:** compact small successful command results into a one- or two-row visible format that still preserves:

- execution status and exit code;
- exact vs metadata-only recoverability;
- output ID or rerun guidance;
- parser/storage policy when needed.

Do not claim exact raw recovery for metadata-only records.

**Acceptance criteria:**

- Tiny metadata-only success and tiny preserve-full success are materially smaller than current 370-545B baselines.
- Exact/metadata-only semantics remain visible.
- `details.result` still carries full structured data.

### Task 4.3 — Compact `freeflow_search` visible output

**Issue:** OR-012
**Likely files:**

- `pi-extension/src/utils.ts`
- `pi-extension/src/renderers.ts`
- `router/src/tools/search.ts` only if result metadata needs compact labels
- `router/src/benchmarks/context-mode-real-deep-benchmark.ts`
- renderer/benchmark tests

**Implementation:** reduce repeated recovery/routing prose in model-visible text while preserving:

- source/path/output ID;
- line range;
- excerpt;
- evidence count;
- exact recovery row;
- failure/no-match guidance.

Keep detailed `why` and route explanation in `details.result`, not necessarily in compact text.

**Acceptance criteria:**

- Repo/docs search rows remain correct in facts.
- Visible bytes improve against the latest Freeflow search baseline.
- Recovery instructions remain sufficient to retrieve exact lines.

### Task 4.4 — Add public-path model-visible benchmarks

**Issue:** OR-013
**Likely files:**

- `router/src/benchmarks/context-mode-real-deep-benchmark.ts` or a new public-path benchmark file
- `router/tests/benchmarks/*`
- `evals/reports/runtime/*`

**Implementation:** benchmark the actual Pi compact text helpers (`compactSearchToolText`, `compactRunToolText`, `compactBatchToolText`) or a shared renderer function used by Pi.

Rows should cover:

- repo query;
- vault query/retrieve;
- run success/failure;
- tiny success metadata-only;
- tiny success exact;
- transform/reducer;
- batch query aggregation.

**Acceptance criteria:**

- Benchmark reflects what agents see in Pi tool content, not only custom benchmark text extraction.
- Markdown report records before/after for search and tiny-output rows.

### Phase 4 Checkpoint

Run:

```sh
npm run build
npm run test:router
npm run test:pi-extension
npm run bench:router:context-mode-real-deep
npm run bench:router:context-mode-normalized
```

Update `plugin-docs/release-evidence.md` only if the benchmark evidence is refreshed and reviewed.

---

## Phase 5 — Documentation, Skill Wording, And Release Evidence

**Purpose:** align user-facing docs and skills with verified behavior.

### Tasks

1. Update public docs only for behavior that actually changed.
   - `plugin-docs/output-router.md`
   - `plugin-docs/release-evidence.md`, if benchmark evidence changes

2. Update skill wording only if tool-choice guidance changed.
   - `skills/output-router/SKILL.md`

3. Add or update runtime reports.
   - Markdown reports under `evals/reports/runtime/`.
   - Generated JSON stays under ignored run paths such as `evals/runs/output-router/`.

4. Record any durable compatibility decision as an ADR only if it is hard to reverse.
   - Vault session path migration/backcompat may merit ADR if user-impacting.
   - Public batch/delegation API boundary may merit ADR if intentionally exposed.

### Acceptance Criteria

- Docs do not claim more than benchmarks prove.
- Skill guidance matches actual public tools and schemas.
- No stale standalone `freeflow_retrieve`, `freeflow_derive`, or `freeflow_capture` public tools are reintroduced.
- Release evidence distinguishes Freeflow strengths from Context Mode strengths.

### Verification

```sh
npm run build
npm run test:router
npm run test:pi-extension
npm run bench:router:context-mode-real-deep
npm run bench:router:context-mode-normalized
npm run bench:router:vault-index
git diff --check && git diff --cached --check
```

---

## Suggested Slice Boundaries

To keep reviews small, land the work as separate changes:

1. **Regex filter + vault expand + processing persistence tests/fixes**
   - Smallest correctness bundle.

2. **Vault session collision fix**
   - Separate because compatibility/migration risk is higher.

3. **Batch/delegation contract cleanup**
   - Separate because it may interact with delegation WIP.

4. **Transform/schema/validator contract cleanup**
   - Public interface consistency bundle.

5. **Repo traversal budgets + vault-index scale benchmark**
   - Performance guardrails.

6. **Renderer cap + tiny/search compact output + public-path benchmarks**
   - UX/benchmark bundle.

7. **Docs/skill/release-evidence refresh**
   - Only after verified behavior lands.

## Open Questions For Implementation

1. Vault session compatibility: should existing sanitized session directories be read, migrated, or left as legacy-only?
2. Batch/delegation ownership: should delegation batch operations move entirely out of router core, or remain as internal-only adapter operations?
3. Transform operation scope: should deterministic operations support repo/local sources now, or should schema/docs narrow to vault-only for operation mode?
4. Renderer benchmark source: should Pi compact text helpers move into router core so benchmarks can import them without Pi-extension coupling?
5. Repo traversal budgets: should budgets be fixed constants initially, or configurable through `outputRouter.thresholds` later?

Ask the owner before choosing an option that changes public behavior or user data compatibility.
