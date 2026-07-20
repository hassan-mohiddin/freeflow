---
name: write-plan
description: Use when writing or revising an implementation plan, execution plan, remediation plan, migration plan, or similar ordered plan.
---

# Write Plan

Write an ordered execution strategy that is expected to be followed.

A Plan defines intended phases, slices, dependencies, boundaries, and checks. It is not a Spec, progress report, task history, or rolling record.

## Confirm The Work Is Ready To Plan

Write a Plan when:

- the intended outcome and scope are clear;
- material user decisions and source conflicts are resolved;
- the execution approach is understood well enough to order;
- phases, slices, and dependencies can be stated without guessing;
- expected checks are known or obtainable;
- substantial branching or discovery is not expected.

If direction or major alternatives remain unsettled, read [Discuss](../discuss/SKILL.md). If one user-owned choice or source conflict blocks planning, read [Decision Gate](../decision-gate/SKILL.md). If a reported failure lacks a supported cause or diagnostic loop, read [Diagnose Failure](../diagnose-failure/SKILL.md) instead of planning a guessed fix.

Use [Track Work](../track-work/SKILL.md) when strategy is still evolving or actual execution, evidence, deviations, and current state need durable memory.

If the user asks about a Plan, answer instead of writing or revising one.

## Plan From Source

A Plan may be written directly from sufficiently clear context; a separate Spec is not required.

Use the sources that establish the intended work:

- explicit user direction and accepted shared understanding;
- a Spec, issue, technical design, diagnosis, requirements, or Working Record when one exists;
- relevant code, tests, policies, ADRs, and established behavior;
- current external sources when an API, platform, or version constrains execution.

When a Spec or decision artifact is linked, preserve its contract rather than silently reinterpreting it. Live evidence overrides stale memory. A Working Record, handoff, review item, or earlier Plan is not authority over contradictory user decisions or source truth.

## Write The Ordered Strategy

Read [plan shapes](references/plan-shapes.md) and choose the smallest shape that makes the intended execution inspectable.

Include, when relevant:

- goal, source, scope, and non-goals;
- accepted decisions, assumptions, dependencies, and required order;
- phases and slices with coherent, bounded results;
- checks, integration, and final acceptance;
- conditions that would invalidate the Plan.

Include exact paths, systems, and commands when known and useful. Do not guess them to make the Plan appear complete.

Each slice should produce a coherent result that can be checked. A validation step may stop the Plan when a known assumption fails. If its result is expected to choose among materially different strategies, use a Working Record learning slice instead of pretending the later Plan is known.

## Select Useful Checkpoints

Every meaningful slice is verified and silently self-reviewed during execution; do not restate that default unless its evidence boundary is unusual.

At meaningful slice, phase, integration, risk, or continuity boundaries, consider independent review, a local commit, a user decision, or a continuity checkpoint. Record only selected checkpoints and their conditions. A slice ending or a fixed count alone does not justify a commit; prefer one when supported work forms a coherent rollback point or the next work may destabilize it.

Plan acceptance establishes the agreed strategy; it does not by itself authorize execution. When the user clearly approves execution of the Plan, that authority may cover its listed work, checks, reviews, Working Record updates, and local commits. It does not authorize push, integration, migration, deprecation, release, or launch. Planned commits remain conditional on live evidence and [Commit Work](../commit-work/SKILL.md) inspection.

## Keep Plan And Working Record Separate

The Plan records the intended execution path. The Working Record records actual execution, current slices, evidence, task-local decisions, deviations, and next action.

Do not revise the Plan for slice progress, expected evidence, status changes, or reversible local choices. Record those events in the Working Record when one exists.

Link accepted behavior, contracts, and architecture rationale from the owning Spec or decision artifact instead of duplicating them in the Plan.

## Stop Before Inventing A Path

Stop when writing would:

- invent or change requirements, scope, public behavior, compatibility, sensitive policy, failure semantics, or hard-to-reverse design;
- hide unresolved strategy, architecture, dependencies, or owner choices inside confident steps;
- plan a production fix from a guessed cause;
- rewrite tests, docs, policies, or acceptance merely to make the proposed path succeed;
- add speculative abstractions, migration machinery, retries, recovery, scale, or extension points;
- replace agreed scope with an unapproved MVP, v1/v2, roadmap, or later-version split.

Route the unresolved issue to its owner rather than writing a Plan that assumes the answer.

## Revise Only From Founded Evidence

Write Plan also owns deliberate Plan revisions.

Correct clerical mistakes directly. Do not revise the Plan for ordinary local choices or expected progress.

Revise or supersede the affected Plan when supported evidence materially changes its scope, design, architecture, order, dependencies, checks, or execution mechanism. An accepted review item may support revision. Reaching the independent-review cap does not itself justify rewriting the Plan; revise only when diagnosis or evidence shows that the Plan is wrong or insufficient.

Record the reason and execution impact in the Working Record when one exists. Revise a linked Spec or decision artifact only when its owned content changed. Preserve unaffected Plan content and history.

## Self-Check

Silently review the Plan before routing it onward:

- Are the intended result, source, and scope clear?
- Can coherent, checkable slices proceed in the stated order?
- Are dependencies, integration, final checks, and invalidation conditions represented?
- Are selected checkpoints useful and proportionate rather than automatic ceremony?
- Did the Plan invent intent, disguise material uncertainty, or absorb rolling task state?

Correct clear local issues directly. Surface only material gaps that prevent the Plan from being executable or fit for review.

## Review The Plan

After writing or materially revising the Plan, route it to [Review Artifact](../review-artifact/SKILL.md) before treating it as ready for approval and execution.

Provide the reviewer with the complete Plan, intended use, source truth, linked artifacts, dependencies, selected checkpoints, and known evidence gaps. Review Artifact owns dependency ordering, review items, judgment, adjudication, and the review cycle. Artifact review establishes fitness; the user separately accepts the Plan and grants any scoped execution authority.

## Report

State:

- Plan path and intended use;
- source context and linked artifacts;
- material assumptions, blockers, or invalidation conditions;
- selected review, commit, user, or continuity checkpoints;
- artifact-review, Plan-acceptance, and execution-authorization status.
