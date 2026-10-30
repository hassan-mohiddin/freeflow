# Spec, Plan And Decision Shapes

This reference is judgment, with one Rule under Plans: composable shapes for a Spec, a Plan or a decision record, not mandatory templates; a research document's shape is Research Work's. Use only the sections the document needs for its use; the header, status and source trail are in [Write Docs](../SKILL.md#header-status-and-sources). A decision note or ADR has its own shape under [Decision Records](#decision-records), and a research document under [Research](#research), below.

## Specs

### Product Spec Or PRD

Use for a product, capability, workflow, or user-facing outcome.

Possible sections:

- problem and motivation;
- intended outcome;
- users or actors;
- scope and non-goals;
- user journeys or observable behavior;
- requirements and constraints;
- product, policy, or domain decisions;
- edge and failure behavior;
- acceptance criteria;
- unresolved questions and source evidence.

Do not turn a PRD into an implementation task list.

### Issue Or Problem Specification

Use when a durable issue must define a problem clearly enough to investigate, fix, or accept.

Possible sections:

- observed problem or requested change;
- affected behavior and users;
- current evidence, reproduction, or examples;
- expected behavior;
- scope and non-goals;
- severity, constraints, and known impact;
- acceptance criteria;
- unresolved facts or owner decisions.

Do not present a guessed cause or requested patch as established fact. A fix sequence belongs in a Plan after the cause and path are sufficiently understood.

### Requirements Or Behavioral Specification

Use when observable behavior and constraints matter more than implementation structure.

Possible sections:

- actors and preconditions;
- required behavior and invariants;
- inputs, outputs, states, and transitions;
- errors, rejection, degradation, and recovery;
- forbidden outcomes;
- compatibility and data guarantees;
- acceptance examples and evidence.

Express behavior precisely without copying implementation logic into the contract.

### Technical Design

Use when the artifact must define an accepted technical direction in depth.

Possible sections:

- problem and current evidence;
- goals and non-goals;
- proposed architecture or design;
- module, interface, state, and ownership boundaries;
- data flow and persistence;
- failure contract and recovery;
- security, privacy, performance, and operational constraints;
- alternatives and rationale;
- compatibility or migration impact;
- risks, validation, and unresolved design questions.

A technical design may contain implementation detail when that detail defines the accepted design. Ordered phases and execution slices still belong in a Plan.

#### Implementation Decisions

Include this subsection when consequential engineering choices must survive implementation handoffs or context loss. For selecting those choices, use Execute Work's [design](../../execute-work/references/design.md); this shape preserves their result rather than duplicating the design method.

Capture only what the intended implementation needs:

- selected representation, identity, state owners, and module responsibilities;
- essential algorithm, effect ordering, update/invalidation, and failure behavior;
- source basis, rationale, and invariants;
- a plausible wrong implementation and the observer that distinguishes it;
- required constraints, suggested mechanics, and implementer freedom;
- unresolved assumptions and conditions requiring reconsideration.

A compact type or control-flow sketch is useful when it removes consequential ambiguity. Mark illustrative code as such; it is not the behavioral oracle. Keep the applicable revision recoverable and update only decisions affected by new evidence. Do not require this subsection for a product-only artifact or an already clear local change.

### API, Protocol, Or Interface Contract

Use for a public or internal interface that callers will depend on.

Possible sections:

- interface, endpoint, command, event, or protocol name;
- callers, roles, authentication, and permissions;
- requests, inputs, responses, outputs, and schemas;
- invariants and ordering;
- errors and failure semantics;
- idempotency, retries, versioning, and compatibility;
- privacy, billing, data-safety, and operational constraints;
- examples and acceptance evidence.

Stop rather than inventing caller-visible behavior or compatibility promises.

### Migration Contract

Use when current and target states, compatibility, and safety obligations must be durable before execution is planned.

Possible sections:

- current and target contracts;
- affected consumers, data, traffic, or configuration;
- compatibility and support commitments;
- data and state invariants;
- cutover, rollback, or forward-recovery requirements;
- observation and removal conditions;
- consequential failure behavior;
- acceptance and completion evidence;
- decisions still required.

Include ordering only when it is part of the accepted migration contract. Detailed execution phases belong in a migration or implementation Plan.

### Combine Carefully

An artifact may combine shapes when it genuinely owns both jobs, such as a technical design containing an API contract. Keep each responsibility legible.

Do not create an omnibus artifact merely to avoid links. Separate artifacts when they have different owners, statuses, audiences, lifecycles, or review boundaries.

## Plans

Approval to execute a Plan may cover its listed work, checks, selected reviews, record maintenance and local commits, still subject to fresh evidence and [Deliver Work](../../deliver-work/SKILL.md)'s commit inspection; accepting its strategy alone authorizes none of them, and neither ever implies push, integration, migration, deprecation, release or launch. This Rule is binding.

### When A Plan Helps

Write a durable Plan when the intended outcome and material decisions are settled, the approach and dependencies can be ordered without guessing, and the strategy needs to survive on its own. A small correction can proceed from its request and supported approach, and an evolving route with substantial branching belongs in [Track Work](../../track-work/SKILL.md) as provisional Slices, not a confident long-form Plan. If execution is already authorized and a Plan is useful preparation, writing it need not create another approval stop; keep any review or user-return boundary actually selected.

### Start With Source And Boundaries

A separate Spec is not required when the request and accepted understanding are clear enough; otherwise the Plan consumes the relevant Spec, issue, design, diagnosis or decision. Make the execution boundary and its dependencies clear:

```text
Goal:
Source and linked artifacts:
Scope:
Non-goals:
Accepted decisions:
Assumptions:
Dependencies:
Required order:
```

Link accepted behavior, architecture and decisions instead of copying their rationale. Do not hide unsettled design or owner choices as assumptions; an assumption whose failure would choose among materially different strategies is resolved before the Plan is executable, and work outside the Plan's promise is named as unresolved or deferred.

### Write The Smallest Useful Strategy

Include the relevant goal, sources, scope, decisions, assumptions, dependencies, ordered coherent outcomes, focused checks, integration, completion conditions, and what would invalidate the strategy. Use exact paths and commands when known and useful; do not invent them to make the Plan look executable. The Plan is not a context inventory: name only the sources and relationships needed to explain or execute its steps, and leave ordinary local choices to the executing agent.

Size outcomes for manageable working context, dependencies, uncertainty and checking, not mechanically by file, bug count, test or method. A validation step may stop the Plan if a bounded assumption fails; if its result would select among materially different strategies, keep the dependent work provisional in the Working Record rather than presenting the later sequence as decided.

**Lightweight ordered Plan**, when the work is clear and short enough that phases add no value (a tiny reversible action may not need a saved Plan):

```text
Ordered actions or slices:
Checks:
Return points, if any:
Completion condition:
```

**Phased Plan**, when execution has meaningful dependencies, integration points, or several coherent outcomes. A phase groups slices that produce one integrated outcome; a slice is a coherent result, not a file list, with a clear dependency on earlier work where one exists. If later phases cannot yet be planned honestly, use a Working Record instead.

```text
## Phase 1 — <outcome>
Purpose:
Dependencies:
Return points, if any:
Completion condition:

### Slice 1.1 — <result>
Intended result:
Source requirement:
Scope or write boundary:
Work:
Dependencies:
Tests or observations:
Verification claim and required boundary:
Selected independent review, if any:
Selected local commit, if any:
Other return point, if any:
Completion condition:
```

Use only the slice fields needed to execute and check it; mention files, modules or systems only when they clarify scope.

### Keep Acceptance And Return Visible

Tie each material outcome and final check to the accepted behavior it serves. Keep the agreed return condition visible: return a proposed strategy, implement one Slice, finish the task, or stop at a specified boundary. Before a new prerequisite becomes a planned obligation, determine whether it serves an accepted requirement or only preserves a particular approach. Internal delegation handbacks and compaction cycles are not return points.

### Select Return Points Without A Schedule Of Ceremonies

Ordinary verification and silent self-review belong to producing each result; do not restate them as gates unless a particular evidence boundary needs explanation. Select independent review, a local commit, a user decision or a continuity transfer only to protect a concrete dependency, risk, rollback or delivery boundary; a slice ending or a fixed count is not enough. A selected local commit names its coherent outcome and conditions, not merely "commit after this slice"; actual results and commit identities go in the Working Record. When an existing agreement already covers the work, keep that source instead of asking the user to approve the same scope again because it is now written down.

### Adapt For The Work Type

- **Remediation:** after evidence or diagnosis establishes the cause, include the observed problem, source requirement, affected scope, ordered corrections, regression checks, recovery or cleanup, and completion condition. Do not plan from a requested patch or plausible cause alone.
- **Migration or operations:** for an accepted migration, release, rollout or operational contract, include the source and target states, prerequisites, ordered execution or cohorts, checks before, during and after, stop or recovery conditions, observation, completion and cleanup. The Plan implements accepted compatibility, safety and recovery requirements; it does not invent them.

### Finish With Integration And Invalidation

```text
Integration:
Final tests or observations:
Verification claims and required boundaries:
Selected independent review, if any:
Selected local commit, if any:
Other return point, if any:
Completion condition:

Plan invalidation conditions:
```

Useful invalidation conditions: a source requirement or accepted decision changes; a material dependency behaves differently; the design cannot satisfy the contract; checks cannot establish the required claims; implementation needs materially different scope or order; accepted review items expose a Plan-level defect. They stop or revise the affected Plan; they are not alternate branches. Do not use a narrow final check to imply broader completion.

### Revise Or Supersede

A local implementation detail, expected result, completed slice, clerical correction or reached review cap does not revise the strategy. Use a superseding Plan when editing in place would obscure the earlier accepted strategy or reviewed state, and self-review a materially revised or superseding Plan through Review Work; independent review is selected separately, not required because the Plan changed.

## Decision Records

Its binding statements restate [Write Docs](../SKILL.md) Rules; header, status and source trail follow Write Docs' [Header, Status And Sources](../SKILL.md#header-status-and-sources), like Specs and Plans.

### Choose The Right Record

Use the smallest record that preserves the decision where future work will look for it.

- **Working Record decision:** task-local choice that affects later slices or current task direction. [Track Work](../../track-work/SKILL.md) owns its `D-` ID, state, rationale, and supersession.
- **Decision note:** durable product, policy, scope, compatibility, or technical choice that needs a separate document but does not require the repository's ADR process.
- **ADR:** surprising, cross-cutting, or hard-to-reverse architecture or operational decision whose alternatives and consequences must remain durable.
- **Owning spec:** keep a decision inside a PRD, API contract, technical design, or other spec when that artifact clearly owns the decision and a separate record would only duplicate it.

Do not create a separate decision artifact merely because a decision occurred.

### When A Separate Decision Artifact Helps

A separate record is useful when the decision is:

- hard or expensive to reverse;
- surprising relative to repository or domain practice;
- a real tradeoff among materially different paths;
- cross-cutting across systems, teams, or operational boundaries;
- likely to be challenged again without its original rationale;
- intentionally rejected or superseded in a way future work must understand;
- explicitly requested as a durable decision artifact.

Ordinary reversible implementation choices, task progress, temporary constraints, assumptions, and unanswered questions do not belong in a durable decision record.

### Write The Decision Clearly

Use the repository's ADR or decision format when one exists. Otherwise adapt this shape:

```md
# Decision: <title>

> **Doc ID:** DECISION-<stable-id>
> **Type:** Decision | ADR
> **Status:** Draft | Accepted | Rejected | Superseded | Retired
> **Owner:** <decision owner>
> **Source:** <accepted context and evidence>

## Context
<Decision question, constraints, and evidence.>

## Decision
<Chosen path, exact scope, and why.>

## Alternatives
<Only materially different alternatives and why they were not chosen.>

## Consequences
<Benefits, costs, risks, compatibility, operations, and follow-up obligations.>

## Revisit Or Supersession
<Evidence, conditions, or later decision that would reopen or replace it.>
```

For a consequential choice, identify the presented option, its disclosed consequences, and the acceptance source.

### Preserve Authority And History

Name who made or owns the decision when that matters. A reviewer can challenge a decision but cannot silently replace it. A Working Record, Plan, or Handoff cannot supersede a durable decision merely by describing a different path.

When a decision changes:

- preserve the old record as `Superseded` rather than rewriting it to match the present, or as `Retired`, with the date and the reason, when nothing replaces it;
- create or identify the replacement decision, if there is one, and link both directions;
- identify owning specs, plans, or policies whose current content depends on it and revise them when authorized;
- mark dependent work contingent when a required decision or source revision remains unresolved;
- preserve the evidence that justified the change.

Live evidence may show that implementation violates a decision or that the decision is no longer viable. Use Discuss Work when resolving that conflict requires user authority.

### Avoid Duplication

Reference the decision from dependent artifacts instead of copying its full rationale. When a durable decision shapes how existing software works, the owning subsystem doc's Decisions section states its current effect and points to the record, and is kept current with the code like the rest of that doc. Keep task-local decisions in the Working Record unless they become durable beyond the task.

## Research

A research document, which answers a question with checked evidence for someone who will act on it, is written with [Research Work](../../research-work/SKILL.md) in its [Research Report](../../research-work/references/reporting.md#research-report) shape. Its header, status and source trail still follow Write Docs' [Header, Status And Sources](../SKILL.md#header-status-and-sources), with Type `Research`. A comparison of options from facts already in hand is not research: write it as a decision record, or as a section of the Spec it decides.
