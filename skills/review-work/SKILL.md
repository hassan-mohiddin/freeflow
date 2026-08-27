---
name: review-work
description: Use when judging implementation or integrated work through self-review or independent review, or when adjudicating a returned independent review report.
---

# Review Work

Judge whether implementation or integrated work is correct, suitable, and sufficiently evidenced for a named boundary.

Review provides judgment. [Verify Work](../../skills/verify-work/SKILL.md) establishes what direct evidence proves. Review may find that evidence insufficient, but it does not replace verification or authorize changes.

## Select One Route

Choose the route before reviewing:

- **Self-review:** you produced the reviewed state.
- **Independent review:** you did not produce the reviewed state and are reviewing from a separate context.
- **Adjudication:** an independent reviewer returned a report and you are deciding what its findings establish and what follows.

Self-review and independent review use the same review kernel below. Adjudication consumes a completed review; it is not another review.

Do not cross roles inside an independent reviewer context. The independent reviewer reports and stops. The receiving agent may then enter adjudication.

## Establish The Boundary

Identify only what the judgment needs:

- the future action or boundary the review protects;
- the exact implementation, diff, commit, or integrated state;
- accepted outcome, requirements, and non-goals;
- relevant Specs, Plans, tests, policies, ADRs, and established behavior;
- verification evidence and known gaps;
- risks and interactions capable of changing whether the boundary may be crossed.

Inspect the reviewed state and source truth directly. Do not judge only the producer's summary, reasoning, or claimed result.

Before reviewing changes to trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, security-relevant dependencies, code execution, or security-sensitive failure behavior, read the [Security Risk Lens](references/security-risk-lens.md).

When inspection could branch broadly among several useful observers, use [Action Selection](../../skills/action-selection/SKILL.md). Skip it for an obvious diff, file, test, or source-truth read.

## Apply The Shared Review Kernel

Use only lenses capable of changing the boundary judgment:

- **Alignment and correctness:** accepted behavior is implemented without invention or omission.
- **Regression and integration:** affected callers, states, and components remain correct together.
- **Failure and risk:** material errors, recovery, permissions, data, and compatibility behave safely.
- **Evidence:** verification supports the claims at the required observing boundary.
- **Design and minimality:** complexity and coordination are justified by requirements or observed failures.
- **Maintainability:** behavior remains understandable and changeable without hidden policy or fragile coupling.

Review the resulting state, not the producer's intention. Use a high evidence bar, not a high item count. Finding no material issue is valid.

### Classify Before Calling Something An Issue

Ask in order:

1. **Is the required behavior or source truth settled?**
   - No: **Question**.
2. **Are reachability and material consequence supported?**
   - No: **Needs evidence**.
3. **Does the reviewed boundary require correction?**
   - Yes, and the boundary cannot be crossed safely: **Blocking Issue**.
   - Yes, but correction can be deferred safely: **Non-blocking Issue**.
4. **Would the change merely be useful beyond this boundary?**
   - Omit it by default.
   - Use **Improvement** only when materially relevant or explicitly requested.

A material **Needs evidence** observation must name the claim, required observing boundary, available evidence and its limit, why the gap affects judgment, and the smallest evidence that could disagree.

Do not turn preferences, imagined edge cases, intentional deferrals, or hypothetical completeness into Issues.

An Issue must identify:

- the exact location or affected path;
- the violated requirement, source truth, or invariant;
- supporting evidence;
- the concrete consequence for the reviewed boundary.

For a Blocking Issue, state why the boundary cannot safely be crossed. Describe correction constraints or the owning activity to re-enter. Recommend a specific correction only when it is directly supported rather than one of several material alternatives.

## Self-Review

Apply the complete shared kernel to your own work. Self-review uses the same technical scrutiny as independent review but does not create independence.

When evidence supports a clear local defect and existing authority covers its correction:

1. return to the producing activity;
2. correct the defect;
3. re-verify the affected boundary;
4. repeat only the affected review lenses once.

Do not create formal review items, a judgment, a review number, or a review cycle for self-review. Do not label it independent.

Return unresolved material issues to [Workflow](../../skills/workflow/SKILL.md). Use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) when the cause is unclear or correction repeats. Use [Decision Gate](../../skills/decision-gate/SKILL.md) when accepted behavior or a user-owned choice is unsettled.

## Independent Review

Before preparing or performing a separately selected independent review, read the [Independent Work Reviewer Contract](references/independent-work-reviewer-contract.md).

Use supplied and already available evidence. Do not start a missing active check unless the review authority explicitly covers that exact check. Otherwise report **Needs evidence** with the claim and required observing boundary. When an exact check is covered, apply Verify Work's check-result and claim-result semantics; the review still owns the fitness judgment.

Inspect and report without editing. Do not:

- adjudicate your own findings;
- select among materially different remedies;
- perform corrections;
- dispatch another review;
- continue merely to obtain Pass.

The independent review ends with its report.

Independent judgments are:

1. **Blocking:** at least one Blocking Issue exists.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment or authorize implementation.

## Adjudicate A Returned Review

Before adjudicating an independent report, read [Adjudicate Work Review](references/adjudicate-work-review.md).

Assess every material item against the reviewed state, source truth, and available evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, out of scope, or based on a source misread.
- **Open:** missing evidence or a decision prevents acceptance or rejection.

Do not separately accept the reviewer's overall judgment. Derive the adjudicated judgment from the dispositions.

Findings are evidence, not commands or correction authority.

- **Pass:** proceed.
- **Non-blocking:** proceed with explicit deferrals.
- **Inconclusive:** obtain the missing evidence or decision.
- **Blocking:** do not cross the boundary; select the narrowest owning route.

When remediation is ready, state the supported problem, correction, rationale, verification boundary, authority state, and whether focused follow-up review remains justified. Actual correction returns to [Execute Work](../../skills/execute-work/SKILL.md).

## Limit Independent Review

Treat review count as a budget, not a schedule.

- **Review 1:** the first selected independent review; broad by default.
- **Review 2:** a separately selected focused follow-up when accepted corrections, new evidence, affected interactions, or remaining risk still require independent judgment.
- **Review 3:** exceptional, separately authorized, and final. Use it only after the cause and correction boundary are understood.

A review report always ends its review. Remediation does not automatically authorize or require follow-up review.

If Review 2 remains Blocking:

- diagnose when the blocker repeats, extends, invalidates, or exposes another consequence of prior correction, or when its cause remains uncertain;
- return an independent clear local defect to its owner when diagnosis would add no useful understanding;
- do not automatically correct and dispatch Review 3.

Do not request Review 4. A different reviewer, local correction, or renamed scope does not reset the budget. Workflow may establish a new cycle only for a materially new reviewed state and boundary.

Self-review does not consume this budget.

## Stop

Stop when the selected route has produced its bounded result:

- self-review: the supported state is accepted or a material issue is routed;
- independent review: the report is complete;
- adjudication: material items are disposed and the next route is explicit.

Do not review until Pass, use review to authorize correction, or turn optional improvement into unfinished work.
