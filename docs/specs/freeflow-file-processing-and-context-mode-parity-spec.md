> **Doc ID:** SPEC-2026-06-26-freeflow-file-processing-context-mode-parity
> **Date:** 2026-06-26
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** Real Context Mode MCP benchmark, Context Mode source inspection, `docs/specs/freeflow-context-saving-native-tools-redesign-spec.md`, and current Freeflow router behavior.

# Freeflow File Processing and Context Mode Parity Spec

## Problem

Freeflow is strong at capturing evidence, preserving recovery metadata, and deterministic repo/vault retrieval. It is weak at the default path Context Mode optimizes for:

```text
large or structured input -> compute only the useful facts -> keep raw bytes out of model context
```

The deeper real benchmark showed that Freeflow can match or beat Context Mode when an agent manually writes summarizer scripts, but Freeflow does not own that path yet. Current Freeflow defaults still return too much raw output, miss computed facts, and do not aggregate batch query answers.

This spec defines the next Freeflow improvement target: a Freeflow-owned, benchmark-backed, safe file/output processing path plus better reducers, search windows, batch query aggregation, and fact-first rendering.

## Intended Outcome

Freeflow should become a best-in-class context-saving layer for command output, local files, docs, logs, JSON/CSV, browser snapshots, MCP tool payloads, and captured vault outputs.

The target behavior:

```text
raw data stays outside model context
-> Freeflow computes/searches/selects the relevant facts
-> model sees a compact fact-first result
-> exact source evidence remains recoverable when policy requires it
```

Freeflow should not compete with Serena/codebase-memory for code intelligence, and it should not make persistent indexing/FTS default without a separate benchmark-backed adoption decision.

## Evidence Summary

### Deep Benchmark Artifacts

Local artifacts from the discovery run:

- Deep report: `/tmp/freeflow-context-mode-deep-1782477250990/deep-context-mode-comparison.md`
- Deep JSON: `/tmp/freeflow-context-mode-deep-1782477250990/deep-context-mode-comparison.json`
- Harness: `/tmp/freeflow-context-mode-deep-benchmark.mjs`
- Context Mode tested: `v1.0.167`, commit `a338a0d26d674b889d9ab231e04302686566ddb9`
- Freeflow tested: commit `c94ff6b5da5214ba0a794e7029221535f47b053d`

These `/tmp` files are not durable source truth. Before implementation, convert the harness and baseline report into repo eval artifacts.

### Benchmark Findings

| Path | Correct | Facts | Raw bytes | Visible bytes | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Context Mode `ctx_execute_file` | 10/10 | 37/37 | 298,691 | 7,980 | 97.33% |
| Freeflow `freeflow_run cat file` default | 3/9 | 25/36 | 298,623 | 158,978 | 46.76% |
| Freeflow with agent-written summarizer scripts | 9/9 | 36/36 | 298,623 | 6,719 | 97.75% |
| Context Mode `ctx_index + ctx_search` | 4/4 | 12/12 | 17,119 | 6,993 | 59.15% |
| Freeflow repo query | 1/4 | 8/12 | 17,119 | 7,570 | 55.78% |
| Context Mode `ctx_batch_execute` | 1/1 | 3/3 | 58,476 | 12,757 | 78.18% |
| Freeflow batch | 0/1 | 2/3 | 58,476 | 2,764 | 95.27% |

Key interpretation:

- Freeflow's core weakness is productized transformation, not raw capability.
- Freeflow can produce excellent compact outputs when code computes facts first.
- That computation is currently ad hoc, host-shell-based, and not a Freeflow-owned safe interface.
- Byte reduction alone is insufficient. The benchmark must assert ground-truth facts.

### Context Mode Source Patterns Worth Learning From

From inspected Context Mode source:

- `ctx_execute_file` reads a file into `FILE_CONTENT`, runs user code over it, and returns only printed output.
- File processing includes a project-boundary guard before reading outside the workspace.
- Intent-driven output above about `5KB` can be indexed/searched instead of dumped.
- Very large output above about `100KB` is auto-indexed with a pointer instead of raw injection.
- Search uses FTS5/BM25 with porter and trigram matching, chunk caps around `4096` bytes, and snippets around matched terms.
- `ctx_batch_execute` runs commands, indexes per-command output, and answers query prompts in the same tool call.
- `trackResponse` measures model-visible bytes and persistent savings.

Use these as design reference points. Do not copy Context Mode source code into Freeflow without a licensing decision; Context Mode is Elastic-2.0 licensed.

## Scope

### In Scope

1. A committed real benchmark harness and baseline report for Freeflow vs real Context Mode.
2. A Freeflow-owned file/output processing path.
3. Built-in deterministic reducers for common output classes.
4. Safer programmable transforms over file/vault/command output.
5. Fact-first model-visible output.
6. Better repo/doc retrieval windows around code examples.
7. Batch query aggregation.
8. Clear recovery semantics for exact, metadata-only, and derived outputs.
9. Docs, skills, and Pi rendering updates for the new behavior.

### Out of Scope

- Replacing Serena or codebase-memory for semantic code intelligence.
- Making persistent FTS/indexing the default search backend without a separate adoption decision.
- Copying Context Mode implementation code.
- Making unsandboxed script execution the repo default, enabling it from minimal setup, or silently falling back to it from sandbox failure.
- Public superiority claims over Context Mode before a durable benchmark supports them.
- Broad observed-routing redesign for external MCP/web/fetch/code-search outputs.
- Changing `freeflow_run` into a security sandbox. `freeflow_run` remains host-command capture unless a separate sandboxed API is used.

## Requirements

### R1. Commit the Benchmark Before Implementation

Create a durable eval under `evals/` that can run the same comparison after each improvement.

The benchmark must:

- run real Context Mode MCP through stdio when available,
- run Freeflow through the committed router APIs,
- use the same fixtures for both systems,
- measure raw bytes, visible bytes, fact correctness, latency, recovery class, and failure clusters,
- assert ground-truth facts, not just context savings,
- keep the current baseline numbers in a committed report,
- produce machine-readable JSON for regression comparisons.

The benchmark must preserve the lesson from Context Mode's upstream vitest example: a compact script can be wrong. Fact assertions must catch that.

### R2. Add a Freeflow-Owned File/Output Processing Surface

Provide a first-class interface for processing existing data without injecting it into model context.

Candidate public surfaces, not yet decided:

- `freeflow_process_file`,
- `freeflow_run.fileTransform`,
- `freeflow_transform` with `source.kind = file|vault|command`,
- `freeflow_search action=transform` with file/vault/repo sources.

Required behavior:

```text
source file/output is loaded outside model context
-> deterministic reducer or sandboxed transform computes result
-> model-visible response is only the computed result plus compact source pointer
-> raw source remains recoverable or has explicit non-recovery semantics
```

Supported source kinds should include:

- repo file path,
- vault output id + stream,
- freshly captured command output,
- later: observed routed outputs when configured.

### R3. Push Script-First Processing Safely by Default

Freeflow should strongly prefer programmable transforms for data-processing work. When the agent asks to understand logs, CSV/JSON, docs, test output, build output, MCP payloads, or other structured/noisy output, the default route should be:

```text
process with reducer or script -> return computed facts -> preserve source lineage
```

Programmable processing must follow this policy:

- sandboxed and read-only by default,
- enabled by default when an approved sandbox adapter is available and has passed required proof checks,
- no ambient repo/home/env/network access in sandboxed mode unless explicitly designed and approved,
- bounded input, output, CPU/time, and memory where possible,
- no silent fallback from sandboxed execution to unsandboxed execution,
- raw script text not persisted by default,
- structured unavailable result when no approved sandbox adapter exists.

If sandbox adapters are unavailable, Freeflow should still provide deterministic built-in reducers and clear next-step guidance. It must not silently run an equivalent host-shell script and call it sandboxed.

### R3b. Support Explicit Local YOLO Script Execution

Freeflow should support an unsafe, unsandboxed script execution policy for local power users, but it must be opt-in and clearly labeled.

Rules:

- YOLO mode is never the repo default in this spec.
- YOLO mode must not be enabled by minimal setup.
- YOLO mode must not be selected automatically because sandboxing is unavailable.
- YOLO mode must be explicit per call, local config, or local environment override.
- YOLO mode results must be labeled unsafe/unsandboxed in model-visible output, structured details, and recovery metadata.
- YOLO mode must never claim sandbox, read-only, network-off, env-hidden, or project-boundary guarantees.
- Repo-shared config must not enable YOLO without a separate owner-approved security/product decision.

Allowed configuration shapes are intentionally open, but acceptable candidates include:

```text
scriptExecution.policy = "sandboxed" | "yolo-local"
FREEFLOW_SCRIPT_EXECUTION_POLICY=yolo-local
```

A local-only config file may be acceptable if it is ignored by git and cannot be mistaken for team policy.

### R4. Add Built-In Reducers for Common Data Shapes

Implement deterministic reducers before relying on scripts.

Initial reducers:

- test output: failed suites/tests, summary counts, first failure blocks,
- TypeScript/lint diagnostics: count by file, count by code/rule, top files, first errors,
- build output: final status, warnings/errors, route/build table summary,
- access logs: status counts, error rate, average/percentile latency, slow examples,
- CSV/JSON tables: row count, grouped counts, topN, max/min numeric fields,
- MCP tools/list: count, categories, signatures,
- browser/accessibility snapshots: counts and top interactive/text nodes,
- git logs: commit counts by type/scope/author and recent matching commits.

Reducers should be explicit, testable modules with fixture-backed assertions.

### R5. Improve `freeflow_run` Routing for Known Output Shapes

`freeflow_run` should stop treating many small-but-structured outputs as near-raw success.

Routing should consider:

- data shape,
- line count,
- byte count,
- parser confidence,
- goal (`test`, `build`, `typecheck`, `diagnosis`, etc.),
- whether a built-in reducer exists,
- exactness-sensitive flags such as `preserve=full`.

Examples from the benchmark that should improve:

- 46KB access logs must not return near-raw by default when goal indicates diagnosis/log analysis.
- 60KB GitHub issues JSON should reduce to relevant issue facts, not near-raw JSON.
- 17KB MCP tool list should return signatures/categories, not the full tool schema dump.
- 12KB git log should return counts/recent relevant commits, not raw history.

### R6. Preserve Exactness and Recovery Semantics

Freeflow must keep its evidence advantage.

Rules:

- `preserve=full` remains exact when within cap.
- Exactness-sensitive outputs keep exact recovery or explicit chunk recovery.
- Metadata-only records never claim raw recovery.
- Derived reducer output should have exact recovery for the derived result and lineage to its source.
- If the source raw bytes are metadata-only, the result must say whether raw source recovery is unavailable, duplicate-linked, or rerunnable.
- Model-visible output should not drown useful facts in recovery prose.

### R7. Make Model-Visible Output Fact-First

The primary text shown to the model should be:

```text
facts first
then source pointer/recovery hint
then optional routing metadata in details.result/TUI
```

Avoid repeating verbose phrases such as:

- “Small successful command output... routed evidence was returned near-raw...”
- long duplicate-output explanations,
- full recovery instructions when `details.result` already has them.

Keep full status, routing, persistence, parser, and recovery data in structured details and TUI expansion.

### R8. Improve Repo/Docs Search Windows

Freeflow repo search should better preserve nearby code examples and all high-value query terms.

Requirements:

- If a prose match introduces a fenced code block, include the code block when under cap.
- If exact query terms are split between heading/prose/code, expand the chunk until all terms are covered or a cap is reached.
- Prefer section-aware Markdown/doc chunks over tiny line windows when the query is documentation-like.
- Preserve generated-path skip behavior for broad search.
- Do not make persistent indexing the default without a separate adoption decision.

Benchmark targets include:

- React `useEffect` cleanup query must include `ignore = true` when that code block is the relevant answer.
- Next.js cache query must include `generateStaticParams`, `revalidate`, and `no-store` when present in relevant docs.
- Tailwind responsive query must include representative responsive classes such as `md:` and `lg:` plus layout class evidence.

### R9. Add Batch Query Aggregation

`freeflow_batch` v1 only runs independent steps and suppresses child output. That saves context but does not answer cross-output questions.

Add a query mode:

```text
steps: run/search/transform...
queries: [question/fact requests]
-> run steps
-> search/transform child outputs
-> return compact answers per query
-> keep child details and recovery in details.result.steps
```

Requirements:

- model-visible result must answer the query facts, not only point to child details,
- child output remains recoverable according to each child policy,
- duplicate child outputs should not hide needed answer facts,
- no mutating/dependent workflow semantics in this slice unless explicitly planned later.

### R10. Separate Host Command Capture From Sandboxed Processing

`freeflow_run` is a host command runner/capture layer. It should not claim sandbox isolation.

New file/output processing APIs that read files directly should include:

- project-root containment for repo file paths,
- symlink escape handling,
- explicit allow/deny semantics if out-of-project reads are ever supported,
- clear error when blocked.

The benchmark should continue to include an outside-file boundary test.

### R11. Keep Context Mode Comparison Honest

Freeflow may learn from Context Mode patterns, but public claims need durable evidence.

Rules:

- Benchmark against real Context Mode when available.
- If Context Mode is unavailable, label any proxy benchmark as proxy-only.
- Do not claim “better than Context Mode” unless the real benchmark passes across correctness, context savings, recovery, safety, and latency dimensions.
- Treat Context Mode's upstream benchmark as input, not authority; run our own fact assertions.

## Proposed Module Shape

### Processing Engine

A deep module owning:

- source loading,
- source size limits,
- reducer selection,
- sandbox adapter selection,
- deterministic transform execution,
- programmable transform execution,
- result persistence,
- lineage and recovery metadata.

Callers should not coordinate these concerns separately.

### Source Loaders

Adapters for:

- repo file source,
- vault output source,
- command-captured source,
- future observed-routed source.

Repo file loaders must enforce containment and symlink policy.

### Reducer Registry

A registry maps detected data shape + goal to reducer candidates.

Each reducer should expose:

- name and version,
- input detection confidence,
- output schema/facts,
- exactness semantics,
- tests and benchmark fixtures.

### Renderer

A fact-first renderer produces compact model-visible text while preserving structured details.

The renderer should be shared by Pi tools so `freeflow_run`, future processing tools, and `freeflow_batch` do not drift.

### Batch Query Orchestrator

A batch query layer should operate over child results and their vault/repo evidence handles, not over model-visible summaries.

## Acceptance Criteria

### Benchmark Acceptance

Before implementation changes:

- commit the deep benchmark harness,
- commit current baseline report,
- verify it can run locally with Context Mode installed,
- provide a skip/degraded mode when Context Mode is unavailable that does not allow public claims.

After implementation:

- file/output processing path reaches at least `9/10` correctness on the `ctx_execute_file` fixture class,
- target context reduction for file/output processing is at least `95%` weighted on the benchmark fixtures,
- built-in reducers pass fixture-specific fact assertions,
- repo/doc search reaches `4/4` correctness on the docs/search fixture class,
- batch query mode reaches `1/1` correctness on the multi-source query fixture,
- outside-file boundary test passes for the new file-processing API,
- no exactness-sensitive recovery regression in existing router tests,
- metadata-only records do not claim raw recovery,
- `npm run test:router` remains passing.

### Product Acceptance

A future agent should be able to answer:

- “run this noisy command and tell me the important result,”
- “summarize this large log,”
- “summarize this CSV/JSON,”
- “search this doc and give me the exact code example,”
- “run these commands and answer these questions,”

without putting raw files/logs/tool payloads into model context and without writing ad hoc unsandboxed scripts.

## Decisions Made

- Real Context Mode comparison is required for claims; proxy benchmarks are not enough.
- Freeflow should productize the transformation path that currently requires agent-written scripts.
- Built-in deterministic reducers should come before programmable scripts where possible.
- Programmable processing should be pushed as the preferred route for data understanding, but sandboxed/read-only remains the default when an approved sandbox adapter is available.
- Unsafe YOLO script execution is useful for local power users, but it is explicit opt-in only and must not become the repo default in this spec.
- There must be no silent fallback from sandboxed scripts to unsandboxed scripts.
- Persistent indexing/FTS should not become the default search backend without a separate adoption decision.
- Freeflow should learn from Context Mode behavior patterns but not copy Elastic-2.0 source code without a licensing decision.
- `freeflow_run` remains host-command capture, not a sandbox.

## Open Decisions

1. Public surface name:
   - `freeflow_process_file`,
   - `freeflow_run.fileTransform`,
   - `freeflow_transform`,
   - or `freeflow_search action=transform` with file sources.
2. Whether reducers should be automatically selected by `freeflow_run` or require explicit `goal`/`reducer` hints.
3. How much recovery metadata should remain visible by default versus only in `details.result` and TUI.
4. Exact public config/API shape for local YOLO mode.
5. Whether local YOLO mode should be exposed only through environment/local config or also through per-call tool parameters.
6. Whether to add an optional persistent index mode for docs/search after the current benchmark gap is fixed without indexing.
7. Whether out-of-project file processing should ever be allowed, and if so, what approval/config model owns it.
8. Whether Context Mode should remain a dev/eval dependency only or become an optional comparison package in CI.

## Risks

- A compact transform can be wrong. Ground-truth fact assertions are mandatory.
- Reducer auto-selection can hide details that the user needed verbatim. `preserve=full` and explicit retrieval must remain reliable.
- Adding a public processing API before naming is settled can create compatibility churn.
- Sandbox availability varies by host/platform. Reducers must provide useful coverage even when script adapters are unavailable.
- YOLO mode can leak files, environment variables, network data, or secrets if misused. It must be unmistakably unsafe, local, and opt-in.
- Over-adopting Context Mode patterns could blur Freeflow's scope. Freeflow should stay focused on recoverable evidence and agent workflow compatibility.

## Verification Plan

Minimum verification for this work:

```sh
npm run build:router
npm run test:router
npm run bench:router:context-mode-real-deep   # proposed script name
```

The final benchmark report should compare:

- baseline Freeflow commit `c94ff6b5da5214ba0a794e7029221535f47b053d`,
- improved Freeflow commit,
- real Context Mode commit/version when available.

## Next Route

Write an implementation plan that starts with committing the benchmark harness/report, then implements the smallest vertical slice:

```text
file/output processing engine
+ one reducer family, preferably access logs or test output
+ fact-first renderer
+ benchmark delta
```
