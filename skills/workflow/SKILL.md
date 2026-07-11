---
name: workflow
description: Use for consequential work that may involve discovery, decisions, specification, planning, implementation, diagnosis, review, verification, commits, handoffs, or route changes from new evidence.
---

# Workflow

Use an adaptive engineering loop, not a one-way checklist.

Move forward when context is sufficient. After each meaningful slice, verify what it proved and check whether the route still holds. Re-enter the narrowest earlier activity when evidence changes the path.

Questions request answers, not surprise artifacts or edits. Suggestions and criticism are hypotheses to evaluate, not automatic permission or correction.

## Choose The Entry Point

Enter where the current work actually is:

- **Conversation:** direct answers, critique, and non-mutating exploration.
- **Discover:** outcome, option space, evidence path, or architecture direction is still forming.
- **Decision gate:** a user-owned decision, source conflict, or material path substitution blocks action.
- **Spec:** behavior, scope, acceptance, public contract, or failure semantics need durable source truth.
- **Plan:** the next executable horizon needs phases, slices, checks, and backward checkpoints.
- **Execute:** an approved bounded slice is ready.
- **TDD or simplify:** one accepted behavior needs test-first implementation, or working code needs behavior-preserving simplification.
- **Migrate:** consumers, traffic, configuration, or data must move before an old path can be removed.
- **Diagnose:** a concrete failure signal needs root-cause evidence.
- **Review:** independent judgment may change confidence or route.
- **Verify:** an implementation or completion claim needs proof.
- **Commit or handoff:** a verified checkpoint needs rollback or continuity.
- **Finish, release, or ship:** branch integration, versioned publication, or production rollout is the actual next job.

Small reversible work may move directly from inspection to execution and verification. Do not manufacture specs, plans, reviews, commits, or handoffs merely because the full lifecycle contains them.

Read [the workflow map](references/workflow-map.md) when the entry point is unclear, work spans multiple phases, or public documentation needs the complete lifecycle.

## Adaptive Loop

```text
Orient
-> Explore breadth when needed
-> Converge enough for the next safe horizon
-> Specify or plan only what must be durable
-> Execute one learning / delivery / deepening slice
-> Verify
-> Route check
-> Continue, branch, move backward, or stop
```

Method skills such as TDD, simplification, diagnosis, migration, and design-for-depth run inside this loop. They do not override source truth, owner authority, or route checks.

Use relevant repo or domain skills for specialized engineering while Freeflow owns routing, decisions, evidence, and backward edges. Read [domain skill composition](references/domain-skill-composition.md) when frontend, accessibility, browser, security, performance, CI/CD, observability, cloud, migration, release, or deployment guidance must compose with the workflow.

Plans are rolling. Detail the immediate executable phase; keep later phases directional until evidence resolves their assumptions.

## Decision And Source Boundaries

Use `../decision-gate/SKILL.md` before silently choosing:

- product behavior, scope, priority, or domain meaning;
- public API, compatibility, permissions, security, privacy, billing, or data-loss behavior;
- hard-to-reverse architecture or migration behavior;
- a new source-of-truth direction that conflicts with docs, tests, specs, policies, ADRs, or established behavior;
- a fallback that materially changes evidence quality, workflow shape, risk, scope, cost, persistence, or user-visible output.

Inspect factual questions first. Ask only for decisions that remain user-owned or path-changing.

Handoffs are memory, not authority. Live evidence wins when they conflict.

## Slice Discipline

Each meaningful slice should have:

- one outcome or learning question;
- source requirement and stable seam;
- smallest useful implementation or experiment;
- verification that can disagree with the claim;
- a route check against assumptions, interface, scope, and remaining work.

Formal checkpoints are conditional:

- review when architecture, sensitivity, integration, accumulated risk, or final confidence warrants independence;
- commit when a coherent verified rollback point is useful and authorized;
- handoff when context or continuity requires it;
- owner checkpoint when a consequential decision remains.

When work uses separate contexts, describe bounded outcomes, dependencies, evidence, and escalation conditions. The harness owns agents, models, worktrees, parallelism, persistence, timeouts, and transport.

## Backward Edge

Route backward when new evidence changes the next safe action.

Examples:

- implementation exposes new option space -> Discover;
- caller coordination or edge-case patches grow -> design-for-depth;
- behavior, scope, acceptance, public contract, or failure semantics change -> revise spec;
- order, slice boundaries, checks, or later phases change -> revise plan;
- a failure signal lacks root cause -> diagnose;
- owner choice or source conflict appears -> decision gate;
- no safe in-scope route remains -> defer or stop.

Preserve valid work and revise only affected downstream decisions. Do not restart from zero, rewrite source truth silently, or patch forward because work has already begun.

## Route Closeout

After a consequential phase exit or completion, name the useful next route:

- **Forward:** the next bounded action is clear.
- **Backward:** evidence invalidated the current path.
- **Branch:** two or three valid routes remain.
- **Stop:** no useful or safe next action remains.

Use `Next:` only when it saves the user from having to ask what follows. Omit it for direct answers, mid-task status, clarification-only turns, direct owner-decision questions, or when no useful route needs naming.

`Next:` recommends a route. It is not permission to create the next artifact or continue into another phase.

## Completion

Do not claim completion without fresh evidence. State what changed, what was verified, what remains unverified, and whether review, commit, handoff, or a backward route remains.