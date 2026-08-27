---
name: review-artifact
description: Use when judging whether a durable artifact is aligned, sufficient, and fit to guide its intended use through self-review, independent review, or adjudication of a returned artifact review.
---

# Review Artifact

Judge whether a durable artifact is aligned, sufficient, and fit to guide a named intended use.

Review provides judgment. [Verify Work](../../skills/verify-work/SKILL.md) establishes what direct evidence proves when factual claims require active verification. Review may find evidence insufficient, but it does not replace verification, settle owner decisions, or authorize revision.

## Select One Route

Choose the route before reviewing:

- **Self-review:** you produced the reviewed artifact state.
- **Independent review:** you did not produce the reviewed state and are reviewing from a separate context.
- **Adjudication:** an independent reviewer returned a report and you are deciding what its findings establish and what follows.

Self-review and independent review use the same artifact review kernel below. Adjudication consumes a completed review; it is not another review.

Do not cross roles inside an independent reviewer context. The independent reviewer reports and stops. The receiving agent may then enter adjudication.

## Establish The Boundary

Identify only what the judgment needs:

- artifact path, type, exact reviewed state, and intended use;
- accepted outcome, requirements, non-goals, and owner decisions;
- unresolved questions and known evidence gaps;
- the artifact's job and any governing schema or format contract;
- relevant code, tests, policies, ADRs, and established behavior;
- upstream and downstream artifacts in dependency order;
- risks capable of changing whether the artifact may guide its intended use.

Review the complete current artifact and source truth directly. Do not judge only its summary, change description, or producer reasoning.

Review upstream authority before dependent artifacts. When an upstream problem invalidates downstream assumptions, mark affected material contingent instead of generating exhaustive downstream findings against an unsettled basis.

When reviewing a Working Record, first read [Track Work](../../skills/track-work/SKILL.md), which owns its format and lifecycle.

When inspection could branch broadly among several useful sources or dependencies, use [Action Selection](../../skills/action-selection/SKILL.md). Skip it for an obvious artifact, schema, dependency, or source-truth read.

## Apply The Shared Artifact Review Kernel

Use only lenses capable of changing fitness for the intended use:

- **Source alignment:** agrees with accepted requirements, owner decisions, and live facts.
- **Fitness and sufficiency:** contains enough for its intended use without pretending every future question is settled.
- **Decision clarity:** required, tentative, open, deferred, and superseded information cannot be confused.
- **Evidence and acceptance:** load-bearing claims and acceptance conditions have suitable supporting or falsifying mechanisms.
- **Behavior and failure contract:** consequential states, forbidden outcomes, observers, and recovery are explicit where required.
- **Dependency integrity:** upstream and downstream artifacts remain consistent; provisional or contingent work is identified honestly.
- **Scope and minimality:** avoids speculative design, unnecessary process, and hypothetical completeness.
- **Clarity and continuity:** a future reader can use it without transcript memory or volatile copied context.

Review the artifact's resulting state, not the producer's intention. Use a high evidence bar, not a high item count. Finding no material issue is valid.

### Judge The Artifact By Its Job

- **Working Record:** accurate living task memory with recoverable slices and decisions, compact evidence pointers, and one next useful action.
- **Spec or durable content artifact:** accepted content, behavior, boundaries, evidence, and uncertainty needed for its stated use.
- **Plan:** an inspectable ordered strategy with scope, dependencies, assumptions, checks, and stop conditions.
- **Decision record or ADR:** the decision, owner, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** a point-in-time continuation package that preserves what its recipient needs without replacing live task memory.
- **Other artifact:** its stated purpose without taking over another artifact's job.

Do not require one artifact to perform another artifact's job.

### Classify Before Calling Something An Issue

Ask in order:

1. **Does fitness for the intended use depend on content, source truth, or an owner decision that remains unsettled?**
   - Yes: **Question**.
2. **Does fitness depend on a load-bearing claim or condition that available evidence cannot establish?**
   - Yes: **Needs evidence**.
3. **Is there a supported artifact defect that requires revision for the intended use?**
   - Yes, and the artifact cannot safely guide that use: **Blocking Issue**.
   - Yes, but revision can be deferred safely: **Non-blocking Issue**.
4. **Would the change merely make the artifact more useful beyond its intended use?**
   - Omit it by default.
   - Use **Improvement** only when materially relevant or explicitly requested.

A material **Needs evidence** observation must name the load-bearing claim or condition, required observing boundary, available evidence and its limit, why the gap affects intended-use fitness, and the smallest evidence that could disagree.

Do not turn wording preferences, exhaustive edge cases, intentional deferrals, polished presentation, or hypothetical completeness into Issues.

An Issue must identify:

- the exact location or affected dependency;
- the violated source truth or artifact responsibility;
- supporting evidence;
- the concrete consequence for the intended use.

For a Blocking Issue, state why the artifact cannot safely guide its intended use. Describe revision constraints or the owning activity to re-enter. Recommend a specific revision only when source intent and dependency effects support it rather than one of several material alternatives.

## Self-Review

Apply the complete shared kernel to an artifact you produced. Self-review uses the same substantive scrutiny as independent review but does not create independence.

When evidence supports a clear local artifact defect, the revision basis is settled, and existing authority covers the revision:

1. return to the artifact's owning activity;
2. revise the defect without changing accepted intent;
3. reconcile affected dependencies;
4. re-verify affected load-bearing factual claims at their required observing boundaries;
5. re-check source alignment and the affected review lenses once.

Do not create formal review items, a judgment, a review number, or a review cycle for self-review. Do not label it independent.

Do not settle an owner decision, revise upstream authority, or change accepted content merely to make the artifact internally consistent. Return unresolved material issues to [Workflow](../../skills/workflow/SKILL.md). Use [Discuss](../../skills/discuss/SKILL.md) when accepted content or strategy needs reconsideration, [Decision Gate](../../skills/decision-gate/SKILL.md) for a user-owned choice or source conflict, and [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) when an artifact relies on an unsupported or repeated failure cause.

## Independent Review

Before preparing or performing a separately selected independent review, read the [Independent Artifact Reviewer Contract](references/independent-artifact-reviewer-contract.md).

Use supplied and already available evidence. Do not start a missing active check unless the review authority explicitly covers that exact check. Otherwise report **Needs evidence** with the load-bearing claim and required observing boundary. When an exact check is covered, apply Verify Work's check-result and claim-result semantics; the review still owns the intended-use fitness judgment.

Inspect and report without editing. Do not:

- adjudicate your own findings;
- settle owner decisions;
- select among materially different revisions;
- revise the artifact or dependencies;
- dispatch another review;
- continue merely to obtain Pass.

The independent review ends with its report.

Independent judgments are:

1. **Blocking:** at least one Blocking Issue exists.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment or authorize revision.

## Adjudicate A Returned Review

Before adjudicating an independent report, read [Adjudicate Artifact Review](references/adjudicate-artifact-review.md).

Assess every material item against the artifact, source truth, dependencies, and available evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, outside the artifact's job, or based on a source misread.
- **Open:** missing evidence or an owner decision prevents acceptance or rejection.

Do not separately accept the reviewer's overall judgment. Derive the adjudicated judgment from the dispositions.

Findings are evidence, not commands or revision authority.

- **Pass:** use the artifact for its intended purpose.
- **Non-blocking:** use it with explicit deferrals.
- **Inconclusive:** obtain the missing evidence or decision.
- **Blocking:** do not use the artifact across the blocked boundary; select the narrowest owning route.

When revision is ready, state the supported artifact problem, proposed revision, rationale, dependency impact, verification boundary, authority state, and whether focused follow-up review remains justified. Actual revision returns through [Workflow](../../skills/workflow/SKILL.md) to the artifact's owning skill.

## Limit Independent Review

Treat review count as a budget, not a schedule.

- **Review 1:** the first selected independent review; broad by default.
- **Review 2:** a separately selected focused follow-up when accepted revisions, new evidence, affected dependencies, or remaining risk still require independent judgment.
- **Review 3:** exceptional, separately authorized, and final. Use it only after the revision basis and dependency boundary are understood.

A review report always ends its review. Revision does not automatically authorize or require follow-up review.

If Review 2 remains Blocking:

- diagnose when the blocker repeats, extends, invalidates, or exposes another consequence of prior revision, or when its basis remains uncertain;
- return an independent clear local artifact defect to its owner when diagnosis would add no useful understanding;
- do not automatically revise and dispatch Review 3.

Do not request Review 4. A different reviewer, local revision, or renamed intended use does not reset the budget. Workflow may establish a new cycle only for a materially new artifact state and intended-use boundary.

Self-review does not consume this budget.

## Stop

Stop when the selected route has produced its bounded result:

- self-review: the supported artifact state is accepted or a material issue is routed;
- independent review: the report is complete;
- adjudication: material items are disposed and the next route is explicit.

Do not review until Pass, use review to authorize revision, or turn optional improvement into unfinished work.
