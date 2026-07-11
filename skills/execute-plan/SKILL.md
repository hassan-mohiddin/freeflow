---
name: execute-plan
description: Use when implementing an approved plan, executing or resuming planned slices, refining a rolling plan from implementation evidence, handling failed checks or review findings during execution, or deciding whether the next route is forward, backward, branched, or stopped.
---

# Execute Plan

Execute the next approved horizon without treating the plan as permanent authority.

Live repo evidence and source truth win. Preserve the accepted outcome, but revise the implementation path when evidence invalidates it.

Every meaningful slice ends with verification and a route check. Review, commit, handoff, and user checkpoints are conditional.

Read [the execution map](references/execution-map.md) for multi-slice work, learning slices, TDD, rolling-plan refinement, accumulated design pressure, or any failed check, review, source, or scope condition.

## Orient

Before editing, read:

- the current plan phase and source requirements;
- relevant specs, docs, tests, policies, ADRs, and live code;
- prior phase evidence and handoffs as memory, not authority;
- later phases only far enough to understand dependencies and assumptions.

Confirm that the immediate phase is executable. Later phases may remain directional.

Classify the next route:

- **Execute:** the next slice is bounded and supported by source truth.
- **Discover or design:** the option space, interface, ownership, or failure unit is unsettled.
- **Revise spec:** behavior, scope, acceptance, public contract, or failure semantics changed.
- **Revise plan:** slice boundaries, order, mechanism, checks, or later phases changed.
- **Decision gate:** a user-owned decision or source/path conflict blocks progress.
- **Diagnose:** the next question is a concrete failure signal or repeated loop failure.
- **Stop or defer:** no safe in-scope route remains.

Do not improve, broaden, or reinterpret the plan silently.

## Slice Contract

Before each non-trivial slice, name:

```text
Slice outcome:
Source requirement / acceptance:
Type: learning | delivery | deepening
Module / interface / seam:
Behavior, experiment, test, or benchmark:
Failure contract when relevant:
Verification:
Assumptions under test:
Route-change triggers:
Formal checkpoint if needed: review | commit | handoff | owner
```

Choose local reversible details from repo conventions. Stop when the slice requires behavior, policy, compatibility, public API, security, privacy, billing, permissions, data-loss, migration, or hard-to-reverse architecture that source truth has not settled.

If work is carried out through separate execution contexts, define bounded work packages, dependencies, source context, outputs, checks, and escalation conditions. The active harness owns agents, models, worktrees, parallelism, persistence, timeouts, and transport.

Do not start a slice when the remaining context is insufficient to orient, edit, verify, and record the route.

## Execute The Slice

Work vertically through one behavior or evidence path.

- Make only the edits needed for the active slice.
- Keep later slices out unless current evidence changes the plan explicitly.
- For a learning slice, capture the named evidence and apply its discard-or-promote rule. Exploratory code does not become production code silently.
- When test-first work applies, use `../tdd/SKILL.md` for one behavior-level RED/GREEN/REFACTOR loop.
- Use `../design-for-depth/SKILL.md` when caller knowledge, states, flags, retries, test setup, or cross-module coordination starts growing.
- Use `../diagnose-failure/SKILL.md` when a failed check needs root-cause evidence rather than another patch.

Do not rewrite a verifier, test, spec, policy, or other source-truth artifact merely to make implementation pass. A stale or incorrect check is evidence that the route may need revision, not permission to change the contract.

## Verify And Check The Route

After every meaningful slice:

1. Run the planned check or the smallest equivalent check that proves the slice outcome.
2. State what the evidence proves and what remains unverified.
3. Compare the result with the slice assumptions, interface, failure contract, and remaining plan.
4. Check whether the next bounded finish path is still clear and remaining work is shrinking.
5. Choose the next route before editing again.

Continue only when the evidence preserves the current outcome, scope, interface, and plan health.

Route backward when:

- a second unexpected defect appears at the same seam;
- fixes keep adding caller knowledge, public states, flags, retries, or test machinery;
- a slice requires an unplanned subsystem or deferred capability;
- implementation invalidates earlier evidence or acceptance;
- later phases now depend on a different interface or ordering;
- remaining work grows after completed slices;
- the next bounded finish path can no longer be stated clearly;
- verification or review exposes a source conflict, missing owner decision, or unsupported claim.

Preserve verified work and identify only the affected decisions, spec sections, phases, and slices. Do not restart from zero or patch forward because work has already begun.

## Formal Checkpoints

Use formal checkpoints when they can change or preserve the route:

- **Review:** architecture-bearing, sensitive, integration, accumulated-risk, or final work; use `../review-work/SKILL.md`.
- **Commit:** a coherent verified rollback point exists and repository/user workflow permits it; use `../commit-work/SKILL.md`.
- **Handoff:** context, pause, or continuity requires durable continuation state; use `../handoff/SKILL.md`.
- **Owner:** a consequential decision remains; use `../decision-gate/SKILL.md`.

Do not require every checkpoint after every slice by habit.

A non-passing review is a phase exit. Adjudicate through `review-work` before editing from its findings. A failed verification is evidence to classify through `verify-work` or diagnosis before changing direction.

## Rolling Plan

At a phase boundary, refine only the next executable horizon from current evidence. Keep later phases directional until their dependencies and assumptions are resolved.

If refinement changes accepted behavior or scope, revise the spec or ask the owner before continuing. If it changes only implementation order, slice boundaries, or checks, revise the plan and name why.

## Completion

Report:

- slices completed and evidence produced;
- verification and review status;
- assumptions confirmed or invalidated;
- plan/spec changes or backward routes taken;
- commit or handoff checkpoints when relevant;
- remaining unverified behavior;
- recommended next route.

Implementation is complete only when the accepted outcome is proved, not when every original plan step was followed.