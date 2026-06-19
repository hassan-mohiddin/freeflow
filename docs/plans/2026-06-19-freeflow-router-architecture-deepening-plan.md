> **Doc ID:** PLAN-2026-06-19-freeflow-router-architecture-deepening
> **Date:** 2026-06-19
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Draft
> **Source:** `docs/specs/freeflow-router-architecture-deepening-spec.md`

# Freeflow Router Architecture Deepening Plan

## Goal

Execute the router architecture deepening program described in `docs/specs/freeflow-router-architecture-deepening-spec.md` without changing the public Output Router contract.

The plan covers all five candidates in staged slices:

1. bounded evidence construction,
2. benchmark harness,
3. EvidenceSearch,
4. RouterContract,
5. experimental index capsule.

## Source Authority

Primary spec:

- `docs/specs/freeflow-router-architecture-deepening-spec.md`

Supporting source truth:

- `docs/specs/freeflow-output-router-design.md`
- `docs/specs/freeflow-output-router-excellence-spec.md`
- `docs/specs/freeflow-router-internal-deep-modules-spec.md`
- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/output-router/references/safety-policy.md`
- live router source under `plugins/freeflow/router/src/`
- live router tests under `plugins/freeflow/router/tests/`

Research inputs:

- post-commit architecture report: `/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/architecture-review-freeflow-router-postcommit-1781895969.html`
- candidate briefs: `/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-candidate-research-gYK3DMQtX3/`

## Non-Goals

Do not:

- adopt the experimental index;
- add SQLite, FTS, native dependencies, embeddings, semantic reranking, or model-assisted routing;
- remove or rename public experimental index exports;
- redesign routed-result schema;
- change native post-tool routing defaults;
- turn this into Pi adapter portability work;
- merge all candidates in one implementation batch.

## Working Rules

- Use TDD per slice.
- Keep each slice separately reviewable.
- Prefer small deep modules with explicit interface tests.
- Keep public output stable unless the spec explicitly allows the change.
- Build router dist with `npm run build:router`; tests import compiled output.
- Run large Codex scanner benchmark after retrieval/search/ranking changes.
- Stop before changing public exports, package surface, scanner/index behavior, post-tool routing defaults, or Pi adapter portability scope.

## Likely Files Touched

Source:

- new `plugins/freeflow/router/src/bounded-evidence.ts`
- new `plugins/freeflow/router/src/benchmark-harness.ts`
- new `plugins/freeflow/router/src/evidence-search.ts`
- new `plugins/freeflow/router/src/router-contract.ts`
- new `plugins/freeflow/router/src/experiments/local-index.ts` or similar
- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/benchmarks.ts`
- `plugins/freeflow/router/src/command-benchmarks.ts`
- `plugins/freeflow/router/src/index-benchmarks.ts`
- `plugins/freeflow/router/src/config.ts`
- `plugins/freeflow/router/src/schema.ts`
- `plugins/freeflow/router/src/experimental-local-index.ts`
- `plugins/freeflow/pi-extension/index.js` only for RouterContract predicate use or generated path/config checks
- generated `plugins/freeflow/router/dist/**`

Tests:

- new `plugins/freeflow/router/tests/bounded-evidence.test.js`
- new `plugins/freeflow/router/tests/benchmark-harness.test.js`
- new `plugins/freeflow/router/tests/evidence-search.test.js`
- new `plugins/freeflow/router/tests/router-contract.test.js`
- existing benchmark/retrieve/regression/index/Pi tests as affected

Reports:

- benchmark reports only when their underlying commands are rerun and results change.

## Slice 0: Baseline And Orientation

Purpose: make the starting point explicit before new architecture work.

Steps:

1. Inspect `git status --short` and confirm the post-commit tree is clean.
2. Reopen the spec and relevant candidate brief before implementation.
3. Run baseline checks as needed for the next slice:
   - `npm run test:router`
   - `git diff --check`
4. Record any pre-existing failures separately from new slice failures.

Checks:

- Baseline status is known.
- No source-truth conflict is present.

Stop if:

- live tests/docs contradict the spec;
- the tree is dirty with unrelated changes.

## Slice 1: Bounded Evidence

Purpose: concentrate exactness-sensitive excerpt/cap behavior behind one module.

Red/interface tests:

- exact phrase late in a normal section appears in bounded excerpt;
- exact phrase late in a short section appears;
- exact phrase in a long symbol appears;
- exact phrase inside a huge single line appears;
- exact phrase spanning huge lines appears;
- non-exact huge lines still use bounded head previews;
- head/tail edge chunks preserve recovery labels;
- UTF-8 truncation does not split multibyte characters;
- under-cap exact ranges remain exact.

Implementation:

1. Add `plugins/freeflow/router/src/bounded-evidence.ts`.
2. Move bounded excerpt mechanics out of `retrieve.ts`:
   - line caps,
   - byte caps,
   - UTF-8-safe truncation,
   - exact phrase raw-span anchoring,
   - edge preview construction,
   - truncation metadata.
3. Keep public `EvidencePacket` construction, source objects, IDs, and route text in `retrieve.ts` for this slice unless a very small extraction is clearly needed.
4. Update `retrieve.ts` to call the new module.
5. Keep public routed-result schema unchanged.

Checks:

- `node --test plugins/freeflow/router/tests/bounded-evidence.test.js`
- focused retrieve/regression tests for exactness and over-cap behavior
- `npm run test:router`
- `git diff --check`

Stop if:

- evidence IDs or public recovery wording must change to complete the slice;
- exact under-cap line ranges become lossy.

## Slice 2: BenchmarkHarness

Purpose: remove repeated benchmark mechanics without changing report meaning.

Red/interface tests:

- iteration normalization matches current behavior;
- latency p50/p95 match current behavior;
- reduction and token approximation helpers match current behavior;
- Markdown table escaping matches current reports;
- default JSON run path matches current ignored generated output path;
- CLI parsing handles current `--iterations`, `--report`, and `--json-report` forms;
- report-pair writer writes Markdown and optional JSON.

Implementation:

1. Add `plugins/freeflow/router/src/benchmark-harness.ts`.
2. Move shared mechanics only:
   - `approximateTokens`,
   - percentile/latency helpers,
   - reduction/format helpers,
   - table escaping,
   - report path derivation,
   - CLI arg parsing,
   - generic report-pair writer.
3. Update `benchmarks.ts`, `command-benchmarks.ts`, and `index-benchmarks.ts` to use the module.
4. Keep fixture definitions, correctness scoring, adoption claims, summary fields, and report prose inside their current benchmark adapters.

Checks:

- `node --test plugins/freeflow/router/tests/benchmark-harness.test.js`
- `node --test plugins/freeflow/router/tests/benchmarks.test.js plugins/freeflow/router/tests/command-benchmarks.test.js plugins/freeflow/router/tests/index-benchmarks.test.js`
- `npm run bench:router`
- `npm run bench:router:commands`
- `npm run bench:router:index`
- `npm run test:router`
- `git diff --check`

Stop if:

- report schema/prose drift appears without a reason;
- command duplicate-output fixture stops proving parser/fact behavior separately.

## Slice 3: EvidenceSearch

Purpose: concentrate repo candidate search while leaving public evidence formatting stable.

Red/interface tests:

- exact phrase beats high-frequency fallback and returns exact metadata;
- symbol definition beats repeated usage decoys;
- source/test priors avoid test decoys when query has source intent;
- test intent can select tests when query clearly asks for them;
- implementation module beats thin re-export for compound symbol queries;
- path-intent boost remains stable;
- topK de-dupes by path.

Implementation:

1. Add `plugins/freeflow/router/src/evidence-search.ts`.
2. Move candidate-search implementation out of `retrieve.ts`:
   - query tokenization / identifier expansion,
   - normalized phrase construction,
   - chunk construction,
   - chunk prefiltering,
   - stats and scoring,
   - priors and boosts,
   - sorting and path de-dupe,
   - integration with `EvidenceRangeSelector`.
3. Keep repo traversal, file reading, public `EvidencePacket` assembly, exact line-range retrieval, expansion, and recovery text outside EvidenceSearch for this slice.
4. Update `queryRepo` and `locateRepo` to consume EvidenceSearch candidates.

Checks:

- `node --test plugins/freeflow/router/tests/evidence-search.test.js`
- focused retrieve/regression ranking tests
- `npm run test:router`
- `npm run bench:router`
- large Codex scanner benchmark:
  - `node /tmp/freeflow-codex-large-benchmark/bench-scanner-sqlite.mjs`
- `git diff --check`

Stop if:

- ranking changes regress benchmark gates;
- reason/why strings must intentionally change;
- EvidenceSearch starts owning public packet formatting.

## Slice 4: RouterContract

Purpose: make config/schema/Pi contract invariants local.

Red/interface tests:

- post-tool routing predicate accepts only current modes;
- native safety-net predicate preserves current `off`/`safety-net`/`strict` behavior;
- threshold validator rejects zero, negative, non-integer, non-finite, and non-number values;
- retention validator rejects invalid TTL policies;
- hints validator rejects malformed normalized hints;
- `validateRouterConfig()` rejects zero thresholds and malformed hints;
- `normalizeRouterConfig()` fallback/warnings remain stable for raw invalid config.

Implementation:

1. Add `plugins/freeflow/router/src/router-contract.ts`.
2. Move shared predicates/defaults only.
3. Update `config.ts` and `schema.ts` to use the shared predicates.
4. Update Pi safety-net predicate only if it stays a narrow contract reuse; do not redesign Pi adapter surface.
5. Keep raw `.freeflow/config.json` shape and normalized `RouterConfig` shape distinct.

Checks:

- `node --test plugins/freeflow/router/tests/router-contract.test.js plugins/freeflow/router/tests/config.test.js plugins/freeflow/router/tests/schema.test.js plugins/freeflow/router/tests/pi-extension.test.js`
- `npm run test:router`
- `node --check plugins/freeflow/pi-extension/index.js` if Pi changes
- `git diff --check`

Stop if:

- stricter validation affects more than zero thresholds or malformed hints;
- `strict` mode behavior starts changing beyond the current safety-net predicate;
- Pi tool schema generation becomes part of the router contract.

## Slice 5: Experimental Index Capsule

Purpose: make the frozen index experiment honest and local without changing compatibility.

Red/interface tests:

- product runtime modules do not import the experiment capsule or facade;
- index benchmark imports the experiment capsule directly;
- compatibility facade still exports existing experiment names;
- scanner remains default and index remains not adopted;
- package dry-run still includes existing compatibility output.

Implementation:

1. Add an experiment capsule, e.g. `plugins/freeflow/router/src/experiments/local-index.ts`.
2. Move current `experimental-local-index.ts` implementation into the capsule with no scoring/traversal behavior changes.
3. Convert `experimental-local-index.ts` into a compatibility facade that re-exports existing names.
4. Update `index-benchmarks.ts` to import the capsule, not the facade.
5. Keep `plugins/freeflow/router/src/index.ts` public export unchanged.
6. Do not optimize or productize the experiment in this slice.

Checks:

- focused index benchmark tests
- `npm run bench:router:index`
- `npm run test:router`
- `npm pack --dry-run --json`
- `git diff --check`

Stop if:

- removing/renaming exports seems necessary;
- package `exports` map changes become tempting;
- product retrieval starts importing the experiment.

## Slice 6: Report Refresh

Purpose: align durable benchmark reports with verified behavior only after relevant slices land.

Steps:

1. Rerun affected benchmarks:
   - `npm run bench:router`
   - `npm run bench:router:commands`
   - `npm run bench:router:index`
2. Rerun the large Codex scanner benchmark after Slice 3 or any ranking-sensitive change.
3. Update tracked reports only from verified runs.
4. Keep `/tmp` large benchmark evidence summarized durably when referenced.

Checks:

- report claims match command output;
- `git diff --check`.

Stop if:

- benchmark results regress below accepted gates;
- reports would need unverified claims.

## Slice 7: Final Review And Verification

Required final checks:

- `npm run test:router`
- `npm run bench:router`
- `npm run bench:router:commands`
- `npm run bench:router:index`
- large Codex scanner benchmark if Slice 3 or ranking-sensitive changes landed:
  - `node /tmp/freeflow-codex-large-benchmark/bench-scanner-sqlite.mjs`
- `node --check plugins/freeflow/pi-extension/index.js` if Pi changed
- production `child_process` scan if runner/test process work touched production paths
- `npm pack --dry-run --json`
- `git diff --check`

Review checkpoint:

- Run a focused final review before commit.
- Ask reviewers to check:
  - public routed-result schema stability;
  - scanner remains default;
  - exactness-sensitive evidence rules;
  - benchmark report honesty;
  - RouterContract strictness is limited to agreed bug fixes;
  - experiment capsule is non-breaking.

Commit guidance:

- Prefer separate commits per slice or small groups of low-risk slices.
- Do not commit if final review has accepted blockers.

## Final Completion Criteria

The program is complete when:

- all five candidates are landed or explicitly deferred with rationale;
- each landed module has focused interface tests;
- public router/tool contracts remain stable except the approved validator strictness fix;
- scanner remains default and index remains a non-product experiment;
- all required verification passes;
- final review finds no accepted blockers.
