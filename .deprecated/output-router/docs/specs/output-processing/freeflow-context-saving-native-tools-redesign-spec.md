> **Doc ID:** SPEC-2026-06-25-freeflow-context-saving-native-tools-redesign
> **Date:** 2026-06-25
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** Owner grilling session on Freeflow as a context-saving replacement for agent tools; current output-router specs, runtime docs, and Context Mode comparison evidence.

# Freeflow Context-Saving Native Tools Redesign Spec

## Purpose

Redesign Freeflow-owned tools around one product goal:

```text
maximum context savings for tool outputs, docs, logs, and deterministic repo/vault search
+ maximum factual accuracy
+ exact recovery where it matters
```

Freeflow should not try to beat specialist code-intelligence tools such as Serena or codebase-memory-mcp at symbol search, references, call graphs, or architecture analysis. Those tools should remain external specialists.

Freeflow should instead become the context-saving layer around agent tool output:

```text
capture raw output outside model context
-> search/filter/transform it accurately
-> return the smallest useful model-visible result
-> keep recoverable raw evidence when needed
```

This spec covers Freeflow-owned tools only. External observed routing for web/MCP/Serena/codebase-memory outputs remains a later spec, though this design keeps the seams compatible.

This spec must not regress existing Freeflow vault behavior. Current vault/search paths already include command/native/observed/derived records; this redesign focuses benchmark effort on shell-command outputs first, but the source model must continue to handle existing vaulted record kinds.

## Product Direction

Freeflow should converge toward this public mental model:

```text
freeflow_run    = create and capture new output
freeflow_search = find, get, expand, or transform existing repo/vault data
freeflow_batch  = run independent Freeflow operations in one model-visible call
```

Current names may stay during implementation. If benchmarks show the redesign performs as intended, do one final code/docs/skills migration to the new naming surface.

Working mapping:

- existing `freeflow_run` remains the live-command capture tool,
- existing `freeflow_retrieve` evolves toward `freeflow_search`,
- existing `freeflow_derive` folds into `freeflow_search` as `transform`,
- new `freeflow_batch` batches Freeflow-owned operations first.

## Non-Goals

Do not make this spec responsible for:

- semantic code search,
- LSP/symbol/reference/call-graph intelligence,
- replacing Serena or codebase-memory-mcp,
- external MCP/web observed-routing redesign,
- arbitrary external tool orchestration in batch v1,
- mutating batch workflows,
- model-assisted summarization as the default path,
- broad docs/skills rename churn before benchmarks pass.

## Core Mental Model

Use data lifecycle, not implementation mechanism, to classify tools.

```text
RUN      = make new raw data.
SEARCH   = find/select old raw data.
TRANSFORM = compute/filter old raw data.
```

`freeflow_search transform` is the transform surface; it may use deterministic operations or sandboxed programmable scripts.

Code can appear in more than one place, so code execution alone does not define the tool:

- a script that runs `npm test` creates new output: `run`,
- a script over captured `ffout_...` transforms old output: `search transform`,
- a script over read-only mounted repo files searches/transforms existing repo data: `search transform`.

## Tool: `freeflow_run`

### Job

Create new shell-command output, capture it, and return a tiny accurate result.

Typical use:

- tests,
- builds,
- lint/typecheck,
- broad shell search,
- log-generating commands,
- commands with unknown/noisy output.

### Normal Flow

```text
input: shell command or sandboxed script producer + optional declarative filter
-> run one producer once through Pi/host-approved runner or the proof-backed script sandbox
-> capture stdout/stderr/combined
-> store according to storage policy
-> apply known parser when available
-> apply declarative filters when provided
-> return ultra-compact model-visible result
```

### Programmable Filter Flow

```text
input: base shell command or sandboxed script producer + filter script
-> run base producer once
-> store raw stdout/stderr/combined
-> run filter script over captured stdout/stderr, not by rerunning the base producer
-> store derived script output
-> return compact script result plus raw/derived recovery ids where available
```

The filter script must process already captured output. It must not rerun the base producer, because reruns can duplicate side effects and break evidence. A base `script` producer is different: it creates the captured stdout/stderr/combined in the first step, then normal filters/reducers/routing can operate on that captured output.

Programmable filtering should be implemented as a shared deep module, not duplicated per tool. `freeflow_run` adapts captured stdout/stderr/combined into transform inputs. `freeflow_search transform` adapts repo/vault/search-result inputs into the same transform engine. The engine owns validation, execution policy, limits, storage, lineage, and recovery.

### Declarative Filters

`freeflow_run` should support deterministic filters before requiring scripts, for example:

- include/exclude regexes,
- head/tail limits,
- max lines/bytes,
- JSON path selectors,
- topN,
- groupBy,
- content type hints,
- parser-specific selectors such as failures-only.

Declarative filters are easier to test and benchmark than scripts. Scripts are the escape hatch.

### Script Safety

Default programmable filters are sandboxed/read-only:

- script sees captured stdout/stderr and selected metadata only,
- no repo/home/env/network access by default,
- bounded input/output/time,
- no mutation.

Unsandboxed or broader-access script execution is not part of the current implementation scope. Any future `yolo` mode must be an explicit execution policy on the same programmable-transform engine, not a second implementation and not a fallback from sandbox failure. It requires a separate owner-approved security/product decision, clear result metadata, and no sandbox-safety claims.

## Tool: `freeflow_search`

### Job

Search, locate, get, expand, or transform existing data while minimizing context.

Initial source kinds:

```text
repo
vault
```

- `repo`: current project files/directories/docs/code, searched deterministically.
- `vault`: captured Freeflow outputs. Current vault records include command/native/observed/derived outputs. For this spec, benchmark and implementation focus starts with shell outputs from `freeflow_run`, but the redesign must preserve existing support for other vaulted record kinds.

### Actions

#### `locate`

Return where relevant data likely is, without returning the content body.

```text
input: query text/code
output: candidate paths/outputIds/locations only, with tiny previews if needed
```

Examples:

- “which docs talk about architecture?” -> paths,
- “where is schema normalization?” -> files/sections,
- “where did the previous run mention AUTH_TOKEN?” -> output ids/streams/line ranges.

#### `query`

Return focused snippets/content matching a query.

```text
input: query text/code
output: compact snippets with source location and recovery/expand handle
```

This is deterministic lexical search, not semantic code intelligence.

#### `get`

Find the best exact-ish location for a provided text/code snippet and return the matching location plus content.

```text
input: exact-ish text/code
output: path or outputId, line range, matched content, match type/confidence
```

`get` does not require the user to already know path or line range. It answers: “where is this exact/near-exact thing, and what is the matched content?”

Known exact path/range recovery remains a public advanced capability because current `freeflow_retrieve action=retrieve` supports exact repo/vault line recovery. The primary `get` UX is snippet-to-location, but implementation must preserve an exact range mode for callers that already know the path/output id and line range.

#### `expand`

Widen a previous search/get/query result.

```text
input: prior result/evidence handle
output: larger bounded context around the same source
```

Useful for repo and vault. It is not vault-only.

#### `transform`

Compute/filter existing repo or vault data.

Includes deterministic operations:

- regex filter,
- count matches,
- group by regex,
- dedupe,
- topN,
- JSON extract,
- URL/citation extract,
- line/size stats.

Also includes programmable read-only scripts over mounted repo/vault inputs.

Default script mode is sandboxed/read-only:

- repo/vault inputs are mounted or copied as read-only data,
- no mutation,
- no home/env/network by default,
- bounded input/output/time.

### Repo Search Backend

Initial repo search remains deterministic scanner-based. Do not assume repo indexing as default.

Benchmark before adopting an index. Candidate backends:

- scanner-only,
- local lexical index,
- FTS5/BM25/trigram,
- hybrid scanner + index.

Make indexing default only if benchmarks show better accuracy, speed, and token efficiency without unacceptable stale-index or setup costs.

A lexical index can still be deterministic. “No semantic search” means Freeflow should not become a vector/LSP/code-graph engine for this scope.

## Tool: `freeflow_batch`

### Job

Save tokens by executing multiple independent Freeflow-owned operations behind one model-visible call.

Batch v1 is parallel-only:

```text
input: N independent run/search operations
-> execute in parallel where safe
-> capture/store each step output
-> suppress intermediate model-visible output
-> return one compact combined result
```

Batch v1 supports Freeflow-owned operations only:

- run steps,
- search steps,
- transform steps through search.

Universal batching of arbitrary host tools, external MCP tools, web tools, read/write/edit, Serena, codebase-memory, and mutating operations is out of scope for this spec.

### Batch Output Policy

Intermediate step outputs should not enter model context by default.

Batch should return one combined summary, for example:

```text
batch: 3/3 complete
- test: pass · 278 passed · raw=ffout_1
- typecheck: fail · 2 TS errors · raw=ffout_2
- lint: pass · raw=ffout_3
```

Full child details live in step details, TUI expanded view, and vault metadata.

### Future Batch Script Mode

A later advanced mode may provide a small runtime/orchestration language:

```text
batch script mode = programmable orchestration
```

The script can decide ordering, parallelism, dependencies, combining outputs, and final output. This is intentionally deferred because it becomes a workflow engine.

## Storage Policy

Use the benchmark-selected `hybrid-dedupe` command-capture default.

```text
small non-sensitive successful command output -> metadata-only record + near-raw routed evidence from the live execution
large/noisy/unknown command output -> exact vault
failed/verification/diagnostic/build/test command output -> exact vault
preserve=full or explicit recovery-sensitive output -> exact vault
exact duplicate of a previously exact command output -> metadata-only record pointing at prior exact outputId
batch child command capture -> same command storage policy; full child results stay in details.result.steps
```

Metadata-only records must never claim exact recovery. Exact duplicate metadata may point to a prior exact `outputId`; plain metadata-only records can describe rerun guidance but cannot expose `recoveryOutputId`.

Benchmarked storage strategies:

1. store everything exactly,
2. threshold-based storage only,
3. hybrid metadata-small/exact-large,
4. duplicate-output dedupe,
5. hybrid-dedupe.

Measured:

- latency,
- storage size,
- index size,
- recovery usefulness,
- privacy surface,
- token savings,
- repeat-output behavior.

The first runtime adoption is scoped to `freeflow_run` command capture. Observed/native safety-net persistence keeps its existing explicit policies.

## Model-Visible Output And TUI Split

The model-visible output must be ultra-compact by default.

Do not inject full routed JSON into model context unless explicitly requested.

Separate outputs into four layers:

```text
modelVisibleText = tiny summary + critical evidence + ids
TUI collapsed    = one-line status
TUI expanded     = structured details, evidence, recovery, parser metadata
vault/details    = full metadata and exact raw output where persisted
```

Example `run` success:

```text
run npm test: pass · 278 passed, 0 failed · raw=ffout_123
```

Example `run` failure:

```text
run npm test: fail exit=1 · 3 failed, 275 passed · raw=ffout_123
- tests/auth.test.ts: expected 200, got 401
```

Current TUI behavior may truncate/cut useful details. This redesign requires TUI work so the model context can shrink without losing human-visible detail.

TUI expanded view should show:

- execution status,
- summary,
- key evidence,
- parser/filter decisions,
- storage/recovery ids,
- exact recovery/search hints,
- child step details for batch.

## Benchmark Goal

Freeflow should be judged against Context Mode on the target category:

```text
tool outputs + docs + logs + repo/text search
```

The benchmark must be normalized: same fixtures, same questions, same raw inputs where possible.

Measure:

- raw bytes processed,
- model-visible bytes returned,
- token savings ratio,
- number of model-visible tool calls,
- answer accuracy,
- exact fact preservation,
- recovery availability,
- latency,
- storage overhead,
- failure behavior.

Target:

```text
Freeflow should match or beat Context Mode on token savings while preserving equal-or-better factual accuracy and recovery.
```

## Implementation Direction

Do not do broad docs/skills rename work first.

Suggested phases:

1. Compact model-visible result shape for current `freeflow_run`, keeping full details/TUI metadata.
2. Add declarative filters to `freeflow_run` and retrieval paths.
3. Add programmable `run` filtering over captured stdout/stderr.
4. Evolve `freeflow_retrieve` internals toward `freeflow_search` actions: `locate`, `query`, `get`, `expand`, `transform`.
5. Fold `freeflow_derive` behavior into a shared transform engine used by search transform and run script filters while keeping compatibility.
6. Add `freeflow_batch` v1 for parallel Freeflow-owned operations.
7. Run Context Mode comparison and storage/indexing benchmarks.
8. Preserve existing exact repo/vault path/range retrieval while adding the new `get` snippet-to-location UX.
9. If benchmarks pass, finalize public naming and do one coordinated code/docs/skills migration.

## Acceptance Criteria

- `freeflow_run` can return ultra-compact model-visible output while preserving full details and raw recovery.
- `freeflow_search`/retrieve and `transform`/derive return compact model-visible text, not pretty-printed structured JSON, while preserving full structured detail in `details.result`, TUI expanded views, and vault recovery.
- `freeflow_run` supports deterministic declarative filters.
- `freeflow_run` can run a sandboxed programmable filter over captured stdout/stderr without rerunning the base command.
- `freeflow_search` source model supports `repo` and `vault`.
- `freeflow_search` actions support `locate`, `query`, `get`, `expand`, and `transform` semantics.
- `get` accepts text/code and returns the best matching location plus content.
- Existing exact path/outputId + line-range retrieval remains available as an advanced recovery mode.
- `transform` covers existing deterministic derive operations and sandboxed read-only scripts over repo/vault inputs.
- Programmable script execution is a shared deep module used by run filters and search transforms; callers only adapt their source inputs.
- `freeflow_batch` v1 can run independent Freeflow-owned operations in parallel and return one compact combined result.
- Batch intermediate outputs are captured/stored but not injected into model context by default.
- TUI collapsed/expanded views expose enough detail that model-visible output can stay tiny.
- Benchmarks compare Freeflow against Context Mode for target contexts before claiming superiority.

## Decisions Made

- Freeflow’s target is context saving for tool outputs/docs/logs/repo-text search, not code intelligence.
- External code-intelligence tools should remain specialists; Freeflow can wrap their outputs later.
- Future public surface should converge to `freeflow_run`, `freeflow_search`, and `freeflow_batch` if benchmarks justify the migration.
- `freeflow_derive` should fold into search as `transform` conceptually, with script execution factored into a shared programmable-transform module.
- `freeflow_search` sources are `repo` and `vault` for this spec.
- Benchmark focus for this spec starts with shell outputs from `freeflow_run`; existing command/native/observed/derived vault record support must not regress.
- `get` takes text/code and returns location plus content; it does not require known path/range input.
- Existing exact path/range retrieval remains a public advanced capability.
- Declarative filters should exist before scripts.
- Programmable scripts are sandboxed/read-only by default; future unsandboxed/yolo execution is an explicit policy on the shared transform engine, outside current implementation scope, and requires a separate owner-approved decision.
- Batch v1 is parallel-only and Freeflow-owned-tools-only.
- Sequenced/hybrid batch orchestration is deferred to future script mode.
- Storage defaults should be hybrid and benchmarked.
- Repo indexing should be adopted only after benchmark evidence.
- Model-visible output should be ultra-compact for every Freeflow-owned tool; full structured detail belongs in TUI/details/vault. Pretty-printed JSON is acceptable only in `details.result`, debug/recovery surfaces, or explicit raw/detail requests.
- Build and benchmark first; do broad naming/docs migration at the end.

## Open Questions

- What exact schema should represent declarative filters across run/search without becoming too large?
- Which script language should ship first for programmable run/search filtering?
- How small can model-visible output be before agent accuracy drops?
- What thresholds should decide small/simple inline output versus exact vault storage?
- What should the exact public naming/schema be for the advanced path/range recovery mode after `freeflow_search` replaces `freeflow_retrieve`?
- Which Context Mode fixtures should be reused or mirrored for normalized benchmarks?
- What TUI expanded layout best exposes full detail without reinflating model context?
