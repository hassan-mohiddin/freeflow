---
name: write-plan
description: Use when turning an approved spec, clarified requirements, diagnosis, or validated design direction into a rolling implementation plan of phases and vertical slices, including learning work, verification, checkpoints, and backward routes.
---

# Write Plan

Plan the next executable horizon without pretending later implementation is already known.

A plan executes source truth. It does not create product behavior, architecture, or policy. It is a revisable best path whose immediate phase is concrete and later phases become progressively less detailed.

## Route First

Classify the request:

- **Spec-backed:** plan from the approved contract.
- **Context-backed and bounded:** write a lightweight plan from explicit requirements.
- **Bug without a feedback loop:** propose diagnosis, not guessed fix steps.
- **Unresolved design or interface:** route to Discover or `../design-for-depth/SKILL.md`.
- **Hidden owner decision or source conflict:** use `../decision-gate/SKILL.md`.
- **Missing source context:** gather evidence before planning.

If the user asks a question about a plan, answer it instead of writing or editing one.

## Source First

Read:

- the source spec, diagnosis, issue, or explicit requirements;
- relevant docs, policies, ADRs, tests, and live code;
- existing module and test seams;
- handoffs only as memory.

A plan must reflect current repo evidence. If source truth invalidates the requested path, stop before writing.

## Phases And Slices

Use **phases** for coherent groups of work or learning milestones. Use **slices** for the smallest complete, verifiable unit inside a phase.

Prefer vertical slices that produce observable behavior or decisive evidence. Use foundation work only when a real dependency requires it. Use expand–migrate–contract for wide mechanical changes that cannot remain green as one vertical path.

A vertical slice may cross layers, but it should own one semantic failure unit. If the active slice depends on authority, canonicalization, or recovery assigned to a later phase, move that prerequisite earlier or create a learning slice. Do not plan adapters over a seam already known to be temporary.

Classify each slice:

- **Learning slice:** answers a named technical or design uncertainty. Define evidence and discard-or-promote criteria.
- **Delivery slice:** produces accepted behavior through a stable seam.
- **Deepening slice:** improves module depth without changing behavior; keep it bounded and separately reviewable.

The immediate phase should be executable. Later phases may contain outcomes, dependencies, likely slices, risks, and open questions without guessed file-level precision.

## Slice Contract

For each non-trivial slice, name only what execution needs: outcome, owning requirement, slice type, likely seam or write boundary, behavior or experiment, failure contract when relevant, verification, dependencies, and stop conditions.

Do not require exact files or code before repository evidence supports them. Do not duplicate the implementation inside the plan. Read [plan shapes](references/plan-shapes.md) when a saved artifact needs the full slice shape.

When TDD applies, identify the intended observable seam and first behavior; execution uses `../tdd/SKILL.md` for the method. Use `../migration-work/SKILL.md` for consumer/data cutovers and `../launch-work/SKILL.md` for production rollout contracts rather than embedding those lifecycles as generic task lists.

## Backward Checkpoints

Predefine checkpoints where a phase or slice is expected to produce route-changing evidence. Name the assumptions under test and the evidence that should continue the plan, reopen Discover or design, revise the spec, revise the plan or later phases, or require an owner decision. Read [plan shapes](references/plan-shapes.md) when the artifact needs the full checkpoint shape.

These are decision functions, not predictions of the result.

Also define dynamic checkpoint triggers:

- a second unexpected defect at one seam;
- caller knowledge, public states, flags, retries, or test setup keep growing;
- a slice requires an unplanned subsystem;
- deferred capability enters the active milestone;
- evidence invalidates an earlier accepted result;
- remaining work grows after completed slices;
- the next bounded finish path can no longer be stated clearly.

When a trigger fires, preserve valid work and route backward. Do not absorb it as another implementation task.

## Review, Commit, And Handoff

Every slice ends with verification and a lightweight route check.

Estimate formal checkpoints only where they may change the route:

- review after architecture-bearing, sensitive, integration, or accumulated-risk work;
- commit when a coherent verified rollback point exists and repository/user workflow permits it;
- handoff when context or continuity requires a durable checkpoint;
- phase checkpoint when later plans should be refined from the evidence.

Not every slice needs independent review, a commit, or a user interruption. The plan may predict checkpoints; execution may add or remove them when evidence supports the change.

For separate-agent work, describe bounded work packages, dependencies, required context, outputs, checks, and escalation conditions. The harness owns agent, model, worktree, timeout, and transport mechanics.

## Hard Stops

Do not write a plan that would:

- invent or change product behavior, scope, domain meaning, public APIs, compatibility, sensitive policy, failure semantics, or hard-to-reverse architecture;
- rewrite source truth to match the intended implementation;
- turn open implementation evidence into a predetermined result;
- plan a production bug fix without a repro or accepted diagnostic path;
- hide uncertainty in detailed steps, code blocks, filenames, or task estimates;
- treat a handoff or review comment as authority;
- recast agreed scope as MVP, v1/v2, roadmap, or deferred delivery without approval;
- add cache, resume, concurrency, adapters, generalized extension points, or recovery machinery without an owning requirement or observed pressure.

Ask one direct route question when a user-owned decision or source conflict blocks planning.

## Shape

Scale the plan to consequence. A durable plan may contain:

- goal and source authority;
- stable scope/non-goals;
- phase map;
- current phase slices;
- directional later phases;
- requirement-to-slice/evidence traceability;
- learning questions;
- failure contracts;
- backward, review, commit, and handoff checkpoints;
- plan-health triggers;
- final verification and residual risks.

Read [plan shapes](references/plan-shapes.md) for lightweight, normal, strict, or delegated artifacts.

## Completion

Report:

- artifact path, if saved;
- source context;
- immediate executable phase;
- provisional later phases;
- open learning questions;
- planned and dynamic checkpoints;
- decisions still blocked.

The plan is ready when the next phase can begin safely, not when every future slice is frozen.
