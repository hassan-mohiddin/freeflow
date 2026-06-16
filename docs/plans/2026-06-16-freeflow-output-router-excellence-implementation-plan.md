> **Doc ID:** PLAN-2026-06-16-freeflow-output-router-excellence
> **Date:** 2026-06-16
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** Ready
> **Source:** `docs/specs/freeflow-output-router-excellence-spec.md` reviewed Pass on 2026-06-16

# Freeflow Output Router Excellence Implementation Plan

## Goal

Implement the next-stage Freeflow Router quality work from `docs/specs/freeflow-output-router-excellence-spec.md` using benchmark-first vertical slices.

Primary goal: make `freeflow_retrieve` and `freeflow_run` accurate, bounded, recoverable, and measured before documenting superiority claims.

The first implementation target is the known broad-retrieval failure originally observed before this spec/plan added self-referential copies of the query text:

```text
query: Sandbox Permissions / SandboxPermissions / Plain-language meaning
expected: docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:523-546
bad observed result: graphify-out/graph.html:67-71
```

Because the live repo now contains this query in spec/plan text, regression tests must use an isolated fixture or source snapshot with the target doc and generated-artifact decoy. Do not rely on mutable repo-root search behavior for the red test.

## Source Authority

Authoritative spec:

- `docs/specs/freeflow-output-router-excellence-spec.md`

Foundational router contract:

- `docs/specs/freeflow-output-router-design.md`
- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/output-router/references/safety-policy.md`

Implementation evidence:

- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/run.ts`
- `plugins/freeflow/router/src/vault.ts`
- `plugins/freeflow/router/src/config.ts`
- `plugins/freeflow/pi-extension/index.js`
- `plugins/freeflow/router/tests/`
- `plugins/freeflow/evals/fixtures/output-router/`
- `plugins/freeflow/evals/reports/runtime/output-router-regression-1-report.md`
- `docs/handoffs/2026-06-16-output-router-implementation-and-retrieval-benchmark.md`

Research benchmark oracle:

- `docs/codex-cli-agent-harness/README.md`
- `docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md`

## Non-Goals

Do not:

- replace native Pi tools,
- enable native post-tool routing by default,
- require Graphify, Claude Context, RTK, or Squeez,
- require external services/vector DB by default,
- make model-assisted routing default,
- change public tool names or routed-result contracts without explicit approval,
- turn this into skill/capability routing,
- optimize compression at the expense of correctness,
- store raw output in the repo by default,
- document benchmark superiority before measured evidence exists.

## Working Rules

- Use TDD vertical slices: add one failing behavior test or benchmark fixture, then minimal implementation, then refactor.
- Accuracy comes before token reduction.
- Every routed or transformed output must remain labeled and recoverable when raw evidence exists.
- Treat external tools as optional comparators. Skipped external comparisons are not failures.
- Keep runtime deterministic by default. Model-assisted paths are benchmark experiments only.
- Review current live code before each slice; this plan is not authority over source truth.

## Likely Files Touched

Core router:

- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/run.ts`
- `plugins/freeflow/router/src/types.ts`
- `plugins/freeflow/router/src/schema.ts`
- `plugins/freeflow/router/src/config.ts`
- possible new files under `plugins/freeflow/router/src/`:
  - `repo-filters.ts`
  - `chunks.ts`
  - `scoring.ts`
  - `benchmarks.ts` or equivalent
  - `parsers/` for command-output parsers
  - `index/` for optional local index experiment

Tests and fixtures:

- `plugins/freeflow/router/tests/retrieve.test.js`
- `plugins/freeflow/router/tests/regression-fixtures.test.js`
- `plugins/freeflow/router/tests/run.test.js`
- `plugins/freeflow/router/tests/config.test.js`
- `plugins/freeflow/router/tests/pi-extension.test.js`
- `plugins/freeflow/evals/fixtures/output-router/`
- possible new benchmark fixtures under `plugins/freeflow/evals/fixtures/output-router/benchmarks/`
- possible new scripts under `plugins/freeflow/evals/scripts/`

Docs/reports:

- `plugins/freeflow/evals/reports/runtime/output-router-regression-*.md`
- `docs/specs/freeflow-output-router-excellence-spec.md` only if implementation reveals a spec/source conflict
- `docs/plans/2026-06-16-freeflow-output-router-excellence-implementation-plan.md` if plan changes materially
- `plugins/freeflow/docs/release-evidence.md` only after verified evidence exists

Adapter/TUI only when needed:

- `plugins/freeflow/pi-extension/index.js`

Package/build only when needed:

- `package.json`
- `.gitignore`

## Slice 0: Baseline Hygiene And Current TUI Smoke

Purpose: avoid stacking excellence work on unverified adapter state from the returned TUI branch.

Steps:

1. Check current working tree and note uncommitted files.
2. Run current checks:
   - `npm run test:router`
   - `node --check plugins/freeflow/pi-extension/index.js`
3. If Pi TUI renderer changes are still in the working tree, sync/reinstall into the installed Pi cache and do a real TUI smoke for:
   - `freeflow_retrieve` collapsed row,
   - `freeflow_retrieve` expanded `ctrl+o`,
   - `freeflow_run` collapsed row,
   - `freeflow_run` expanded `ctrl+o`.
4. Record whether TUI smoke passed or is intentionally deferred.

Checks:

- Existing router tests pass before new accuracy work begins.
- Any TUI branch-specific smoke result is recorded in a runtime report or handoff note.

Stop if:

- Existing tests fail for reasons unrelated to planned accuracy work.
- Installed-cache sync would overwrite unrelated user changes.

## Slice 1: Lock The Broad Retrieval Failure As A Regression

Purpose: make the known `graphify-out` failure impossible to forget.

Red tests / fixtures:

1. Add an isolated fixture-backed test for the exact Sandbox Permissions broad query. The fixture should include:
   - a copied/minimal target markdown file at `docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md`,
   - a `graphify-out/graph.html` generated-artifact decoy with a huge repeated-token line,
   - no spec/plan files that contain the benchmark query text.
2. Expected result:
   - path is `docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md`,
   - returned span is bounded,
   - excerpt includes `SandboxPermissions` and/or the `Plain-language meaning` block after expansion,
   - result does not select `graphify-out/graph.html`.
3. Add a huge-single-line evidence test asserting evidence output is bounded.

Implementation:

- Minimal implementation only if needed to make the red test demonstrably fail first.
- Do not fix scoring in the same edit that creates the initial failing fixture unless the test has already failed.

Checks:

- Targeted isolated-fixture test fails on current behavior before implementation.
- Existing unrelated tests remain runnable.

Stop if:

- The fixture cannot reproduce the current failure. In that case, capture the mismatch and create a smaller deterministic decoy fixture that reproduces the failure mode.

## Slice 2: Generated-Path Filtering And Long-Line Caps

Purpose: prevent generated artifacts and huge lines from flooding evidence.

Implementation:

1. Add default generated/dependency/cache filters for repo traversal or candidate ranking:
   - `.git/**`, `node_modules/**`, `dist/**`, `build/**`, `out/**`, `.next/**`, `.nuxt/**`, `coverage/**`, `target/**`, `graphify-out/**`, `.cache/**`, `.tmp/**`, `tmp/**`, `temp/**`, `logs/**`, minified files, source maps, bundled files, log files, generated HTML/JSON blobs, and files over the about-1 MiB broad-scan cap.
2. Do not skip lockfiles by default.
3. Respect explicit requested paths: if the user retrieves `graphify-out/graph.html` directly, do not silently block it.
4. Add bounded evidence assembly using the settled cap policy:
   - `query` about five lines, 8 KiB excerpt cap, 2 KiB per-line preview cap,
   - `expand lines_30` 32 KiB or 120 lines,
   - `expand lines_80` 64 KiB or 240 lines,
   - explicit line ranges exact under 64 KiB,
   - long lines return bounded previews plus recovery/expansion guidance,
   - huge sections return bounded exact spans or pointers,
   - `preserve: full` over cap still returns exact chunks/pointers, not lossy summary.
5. Wire runtime use of already-supported `outputRouter.generatedPaths` config hints where feasible. Do not change setup-freeflow or activation-contract config behavior in this slice; that remains Slice 12. If config-hint support is deferred, record it as a TODO or skipped/todo test; do not commit a failing test that blocks `npm run test:router`.

Checks:

- Sandbox broad query no longer returns `graphify-out/**`.
- Huge-line fixture cannot create a large evidence excerpt.
- Explicit retrieval of ignored/generated paths still works when requested.
- `npm run test:router`.

Stop if:

- Filtering hides explicitly requested user paths.
- Bounds require a product decision on exact byte/line caps that is not supported by spec or existing config. If this happens, pause and ask for the cap policy.

## Slice 3: Exact Phrase, Multiline, And Repo Line-Range Retrieval

Purpose: make exact/literal lookup reliable before loose scoring.

Implementation:

1. Add exact phrase matching before loose lexical scoring.
2. Add normalized multiline matching for pasted snippets and Markdown heading/body combinations.
3. Boost backticked identifiers and exact technical tokens.
4. Add repo `lineRange` support for `action=retrieve` so repo sources match vault-source exact line retrieval semantics.
5. Ensure exact retrieval can target ignored/generated paths when explicitly requested.

Checks:

- Sandbox query with heading + body text returns the correct file/span.
- Query with backticked `SandboxPermissions` returns the correct file/span.
- Repo `action=retrieve` with `lineRange: { start: 523, end: 546 }` returns exact lines from the Codex pass doc.
- Existing vault line-range tests still pass.
- `npm run test:router`.

Stop if:

- Supporting repo `lineRange` would require a public schema change rather than honoring the existing `lineRange` field.

## Slice 4: Structural Chunking And BM25-Style Scoring

Purpose: make broad retrieval robust beyond the single known failure.

Implementation:

1. Introduce bounded candidate chunks:
   - Markdown heading sections,
   - generic line windows fallback,
   - optional simple code symbol chunks where cheap and deterministic.
2. Add token normalization and stopword filtering.
3. Replace raw term-frequency dominance with BM25-style or BM25-inspired scoring:
   - term-frequency saturation,
   - chunk/document length normalization,
   - heading/symbol boosts,
   - exact identifier boosts,
   - path/type priors,
   - generated/oversized penalties.
4. Return or internally track top-k candidates for `query`/`locate`.
5. Add route explanations that name exact match versus scored match and why candidates were filtered/downranked.

Checks:

- Ambiguous multi-file retrieval fixture returns the expected top candidate and includes reasonable alternates where exposed.
- Repeated-token decoy cannot beat a concise exact/section match.
- `locate` remains bounded and does not inject broad evidence.
- `npm run test:router`.

Review checkpoint:

- Review the scoring explanation before broadening docs or claiming improved accuracy.

Stop if:

- Ranking behavior becomes hard to explain or relies on hidden model judgment.

## Slice 5: Tool Benchmark Harness And Baseline Reports

Purpose: measure accuracy, tokens/bytes, latency, and recovery before deeper optimizations.

Implementation:

1. Add a deterministic benchmark runner for router fixtures.
2. Required internal comparison modes:
   - native baseline proxy (`rg`, `read`, direct command output where appropriate),
   - current Freeflow baseline where feasible,
   - improved Freeflow Router.
3. Metrics:
   - path/span correctness,
   - excerpt completeness,
   - raw/routed bytes and approximate tokens,
   - latency p50/p95 where repeated runs are practical,
   - recovery success,
   - generated false-positive rate.
4. Add report output under `plugins/freeflow/evals/reports/runtime/`.
5. Add a CI-friendly subset that does not require external tools.

Checks:

- Benchmark runner can run locally without Graphify/Claude Context/RTK/Squeez.
- External tools are reported as skipped, not failed.
- Benchmark report records the Sandbox failure as fixed by the improved router.
- `npm run test:router` plus benchmark command.

Stop if:

- Benchmark output becomes a new source of volatile repo inventory instead of stable evidence.

## Slice 6: Command Output Parser Foundation

Purpose: improve `freeflow_run` evidence quality without sacrificing exact recovery.

Implementation:

1. Add a parser interface that returns:
   - parser name,
   - confidence,
   - exact important lines,
   - grouped facts/counts,
   - whether output is exact or lossy/compressed,
   - recovery path.
2. Add first parsers in the settled priority order:
   - test runner summary/failure output first,
   - TypeScript/lint diagnostics second,
   - git status/diffstat third,
   - build/toolchain errors fourth,
   - structured JSON/table summarization later.
3. Keep generic fallback for low-confidence cases.
4. Ensure failed/exactness-sensitive output keeps exact diagnostic lines.

Checks:

- Existing `freeflow_run` tests still pass.
- New parser tests prove exact failure facts are preserved.
- Parser confidence appears in routed output or benchmark metadata without breaking public contract unexpectedly.
- Raw vault recovery remains exact.
- `npm run test:router`.

Stop if:

- Adding parser metadata requires a public response schema change not covered by the existing spec. Ask before changing the contract.

## Slice 7: Command Benchmark Track And Optional RTK/Squeez Comparison

Purpose: compare `freeflow_run` against native output and optional command compressors.

Implementation:

1. Add command-output benchmark fixtures:
   - noisy success,
   - failed command with stack trace,
   - test summary,
   - diagnostics,
   - git output,
   - repetitive log,
   - huge JSON/table output,
   - repeated command output.
2. Measure raw/routed bytes, approximate tokens, latency, exact fact preservation, and recovery.
3. Add optional RTK and Squeez comparison hooks only if installed/configured.
4. Skipped optional tools must be explicit and non-failing.

Checks:

- Command benchmark produces a report without optional tools.
- Recovery succeeds for all Freeflow-routed command fixtures.
- Failed command facts remain exact.

Stop if:

- Optional external comparison introduces install/network assumptions into required tests.

## Slice 8: Optional Local Index Experiment

Purpose: evaluate whether a local index should become optional or default later.

Implementation:

1. Add an experimental index behind an internal benchmark flag or isolated module.
2. No external service.
3. Store cache outside repo by default.
4. Track content hashes and path/line metadata.
5. Support cold, warm, and stale/changed-file modes.
6. Compare scanner versus index on retrieval fixtures.

Checks:

- Scanner remains default.
- Index benchmark reports cold build time, warm query time, stale refresh behavior, accuracy, and context bytes.
- No exact-search regressions versus scanner.
- Generated-artifact false positives stay fixed.

Adoption checkpoint:

- Do not make the index default in this plan unless benchmark evidence meets the spec’s combined threshold and the user explicitly approves adoption.

Stop if:

- Index package choice affects npm package portability, install time, or native dependencies. Ask before adding a risky dependency.

## Slice 9: Session Reuse And Duplicate Output Detection

Purpose: reduce repeated context injection while keeping recovery clear.

Implementation:

1. Add output fingerprints for vault records:
   - exact hash,
   - normalized hash,
   - command/cwd/status fingerprint.
2. Add exact duplicate detection for repeated command/native output.
3. Add fuzzy similarity only after exact duplicate behavior is proven.
4. Return prior `outputId` guidance for duplicate/similar outputs.
5. Decide whether duplicate raw output is vaulted again based on benchmark evidence, not hidden preference.

Checks:

- Repeated output fixture returns a compact duplicate note.
- Exact recovery path remains clear.
- First occurrence remains fully recoverable.
- No exactness-sensitive output is hidden without recovery.

Stop if:

- Duplicate policy would affect auditability or raw evidence retention semantics. Ask before changing vault durability behavior.

## Slice 10: Codex Structured Q&A Macro Benchmark

Purpose: start the flagship macro benchmark with a fast, gradeable stage.

Implementation:

1. Add structured Q&A fixtures derived from `docs/codex-cli-agent-harness/`.
2. First fixture: Sandbox Permissions block.
3. Use existing docs as oracle scaffolding.
4. Prefer upstream Codex source citations when source snapshots are available; otherwise mark source-citation comparison as skipped or unavailable.
5. Compare native retrieval and Freeflow retrieval.
6. Optional Graphify/Claude Context comparison only when configured/fresh enough.

Checks:

- Benchmark catches the original broad-retrieval failure.
- Freeflow improved path passes the Sandbox fixture.
- Report includes tool calls/proxy calls, bytes/tokens, latency, answer correctness, citation/evidence correctness, and skipped external tools.

Stop if:

- Running the benchmark requires network or unavailable upstream source without a skip path.

## Slice 11: One-Pass Artifact Recreation Macro Benchmark

Purpose: measure whether router evidence helps produce durable research artifacts.

Implementation:

1. Choose Pass 3 sandboxing/permissions as the first artifact recreation target.
2. Define grading rubric:
   - factual completeness,
   - source citation quality,
   - structure quality,
   - no source-truth conflict hidden,
   - tool calls,
   - context bytes/tokens,
   - wall-clock time.
3. Run as periodic/manual release evidence, not a normal unit test.
4. Save report under runtime eval reports.

Checks:

- Benchmark can be skipped in fast CI.
- Report does not claim full Pass 0–8 recreation.
- Pareto rule is explicit: no quality regression plus at least one efficiency/traceability improvement.

Stop if:

- Grading would require treating existing research docs as infallible source truth instead of oracle scaffolding.

## Slice 12: Setup And Config Integration

Purpose: integrate output-router setup only after core router behavior, caps, top-k behavior, parser metadata, and benchmark evidence stabilize.

Implementation:

1. Update `setup-freeflow` so it owns optional output-router repo setup/config.
2. Add `plugins/freeflow/skills/setup-freeflow/references/output-router-setup.md` if setup behavior needs durable guidance.
3. Update the setup activation contract so minimal setup still writes only `{ "defaultMode": "workflow" }`, while optional `outputRouter` config is allowed only when explicitly requested.
4. Update setup evals/fixtures that assert config shape.
5. Update Pi extension detection/diagnostics:
   - missing `outputRouter` means built-in defaults, not a warning,
   - present config is reported clearly,
   - invalid values surface warnings,
   - native safety-net routing remains off unless explicitly configured.
6. Update TUI renderers only if response shape changed:
   - `freeflow_retrieve` explicit `topK` should show evidence count and per-packet path/line/window/recovery,
   - `freeflow_run` parser/fidelity/confidence metadata should be visible if added,
   - native safety-net output must be labeled if enabled later.
7. Do not create a separate `setup-output-router` skill unless setup has become a distinct workflow: index bootstrap, vault browser setup, native safety-net host hooks, adapter diagnostics, pruning, or migration.

Checks:

- Minimal setup config remains exactly `defaultMode` unless output-router setup was explicitly requested.
- Optional `outputRouter` config parses through the existing config adapter.
- Setup docs, activation contract, and setup evals agree.
- Pi extension treats absent `outputRouter` as default behavior and present invalid config as warning-worthy.
- TUI smoke is rerun if TUI renderer behavior changed.
- `plugins/freeflow/evals/scripts/check-activation-contract.sh` passes if setup behavior or activation text changed.

Stop if:

- Setup/config work would force unresolved output-router product behavior before benchmarks decide it.
- Enabling native post-tool routing by default becomes tempting; it still requires explicit approval.
- A separate setup skill seems necessary. Ask before creating it.

## Slice 13: Documentation And Adoption Decisions

Purpose: document only verified claims and decide what remains experimental.

Implementation:

1. Update runtime eval reports with final measured evidence.
2. Update `plugins/freeflow/docs/release-evidence.md` only for verified behavior.
3. Update `docs/specs/freeflow-output-router-excellence-spec.md` if implementation reveals spec changes.
4. Update `plugins/freeflow/skills/output-router/SKILL.md` only if agent tool-choice behavior needs to change.
5. Make explicit adoption decisions:
   - scanner improvements shipped,
   - optional index kept experimental/adopted/rejected,
   - model-assisted path not shipped unless separately approved,
   - external tools remain optional.

Checks:

- No docs claim benchmark superiority without report evidence.
- `npm pack --dry-run --json` package contents remain correct.
- Installed-cache/Pi smoke is rerun if Pi adapter behavior changed.

Stop if:

- Documentation would turn an experiment into product behavior without approval.

## Review Checkpoints

Use a reviewer before moving past these points:

1. After Slice 4, review retrieval scoring and evidence-bounding behavior.
2. After Slice 5, review benchmark harness and report format.
3. Before adopting any local index beyond experiment.
4. Before changing public routed result schema.
5. Before setup/config integration changes activation contracts or setup skill behavior.
6. Before final documentation claims.

## Final Verification

Run at minimum:

```sh
npm run test:router
node --check plugins/freeflow/pi-extension/index.js
npm pack --dry-run --json
rg -n "child_process|node:child_process|\bspawn\b|\bexecFile\b|\bexecSync\b" plugins/freeflow/router plugins/freeflow/pi-extension || true
```

Also run:

- router retrieval benchmark subset,
- command-output benchmark subset once added,
- Codex Q&A benchmark subset once added,
- `plugins/freeflow/evals/scripts/check-activation-contract.sh` if setup behavior or activation text changes,
- real Pi smoke if Pi adapter or TUI behavior changes,
- installed-cache `/reload` smoke before claiming installed package behavior.

## Stop Conditions

Stop and ask before:

- making model-assisted routing default,
- requiring external services/vector DB,
- enabling native post-tool routing by default,
- changing public tool names or routed-result response contract,
- replacing native Pi tool semantics,
- treating Graphify, Claude Context, RTK, or Squeez as required dependencies,
- documenting benchmark superiority before measured evidence exists,
- changing vault durability/location semantics,
- hiding generated-artifact access from explicit user retrieval,
- adding a native dependency for SQLite/FTS or similar indexing that could affect package portability,
- creating a separate `setup-output-router` skill instead of extending `setup-freeflow`.

## Completion Criteria

This plan is complete when:

- the known Sandbox Permissions broad-retrieval failure is fixed and locked by tests,
- retrieval evidence is bounded against generated/huge-line floods,
- benchmark harnesses measure retrieval and command-output behavior,
- vault recovery remains verified,
- optional index experiment has evidence and an adoption decision,
- Codex Q&A macro benchmark exists,
- setup/config integration is updated after core router behavior stabilizes or explicitly deferred with evidence,
- docs report only verified behavior,
- final verification commands pass.
