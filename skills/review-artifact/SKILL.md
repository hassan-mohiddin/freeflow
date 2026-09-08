---
name: review-artifact
description: "Use when judging whether a durable artifact is aligned, sufficient, and fit to guide its intended use through self-review, independent review, or adjudication of a returned artifact review."
---

# Review Artifact

Judge whether the complete artifact faithfully represents accepted intent and is sufficient for its named use. Internal consistency alone is not enough if it consistently describes the wrong outcome or an obsolete baseline.

[Verify Work](../../skills/verify-work/SKILL.md) establishes factual support where claims need verification. Review judges fitness without creating evidence, settling owner decisions, or authorizing revisions.

## Choose The Role And Intended Use

- **Self-review:** the author checks its own artifact before accepting or using it. This is the normal required route.
- **Independent review:** a separately selected reviewer judges a state it did not produce, from a separate context.
- **Adjudication:** the receiving agent evaluates a completed independent report.

Writing or revising a Spec or Plan does not automatically require independent review. Select that route only when requested or justified and authorized to protect a concrete boundary. Loading this skill or switching compute profiles creates no independence.

An independent reviewer reports and stops; it cannot adjudicate its own findings or become the revising agent within that role.

Identify the artifact's exact state, type, intended use, accepted outcome and amendments, non-goals, governing format, source basis, unresolved questions, dependencies, and evidence gaps. Inspect the complete artifact and relevant sources directly—not only its author's narrative.

## Establish Which Sources Govern

Check current intent and accepted upstream requirements before dependent artifacts. Follow material amendments, supersession, and deliberately selected experimental findings. Do not infer acceptance from a proposal, a review label, a passing test, or an unexplained "user approved" summary.

Distinguish accepted behavior from the suggested implementation mechanism. Check both directions:

- Has the artifact introduced stronger obligations than the accepted outcome needs?
- Has it omitted accepted changes or retained a superseded implementation baseline?

An experiment can establish a fact without selecting it for production. Conversely, an implementation Plan cannot ignore later accepted learning merely because its older version was reviewed.

If upstream content is unresolved or contradictory, mark dependent material contingent. Do not generate exhaustive downstream findings against an unsettled premise or rewrite the upstream requirement to match the artifact.

Read [Track Work](../../skills/track-work/SKILL.md) before reviewing a Working Record. Use [Action Selection](../../skills/action-selection/SKILL.md) when source inspection could branch broadly; skip it for an obvious artifact or dependency read.

## Judge The Artifact By Its Job

- **Working Record:** accurate current task memory, recoverable decisions and work, evidence limits, provisional remaining route, and one next useful action.
- **Spec or content contract:** the accepted behavior, boundaries, evidence, and uncertainty needed for its intended use.
- **Plan:** a supported ordered strategy, dependencies, assumptions, checks, and invalidation conditions.
- **Decision record or ADR:** the choice, owner, source, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** enough truthful point-in-time context for safe continuation without replacing the live record.
- **Other artifact:** its declared purpose without taking over another artifact's job.

A proposal can be fit for discussion without being implementation-ready. Do not block on an open question that the artifact intentionally preserves and whose answer is unnecessary for its current use.

## Apply The Shared Kernel

Use only lenses capable of changing fitness:

- **Source alignment:** accepted requirements, amendments, decisions, and live facts agree with the artifact.
- **Sufficiency:** it contains enough for its use without implying every future question is settled.
- **Decision clarity:** required, tentative, open, deferred, and superseded material cannot be confused.
- **Evidence and acceptance:** load-bearing claims and completion conditions have suitable observing or falsifying mechanisms.
- **Behavior and failure:** consequential states, forbidden outcomes, observers, and recovery are defined where required.
- **Dependency integrity:** relevant upstream and downstream sources agree, or their contingency is explicit.
- **Scope and minimality:** requirements and process are justified rather than speculative or mechanically exhaustive.
- **Clarity and continuity:** a future reader can use the artifact without reconstructing the author's private reasoning or full transcript.

Do not demand implementation detail from a PRD, progress history from a Plan, or universal guarantees from a bounded prototype report. Finding no material issue is valid.

## Classify Material Findings

Ask in order:

1. Does intended-use fitness depend on unsettled content or an owner choice? Report a **Question**.
2. Does it depend on a claim that available evidence cannot establish? Report **Needs evidence**.
3. Is there a supported defect requiring revision for this use? Report a **Blocking Issue** if the boundary cannot safely be crossed, or a **Non-blocking Issue** if revision can safely be deferred.
4. Would it only improve a different or broader use? Omit it by default, or identify an **Improvement** when materially relevant or requested.

An Issue identifies the exact location or dependency, violated source or artifact responsibility, evidence, and concrete consequence. Explain why a Blocking Issue prevents the intended use. Recommend a specific revision only when source intent and dependency consequences support it.

Needs evidence identifies the load-bearing claim, required observer, existing evidence and limits, why the gap matters, and the smallest observation that could disagree. Establish that the claim is required before recommending more proof; optional stronger claims may be qualified rather than expanding the task. Distinguish missing evidence from a demonstrated artifact defect. Check which source/check state a reported pass examined and whether later changes reduced acceptance or invalidated its applicability; a newer report cannot repair that mismatch.

Do not classify wording preference, exhaustive edge cases, intentional deferrals, or polished presentation as defects.

## Self-Review Once

Apply the kernel silently to the artifact you produced after its load-bearing facts have adequate support. Do not create formal review items, a numbered review, or an independent judgment for this route.

For a clear covered defect whose revision basis is settled:

1. return to the authoring activity and revise it;
2. reconcile affected dependencies within authority;
3. re-verify affected factual claims;
4. repeat source alignment and affected review lenses once.

Do not settle a user decision or revise upstream intent merely to make the artifact consistent. Use [Discuss](../../skills/discuss/SKILL.md) for changed direction or strategy, [Decision Gate](../../skills/decision-gate/SKILL.md) for a blocking owner choice or source conflict, and [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) for unsupported or repeated causal claims. Return material coordination changes through [Workflow](../../skills/workflow/SKILL.md).

Stop when the artifact is fit for its agreed use or a material unresolved issue is routed. Self-review is not a reason to add independent review automatically.

## Perform A Selected Independent Review

Before preparing or performing it, read [Independent Artifact Reviewer Contract](references/independent-artifact-reviewer-contract.md).

Use available evidence. Run a missing active check only when review authority covers that exact check; otherwise report Needs evidence. Apply Verify Work to covered checks while retaining ownership of the fitness judgment.

Inspect and report without edits, owner decisions, selection among materially different revisions, adjudication, or another review dispatch. The independent review ends with its report:

- **Blocking:** at least one Blocking Issue.
- **Inconclusive:** no Blocking Issue, but a material Question or Needs evidence prevents judgment.
- **Non-blocking:** only Non-blocking Issues remain.
- **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment or authorize revision. Do not continue merely to obtain Pass.

## Adjudicate Without Inheriting The Verdict

Read [Adjudicate Artifact Review](references/adjudicate-artifact-review.md) before adjudicating.

Assess each material item against the actual artifact, source truth, dependencies, and evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, outside the artifact's job, or a source misread.
- **Open:** evidence or an owner decision is missing.

Derive the overall judgment from those dispositions rather than separately accepting the reviewer's conclusion. Findings do not authorize revisions.

Pass permits the intended use. Non-blocking permits it with explicit deferrals. Inconclusive requires the missing evidence or decision. Blocking prevents the disputed use and returns the narrowest supported revision or reconsideration to its owner through Workflow.

When revision is ready, state the supported problem, revision basis, rationale, dependency impact, observing boundary, authority, and whether focused independent follow-up remains justified.

## Preserve The Independent Review Budget

For one reviewed state and intended-use boundary:

- **Review 1:** first selected independent review, broad by default.
- **Review 2:** separately selected focused follow-up when accepted revisions, affected dependencies, new evidence, or remaining risk warrant it.
- **Review 3:** exceptional, separately authorized, and final, after the revision basis and dependency boundary are understood.

A revision does not automatically authorize another review. If Review 2 remains Blocking, diagnose repeated or unclear causes; return an independent clear local artifact defect to its owner when diagnosis adds no value. Do not automatically revise and dispatch Review 3.

Do not request Review 4. A different reviewer, renamed use, or local revision does not reset the budget. Workflow may establish a new cycle only for a materially new artifact state and intended-use boundary. Self-review does not consume the budget.

## Stop

Self-review ends with supported fitness or a routed issue. Independent review ends with its report. Adjudication ends with material dispositions and an explicit next route.

Do not review until Pass, turn optional improvement into unfinished work, or present artifact fitness as acceptance, implementation, or execution authority.
