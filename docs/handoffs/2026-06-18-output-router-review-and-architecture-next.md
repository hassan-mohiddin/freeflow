# Project Handoff

Date: 2026-06-18

## Purpose

Durable memory before compaction. This captures the current Output Router Slice 0-9 review/fix state and the intended next route: pause code changes, then run an `improve-codebase-architecture` research pass for a bigger design perspective before more fixes.

This handoff is memory, not authority. Reopen the linked files and rerun relevant checks before making consequential claims or commits. Live repo evidence overrides this note.

## Stable Context

Recent work reviewed uncommitted router changes on top of commit `9a738a2 Improve output router evidence routing`.

The router work is directionally strong and many accepted review findings were fixed with tests, but final review still found contract-level blockers. Do not commit the current diff yet.

Current modified areas are mostly:

- `plugins/freeflow/router/src/retrieve.ts` and `dist/retrieve.*`
- `plugins/freeflow/router/src/experimental-local-index.ts` and `dist/experimental-local-index.*`
- `plugins/freeflow/router/src/parsers.ts` and `dist/parsers.js`
- `plugins/freeflow/router/src/vault.ts` and `dist/vault.js`
- `plugins/freeflow/pi-extension/index.js`
- router tests under `plugins/freeflow/router/tests/`
- `plugins/freeflow/evals/reports/runtime/output-router-codex-large-index-sqlite-adhoc-report.md`

Important: subagent review output files were generated and removed (`final-review-code.md`, `final-review-verification.md`, earlier `review-*`). There should be no intended untracked review artifacts.

## Decisions Made

- Do not commit until final-review blockers are resolved.
- Treat the remaining issues as design/model problems, not isolated edge cases.
- Next pass should use the architecture/deep-module vocabulary: **module**, **interface**, **seam**, **adapter**, **depth**, **leverage**, **locality**.
- The next work should start with architecture research, not immediate patching.
- The core direction is to deepen router modules around stable invariants:
  - evidence range selection,
  - exact line range resolution,
  - repo traversal/generated-path policy,
  - vault session index storage,
  - benchmark observation semantics,
  - durable report/evidence policy.

## Live Evidence

Primary source truth:

- `docs/plans/2026-06-16-freeflow-output-router-excellence-implementation-plan.md` — Slices 0-9 and final verification expectations.
- `docs/specs/freeflow-output-router-design.md` — router core principles: explicit routed tools, raw capture first, exact recovery, no surprise semantics.
- `docs/specs/freeflow-output-router-excellence-spec.md` — accuracy-first success model and benchmark expectations.
- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/output-router/references/safety-policy.md`

Latest observed green checks after fixes:

- `npm run test:router` passed `125/125`.
- `npm run bench:router` passed `7/7`.
- `npm run bench:router:commands` passed `8/8` but final review found the harness may be measuring duplicate notes instead of parser behavior.
- `npm run bench:router:index` passed `3/3`.
- Large Codex scanner benchmark command: `node /tmp/freeflow-codex-large-benchmark/bench-scanner-sqlite.mjs` observed scanner `6/8`, p50 about `5,473 ms`, p95 about `8,611 ms`, avg context bytes `2,082`.
- `node --check plugins/freeflow/pi-extension/index.js` passed.
- `npm pack --dry-run --json` showed router dist included, `graphify-out` and router `src` excluded.
- Shell API scan found no `child_process|node:child_process|spawn|execFile|execSync` matches in router/Pi extension.
- `git diff --check` passed.

Current final-review blockers to verify/fix before commit:

1. `retrieve.ts` exact-phrase route can still omit the exact phrase line when an earlier high-frequency line wins `bestLineIndexInChunk()`.
2. Repo/vault exact `lineRange` still silently clamps when `end > lineCount`; start-past-EOF was fixed, end-past-EOF remains.
3. Configured `outputRouter.generatedPaths` can hide an explicitly requested directory (`source.path: "custom-generated"` with `custom-generated/**`), even though explicit file access works.
4. `command-benchmarks.ts` default iterations can turn parser fixtures into duplicate-output observations and still pass, so it does not prove parser/failure-evidence behavior.
5. Standard benchmark reports are not fully aligned with current benchmark output; refresh after benchmark harness semantics are fixed.

Additional screenshot/review findings from another agent, judged actionable:

- `vault.ts` same-process lock fixes only same-process concurrency; separate Node processes can still race on the same file-backed session index. Treat as a deeper `VaultSessionIndexStore` design issue.
- `generatedPathGlobs` simple glob handling likely mishandles non-terminal `**`, e.g. `custom-generated/**/*.md`.
- The Codex report now mentions `/tmp` evidence for accuracy/speed; consider making durable evidence stronger if the report is used for release claims.

Process gaps:

- Real installed-cache/TUI smoke for current Pi adapter/TUI behavior has not been run.
- Slice 0 cannot be honestly claimed fully complete without that smoke if current Pi adapter/rendering behavior is part of the claim.

## Next Focus

First action after compaction: run an `improve-codebase-architecture` research pass before further implementation.

Suggested framing for that research:

1. Inspect `CONTEXT.md`, router specs, plan Slices 0-9, and current router modules.
2. Identify deepening candidates using the Matt architecture vocabulary.
3. Focus on where complexity and invariants are currently spread across shallow modules.
4. Produce a concise design recommendation before fixing code.

Likely deepening candidates:

### 1. EvidenceRangeSelector

Files: `plugins/freeflow/router/src/retrieve.ts`, tests in `regression-fixtures.test.js` and `retrieve.test.js`.

Interface should hide:

- exact phrase line/span selection,
- coverage range selection,
- best-line fallback,
- context caps.

Invariant: if the route/reason says exact phrase matched, returned evidence includes that phrase or errors truthfully.

### 2. ExactLineRangeResolver

Files: `retrieve.ts`, maybe `vault.ts` exported line helpers.

Interface should take requested range + line count and return either exact validated range or structured error. No caller should decide clamping.

Invariant: explicit exact `lineRange` returns exactly requested lines or errors. No silent start/end clamping.

### 3. RepoTraversalPolicy

Files: `retrieve.ts`, `experimental-local-index.ts`, Pi config forwarding.

Interface should own:

- built-in generated/dependency/media skips,
- configured generated globs,
- explicit file and explicit directory overrides,
- broken symlink/read-failure skip behavior,
- simple glob semantics.

Invariant: broad traversal skips decoys; explicit requested files/directories remain accessible.

### 4. VaultSessionIndexStore

Files: `vault.ts`, tests in `vault.test.js`.

Current same-process lock is not enough for multi-process use. Need a deeper file-backed session index store with atomic/additive semantics. Options to research:

- lockfile with exclusive create/retry,
- atomic read-merge-write with temp file + rename under lock,
- append-only event log plus materialized index.

Invariant: concurrent writes from same or separate processes do not lose records.

### 5. CommandBenchmarkObservation model

Files: `command-benchmarks.ts`, `command-benchmarks.test.js`, command benchmark report.

Need to separate parser behavior from duplicate-output behavior.

Possible invariant: parser/fact-preservation fixtures score the first non-duplicate observation; duplicate-output has its own dedicated fixture.

### 6. DurableReportEvidence policy

Files: runtime eval reports under `plugins/freeflow/evals/reports/runtime/`.

Decide how current evidence vs historical evidence is recorded. Avoid making durable claims with only `/tmp` pointers unless the report clearly says it is ad hoc/historical.

## Stop Conditions

Stop and ask before:

- changing public routed-result schema,
- changing explicit generated-path access semantics,
- changing vault durability/location/retention semantics beyond bug fixes,
- adopting SQLite/FTS or any native dependency,
- making experimental index default,
- documenting benchmark superiority beyond verified evidence,
- enabling native post-tool routing by default.

If live docs/spec/tests conflict with this handoff, treat it as a source-of-truth conflict and ask before editing.

## Superseded Or Deferred Work

Superseded as fixed in current diff, but re-verify before relying on them:

- same-process vault session index race,
- start-past-EOF lineRange clamping,
- huge one-line head-only exact recovery,
- generic failed command late diagnostics,
- Markdown frontmatter/preamble search,
- non-finite index `topK`,
- broad broken-symlink traversal failure,
- generated path hints broad skip + explicit file access,
- preserve-full duplicate policy documented as exact-output-over-compaction.

Deferred/not complete:

- exact phrase deep invariant under adversarial repeated-token sections,
- end-past-EOF exact lineRange validation,
- explicit configured generated directory access,
- non-terminal `**` generated glob semantics,
- cross-process vault index safety,
- command benchmark observation semantics,
- standard report refresh after benchmark harness fix,
- real Pi installed-cache/TUI smoke.
