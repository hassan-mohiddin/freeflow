---
name: write-plan
description: "Use when writing or revising an implementation plan, execution plan, remediation plan, migration plan, or similar ordered plan."
---

# Write Plan

Write a supported ordered strategy for an agreed outcome. Make its dependencies, actions, checks, and invalidation conditions clear without inventing requirements or pretending unknown later work is settled.

A Plan describes intended execution. The Working Record preserves actual work, evolving state, and the next useful action. Neither creates authority by existing.

## Plan Only What Is Understood Enough To Order

Use a durable Plan when the intended outcome and material decisions are settled, the approach and dependencies can be ordered without guessing, and the strategy needs to survive independently.

Not every task needs one. A small correction can proceed from its request and supported approach. An evolving route with substantial branching belongs in [Track Work](../track-work/SKILL.md) as provisional Slices, not a confident long-form Plan.

Use [Discuss](../discuss/SKILL.md) for unresolved direction or material alternatives, [Decision Gate](../decision-gate/SKILL.md) for a blocking owner choice or source conflict, and [Diagnose Failure](../diagnose-failure/SKILL.md) for a fix whose cause is unsupported. Do not encode the hoped-for answer as a planning assumption.

If the user asks about a Plan, answer rather than write one. If execution of the task is already authorized and a Plan is useful preparation, writing it need not create another approval stop. Preserve any review or user-return boundary actually selected.

## Establish The Current Basis

A separate Spec is not required when the request and accepted understanding are sufficiently clear. Otherwise consume the relevant Spec, issue, design, diagnosis, decision, or requirements, together with current code, tests, policies, ADRs, and external constraints where needed.

Identify which accepted source version or amendment the Plan implements. A Working Record can locate those sources but cannot override them. Do not use an older experimental or design baseline merely because a prior Plan was reviewed.

Separate:

- the required outcome and non-goals;
- accepted design choices and constraints;
- the supported implementation approach;
- assumptions whose failure would invalidate dependent work;
- unresolved or intentionally deferred work outside this Plan's promise.

An experiment produces evidence, not an automatic requirement. Include its consequences only where selected for this outcome; do not omit consequences the user subsequently accepted.

## Write The Smallest Useful Strategy

Read [Plan Shapes](references/plan-shapes.md) before choosing the artifact shape.

Include relevant goal, sources, scope, decisions, assumptions, dependencies, ordered coherent outcomes, focused checks, integration, completion conditions, and what would invalidate the strategy. Use exact paths and commands when known and useful; do not invent them to make the Plan look executable.

Size outcomes for manageable working context, dependencies, uncertainty, and checking. Do not divide mechanically by file, bug count, test, or method. The complete task may require several Slices, but each should have a coherent result and a clear dependency on earlier work where one exists.

A validation step may stop the Plan if a bounded assumption fails. If its result is expected to select among materially different strategies, keep dependent work provisional in the Working Record rather than presenting the later sequence as decided.

The Plan is not a context inventory. Specify only the sources and relationships needed to explain or execute its steps, leaving ordinary local choices to the executing agent.

## Preserve Acceptance And Return Conditions

Tie each material outcome and final check to the accepted behavior it serves. Do not let available tests redefine acceptance or claim whole-system completion from a narrow observer.

Keep the agreed user-facing return condition visible: return a proposed strategy, implement one Slice, finish the described task, or stop at a specified boundary. Internal delegation handbacks and context cycles are not automatic user checkpoints.

A Plan must not invent product behavior, compatibility, public interfaces, failure semantics, sensitive policy, migration, scale, retries, recovery, or extension machinery. Do not replace agreed scope with an unapproved MVP or later-version split.

Before a new prerequisite becomes a planned obligation, determine whether it serves an accepted requirement or only preserves a particular approach. Resolve consequential alternatives instead of hiding them in confident steps.

## Select Checkpoints Without Making A Schedule Of Ceremonies

Ordinary verification and silent self-review belong to producing each supported result. Do not restate them as independent gates unless a particular evidence boundary needs explanation.

Include independent review, a local commit, a user decision, or continuity transfer only when selected to protect a concrete dependency, risk, rollback, or delivery boundary. A Slice ending or a fixed count is insufficient.

Accepting a Plan as a strategy is not permission to execute it. Explicit approval to execute the Plan may cover its listed work, checks, selected reviews, record maintenance, and local commits. It does not imply push, integration, migration, deprecation, release, or launch. Planned commits remain conditional on fresh evidence and [Commit Work](../commit-work/SKILL.md) inspection.

When an existing agreement already covers the work, preserve that source instead of asking the user to approve the same scope again because it is now written down.

## Revise Only The Affected Strategy

Do not update a Plan for completed steps, ordinary local choices, test counts, or routine status. Record material actual state through Track Work when present.

Revise or supersede the affected strategy when accepted intent or supported evidence changes its scope, design, ordering, dependencies, checks, or mechanism. Preserve valid earlier work and rationale. A clerical correction does not reopen the strategy, and reaching a review cap is not evidence that the Plan needs rewriting.

Identify affected upstream and downstream artifacts. Revise only content whose owned meaning changed and whose mutation is authorized. If an upstream contract remains unresolved, mark dependent steps contingent before they are used. Do not repair consistency by silently changing the required outcome.

## Self-Review Before Treating The Plan As Usable

After factual source checks, use [Review Artifact](../review-artifact/SKILL.md) for one silent author self-review of the complete Plan, accepted sources, and intended execution boundary.

Check whether the ordered work can achieve the accepted outcome, dependencies are supported, later uncertainty is honest, final checks match acceptance, and selected checkpoints are proportionate. Correct clear covered defects and recheck affected facts and lenses.

Do not automatically dispatch an independent reviewer after writing or revising a Plan. Use Review Artifact's independent route only when separately selected and authorized to protect a concrete boundary. Supply complete sources, dependencies, and limits; adjudicate the returned report before acting on its findings.

Neither self-review nor independent review grants user acceptance or execution authority. Conversely, an already-covered execution agreement does not need another approval turn solely because planning produced an artifact.

## Report And Return

Report the Plan path and intended use, source basis, material assumptions or contingent work, invalidation conditions, selected checkpoints, and actual review/acceptance/execution-authority status.

Return the supported strategy to the requesting activity. If the agreement covers implementation, the agent can continue through the normal execution route; if it asks for a Plan first, stop there. Do not begin work outside that agreement or claim an unresolved strategy is ready.
