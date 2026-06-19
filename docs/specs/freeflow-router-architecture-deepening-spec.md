# Freeflow Router Architecture Deepening Spec

> **Doc ID:** SPEC-2026-06-19-freeflow-router-architecture-deepening
> **Date:** 2026-06-19
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Last Updated:** 2026-06-19
> **Source:** post-commit router architecture review; five candidate deep-dive briefs under `/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-candidate-research-gYK3DMQtX3/`; live router source after commit `d5608b7`; `docs/specs/freeflow-output-router-design.md`; `docs/specs/freeflow-output-router-excellence-spec.md`; `docs/specs/freeflow-router-internal-deep-modules-spec.md`

## Problem

The Output Router now passes its correctness gates, but several internal router responsibilities remain too shallow:

- bounded evidence construction still mixes line caps, byte caps, exact phrase anchoring, UTF-8 truncation, edge previews, and recovery text near public retrieval assembly;
- repo search still concentrates query language, chunking, scoring, range metadata, and candidate selection in `retrieve.ts`;
- three benchmark modules repeat harness mechanics;
- router contract invariants are split across config normalization, schema validation, and Pi adapter behavior;
- the frozen local-index experiment is still visible through the public router barrel.

The risk is not immediate correctness. The risk is future regression pressure: exactness, ranking, benchmark, and config changes will keep touching broad files unless the remaining seams become deeper.

## Intended Outcome

Deepen the router in a staged architecture program while preserving the current product contract:

- `freeflow_retrieve` and `freeflow_run` remain the public routed tools.
- The scanner remains the default retrieval backend.
- Public routed-result schema stays stable.
- SQLite/FTS/index adoption remains out of scope.
- Native post-tool routing remains off by default.
- Pi adapter portability remains deferred.
- Each new module has an interface test surface.
- Each slice is independently reviewable and verifiable.

## Decisions Made

1. **One umbrella spec and one umbrella plan are acceptable.** Execution must still happen in staged slices, not one large implementation batch.
2. **Router contract strictness may be tightened.** `validateRouterConfig()` should reject zero thresholds and malformed normalized `hints`, matching normalization intent. Treat this as a bug fix and call it out in tests/review.
3. **Experimental index exports stay compatible in this pass.** Add a non-breaking experiment capsule/facade first. Do not remove public exports or deep import paths without a separate compatibility decision.
4. **Separate implementation slices/commits are preferred.** The plan may cover all candidates, but execution should preserve review locality.

## Scope

### Candidate 1: Bounded Evidence

Create a bounded evidence module that owns evidence-window rendering mechanics:

- line labels and line caps,
- byte caps,
- UTF-8-safe truncation,
- exact phrase raw-span anchoring, including multi-line spans,
- head/tail edge previews,
- truncation metadata needed for recovery wording.

Initial slice should keep `EvidencePacket` construction, evidence IDs, source objects, and route text in `retrieve.ts` unless a smaller extraction proves safe.

### Candidate 2: Benchmark Harness

Create a benchmark harness module for shared benchmark mechanics:

- iteration normalization,
- fixture/mode observation measurement,
- p50/p95 latency summaries,
- reductions and token approximations,
- Markdown table escaping,
- report-pair writing,
- generated JSON report path derivation,
- shared CLI argument parsing.

Per-benchmark adapters keep fixture definitions, correctness scoring, report prose, and adoption language.

### Candidate 3: EvidenceSearch

Create an internal EvidenceSearch module after bounded evidence exists.

Initial interface should return search candidates with:

- file reference,
- selected range,
- anchor line,
- score,
- reason metadata,
- exact phrase metadata when applicable.

It should own query language, chunking, scoring, priors, top-K sorting, and path de-dupe. It should not own public packet formatting, exact line-range retrieval, or expansion behavior in the first slice.

### Candidate 4: RouterContract

Create a router contract module for shared invariants:

- post-tool routing mode predicate,
- native safety-net enabled predicate,
- positive integer threshold validation,
- vault retention validation,
- normalized hints validation,
- reusable validation issue helpers where appropriate.

Use it from config normalization, schema validation, and Pi safety-net predicates where doing so does not broaden adapter portability work.

### Candidate 5: Experimental Index Capsule

Move the local index experiment behind a non-breaking experiment capsule:

- benchmark code imports the capsule directly;
- `experimental-local-index.ts` remains as a compatibility facade;
- the public barrel export remains unchanged in this pass;
- product runtime modules do not import the experiment;
- reports continue to say scanner remains default and index is not adopted.

## Non-Goals

Do not:

- adopt the experimental index;
- add SQLite, FTS, native dependencies, embeddings, semantic reranking, or model-assisted routing;
- remove or rename public experiment exports without a separate owner decision;
- redesign `freeflow_retrieve`, `freeflow_run`, or routed-result schema;
- change native post-tool routing defaults;
- make Pi adapter portability a goal;
- broaden benchmark claims beyond verified evidence;
- collapse all candidates into one implementation change.

## Requirements

### R1: Public Contract Stability

The public routed tools, routed result schema, parser metadata schema, preserve modes, output IDs, and recovery model must remain stable unless the user explicitly approves a public change.

### R2: Exactness Preservation

If a route claims exact phrase evidence, the returned excerpt must include the phrase span under bounded output, including:

- normal section chunks,
- short section chunks,
- long symbol chunks,
- huge single-line chunks,
- multi-line huge phrase spans.

Exact requested line ranges under cap must remain exact. Over-cap ranges may return bounded previews with recovery guidance according to existing policy.

### R3: Search Accuracy Gates

Any EvidenceSearch/ranking/chunking movement must preserve current router regression tests and pass the large Codex scanner benchmark gate at the accepted level or better.

### R4: Benchmark Honesty

Benchmark refactors must preserve report semantics:

- router benchmark still gates improved retrieval;
- command benchmark still proves parser/fact behavior and duplicate-output behavior separately;
- index benchmark still states scanner default and index not adopted;
- generated JSON remains generated output, not durable release evidence unless explicitly changed.

### R5: Contract Invariant Locality

Config normalization and schema validation should not drift. Zero thresholds and malformed normalized hints should be rejected by validation after the RouterContract slice.

### R6: Experiment Locality

The local-index experiment should be isolated enough that product code cannot accidentally adopt it. Compatibility exports stay in place until a separate decision changes the public surface.

## Acceptance Criteria

The architecture program is complete when:

- each candidate has either landed as a tested slice or is explicitly deferred with a reason;
- new deep modules have focused tests at their interfaces;
- public router/tool contracts remain stable except for the agreed RouterConfig validator strictness bug fix;
- scanner remains default and index remains non-product behavior;
- benchmark reports are refreshed only from verified runs;
- final review finds no accepted blockers;
- final verification passes or any skipped check is named as unverified.

## Required Verification

Run relevant focused tests per slice. Final verification should include:

- `npm run test:router`
- `npm run bench:router`
- `npm run bench:router:commands`
- `npm run bench:router:index`
- large Codex scanner benchmark when retrieval/search behavior changes:
  - `node /tmp/freeflow-codex-large-benchmark/bench-scanner-sqlite.mjs`
- `node --check plugins/freeflow/pi-extension/index.js` if Pi file changes
- production `child_process` scan if test-only child processes or runner changes are touched
- `npm pack --dry-run --json`
- `git diff --check`

## Open Questions

None blocking before planning.

Future owner decisions, not part of this spec:

- whether to remove or deprecate the public experimental index export;
- whether to add a package `exports` map;
- whether to make the large Codex benchmark repo-local instead of `/tmp`-driven;
- whether to begin Pi adapter portability after internal router modules are deeper.
