# Freeflow Output Router Design

> **Doc ID:** SPEC-2026-06-16-freeflow-output-router
> **Date:** 2026-06-16
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** 2026-06-16 output-routing design discussion; `docs/specs/freeflow-capability-and-output-routing-spec.md`; Pi extension/skill behavior reviewed earlier in the same design thread.

## Purpose

Define the master design for Freeflow Router's output-routing layer.

This spec focuses on routing tool output into the model context safely and intentionally. It is detailed enough to support a later implementation plan, but it is not itself an execution plan.

## Problem

Agent harnesses expose powerful native tools such as `read` and `bash`. Those tools are useful because they are direct and predictable, but they can flood the model context when used for broad exploration, long command output, large logs, or oversized files.

The failure mode is not only "large output exists." The deeper issue is that irrelevant output enters context before the agent has proven it needs that output.

Freeflow needs a routing layer that helps the agent:

- retrieve targeted evidence before reading whole artifacts,
- capture command output without dumping all of it into context,
- preserve exact raw evidence outside context,
- escalate from compact evidence to wider/raw evidence when needed,
- avoid surprising the agent by silently changing native tool semantics.

## Intended Outcome

Freeflow Router should provide a small, agent-aware output-routing system:

- Host-native tools remain available and direct.
- Freeflow routed tools are explicit and context-efficient.
- Raw evidence is captured before transformation.
- Routed results are labeled, explainable, and recoverable.
- Optional safety net routing can protect context from oversized native outputs.
- The core design remains portable to Pi first, then Claude Code and Codex adapters.

## Relationship To Capability Routing

Capability/skill routing is future work.

Output routing comes first because it provides the retrieval, vault, evidence-packet, and explanation primitives that capability routing may later reuse. This spec intentionally does not design the skill/plugin/MCP capability router in detail.

## Product Boundary

This is a master design for an optional Freeflow Router companion runtime. Existing Freeflow skills should not depend on the output-router runtime being available.

When the router is available, the host-portable `output-router` skill should still prefer routed tools for their intended cases: `freeflow_retrieve` for exploration/targeted evidence and `freeflow_run` for likely-large/noisy command output. Native tools remain valid for intentional full/raw/direct work.

The implementation path should follow the priority checklist in this spec, not a versioned shipping timeline. Avoid reviving older `v0` framing unless a later plan explicitly chooses that release structure.

## Core Principles

1. **Agent-aware tool choice.** The agent should know whether it is using host-native tools or Freeflow routed tools.
2. **No surprise semantics.** If native output is transformed by an optional safety net, the returned result must say so and provide a recovery path.
3. **Explicit routed tools first.** Freeflow should primarily work through its own tools, not by overriding native tools.
4. **Capture raw first, transform second.** Never destroy raw evidence before routing, summarizing, or chunking it.
5. **Retrieve before full read.** For existing unknown information, retrieve targeted evidence before reading whole files.
6. **Compress/extract command output before dumping logs.** For commands likely to produce noisy output, capture raw output and return the smallest useful result.
7. **Full fidelity is not unlimited context injection.** `preserve: full` means exact unsummarized fidelity. If content is too large, return exact chunks plus a vault pointer.
8. **Post-tool safety net is opt-in.** Native tool routing is disabled by default and can be enabled by config.
9. **Core portable, adapters host-specific.** Pi can have the strongest adapter, but the core model must also work through CLI/MCP and hooks later.
10. **Deterministic runtime first.** The router runtime should use code, templates, and deterministic parsers. Do not rely on model-assisted summarization or classification in the first implementation.

## Runtime Determinism

Freeflow Router is a deterministic runtime for now.

Fields such as `reason`, `summary`, `why`, and `recovery.how` are filled by the Freeflow tool implementation, not by the assistant after the fact.

The runtime can generate those fields from:

- policy branches,
- thresholds,
- matched paths/headings/search snippets,
- command exit code,
- parseable pass/fail/error markers,
- exact line ranges,
- recovery templates.

No model-assisted summarization, classification, or interpretation should run inside `freeflow_retrieve` or `freeflow_run` for the first implementation.

If deterministic extraction cannot safely produce a summary, the result should say so and return exact important lines or a recovery path instead of inventing an interpretation.

## Tool Model

### Host-Native Tools

Host-native tools keep their normal meaning.

For Pi, this means:

- `read`: direct file read, especially for whole known files/artifacts.
- `bash`: direct shell command execution, especially when output is expected small or exact raw behavior is intended.
- `edit` / `write`: file mutation tools.

Freeflow should not globally override native `read` or `bash` semantics.

### Freeflow Routed Tools

Freeflow Router exposes two primary routed tools everywhere possible:

- `freeflow_retrieve`
- `freeflow_run`

Use the same tool names across Pi, future MCP adapters, and CLI wrappers when possible.

### Tool Choice Policy

```text
Need existing repo/vault information?     freeflow_retrieve
Need more from captured output?           freeflow_retrieve with vault source
Need to run likely-large/noisy command?   freeflow_run
Need whole known file/artifact?           native read
Need direct shell behavior/raw output?    native bash
Need to edit files?                       native edit/write
```

The routing policy lives mostly inside the Freeflow tools, so the agent does not need to solve a meta-routing problem on every request.

## Preserve And Expansion Model

Freeflow tools use two separate concepts:

### Preserve Controls Fidelity

```text
summary    compact aggregate/summary is acceptable
important  exact important evidence lines/snippets are required
full       exact unsummarized fidelity is required
```

### Expansion Controls Breadth

```text
exact/small -> ±30 lines -> ±80 lines -> section/symbol -> full with reason
```

`preserve` answers: "How exact must the evidence be?"

Expansion answers: "How much surrounding context is needed?"

These should not be collapsed into one setting.

## `freeflow_retrieve`

`freeflow_retrieve` is for existing content.

Initial source types:

- local repo files,
- Freeflow vault records.

Future source types:

- web/fetched content,
- MCP resources and MCP tool outputs,
- custom tool outputs beyond the optional native safety net,
- external indexed stores.

Structural code indexing is also deferred. The first retrieval implementation can use cheap lexical, path, heading, and snippet search; symbol ranges, callsites, and semantic indexes can be added after local repo and vault retrieval work.

### Actions

One action-based tool should cover retrieval phases:

```text
query     locate and retrieve the best evidence packets
locate    return candidate locations without full evidence
retrieve  retrieve an explicit path/span/source
expand    widen a previous evidence packet
explain   explain a route/decision/output id
```

### Default Behavior

Default `preserve` should be `important`.

`freeflow_retrieve` should return evidence packets by default. It should not become an answering agent.

### Retrieval Escalation

For `preserve: important`:

```text
1. locate candidate spans using cheap metadata/search
2. return exact relevant spans
3. expand to ±30 lines if insufficient
4. expand to ±80 lines if still insufficient
5. return whole section/symbol when span boundaries are too narrow
6. full file/content only with a recorded reason
```

For `preserve: summary`:

```text
1. locate candidate areas
2. return heading/symbol/section summaries with citations
3. include exact anchors when needed
4. escalate to important spans if summary cannot support the goal
```

For `preserve: full`:

```text
1. return full exact content when under cap
2. when over cap, vault/reference exact content and return exact chunk/index/head-tail metadata
3. allow follow-up exact chunk retrieval
4. do not summarize unless explicitly requested
```

### Candidate Schema

```json
{
  "action": "query",
  "query": "Pi before_agent_start system prompt injection",
  "source": { "kind": "repo", "scope": "docs" },
  "preserve": "important"
}
```

Vault retrieval example:

```json
{
  "action": "query",
  "query": "second failing test stack trace",
  "source": { "kind": "vault", "outputId": "ffout_123" },
  "preserve": "important"
}
```

## `freeflow_run`

`freeflow_run` is for command output that does not exist yet.

It runs a command once, captures raw output, writes it to the vault, then returns a routed result suitable for the stated goal.

### Candidate Schema

```json
{
  "command": "npm test",
  "goal": "get pass/fail counts and failing tests",
  "preserve": "important",
  "cwd": "."
}
```

### Default Behavior

`freeflow_run` should:

1. execute the command,
2. capture stdout, stderr, combined output, execution status, exit code, and timing,
3. store raw output in the session-linked vault,
4. apply deterministic routing policy using `goal`, command shape, size, and execution status,
5. return the smallest result that satisfies `preserve`, plus an output id.

### Run Escalation

For `preserve: summary`:

```text
1. structured summary or aggregate extraction
2. summary plus exact anchors if needed
3. important lines if summary alone is insufficient
4. full exact chunks only when needed
```

For `preserve: important`:

```text
1. exact important lines/snippets
2. widen around important lines
3. group repeated failures/errors
4. broader compressed output with raw pointer
5. full exact chunks only when exact snippets are insufficient
```

For `preserve: full`:

```text
1. return full raw output when under cap
2. when over cap, vault full raw output and return exact chunk/index/head-tail metadata
3. allow follow-up exact chunk retrieval through freeflow_retrieve
```

### Failure Output

Command failures are exactness-sensitive.

If a command fails:

- always capture raw output,
- if output is small, return exact raw failure output,
- if output is large, return execution status, exit code, exact error lines, useful surrounding snippets, and the raw output id,
- never return a success-looking summary for a failed command.

### Verification Output

Verification output used to support completion claims is exactness-sensitive, even when the command succeeds.

When `freeflow_run` is used to verify work before saying something is done, passing, fixed, or ready, the routed result must preserve the exact evidence needed for that claim:

- command and cwd when relevant,
- execution status and exit code,
- exact pass/fail summary lines or tool-reported counts,
- exact failure/error snippets when failed,
- raw output id and recovery path.

Freeflow may summarize repetitive logs around that evidence, but it must not replace claim-supporting lines with paraphrase. If the caller requested `preserve: summary`, the router should still escalate to exact important lines for claim-supporting verification evidence.

Command records should include execution status:

```text
success | failed | timed_out | cancelled
```

This is separate from whether the Freeflow tool itself ran successfully.

## Routed Result Contract

Every routed result should include enough context for the agent to know what happened.

### Status Field Semantics

Do not use a single ambiguous `status` field for command results.

Use separate status concepts:

```text
toolStatus        whether the Freeflow tool call completed: ok | error
execution.status  whether the command/test/process succeeded: success | failed | timed_out | cancelled
routing.status    whether output routing completed: routed | passed_through | partial | failed
```

For example, failed tests can produce:

```json
{
  "toolStatus": "ok",
  "execution": { "status": "failed", "exitCode": 1 },
  "routing": { "status": "routed" }
}
```

That means the Freeflow tool worked, the underlying command failed, and output routing succeeded.

Candidate fields for retrieval:

```json
{
  "toolStatus": "ok",
  "decisionId": "ffdec_123",
  "routing": {
    "status": "routed",
    "route": "retrieve",
    "reason": "The query is answerable from a bounded docs span; full file read was unnecessary."
  },
  "preserve": "important",
  "source": { "kind": "repo", "path": "docs/extensions.md" },
  "evidence": [
    {
      "id": "ev_1",
      "path": "docs/extensions.md",
      "lines": "512-540",
      "excerpt": "...",
      "why": "Matched heading/search evidence for before_agent_start system prompt injection.",
      "window": "exact",
      "expandable": true
    }
  ],
  "recovery": {
    "how": "Use freeflow_retrieve action=expand with evidenceId=ev_1 for more context."
  }
}
```

For command output:

```json
{
  "toolStatus": "ok",
  "decisionId": "ffdec_456",
  "outputId": "ffout_123",
  "execution": { "status": "failed", "exitCode": 1 },
  "routing": {
    "status": "routed",
    "route": "run",
    "reason": "Large failed test output was captured; exact failure lines returned with raw output recoverable from vault."
  },
  "summary": "Deterministic extraction found 3 failure markers and 214 pass markers.",
  "importantLines": [
    { "stream": "stderr", "lines": "120-148", "excerpt": "..." }
  ],
  "recovery": {
    "how": "Use freeflow_retrieve with source.kind=vault and outputId=ffout_123 to retrieve more exact output."
  }
}
```

## Surprise-Free Output Contract

If output enters context through a Freeflow tool, routed behavior is expected.

If output enters through a native host tool, native behavior is expected unless the optional post-tool safety net is enabled.

When the safety net transforms native output, the result must clearly say:

- Freeflow routed this native tool result.
- Why it was routed.
- What exact raw output was captured.
- The output id.
- How to retrieve more or exact raw chunks.

Freeflow must not return shortened output while pretending it is normal native output.

## Output Vault

### Default Location And Lifetime

Default vault behavior:

- session-linked,
- persisted across resume,
- rooted outside the repo at `~/.cache/freeflow-router/vault/` by default,
- TTL metadata uses 7 days for normal non-durable outputs,
- not stored in the repo by default.

Durable repo artifacts are created only by explicit promotion/request.

Cross-session/global reuse can come later.

### Storage Model

Use an immutable object store plus per-session indexes.

Conceptual structure:

```text
vault/
  objects/
    sha256_abcd.../
      meta.json
      stdout.txt
      stderr.txt
      combined.txt
  sessions/
    session_123/
      index.json
```

Forks/branches can inherit references to immutable objects. New records are written to the current session index. Pruning must be reference-aware.

### Vault File Meanings

Vault file names are stored evidence files, not commands.

- `meta.json`: metadata for the captured output, such as output id, source kind, command/cwd, execution status, exit code, line/byte counts, hashes, creation time, and related decisions.
- `stdout.txt`: exact standard output from a command.
- `stderr.txt`: exact standard error from a command.
- `combined.txt`: a retrieval-friendly combined view of stdout and stderr. It should preserve stream order when the host runner can provide it. Otherwise it may use labeled sections.
- `raw.txt`: exact raw text for non-command sources that are not naturally split into stdout/stderr, such as routed native read output, MCP/tool text output, or fetched content.

### Source-Specific Storage

Commands:

```text
meta.json
stdout.txt
stderr.txt
combined.txt
```

Native routed text:

```text
meta.json
raw.txt
```

Repo file retrieval:

```text
metadata only by default:
  path
  content hash or mtime/size marker
  retrieved spans
  decision ids
```

Do not copy whole repo files into the vault by default.

Future external/fetched content:

```text
meta.json
raw/content files as needed
```

### Command Metadata

Candidate metadata:

```json
{
  "id": "ffout_123",
  "kind": "command",
  "executionStatus": "failed",
  "exitCode": 1,
  "command": "npm test",
  "cwd": "/repo",
  "durationMs": 12345,
  "stdoutPath": ".../stdout.txt",
  "stderrPath": ".../stderr.txt",
  "combinedPath": ".../combined.txt",
  "contentHash": "sha256:...",
  "sizeBytes": 120000,
  "lineCount": 3200,
  "decisions": ["ffdec_456"]
}
```

Session indexes can group command records by execution status:

```json
{
  "outputs": ["ffout_123"],
  "failed": ["ffout_123"],
  "successful": ["ffout_456"]
}
```

## Output-Router Skill

Freeflow provides a tiny host-neutral `output-router` skill so agents are aware of routed tools across Pi, Claude, Codex, and similar hosts.

The skill is not the router runtime. It teaches tool choice, recovery, and safety constraints:

```text
skills/output-router/SKILL.md
skills/output-router/references/safety-policy.md
```

Pi should load the `output-router` skill and its `references/safety-policy.md` reference into runtime context together, just like it loads `workflow` and `interview-gate` context. Other hosts can use the same skill and reference through their normal skill/plugin loading path.

The skill should include strong guidance, not hidden enforcement.

If post-tool safety net is disabled, do not mention it.

If post-tool safety net is enabled, add:

```text
Large native read/bash outputs may be vaulted and replaced with labeled routed output. Use freeflow_retrieve with the output id to recover exact content.
```

### Mode Behavior

Freeflow mode affects guidance strength, not hidden router enforcement.

```text
conversation:
  minimal/soft output-router guidance; answer questions directly.

workflow:
  strong tool-choice guidance; prefer Freeflow routed tools for exploration and likely-large command output.

strict-workflow:
  strongest warnings and recommendations; may recommend stricter router config or future pre-tool guards.
```

Mode must not silently enable `postToolRouting`. Native output routing remains controlled by explicit config, and the default is off in every mode.

## Pi Adapter Design

Pi is the first strong adapter.

### Default Pi Behavior

- Register `freeflow_retrieve` and `freeflow_run` as Pi extension tools.
- Inject the `output-router` skill and `references/safety-policy.md` before agent turns.
- Keep native `read`, `bash`, `edit`, and `write` unchanged.
- Leave post-tool safety net disabled by default.

### Pi TUI Rendering

Pi should render Freeflow tool calls with custom TUI slots instead of raw routed JSON.

Collapsed `freeflow_retrieve` output should show:

- action and source,
- evidence packet count,
- first path/line span,
- routing status,
- a `ctrl+o` expansion hint.

Expanded `freeflow_retrieve` output should show structured routing details, evidence excerpts, and recovery instructions.

Collapsed `freeflow_run` output should show:

- command,
- `execution.status`, `routing.status`, exit code/duration when known,
- `outputId`,
- count of important spans,
- vault recoverability,
- a `ctrl+o` expansion hint.

Expanded `freeflow_run` output should show structured sections for command, status, routing summary/reason, selected evidence lines, and vault recovery. It must not dump huge raw output into the TUI expanded view; raw recovery still goes through `freeflow_retrieve` and the vault.

This rendering is a Pi adapter concern. Router core returns structured data; the model-facing tool result remains recoverable routed output.

### Optional Post-Tool Safety Net

When enabled, Pi can inspect native `read` and `bash` results after execution and before the model sees them.

Behavior:

```text
if native output is large/noisy:
  capture raw output to vault
  return labeled routed result + outputId
else:
  pass through unchanged
```

Default threshold should be conservative, around Pi's truncation scale:

```text
> 50KB or > 2000 lines
```

Thresholds should be configurable.

The safety net should also consider noisy-output heuristics such as test logs, build logs, package install logs, broad search output, generated files, minified files, and vendor directories.

### Optional Strict Guard

A future strict option can add pre-tool warnings or blocks for obvious context floods. This should not be default.

### Avoided Path

Do not override native `read` or `bash` as the main design. Mid-tool/native override is too surprising and less portable.

## Future Claude Code And Codex Adapters

The portable model should map to Claude Code and Codex without relying on Pi-only interception.

Likely adapter shape:

- install the small Freeflow `output-router` skill/context,
- expose `freeflow_retrieve` and `freeflow_run` through MCP or CLI wrappers,
- use `SessionStart` / `UserPromptSubmit` hooks where available for guidance injection,
- use `PostToolUse` hooks as an optional safety net where supported,
- use `PreToolUse` hooks only for stricter guard modes,
- avoid depending on mid-tool native overrides.

Host-specific limitations should be handled by adapters, not by changing the core contract.

## Implementation Language

Primary implementation should use TypeScript/Node.

Rationale:

- Freeflow is npm/package-oriented.
- Pi extensions are TypeScript-native.
- Claude Code and Codex hooks can call a Node CLI.
- A future MCP wrapper can share the same core package and schemas.
- Shared TypeScript types can define routed results, evidence packets, vault records, and decision records.
- The hard part is policy, schemas, retrieval, vaulting, and JSON I/O, not raw hot-path performance.

Rust may be considered later if output routing becomes a hot-path proxy, indexing becomes performance-bound, startup time becomes painful, or single-binary distribution becomes important.

Python is acceptable for experiments and eval harnesses, but not the main runtime.

## Config

Extend `.freeflow/config.json` with an `outputRouter` section.

Config precedence:

```text
host/session override
> repo .freeflow/config.json
> global Freeflow config
> built-in defaults
```

Repo config overrides global defaults for repo-specific behavior. User/global safety caps can still constrain risky repo settings.

Candidate config:

```json
{
  "outputRouter": {
    "postToolRouting": "off",
    "largeOutputBytes": 51200,
    "largeOutputLines": 2000,
    "vaultRetentionDays": 7,
    "generatedPaths": ["dist/**", "coverage/**"],
    "noisyCommandHints": ["test", "build", "install", "grep"]
  }
}
```

Possible `postToolRouting` values:

```text
off         do not alter native outputs
safety-net  route large/noisy native outputs transparently
strict      future config level; may add pre-tool guards
```

Freeflow mode may change output-router skill wording and recommendations, but it must not silently change this config value.

## Safety Policy Reference

A separate safety/sandboxing reference should define exactness-sensitive cases in detail.

The main rule:

Do not silently summarize or compress:

- user-requested exact/full output,
- small outputs,
- verification output needed for completion claims,
- failure evidence needed for diagnosis,
- source-truth conflict evidence,
- security/privacy/billing/data-loss/public API evidence,
- anything marked `preserve: full`.

For huge exactness-sensitive output, use vaulting and exact chunk retrieval rather than lossy summarization.

Runtime-facing safety policy reference:

```text
skills/output-router/references/safety-policy.md
```

Keep this as a short skill reference; do not bury the runtime safety policy only in design docs.

## Router Failure Behavior

Failure behavior is stage-dependent.

Principles:

- Do not lose command output silently.
- Do not flood context just to hide router failure.

Cases:

```text
freeflow_retrieve fails before reading:
  return an error and suggest retry or native read.

freeflow_run command executes but vault/compression fails:
  preserve/recover output if possible;
  if output is small, return raw with warning;
  if output is huge, return warning and any recoverable temp pointer rather than flooding context.

post-tool safety net fails:
  pass native output unchanged if possible and include a warning when possible.
```

## Acceptance Criteria

A working implementation should demonstrate:

- `freeflow_retrieve` returns evidence packets for local repo files without full reads when spans are enough.
- `freeflow_retrieve` can expand evidence from exact span to wider context.
- `freeflow_run` captures raw command output before transformation.
- Command output records preserve stdout, stderr, combined output, execution status, exit code, and timing.
- Failed command output preserves exact error evidence.
- Vaulted output can be queried through `freeflow_retrieve` without rerunning the command.
- Native tools remain direct by default.
- Optional post-tool safety net labels any transformed native output and provides recovery.
- `preserve: full` over cap returns exact chunks/pointers, not lossy summaries.
- Repo config can override global defaults within user/global safety caps.

## Priority Implementation Checklist

This is a priority-ordered checklist, not an execution plan.

1. Write the host-portable `output-router` skill.
2. Define core schemas:
   - routed result,
   - evidence packet,
   - vault record,
   - decision record.
3. Implement the session-linked vault.
4. Implement `freeflow_retrieve` for local repo files.
5. Implement `freeflow_retrieve` for vault sources.
6. Implement `freeflow_run`.
7. Add Pi extension tools.
8. Add Pi output-router skill context injection.
9. Add optional Pi post-tool safety net.
10. Add repo/global config support.
11. Add eval fixtures.
12. Add future Claude Code/Codex adapters.
13. Return to future capability/skill router design.

## Eval Direction

Evals can come after the first core pieces are shaped.

They should measure:

- answer correctness from routed output,
- token/byte reduction versus native `read`/`bash`,
- exact evidence preservation,
- raw output recoverability,
- avoidance of unexpected full-context floods,
- escalation when initial evidence is insufficient.

Initial fixture classes:

1. Big docs file with answerable section.
2. Noisy test output where only pass/fail counts and failures matter.
3. Whole-artifact case where routing should not over-compress.
4. Native safety-net case with large output.
5. Failed command output preserving exact error lines.

## Open Questions And Timing

### Resolved By Later Router Work

- Exact full-context cap for `preserve: full`: keep the 64 KiB cap; over cap returns exact chunks/pointers and recovery guidance, not lossy summary.
- Runtime-facing safety policy location: `skills/output-router/references/safety-policy.md`.

### Must Resolve Before Later Storage/Retrieval Slices

- Additional JSON schema/type details introduced by later slices.
- Sensitive-output retention rules beyond the normal non-durable vault TTL metadata.

### Deferred Until Later Adapters Or Optimizations

- Whether the CLI should be `freeflow-router` or a future `freeflow router` subcommand.
- How to preserve true stdout/stderr interleaving for command output on every host. The first implementation may use labeled combined output when exact interleaving is unavailable.
- Exact Claude Code/Codex adapter behavior beyond skill/context + MCP/CLI + hooks.
- Structural symbol/callsite indexing and semantic indexing.

### Settled For This Spec

- Runtime routing is deterministic for now; no model-assisted summarization or classification.
- `toolStatus`, `execution.status`, and `routing.status` are separate concepts.
- Freeflow mode changes guidance strength only; it does not silently enable post-tool routing.
- The `output-router` skill should be reusable across host adapters.
- Initial router path is `router/`, with TypeScript source in `src/` and compiled JavaScript in `dist/`.
- The runtime-facing skill path is `skills/output-router/SKILL.md`.
- Default non-repo vault root is `~/.cache/freeflow-router/vault/`.
- Default vault retention for normal non-durable outputs is 7 days, represented as TTL metadata before pruning is enabled.
