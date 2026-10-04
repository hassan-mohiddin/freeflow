---
name: write-plan
description: "Use when writing or revising an implementation plan, execution plan, remediation plan, migration plan, or similar ordered plan."
---

# Write Plan

Write a supported ordered strategy for an agreed outcome. Make its dependencies, actions, checks, and invalidation conditions clear without inventing requirements or pretending unknown later work is settled.

A Plan describes intended execution. The Working Record preserves actual work, evolving state, and the next useful action.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- A Plan creates no authority. Accepting it as a strategy is not permission to execute it. Explicit approval to execute it may cover its listed work, checks, selected reviews, record maintenance, and local commits (still subject to fresh evidence and [Commit Work](../commit-work/SKILL.md) inspection); it never implies push, integration, migration, deprecation, release, or launch.
- Never invent product behavior, compatibility, public interfaces, failure semantics, sensitive policy, migration, scale, retries, recovery, or extension machinery, and never replace agreed scope with an unapproved MVP or later-version split.
- Never encode a hoped-for answer or an unsettled owner choice as a planning assumption. Use [Discuss](../discuss/SKILL.md) for unresolved direction or material alternatives, [Decision Gate](../decision-gate/SKILL.md) for a blocking owner choice or source conflict, and [Diagnose Failure](../diagnose-failure/SKILL.md) for a fix whose cause is unsupported.
- Never let available tests redefine acceptance, or claim whole-system completion from a narrow observer.
- Writing or revising a Plan does not trigger independent review, and neither self-review nor independent review grants user acceptance or execution authority.

## Plan Only What Is Understood Enough To Order

Goal: write a durable Plan only when the strategy can be ordered honestly and needs to survive on its own.

Use a durable Plan when the intended outcome and material decisions are settled, the approach and dependencies can be ordered without guessing, and the strategy needs to survive independently. Not every task needs one: a small correction can proceed from its request and supported approach, and an evolving route with substantial branching belongs in [Track Work](../track-work/SKILL.md) as provisional Slices, not a confident long-form Plan.

If the user asks about a Plan, answer rather than write one. If execution is already authorized and a Plan is useful preparation, writing it need not create another approval stop; preserve any review or user-return boundary actually selected.

## Establish The Current Basis

Goal: the Plan implements current accepted sources, not an older baseline.

A separate Spec is not required when the request and accepted understanding are clear enough. Otherwise consume the relevant Spec, issue, design, diagnosis, decision, or requirements, together with current code, tests, policies, ADRs, and external constraints where needed.

Identify which accepted source version or amendment the Plan implements. A Working Record can locate those sources but cannot override them, and a previously reviewed baseline does not excuse ignoring a later accepted change.

Separate the required outcome and non-goals, accepted design choices and constraints, the supported implementation approach, assumptions whose failure would invalidate dependent work, and unresolved or deferred work outside the Plan's promise. An experiment produces evidence, not an automatic requirement: include its consequences only where selected for this outcome, and do not omit consequences the user later accepted.

## Write The Smallest Useful Strategy

Goal: enough to inspect and execute the strategy, and no more.

Read [Plan Shapes](references/plan-shapes.md) before choosing the artifact shape.

Include the relevant goal, sources, scope, decisions, assumptions, dependencies, ordered coherent outcomes, focused checks, integration, completion conditions, and what would invalidate the strategy. Use exact paths and commands when known and useful; do not invent them to make the Plan look executable.

Size outcomes for manageable working context, dependencies, uncertainty, and checking, not mechanically by file, bug count, test, or method. Each Slice should have a coherent result and a clear dependency on earlier work where one exists.

A validation step may stop the Plan if a bounded assumption fails. If its result would select among materially different strategies, keep dependent work provisional in the Working Record rather than presenting the later sequence as decided.

The Plan is not a context inventory: specify only the sources and relationships needed to explain or execute its steps, and leave ordinary local choices to the executing agent.

## Preserve Acceptance And Return Conditions

Goal: every planned outcome traces to accepted behavior, and the user-facing return point stays visible.

Tie each material outcome and final check to the accepted behavior it serves. Keep the agreed return condition visible: return a proposed strategy, implement one Slice, finish the task, or stop at a specified boundary. Internal delegation handbacks and context cycles are not user checkpoints.

Before a new prerequisite becomes a planned obligation, determine whether it serves an accepted requirement or only preserves a particular approach, and resolve consequential alternatives instead of hiding them in confident steps.

## Select Checkpoints Without A Schedule Of Ceremonies

Goal: checkpoints protect real boundaries, not a routine.

Ordinary verification and silent self-review belong to producing each result; do not restate them as gates unless a particular evidence boundary needs explanation. Include independent review, a local commit, a user decision, or a continuity transfer only when selected to protect a concrete dependency, risk, rollback, or delivery boundary; a Slice ending or a fixed count is not enough.

When an existing agreement already covers the work, preserve that source instead of asking the user to approve the same scope again because it is now written down.

## Revise Only The Affected Strategy

Goal: the Plan changes when its strategy changes, not when work progresses.

Do not update a Plan for completed steps, ordinary local choices, test counts, or routine status; record actual state through Track Work. Revise or supersede the affected strategy when accepted intent or supported evidence changes its scope, design, ordering, dependencies, checks, or mechanism, preserving valid earlier work and rationale. A clerical correction does not reopen the strategy, and reaching a review cap is not evidence the Plan needs rewriting.

Identify affected upstream and downstream artifacts and revise only content whose owned meaning changed and whose mutation is authorized. If an upstream contract remains unresolved, mark dependent steps contingent before they are used. Do not repair consistency by silently changing the required outcome.

## Self-Review Before Treating The Plan As Usable

Goal: the Plan can achieve the accepted outcome before anyone relies on it.

After factual source checks, use [Review Artifact](../review-artifact/SKILL.md) for one silent author self-review of the complete Plan, its accepted sources, and the intended execution boundary. Check that the ordered work can achieve the accepted outcome, dependencies are supported, later uncertainty is honest, final checks match acceptance, and selected checkpoints are proportionate. Correct clear covered defects and recheck affected facts and lenses.

Use Review Artifact's independent route only when separately selected and authorized to protect a concrete boundary; supply complete sources, dependencies, and limits, and adjudicate the returned report before acting on it.

## Report And Return

Report the Plan path and intended use, source basis, material assumptions or contingent work, invalidation conditions, selected checkpoints, and actual review, acceptance, and execution-authority status.

When a Working Record exists and the Plan is accepted for its task, list it under the record's `What defines this task` through Track Work so every recovery reads it.

Return the supported strategy to the requesting activity. If the agreement covers implementation, continue through the normal execution route; if it asks for a Plan first, stop there. Do not begin work outside that agreement or claim an unresolved strategy is ready.
