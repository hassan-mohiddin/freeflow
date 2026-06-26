> **Doc ID:** PLAN-2026-06-25-freeflow-context-saving-native-tools-redesign
> **Date:** 2026-06-25
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft — ready for baseline and early slices; later public-surface migration gated by benchmarks
> **Source:** `docs/specs/freeflow-context-saving-native-tools-redesign-spec.md`

# Freeflow Context-Saving Native Tools Redesign Implementation Plan

## Goal

Implement the Freeflow-owned tool redesign from `docs/specs/freeflow-context-saving-native-tools-redesign-spec.md` without broad public rename churn until performance is proven.

Target product shape:

```text
freeflow_run    = create and capture new output
freeflow_search = find, get, expand, or transform existing repo/vault data
freeflow_batch  = run independent Freeflow operations in one model-visible call
```

Working implementation shape during early slices:

- keep current public tools where useful: `freeflow_run`, `freeflow_retrieve`, `freeflow_derive`,
- add internals that match the new model,
- preserve existing exact repo/vault path/range recovery,
- preserve existing command/native/observed/derived vault record support,
- do final naming/docs/skills migration only after benchmarks justify it.

## Source Authority

Primary spec:

- `docs/specs/freeflow-context-saving-native-tools-redesign-spec.md`

Current source-truth docs to preserve:

- `plugins/freeflow/docs/output-router.md`
- `plugins/freeflow/docs/release-evidence.md`
- `docs/specs/freeflow-observed-output-routing-vault-index-and-script-derive-design.md`
- `docs/specs/freeflow-output-router-excellence-spec.md`

Current implementation areas:

- `plugins/freeflow/router/src/run.ts`
- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/derive.ts`
- `plugins/freeflow/router/src/parsers.ts`
- `plugins/freeflow/router/src/evidence.ts`
- `plugins/freeflow/router/src/vault.ts`
- `plugins/freeflow/router/src/vault-index/`
- `plugins/freeflow/pi-extension/src/router-tools.ts`
- `plugins/freeflow/pi-extension/src/schemas.ts`
- `plugins/freeflow/pi-extension/src/renderers.ts`
- `plugins/freeflow/router/tests/`
- `plugins/freeflow/evals/scripts/`
- `plugins/freeflow/evals/reports/runtime/`

## Non-Goals

Do not implement in this plan:

- semantic code search,
- LSP/symbol/reference/call-graph intelligence,
- Serena/codebase-memory replacement,
- external MCP/web observed-routing redesign,
- universal external-tool batch orchestration,
- mutating batch workflows,
- implicit unsandboxed/yolo script fallback,
- yolo script execution before a separate owner-approved safety/product slice,
- broad docs/skills rename migration before benchmark evidence.

## Baseline And Review Evidence

- Spec artifact review pass 1 found three blockers: vault-scope regression risk, yolo/unsandboxed ambiguity, and exact path/range recovery ambiguity.
- Spec was revised to preserve existing vault kinds, remove yolo from scope, and preserve exact path/outputId + line-range retrieval.
- Spec artifact review pass 2 passed.

Use this plan to implement from the reviewed spec, not from the unreviewed chat transcript.

## Slice 0: Baseline, Fixture Inventory, And Output-Size Measurements

Purpose: record current behavior before shrinking outputs or changing retrieval semantics.

Steps:

1. Run current checks:
   - `npm run test:router`
   - `node --check plugins/freeflow/pi-extension/dist/index.js`
   - `git diff --check && git diff --cached --check`
2. Capture current model-visible output sizes for representative `freeflow_run`, `freeflow_retrieve`, and `freeflow_derive` results.
3. Identify existing fixtures/tests that must remain stable:
   - exact repo path/range retrieval,
   - exact vault line retrieval,
   - vault-wide query/locate,
   - derive deterministic operations,
   - script derive disabled/unavailable behavior,
   - Pi renderer behavior.
4. Add or update a small benchmark helper that measures:
   - raw bytes processed,
   - model-visible bytes returned,
   - details payload size,
   - exact recovery availability.

Checks:

- Baseline report saved under `plugins/freeflow/evals/reports/runtime/`.
- Existing tests pass before changes.

Stop if:

- baseline tests fail for unrelated reasons,
- measured output paths are unclear enough that later savings cannot be compared.

## Slice 1: Split Model-Visible Text From Details Payload

Purpose: make current tools capable of returning ultra-compact model-visible text while preserving full details for TUI and recovery.

Cross-tool requirement: every Freeflow-owned tool should eventually return compact model-visible text. Pretty-printed structured JSON belongs in `details.result`, TUI expanded views, vault recovery, or explicit raw/detail requests.

Steps:

1. Add a result-rendering boundary in the Pi extension:
   - compact model-visible text,
   - full structured `details.result`,
   - TUI collapsed renderer,
   - TUI expanded renderer.
2. Start with `freeflow_run`, then apply the same boundary to retrieve/search and derive/transform before final public migration.
3. Preserve current structured result in `details.result`.
4. Change `content[0].text` for `freeflow_run` to a compact summary such as:
   - success: `run npm test: pass · 278 passed, 0 failed · raw=ffout_...`
   - failure: `run npm test: fail exit=1 · 3 failed · raw=ffout_...` plus only the minimum key evidence lines.
5. Add tests that assert model-visible text is small while details still contain recovery metadata.

Checks:

- `npm run test:router`
- focused Pi extension renderer tests.
- output-size benchmark shows model-visible shrinkage without loss of details/recovery.

Stop if:

- compact text hides failure evidence needed for completion/diagnosis,
- TUI cannot expose details that were removed from model-visible text.

## Slice 2: TUI Expanded View Redesign For Routed Results

Purpose: make the human-visible TUI compensate for compact model context.

Steps:

1. Redesign expanded renderers for run/retrieve/derive results to show:
   - execution/tool status,
   - summary,
   - key evidence,
   - parser/filter/routing decisions,
   - storage and recovery ids,
   - exact recovery/search hints.
2. Keep collapsed rows terse.
3. Avoid dumping full raw output in TUI by default.
4. Add renderer tests for compact/collapsed and expanded states.

Checks:

- focused renderer tests pass.
- manual or fixture-expanded render captures do not truncate required details.

Stop if:

- details become unavailable to the user after shrinking model-visible output.

## Slice 3: Declarative Filters For `freeflow_run`

Purpose: add deterministic, testable output filtering before custom scripts.

Steps:

1. Design a minimal internal filter schema. Start with low-risk fields:
   - include regex/list,
   - exclude regex/list,
   - head/tail,
   - max lines/bytes,
   - stream selection,
   - parser mode such as failures-only where existing parsers support it.
2. Apply filters after raw capture and before compact rendering.
3. Store raw output according to storage policy; do not lose recovery because a filter is applied.
4. Add tests for:
   - include/exclude,
   - head/tail,
   - failure evidence preservation,
   - invalid filter failures,
   - exact raw recovery after filtering.

Checks:

- `npm run test:router`
- output-size benchmark for filtered command fixtures.

Stop if:

- filter semantics conflict with existing parser output,
- invalid filters can silently drop exact failure/verification evidence.

## Slice 4: Programmable Filter For `freeflow_run`

Purpose: run a sandboxed filter over captured stdout/stderr without rerunning the base command.

Steps:

1. Reuse the existing script-derive sandbox adapter seam as the first step toward a shared programmable-transform module.
2. Mount captured stdout/stderr/combined as read-only script inputs.
3. Keep default script execution disabled unless existing `scriptDerive` config enables an available proof-backed adapter.
4. Preserve no-unsandboxed-fallback behavior.
5. Store derived script output separately with lineage to raw command output.
6. Return compact script result plus raw and derived recovery ids when persisted.
7. Add tests for:
   - command runs exactly once,
   - script sees captured output,
   - script cannot access repo/home/env/network in default mode,
   - timeout/output caps,
   - raw output recovery,
   - derived output recovery.

Checks:

- `npm run test:router`
- targeted script sandbox tests.

Stop if:

- implementation requires unsandboxed fallback,
- script can rerun or mutate the base command path,
- script failure hides the base command execution result.

## Slice 5: `freeflow_search` Internal Action Model

Purpose: evolve `freeflow_retrieve` internals toward the reviewed `freeflow_search` model without public rename churn.

Steps:

1. Introduce an internal action model:
   - `locate`,
   - `query`,
   - `get`,
   - `expand`,
   - `transform`.
2. Map current `freeflow_retrieve` actions into the model:
   - existing `locate` stays locate,
   - existing `query` stays query,
   - existing exact `retrieve` becomes advanced exact range recovery,
   - existing `expand` stays expand,
   - existing `explain` remains compatibility/debug until final migration decision.
3. Add new `get` behavior:
   - input text/code,
   - best exact-ish repo/vault match,
   - path/outputId + line range + content + match type/confidence.
4. Preserve exact path/outputId + line-range retrieval as public advanced behavior.
5. Preserve existing vault-wide query/locate support for command/native/observed/derived records.
6. Do not duplicate script-derive or sandbox execution inside search; future `transform` must call the shared programmable-transform seam.
7. Keep model-visible search/retrieve output compact; full structured result remains in `details.result` and TUI.

Checks:

- existing retrieve tests pass,
- new `get` tests for repo and vault,
- exact line recovery tests pass unchanged.

Stop if:

- `get` ambiguity would break existing exact retrieval semantics,
- observed/derived/native vault records become unsearchable or unrecoverable.

## Slice 6: Fold Derive Into Shared Transform Internals

Purpose: align `freeflow_derive`, `freeflow_search transform`, and `freeflow_run.scriptFilter` around one deep programmable-transform module while preserving compatibility and compact model-visible output.

Steps:

1. Create an internal transform engine used by current `freeflow_derive`, future `freeflow_search transform`, and `freeflow_run.scriptFilter`.
2. Keep callers thin: run adapts captured stdout/stderr/combined; search adapts repo/vault/search-result sources.
3. Keep script execution policy centralized in the transform engine:
   - default `sandboxed`, proof-backed, read-only,
   - future `yolo` as explicit policy only, not a fallback,
   - no yolo implementation in this slice.
4. Move deterministic operations behind that seam:
   - regex filter,
   - count,
   - group,
   - dedupe,
   - topN,
   - JSON extract,
   - URL/citation extract,
   - line/size stats.
5. Preserve current `freeflow_derive` public schema and behavior.
6. Add repo-source transform support only after read-only traversal and exact source attribution are clear.
7. Add tests that prove derive compatibility, run script filtering, and transform semantics share implementation.
8. Keep model-visible derive/transform output compact; full structured result remains in `details.result` and TUI.

Checks:

- deterministic derive tests pass unchanged.
- run script-filter tests pass unchanged.
- new transform tests pass for vault source.
- derive/transform model-visible output is smaller than the structured details payload and does not start with pretty JSON.

Stop if:

- compatibility with existing `freeflow_derive` breaks,
- run script filters fork or duplicate script execution policy,
- transform results lose lineage/recovery metadata.

## Slice 7: `freeflow_batch` V1 For Parallel Freeflow-Owned Operations

Purpose: reduce tool-call overhead by batching independent Freeflow-owned operations.

Steps:

1. Add `freeflow_batch` public Pi tool behind a minimal schema.
2. Support step kinds:
   - `run`,
   - `search`/retrieve-compatible operations,
   - `transform` through existing derive/transform internals.
3. Run independent steps in parallel with bounded concurrency.
4. Capture/store each step result.
5. Suppress intermediate model-visible child output.
6. Return one compact combined model-visible summary.
7. Preserve full child results in `details.result.steps` and TUI expanded view.
8. Add failure policy options only if needed; default should report all completed/failed steps without hiding failures.

Checks:

- batch tests for multiple run steps,
- batch tests for multiple search steps,
- mixed run/search batch,
- one failing step does not hide other step results,
- model-visible batch output is smaller than separate calls.

Stop if:

- batch requires arbitrary external tool orchestration,
- mutating or sequenced workflows creep into v1,
- intermediate outputs leak into model context by default.

## Slice 8: Hybrid Storage Policy Experiment

Purpose: benchmark storage defaults before changing persistence behavior.

Steps:

1. Implement an experimental storage-policy switch in tests/benchmarks, not as default product behavior first:
   - store everything,
   - threshold exact storage,
   - metadata-small/exact-large hybrid,
   - duplicate-output dedupe.
2. Measure:
   - latency,
   - storage size,
   - index size,
   - recovery usefulness,
   - privacy surface approximation,
   - token savings,
   - repeated-output behavior.
3. Record benchmark evidence under runtime reports.
4. Only after evidence, decide whether to change default storage behavior.

Checks:

- storage benchmark report generated.
- exactness-sensitive outputs remain recoverable under any candidate default chosen.

Stop if:

- threshold storage would remove recovery needed for verification/failure diagnosis,
- metadata-only behavior could be confused with exact recovery.

## Slice 8b: Combined Storage Policy Benchmark

Purpose: compare exact storage, metadata-only, duplicate dedupe, and hybrid-dedupe with larger repeated-output and exactness-sensitive fixtures.

Status: done.

Evidence:

- `plugins/freeflow/evals/reports/runtime/storage-policy-benchmark-1-report.md`
- `plugins/freeflow/evals/runs/output-router/storage-policy-benchmark-1-report.json`

Result:

- threshold-only storage was disqualified because it can remove exact recovery for useful failure/verification evidence.
- `hybrid-dedupe` was the strongest safe candidate: exactness-sensitive recovery preserved, exact duplicate outputs represented as metadata pointers, and small low-value successes allowed to become metadata-only.

## Slice 8c: Adopt Hybrid-Dedupe For Command Capture

Purpose: make the benchmark-selected policy the default for `freeflow_run` command capture after owner approval.

Steps:

1. Add `outputRouter.storagePolicy` with supported values:
   - `hybrid-dedupe` (default),
   - `store-everything` (compatibility/diagnostic override).
2. Scope adoption to `freeflow_run` command capture; do not change observed routing or native safety-net persistence policies in this slice.
3. Store exact command output when output is exactness-sensitive:
   - failed, timed out, or cancelled command,
   - `preserve=full`,
   - filtered/script-filtered command,
   - large/noisy output,
   - verification/test/lint/typecheck/build/diagnosis goal or command,
   - specialized parser output that carries diagnostic or structured evidence.
4. Store small non-sensitive successful command output as metadata-only while returning near-raw routed evidence from the live execution.
5. Store exact duplicate command output as metadata-only only when a prior exact duplicate exists; expose prior exact `outputId` as recovery.
6. Ensure metadata-only records never expose `recoveryOutputId` or exact retrieval instructions unless pointing to a prior exact duplicate.
7. Update Pi status/rendering/compact output to label metadata-only records distinctly.
8. Update tests for default behavior and keep `store-everything` opt-in where exact raw readback is under test.

Checks:

- failures/verification/diagnostics stay exact.
- `preserve=full` stays exact.
- large/noisy outputs stay exact.
- low-value small success output becomes metadata-only by default.
- duplicate metadata points to prior exact output.
- metadata-only never claims exact raw recovery.
- focused run/config/schema/Pi/batch tests pass.

Stop if:

- metadata-only output can be retrieved as raw text,
- exactness-sensitive outputs lose exact recovery,
- public recovery text cannot distinguish metadata-only from exact duplicate recovery.

## Slice 9: Repo Search Backend Benchmark

Purpose: decide whether repo indexing should become default.

Steps:

1. Build or reuse benchmark harness for:
   - scanner-only,
   - local lexical index,
   - FTS5/BM25/trigram candidate if available,
   - hybrid scanner + index.
2. Compare accuracy, recall, speed, model-visible output bytes, setup/update cost, and stale-index failure behavior.
3. Include current known hard fixtures such as generated artifact decoys.
4. Record report under runtime reports.
5. Do not make indexing default unless benchmark evidence supports it.

Checks:

- benchmark report generated.
- existing scanner behavior remains available.

Stop if:

- index improves speed but worsens accuracy/recovery,
- index adds unacceptable dependency/setup/staleness risk.

Status: done. Evidence recorded in `plugins/freeflow/evals/reports/runtime/output-router-index-benchmark-1-report.md` and `plugins/freeflow/evals/runs/output-router/output-router-index-benchmark-1-report.json`. Scanner-only, local lexical index, Node `node:sqlite` FTS5/BM25/trigram, and conservative hybrid scanner+index all passed 3/3 fixtures with recall@3 3/3 and zero generated false positives. FTS5/BM25/trigram was tested through the experimental Node runtime available in this environment; no package dependency was added. Scanner remains default; index is not adopted.

## Slice 10: Context Mode Normalized Benchmark

Purpose: prove whether Freeflow is actually better for the target category before public claims.

Steps:

1. Mirror or recreate representative Context Mode fixture classes:
   - command/test/build output,
   - docs/markdown,
   - logs,
   - JSON/CSV-like output,
   - repo text search,
   - batch multi-query/multi-command cases.
2. Compare Freeflow against Context Mode-style expected behavior on:
   - raw bytes processed,
   - model-visible bytes returned,
   - tool-call count,
   - answer accuracy,
   - exact fact preservation,
   - recovery availability,
   - latency,
   - storage overhead.
3. Keep claims scoped to Freeflow-owned tools.
4. Record runtime report.

Checks:

- benchmark report generated.
- no public docs claim superiority unless evidence supports it.

Stop if:

- Freeflow saves fewer tokens without compensating accuracy/recovery benefit,
- benchmark fixtures are not comparable enough for a claim.

Status: done. Evidence recorded in `plugins/freeflow/evals/reports/runtime/context-mode-normalized-benchmark-1-report.md` and `plugins/freeflow/evals/runs/output-router/context-mode-normalized-benchmark-1-report.json`. Freeflow-owned tools and the normalized Context Mode-style proxy both passed 6/6 fixtures. Freeflow preserved exact facts and recovery on 6/6, but answer-accurate visible output was 4/6 and the proxy had lower model-visible bytes on these normalized fixtures. Freeflow reduced tool calls only for the batch fixture. No public superiority claim is allowed from this benchmark.

## Slice 11: Public Surface Migration Decision

Purpose: only after benchmarks, decide whether to expose the final names and docs.

Prerequisite:

- Slices 0-10 complete.
- Benchmarks support the new surface.
- Owner approves the public rename/migration.

Steps:

1. Decide whether to publicly expose:
   - `freeflow_search`,
   - `freeflow_batch`,
   - retained/deprecated `freeflow_retrieve`,
   - retained/deprecated `freeflow_derive`.
2. Update code schemas and Pi registration.
3. Add compatibility aliases or migration warnings if needed.
4. Do one coordinated docs/skills update:
   - output-router skill,
   - setup/freeflow docs,
   - release evidence,
   - command/tool surface docs,
   - eval README.
5. Run artifact review on updated docs if public behavior changed.

Checks:

- public tool registration tests,
- command-surface/metadata validation,
- `npm run test:router`,
- docs drift checks,
- `git diff --check && git diff --cached --check`.

Stop if:

- benchmarks do not justify rename,
- compatibility break needs owner approval,
- docs would imply external observed routing improvements not implemented in this plan.

## Review Checkpoints

Run focused review after:

- Slice 1/2 compact-output + TUI split,
- Slice 4 programmable run filtering,
- Slice 7 batch v1,
- Slice 10 normalized benchmark,
- Slice 11 public migration docs.

Reviewer findings are evidence, not commands. Classify blocking, non-blocking, questions, and needs-evidence before editing from them.

## Final Verification

Before completion claims:

- `npm run test:router`
- `npm run build`
- `node --check plugins/freeflow/pi-extension/dist/index.js`
- `git diff --check && git diff --cached --check`
- compact-output benchmark report passes,
- storage-policy benchmark report recorded,
- repo-index benchmark report recorded,
- Context Mode normalized benchmark report recorded,
- TUI expanded view manually or fixture-verified.

## Stop Conditions

Pause and route back to spec/discovery if:

- implementation would remove existing exact repo/vault line recovery,
- implementation would regress current command/native/observed/derived vault search or recovery,
- programmable filtering requires unsandboxed fallback,
- batch v1 expands into arbitrary external tool orchestration or mutation,
- benchmark evidence contradicts the planned public claims,
- output shrinking hides exact failure/verification evidence needed for a truthful completion claim.

## Handoff Criteria

If pausing mid-plan, create a handoff with:

- completed slice,
- changed files,
- tool surface/status of public compatibility,
- benchmarks/checks run,
- current output-size measurements,
- open owner decisions,
- next slice and stop conditions.
