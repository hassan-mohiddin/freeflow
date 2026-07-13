---
name: write-plan
description: Use when turning a planning-ready spec whose required approval is satisfied, clarified requirements, diagnosis, or validated design direction into a rolling implementation plan of phases and vertical slices, including learning work, verification, checkpoints, and backward routes.
---

# Write Plan

Plan the next executable horizon without pretending later implementation is already known.

A plan is a revisable path from source truth, not a second specification, implementation transcript, or promise of flawless execution. Write the smallest plan that lets the responsible agent begin, learn, verify, and adapt safely.

## Route First

Classify the source:

- **Spec-backed:** planning-ready source truth and any required approval exist.
- **Context-backed and bounded:** explicit requirements support a lightweight plan.
- **Bug without a feedback loop:** route to diagnosis instead of guessed fix steps.
- **Unresolved interface or architecture:** use Discover or `../design-for-depth/SKILL.md` before freezing a path.
- **Hidden owner decision or source conflict:** use `../decision-gate/SKILL.md`.
- **Missing factual context:** inspect evidence before planning.

If the user asks a question about a plan, answer it instead of creating or editing one.

## Read Only What Constrains The Horizon

Use the source spec, diagnosis, or explicit requirements; relevant policies, ADRs, tests, and live code; established module and test seams; and handoffs only as memory.

Do not turn speculative repository exploration into plan requirements. Live evidence wins when the requested path is stale.

## Scale The Plan

Use a lightweight checklist for clear bounded work. Use phases only when outcomes, dependencies, learning, or risk make them useful. Read [plan shapes](references/plan-shapes.md) for the smallest fitting form.

For a rolling plan:

- detail only the current executable horizon;
- keep the next phase directional;
- reduce later phases to provisional outcomes and major constraints;
- move protocol detail into tests, experiments, or owning source documents instead of expanding the plan.

A plan may contain several slices without requiring review between them.

## Shape Useful Slices

A slice is the smallest coherent behavior or learning result worth verifying. Name only:

- outcome and source requirement;
- type: learning, delivery, or deepening;
- likely seam or write boundary;
- behavior or experiment;
- self-verification through direct evidence;
- dependencies and route-changing stop conditions.

Add failure-unit, state, recovery, migration, or rollout detail only when the slice materially owns it. Do not require exact files or helper shapes before repository evidence supports them.

Learning slices name a question, bounded experiment, available evidence mechanism, and discard-or-promote rule. Let them fail safely; they do not default to production code or independent review.

For the current horizon, every load-bearing acceptance or promotion condition must have an available mechanism that can directly support or falsify it at the required evidence boundary, or an earlier acquisition slice. “Where practical” and similar wording cannot make unavailable evidence mandatory.

When TDD, migration, or launch applies, point to the owning skill rather than reproducing its procedure.

## Plan For Feedback, Not Perfection

Every slice ends with one sequential self-check by the implementing agent: self-verification first, then bounded self-review only when evidence supports the slice. Read `verify-work` or `review-work` when richer guidance helps; reading them does not create independence. Do not schedule an independent context merely because a slice or phase ends.

Beyond the required artifact review and the parallel final verifier/reviewer pair, forecast separate contexts only when promotion, interacting risk, sensitive or hard-to-reverse behavior, or an unresolved route materially needs them.

A phase boundary can batch coherent work but is not a trigger by itself. Rolling-plan edits normally use evidence and self-review, optionally enhanced by `review-artifact`, not another independent artifact-review pass. Final acceptance checks should form one reproducible package. After sequential final self-verification and self-review, freeze one state and dispatch a distinct verifier and reviewer in parallel. Completion needs verifier Pass plus resolved review; code changes stale both and require a new self-check plus authorization before redispatch.

When failure repeats during execution, route first to diagnosis. Revise design only when diagnosis or direct structural evidence establishes a design cause.

## Backward Checkpoints

Predefine a checkpoint only where expected evidence can materially change behavior, scope, architecture, ordering, or owner decisions. State what would continue the plan and what would revise the affected spec, plan, design, or route.

Dynamic evidence may reveal a bad slice, unplanned dependency, stale assumption, or unclear root cause. Preserve valid work and change only affected downstream planning. Ordinary local mistakes do not require replanning.

## Hard Stops

Do not write a plan that:

- invents product behavior, scope, public API, compatibility, sensitive policy, failure semantics, or hard-to-reverse architecture;
- rewrites source truth to fit a desired implementation;
- hides path-changing uncertainty in detailed steps;
- promotes a production fix without a repro or accepted diagnostic path;
- turns reversible implementation choices into owner gates;
- adds speculative recovery, scale, adapters, or extension points;
- treats a handoff or reviewer finding as authority.

Ask one direct question only when a user-owned decision or source conflict blocks the next safe horizon.

## Self-Check The Plan

Before finishing, self-check in order: first self-verify source alignment and every load-bearing evidence path; only when supported, silently self-review the plan once for its intended next action:

- Is the current horizon executable without guessing consequential behavior?
- Can direct evidence disagree with each load-bearing condition?
- Are later phases directional rather than prematurely frozen?
- Did the plan add ceremony, review, or machinery without an owning risk?

Correct local clarity or consistency problems directly. Read `../review-artifact/SKILL.md` when richer artifact lenses would help, but treat that as enhanced self-review unless a formal independent boundary was selected. Surface only route-changing gaps.

When a source spec exists, follow the combined, spec-first, or spec-only review route chosen by `write-spec`; do not reopen it unless new evidence changes the risk or readiness. If no spec exists and the plan is the task's only consequential durable artifact, review that plan independently before implementation under Workflow's standing authorization. If the task ends with the plan, its artifact review also satisfies final review.

## Completion

Report the plan path when saved, source context, current executable horizon, directional later work, open learning questions, route-changing decisions, and material unverified assumptions.

The plan is ready when responsible implementation can begin and learn safely—not when every future slice, mistake, or review outcome has been predicted.
