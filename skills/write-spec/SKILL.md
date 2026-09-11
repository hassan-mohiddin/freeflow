---
name: write-spec
description: "Use when writing or revising a spec, PRD, issue, API contract, technical design, migration contract, decision artifact, or similar durable document."
---

# Write Spec

Turn accepted intent and source evidence into a durable artifact that later work can use without inheriting invented requirements or losing accepted changes.

A Spec describes content, behavior, constraints, and uncertainty for its intended use. It is not an implementation sequence, Working Record, transcript, or permission grant. Useful technical depth is welcome; hypothetical completeness is not required.

## Establish The Artifact's Job

Identify the artifact type, intended reader or future action, accepted scope, destination, and unresolved questions it must preserve.

Answer questions about a Spec without editing it unless revision is requested. Use [Discuss](../discuss/SKILL.md) when direction or alternatives remain materially open, and [Decision Gate](../decision-gate/SKILL.md) for one blocking owner choice or source conflict. Do not repeat discussion that already settled the artifact's purpose.

An agreement to draft a proposal permits proposed design, clearly labelled. It does not make that design accepted behavior. An agreement to implement accepted work may include documenting its supported contract; do not manufacture another user approval merely because a document was produced.

## Establish The Current Source Basis

Use the sources that actually determine the artifact:

- current user direction and accepted discussion, including later amendments;
- existing Specs, issues, decisions, and contracts being revised or consumed;
- relevant live code, tests, policy, ADRs, and established behavior;
- current primary sources when an external version or interface constrains the result;
- [Track Work](../track-work/SKILL.md) for task memory when a record exists.

A record or implementation summary cannot override contradictory current intent or accepted source truth. Distinguish what was requested, what was proposed, what was accepted, and what an observation actually established.

Preserve enough source identity to recover the basis of a consequential statement. For an approval such as "proceed," retain the proposal and response together when their scope matters. Authorization to investigate or draft an option is not acceptance of undisclosed production consequences.

Do not infer requirements from nearby code, existing tests, or available machinery merely because those sources exist. A test can faithfully protect an unnecessary mechanism.

## Write Only What The Intended Use Needs

Read [Spec Shapes](references/spec-shapes.md) before choosing the structure. Read [Artifact Standards](references/artifact-standards.md) when choosing destination, identity, status, source trail, or revision shape. Read [Decision Records](references/decision-records.md) when the artifact primarily preserves a decision and rationale.

Include relevant purpose, scope, non-goals, accepted behavior, constraints, interfaces, consequential failure semantics, acceptance, and evidence. Explain architecture and ownership deeply where the intended use requires it; do not remove necessary detail just to shorten the document.

When writing an implementation-guiding design whose unresolved representation, identity, ownership, algorithm, or failure choices could invalidate significant dependent work, read [Design for Depth](../design-for-depth/SKILL.md) and use its Implementation Decisions method. Preserve the selected choices and rationale, distinguishing fixed constraints from illustrative sketches and local freedom. Existing supported decisions need no fresh design exercise; open choices must remain visible rather than being filled with invented mechanics.

Keep distinguishable:

- required behavior and accepted decisions;
- supported facts and their evidence limits;
- proposed implementation mechanisms;
- tentative assumptions and open questions;
- intentional deferrals and superseded direction.

Use the repository's vocabulary rather than inventing a new status schema. Place a consequential uncertainty where the reader makes the affected decision, not in a distant caveat after confident requirements.

Keep ordered execution in a Plan and live progress in the Working Record. Link shared rationale rather than copying it into several independently maintained sources.

## Do Not Promote An Approach Into A Requirement

Before adding an obligation, identify its accepted source or why it is necessary for the stated outcome. A limitation of one implementation technique does not establish a need for stronger guarantees, host changes, new persistence, retries, or a subsystem.

When a consequential choice remains, present its concrete effect and supported alternatives through its owner. Do not settle it through normative prose, an unexplained assumption, or a polished placeholder.

Stop the affected writing when it would silently change behavior, scope, public interfaces, compatibility, sensitive policy, failure semantics, or hard-to-reverse design. Do not rewrite source truth to suit implementation, or reduce agreed scope into an unapproved MVP, roadmap, or later-version split.

Open questions need not stop unrelated content. A proposal can be fit for discussion while remaining unfit to authorize or guide production implementation; state that boundary clearly.

## Reconcile Material Changes

Preserve accepted content that still holds. Change only what new intent or evidence affects, and keep consequential prior rationale recoverable through the owning decision record, change history, or version control.

When an accepted amendment or learning result changes the contract, identify the affected downstream Plan, acceptance check, or implementation assumption. Reconcile those dependencies when authorized; otherwise mark them contingent and return the needed revision before dependent use. Do not synchronize unrelated artifacts.

Experimental learning does not automatically enter the production contract. Distinguish findings deliberately selected for implementation from observations retained as evidence or deferred possibilities. Conversely, do not keep using an older baseline after the user accepted a relevant change.

Do not rewrite historical decisions as though they always contained the new choice. Follow repository policy for historical records and supersession.

## Self-Review Once Before Use

After checking source-backed factual claims, use [Review Artifact](../review-artifact/SKILL.md) for silent author self-review of the complete resulting artifact and its intended use.

Check that it preserves accepted intent and amendments, separates requirements from proposals, has sufficient evidence and acceptance conditions, and keeps affected dependencies coherent. Correct clear covered defects, then recheck affected facts and review lenses. Return unresolved owner decisions instead of making the document internally consistent by inventing an answer.

This is the author's ordinary self-review, not another mandatory review cycle. Do not dispatch an independent reviewer merely because a Spec was written or materially revised.

Independent review applies only when selected and authorized to protect a concrete boundary. Supply the complete artifact, source basis, dependencies, and evidence limits through Review Artifact's independent route. Its report ends the review; findings require adjudication before revision or use.

Review establishes fitness, not user acceptance or execution authority. Respect an explicitly selected approval checkpoint, but do not create one for every artifact by default.

## Report And Stop

Report the artifact path, type, intended use, source basis, material unresolved or contingent content, and actual review/acceptance status. Do not label author self-review as independent review or use an approval status without its source.

Stop when the authorized artifact is fit for its stated use or its blocking decision/evidence limit is explicit. Return to the requesting activity; writing a Spec does not begin implementation or authorize another outcome.
