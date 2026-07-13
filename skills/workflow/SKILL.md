---
name: workflow
description: Use for consequential work that may involve discovery, decisions, specification, planning, implementation, diagnosis, review, verification, commits, handoffs, or route changes from new evidence.
---

# Workflow

Use an adaptive engineering loop, not a one-way checklist.

The runtime kernel owns turn interpretation, user authority, mode routing, and universal feedback constraints. This skill owns entry points, slices, backward edges, and conditional lifecycle routes.

The active agent is the responsible engineer. Its sequential self-check—self-verification, then self-review only when evidence supports the outcome—drives learning with implementation and runtime evidence. Independent review and verification are boundary roles.

## Choose The Entry Point

Enter where the work actually is:

- **Conversation:** answer, critique, or inspect without mutation.
- **Discover:** outcome, options, evidence path, or architecture direction is forming.
- **Decision gate:** user-owned decision, source conflict, or material path substitution blocks action.
- **Spec:** behavior, scope, acceptance, public contract, or failure semantics need durable source truth.
- **Plan:** the next executable horizon needs slices, checks, and backward routes.
- **Execute:** an approved bounded slice is ready.
- **TDD or simplify:** accepted behavior needs test-first implementation, or working code needs behavior-preserving simplification.
- **Migrate:** consumers, traffic, configuration, or data must move before removal.
- **Diagnose:** a concrete, repeated, or unexplained failure needs root-cause evidence.
- **Formal review:** an independent second opinion is warranted at a consequential boundary or after primary feedback cannot resolve the route.
- **Structured verification:** choosing, interpreting, or recovering a non-trivial proof path needs `verify-work`; routine direct checks stay inline.
- **Commit or handoff:** verified work needs rollback or continuity.
- **Finish, release, or launch:** integration, publication, or production rollout is the next job.

Small reversible work may move from inspection to execution and self-verification. Do not manufacture lifecycle steps. Read [the workflow map](references/workflow-map.md) when routing is unclear or the complete lifecycle is needed.

## Adaptive Feedback Loop

```text
Orient -> explore when needed -> converge enough
-> specify or plan only what must be durable
-> execute one learning / delivery / deepening slice
-> self-verify -> if supported, silently self-review your own work once
-> continue, diagnose, move backward, or stop
```

Tests, direct observations, compilers, and runtime behavior are primary feedback. Self-verification states what evidence proves; only supported work proceeds to self-review against outcome and route. Read `../verify-work/SKILL.md`, `../review-work/SKILL.md`, or `../review-artifact/SKILL.md` after any slice when richer guidance helps. Reading a skill enhances self-verification or self-review and never dispatches another context by itself.

Do not dispatch an independent reviewer because a slice ended or ordinary mistakes remain possible. Treat every phase exit as a review decision point: follow the approved plan's selected independent review, or assess whether accumulated interaction and irreversibility now justify asking for one. When failure repeats or remains unexplained, use `../diagnose-failure/SKILL.md` before redesigning. Use `../design-for-depth/SKILL.md` only when diagnosis or direct structural evidence shows that ownership, interface, state, or failure-unit design is the cause.

Method and domain skills run inside this loop without overriding source truth or owner authority. Read [domain skill composition](references/domain-skill-composition.md) when specialized guidance must compose.

Plans are rolling: detail the immediate executable horizon and keep later phases directional.

## Authority And Evidence

The user is accountable owner and collaborator, not factual source truth. Correct unsupported claims while preserving their authority over intent and consequential tradeoffs. Use `../decision-gate/SKILL.md` only for user-owned, path-changing decisions or conflicts.

Handoffs are memory, not authority. Live evidence wins.

## Slice Discipline

Each meaningful slice needs one outcome, source requirement, stable seam, smallest useful implementation or experiment, disagreeing evidence, and route check.

One sequential self-check—self-verification, then bounded self-review only on support—closes the normal slice. Other checkpoints are conditional:

- independent review at standing or plan-selected phase-exit boundaries below;
- commit when a coherent verified rollback point is useful and authorized;
- handoff when continuity requires it;
- owner checkpoint when a consequential decision remains.

When separate contexts are useful, describe bounded outcomes, dependencies, evidence, and escalation. The harness owns agents, models, worktrees, parallelism, persistence, timeouts, and transport.

## Independent Boundaries

Standing authorization needs no confirmation for the artifact-review route selected by `write-spec` and, after final self-check, one verifier plus a different reviewer in parallel against the frozen implementation. Final roles use distinct fresh contexts and independent outputs. An artifact-only task uses its artifact review as final review and needs no verifier unless executable claims require one. Standing artifact/final assurance cannot be bypassed for readiness or completion.

A plan-selected consequential phase-exit review carries scoped authorization. Other reviewers or independent verifiers require scoped authorization. Explicit independent/formal review wording or direct review commands authorizes review; explicit independent verifier wording authorizes verification. Reading skills never dispatches. Clarify ambiguous “review” once per checkpoint.

Collect both final results before adjudicating. Completion requires verifier Pass and resolved review with no later implementation change. Preserve an unaffected result when possible; any code change stales both. Self-check fixes, then ask before another independent verifier or reviewer dispatch. At an unselected phase exit, assess review need rather than automatically dispatching or automatically continuing.

## Backward Edge

Route only when evidence changes the next safe action:

- clear local defect -> fix and verify;
- repeated or unexplained failure -> diagnose;
- diagnosed structural pressure -> design-for-depth;
- new option space -> Discover;
- changed behavior, scope, acceptance, public contract, or failure semantics -> revise spec;
- changed order, slices, checks, or later assumptions -> revise plan;
- owner choice or source conflict -> decision gate;
- no safe in-scope route -> defer or stop.

Preserve valid work and revise only affected downstream decisions. Do not restart from zero, rewrite source truth silently, or redesign because ordinary mistakes exist.

## Route Closeout

After consequential completion or a phase exit, name the useful route: **Forward**, **Backward**, **Branch**, or **Stop**.

Apply the runtime kernel's `Next:` and completion contracts. A route recommendation is not permission to create the next artifact or continue into another phase.
