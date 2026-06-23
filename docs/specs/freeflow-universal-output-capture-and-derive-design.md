# Freeflow Universal Output Capture And Derive Design

> **Doc ID:** SPEC-2026-06-20-freeflow-universal-output-capture-derive
> **Date:** 2026-06-20
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft — Slice 0 decisions approved
> **Source:** Research/grilling session on Serena, codebase-memory-mcp, Context Mode, provider support, universal capture, derive, and 2026-06-22 owner approval for Slice 0 public-contract decisions.

## Change Log

- 2026-06-22: Approved Slice 0 decisions for evidence identity/recovery, top-level capture/provider config, and MCP/Serena-first read-only adapter validation.
- 2026-06-22: Slice 4 validated the first production-safe adapter in Pi by installing/configuring Serena through `pi-mcp-adapter`, adding an explicit MCP stdio bridge for allowlisted Serena read-only symbol/reference/diagnostic tools, and registering public `freeflow_capture` while preserving mutating-provider rejection.
- 2026-06-22: Slice 5A added core deterministic `freeflow_derive` for vault-source regex filtering and match counting with lineage, bounded routing, exact derived-output recovery, and structured derive failures. Pi registration remains deferred to Slice 5E.
- 2026-06-22: Slice 5B added deterministic `jsonExtract` for vault-source JSON Pointer and limited JSON path extraction, with invalid JSON/path failure handling. Pi registration remains deferred to Slice 5E.
- 2026-06-22: Slice 5C added deterministic `groupByRegex`, `dedupe`, and `topN` derive operations for vault sources. Pi registration remains deferred to Slice 5E.
- 2026-06-22: Slice 5D added deterministic `extractUrls`, `extractCitations`, `lineStats`, and `sizeStats` derive operations for vault sources. Pi registration remains deferred to Slice 5E.
- 2026-06-22: Slice 5E registered public Pi `freeflow_derive` with schema, execution, rendering, and guidance after deterministic core operations were verified.
- 2026-06-23: Slice 6 added built-in provider manifests and compact Pi runtime provider summaries without injecting raw provider docs.
- 2026-06-23: Slice 7 added high-level output-router/capture/provider config validation and setup guidance while keeping minimal setup default-only and direct host-tool capture off.
- 2026-06-23: Slice 8 added public Pi `freeflow_status` diagnostics for effective config, vault writability, provider availability, custom manifest validity, and non-destructive migration recommendations.

## Purpose

Define the next shape of Freeflow Router after command-output routing: a transparent, adapter-based evidence system that can capture service/protocol producer outputs, recover them according to policy, and derive bounded evidence from existing captured sources.

This spec extends `docs/specs/freeflow-output-router-design.md`. It tracks the intended tool family and slice status; later slices remain design until implemented and verified.

## Problem

Freeflow Router currently handles two major evidence paths well:

- local command output through `freeflow_run`, and
- existing repo/vault evidence through `freeflow_retrieve`.

That is not enough for modern coding-agent work. Useful evidence often comes from service/protocol producers such as web search, fetched pages, code search, MCP servers, Serena, codebase-memory-mcp, GitHub tools, and future provider adapters.

If those producer results enter context directly, Freeflow loses the guarantees that make the router useful:

- raw evidence may not be recoverable,
- large results can flood context,
- derived conclusions can become detached from their source,
- provider-specific capabilities are unclear to the agent,
- hidden routing would violate Freeflow's no-surprise philosophy.

Freeflow needs a general evidence model without becoming a hidden interception layer or a clone of other tools.

## Intended Outcome

Freeflow should provide a small, explicit tool family:

| Tool | Primary job |
| --- | --- |
| `freeflow_run` | Produce evidence from local commands and route command output. |
| `freeflow_capture` | Produce evidence from read-only service/protocol producers and route their output. |
| `freeflow_retrieve` | Query, recover, expand, and explain existing evidence. |
| `freeflow_derive` | Transform existing evidence into bounded derived evidence. |

The agent chooses these tools deliberately. Freeflow should explain what each tool does, when to use it, what producer was called, what was captured, what was routed, and how to recover raw output when exact recovery is available.

## Philosophy

Freeflow should not follow hidden-compaction-first systems where the agent calls a normal tool and receives an unexpectedly transformed result.

The core rule is:

```text
The agent chooses a Freeflow tool when it wants Freeflow behavior.
```

Freeflow-mediated calls are explicit. Native/direct host tools remain available when direct behavior is intended.

Optional host-hook capture may exist as a safety net, but it is secondary. It must not be the primary design path.

## Runtime Determinism

`freeflow_capture` and `freeflow_derive` should follow the existing Output Router determinism rule: initial routing uses code, templates, deterministic parsers, and exact evidence assembly. Do not rely on model-assisted summarization or classification inside the runtime unless a later explicit design approves that capability.

## Slice 0 Decisions

The following public-contract decisions were approved on 2026-06-22:

1. **Identity and recovery split.** Every universal evidence record gets a conceptual `recordId`. Vault recovery uses a separate `recoveryOutputId` when persisted content is recoverable. Existing exact command-output recovery keeps the current `outputId` compatibility path. Do not emit or document an id as exact raw recovery unless `recoverability` is `exact`.
2. **Config shape.** `capture` and `providers` are top-level config sections. `outputRouter` remains responsible for router thresholds, vault settings, and native post-tool routing. Minimal setup still writes only `defaultMode` unless the user explicitly opts into router/capture/provider config.
3. **First real adapter target.** Core capture tests use a deterministic fixture adapter first. The first production-safe read-only adapter target is MCP, with Serena read-only symbol/reference/diagnostic calls used as the live smoke provider when the host exposes a safe MCP call surface. If the host cannot safely call MCP read-only producers, public `freeflow_capture` exposure waits instead of faking support.

## Glossary

### Producer

A thing that produces output.

### Local command producer

A producer invoked as a local command in the workspace, usually through shell/bash.

Examples:

- `npm test`
- `git diff --stat`
- `node scripts/analyze.js`
- `python check.py`

Owned by `freeflow_run`.

### Service/protocol producer

A read-only producer that gets output through a service, protocol, provider, or host tool surface rather than a local command.

Examples:

- web search
- fetched URL content
- code search
- read-only MCP tool call
- Serena MCP symbol/reference/diagnostic queries
- codebase-memory-mcp graph/search/architecture queries
- provider-backed GitHub/Jira/internal read queries

Owned by `freeflow_capture` when a host adapter supports the read-only producer.

### Existing evidence

Content that already exists and can be queried or recovered.

Examples:

- repo files
- vault records
- captured command output
- captured web/fetch result
- captured MCP/provider result
- derived output

Owned by `freeflow_retrieve`.

### Derived evidence

A bounded result computed from existing evidence.

Examples:

- regex-filtered failure blocks from a long test log
- counts grouped by file
- JSON field extraction
- deduped URLs/citations
- top N lines by a deterministic score

Owned by `freeflow_derive`.

### Provider manifest

A Freeflow-owned or user-owned structured description of a service/protocol producer's capabilities and tool-choice guidance. Provider manifests drive compact runtime context summaries.

## Tool Boundaries

### `freeflow_run`

Use when producing evidence from a local command.

Responsibilities:

- execute the command through the host-approved runner,
- capture raw stdout/stderr before transformation,
- route output into bounded evidence,
- preserve exact recovery with `outputId`,
- keep command status, routing status, and parser status separate.

Non-goals:

- call web/MCP/provider tools directly,
- wrap arbitrary host tools,
- manage provider manifests.

### `freeflow_capture`

Use when producing evidence from a read-only service/protocol producer.

Responsibilities:

- call a supported read-only producer adapter,
- capture raw visible result and structured metadata,
- route the result into bounded evidence in the same tool call,
- expose producer lineage,
- preserve recovery according to the result's recoverability mode,
- respect producer privacy and persistence policy.

Non-goals:

- magically proxy every host tool on every platform,
- execute shell commands,
- invoke mutating provider operations,
- transform already-captured evidence after the fact.

Mutating provider tools such as Serena `rename_symbol`, file/body replacement tools, GitHub issue creation, Jira transitions, deploys, restarts, or other state-changing actions should be called directly through their owning tool surface after explicit user intent. Freeflow should inspect, review, and verify the resulting state or diff; `freeflow_capture` should not mediate the mutation.

Representative shape:

```json
{
  "producer": {
    "kind": "mcp",
    "server": "serena",
    "tool": "find_symbol"
  },
  "args": {
    "name_path_pattern": "Calculator"
  },
  "preserve": "important"
}
```

A host adapter may expose only the read-only producers it can safely call. Unsupported or mutating producers are unavailable through `freeflow_capture` rather than silently proxied.

### `freeflow_retrieve`

Use when evidence already exists.

Responsibilities remain:

- `query` for best matching evidence,
- `locate` candidate paths or records,
- `retrieve` exact known evidence,
- `expand` prior evidence,
- `explain` routing or recovery decisions.

`freeflow_retrieve` should not execute arbitrary code. It should remain the recovery/query interface.

### `freeflow_derive`

Use when transforming existing evidence into a bounded derived result.

Responsibilities:

- accept one or more existing evidence sources,
- apply deterministic derivation operations first,
- capture derived output as a new vault record,
- route derived output,
- preserve lineage back to source evidence,
- make clear that derived evidence does not replace source evidence.

Representative shape:

```json
{
  "source": {
    "kind": "vault",
    "outputId": "ffout_...",
    "stream": "combined"
  },
  "operation": {
    "kind": "regexFilter",
    "pattern": "FAIL|ERROR",
    "contextLines": 3,
    "maxMatches": 50
  },
  "preserve": "important"
}
```

Script derive is a later implementation phase after sandbox/security design. Deterministic derive comes first.

## Universal Evidence Record

All produced or captured outputs should be represented by a producer-agnostic record.

Conceptual fields:

```ts
type FreeflowEvidenceRecord = {
  recordId: string;
  createdAt: string;
  sessionId?: string;
  cwd?: string;
  producer: {
    kind: "command" | "web" | "fetch" | "code_search" | "mcp" | "provider" | "derive";
    adapter?: string;
    name?: string;
    server?: string;
    tool?: string;
  };
  input: {
    summary?: string;
    argsHash?: string;
    redaction?: "none" | "metadata-only" | "redacted";
  };
  output?: {
    mediaType?: string;
    text?: string;
    json?: unknown;
    streams?: {
      stdout?: string;
      stderr?: string;
      combined?: string;
    };
  };
  stats: {
    bytes?: number;
    lines?: number;
    hash?: string;
  };
  routing: {
    status: "routed" | "passed_through" | "partial" | "failed";
    reason: string;
  };
  persistence: {
    status: "vaulted" | "redacted" | "metadata_only" | "not_persisted";
    recoverability: "exact" | "redacted" | "metadata_only" | "none";
    recoveryOutputId?: string;
    outputId?: string; // compatibility alias for existing exact command-output recovery
  };
  lineage?: {
    sourceRecordIds?: string[];
    sourceOutputIds?: string[]; // compatibility references for current exact vault records
    operation?: string;
    operationHash?: string;
  };
};
```

The exact TypeScript shape may differ, but these concepts must remain visible in results and, when persisted, recoverable from vault metadata.

`recordId` is the universal record identity. `recoveryOutputId` is the vault recovery handle for persisted recoverable content. Existing `freeflow_run` and `freeflow_retrieve` paths keep `outputId` as the backward-compatible exact raw recovery id for command-output records. New capture/derive results should not rely on a single `outputId` to mean both record identity and recovery. Do not imply exact raw recovery from any id unless `recoverability` is `exact`.

## Lineage And Recovery

Every produced/captured/derived output must expose:

- producer kind/name,
- input summary or hash,
- routing status and reason,
- persistence status,
- recoverability mode,
- recovery instructions when any recovery is available.

Recoverability modes:

| Mode | Meaning |
| --- | --- |
| `exact` | Raw captured output is recoverable by `recoveryOutputId`; current command records also expose `outputId` for backward-compatible exact recovery. |
| `redacted` | Redacted output is recoverable by `recoveryOutputId` when persisted, but exact raw output is intentionally unavailable. |
| `metadata_only` | Only metadata was persisted; no content recovery should be promised. |
| `none` | Nothing was persisted; result must say recovery is unavailable. |

Derived evidence must also expose:

- source evidence references,
- derived `recordId` and recovery id when persisted,
- operation kind,
- operation hash where applicable.

Rule:

```text
Derived evidence never replaces source evidence. It points back to source evidence.
```

If exact recovery is unavailable because of privacy, redaction, sensitive-producer policy, or storage failure, the result must say so explicitly instead of returning a misleading exact-recovery instruction.

## Adapter-Based Capture

`freeflow_capture` is adapter-based.

Freeflow core defines producer/capture/result contracts. Host adapters implement concrete producer adapters where the host exposes a safe call surface.

Examples:

- Pi adapter may expose producers that Pi can safely call or bridge.
- MCP-capable hosts may expose MCP producer adapters.
- Hosts without a producer call surface may omit that adapter.
- Hook-based observation can capture direct tool results only when configured and available.

This avoids promising a universal magical proxy that cannot be portable across agent harnesses.

First adapter validation path:

- deterministic fixture producer for core capture/routing/failure tests,
- MCP read-only adapter as the first production-safe target if the host exposes a safe MCP call surface,
- Serena read-only symbol/reference/diagnostic calls as the live smoke provider for proving MCP capture works,
- no public `freeflow_capture` registration until at least one production-safe read-only adapter is verified.

## Provider Manifests

Provider manifests describe known service/protocol producers in capability terms.

Example shape:

```json
{
  "id": "serena",
  "displayName": "Serena",
  "producerKind": "mcp",
  "capabilities": [
    {
      "id": "code.symbol.find",
      "useWhen": "Need real code-symbol discovery.",
      "risk": "read"
    },
    {
      "id": "code.references.find",
      "useWhen": "Need real references, not text matches.",
      "risk": "read"
    },
    {
      "id": "code.diagnostics.read",
      "useWhen": "Need read-only diagnostics from the language backend.",
      "risk": "read"
    }
  ],
  "pairingRules": [
    "Use Serena through freeflow_capture for read-only symbol, reference, and diagnostic evidence.",
    "Call Serena mutating refactor tools directly only after explicit user intent; then use Freeflow retrieve/run/review/verify for evidence and closeout."
  ]
}
```

Capabilities in provider manifests should describe bounded use-cases and seams, not mirror every provider operation. A manifest should help the agent choose the right capability category; detailed provider tool surfaces stay available on demand.

### Built-In Manifests

Freeflow-shipped manifests are trusted package content, but runtime injection should still be compact and schema-rendered.

Rules:

- version with Freeflow,
- keep always-loaded summaries short,
- render summaries deterministically,
- load detailed docs on demand only.

### Custom Manifests

User/repo custom manifests are allowed, but they are user-owned.

Rules:

- explicit enablement required,
- schema validation required,
- label as custom/unverified in doctor/status,
- do not inject arbitrary raw markdown by default,
- user owns correctness and maintenance.

## Runtime Context Injection

Runtime should inject compact active-provider summaries, not full provider documentation.

Example:

```md
## Freeflow Producer Providers

Available:
- Serena: use through freeflow_capture for read-only code symbols, references, and diagnostics.
  Pairing: Serena locates code evidence; Freeflow preserves recoverable evidence, verification, and closeout. Call mutating Serena refactors directly after explicit user intent.

Unavailable but configured:
- codebase-memory: MCP server not reachable.
```

If no providers are configured or available, omit the section or keep it to one line.

## Config Model

Setup should ask about Output Router/capture/providers. Minimal setup does not need to stay silent about important router features.

Config should store high-level user decisions and intentional overrides, not every low-level effective default.

Approved high-level shape:

```json
{
  "defaultMode": "workflow",
  "outputRouter": {
    "enabled": true,
    "profile": "standard",
    "postToolRouting": "off"
  },
  "capture": {
    "freeflowMediated": "raw",
    "directHostTools": "off"
  },
  "providers": {
    "enabled": [
      {
        "id": "serena",
        "mode": "discovery"
      }
    ]
  }
}
```

Runtime owns evolving defaults behind profiles. Explicit low-level values are written only when the user chooses them. `capture` and `providers` stay top-level so setup, doctor/status, and future adapters can describe producer policy without overloading `outputRouter`.

This config shape is now accepted by the Slice 7 parser for high-level setup decisions. Runtime behavior still only implements supported policies; direct host-tool capture remains off beyond existing explicit native safety-net routing.

A future doctor/migrate command should show effective config and recommend cleanup for stale explicit defaults.

## Privacy And Storage Defaults

Default behavior:

- Freeflow-mediated read-only calls capture raw output when the producer policy allows exact recovery.
- Direct host-tool capture is off unless explicitly enabled.
- Sensitive producers may force metadata-only, redaction, confirmation, or no persistence.
- User-local cache/vault is the default storage location.
- Repo-local storage requires explicit configuration.

Freeflow should never persist secrets intentionally. Results must distinguish exact, redacted, metadata-only, and unavailable recovery. Redaction policy needs separate design before broad direct host-tool capture is enabled.

## Failure Contracts

Capture and derive failures should return structured results instead of ambiguous empty evidence.

Required failure cases:

- adapter unavailable,
- configured provider unavailable,
- unsupported producer,
- mutating producer requested through `freeflow_capture`,
- producer execution failure,
- partial capture,
- storage/vault failure,
- redaction failure,
- derive source unavailable,
- derive operation validation failure,
- derive operation execution failure.

Failures should keep these statuses separate:

- `toolStatus`: whether the Freeflow tool itself succeeded,
- producer/execution status: whether the underlying producer or derive operation succeeded,
- `routing.status`: whether routing produced usable evidence,
- `persistence.status`: whether raw/redacted/metadata output was persisted,
- `recoverability`: what can be recovered later.

When a failure still yields captured raw or partial output, preserve recovery according to the recoverability mode. When nothing was persisted, say recovery is unavailable.

## Deterministic Derive Operations

The deterministic derive phase should include:

- regex filter with context,
- count matches,
- JSON pointer/path extraction,
- group by regex,
- dedupe,
- top N / sort-limited extraction,
- extract URLs/citations,
- line stats / size stats.

All derived outputs are captured as new evidence records and routed before entering context.

## Script Derive Phase

Script derive is intentionally separate from deterministic derive.

Before script derive implementation, define:

- sandbox model,
- allowed languages,
- input mounting model,
- filesystem permissions,
- network policy,
- timeout policy,
- output caps,
- failure behavior,
- lineage and operation hashing,
- verification/eval requirements.

No arbitrary code execution should be hidden inside `freeflow_retrieve`.

## Setup Flow

`/setup-freeflow` should include one explicit Output Router/capture/provider decision point.

Recommended flow:

1. Determine host target and existing instruction conflicts.
2. Ask whether Output Router/capture/provider support should be enabled.
3. If no, proceed with normal setup.
4. If yes, ask only path-changing follow-ups:
   - router profile,
   - direct host-tool capture policy,
   - providers to enable,
   - provider mode such as discovery-only or broader read-only evidence categories.
5. Persist high-level decisions in `.freeflow/config.json`.
6. Verify effective config and show what is enabled.

Do not dump all defaults into config. Use doctor/status to show effective defaults.

## Doctor / Status / Migration

Future diagnostics should report:

- Freeflow mode and router profile,
- vault path and writability,
- capture policies,
- enabled providers,
- provider availability,
- custom manifest validation,
- stale/deprecated config keys,
- effective defaults inherited from profiles,
- direct host-tool capture status.

Migration should recommend config edits and require confirmation before rewriting user-owned config.

## Relationship To Other Tools

### Serena

Serena should remain a provider for symbol-aware code navigation and diagnostics through read-only capture. It is the first intended live smoke provider for testing whether MCP-backed `freeflow_capture` works in a real host, limited to read-only symbol, reference, and diagnostic calls. Mutating Serena refactors should be direct provider tool calls after explicit user intent, followed by Freeflow review and verification. Freeflow should not implement its own LSP/refactor engine to compete.

### codebase-memory-mcp

CBM should remain a provider for graph, architecture, call-path, and impact analysis. Freeflow should not implement a persistent code graph as core router behavior.

### Context Mode

Context Mode validates useful patterns: compact routing summaries, context-saving, “think in code,” and session capture. Freeflow should learn from those patterns without copying hidden mandatory routing or broad automatic persistence.

## Implementation Phase Checklist

### Phase: design consolidation

- Align this spec with `docs/specs/freeflow-output-router-design.md`.
- Apply the approved identity/recovery split: `recordId` for record identity, `recoveryOutputId` for persisted recovery, and `outputId` as the exact command-output compatibility path.
- Keep `capture` and `providers` as top-level config sections.
- Validate capture with fixture tests first, then MCP read-only/Serena as the first real adapter smoke when host capability exists.
- Define final TypeScript types for evidence records and producer descriptors.

### Phase: universal evidence record

- Generalize vault metadata beyond command output.
- Preserve backwards compatibility for current `ffout_*` records.
- Add lineage metadata.
- Add query filters for producer kind/name/source.

### Phase: `freeflow_capture`

- Define read-only producer adapter interface.
- Implement one or more supported read-only producer adapters.
- Route captured output through existing evidence assembly where possible.
- Reject mutating producers through `freeflow_capture` with a clear result.
- Add tests for unsupported producers, mutating producers, and provider-unavailable results.

### Phase: deterministic `freeflow_derive`

- Implement deterministic operations.
- Capture derived output as a new evidence record.
- Preserve source lineage.
- Route huge/messy derived output safely.

### Phase: provider manifests

- Add built-in manifest format.
- Add compact runtime provider summary rendering.
- Add custom manifest validation and labeling.

### Phase: setup/config

- Update `/setup-freeflow` behavior after approval.
- Add config validation for high-level capture/provider decisions.
- Keep existing minimal decisions when router/capture is declined.

### Phase: diagnostics

- Add doctor/status surface for router/capture/provider state.
- Add migration recommendations for stale explicit config.

### Phase: script derive

- Design sandbox/security contract.
- Implement only after deterministic derive is verified.

## Verification And Evals

Required evidence before completion claims:

- unit tests for evidence record metadata and lineage,
- capture adapter tests,
- derive operation tests,
- large-output routing tests for captured and derived outputs,
- provider manifest rendering tests with token caps,
- config validation tests,
- setup flow tests,
- safety tests for direct host-tool capture off by default,
- read-only enforcement tests for `freeflow_capture`,
- failure-contract tests for unavailable providers, unsupported producers, partial capture, storage failure, and derive failure,
- recoverability tests for exact, redacted, metadata-only, and unavailable recovery,
- recovery tests from original and derived recovery ids when exact recovery is available, including existing `outputId` compatibility for command-output records.

Useful evals:

- Freeflow current router vs capture/derive on web/MCP-shaped output,
- direct read-only provider output vs `freeflow_capture` bounded evidence,
- long log manual inspection vs deterministic derive,
- Serena/CBM provider summaries for tool-choice accuracy,
- context bloat comparison without adopting hidden routing.

## Open Questions

Resolved in Slice 0:

- Universal evidence uses `recordId` for identity and separates recovery through `recoveryOutputId` / existing exact `outputId` compatibility.
- `capture` and `providers` are top-level config keys, not nested under `outputRouter`.
- The first real read-only adapter target is MCP, with Serena read-only symbol/reference/diagnostic calls as the live smoke provider when host capability exists.

Still open for later slices:

- Exact producer adapter interface details.
- How much provider availability should runtime inject when unavailable.
- Whether a later side-effect provider-operation interface is needed, or direct provider calls remain the permanent mutation path.
- Whether direct host-tool capture should ever be recommended outside strict user opt-in.
- How custom manifests are discovered and loaded.
