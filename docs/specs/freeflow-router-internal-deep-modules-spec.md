# Freeflow Router Internal Deep Modules Spec

> **Doc ID:** SPEC-2026-06-18-freeflow-router-internal-deep-modules
> **Date:** 2026-06-18
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Last Updated:** 2026-06-18
> **Source:** 2026-06-18 router architecture research and grilling; live router files; `docs/specs/freeflow-output-router-design.md`; `docs/specs/freeflow-output-router-excellence-spec.md`; `docs/handoffs/2026-06-18-output-router-review-and-architecture-next.md`

## Problem

Output Router fixes are starting to patch edge cases inside shallow modules instead of concentrating invariants behind deep interfaces.

The immediate risk is that retrieval, traversal, vault recovery, and benchmark behavior keep regressing because important rules are spread across large implementation files rather than named modules with stable tests.

## Intended Outcome

Deepen the router internally while keeping the current product contract stable:

- `freeflow_retrieve` and `freeflow_run` remain the public routed tools.
- The scanner remains the retrieval backend.
- Routed-result schema stays stable unless a separate owner decision approves a public change.
- Internal modules concentrate behavior and tests around invariants.
- Known handoff blockers are covered by explicit slices instead of disappearing during architecture cleanup.
- Adapter portability improvements are deferred until the internal router model is cleaner.

## Current Evidence

Relevant live source areas:

- `router/src/tools/retrieve.ts` currently owns repo traversal, chunking, scoring, exact phrase range selection, exact line-range handling, evidence assembly, caps, and route text.
- `router/src/experiments/local-index.ts` duplicated traversal/search policy for an experiment that benchmarks rejected as a product path.
- `router/src/vault/vault.ts` owns object storage and session index mutation; current in-process locking does not model cross-process safety.
- `router/src/benchmarks/command-benchmarks.ts` mixes parser/runtime observation with duplicate-output benchmark semantics.
- `pi-extension/index.js` owns adapter behavior plus some router policy, but adapter portability is not the current priority.

Relevant source truth:

- `docs/specs/freeflow-output-router-design.md` requires explicit routed tools, raw capture before transformation, exact recovery, no surprise semantics, and deterministic runtime behavior.
- `docs/specs/freeflow-output-router-excellence-spec.md` makes accuracy non-negotiable and keeps optional index adoption behind evidence gates.
- `docs/handoffs/2026-06-18-output-router-review-and-architecture-next.md` records current review blockers and the decision to run architecture research before more fixes.

## Proposed Design Direction

Target architecture: **EvidenceSearch** as the long-term internal retrieval model.

Do not implement the whole EvidenceSearch module first. Build it through narrow deep modules that pay for themselves immediately.

### Module 1: RepoTraversalPolicy

Create a new internal router module:

```text
router/src/repo/repo-traversal.ts
```

Initial interface stays small:

```ts
collectRepoTextFileRefs({
  root,
  requestedPath,
  generatedPathGlobs,
}): Promise<RepoTextFileRef[]>
```

`RepoTextFileRef` includes:

```ts
{
  path: string;
  absolutePath: string;
  sizeBytes: number;
}
```

Responsibilities:

- repo-root containment,
- `realpath` safety,
- symlink escape/cycle behavior,
- broken symlink skipping,
- broad generated/dependency/media/large-file skips,
- lockfile exceptions,
- configured generated-path glob matching,
- explicit file/directory traversal semantics.

Non-responsibilities:

- reading full file contents,
- chunking,
- scoring,
- evidence range selection,
- evidence packet assembly,
- vault recovery.

Core invariant:

```text
Broad traversal protects context.
Explicit traversal respects requested source truth.
```

If `requestedPath` is omitted, broad traversal skips generated/dependency/media/large decoys. If `requestedPath` is present, explicit traversal may enter paths that broad traversal would skip, while still enforcing inside-root safety, readable text handling, and downstream evidence caps/recovery.

### Generated Path Glob Subset

Generated path hints use a small portable glob subset. No new dependency and no full glob engine.

Path normalization:

- Match against repo-relative paths using `/` as the separator.
- Patterns without a leading `**/` are anchored at the repo root.
- A trailing `/` is ignored for matching.

Supported tokens:

- `*` matches zero or more characters inside one path segment. It does not cross `/`.
- `**` matches zero or more complete path segments, including nested directories.
- Literal characters match themselves after path normalization.

Supported examples and expected behavior:

```text
foo/**
  matches: foo, foo/a.txt, foo/nested/a.txt
  does not match: bar/foo/a.txt

**/foo/**
  matches: foo/a.txt, bar/foo/a.txt, bar/baz/foo/a.txt
  does not match: foobar/a.txt

*.md
  matches: README.md
  does not match: docs/README.md

foo/*.md
  matches: foo/a.md
  does not match: foo/nested/a.md

foo/**/*.md
  matches: foo/a.md, foo/nested/a.md, foo/nested/deeper/a.md
  does not match: bar/foo/a.md
```

Unsupported in the first slice:

- brace expansion,
- extglobs,
- negation,
- character classes,
- escaping semantics beyond literal matching.

Unsupported patterns match nothing in the first slice. They do not warn yet and must not silently broaden skips.

### Experimental Local Index Status

`router/src/experiments/local-index.ts` stays in place for now as a frozen experiment / historical evidence path.

Constraints:

- Do not adopt the index.
- Do not add SQLite/FTS.
- Do not optimize new architecture around index parity.
- Touch the file only for minimal build/test compatibility if required.
- Consider removal or export quarantine later as a separate cleanup decision.

### Module 2: Exact Line Ranges

Create a small exact range module, likely:

```text
router/src/line-ranges.ts
```

It should be shared by repo and vault retrieval immediately.

Core invariant:

```text
Explicit lineRange returns exactly requested lines or errors.
No silent clamping.
```

Expected behavior:

- invalid range shape errors,
- `start < 1` errors,
- `end < start` errors,
- `start > lineCount` errors,
- `end > lineCount` errors,
- valid exact ranges return the requested range unchanged.

### Module 3: Evidence Range Selector

Create a search-specific range selector, likely:

```text
router/src/evidence-range-selector.ts
```

It returns range plus anchor metadata, not full `EvidencePacket`s.

Suggested result shape:

```ts
{
  range: LineRange;
  anchorLine: number;
  matchKind: "exact-phrase" | "coverage" | "best-line";
}
```

Core invariant:

```text
If matchKind is exact-phrase, the selected range includes the exact phrase line/span.
```

Keep `EvidencePacket` assembly in `retrieve.ts` or a later evidence assembly module until the need for a deeper packet seam is proven.

### Module 4: VaultSessionIndexStore

Create or expose a deeper vault session index seam inside the router, likely within `vault.ts` first and extractable later if it earns a standalone file.

Core invariant:

```text
Concurrent writes from the same or separate Node processes do not lose session-index records.
```

Responsibilities:

- additive session-index updates,
- atomic or locked file-backed writes,
- stable `outputId` to object lookup,
- command/text/repo record registration,
- execution-status groups,
- duplicate lookup support,
- malformed or missing index handling where safe.

Non-responsibilities:

- changing vault root or retention policy,
- changing `outputId` format,
- adopting SQLite or native dependencies,
- changing public routed-result schema.

The first implementation plan should choose the smallest deterministic file-backed strategy that proves same-process and cross-process record preservation without adding a native dependency.

### Module 5: CommandBenchmarkObservation

Create a benchmark-local observation seam for command benchmarks.

Core invariant:

```text
Parser/fact-preservation fixtures measure parser behavior, not duplicate-output masking.
Duplicate-output behavior is tested by its own fixture or scoring path.
```

Responsibilities:

- classify observation samples,
- aggregate multi-iteration benchmark results without hiding parser failures,
- keep exact recovery checks distinct from routed-excerpt fact checks,
- keep command benchmark report claims aligned with what was actually measured.

This is not a runtime command-routing refactor unless a later implementation plan proves a second runtime consumer needs that seam.

### Closeout: Durable Report Evidence

Refresh tracked benchmark reports only after the benchmark observation semantics are fixed and rerun.

Core invariant:

```text
Durable reports should make current verified claims from durable evidence, or clearly label ad hoc/historical evidence.
```

A report may reference `/tmp` artifacts for reproduction context, but `/tmp` paths should not be the only support for durable accuracy/speed claims.

## Scope

In scope:

- Internal module extraction and invariant tests.
- Fixing current traversal blockers while extracting `repo-traversal.ts`:
  - explicit generated directory access,
  - non-terminal `**` generated glob semantics.
- Fixing repo/vault exact line-range `end > EOF` behavior through `line-ranges.ts`.
- Fixing exact-phrase evidence omission through `evidence-range-selector.ts`.
- Fixing cross-process vault session-index record loss through `VaultSessionIndexStore`.
- Fixing command benchmark duplicate-observation masking through `CommandBenchmarkObservation`.
- Refreshing standard benchmark reports after the benchmark harness semantics are trustworthy.
- Recording report evidence so current claims are durable or clearly labeled ad hoc/historical.

Out of scope:

- Making the experimental index default.
- Adding SQLite, FTS, embeddings, semantic reranking, or model-assisted routing.
- Redesigning public routed-result schema.
- Moving Pi/Codex/Claude adapter portability forward before internal modules stabilize.
- Broad cleanup of `experimental-local-index.ts` beyond minimal compatibility.
- Creating enforcement hooks or changing native post-tool routing defaults.

## Acceptance Criteria

- `retrieve.ts` no longer owns repo traversal policy directly.
- Broad repo retrieval skips generated/dependency/media/large decoys.
- Explicit repo file and explicit repo directory retrieval can access inside-root text under generated/configured-generated paths.
- Supported generated glob subset has direct tests, including `foo/**/*.md`-style non-terminal `**` behavior.
- Unsupported generated glob patterns match nothing and do not broaden skips.
- Repo and vault exact `lineRange` reject `end > lineCount`; they do not clamp silently.
- Exact-phrase query evidence includes the exact phrase line/span when the route claims an exact phrase match.
- Scanner remains the default retrieval backend.
- `experimental-local-index.ts` remains frozen and is not used as the target architecture.
- Cross-process vault session-index tests prove no record loss for concurrent writers to the same vault root and session id.
- Command benchmark parser/fact fixtures cannot pass solely because later iterations produced `duplicate-output` observations.
- Benchmark reports that are updated in the diff reflect the latest verified run and do not rely on `/tmp` as sole durable evidence for claims.
- Existing router tests and relevant benchmarks pass after each slice.

## Verification Expectations

At minimum after implementation slices:

- focused regression tests for the changed module,
- `npm run test:router`,
- relevant router benchmarks,
- command benchmark rerun after observation semantics change,
- large Codex scanner benchmark before accepting retrieval scoring/traversal changes as safe,
- tracked report refresh after benchmark behavior changes,
- `git diff --check`.

If Pi adapter behavior is touched, also run the Pi extension test subset and a real installed-cache/TUI smoke before claiming adapter readiness.

## Risks

- Extraction can accidentally change line windows, reason strings, or evidence IDs.
- Glob semantics can become a compatibility change if current broad matching is relied on.
- Explicit traversal must not weaken root containment or symlink escape safety.
- Splitting modules without invariant tests would create more shallow seams, not depth.
- Moving too much at once can hide whether a regression came from traversal, range selection, or scoring.
- Cross-process vault tests can be flaky if they rely on timing instead of deterministic process coordination.
- Benchmark refactors can weaken evidence if they stop exercising the full `freeflow_run` path and exact vault recovery.

## Open Questions

- Should `repo-traversal.ts` later expose skipped-path diagnostics for `explain`, or keep the first interface file-ref only?
- Should unsupported generated glob patterns get config-time warnings in a later slice?
- Should `EvidencePacket` assembly later move into a deeper `text-evidence.ts` module, or remain in `retrieve.ts` until another duplication appears?
- What exact file-lock or atomic-write strategy should `VaultSessionIndexStore` use without native dependencies?
- Should duplicate detection remain best-effort/advisory, or become part of the session-index transaction contract?
- After internal modules stabilize, should the Pi adapter get a narrow router adapter API and router-owned tool schemas?

## Change Log

- 2026-06-18: Expanded the spec to cover all known handoff blockers, added precise generated-glob semantics, and added later internal seams for vault session indexing, command benchmark observation, and durable report evidence.
