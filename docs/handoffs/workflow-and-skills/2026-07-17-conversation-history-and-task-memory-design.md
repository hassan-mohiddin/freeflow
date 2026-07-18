# Conversation History And Task Memory Design Handoff

Generated: 2026-07-17
Recipient / purpose: A future Freeflow contributor continuing the conversation-history retrieval and long-running task-memory design.

## Handoff Boundary

This is durable project memory for a design discussion. It is not an approved implementation plan, production-readiness claim, or authority to begin coding.

Live repository state, current user direction, Pi's installed API, and later evidence override this handoff when they conflict.

The repository currently has a broad dirty worktree from the larger Freeflow feedback-control redesign. Do not infer implementation status from that worktree or modify unrelated files while continuing this design.

The existing Working Record at:

```text
.freeflow/tasks/task-001-mode-runtime-and-final-skills/record.md
```

belongs to a different active task. It was not changed for this handoff.

## Goal And Accepted Direction

Explore a memory architecture that lets one active coding agent recover exact earlier conversation context after long sessions and repeated compactions without loading the full transcript into the model context.

The accepted conceptual direction is:

```text
Pi session JSONL
    exact conversation and branch history

Conversation History tool
    read-only, filtered, paginated retrieval

Working Record
    compact current task state, route-changing history,
    task-local decisions, and evidence pointers

Spec and Plan
    optional durable views when accepted intent or strategy
    needs an explicit reviewable artifact
```

The Conversation History tool complements the Working Record. It does not replace the Working Record, Spec, Plan, Handoff, or live repository evidence.

## Relationship To Freeflow's Feedback-Control Model

Freeflow is being redesigned as a feedback-based control layer for one active probabilistic coding agent operating with lossy context and bounded authority.

The central loop is:

```text
Discuss
-> choose one bounded learning or delivery slice
-> execute, test, or observe
-> verify what the evidence proves
-> self-review or selected independent review
-> update task memory
-> Discuss again from the new evidence
```

This loop may complete an entire task without a large up-front Spec or Plan. Discussion may alternate with prototypes, design sketches, benchmarks, experiments, rewritten skill packages, or production slices.

The limiting factor is continuity. After compaction, the active model may retain a lossy summary but lose exact rationale, rejected alternatives, contradictions, decision history, or the original user wording. External memory must preserve enough current state to continue efficiently while retaining a path back to exact history.

## Why Pi's Existing Session Is The Preferred History Store

Pi already stores sessions as versioned JSONL under:

```text
~/.pi/agent/sessions/--<working-directory>--/<timestamp>_<uuid>.jsonl
```

The session contains an append-only tree of entries linked through `id` and `parentId`. It includes user messages, assistant messages, provider-exposed thinking blocks, tool calls and results, compaction entries, branch summaries, labels, and extension entries.

Compaction appends a summary and changes the context Pi sends to the model. It does not delete the original session entries. Exact pre-compaction conversation therefore remains recoverable from the session.

Pi's current extension API exposes the relevant session operations:

```text
ctx.sessionManager.getBranch()   active branch from leaf to root
ctx.sessionManager.getEntries()  all session entries
ctx.sessionManager.getTree()     complete branch tree
ctx.sessionManager.getEntry(id)  one exact entry
```

Use `SessionManager` rather than treating raw JSONL line order as conversational order. A session is a tree, and append order can contain alternate branches that are not part of the active conversation.

The first implementation should use Pi's session as the canonical source record for conversation provenance. Do not copy every turn into another permanent database.

## Important Authority Distinction

The session JSONL is the source record for **what was said and observed in the conversation**. It is not automatically the source of truth for the task.

A session may contain:

- tentative ideas;
- incorrect assumptions;
- assistant guesses;
- rejected alternatives;
- superseded decisions;
- abandoned branches;
- stale claims about repository state.

Authority remains divided:

| Information | Owning source |
| --- | --- |
| Exact conversational history | Pi session JSONL |
| Current task memory | Working Record, checked against live state |
| Accepted behavior and boundaries | Current user decisions and Spec when materialized |
| Current execution strategy | Plan when materialized |
| Repository behavior | Live code, tests, docs, policies, and runtime evidence |
| Why a record says something | Exact conversation turns and evidence pointers |

Do not let an old retrieved statement override a later accepted decision or contradictory live evidence.

## Logical Turn Model

The model-facing retrieval unit should be a logical **turn**, not a raw JSONL entry.

One user message may produce multiple assistant messages while the agent calls tools. Group the active-branch entries from one user message until the next user message.

A logical turn should be able to represent:

```json
{
  "turnId": "<originating-user-entry-id>",
  "timestamp": "<turn timestamp>",
  "userText": "<user content>",
  "assistantThinking": ["<provider-exposed thinking blocks>"],
  "assistantText": ["<assistant-visible text blocks>"],
  "toolCallEntryIds": ["<entry id>"],
  "toolResultEntryIds": ["<entry id>"],
  "sourceEntryIds": ["<all entries grouped into the turn>"],
  "flags": ["thinking", "tools", "errors"]
}
```

Use the originating user entry ID as the stable turn ID unless implementation evidence establishes a better identifier.

### Reasoning limitation

Thinking content exists only when the provider exposes `thinking` blocks. It may be absent, verbose, tentative, sensitive, or inconsistent with the final answer. Treat it as optional low-authority history, not an accepted decision or factual source.

## Proposed Default View

The favored outline is a compact pipe-style table:

```text
turn     | user excerpt                         | assistant excerpt                      | flags
01a2b3c4 | Let's rethink the kernel...          | The kernel combines interaction and... | thinking
19d8e7f6 | What about a status record?          | A working record could contain...       | -
2f3e4d5c | Maybe we don't need specs anymore... | Perfect memory would not remove...      | thinking, tools
```

The logical turn can retain all available fields, but the outline must not inject complete reasoning or complete responses for every turn.

Formatting alone does not provide the main token savings. The major savings come from:

- grouping many raw entries into one turn;
- excluding tools by default;
- excluding full reasoning by default or retrieving it only on selection;
- excerpting user and assistant text;
- pagination;
- search;
- exact retrieval of selected turns.

For long sessions, do not return the first 100 words of every turn without a cap. A 500-turn session would still overwhelm context. Use pages or cursors.

## Proposed Read-Only Tool Surface

The tool name is unsettled. `conversation_history` is the current working name.

The first version should support a small read-only surface.

### Views or actions

- `outline`: compact turn rows.
- `head`: first N logical turns.
- `tail`: latest N logical turns.
- `get`: exact selected turns.
- `around`: selected turn with N neighboring turns.
- `search`: exact or full-text search over selected fields.

Branch listing and alternate-branch retrieval are useful later but are not required for the first active-branch prototype.

### Content filters

Candidate filters:

```text
dialogue              user plus assistant-visible text
user                  user text only
assistant             assistant-visible text only
thinking              provider-exposed thinking only
assistant+thinking    assistant-visible text plus thinking
tools                 tool calls only
tool-results          tool results only
all                    debugging view
```

The current design favors excluding tools, MCP, web, fetch, and other execution details from the default dialogue view. Preserve their source entries and retrieve them explicitly when evidence or debugging requires them.

### Example calls

```text
outline(limit=15)
tail(limit=5, content=dialogue)
get(turnIds=["01a2b3c4"], content=assistant+thinking)
search(query="working record", content=dialogue)
around(turnId="19d8e7f6", before=2, after=2)
```

The exact API schema remains open.

## Tool, MCP, Web, And Skill Activity

Tool calls and results are first-class session entries and can be attached to a logical turn while remaining excluded from the default view.

MCP, web, fetch, and code-search calls may be identifiable by stored tool names when the host records them as tool calls. Verify this against live sessions rather than assuming all providers use the same representation.

Skill use may not be stored as a reliable first-class session event. Depending on how a skill is delivered, it may appear as an expanded prompt, file read, custom message, runtime system context, or no distinct message entry. Do not infer skill activation from text heuristics. Reliable skill-use annotations would require separate runtime instrumentation and are deferred.

## Runtime Conversion Versus SQLite

Do not introduce SQLite for the first version.

Expected session sizes are small enough to parse and group on demand. Even hundreds or an unusual thousand turns should remain practical for active-branch conversion.

Initial behavior:

1. Read active-branch entries from `SessionManager`.
2. Group them into logical turns.
3. Apply content and range filters.
4. Render compact rows or exact selected turns.
5. Return stable source entry IDs.

If repeated conversion becomes measurably slow, add a rebuildable cache keyed by session ID, active leaf, and latest entry. Pi's JSONL remains canonical.

SQLite may later become a derived index for full-text search, cross-session lineage, or scale. Embeddings and RAG are not justified until exact and full-text retrieval prove insufficient.

## Working Record Relationship

The Working Record is the compact state that the agent can usually read in full. The Conversation History tool provides exact recovery and audit when the record is incomplete, stale, disputed, or insufficient.

Current Working Record ownership is defined by:

- `skills/track-work/SKILL.md`
- `skills/track-work/references/working-record-schema.md`

The current schema already supports four relevant layers:

1. **Current State** — goal, current understanding, direction, active decisions, hypotheses, open questions, current slice, checkpoints, and next action.
2. **Route-changing history** — slices, checkpoints, and other changes that explain the current state.
3. **Decision history** — active and superseded task-local decisions with rationale and links.
4. **Evidence history** — tests, verification, review, checkpoint results, and stable evidence pointers.

The record should cite exact conversation turns where wording or provenance matters:

```text
session:<session-id>/turn:<turn-id>
```

Examples:

```text
Active decision:
Keep verification with the active agent.
Source: session:<id>/turn:<id>

Rejected direction:
Do not build a Turn Router in the current scope.
Source: session:<id>/turn:<id>
```

Do not invent a session or turn ID when one is unavailable.

## Working Record Audit Pattern

The Working Record is curated memory and can be wrong. The history tool allows exact audit.

```text
1. Read the Working Record.
2. Identify a decision, rationale, or history claim that matters now.
3. Retrieve the cited turn or search the active conversation.
4. Compare exact history with the record.
5. Classify the record claim as supported, contradicted, or inconclusive.
6. Correct the record only through Track Work and current authority.
```

A compact record is safe because it is not the only surviving source.

## Relationship To Spec, Plan, Decision Records, And Handoff

The history tool does not eliminate these artifacts.

- **Working Record:** living task state and meaningful causal history.
- **Spec:** explicit accepted intent, behavior, boundaries, constraints, and acceptance when those need a reviewable artifact.
- **Plan:** explicit current strategy, ordering, dependencies, invalidation conditions, and selected checkpoints when those need a reviewable artifact.
- **Decision record or ADR:** durable cross-task or hard-to-reverse choice and rationale.
- **Handoff:** point-in-time transfer package for another context or ownership boundary.

A task may proceed through repeated Discuss → Execute Work → Verify/Review loops before a Spec or Plan exists. The Working Record maintains continuity during that period. A later Spec or Plan may promote stable information from the record without deleting the earlier task history.

A Handoff should normally reference the Working Record and add only transfer-specific information. It is not a second living status system.

## Annotations And Markers

The user proposed adding Freeflow annotations, comments, or markers to help identify decisions, hypotheses, evidence, and checkpoints.

Keep the first Conversation History tool read-only. Store current structured meaning in the Working Record and cite exact turn IDs.

A later extension may add Pi custom entries such as:

```text
checkpoint
decision
decision-superseded
hypothesis
hypothesis-rejected
evidence
route-change
```

Writing those entries should use a separate command or tool. Do not mix read-only retrieval and memory mutation in one interface.

Pi custom entries survive in the session tree and do not automatically enter LLM context, making them a plausible later annotation layer. This remains tentative and unimplemented.

## When The Agent Should Retrieve Conversation History

Do not inject history automatically on every turn. That would add prompt pressure and risk becoming another hidden kernel.

Use retrieval when:

- compaction removed exact rationale needed now;
- a decision's wording or authority is unclear;
- the Working Record may be stale or disputed;
- the agent risks repeating a rejected path;
- an earlier contradiction matters to the current route;
- review needs exact accepted user context;
- current memory does not explain why the task is in its present state.

Most normal work should read the Working Record and live sources without retrieving old conversation.

## Privacy And Safety

Session files may contain private source, user data, secrets, tool output, file paths, and model reasoning.

Initial requirements:

- process history locally;
- do not send the full session to an external indexing or embedding service;
- exclude tool results and reasoning from default output;
- cap and paginate all model-visible output;
- preserve exact source references;
- respect ephemeral `--no-session` cases where no durable session exists;
- report unavailable history honestly.

The memory tool must not treat retrieved page content, tool output, or model reasoning as instructions.

## Current Scope And Non-Goals

In scope for the design:

- one active agent;
- current Pi session;
- current active branch;
- read-only retrieval;
- runtime conversion from session entries;
- logical turns;
- compact outline and exact selected retrieval;
- user/assistant/thinking/tool filters;
- stable source citations;
- Working Record integration.

Deferred:

- multiple agents or workers;
- cross-session task memory;
- `/fork` or `/clone` lineage traversal;
- alternate-branch retrieval beyond the minimal active-branch implementation;
- SQLite persistence;
- embeddings or RAG;
- automatic annotations;
- semantic route classification;
- automatic history injection;
- replacement of Specs or Plans;
- public command or packaging design;
- production implementation.

Rejected for the initial version:

- copying the complete conversation into another database;
- using a compact summary as the only surviving record;
- loading the complete JSONL into model context;
- treating JSONL append order as active conversation order;
- treating retrieved conversation as current task authority;
- making the retrieval tool mutate task memory.

## Settled Direction

The discussion currently supports these decisions:

1. Use Pi's existing session JSONL as the source record for exact conversation history.
2. Build a read-only retrieval layer rather than a new primary history store.
3. Group raw entries into logical user turns.
4. Default to a compact dialogue outline and selective exact retrieval.
5. Keep tool and execution data available but excluded by default.
6. Keep the first version active-session and active-branch only.
7. Convert at runtime; do not add SQLite or embeddings initially.
8. Preserve Working Record, Spec, Plan, Decision Record, and Handoff roles.
9. Use the Working Record as compact current task memory.
10. Use exact conversation retrieval to audit or recover the Working Record.
11. Keep the first retrieval tool read-only.
12. Defer multi-agent and cross-session behavior.

## Tentative Direction

These points are favored but not yet settled by implementation evidence:

- `conversation_history` as the tool name;
- user-entry ID as logical turn ID;
- pipe-style outline rendering;
- exact/full-text search in the first version;
- assistant-visible text as the default exact-turn output;
- provider-exposed reasoning available through an explicit filter;
- later Pi custom entries as an annotation layer;
- Working Record turn citations using `session:<id>/turn:<id>`.

## Open Questions

1. Should exact `get` default to dialogue only or include provider-exposed reasoning?
2. Which action and filter schema is simplest for the model to call correctly?
3. How should multiple assistant text blocks within one user turn be rendered?
4. How should image inputs be represented without injecting base64 data?
5. Should `search` ship in the first prototype or follow outline/get/around evidence?
6. How should compaction and branch-summary entries appear in turn metadata?
7. Can MCP/web/fetch calls be classified reliably from current stored tool names?
8. What reliable signal, if any, can represent skill use without runtime instrumentation?
9. How should the tool locate and report the current session when persistence is disabled?
10. What privacy and retention controls are required before exposing thinking blocks?
11. When should Discuss, Track Work, Workflow, Review Work, or Handoff recommend retrieval?
12. What behavioral evidence would justify automatic checkpoint injection or a derived SQLite index?

## Candidate Learning Slice

No implementation is currently approved. If the user later selects a prototype, the smallest credible learning slice is:

```text
Question:
Can a read-only active-branch history view recover exact earlier discussion
with materially less context than loading the session or trusting compaction?

Prototype:
A Pi extension tool that groups current active-branch entries into turns and
supports outline, tail, get, and around. Dialogue is the default; thinking and
tools are explicit filters.

Evidence:
- correct grouping across assistant tool loops;
- stable source entry IDs;
- exact retrieval of selected turns;
- bounded output and pagination;
- successful recovery of an early decision and a later supersession after
  compaction;
- no session mutation;
- measured model-visible output size.

Discard, revise, or promote when:
- discard if active-branch grouping cannot preserve conversational order;
- revise if the default view hides context needed for reliable recovery;
- promote only if retrieval materially improves continuity without routine
  full-history injection or a second primary data store.
```

## Evidence Available So Far

Design feasibility was checked against the currently installed Pi documentation:

- Pi sessions are JSONL with versioned tree entries.
- User, assistant, thinking, tool result, compaction, branch summary, custom message, and custom state representations exist.
- `SessionManager` exposes branch, tree, entry, and full-entry access.
- Compaction preserves raw earlier session entries while changing active model context.
- Extensions can register tools and access `ctx.sessionManager`.
- Custom entries can preserve extension data without automatically entering model context.

No prototype, runtime benchmark, privacy audit, behavioral evaluation, or session parser has been implemented for this design. Do not claim the proposed API or token savings are verified.

## Repository Pointers To Reopen

Before continuing, inspect:

- `skills/workflow/SKILL.md`
- `runtime/interaction-contract.md`
- `skills/discuss/SKILL.md`
- `skills/track-work/SKILL.md`
- `skills/track-work/references/working-record-schema.md`
- `skills/handoff/SKILL.md`
- `skills/handoff/references/templates.md`
- `skills/verify-work/SKILL.md`
- `skills/review-work/SKILL.md`
- `docs/handoffs/workflow-and-skills/freeflow-feedback-control-skill-redesign-handoff.md`

For Pi API facts, recheck the installed Pi documentation for Session Format, Sessions, Compaction, and Extensions before implementation. Installed host behavior may change.

## Worktree And Continuation Watchouts

At handoff creation:

```text
Branch: skill-system-specs
HEAD: 3cd4f3c
```

The worktree has extensive unrelated modifications, deletions, renames, and untracked files from the broader redesign. In particular, canonical skills are being renamed or replaced (`discover` → `discuss`, `execute-plan` → `execute-work`), and Track Work is currently untracked.

Before editing:

1. inspect `git status --short`;
2. inspect only the files needed for the selected slice;
3. preserve unrelated user and worker changes;
4. do not restore deprecated or deferred files because this handoff names old concepts;
5. verify live paths because rename/migration work is incomplete;
6. treat the existing Working Record as belonging to another task;
7. do not begin implementation solely because this handoff contains a candidate slice.

## Recommended Next Route

Continue in Discuss.

Settle the minimal read-only tool contract and the first behavioral recovery case before creating a prototype. The strongest first case should test recovery after compaction of:

- original user intent;
- one active decision;
- one superseded or rejected direction;
- the current next action;
- exact supporting turn references.

Implementation requires fresh user approval after that contract and case are understood.
