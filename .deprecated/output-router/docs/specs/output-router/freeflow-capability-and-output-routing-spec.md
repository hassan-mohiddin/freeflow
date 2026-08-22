# Freeflow Capability And Output Routing Spec

> **Doc ID:** SPEC-002-freeflow-capability-output-routing
> **Date:** 2026-06-16
> **Owner:** Hassan Mohiddin
> **Type:** Spec
> **Status:** Draft
> **Source:** 2026-06-16 design discussion, live Freeflow docs, Pi extension docs, RTK and squeez source spot-checks

## Purpose

Capture the current design context before compaction or branch navigation. This is not the full final spec. It is a durable snapshot for later brainstorming and revision.

## Problem

Progressive disclosure keeps skill/plugin/MCP instructions out of context until needed, but selection still relies heavily on short descriptions. When users install many similar skills, plugins, MCP servers, and tools, the agent can:

- choose the wrong capability,
- miss a better or more specific capability,
- stack mutually exclusive capabilities,
- fail to stack complementary capabilities,
- load or return far more context than the task needs.

The same issue appears with tool outputs. A model can use broad `read`, `fetch_content`, or search calls during codebase exploration and bloat the active context with mostly irrelevant output. The desired rule is:

```text
targeted retrieval -> output compression -> full read
```

Full reads and full registry loads should be fallbacks, not defaults.

## Intended Outcome

Build an optional Freeflow routing layer that improves capability selection and tool-output efficiency without replacing the host agent.

The routing layer should:

- route among skills, plugins, MCP tools, built-in tools, and extension tools,
- normalize installed capabilities into queryable capability cards,
- resolve conflicts and composition rules,
- retrieve only relevant evidence spans when exploring code or docs,
- compress or summarize tool output only when targeted retrieval is unavailable or insufficient,
- fall back to full reads only with an explicit reason,
- stay portable across Pi first, then Claude Code and Codex adapters.

## Product Positioning

Freeflow remains a portable workflow skill/plugin pack, not a new agent or broad CLI framework. This routing work should be framed as an optional companion runtime/adapter, not as mandatory v0.1 behavior.

Disabling native host skill descriptions should be optional. Default behavior should keep native descriptions visible for accuracy and fallback reliability. A token-efficiency mode may hide or reduce native descriptions only when the host supports it and the user chooses it.

## Current Evidence

- Freeflow v0.1 currently ships no CLI and no enforcement hooks. The runtime is skills, context-loading hooks, and a Pi extension.
- Pi supports strong host integration through TypeScript extensions: custom tools, commands, lifecycle events, system prompt injection, context mutation, provider payload inspection, tool result mutation, and active tool control.
- Claude Code and Codex support plugins, skills, MCP, and hooks, but they do not appear to expose the same general prompt/context replacement surface as Pi. Their adapters should be advisory or hook-driven at first.
- RTK demonstrates a thin host adapter over a central registry: the Pi extension delegates all rewrite logic to `rtk rewrite` and fails open.
- RTK stores command rewrite rules centrally with pattern, target command, category, and savings metadata.
- squeez demonstrates broader output optimization: bash wrapping, tool-result filtering, session memory, exact/fuzzy redundancy detection, adaptive compression, and an MCP memory server.
- The discussion itself exposed the failure: broad tool reads and fetched docs moved context usage from roughly 35-40% to 87% while only a small part of the output was needed.

## Design Principles

1. **Targeted retrieval before compression.** Avoid reading irrelevant content rather than compressing it after the fact.
2. **Compression before full read.** If targeted retrieval is unavailable or unreliable, reduce output size with a safe policy.
3. **Full reads require a reason.** Full files, full registries, and full tool outputs should be exceptional.
4. **Router policy owns risk.** RTK/squeez-style optimizers can be adapters, but Freeflow decides when exact output must remain intact.
5. **Core portable, adapters host-specific.** The core router should not depend on Pi. Pi is the first strong adapter.
6. **Fail open for host safety, fail closed for claims.** Routing failures should not break the host, but completion claims still need evidence.
7. **Evidence packets over raw dumps.** Return path, line span, excerpt, reason, and confidence rather than unbounded tool output.

## Proposed Architecture

```text
host adapter
  -> capability/output router core
      -> registry + indexes
      -> ranker
      -> conflict/composition resolver
      -> targeted retrieval engine
      -> output policy engine
      -> optional optimizer adapters
           - rtk for command rewrite
           - squeez for compression/session memory
  -> compact route or evidence packet back to host
```

### Host-neutral Core

Responsibilities:

- capability schema and validation,
- registry refresh and diffing,
- lexical and optional semantic indexes,
- route ranking,
- conflict and composition resolution,
- evidence span location,
- bounded retrieval,
- output policy decisions,
- route explanations,
- eval fixtures.

### Pi Adapter

Pi should be the first full adapter because it can:

- inspect loaded skills/tools/commands,
- register router tools and commands,
- inject routing guidance in `before_agent_start`,
- mutate or summarize tool results where appropriate,
- optionally adjust active tools,
- optionally change prompt/context loading in advanced modes.

### Claude/Codex Adapters

Future adapters should use the strongest available host surfaces:

- plugin-bundled hooks,
- `UserPromptSubmit` / session-start context injection where supported,
- MCP server exposing router tools,
- skill/plugin visibility controls where supported,
- CLI calls from hooks.

These adapters may not fully replace native skill listing. They should still improve selection and output behavior through advisory context and queryable routing tools.

## Runtime Registry

The registry should be created from a snapshot of currently installed capabilities:

- skills,
- plugins,
- MCP servers/tools/resources/prompts,
- built-in tools,
- extension tools,
- slash commands or prompts where discoverable.

The registry should be stored locally, with layered scope:

```text
global registry/cache
  user-installed capabilities

repo overlay
  project-preferred capabilities
  disabled capabilities
  local conflicts/composition rules
```

The full registry should not be loaded into model context. The host should load only a tiny router instruction and query the registry at runtime.

Candidate capability card fields:

```json
{
  "id": "diagnose-failure",
  "kind": "skill",
  "host": "pi",
  "scope": "project",
  "purpose": "Investigate bugs, failed tests, flaky failures, regressions, or broken behavior.",
  "triggers": ["bug", "failed test", "regression"],
  "anti_triggers": ["user only asks for explanation"],
  "inputs_needed": ["symptom", "reproduction evidence"],
  "outputs": ["root cause", "fix path", "verification evidence"],
  "side_effects": ["may inspect repo", "may edit if explicitly asked"],
  "risk": "medium",
  "specificity": "high",
  "composes_with": ["workflow", "verify-work"],
  "conflicts_with": [],
  "supersedes": [],
  "source": {
    "path": "skills/diagnose-failure/SKILL.md",
    "hash": "..."
  }
}
```

## Capability Routing

The router should run before important capability selection, not only after the model notices a conflict.

Routing steps:

1. classify user intent and task risk,
2. query registry for candidate capabilities,
3. hard-filter impossible or unsafe candidates,
4. rank by explicit invocation, specificity, scope, risk, and evidence fit,
5. resolve conflicts and composition,
6. return a recommended stack, alternatives, and whether clarification is needed.

Candidate response shape:

```json
{
  "decision_id": "route_2026_06_16_001",
  "recommended_stack": ["workflow", "research-brief"],
  "do_not_use": [
    {
      "id": "execute-plan",
      "reason": "User is brainstorming, not executing an approved plan."
    }
  ],
  "conflicts": [],
  "confidence": 0.82,
  "needs_clarification": false,
  "explanation": "The request asks for evidence-backed direction before implementation."
}
```

Conflict rules:

- explicit user invocation wins unless unsafe or impossible,
- repo-local/project-specific capability beats global when both fit,
- more specific beats generic,
- safer/no-side-effect beats risky when confidence is close,
- mutually exclusive capabilities require a winner or a focused question,
- complementary workflow skills can stack.

## Output Routing

Output routing applies to tool calls and tool results. It should cover native tools, custom tools, MCP outputs, and web/repo fetches where possible.

### Priority Ladder

```text
1. targeted retrieval
2. output compression / summarization / dedup
3. full read or full output
```

### Targeted Retrieval

Targeted retrieval should locate relevant spans before reading large content.

For unknown files during codebase exploration:

1. classify the information need,
2. search cheap metadata first,
3. locate candidate files and spans,
4. retrieve bounded spans,
5. expand gradually only if needed,
6. return evidence packets.

Cheap metadata sources:

- filenames,
- headings,
- symbol names,
- exports/imports,
- ripgrep snippets,
- frontmatter/descriptions,
- prebuilt indexes,
- prior session memory where reliable.

Candidate commands/tools:

```bash
freeflow-router locate "Pi /tree branch summarization behavior" --scope docs
freeflow-router retrieve --path docs/sessions.md --lines 108:124
```

Candidate evidence packet:

```json
{
  "answerable": true,
  "evidence": [
    {
      "path": "docs/sessions.md",
      "lines": "108-124",
      "excerpt": "When /tree switches away from one branch to another, pi can summarize the abandoned branch...",
      "why": "Directly explains branch summaries."
    }
  ],
  "recommended_next": "answer"
}
```

For code, targeted retrieval should prefer structural spans:

```text
query -> candidate files -> symbols -> symbol span -> references/callsites -> neighboring code
```

A code index should store symbol ranges when possible:

```json
{
  "path": "src/core/compaction/branch-summarization.ts",
  "symbols": [
    {
      "name": "generateBranchSummary",
      "kind": "function",
      "start": 42,
      "end": 118
    }
  ]
}
```

Read expansion should be incremental:

```text
span
span +/- 30 lines
span +/- 80 lines
full file only with reason
```

### Output Compression

Compression is used when targeted retrieval is unavailable, insufficient, or the host already produced a large result.

Compression modes:

- exact dedup note,
- fuzzy duplicate note,
- failure-focused summary,
- heading/symbol summary,
- schema/key summary for JSON,
- line-window summary with citations,
- store-full-output externally and return a compact pointer.

Compression must preserve exact output when exactness matters:

- verification command output needed for completion claims,
- source-truth conflicts,
- public API/security/privacy/billing/data-loss evidence,
- small outputs where compression loses more signal than it saves,
- first sight of structured MCP results where summarization may corrupt meaning.

### Full Read

Full read is allowed when:

- the file/output is small,
- the user asked to review the whole artifact,
- global consistency matters,
- targeted locate failed,
- span boundaries are unreliable,
- exact full content is necessary evidence.

The router should record a reason when it chooses full read.

## RTK And squeez Strategy

Do not blindly enable RTK and squeez together by default. They can overlap, double-wrap, or double-compress.

Recommended stance:

- RTK is useful as an optional bash rewrite backend.
- squeez is useful as an optional output compression/session-memory backend.
- Freeflow should own policy and risk decisions.
- The router should choose the optimizer per host, tool, and output class.

Adapter examples:

```text
bash command with known compact equivalent:
  use RTK rewrite if installed and enabled

large repeated native Read/Grep/MCP result:
  use Freeflow or squeez-style dedup/compression policy

verification output:
  preserve exact important lines; optionally store full output and return compact evidence pointer
```

## CLI And Language Direction

Working CLI name: `freeflow-router`.

Candidate commands:

```bash
freeflow-router doctor
freeflow-router refresh
freeflow-router query --host pi --prompt "..."
freeflow-router locate "..."
freeflow-router retrieve --path file --lines A:B
freeflow-router explain <decision-id>
```

Recommended v0 implementation language: TypeScript/Node.

Rationale:

- Freeflow is already an npm package.
- Pi extension work is TypeScript/JavaScript-native.
- Claude/Codex hooks can call a Node CLI.
- The problem is schema, indexing, JSON I/O, and host adapters more than hot-path parsing.
- TypeScript allows faster iteration and shared schemas across CLI and Pi adapter.

Rust remains a later option if the router becomes a hot-path proxy where startup time, single-binary distribution, or zero runtime dependencies dominate.

Python remains more appropriate for local-model harness or embedding-heavy experiments, not for the first portable host-router CLI.

## Candidate Package Layout

```text
packages/capability-router/
  package.json
  src/
    cli.ts
    core/
      schema.ts
      registry.ts
      index.ts
      rank.ts
      conflicts.ts
      retrieve.ts
      output-policy.ts
      explain.ts
    hosts/
      pi.ts
      claude.ts
      codex.ts
    optimizers/
      rtk.ts
      squeez.ts
    evals/
      fixtures/
      routing/
      output-routing/
```

This should remain separate from the proven v0.1 plugin runtime until smoke tests and evals prove it works.

## Acceptance Criteria

A first working prototype should demonstrate:

- registry refresh from Pi-loaded skills/tools/commands,
- query returns top candidates without loading the full registry into context,
- router chooses a better capability stack than description-only selection on ambiguous similar skills,
- conflict rules prevent mutually exclusive capability stacking,
- targeted retrieval returns line-bounded evidence packets for docs and code,
- full file read happens only with a recorded reason,
- large tool output is compressed or externalized when safe,
- exact output is preserved for verification/source-truth-sensitive cases,
- RTK/squeez adapters are optional and fail open,
- evals cover at least one over-read failure like the 2026-06-16 discussion.

## Risks

- Over-compression may remove evidence the model needs.
- Routing may become another hidden authority if explanations are poor.
- Host adapters may diverge because Pi, Claude, and Codex expose different control points.
- Registry refresh may become stale if installed capabilities change mid-session.
- Semantic search may add complexity or dependencies too early.
- A CLI surface can pull Freeflow toward the old Orchestra-style tooling gravity if scope is not controlled.

## Open Questions

- Should the first public command be `freeflow-router` or a subcommand under a future `freeflow` binary?
- Should the registry use JSON files, SQLite, or both?
- Should semantic indexing be included in v0 or deferred behind lexical/symbol search?
- What is the minimum Pi adapter behavior that proves the concept without disabling native skill descriptions?
- How should repo overlays express conflicts and composition rules without becoming verbose policy files?
- Should squeez be supported as a backend immediately, or only after Freeflow’s own output policy is proven?
- How should full-output external storage be named, retained, and surfaced to the user?
- What eval best measures "accuracy improved while tokens decreased" for capability routing and output routing?

## Next Work

After compaction or branch navigation, continue brainstorming from this spec. Likely next steps:

1. tighten the v0 scope,
2. decide CLI language and command name,
3. define the first capability-card schema,
4. define the first evidence-packet schema,
5. design one Pi-only prototype path,
6. write eval fixtures before implementing broad host adapters.
