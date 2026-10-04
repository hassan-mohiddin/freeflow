---
name: review-artifact
description: "Use when judging whether a durable artifact is aligned, sufficient, and fit to guide its intended use through self-review, independent review, or adjudication of a returned artifact review."
---

# Review Artifact

Judge whether the complete artifact faithfully represents accepted intent and is sufficient for its named use. Internal consistency alone is not enough if it consistently describes the wrong outcome or an obsolete baseline.

[Verify Work](../../skills/verify-work/SKILL.md) establishes factual support where claims need verification. Review judges fitness without creating evidence, settling owner decisions, or authorizing revisions.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Writing or revising a Spec or Plan does not require independent review. Select it only when requested, or justified and authorized, to protect a concrete boundary; loading this skill or switching compute profiles creates no independence.
- An independent reviewer reports and stops: no edits, owner decisions, selection among materially different revisions, adjudication, or further dispatch, and no continuing until Pass. It runs a missing active check only when review authority covers that exact check; otherwise it reports Needs evidence.
- Findings do not authorize revisions. Derive the judgment from your dispositions rather than adopting the reviewer's conclusion.
- Never settle a user decision or revise upstream intent, accepted content, or owner decisions merely to make an artifact consistent or to obtain Pass. Never review until Pass.
- Never request Review 4. A different reviewer, renamed use, or local revision does not reset the review budget.
- Never present artifact fitness as acceptance, implementation, or execution authority.

## Choose The Role And Intended Use

Goal: review the whole artifact, for the use it must actually serve.

- **Self-review:** the author checks its own artifact before accepting or using it. This is the normal required route.
- **Independent review:** a separately selected reviewer judges a state it did not produce, from a separate context.
- **Adjudication:** the receiving agent evaluates a completed independent report.

Identify the artifact's exact state, type, intended use, accepted outcome and amendments, non-goals, governing format, source basis, unresolved questions, dependencies, and evidence gaps. Inspect the complete artifact and relevant sources directly, not only its author's narrative.

## Establish Which Sources Govern

Goal: judge against current accepted intent, not the artifact's own baseline.

Check current intent and accepted upstream requirements before dependent artifacts. Follow material amendments, supersession, and deliberately selected experimental findings. Do not infer acceptance from a proposal, a review label, a passing test, or an unexplained "user approved" summary.

Distinguish accepted behavior from the suggested implementation mechanism, and check both directions: has the artifact introduced stronger obligations than the accepted outcome needs, and has it omitted accepted changes or kept a superseded baseline? An experiment can establish a fact without selecting it for production; an implementation Plan cannot ignore later accepted learning because its older version was reviewed.

If upstream content is unresolved or contradictory, mark dependent material contingent rather than generating exhaustive downstream findings against an unsettled premise.

Read [Track Work](../../skills/track-work/SKILL.md) before reviewing a Working Record. Use [Action Selection](../../skills/action-selection/SKILL.md) when source inspection could branch broadly; skip it for an obvious artifact or dependency read.

## Judge The Artifact By Its Job

Goal: ask of each artifact only what its job requires.

- **Working Record:** accurate current task memory, recoverable decisions and work, evidence limits, provisional remaining route, defining artifacts and Recovery sources sufficient for a fresh context to resume, and one next useful action.
- **Spec or content contract:** the accepted behavior, boundaries, evidence, and uncertainty needed for its intended use.
- **Plan:** a supported ordered strategy, dependencies, assumptions, checks, and invalidation conditions.
- **Decision record or ADR:** the choice, owner, source, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** enough truthful point-in-time context for safe continuation without replacing the live record.
- **Other artifact:** its declared purpose without taking over another artifact's job.

A proposal can be fit for discussion without being implementation-ready. Do not block on an open question the artifact intentionally preserves and whose answer its current use does not need.

## Apply The Shared Kernel

Goal: use only the lenses that can change fitness.

- **Source alignment:** accepted requirements, amendments, decisions, and live facts agree with the artifact.
- **Sufficiency:** it contains enough for its use without implying every future question is settled.
- **Decision clarity:** required, tentative, open, deferred, and superseded material cannot be confused.
- **Evidence and acceptance:** load-bearing claims and completion conditions have suitable observing or falsifying mechanisms.
- **Behavior and failure:** consequential states, forbidden outcomes, observers, and recovery are defined where required.
- **Dependency integrity:** relevant upstream and downstream sources agree, or their contingency is explicit.
- **Scope and minimality:** requirements and process are justified rather than speculative or mechanically exhaustive.
- **Clarity and continuity:** a future reader can use the artifact without reconstructing the author's private reasoning or the full transcript.

Do not demand implementation detail from a PRD, progress history from a Plan, or universal guarantees from a bounded prototype report. Finding no material issue is valid.

## Classify Material Findings

Goal: every reported item is supported and names the right kind of problem.

Ask in order:

1. Does intended-use fitness depend on unsettled content or an owner choice? Report a **Question**.
2. Does it depend on a claim that available evidence cannot establish? Report **Needs evidence**.
3. Is there a supported defect requiring revision for this use? Report a **Blocking Issue** if the boundary cannot safely be crossed, or a **Non-blocking Issue** if revision can safely be deferred.
4. Would it only improve a different or broader use? Omit it by default, or identify an **Improvement** when materially relevant or requested.

An Issue identifies the exact location or dependency, violated source or artifact responsibility, evidence, and concrete consequence; explain why a Blocking Issue prevents the intended use. Recommend a specific revision only when source intent and dependency consequences support it.

Needs evidence identifies the load-bearing claim, required observer, existing evidence and limits, why the gap matters, and the smallest observation that could disagree. Establish that the claim is required before recommending more proof; optional stronger claims may be qualified rather than expanding the task. Distinguish missing evidence from a demonstrated defect, and check which source or check state a reported pass examined and whether later changes reduced acceptance or invalidated it; a newer report cannot repair that mismatch.

Do not classify wording preference, exhaustive edge cases, intentional deferrals, or polished presentation as defects.

## Self-Review Once

Goal: make the artifact fit for its use without turning review into open-ended rewriting.

Apply the kernel silently to the artifact you produced once its load-bearing facts have adequate support; do not create formal review items, a numbered review, or an independent judgment for this route.

For a clear covered defect whose revision basis is settled: return to the authoring activity and revise it, reconcile affected dependencies within authority, re-verify affected factual claims, and repeat source alignment and the affected lenses once.

Use [Discuss](../../skills/discuss/SKILL.md) for changed direction or strategy, [Decision Gate](../../skills/decision-gate/SKILL.md) for a blocking owner choice or source conflict, and [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) for unsupported or repeated causal claims. Return material coordination changes through [Workflow](../../skills/workflow/SKILL.md).

Stop when the artifact is fit for its agreed use or a material unresolved issue is routed. Self-review is not a reason to add independent review.

## Perform A Selected Independent Review

Goal: a separate context judges the artifact from the evidence and reports once.

Before preparing or performing it, read [Independent Artifact Reviewer Contract](references/independent-artifact-reviewer-contract.md). Use available evidence and apply Verify Work to covered checks while keeping ownership of the fitness judgment. The review ends with its report:

- **Blocking:** at least one Blocking Issue.
- **Inconclusive:** no Blocking Issue, but a material Question or Needs evidence prevents judgment.
- **Non-blocking:** only Non-blocking Issues remain.
- **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment or authorize revision.

## Adjudicate Without Inheriting The Verdict

Goal: decide what the report actually establishes before acting on it.

Read [Adjudicate Artifact Review](references/adjudicate-artifact-review.md) before adjudicating. Assess each material item against the actual artifact, source truth, dependencies, and evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, outside the artifact's job, or a source misread.
- **Open:** evidence or an owner decision is missing.

Pass permits the intended use. Non-blocking permits it with explicit deferrals. Inconclusive requires the missing evidence or decision. Blocking prevents the disputed use and returns the narrowest supported revision or reconsideration to its owner through Workflow.

When revision is ready, state the supported problem, revision basis, rationale, dependency impact, observing boundary, authority, and whether focused independent follow-up remains justified.

## Preserve The Independent Review Budget

Goal: independent judgment is spent where it changes the outcome.

For one reviewed state and intended-use boundary:

- **Review 1:** first selected independent review, broad by default.
- **Review 2:** separately selected focused follow-up when accepted revisions, affected dependencies, new evidence, or remaining risk warrant it.
- **Review 3:** exceptional, separately authorized, and final, after the revision basis and dependency boundary are understood.

A revision does not authorize another review. If Review 2 remains Blocking, diagnose repeated or unclear causes; return an independent clear local defect to its owner when diagnosis adds no value, rather than revise and dispatch Review 3 automatically. Workflow may start a new cycle only for a materially new artifact state and intended-use boundary. Self-review does not consume the budget.

## Stop

Self-review ends with supported fitness or a routed issue. Independent review ends with its report. Adjudication ends with material dispositions and an explicit next route. Do not turn optional improvement into unfinished work.
