> **Doc ID:** SPEC-2026-06-24-freeflow-observed-output-routing-vault-index-script-derive
> **Date:** 2026-06-24
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** Owner-approved design discussion on observed routing, existing `freeflow-universal-output-capture-and-derive-design.md`, current router/Pi extension evidence, Pi extension docs, Claude Code hook docs, Codex hook docs, Context Mode benchmark evidence, and design-for-depth review.

# Freeflow Observed Output Routing, Vault Index, And Script Derive Design

## Purpose

Define the next Freeflow evidence-routing architecture after the universal capture/derive slices.

This spec changes the direction from explicit read-only call-through as the primary provider path to observed post-tool routing as the primary path for MCP, web, fetch, and code-search outputs when the host can replace tool results before the model sees them.

Implementation should still proceed slice by slice. Slices are execution units, not product versions. The complete target is the behavior described here.

## Source-Truth Update

This spec supersedes the prior call-through-first provider direction in `docs/specs/freeflow-universal-output-capture-and-derive-design.md` where host post-tool output replacement is available.

Pi observed routing has replaced the public Pi call-through provider path. Public Pi `freeflow_capture` and the hardcoded Serena MCP bridge are removed rather than soft-deprecated.

The read-only/mutating boundary remains important for metadata, review, verification, and persistence defaults, but it is not a gate for post-tool output routing because the host has already executed and authorized the tool.

For script derive public surface, this spec supersedes the separate `freeflow_script_derive` recommendation in `docs/designs/freeflow-script-derive-sandbox-design.md`. Keep that document's sandbox/security contract, but implement script derive as `operation.kind="script"` inside `freeflow_derive` after reconciling the design artifact.

## Problem

Modern coding-agent work produces large or noisy evidence from MCP servers and host tools:

- GitHub issue/PR/search results,
- Gmail or Slack search results,
- Vercel deployment output,
- Context7/library documentation,
- web search results,
- fetched pages,
- code-search results,
- browser or provider snapshots,
- mutating provider responses such as created issues, deployments, or sent-message receipts.

Requiring the agent to choose a separate Freeflow wrapper for each provider call adds tool-choice friction and duplicates the host's MCP/tool surface. Direct provider calls are usually the natural path, but raw provider output can flood context and lose recoverability.

Freeflow should route enabled producer outputs automatically after the host tool runs, without taking ownership of tool execution, permissions, sandboxing, or provider authorization.

## Intended Outcome

For enabled producers, the normal agent flow is:

```text
agent calls original host tool directly
-> host executes tool and handles permissions/sandbox/auth
-> Freeflow observes the tool result
-> Freeflow captures exact output when policy allows
-> Freeflow routes huge/noisy output into bounded evidence
-> model receives compact accurate evidence plus recovery instructions
```

The user-facing rule:

```text
Enabled MCP/web/code-search producer outputs are routed by Freeflow where the host supports post-tool output replacement.
```

Small useful output may pass through unchanged or near-raw. Large, noisy, generated, or configured producer output should be vaulted and replaced with bounded evidence.

## Host Capability Evidence

Current implementation target:

- **Pi:** supports `tool_result` hooks that can modify results. Freeflow already uses this for native read/bash safety-net routing.

Deferred adapter targets:

- **Claude Code:** documented `PostToolUse` and `updatedToolOutput` support make it a likely future adapter target, but this spec's current implementation work does not build the Claude adapter.
- **Codex:** documented `PostToolUse` support for Bash, `apply_patch`, and MCP tools makes it a likely future adapter target for some producers, but current Codex docs say WebSearch and other non-shell/non-MCP tool calls are not intercepted. This spec's current implementation work does not build the Codex adapter.

If a host can observe but cannot replace/suppress the original output before model context, Freeflow must not claim context savings for that host path. Future Claude/Codex adapter work must verify current host docs and smoke-test replacement behavior before public claims.

## Scope

In scope:

- Pi observed post-tool routing for enabled MCP producers,
- Pi observed post-tool routing for web, fetch, and code-search producers where Pi exposes those tool results,
- adapter seams that keep future Claude/Codex adapters possible without building them now,
- producer/server-level opt-in config,
- deterministic producer-aware output reducers,
- exact vault recovery when persistence policy allows,
- privacy/persistence policy separate from routing policy,
- read/write/unknown classification as metadata,
- vault-wide indexing and search over routed evidence,
- extending `freeflow_derive` with a sandboxed `operation.kind="script"` branch,
- removal of Pi public `freeflow_capture` after Pi observed routing is proven. This removal is complete for the Pi adapter.

Out of scope:

- repo-wide indexing for source files; live repo retrieval/search remains source truth,
- hidden mutation approval or permission decisions inside Freeflow,
- duplicating the host's MCP server registry in prompt context,
- requiring per-tool allowlists for routing,
- unsandboxed script execution,
- model-assisted runtime summarization as the default reducer,
- broad claims of superiority over Context Mode before benchmark evidence.

## Design Principles

- Host owns execution and permissions.
- Freeflow owns output routing, persistence, recovery, lineage, indexing, and derived evidence.
- Routing is explicit by config, not by accidental MCP availability.
- Persistence/privacy is user-owned and separate from whether output should be routed.
- Read/write classification is metadata for follow-up and policy, not a routing gate.
- Raw output must be captured before transformation when exact recovery is promised.
- Reducers preserve exact IDs, URLs, citations, paths, line numbers, errors, statuses, and code snippets instead of paraphrasing them.
- Public surface stays small; backend modules hide host, producer, reducer, vault, and sandbox details.

## Configuration Model

Observed routing is off unless explicitly configured.

Setup may offer to enable all currently configured MCP servers, but persisted config must store explicit server entries. Missing entries mean Freeflow does not route that producer.

Recommended shape:

```json
{
  "defaultMode": "workflow",
  "observedRouting": {
    "enabled": true,
    "onRoutingFailure": "fail-open",
    "mcp": {
      "servers": {
        "github": { "enabled": true, "persistence": "exact" },
        "gmail": { "enabled": true, "persistence": "metadata-only" },
        "vercel": { "enabled": false }
      }
    },
    "web": { "enabled": true, "persistence": "exact" },
    "fetch": { "enabled": true, "persistence": "exact" },
    "codeSearch": { "enabled": true, "persistence": "exact" }
  }
}
```

Supported persistence modes:

| Mode | Meaning |
| --- | --- |
| `exact` | Persist exact raw output in the local vault and provide recovery instructions. |
| `metadata-only` | Persist metadata, stats, hashes, producer identity, and routing decision, but not content. |
| `none` | Do not persist content or metadata beyond the immediate returned routed result. |

`redacted` is not a supported persistence mode in this design. Redaction is a possible future feature because it requires its own policy, implementation, and adversarial tests. If a user hand-edits config to `redacted` before that feature exists, Freeflow should warn and fall back to a safe non-content mode such as `metadata-only`.

Setup must ask the user to choose persistence for each enabled producer/server before writing config. The agent/setup flow may recommend defaults: exact for public-ish evidence producers such as GitHub, web, fetch, and code search, and metadata-only for sensitive or unknown producers such as Gmail, Slack, private customer systems, or anything likely to contain secrets.

`fail-open` means if Freeflow routing fails, the original host output is allowed through with a warning. This is the default because losing a completed tool result is worse than occasional context bloat.

Tool-level overrides are not required for this design. Add them only after evidence shows server-level policy is insufficient.

## Public Tool Surface

### Pi provider capture surface

Pi observed routing is the provider-output path after Slice 9 evidence. Agents call enabled MCP, web, fetch, and code-search host tools directly; Freeflow routes completed tool results through the Pi `tool_result` hook when configured.

Public Pi `freeflow_capture` and the hardcoded Serena bridge were removed after the Pi observed-routing eval passed. Reintroduce a call-through capture tool only with a new design and evidence that direct observed routing cannot cover the use case.

### `freeflow_derive`

Keep one public derive tool.

Current deterministic operations remain under `operation.kind` values such as `regexFilter`, `countMatches`, `jsonExtract`, `groupByRegex`, `dedupe`, `topN`, `extractUrls`, `extractCitations`, `lineStats`, and `sizeStats`.

Add script derive as another operation branch:

```json
{
  "sources": [
    { "kind": "vault", "outputId": "ffout_...", "stream": "raw", "alias": "issues" }
  ],
  "operation": {
    "kind": "script",
    "language": "python",
    "code": "import json\nissues=json.loads(read_text('issues'))\nwrite_json({'count': len(issues)})"
  },
  "limits": {
    "timeoutMs": 5000,
    "maxOutputBytes": 65536
  },
  "preserve": "important"
}
```

The public concept remains:

```text
existing evidence -> derived evidence -> routed output
```

Backend engines must remain separate.

## Deep Module Boundaries

Use deep modules that hide changing decisions.

Recommended boundaries:

```text
host adapters
  -> observed routing entrypoint for Pi now
  -> future observed routing entrypoints for Claude and Codex later

observed-routing core
  -> producer identification
  -> routing eligibility
  -> output normalization
  -> risk metadata
  -> persistence-policy selection
  -> reducer selection
  -> routed result assembly

reducers
  -> mcp reducer
  -> web-search reducer
  -> fetch reducer
  -> code-search reducer
  -> json reducer
  -> generic text reducer

vault
  -> raw/metadata persistence
  -> recovery ids
  -> lineage
  -> retention

vault-index
  -> chunking
  -> indexing
  -> query
  -> stale/retention cleanup

derive
  -> deterministic derive engine
  -> script derive engine
  -> source resolver
  -> operation hashing

sandbox adapters
  -> language runtimes
  -> filesystem/network/env isolation
  -> resource limits
```

Avoid one giant `capture.ts` or `observed-routing.ts` file that owns host hooks, policy, reducers, storage, indexing, and script execution.

## Observed Routing Pipeline

For every observed tool result:

1. Identify the producer:
   - MCP server/tool from host tool name such as `mcp__github__search_issues`,
   - web/search/fetch/code-search tool name from host-specific naming,
   - native tool if a future broader safety-net route applies.
2. Check observed-routing config.
3. If producer is not enabled, return no modification.
4. Extract exact visible output from the host result:
   - text blocks,
   - JSON objects,
   - MCP content arrays,
   - structured stdout/stderr where available.
5. Compute stats and hashes.
6. Classify risk metadata as `read`, `write`, or `unknown` with confidence/source.
7. Apply persistence policy.
8. Store raw or metadata-only output if policy allows.
9. Select reducer by producer and output shape.
10. Produce bounded evidence.
11. Return replacement output in the host's expected result shape.
12. Include recovery instructions when recovery is available.

The returned output must separate:

- host tool status,
- Freeflow routing status,
- persistence status,
- recoverability,
- producer identity,
- lineage/recovery ids,
- risk metadata.

## Risk Classification

Risk classification is metadata.

Classification sources, in priority order:

1. explicit config if later added,
2. MCP tool annotations when present,
3. built-in provider manifest knowledge,
4. deterministic tool-name heuristics,
5. `unknown` fallback.

Read-ish names include:

```text
get, list, search, read, fetch, query, find, inspect, lookup, describe
```

Write-ish names include:

```text
create, update, delete, send, merge, deploy, restart, write, cancel, approve, close, transition, mutate
```

For post-tool routing, `write` and `unknown` results still route when the producer is enabled. The label can drive follow-up guidance such as verification or review, but Freeflow must not pretend it authorized or prevented the action.

## Reducer Requirements

Reducers must be deterministic and producer-aware.

### Generic Rules

- Preserve exact identifiers, URLs, citations, file paths, line numbers, error codes, status fields, and code snippets.
- Show counts: raw lines/bytes/items, shown items, omitted items.
- Prefer exact windows and field extraction over prose summaries.
- Do not hide failures. Error output should preserve the exact failure line(s).
- Do not claim exact recovery unless persistence/recoverability is exact.
- No model-assisted summarization inside the runtime unless a future explicit design approves it.

### MCP Reducer

Handle MCP output shapes:

- text content blocks,
- JSON content,
- structured content,
- mixed content arrays.

For list/search outputs, preserve provider order and keep compact rows with fields such as:

```text
id, number, title, name, state, status, url, author, createdAt, updatedAt, path, line, message, labels
```

For mutation-like outputs, preserve:

```text
success/failure, created/updated/deleted object id, URL, status, provider message, next state, important warnings/errors
```

### Web Search Reducer

Preserve:

- query,
- top results,
- title,
- URL,
- exact snippet,
- citations,
- domain/source,
- omitted count.

Do not turn snippets into factual claims without source text.

### Fetch Reducer

Use content type and detected shape:

- HTML/markdown: headings, title, canonical URL, important links, exact section windows, code blocks when relevant.
- JSON: root shape, key paths, list counts, compact records, selected important fields.
- plain text/log-like content: exact line windows and matches.

### Code Search Reducer

Preserve exact code evidence:

- repository/source,
- file path,
- line numbers,
- symbol names,
- exact code snippets,
- surrounding context only when useful.

Never replace code snippets with prose when code is the evidence.

## Vault-Wide Search And Index

Repo indexing stays out of scope. Live repo retrieval/search remains the correct path for source files.

Vault indexing is in scope because routed output is generated, session-scoped, provenance-rich, and often unavailable through repo search.

Every persisted output should be eligible for indexing:

- command output,
- observed MCP/web/fetch/code-search output,
- derived output,
- future script-derived output.

Index records should include:

- outputId,
- recordId,
- sessionId,
- producer kind,
- MCP server/tool when present,
- host tool name when present,
- stream,
- createdAt,
- content hash,
- persistence/recoverability,
- chunk id,
- line range or item range where available.

`freeflow_retrieve` should support vault-wide query by text with filters such as:

```json
{
  "action": "query",
  "source": { "kind": "vault" },
  "query": "rate limit deployment failed github issue",
  "filters": {
    "producerKind": "mcp",
    "server": "github"
  }
}
```

The storage engine is an implementation choice behind the vault-index interface. The plan may choose SQLite FTS, a deterministic local index, or another local index after a focused benchmark. The public interface should not expose the storage engine.

## Script Derive Inside `freeflow_derive`

Script derive lets the agent provide code that transforms existing vault evidence into a new routed evidence record.

It is useful when deterministic operations cannot express the needed computation:

- custom stats over GitHub issues,
- joining two captured provider outputs,
- grouping logs by request id,
- parsing irregular provider JSON,
- producing a compact custom report from noisy evidence.

Script derive must use the same public `freeflow_derive` tool, but a separate backend engine.

Required behavior:

- source inputs are existing vault records,
- aliases are required for multi-source script inputs,
- operation hash covers source ids, source hashes, language, code hash, limits, sandbox adapter, and schema version,
- script output is captured before routing,
- output becomes a new evidence record with source lineage,
- raw script text is not persisted by default,
- exact recovery is promised only for persisted captured output.

Script derive is disabled by default. Setup must not enable it implicitly as part of observed routing. Users must explicitly enable script derive before any script operation can execute; disabled execution returns structured unavailable/disabled output.

### Sandbox Requirements

No unsandboxed fallback.

If no suitable sandbox adapter is available, return structured unavailable output.

Sandbox must enforce:

- no network,
- no ambient env secrets,
- no home directory access,
- no repo root access unless a future explicit source decision permits it,
- read-only mounted input files copied from vault records,
- bounded scratch/output directory,
- timeout, memory, disk, and output caps,
- cleanup of temp files,
- regular-file-only output collection,
- bounded stdout/stderr handling.

This spec is the design revision that expands the target language set beyond the earlier JavaScript-only sandbox artifact. Target language set for completion:

- JavaScript,
- Python,
- jq or an equivalent structured-data query language.

Each language remains unavailable until its own sandbox adapter passes capability probes, adversarial isolation tests, and review. Additional languages require an available sandbox adapter and tests. Shell is not allowed unless the sandbox can prove the same isolation contract.

## Status And Setup

`freeflow_status` should report:

- observed routing enabled/off,
- configured MCP servers and persistence modes,
- web/fetch/code-search observed routing state,
- host capability status for output replacement,
- vault writability,
- vault index state,
- script derive enabled/off,
- sandbox adapter availability and languages,
- sandbox network policy and effective resource limits,
- raw-script persistence state,
- warnings for unsupported host paths.

Setup should ask one evidence-routing decision point:

```text
Enable observed routing for configured MCP/web/code-search producers?
```

If accepted, setup may discover currently configured MCP servers and offer a multi-select. Persist explicit server entries only.

Sensitive providers should recommend conservative persistence such as `metadata-only` unless the user chooses exact persistence.

## Failure Behavior

Observed routing failures default to fail-open:

- original tool output passes through,
- warning is added when possible,
- no false recovery claim is made.

Failure cases must be structured:

- host does not support output replacement,
- producer not enabled,
- output extraction failed,
- storage failure,
- reducer failure,
- index failure,
- sandbox unavailable,
- script timeout or cap exceeded,
- persistence policy forbids recovery.

Index failures must not block routing. They should be reported through metadata/status and retried or skipped according to plan-owned policy.

## Evals And Benchmarks

Before claiming this work is complete, add evals/benchmarks for:

- direct raw MCP output vs observed routed MCP output,
- GitHub-like issue/PR/search output,
- mutating MCP response output,
- web search output,
- fetch output,
- code-search output preserving exact snippets,
- sensitive-provider metadata-only persistence,
- vault-wide search over previously routed outputs,
- deterministic derive over routed outputs,
- script derive over one and multiple vault sources,
- routing failure fail-open behavior,
- Pi host capability reporting, with Claude/Codex adapter work explicitly deferred.

Benchmark claims should report:

- raw bytes/lines/items,
- returned evidence bytes/lines/items,
- recovery availability,
- exact facts preserved,
- omitted count,
- runtime overhead,
- failure rate.

Do not claim superiority over Context Mode until these benchmarks include comparable real or fixture outputs.

## Acceptance Criteria

Observed routing:

- Enabled MCP server output is routed after direct tool calls on hosts with output replacement.
- Disabled or unconfigured MCP server output is not modified.
- Read-like, write-like, and unknown tool outputs all route when producer is enabled.
- Replacement output preserves exact critical facts and recovery instructions.
- Routing failure fails open with warning.
- Pi observed routing is smoke-tested.
- Claude/Codex observed-routing adapters are not claimed as implemented in this work; they remain deferred future host adapters.

Reducers:

- MCP, web search, fetch, code-search, JSON, and generic text reducers have deterministic tests.
- Reducers preserve identifiers, URLs, paths, line numbers, errors, status, and code snippets.
- Large/noisy outputs are bounded and recoverable according to persistence policy.

Vault index:

- Fresh sessions start with an empty vault index.
- The vault is source truth; the index is a sidecar search layer, not a replacement for vault records or raw recovery.
- Persisted outputs are indexed incrementally after each successful vault append.
- The write path is write-through: once a record is persisted, the index receives `indexRecord(record, text, metadata)` for that record.
- Thresholds may batch, debounce, compact, or rebuild index storage as an optimization, but they are not correctness gates for whether persisted output becomes indexable.
- `exact` persistence indexes deterministic text chunks plus producer and recovery metadata.
- `metadata-only` persistence indexes metadata, counts, hashes, producer identity, timestamps, and routing facts only; it must not index raw content.
- `none` persistence creates no index entry.
- `freeflow_retrieve` can query vault-wide evidence with filters.
- Vault index does not index repo source files as a replacement for live repo retrieval.
- Index failures do not break routing or raw vault recovery; status reports degraded/stale index state and rebuild need.

Script derive:

- `freeflow_derive` supports deterministic and script operation branches.
- Script operations run only through a sandbox adapter.
- JavaScript, Python, and jq/equivalent structured-data scripts are supported when adapters are available.
- Scripts cannot access network, env secrets, home, repo root, or vault paths directly.
- Script output is routed, recoverable according to policy, and lineage-linked to sources.

Cleanup:

- Public Pi `freeflow_capture` and the hardcoded Serena bridge are removed after Pi observed routing evidence passes.
- Docs, skills, setup, status, and eval reports match implemented behavior.

## Decisions Made

- Observed post-tool routing is the primary path for MCP/web/code-search outputs.
- Current implementation targets Pi only; Claude/Codex adapters are deferred until Pi observed routing and the general output router are proven.
- Config is explicit opt-in per producer/server.
- Setup may offer to enable all currently configured MCP servers, but persisted config stores explicit entries.
- The user must choose persistence per enabled producer/server; the agent/setup flow may recommend defaults but must not silently decide privacy/storage policy.
- Supported persistence modes for this work are `exact`, `metadata-only`, and `none`; `redacted` is a future feature, not a current option.
- Host execution and permissions stay with the host.
- Freeflow routes outputs after execution.
- Read/write classification is metadata, not a routing gate.
- Pi public `freeflow_capture` is hard removed after Pi observed routing evidence passes.
- Vault indexing is in scope; repo indexing is out of scope.
- `freeflow_derive` remains one public tool with deterministic and script operation branches.
- Script derive requires sandboxed execution and has no unsandboxed fallback.

## Open Implementation Choices

These are plan-owned choices, not unresolved product decisions:

- exact vault-index storage engine,
- exact reducer output caps per producer,
- exact script sandbox adapter implementation per host/platform,
- future Claude/Codex adapter packaging after Pi and the general router are complete,
- future redaction design if the project later decides to support redacted persistence.
