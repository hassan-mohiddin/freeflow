---
name: write-spec
description: "Use when writing or revising a spec, PRD, issue, API contract, technical design, migration contract, decision artifact, or similar durable document."
---

# Write Spec

Turn accepted intent and source evidence into a durable artifact that later work can use without inheriting invented requirements or losing accepted changes.

A Spec describes content, behavior, constraints, and uncertainty for its intended use. It is not an implementation sequence, Working Record, transcript, or permission grant. Useful technical depth is welcome; hypothetical completeness is not required.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- A Spec grants no permission and does not begin implementation. Review establishes fitness, not user acceptance or execution authority; never label author self-review as independent review, or use an approval status without its source.
- A drafted proposal is not accepted behavior; label proposed design as proposed. Authorization to investigate or draft an option is not acceptance of undisclosed production consequences.
- Never add an obligation without an accepted source or a reason it is necessary for the stated outcome. Do not infer requirements from nearby code, existing tests, or available machinery, and do not reduce agreed scope into an unapproved MVP, roadmap, or later-version split.
- Stop the affected writing when it would silently change behavior, scope, public interfaces, compatibility, sensitive policy, failure semantics, or hard-to-reverse design; never settle such a choice through normative prose, an unexplained assumption, or a polished placeholder; return the concrete effect and supported alternatives to its owner through [Decision Gate](../decision-gate/SKILL.md) or [Discuss](../discuss/SKILL.md).
- Never rewrite source truth to suit implementation, and never rewrite historical decisions as though they always contained the new choice.
- Writing or revising a Spec does not trigger independent review.

## Establish The Artifact's Job

Goal: know who will use the artifact and for what, before writing it.

Identify the artifact type, intended reader or future action, accepted scope, destination, and the unresolved questions it must preserve.

Answer questions about a Spec without editing it unless revision is requested. Use Discuss when direction or alternatives remain materially open and Decision Gate for one blocking owner choice or source conflict; do not repeat discussion that already settled the artifact's purpose. An agreement to implement accepted work may include documenting its supported contract; do not manufacture another user approval because a document was produced.

## Establish The Current Source Basis

Goal: the artifact rests on what was actually accepted, including later amendments.

Use the sources that actually determine the artifact:

- current user direction and accepted discussion, including later amendments;
- existing Specs, issues, decisions, and contracts being revised or consumed;
- relevant live code, tests, policy, ADRs, and established behavior;
- current primary sources when an external version or interface constrains the result;
- [Track Work](../track-work/SKILL.md) for task memory when a record exists.

A record or implementation summary cannot override contradictory current intent or accepted source truth. Distinguish what was requested, proposed, accepted, and actually observed. Preserve enough source identity to recover the basis of a consequential statement; for an approval such as "proceed", keep the proposal and response together when their scope matters. A test can faithfully protect an unnecessary mechanism.

## Write Only What The Intended Use Needs

Goal: enough depth for the use, with requirements, facts, proposals, and open questions never confused.

Read [Spec Shapes](references/spec-shapes.md) before choosing the structure. Read [Artifact Standards](references/artifact-standards.md) when choosing destination, identity, status, source trail, or revision shape. Read [Decision Records](references/decision-records.md) when the artifact primarily preserves a decision and rationale.

Include relevant purpose, scope, non-goals, accepted behavior, constraints, interfaces, consequential failure semantics, acceptance, and evidence. Explain architecture and ownership deeply where the use requires it; do not remove necessary detail just to shorten the document.

When writing an implementation-guiding design whose unresolved representation, identity, ownership, algorithm, or failure choices could invalidate significant dependent work, read [Design for Depth](../design-for-depth/SKILL.md) and use its Implementation Decisions method. Preserve the selected choices and rationale, distinguishing fixed constraints from illustrative sketches and local freedom. Existing supported decisions need no fresh design exercise; open choices stay visible rather than being filled with invented mechanics.

Keep distinguishable: required behavior and accepted decisions; supported facts and their evidence limits; proposed mechanisms; tentative assumptions and open questions; intentional deferrals and superseded direction. Use the repository's vocabulary rather than inventing a status schema, and place a consequential uncertainty where the reader makes the affected decision, not in a distant caveat.

A limitation of one implementation technique does not establish a need for stronger guarantees, host changes, new persistence, retries, or a subsystem. Open questions need not stop unrelated content; a proposal can be fit for discussion while unfit to guide production, so state that boundary.

Keep ordered execution in a Plan and live progress in the Working Record. Link shared rationale rather than copying it into several independently maintained sources.

## Reconcile Material Changes

Goal: the artifact reflects the current accepted contract without losing why it changed.

Preserve accepted content that still holds. Change only what new intent or evidence affects, and keep consequential prior rationale recoverable through the owning decision record, change history, or version control.

When an accepted amendment or learning result changes the contract, identify the affected downstream Plan, acceptance check, or implementation assumption. Reconcile them when authorized; otherwise mark them contingent and return the needed revision before dependent use. Do not synchronize unrelated artifacts.

Experimental learning does not automatically enter the production contract: distinguish findings deliberately selected for implementation from observations kept as evidence or deferred possibilities. Conversely, do not keep an older baseline after the user accepted a relevant change. Follow repository policy for historical records and supersession.

## Self-Review Once Before Use

Goal: the artifact is fit for its use before anyone relies on it.

After checking source-backed factual claims, use [Review Artifact](../review-artifact/SKILL.md) for silent author self-review of the complete artifact and its intended use. Check that it preserves accepted intent and amendments, separates requirements from proposals, has sufficient evidence and acceptance conditions, and keeps affected dependencies coherent. Correct clear covered defects and recheck affected facts and lenses; return unresolved owner decisions instead of inventing an answer to make the document consistent.

Independent review applies only when selected and authorized to protect a concrete boundary: supply the complete artifact, source basis, dependencies, and evidence limits through Review Artifact's independent route, and adjudicate its report before revision or use. Respect an explicitly selected approval checkpoint, but do not create one for every artifact.

## Report And Stop

Report the artifact path, type, intended use, source basis, material unresolved or contingent content, and actual review and acceptance status.

When a Working Record exists and the Spec is accepted for its task, list it under the record's `What defines this task` through Track Work so every recovery reads it.

Stop when the authorized artifact is fit for its stated use or its blocking decision or evidence limit is explicit, and return to the requesting activity.
