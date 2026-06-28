# Project Handoff

Date: 2026-06-28

## Purpose

Durable memory for the next Freeflow work after completing the file-processing / Context Mode parity slices, final public-surface cleanup, and final benchmark review.

This handoff is memory, not authority. Future agents must reopen the linked live files and rerun relevant checks before making completion or superiority claims. Live repo evidence, current tests, and current benchmark reports override this handoff if they conflict.

## Stable Context

Freeflow is now flattened so the repo root is the plugin runtime. Public docs are under `plugin-docs/`; internal/project docs are under `docs/`. `pi-extension/` remains the Pi integration surface.

The public Pi tool direction is now:

- `freeflow_run`
- `freeflow_search`
- `freeflow_batch`
- `freeflow_status`

The old public `freeflow_retrieve` and `freeflow_derive` surfaces were removed from source and generated `dist` artifacts. `retrieve` remains an action under `freeflow_search`. Transform/script processing is integrated into:

- `freeflow_search action="transform"`
- `freeflow_run scriptFilter`

There is no separate public transform tool and no `router/src/tools/search-transform.ts` facade. Shared transform implementation lives in `router/src/transform/engine.ts` because both `run` and `search` need it.

Reports under `evals/reports/` are Markdown-only. Machine-readable JSON belongs under ignored/generated run locations such as `evals/runs/output-router/`, not under committed reports.

## Decisions Made

- Keep reducers deterministic/fact-based, not model-assisted.
- Keep `details.result` structured JSON; compact model-visible text is separate.
- Keep unsafe/YOLO processing local-only through `.freeflow/local.json`; shared `.freeflow/config.json` must not enable it.
- Keep `scriptDerive` as the existing config key for script execution settings, but public/user-facing wording should say script transform where possible.
- Keep `router/src/routing/` and `router/src/processing/` separate:
  - `routing/` owns capture, route selection, exact recovery, persistence, parser/reducer safety, observed routing, and policy.
  - `processing/` owns source loading, deterministic reducers, script execution policy, fact rendering, lineage, and processed-result recovery.
  - `transform/engine.ts` is shared by `freeflow_search action=transform` and `freeflow_run scriptFilter`.
- Public `freeflow_batch` step kinds are `run` and `search` only. Transform is reached through `freeflow_search`, not a standalone batch step kind.
- Do not claim Freeflow is globally better than Context Mode. The final evidence supports a narrower claim: Freeflow now achieves Context Mode-class savings for routed command/output processing and beats Context Mode on covered reducers and batch context size, while Context Mode still wins indexed repo/docs search compactness and latency.

## Completed Work And Evidence

Recent commits:

- `f1eb387 feat: expose search public surface`
  - Removed public retrieve/derive tool modules.
  - Added/renamed `router/src/tools/search.ts`.
  - Folded transform public behavior into search/run paths.
  - Removed stale generated old-tool dist artifacts.
  - Updated Pi schemas/renderers/docs/tests.
- `b18a1fd test: record final context mode benchmark`
  - Added final real Context Mode benchmark Markdown report and review.
  - Updated release evidence with measured final result.
  - Refreshed related benchmark reports.
- `bad7f23 test: keep runtime reports markdown-only`
  - Removed committed JSON reports from `evals/reports/runtime/`.
  - Updated benchmark default JSON output to `evals/runs/output-router/`.
  - Added test coverage that committed runtime reports stay Markdown-only.

Final benchmark evidence:

- `evals/reports/runtime/context-mode-real-deep-final-slice-11-report.md`
- `evals/reports/runtime/context-mode-real-deep-final-slice-11-review.md`
- Baseline comparison source: `evals/reports/runtime/context-mode-real-deep-baseline-1-report.md`

Final benchmark headline:

- Baseline Freeflow aggregate: 17/28 correct, 76/92 facts, 180,434 visible bytes, 76.28% weighted reduction.
- Final Freeflow aggregate: 35/36 correct, 124/124 facts, 42,423 visible bytes, 95.76% weighted reduction.
- Final comparable Context Mode rows: 16/16 correct, 53/53 facts, 27,820 visible bytes, 92.58% weighted reduction.
- Freeflow processing reducers: 8/8 correct, 32/32 facts, 2,960 visible bytes, 98.76% reduction.
- Freeflow batch: 1/1 correct, 3/3 facts, 5,408 visible bytes, 90.75% reduction.
- Context Mode search: 5/5 correct, 13/13 facts, 6,714 visible bytes, 62.23% reduction, ~1.2ms avg.
- Freeflow search: 5/5 correct, 13/13 facts, 12,480 visible bytes, 29.79% reduction, ~22ms avg.

Verification run after final cleanup:

- `npm run build:router` passed.
- `npm run test:router` passed: 0 failed / 374 passed / 375 total.
- `npm run bench:router:context-mode-real-deep` passed with real Context Mode available.
- `npm run bench:router:context-mode-normalized` passed.
- `npm run bench:router:storage-policy` passed.
- `npm run bench:router:index` passed.
- `git diff --check && git diff --cached --check` passed.

Observed routing / web / MCP evidence exists separately:

- `evals/reports/runtime/pi-observed-routing-eval-1-report.md`
- Pi observed routing covered configured MCP, web, fetch, and code-search producer output after direct host execution.
- That eval passed 28/28 objective gates and measured 82.2% overall byte reduction excluding status-only fixtures.
- Fixture reductions included MCP GitHub search 86.0%, MCP Gmail metadata-only 93.1%, web search 32.4%, fetch content 67.6%, and code search 82.9%.
- The final Context Mode deep benchmark did not include web/MCP observed-routing comparison.

## Remaining Gaps

1. Repo/docs search is correct but too verbose and slower than Context Mode indexed search.
   - Freeflow search final: 5/5 correct, 13/13 facts, 12,480 visible bytes, 29.79% reduction, ~22ms avg.
   - Context Mode search final: 5/5 correct, 13/13 facts, 6,714 visible bytes, 62.23% reduction, ~1.2ms avg.
   - Main opportunity: compact search evidence rendering and/or optional indexed backend.

2. Tiny output overhead is poor.
   - Tiny raw outputs (for example 20 bytes) become hundreds of model-visible bytes because recovery/status rows dominate.
   - Opportunity: a tiny-success compact renderer that preserves exactness policy without overwhelming the payload.

3. `freeflow_run` is not a sandbox.
   - The outside-file-boundary row remains an expected visible limitation.
   - Context Mode blocks project escape; `freeflow_run` captures host shell output.
   - Do not present `freeflow_run` as equivalent to Context Mode project-boundary file processing.

4. Reducer coverage is finite.
   - Covered reducer shapes are strong, but unknown data still depends on generic routing, script filters, or search.
   - New reducers should be added only when facts are deterministic and fixture assertions are strong.

5. Public-path benchmark coverage should improve.
   - Some reducer benchmark rows still directly measure internal processing-engine paths.
   - Next benchmark should exercise actual public paths: `freeflow_search action=transform`, `freeflow_run scriptFilter`, and Pi compact renderer output.

6. Web/MCP observed routing has targeted evidence but is not in the final Context Mode comparison.
   - Opportunity: add a benchmark slice comparing observed MCP/web/fetch/code-search routing against raw host output and, if appropriate, Context Mode-like handling.

7. Context Mode still wins persistent indexed memory/search.
   - Freeflow intentionally avoided default persistent indexing.
   - To close this gap, focus on an optional conservative index/search backend rather than more command-output reducers.

## Next Focus

Recommended order:

1. Compact `freeflow_search` output.
   - Reduce visible bytes for correct repo/docs search without losing fact evidence or recovery hints.
   - Preserve exact/expand behavior in structured details.
   - Add benchmark rows that compare Freeflow search against Context Mode indexed search.

2. Tiny-output renderer.
   - Special-case small successful outputs so model-visible text does not exceed raw by thousands of percent.
   - Preserve clear metadata-only vs exact-recovery semantics.

3. Public-path benchmark pass.
   - Rework final deep benchmark rows so public Pi/API paths are measured directly where possible.
   - Include `freeflow_search action=transform` and `freeflow_run scriptFilter`.

4. Optional search index design.
   - Revisit `output-router-index-benchmark-1-report.md` and related experimental index code.
   - Keep scanner default unless explicitly approved.
   - If adopting, make it optional, conservative, and recoverability-preserving.

5. Observed routing benchmark expansion.
   - Extend `pi-observed-routing-eval` or add a new report that explicitly covers web/MCP/fetch/code-search reductions in the current public surface.
   - Keep direct host execution/permissions owned by Pi.

6. Additional reducer families only after search/tiny-output gaps are addressed.
   - Candidate areas: package audit/security output, dependency trees, CI logs, cloud resource listings, browser/accessibility snapshots beyond current fixture shapes.

## Live Evidence To Reopen

Before consequential work, inspect:

- `evals/reports/runtime/context-mode-real-deep-final-slice-11-review.md`
- `evals/reports/runtime/context-mode-real-deep-final-slice-11-report.md`
- `evals/reports/runtime/pi-observed-routing-eval-1-report.md`
- `plugin-docs/release-evidence.md`
- `plugin-docs/output-router.md`
- `skills/output-router/SKILL.md`
- `router/src/tools/search.ts`
- `router/src/tools/run.ts`
- `router/src/tools/batch.ts`
- `router/src/processing/`
- `router/src/routing/`
- `router/src/transform/engine.ts`
- `router/src/benchmarks/context-mode-real-deep-benchmark.ts`
- `router/tests/benchmarks/context-mode-real-deep-benchmark.test.js`

Useful commands:

```sh
npm run build:router
npm run test:router
npm run bench:router:context-mode-real-deep
npm run bench:router:context-mode-normalized
npm run bench:router:storage-policy
npm run bench:router:index
git diff --check && git diff --cached --check
```

## Stop Conditions

Stop and ask before:

- Making public superiority claims over Context Mode.
- Enabling persistent indexing by default.
- Treating `freeflow_run` as a sandboxed project-boundary file processor.
- Changing public API/tool names or config keys.
- Moving JSON artifacts back under `evals/reports/`.
- Enabling unsafe/YOLO processing in shared repo config.
- Adding model-assisted reducers or nondeterministic summarization.
- Changing observed-routing persistence defaults for sensitive MCP/web/fetch/code-search producers.

## Superseded Or Deferred Work

- Old public `freeflow_retrieve` / `freeflow_derive` compatibility surface is removed; do not resurrect it without an explicit migration decision.
- `router/src/tools/search-transform.ts` facade should remain absent.
- JSON report artifacts under `evals/reports/` are intentionally removed.
- The final benchmark does not settle whether Freeflow should adopt an index; it shows why search remains the largest gap.
- Web/MCP capture reduction is proven by targeted eval, but not yet part of the final Context Mode comparison.
