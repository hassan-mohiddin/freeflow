> **Doc ID:** PLAN-2026-06-26-freeflow-file-processing-context-mode-parity
> **Date:** 2026-06-26
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft — ready through benchmark/reducer-routing slices; public surface and YOLO remain gated decisions
> **Source:** `docs/specs/freeflow-file-processing-and-context-mode-parity-spec.md`

# Freeflow File Processing and Context Mode Parity Implementation Plan

## Goal

Turn the real Context Mode comparison into a repeatable Freeflow improvement loop, then implement the smallest safe vertical slices that improve benchmark correctness and context savings:

```text
benchmark baseline
-> file/output processing engine
-> built-in reducers
-> reducer-aware `freeflow_run` routing
-> safe script-first processing
-> fact-first rendering
-> batch query aggregation
-> reviewed public/local YOLO policy
```

This plan intentionally does not make YOLO unsandboxed execution the repo default. It plans an explicit local opt-in path only after sandboxed/default behavior is working and reviewed.

## Source Authority

Primary spec:

- `docs/specs/freeflow-file-processing-and-context-mode-parity-spec.md`

Related source context:

- `docs/specs/freeflow-context-saving-native-tools-redesign-spec.md`
- `router/src/tools/run.ts`
- `router/src/transform/engine.ts`
- `router/src/tools/batch.ts`
- `router/src/tools/retrieve.ts`
- Context Mode local benchmark artifacts from `/tmp/freeflow-context-mode-deep-1782477250990/`

## Working Assumptions

- Freeflow remains a context-saving and recoverable-evidence layer, not a Serena/codebase-memory replacement.
- Script/file transforms should become the preferred route for data understanding.
- Sandboxed/read-only programmable processing is the safe default when a proven adapter exists.
- Built-in reducers must cover useful cases even when script adapters are unavailable.
- Unsafe YOLO mode is explicit local opt-in only, not repo default, not minimal setup, and not a sandbox fallback.
- Persistent FTS/indexing is not adopted by default in this plan.
- Context Mode code may inform design patterns, but do not copy Elastic-2.0 source without a licensing decision.

## Likely Files and Modules

Benchmark/evals:

- `evals/reports/runtime/`
- `evals/runs/output-router/`
- `router/src/benchmarks/`
- `router/tests/benchmarks/`
- `package.json`

Router/runtime:

- `router/src/transform/engine.ts`
- `router/src/tools/run.ts`
- `router/src/tools/retrieve.ts`
- `router/src/tools/batch.ts`
- new processing/reducer modules under `router/src/processing/`
- `router/src/config/types.ts`
- `router/src/config/schema.ts`
- `router/src/config/config.ts`

Pi extension/rendering:

- `pi-extension/src/router-tools.ts`
- `pi-extension/src/renderers.ts`
- `pi-extension/src/schemas.ts`
- `pi-extension/src/status.ts`

Docs/skills:

- `the repo root/plugin-docs/output-router.md`
- `the repo root/plugin-docs/release-evidence.md`
- `skills/output-router/SKILL.md`

Find existing patterns before adding new modules. Prefer deep modules for source loading, reducer selection, and result rendering instead of spreading policy across tools.

## Slice 0: Commit Deep Benchmark Baseline

Purpose: make the current failures durable before changing behavior.

Steps:

1. Move `/tmp/freeflow-context-mode-deep-benchmark.mjs` into a repo eval script/module.
2. Convert it to TypeScript or repo-standard JS consistent with existing router benchmark harnesses.
3. Store current baseline report:
   - Markdown under `evals/reports/runtime/`.
   - Durable JSON under `evals/reports/runtime/`.
   - Generated rerun JSON may still go under ignored `evals/runs/output-router/`.
4. Add npm script, proposed:
   - `bench:router:context-mode-real-deep`
5. Add tests that verify:
   - the benchmark can run in Context Mode unavailable mode without making claims,
   - the report includes correctness, facts, visible bytes, raw bytes, recovery class, and failure clusters,
   - the baseline still catches the current Freeflow failure classes.

Checks:

- `npm run build:router`
- focused benchmark test
- `npm run bench:router:context-mode-real-deep` when Context Mode is installed

Stop if:

- Context Mode dependency would become a required production/runtime dependency.
- The benchmark cannot distinguish real Context Mode from proxy/unavailable mode.
- Fact assertions are too weak to catch known incorrect compact scripts.

Review checkpoint: review the benchmark artifact before using it as acceptance evidence.

## Slice 1: Processing Engine Skeleton and Source Loaders

Purpose: create a deep internal seam for file/output processing without deciding the final public tool name.

Steps:

1. Add an internal processing engine module that owns:
   - source loading,
   - source limits,
   - reducer selection,
   - script/sandbox policy selection,
   - persistence and lineage,
   - fact-first result shape.
2. Add source loaders for:
   - repo file path,
   - vault output id + stream,
   - already captured command output.
3. Add repo file containment checks:
   - block `../` escapes,
   - block symlink escapes,
   - return structured blocked result without reading content.
4. Keep the initial public surface internal or test-only until naming is confirmed.

Checks:

- unit tests for source loading and containment
- unit tests for vault-source loading
- no public Pi schema change yet unless explicitly needed for tests

Stop if:

- source loading would need a public API or config shape not yet approved.
- containment behavior conflicts with existing repo retrieval rules.

Review checkpoint: review the internal interface before wiring it into `freeflow_run` or Pi.

## Slice 2: First Built-In Reducer Family

Purpose: prove Freeflow can improve without scripts or indexing.

Recommended first reducer: access logs, because the benchmark gap is large and correctness facts are clear.

Steps:

1. Add reducer registry and reducer result contract.
2. Implement access-log reducer:
   - request count,
   - status counts,
   - error count/rate,
   - average latency,
   - slow request count and examples.
3. Wire reducer selection for explicit processing-engine calls only.
4. Add fixture tests using Context Mode access log fixture.
5. Add benchmark row that compares baseline vs reducer output.

Checks:

- reducer unit tests
- processing-engine tests
- deep benchmark shows access-log correctness and visible bytes improve

Stop if:

- reducer auto-detection becomes broad enough to hide exact output when `preserve=full` or exactness-sensitive mode is requested.

## Slice 3: Fact-First Renderer

Purpose: remove router prose from model-visible output while keeping structured details intact.

Steps:

1. Add renderer helpers for processed results:
   - facts first,
   - compact source pointer,
   - one-line recovery class,
   - full routing/persistence/parser data only in structured details/TUI.
2. Apply renderer to the new processing path.
3. Do not change all existing `freeflow_run` rendering until the new renderer is proven.
4. Add tests that assert visible output is smaller and still includes required facts.

Checks:

- renderer tests
- Pi renderer tests if surfaced through Pi
- benchmark visible-byte improvement

Stop if:

- fact-first output hides failure evidence needed for diagnosis.
- exact recovery instructions disappear from structured details.

## Slice 4: Script-First Safe Default Path

Purpose: make programmable processing a first-class default when sandbox support is proven.

Steps:

1. Reuse existing script sandbox adapter selection from `transform.ts`.
2. Add processing-engine script execution over loaded sources.
3. If an approved sandbox adapter exists:
   - enable sandboxed script processing by default for explicit processing calls,
   - keep no network/home/env/repo ambient access unless separately approved.
4. If no adapter exists:
   - return structured script-unavailable result,
   - recommend reducer or sandbox setup,
   - do not run host shell fallback.
5. Add tests for:
   - adapter available,
   - adapter unavailable,
   - no unsandboxed fallback,
   - raw script text not persisted by default.

Checks:

- script sandbox tests
- processing-engine script tests
- existing `freeflow_derive` script-disabled tests remain valid or are intentionally updated with config gates

Stop if:

- enabling scripts by default would execute without proof-backed sandbox availability.
- implementation blurs sandboxed and YOLO result metadata.

## Slice 5: Additional Reducers

Purpose: cover the main benchmark gaps without relying on ad hoc scripts.

Implement reducers in small vertical slices, each with fixture tests and benchmark deltas:

1. test output reducer,
2. TypeScript/lint diagnostics reducer,
3. build output reducer,
4. CSV/JSON table reducer,
5. MCP tools/list reducer,
6. browser snapshot reducer,
7. git log reducer.

For each reducer:

- define input detection,
- define fact output,
- define exactness/recovery behavior,
- add fixture tests,
- add benchmark acceptance check.

Checks per reducer:

- focused unit test
- deep benchmark facts improve or stay correct
- no regression to `npm run test:router`

Stop if:

- a reducer guesses domain-specific semantics not present in the input.
- output correctness cannot be asserted from fixture facts.

## Slice 6: Integrate Reducers into `freeflow_run` Routing

Purpose: satisfy spec R5 by making known output shapes compact by default without breaking exactness-sensitive runs.

Steps:

1. Add reducer-routing decision logic for `freeflow_run` that considers:
   - data shape,
   - byte/line count,
   - parser confidence,
   - command goal,
   - explicit reducer hints when present,
   - `preserve=full` and exactness-sensitive goals.
2. Start conservative:
   - explicit reducer hint wins when valid,
   - known goals such as `test`, `build`, `typecheck`, `diagnosis`, `log summary`, and `CSV summary` can select high-confidence reducers,
   - ambiguous small outputs remain near-raw.
3. Route reduced output through the fact-first renderer while keeping raw/derived recovery and parser metadata in structured details.
4. Add tests for every benchmark failure class from default `freeflow_run`:
   - access log no longer returns near-raw,
   - JSON/CSV no longer returns only head/tail rows,
   - MCP tools/list returns signatures/categories,
   - git log returns type/count summary,
   - browser snapshot returns structural facts.
5. Update the deep benchmark so `freeflow:run-cat-default` rows are expected to improve only when a reducer is applicable and exactness policy allows it.

Checks:

- `freeflow_run` reducer-routing unit tests
- parser/reducer interaction tests
- deep benchmark default-run rows improve without weakening fact assertions
- `preserve=full` still returns exact output within caps

Stop if:

- reducer routing hides failure evidence needed for diagnosis.
- exactness-sensitive runs lose exact recovery.
- automatic reducer selection becomes speculative instead of evidence/goal/data-shape driven.

Review checkpoint: review reducer-routing policy before enabling automatic selection broadly.

## Slice 7: Improve Repo/Docs Search Windows

Purpose: make Freeflow docs search retrieve complete code/prose evidence without adopting persistent indexing.

Steps:

1. Improve Markdown section chunking or expansion to include nearby fenced code blocks.
2. Add query-term coverage expansion when terms appear across heading/prose/code.
3. Keep generated path broad-scan skipping intact.
4. Add regression fixtures for:
   - React `ignore = true`,
   - Next.js `generateStaticParams` + `revalidate` + `no-store`,
   - Tailwind `md:`/`lg:`/`grid` classes.
5. Update deep benchmark expected improvements.

Checks:

- retrieval tests
- regression fixture tests
- deep benchmark docs-search rows pass

Stop if:

- improvements require making persistent indexing/FTS the default.
- broad generated decoys start winning again.

## Slice 8: Batch Query Aggregation

Purpose: make `freeflow_batch` answer questions, not only hide child output.

Steps:

1. Add optional `queries` to batch input.
2. After child steps complete, search/transform child outputs using their evidence handles, not their visible summaries.
3. Return compact answer per query.
4. Preserve full child details in `details.result.steps`.
5. Ensure duplicate child outputs can still surface prior important facts when needed for query answers.

Checks:

- batch query unit tests
- Pi schema/rendering tests if public
- deep benchmark batch row passes facts

Stop if:

- query aggregation depends on model summarization instead of deterministic retrieval/transform.
- batch begins supporting dependent/mutating workflows beyond the spec.

## Slice 9: Local YOLO Opt-In Design and Guardrails

Purpose: support local power-user workflow without making unsafe behavior the repo default.

This slice is a design/implementation checkpoint. Do not implement until the config/API shape is explicitly accepted.

Proposed behavior:

- sandboxed remains default,
- YOLO can be enabled by local-only config or environment variable,
- optional per-call policy may be supported if accepted,
- model-visible and structured output must say `unsafe/unsandboxed`,
- no sandbox/read-only/network-off claims in YOLO results,
- repo-shared config cannot enable YOLO without separate owner approval.

Steps after approval:

1. Add config normalization for local YOLO policy.
2. Add status reporting that clearly labels unsafe mode.
3. Add processing-engine branch for unsandboxed execution.
4. Add tests that prove no silent fallback and correct unsafe labels.
5. Add docs warning and local setup guidance.

Checks:

- config tests
- status tests
- processing-engine YOLO tests
- docs review

Stop if:

- implementation would write YOLO into repo default config.
- warning labels are only in docs and not in actual results.
- YOLO execution can be mistaken for sandboxed execution.

## Slice 10: Public Surface Decision and Pi Wiring

Purpose: expose the processing path through the right user-facing tool shape.

Decision required before implementation:

Choose one public surface:

- `freeflow_process_file`,
- `freeflow_run.fileTransform`,
- `freeflow_transform`,
- `freeflow_search action=transform` with file sources.

Recommendation: keep the engine internal through earlier slices, then choose the smallest compatible public surface based on benchmark and Pi schema ergonomics.

After decision:

1. Add/adjust Pi schemas.
2. Add renderers.
3. Update tool docs and `output-router` skill.
4. Keep compatibility for existing `freeflow_run`, `freeflow_retrieve`, and `freeflow_derive`.

Checks:

- Pi extension tests
- schema tests
- docs/skill review

Stop if:

- public naming would break compatibility or force a broad rename before benchmarks pass.

## Slice 11: Final Benchmark, Review, and Docs

Purpose: prove actual improvement.

Steps:

1. Run full router tests.
2. Run deep Context Mode benchmark.
3. Compare against committed baseline.
4. Update durable report with:
   - current Freeflow results,
   - baseline Freeflow results,
   - real Context Mode results when available,
   - remaining gaps.
5. Review spec/plan drift and update docs only where behavior is implemented.

Final checks:

```sh
npm run build:router
npm run test:router
npm run bench:router:context-mode-real-deep
npm run bench:router:context-mode-normalized
npm run bench:router:storage-policy
npm run bench:router:index
git diff --check && git diff --cached --check
```

Stop if:

- benchmark improvements come from weaker fact assertions,
- recovery semantics regress,
- public docs imply superiority over Context Mode without real benchmark support.

## Cross-Slice Stop Conditions

Stop and ask before continuing if:

- a public tool/API/config name must be chosen,
- YOLO repo-shared behavior is requested,
- out-of-project file reads need to be allowed,
- sandbox guarantees cannot be proven,
- implementation would make persistent indexing the default,
- a reducer needs product/domain semantics not present in input evidence,
- source truth conflicts with the spec.

## Review and Verification Expectations

- Review the benchmark baseline before implementing behavior changes.
- Review the processing-engine interface before wiring it into public tools.
- Review YOLO config/API design before implementation.
- Review final benchmark results before public docs claim improvement.
- Do not claim complete until fresh tests and benchmark evidence exist.
