> **Doc ID:** PLAN-2026-06-18-freeflow-router-internal-deep-modules
> **Date:** 2026-06-18
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready
> **Source:** `docs/specs/freeflow-router-internal-deep-modules-spec.md` reviewed Pass on 2026-06-18

# Freeflow Router Internal Deep Modules Implementation Plan

## Goal

Fix the remaining Output Router review blockers from `docs/handoffs/2026-06-18-output-router-review-and-architecture-next.md` while deepening the internal router modules named in `docs/specs/freeflow-router-internal-deep-modules-spec.md`.

The plan should leave the current product contract stable:

- `freeflow_retrieve` and `freeflow_run` remain the routed tools.
- The scanner remains the retrieval backend.
- Public routed-result schema stays unchanged.
- `experimental-local-index.ts` remains a frozen experiment, not the target architecture.
- Pi/Codex/Claude adapter portability is deferred.

## Source Authority

Primary spec:

- `docs/specs/freeflow-router-internal-deep-modules-spec.md`

Foundational router contracts:

- `docs/specs/freeflow-output-router-design.md`
- `docs/specs/freeflow-output-router-excellence-spec.md`
- `skills/output-router/SKILL.md`
- `skills/output-router/references/safety-policy.md`

Current blocker memory:

- `docs/handoffs/2026-06-18-output-router-review-and-architecture-next.md`

Live implementation areas:

- `router/src/tools/retrieve.ts`
- `router/src/vault/vault.ts`
- `router/src/benchmarks/command-benchmarks.ts`
- `router/src/experiments/local-index.ts`
- `pi-extension/index.js`
- `router/tests/`

## Non-Goals

Do not:

- adopt the experimental index,
- add SQLite, FTS, native dependencies, embeddings, semantic reranking, or model-assisted routing,
- redesign public routed-result schema,
- enable native post-tool routing by default,
- turn this into adapter portability work,
- rewrite Pi TUI rendering unless touched behavior forces it,
- broaden report claims beyond verified evidence,
- commit until review blockers and final verification are complete.

## Working Rules

- Use TDD per slice: add or update failing regression tests first, then implement, then refactor.
- Keep each slice reviewable and runnable on its own.
- Prefer small deep modules with clear invariants over utility extraction.
- Build router dist with `npm run build:router`; tests import compiled output.
- Production router/Pi code should not add `child_process`; test-only child processes are acceptable for cross-process vault validation.
- If live source truth contradicts this plan, stop and ask before editing the source truth.

## Likely Files Touched

Core source:

- new `router/src/repo/repo-traversal.ts`
- new `router/src/line-ranges.ts`
- new `router/src/evidence-range-selector.ts`
- `router/src/tools/retrieve.ts`
- `router/src/vault/vault.ts`
- `router/src/benchmarks/command-benchmarks.ts`
- generated `router/dist/**` after build

Tests:

- `router/tests/retrieve.test.js`
- `router/tests/regression-fixtures.test.js`
- `router/tests/vault.test.js`
- `router/tests/command-benchmarks.test.js`
- new focused tests if a module earns its own file-level test

Reports:

- `evals/reports/runtime/output-router-command-benchmark-1-report.md`
- `evals/reports/runtime/output-router-index-benchmark-1-report.md` only if rerun/meaningfully affected
- `evals/reports/runtime/output-router-codex-large-index-sqlite-adhoc-report.md`
- other runtime reports only if their underlying benchmark is rerun or corrected

Pi adapter:

- `pi-extension/index.js` only if current uncommitted Pi changes remain in scope or final smoke requires documentation.

## Slice 0: Baseline And Dirty-Tree Orientation

Purpose: avoid implementing against stale assumptions in the current uncommitted tree.

Steps:

1. Inspect `git status --short` and confirm no unintended generated review artifacts remain.
2. Reopen the spec and handoff before editing.
3. Run the current baseline checks if practical:
   - `npm run test:router`
   - `npm run bench:router:commands` if command benchmark behavior is being changed next
   - `git diff --check`
4. Record any pre-existing failures separately from new slice failures.

Checks:

- Baseline status is known.
- No claim is made that current work is complete.

Stop if:

- unrelated tests fail in a way that blocks meaningful slice work,
- live repo evidence contradicts the spec decisions.

## Slice 1: RepoTraversalPolicy

Purpose: concentrate repo traversal and generated-path policy behind a deep module while fixing traversal blockers.

Red tests / interface tests:

- Broad traversal skips built-in generated/dependency/media/large decoys.
- Explicit file access can retrieve inside-root text under built-in generated paths.
- Explicit directory access can retrieve inside-root text under configured `outputRouter.generatedPaths` paths.
- `foo/**/*.md` matches direct and nested markdown files under `foo/`.
- `foo/**/*.md` does not match `bar/foo/a.md`.
- `**/foo/**` matches `foo/a.txt`, `bar/foo/a.txt`, and deeper variants.
- `*.md` matches only repo-root markdown files.
- Unsupported glob features match nothing and do not broaden skips.
- Symlink escapes, symlink cycles, and broken symlinks preserve existing safe behavior.

Implementation:

1. Add `router/src/repo/repo-traversal.ts`.
2. Define `RepoTextFileRef` with `path`, `absolutePath`, and `sizeBytes`.
3. Implement `collectRepoTextFileRefs({ root, requestedPath, generatedPathGlobs })`.
4. Move traversal responsibilities from `retrieve.ts` into the new module:
   - root containment,
   - `realpath` safety,
   - cycle detection,
   - broken symlink/read failure skip,
   - broad skip directories/extensions/size,
   - lockfile exceptions,
   - configured generated glob matching,
   - explicit path bypass of broad skips.
5. Update `retrieve.ts` to use the new module and keep file-content reading in `retrieve.ts`.
6. Do not optimize `experimental-local-index.ts` around this module. Touch it only if TypeScript build/tests require minimal compatibility.

Checks:

- Focused traversal tests.
- `npm run test:router`.
- `npm run bench:router` if retrieval behavior changes.
- Large Codex scanner benchmark before accepting the slice as accuracy-safe.

Stop if:

- implementing the glob subset requires a dependency,
- explicit traversal semantics would weaken root/symlink safety,
- public tool/schema changes appear necessary.

## Slice 2: Exact Line Ranges

Purpose: enforce exact requested `lineRange` behavior for repo and vault retrieval.

Red tests:

- Repo retrieve with `lineRange.end > lineCount` errors instead of clamping.
- Vault retrieve with `lineRange.end > lineCount` errors instead of clamping.
- Valid exact ranges still return exactly the requested lines.
- Existing `start > lineCount`, `start < 1`, and `end < start` behavior remains correct.
- Over-cap exact ranges still return bounded exact chunks/recovery according to existing policy.

Implementation:

1. Add `router/src/line-ranges.ts`.
2. Implement a small resolver such as `resolveExactLineRange({ requested, lineCount })`.
3. Use it from both repo and vault retrieval paths in `retrieve.ts`.
4. Keep error messages explicit enough to identify repo/vault source and available line count.

Checks:

- Focused repo/vault line-range tests.
- `npm run test:router`.

Stop if:

- a test or doc expects clamping as source truth; ask before changing that source truth.

## Slice 3: EvidenceRangeSelector

Purpose: make exact phrase and coverage range selection truthful without moving full `EvidencePacket` assembly yet.

Red tests:

- A query with repeated high-frequency terms and one exact phrase returns evidence including the exact phrase line/span.
- When the reason says exact phrase matched, the selected range includes the exact phrase line/span.
- Coverage-range selection still handles spread-out section terms.
- Symbol chunks, source/test priors, implementation-vs-re-export behavior, and large-doc caps do not regress.

Implementation:

1. Add `router/src/evidence-range-selector.ts`.
2. Move range-selection logic out of `retrieve.ts`:
   - exact phrase line/span detection,
   - coverage range selection,
   - best-line fallback,
   - anchor metadata.
3. Return range plus metadata, not a full `EvidencePacket`.
4. Keep `EvidencePacket` construction, evidence IDs, and route text in `retrieve.ts` unless a smaller extraction is clearly needed.
5. Update reason construction so exact-phrase claims are tied to selector metadata.

Checks:

- Focused evidence-range selector tests.
- `npm run test:router`.
- `npm run bench:router`.
- Large Codex scanner benchmark before accepting retrieval accuracy.

Stop if:

- evidence IDs, reason strings, or line windows need broad public-output changes beyond the spec.

## Slice 4: VaultSessionIndexStore

Purpose: make session-index writes additive and safe across same-process and separate Node-process writers.

Red tests:

- Same-process concurrent stores preserve all records.
- Separate Node processes writing to the same vault root and session id preserve all records.
- Mixed command/text/repo records preserve `records`, `outputs`, and execution-status groups.
- Existing duplicate detection and exact recovery still work.
- Corrupt or missing index behavior remains safe and explicit.

Implementation direction:

1. Keep public vault functions stable where possible: `storeCommandOutput`, `storeTextOutput`, `storeRepoFileReference`, `readSessionIndex`, duplicate lookups.
2. Add a deeper session-index store seam inside `vault.ts` or a small internal module if that is clearer.
3. Use a deterministic no-native-dependency file strategy, likely:
   - per-session lock file acquired with exclusive create,
   - bounded retry/backoff and timeout,
   - read current index,
   - merge new record additively,
   - write temp JSON,
   - atomic rename to `index.json`,
   - release lock in `finally`.
4. Keep object bytes written before session-index registration unless implementation evidence shows this must change.
5. Treat duplicate detection as best-effort/advisory unless this slice explicitly proves transactional duplicate semantics without public behavior changes.

Checks:

- Focused vault tests, including deterministic child-process concurrency.
- `npm run test:router`.
- Existing recovery tests in run/retrieve/Pi remain green.

Stop if:

- cross-platform locking requires native dependencies,
- changing vault root, retention, `outputId`, or routed-result schema seems necessary,
- child-process tests are flaky because they rely on timing instead of a barrier.

## Slice 5: CommandBenchmarkObservation

Purpose: ensure command benchmarks prove parser/fact behavior instead of passing because later iterations are duplicates.

Red tests:

- A parser/fact-preservation fixture fails if its only passing evidence comes from `duplicate-output` recovery.
- Duplicate-output behavior is still covered by a dedicated fixture or scoring path.
- Multi-iteration results report parser evidence from a non-duplicate observation for parser fixtures.
- Exact vault recovery remains checked independently from routed excerpt facts.

Implementation:

1. Add a benchmark-local observation model/helper in or near `command-benchmarks.ts`.
2. Separate fixture intent:
   - parser/fact preservation,
   - duplicate-output behavior,
   - recovery behavior,
   - skipped external comparator behavior.
3. For parser/fact fixtures, either isolate iterations by session id or aggregate the first non-duplicate observation so duplicate output cannot mask parser failures.
4. Keep benchmark execution through `freeflowRun`; do not replace it with a pure parser test.
5. Update report rendering if needed so notes describe duplicate observations without making false parser claims.

Checks:

- `router/tests/command-benchmarks.test.js`.
- `npm run bench:router:commands`.
- `npm run test:router`.

Stop if:

- the benchmark refactor would stop exercising vault capture/recovery,
- public benchmark JSON/report shape changes need downstream approval.

## Slice 6: Report Refresh And Durable Evidence

Purpose: align tracked reports with the verified behavior after code and benchmark harness changes.

Steps:

1. Rerun affected benchmark commands:
   - `npm run bench:router`
   - `npm run bench:router:commands`
   - `npm run bench:router:index` only to confirm the frozen experiment remains non-default / unaffected.
2. Rerun the large Codex scanner benchmark before accepting retrieval/traversal/scoring changes.
3. Update tracked runtime reports only from verified runs.
4. If a report references `/tmp` output, include enough durable summary/evidence in the report so `/tmp` is not the sole support for accuracy/speed claims.
5. Mark ad hoc/historical evidence clearly where it is not durable release evidence.

Checks:

- Updated reports match current command output.
- Report claims do not exceed verified evidence.
- `git diff --check`.

Stop if:

- a benchmark regresses below the accepted gate,
- report claims would require unverified or non-durable evidence.

## Slice 7: Final Verification And Review

Purpose: prove the full diff is safe to commit.

Required checks:

- `npm run test:router`
- `npm run bench:router`
- `npm run bench:router:commands`
- `npm run bench:router:index`
- large Codex scanner benchmark:
  - `node /tmp/freeflow-codex-large-benchmark/bench-scanner-sqlite.mjs`
- `node --check pi-extension/index.js` if Pi file remains modified
- production shell API scan for router/Pi source if child-process tests were added
- `npm pack --dry-run --json`
- `git diff --check`

Review checkpoint:

- Run one focused code review against the final diff.
- Specifically ask reviewers to check:
  - deep modules are real seams, not utility shuffles,
  - all handoff blockers are covered,
  - no index/SQLite/adapter scope creep landed,
  - benchmark/report evidence is honest.

Pi/TUI smoke:

- If `pi-extension/index.js` remains modified in the final diff or adapter readiness is claimed, run real installed-cache/TUI smoke before claiming Slice 0/Pi readiness.
- If not run, final response and commit notes must say Pi/TUI smoke is unverified.

Stop if:

- large Codex scanner benchmark regresses below the accepted gate,
- review finds accepted blockers,
- verification output contradicts completion claims.

## Final Completion Criteria

The work is ready for commit only when:

- all accepted handoff blockers are fixed or explicitly deferred with owner agreement,
- internal modules named in this plan have focused tests at their interfaces,
- public router/tool contracts remain stable,
- scanner remains default and index remains frozen,
- all required verification passes or any skipped check is named as unverified,
- final review has no accepted blockers.
