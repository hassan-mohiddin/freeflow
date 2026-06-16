> **Doc ID:** SPEC-2026-06-16-freeflow-output-router-excellence
> **Date:** 2026-06-16
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** Output-router implementation handoff, 2026-06-16 router benchmarking/grilling session, current `freeflow-output-router-design`, reference-plugin research for Graphify, Claude Context, RTK, and Squeez.

# Freeflow Output Router Excellence Spec

## Purpose

Define the next-stage quality direction for Freeflow Router after the first output-router implementation.

This spec complements, and does not replace, `docs/specs/freeflow-output-router-design.md`.

- Existing design spec: foundational tool, vault, adapter, safety, and config contract.
- This excellence spec: accuracy-first retrieval, measured command-output efficiency, benchmark discipline, optional index evaluation, and reference-plugin idea bank.

The goal is not to make Freeflow Router bigger for its own sake. The goal is to make `freeflow_retrieve` and `freeflow_run` reliably better than native-only workflows for the work they claim to help with.

## Problem

The first router implementation proves the core shape:

- explicit `freeflow_retrieve` and `freeflow_run` tools,
- raw-output capture before transformation,
- session-linked vault recovery,
- Pi adapter integration,
- optional native `read`/`bash` safety net,
- output-router skill and runtime safety policy,
- compact/expanded Pi TUI rendering.

However, the first broad-retrieval accuracy test found a serious failure:

```text
query: find the Sandbox Permissions block in docs/codex-cli-agent-harness
expected: docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:523-546
actual:   graphify-out/graph.html:67-71
```

Root cause: current repo retrieval uses simple line-level term-frequency scoring. A generated `graphify-out/graph.html` line containing a large `RAW_NODES` blob won because repeated common tokens outscored the exact source-document match.

Measured bad effects from that failure:

- wrong path,
- generated artifact selected over source docs,
- huge 319KB evidence excerpt,
- Pi subprocess JSONL output around 6.8MB / ~110K tokens,
- worse than native `rg` for the same task.

This means the next work must not be framed as cosmetic optimization. It must be accuracy-first product hardening.

## Intended Outcome

Freeflow Router should become a measured evidence router:

```text
smallest sufficient evidence in context
+ exact raw recovery outside context
+ explicit routing decisions
+ no surprise native semantics
+ benchmarked accuracy, speed, efficiency, and recoverability
```

The router should be better than native-only workflows when:

- broad search would otherwise require many reads,
- command output is large/noisy,
- exact raw evidence must remain recoverable,
- repeated outputs would waste context,
- the agent needs an evidence trail rather than a blob.

It does not need to beat every specialist tool on every dimension. RTK/Squeez may beat Freeflow on raw command compression. Claude Context may beat Freeflow on semantic code search. Graphify may beat Freeflow on graph/path/community questions. Freeflow should win on the combined product metric:

```text
accuracy × bounded context × exact recoverability × low surprise × portability
```

## Scope

In scope:

- Improve `freeflow_retrieve` accuracy and context bounding.
- Improve `freeflow_run` compression/extraction while preserving exact recovery.
- Add benchmark harnesses for before/after comparison.
- Add a staged Codex CLI agent-harness macro benchmark.
- Build and evaluate an optional no-dependency local index first, with SQLite/FTS considered only after benchmark evidence.
- Add deterministic command parsers where they improve evidence quality.
- Add session-output dedup/reuse where it saves context without hiding evidence.
- Use Graphify, Claude Context, RTK, and Squeez as references and optional benchmark comparators.

Out of scope:

- Replacing native Pi tools.
- Enabling native post-tool routing by default.
- Requiring Graphify, Claude Context, RTK, or Squeez.
- Requiring external services or a vector DB by default.
- Making model-assisted routing/summarization default.
- Turning this into the skill/capability router spec.
- Optimizing compression at the expense of correctness.
- Storing raw output in the repo by default.

## Source Context

Relevant Freeflow artifacts:

- `docs/specs/freeflow-output-router-design.md`
- `docs/specs/freeflow-capability-and-output-routing-spec.md`
- `docs/plans/2026-06-16-freeflow-output-router-implementation-plan.md`
- `docs/handoffs/2026-06-16-output-router-implementation-and-retrieval-benchmark.md`
- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/output-router/references/safety-policy.md`
- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/run.ts`
- `plugins/freeflow/router/src/vault.ts`
- `plugins/freeflow/router/tests/`
- `plugins/freeflow/evals/fixtures/output-router/`
- `plugins/freeflow/evals/reports/runtime/output-router-regression-1-report.md`

Reference tools researched:

- Graphify skill and local `graphify-out/` artifacts.
- Claude Context (`zilliztech/claude-context`): MCP semantic/hybrid code search, AST chunking, incremental indexing, evaluation framework.
- RTK (`rtk-ai/rtk`): Rust command proxy, command-specific compression, tee recovery, tracking.
- Squeez (`claudioemmanuel/squeez`): hook-based token optimizer, cross-call dedup, adaptive intensity, benchmark suite, MCP/session economy.

## Decisions Made

1. Scope is **Output Router Excellence**, not Router Platform.
2. Primary success metric is **accuracy-first**. Efficiency/speed/recoverability are secondary gates.
3. Benchmarks require internal before/after comparison. External comparisons are optional and skipped when tools are unavailable.
4. `freeflow_run` compression is **adaptive**: conservative by default, more aggressive for successful/noisy/low-risk output, exact for failed/exactness-sensitive output.
5. Retrieval stays dependency-light by default. Optional index work starts with a no-dependency local index experiment; SQLite/FTS may be evaluated later only if evidence justifies it.
6. Optional index adoption requires a combined threshold: no exact-search regression, generated-artifact false positives fixed, better warm broad-query latency, bounded context, measured cold-start/index cost, no external service.
7. Benchmarks are staged: deterministic tool benchmarks for every relevant change, periodic agent-task evals for release evidence.
8. The Codex CLI agent-harness study becomes the flagship macro benchmark.
9. Codex benchmark grading uses existing research docs for expected concepts and upstream source citations as stronger truth when available.
10. Codex macro external comparison includes retrieval tools only: native, Freeflow, Graphify, Claude Context. RTK/Squeez belong in command-output/session-efficiency tracks.
11. Codex macro success is Pareto improvement: no quality regression, plus improvement in tokens, tools, time, or evidence traceability.
12. Numeric targets should be calibrated after baseline measurement. Hard targets now: no known accuracy regressions, bounded context, exact recovery preserved.
13. Runtime remains deterministic by default. Model-assisted summarization/reranking may be measured experimentally; if significantly better, it can later become a labeled config toggle.
14. Include a detailed reference-plugin idea bank, but keep the design centered on Freeflow’s evidence-router identity.
15. This companion spec lives at `docs/specs/freeflow-output-router-excellence-spec.md` and complements the existing router design.
16. Spec includes high-level phases; the implementation plan owns exact slices.
17. Evidence caps use accuracy-first bounded defaults: `query` top-1 evidence with an 8 KiB excerpt cap and 2 KiB per-line preview cap, `expand lines_30` capped at 32 KiB or 120 lines, `expand lines_80` capped at 64 KiB or 240 lines, explicit line ranges exact under 64 KiB, and `preserve: full` retains the existing 64 KiB cap.
18. Broad retrieval skips generated/dependency/cache paths by default, including `graphify-out/**`, but explicit path retrieval remains allowed.
19. `query` remains top-1 by default, with an explicit `topK` parameter available when requested; `locate` is the default top-k discovery action.
20. Command parser priority is test runner output, TypeScript/lint diagnostics, git status/diffstat, build/toolchain errors, then structured JSON/table summarization.
21. Optional index work starts with a no-dependency local index experiment. SQLite/FTS or native dependencies require benchmark evidence and explicit approval.
22. Cold-index times are calibration targets, not release gates: small repos under 2s, medium under 15s, large under 60s.
23. Release gates are hard only where current evidence supports them; token/time percentage gates wait for baseline data.
24. Model-assisted paths stay experiment-only unless they show at least a 10 percentage-point accuracy gain on ambiguous/broad retrieval fixtures or clear macro-benchmark quality improvement with no deterministic equivalent.
25. Output-router setup/config integration belongs late in the work after core router behavior stabilizes. `setup-freeflow` owns optional repo config setup; `output-router` remains the usage/runtime skill; no separate `setup-output-router` skill is needed yet.

## Current Baseline Capabilities

### `freeflow_retrieve`

Current strengths:

- Queries local repo files and vault records.
- Returns evidence packets rather than answers.
- Supports `query`, `locate`, `retrieve`, `expand`, and `explain`.
- Can retrieve explicit vault line ranges and bounded initial repo spans.
- Can expand prior evidence to wider context.
- Can query vaulted command/native output by `outputId`.

Current weaknesses:

- Repo `retrieve` does not yet honor arbitrary `lineRange`; explicit line-span retrieval is currently reliable for vault sources and should be added for repo sources.
- Broad repo search is simple lexical line scoring.
- Generated paths are not excluded broadly enough.
- Long lines can become huge evidence excerpts.
- Exact phrase/multiline matches are not prioritized enough.
- It returns one best candidate instead of a ranked candidate set.
- It lacks section/symbol chunking.
- It lacks a persistent index or incremental change detection.

### `freeflow_run`

Current strengths:

- Uses adapter-provided host runner; Pi uses `pi.exec`.
- Captures raw stdout/stderr/combined before routing.
- Stores output in the session-linked vault.
- Returns `outputId` and exact recovery instructions.
- Separates `toolStatus`, `execution.status`, and `routing.status`.
- Preserves failure evidence lines.
- Routes large successful output to compact important lines.

Current weaknesses:

- Important-line selection is generic.
- It lacks command-specific parsers for test/build/lint/git outputs.
- It lacks cross-call dedup/reuse.
- It lacks structured compression for JSON/table/diff output.
- It lacks benchmarked parser confidence and fallback behavior.

### Vault

Current strengths:

- Raw output is recoverable from `~/.cache/freeflow-router/vault`.
- Command output stores `stdout.txt`, `stderr.txt`, `combined.txt`, and `meta.json`.
- Manual vault check confirmed exact recovery and query retrieval.

Current gaps:

- Retention pruning is deferred.
- There is no user-visible vault browser/index command yet.
- There is no benchmark report for long sessions with many outputs.

### Pi Adapter / TUI

Current strengths:

- Registers `freeflow_retrieve` and `freeflow_run`.
- Loads `output-router` skill and safety policy with runtime context.
- Keeps native tools direct by default.
- Supports optional native safety-net routing through config.
- Has compact/expanded TUI renderers for routed tools in the current branch work.

Current gap:

- Core installed-cache/package-discovery smoke passed after `/reload` before the TUI renderer branch. Installed-cache sync and real TUI smoke for the latest compact/expanded renderer behavior still need completion.

## Success Model

### Primary Success: Accuracy

Accuracy is non-negotiable. A smaller wrong answer is worse than native output.

Required accuracy properties:

- Exact text queries prefer exact matches over loose token frequency.
- Generated artifacts do not outrank source truth.
- Returned paths and line ranges are correct enough for verification.
- Evidence excerpts include the needed answer, or make expansion obvious.
- Failure/verification evidence remains exact.

### Secondary Success: Efficiency

Efficiency is measured only after correctness.

Efficiency metrics:

- context bytes/tokens injected,
- reduction versus native `read`/`bash`/`rg`,
- repeated-output reuse,
- fewer tool calls for same task,
- less wall-clock time for equivalent quality.

### Safety And Recoverability

Safety/recoverability properties:

- Raw command/native output captured before transformation.
- Every transformed native result is labeled.
- `outputId` recovery works without rerunning commands.
- `preserve: full` means exact fidelity, not unlimited context injection.
- Small and exactness-sensitive outputs are not silently compressed.

### Pareto Rule For Macro Benchmarks

For research-style tasks, Freeflow wins only if:

- quality does not regress, and
- at least one of tokens, tool calls, wall-clock time, or evidence traceability improves.

## Capability Taxonomy

### 1. Locate

Find likely places without injecting broad content.

Examples:

- path-only candidates,
- heading-only candidates,
- symbol candidates,
- ranked top-k locations,
- why each candidate matched.

### 2. Retrieve

Return exact bounded evidence.

Examples:

- explicit path/span,
- heading section,
- function/class chunk,
- failure block,
- diff hunk,
- JSON path slice.

### 3. Expand

Widen evidence only when needed.

Examples:

- exact span → ±30 lines,
- ±30 → ±80 lines,
- line span → section,
- command failure line → full failure block,
- vault query result → exact raw line range.

### 4. Compress / Extract

Reduce large output while preserving task-critical facts.

Examples:

- failing tests only,
- grouped type/lint errors,
- git status summary,
- diff hunk summary,
- deduped repeated log lines,
- JSON schema/table view.

### 5. Vault / Recover

Store exact raw evidence outside context and recover it by pointer.

Examples:

- command stdout/stderr/combined,
- native safety-net raw output,
- future MCP/fetch/custom-tool output,
- exact line range recovery.

### 6. Explain

Explain why routing chose a path, evidence span, parser, compression mode, or pass-through.

Examples:

- why a candidate won,
- why full read was refused or allowed,
- why command output was partial,
- why exact preservation overrode compression,
- why fallback was used.

### 7. Reuse

Avoid injecting output already seen in the session.

Examples:

- exact duplicate output note,
- fuzzy duplicate output note,
- previous `outputId` reference,
- unchanged command output reuse,
- repeated skill/reference injection dedup in future host contexts.

### 8. Benchmark

Measure the router as a product, not as a claim.

Examples:

- fixture benchmarks,
- agent-task evals,
- external optional comparisons,
- before/after regression reports,
- native baseline comparisons.

## Reference-Plugin Idea Bank

Reference plugins are evidence sources and idea mines. They are not source-of-truth requirements.

### RTK

RTK’s useful ideas:

- Command-specific compactors for common commands.
- Strong parser coverage across git, tests, build, lint, package managers, cloud/container commands, and filesystem commands.
- Failure-focused output for test/build commands.
- Tee/raw-output recovery for failures.
- Local token-savings tracking and `gain`-style analytics.
- Fast Rust hot-path performance and low overhead.
- Fallback/pass-through behavior for unrecognized commands.

Adapt for Freeflow:

- Add command-specific deterministic parsers inside `freeflow_run` or parser modules.
- Track raw bytes, routed bytes, approximate tokens, duration, parser used, and recovery path.
- Add command-output benchmark fixtures inspired by RTK categories.
- Preserve exit code and exact failure facts as hard parser requirements.

Do not copy directly:

- Do not make transparent bash rewrite the default Freeflow path.
- Do not hide native semantics behind automatic command replacement.
- Do not optimize for compression percentage alone.

Freeflow improvement over RTK should be:

- stronger exact raw recovery through `outputId`,
- clearer evidence packets,
- no surprise native behavior by default,
- accuracy/recoverability metrics alongside token savings.

### Squeez

Squeez’s useful ideas:

- Cross-call redundancy detection.
- Exact-hash and fuzzy similarity dedup across recent outputs.
- Adaptive intensity based on context pressure.
- Summarize fallback for huge outputs.
- Tool-result size budgets.
- Session efficiency scoring.
- Benchmark suite with fixtures, token estimates, and latency.
- TOON-like structured compression for JSON arrays.
- MCP/session-memory tools for querying prior summaries and recent calls.

Adapt for Freeflow:

- Add session-level output fingerprinting for vault records and native safety-net records.
- Add exact duplicate and fuzzy near-duplicate notes that point to prior `outputId`.
- Add adaptive routing intensity, but only inside explicit Freeflow tools or explicitly enabled safety net.
- Add structured JSON/table encoders when they are exact enough or clearly lossy/labeled.
- Add session-efficiency benchmark metrics.

Do not copy directly:

- Do not inject a terse persona as part of output routing.
- Do not make hook-based rewriting the core product behavior.
- Do not summarize exactness-sensitive output just because context pressure is high.

Freeflow improvement over Squeez should be:

- less intrusive default behavior,
- exact recovery by design,
- evidence-first retrieval rather than broad compression-only optimization,
- clearer separation between product runtime and benchmark experiments.

### Claude Context

Claude Context’s useful ideas:

- Hybrid retrieval: BM25 + dense vector search.
- AST-aware chunking with fallback splitting.
- Incremental indexing using content hashes / Merkle-style change detection.
- Ignore patterns for generated, dependency, cache, log, and hidden files.
- MCP tools for `index_codebase`, `search_code`, `clear_index`, and `get_indexing_status`.
- Evaluation comparing grep-only baseline with enhanced retrieval across SWE-bench-derived tasks.
- Metrics including token usage, tool calls, precision, recall, and F1.

Adapt for Freeflow:

- Implement deterministic exact/BM25/FTS-style retrieval before optional semantic search.
- Add section/symbol chunking and bounded chunk scoring.
- Add robust default ignore patterns and repo-configurable generated path hints.
- Build an optional local index and measure cold/warm performance.
- Reuse the evaluation style: native baseline versus enhanced retrieval with quality and cost metrics.

Do not copy directly:

- Do not require embeddings, OpenAI/Voyage/Gemini keys, Milvus, or Zilliz Cloud by default.
- Do not make “entire codebase as context” a slogan if evidence packets remain the Freeflow contract.
- Do not introduce semantic search before deterministic failures are fixed and benchmarked.

Freeflow improvement over Claude Context should be:

- zero external service required by default,
- stronger exact-literal behavior for identifiers and copied text blocks,
- command-output vaulting/recovery, which Claude Context does not target,
- optional ability to use Claude Context later as a backend rather than a dependency.

### Graphify

Graphify’s useful ideas:

- Persistent graph of project concepts, files, communities, and relationships.
- Query/path/explain operations over architecture-level relationships.
- Community detection to surface cross-document connections.
- Audit trail distinguishing extracted, inferred, and ambiguous edges.
- Graph report that helps orient future agents.

Adapt for Freeflow:

- Treat graph/path/community queries as a future optional source backend.
- Use Graphify as an external comparator for architecture and relationship questions.
- Learn from its audit-trail language for evidence confidence.
- Exclude `graphify-out/**` from normal repo retrieval by default.

Do not copy directly:

- Do not require graph builds for normal router use.
- Do not inject generated graph artifacts into normal source-document search.
- Do not rely on a stale graph as source truth without freshness checks.

Freeflow improvement over Graphify should be:

- fast exact/live repo evidence for current files,
- command-output routing and recovery,
- less build/setup cost for simple lookup tasks,
- optional graph use only when graph questions justify it.

## Retrieval Design Direction

### Pipeline

`freeflow_retrieve` should move from single-pass line scoring to a staged retrieval pipeline:

```text
1. source inventory and filters
2. exact phrase / multiline matching
3. structural chunking
4. lexical/BM25-style scoring
5. candidate reranking and path/type priors
6. bounded evidence assembly
7. route explanation and recovery hints
```

### Source Inventory And Filters

Default repo retrieval should skip or strongly downrank:

- `.git/**`
- `node_modules/**`
- `dist/**`
- `build/**`
- `out/**`
- `.next/**`
- `.nuxt/**`
- `coverage/**`
- `target/**`
- `graphify-out/**`
- `.cache/**`
- `.tmp/**`
- `tmp/**`
- `temp/**`
- `logs/**`
- minified files such as `*.min.js` and `*.min.css`,
- source maps such as `*.map`,
- bundled files such as `*.bundle.*`,
- log files such as `*.log`,
- generated HTML/JSON blobs,
- files over a broad-scan cap of about 1 MiB unless explicitly requested.

Do not skip lockfiles by default. They can be source truth for dependency and debugging questions; downrank them later only if benchmark evidence shows recurring noise.

Repo config may add `outputRouter.generatedPaths` hints.

Filtering must be explainable. If a user explicitly requests an ignored path, exact retrieval should still be possible.

### Exact Match First

When a query contains distinctive exact text, headings, identifiers, or copied snippets, exact matching should run before loose scoring.

Examples:

- Markdown heading + nearby body text.
- Backticked identifier.
- Error message string.
- Function name.
- Multi-line pasted block.

Exact match should support normalized whitespace where useful, but must not invent matches.

### Structural Chunking

Candidate chunks should be bounded units, not arbitrary huge lines.

Initial chunk types:

- Markdown sections by heading.
- Code symbols/functions/classes where cheap parsing is available.
- Test failure blocks.
- Diff hunks.
- JSON top-level keys/array slices where parseable.
- Generic line windows as fallback.

A chunk should carry:

- path,
- start/end lines,
- chunk kind,
- title/symbol when known,
- byte/line size,
- score components.

### BM25 / FTS-Style Lexical Scoring

Loose retrieval should use scoring that prevents keyword-stuffed or huge generated files from winning.

Required scoring properties:

- stopword removal,
- token normalization,
- term-frequency saturation,
- chunk/document length normalization,
- path/type priors,
- heading/symbol boosts,
- exact identifier boosts,
- penalties for generated/oversized/minified artifacts.

This can be implemented in TypeScript first. A no-dependency local index should be evaluated before any SQLite/FTS backend.

### Bounded Evidence Assembly

Evidence excerpts must have hard caps.

Initial cap policy:

- `query` returns one best evidence packet by default, about five lines around the match.
- `query` uses an 8 KiB excerpt cap and a 2 KiB per-line preview cap.
- `locate` injects metadata/previews only; top-k candidate output stays bounded.
- `expand lines_30` uses a 32 KiB or 120-line cap, whichever comes first.
- `expand lines_80` uses a 64 KiB or 240-line cap, whichever comes first.
- Explicit `retrieve lineRange` returns exact content when the requested span is at or under 64 KiB.
- Explicit line-range retrieval over 64 KiB returns exact bounded chunks and recovery guidance, not a lossy summary.
- `preserve: full` keeps the existing 64 KiB full-context cap; over cap returns exact chunks/pointers and recovery guidance.

Rules:

- Never inject a 200KB single line as evidence.
- If a line is too long, return a bounded preview plus exact recovery instructions.
- If a section is too large, return the best exact span and an expansion path.
- Any cap-triggered truncation must be labeled and recoverable or expandable where possible.
- `preserve: full` over cap returns exact chunks/pointers, not lossy summary.

### Ranked Candidates

`query` and `locate` should be able to return top-k candidates, but their defaults differ.

Defaults:

- `query` returns top 1 by default.
- `query` may accept an explicit `topK` parameter when the user wants multiple evidence packets; default `topK` is 1 and max is 10.
- `locate` is the default top-k discovery action; default `topK` is 5 and max is 10.

Each candidate should explain:

- exact phrase match or scored match,
- score components,
- ignored/downranked generated alternatives when relevant,
- whether expansion is recommended.

Benchmarks must measure top-1 accuracy, whether top-1 causes extra follow-up calls, and whether explicit `query.topK` improves task completion without bloating context.

## Optional Local Index Evaluation

The default router should remain lightweight. Still, a local index may be worth adopting if evidence proves it.

Candidate index properties:

- no external service,
- no native dependency for the first experiment,
- local cache outside repo by default,
- content-hash invalidation,
- incremental update,
- path/line metadata,
- chunk table,
- no-dependency token/inverted index first,
- SQLite/FTS only after benchmark evidence shows the no-dependency index is insufficient,
- generated-path filtering at index time,
- cold and warm benchmark modes.

Evaluation modes:

```text
scanner-baseline      current/improved in-memory scanner
index-cold            build index then query
index-warm            query existing index
index-stale           changed files trigger refresh or fallback
```

Cold-index calibration targets:

- small repo: under 2 seconds,
- medium repo: under 15 seconds,
- large repo: under 60 seconds,
- warm broad queries should meaningfully beat the scanner,
- changed-file refresh should be incremental,
- index build should be interruptible or skippable.

These targets are calibration points until baseline data exists, not release gates.

Adoption threshold:

- no regression on exact searches,
- fixes known generated-artifact false positives,
- improves p95 broad-query latency after warm index,
- keeps evidence bounded,
- cold index cost is measured and acceptable,
- no required external service,
- packaging impact is acceptable.

If these are not met, keep the index experimental. Do not add SQLite/FTS or another native dependency without explicit approval after benchmark evidence.

## `freeflow_run` Design Direction

### Adaptive Compression

`freeflow_run` should choose compression intensity from output class and risk:

```text
failed / exactness-sensitive:
  exact diagnostics first; no lossy summary of critical evidence

small successful:
  near-raw or lightly structured

large successful / noisy:
  compact summary + important lines + vault recovery

repeated output:
  duplicate note + previous outputId + exact recovery
```

### Command Parsers

Add parsers where deterministic extraction is reliable.

Initial parser priority:

1. Test runner output: preserve failed test names, assertion lines, stack tops, and pass/fail summary.
2. TypeScript/lint diagnostics: preserve file, line, column, error code/rule, and message.
3. Git status/diffstat: support review and commit workflows.
4. Build/toolchain errors: capture first/root error block and final summary.
5. Structured JSON/table summarization: useful but riskier; defer until exact recovery and earlier parsers are strong.

Likely parser families include Jest, Vitest, pytest, cargo test, go test, `tsc`, ESLint, Biome, git status/diff/log, npm/pnpm/yarn install/build, docker/kubectl/plain repetitive logs, and JSON/table outputs.

Parser output should include:

- parser name and confidence,
- exact important lines,
- grouped counts,
- file/line references,
- exit status,
- recovery path.

Parser fallback must be safe:

- if parser confidence is low, return generic exact important lines,
- never hide failure evidence,
- never claim semantic interpretation beyond deterministic evidence.

### Structured Compression

For structured output, evaluate:

- compact table rendering,
- JSON schema/key summary,
- JSON path slices,
- TOON-like encoding for uniform arrays,
- diff hunk summaries,
- grouped diagnostic output.

Each structured compression mode must declare whether it is exact or lossy.

### Cross-Call Reuse

Add session-level fingerprints for output records:

- exact hash,
- normalized hash,
- optional fuzzy similarity fingerprint,
- command fingerprint,
- cwd and exit status.

If output repeats, return:

```text
This output is identical/similar to outputId=ffout_...
New raw output was/was not vaulted according to policy.
Use freeflow_retrieve to recover exact lines.
```

The policy for whether to vault duplicate raw output should be benchmarked; exact recovery must remain clear.

## Model-Assisted Experimental Path

Product runtime remains deterministic by default.

Model-assisted summarization or reranking may be tested only as an experiment:

- not enabled by default,
- not required for benchmarks to run,
- clearly labeled in reports,
- measured against deterministic cost/quality,
- never used for exactness-sensitive output unless it returns citations and exact evidence remains primary.

A disabled config toggle may be considered only if model-assisted behavior proves all of:

- measurable quality improvement over the deterministic router,
- no exact-recovery regression,
- no source-citation or evidence regression,
- stable enough across repeated runs,
- latency and cost are acceptable and visible,
- output is labeled when model-assisted behavior was used.

A reasonable first promotion threshold is at least a 10 percentage-point accuracy improvement on ambiguous/broad retrieval fixtures, or a clear macro-benchmark quality improvement with no deterministic equivalent.

If it meets that threshold, a later spec or plan may add a disabled config toggle such as:

```json
{
  "outputRouter": {
    "modelAssisted": "off"
  }
}
```

Possible future values must be decided later. This spec does not ship them.

## Benchmark Design

Benchmarks are part of the product, not an afterthought.

### Required Internal Comparisons

Every benchmark should compare at least:

```text
native baseline
current/freeflow baseline
improved Freeflow Router
```

Native baseline examples:

- native `read`,
- native `bash`,
- native `rg`,
- direct command output.

Current/freeflow baseline should preserve the behavior before a change so improvement is measurable.

### Optional External Comparisons

External comparisons are valuable but not required.

Skipped external tools are reported as skipped, not failed.

- Graphify: retrieval/architecture/path/community questions.
- Claude Context: semantic/hybrid code search when configured.
- RTK: command-output compression benchmarks.
- Squeez: command-output/session-efficiency benchmarks.

### Core Metrics

Retrieval metrics:

- top-1 path accuracy,
- top-1 line/span accuracy,
- recall@3,
- excerpt completeness,
- generated false-positive rate,
- context bytes/tokens,
- latency p50/p95,
- expansion count,
- explanation quality.

Command-output metrics:

- raw bytes/tokens,
- routed bytes/tokens,
- reduction percentage,
- latency overhead,
- parser confidence,
- exact failure fact preservation,
- raw recovery success,
- duplicate/reuse hit rate.

Agent-task metrics:

- final answer correctness,
- cited evidence correctness,
- tool calls,
- injected tokens/bytes,
- wall-clock time,
- number of clarifications/user interventions,
- quality regression versus oracle.

Safety metrics:

- transformed native output labeled,
- `outputId` present when needed,
- exact recovery succeeds,
- small outputs passed through,
- exactness-sensitive output not lossy-compressed.

### Tool Benchmark Tracks

Initial retrieval fixtures:

1. Exact copied text block.
2. Markdown heading plus nearby body text.
3. Generated-artifact decoy.
4. Huge single-line decoy.
5. Ambiguous multi-file query.
6. Vaulted output query.
7. Expansion from narrow evidence to complete block.

Initial command fixtures:

1. Noisy successful command.
2. Failed command with stack trace.
3. Test summary output.
4. TypeScript/lint diagnostics.
5. Git status/diff/log.
6. Repetitive logs.
7. Huge JSON/table output.
8. Repeated command output.

### Benchmark Reports

Every benchmark report should include:

- fixture name,
- tool path used,
- raw bytes/tokens,
- routed bytes/tokens,
- latency,
- correctness result,
- recovery result,
- notes on skipped external tools,
- regression status.

Reports should live under `plugins/freeflow/evals/reports/runtime/` unless a better eval-specific location is established.

## Codex CLI Agent-Harness Macro Benchmark

The Codex CLI agent-harness research corpus is the flagship macro benchmark because it represents a real expensive research workflow.

Existing corpus:

```text
docs/codex-cli-agent-harness/README.md
docs/codex-cli-agent-harness/2026-06-12-pass-0-repo-map.md
docs/codex-cli-agent-harness/2026-06-12-pass-1-turn-loop.md
docs/codex-cli-agent-harness/2026-06-12-pass-2-tool-system.md
docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md
docs/codex-cli-agent-harness/2026-06-12-pass-4-subagents-and-delegation.md
docs/codex-cli-agent-harness/2026-06-12-pass-5-model-providers-runtime-adapters.md
docs/codex-cli-agent-harness/2026-06-12-pass-6-memory-and-context.md
docs/codex-cli-agent-harness/2026-06-12-pass-7-config-and-extensibility.md
docs/codex-cli-agent-harness/2026-06-13-pass-8-agent-harness-comparisons.md
```

The original research reportedly took 12+ hours of repeated reads, passes, and subpasses. That makes it a strong real-world target for measuring whether Freeflow Router reduces research cost without degrading quality.

### Stages

#### Stage 1: Structured Q&A

Ask targeted questions derived from the existing pass docs.

Example:

```text
Find the Sandbox Permissions section, report file/lines, and explain UseDefault, RequireEscalated, and WithAdditionalPermissions.
```

Use docs as oracle scaffolding, but prefer upstream source citations when available.

Purpose:

- fast iteration,
- deterministic grading,
- retrieval accuracy focus,
- catches failures like the `graphify-out` false positive.

#### Stage 2: One-Pass Artifact Recreation

Pick one pass, likely Pass 3 sandboxing/permissions, and ask an agent to recreate a comparable markdown research artifact from the Codex source snapshot.

Measure:

- factual completeness,
- source citations,
- structure quality,
- tool calls,
- context bytes,
- wall-clock time.

#### Stage 3: Full Corpus Recreation

Recreate Pass 0–8 as a release-gate benchmark.

This should not run on every change. It is too expensive for TDD. It is useful for major release evidence.

### Grading Sources

Use both:

1. Existing Freeflow research docs for expected concepts and pass structure.
2. Upstream Codex source snapshots for source-truth citations when available.

Existing docs are research memory, not infallible truth. If upstream source conflicts with the docs, the benchmark should surface the conflict rather than force agreement with stale notes.

### External Comparison Scope

For this macro benchmark, compare retrieval tools only:

- native `rg`/`read`,
- Freeflow Router,
- Graphify when graph exists and is fresh enough,
- Claude Context when indexed/configured.

RTK and Squeez are not primary macro comparators for source-research quality. They belong in command-output and session-efficiency benchmark tracks.

### Success Rule

The macro benchmark uses the Pareto rule:

- no quality regression,
- plus improvement in at least one of tokens, tool calls, wall-clock time, or evidence traceability.

## High-Level Phases

### Phase 1: Baseline And Regression Lock

- Add the Sandbox Permissions broad-query failure as a regression fixture.
- Add generated-artifact and huge-line decoys.
- Measure current Freeflow, native, and optional external baselines.
- Record baseline report.

### Phase 2: Retrieval Accuracy And Context Bounds

- Add default generated-path filtering.
- Add exact phrase/multiline matching.
- Add long-line and excerpt caps.
- Add stopwords/token normalization.
- Add BM25-style scoring.
- Add ranked candidates and route explanations.

### Phase 3: Benchmark Harness

- Add repeatable tool benchmark runner.
- Add metrics capture for bytes/tokens/latency/correctness/recovery.
- Add report format.
- Add CI-friendly subset.

### Phase 4: Command Output Excellence

- Add deterministic parsers for high-value command families.
- Add structured compression experiments.
- Add exact failure/verification preservation tests.
- Add RTK/Squeez optional comparisons where available.

### Phase 5: Optional Local Index Evaluation

- Build a no-dependency local index experiment first.
- Measure scanner versus index cold/warm/stale behavior.
- Decide whether to adopt, keep optional, or reject.

### Phase 6: Session Reuse

- Add duplicate and fuzzy repeated-output detection.
- Add prior-output recovery behavior.
- Measure session efficiency and risk.

### Phase 7: Codex Macro Benchmark

- Add structured Q&A benchmark.
- Add one-pass artifact recreation benchmark.
- Later, add full corpus recreation as release-gate evidence.

### Phase 8: Documentation And Adoption Decision

- Update router docs only after benchmarks support the claims.
- Promote optional index/model-assisted paths only if evidence supports them.
- Keep external integrations optional unless a later spec expands scope.

### Phase 9: Setup And Config Integration

Run this after core router behavior, caps, top-k behavior, parser metadata, and benchmark evidence stabilize.

- Update `setup-freeflow` to own optional output-router repo setup and config.
- Add a setup reference such as `plugins/freeflow/skills/setup-freeflow/references/output-router-setup.md` if setup behavior needs durable guidance.
- Keep minimal setup writing only `{ "defaultMode": "workflow" }` unless the user explicitly asks to configure the output router.
- Allow optional `.freeflow/config.json` `outputRouter` config when explicitly requested.
- Update the setup activation contract/evals so “minimal config exactly `defaultMode`” remains true while optional `outputRouter` is allowed.
- Update Pi extension detection/diagnostics so missing `outputRouter` means built-in defaults, present config is reported clearly, and invalid values surface warnings.
- Update TUI renderers only when response shape changes, such as explicit `query.topK` returning multiple evidence packets or command parsers surfacing parser/fidelity/confidence metadata.
- Do not create a separate `setup-output-router` skill unless setup grows into a distinct workflow with index bootstrap, vault browsing, native safety-net host hooks, adapter diagnostics, or pruning/migration workflows.

## Acceptance Criteria

A plan implementing this spec should eventually demonstrate:

- The Sandbox Permissions broad-repo query returns the correct markdown file and bounded line span.
- `graphify-out/**` and other generated artifacts do not win normal repo retrieval unless explicitly requested.
- Huge single-line files cannot flood evidence excerpts.
- Exact phrase and heading/body queries beat loose repeated-token matches.
- Retrieval benchmarks report top-1 and explicit/top-k accuracy, context bytes, and latency.
- `freeflow_run` benchmark reports raw/routed bytes, parser behavior, and exact recovery.
- Failed/exactness-sensitive command output preserves exact diagnostic lines.
- Vault recovery succeeds for routed command/native output without rerunning commands.
- Optional external comparisons can be skipped without failing internal benchmarks.
- Optional local index evaluation includes cold/warm/stale measurements.
- Codex Q&A benchmark exists and catches the known broad-retrieval failure.
- No benchmark claim is documented as product behavior before verification.
- Output-router setup/config behavior is integrated into `setup-freeflow` only after the core router contract stabilizes, or explicitly deferred with a reason.

## Risks

- Over-optimizing token reduction can hide required evidence.
- Generated-path filtering can hide user-requested artifacts if explicit retrieval escape hatches are missing.
- Indexing can add setup cost, stale results, packaging complexity, or cross-platform issues.
- Command parsers can create false confidence if parser confidence is not surfaced.
- Optional external comparisons can become flaky or environment-dependent.
- Model-assisted experiments can become hidden cost centers if promoted too quickly.
- Macro benchmarks can become too expensive to run often.

## Answered Questions And Calibration Defaults

These questions were resolved before implementation. Benchmark evidence may refine numeric targets later, but changes to product behavior still need explicit approval when they cross stop conditions.

- Evidence caps: use the cap policy in `Bounded Evidence Assembly`.
- Generated-path defaults: broad retrieval skips the generated/dependency/cache defaults in `Source Inventory And Filters`; explicit path retrieval remains allowed.
- Top-k: `query` defaults to top 1 and supports explicit `topK` up to 10; `locate` defaults to top-k discovery with default 5 and max 10.
- Command parsers: implement test runner output first, then TypeScript/lint diagnostics, git status/diffstat, build/toolchain errors, and structured JSON/table summarization later.
- Index design: no-dependency local index experiment first; SQLite/FTS only after benchmark evidence and approval.
- Cold-index time: small under 2s, medium under 15s, large under 60s are calibration targets, not release gates.
- Release gates: hard now are no known accuracy regression, exact recovery preserved, generated-artifact false positive fixed, bounded evidence, and clean optional-skip behavior for external comparisons. Token/time percentages wait for baseline data.
- Model-assisted threshold: disabled-toggle consideration requires at least a 10 percentage-point accuracy gain on ambiguous/broad retrieval fixtures, or clear macro-benchmark quality improvement with no deterministic equivalent.
- Setup/config integration: defer until core router behavior stabilizes; integrate optional output-router setup into `setup-freeflow`, not a new setup skill, unless setup later becomes its own distinct workflow.

## Stop Conditions

Stop and ask before:

- Making model-assisted routing default.
- Requiring external services/vector databases.
- Enabling native post-tool routing by default.
- Changing public tool names or response contracts.
- Replacing native Pi tool semantics.
- Treating Graphify, Claude Context, RTK, or Squeez as required dependencies.
- Documenting benchmark superiority before measured evidence exists.
- Rewriting research docs or tests to hide known accuracy failures instead of fixing router behavior.
- Creating a separate `setup-output-router` skill instead of extending `setup-freeflow` without a later distinct setup workflow decision.
