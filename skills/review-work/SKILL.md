---
name: review-work
description: "Use when judging implementation or integrated work through self-review or independent review, or when adjudicating a returned independent review report."
---

# Review Work

Judge whether the actual work satisfies the accepted outcome, remains proportionate, and has enough evidence for a named boundary.

[Verify Work](../../skills/verify-work/SKILL.md) establishes what observations prove. Review judges their sufficiency and the resulting work; it does not replace verification, choose user-owned behavior, or authorize corrections.

## Choose The Review Role

- **Self-review:** the producer checks its own supported result before accepting or reusing it. This is the normal required route.
- **Independent review:** a separately selected reviewer judges a state it did not produce, from a separate context.
- **Adjudication:** the receiving agent checks a returned independent report and decides what its findings establish.

An independent reviewer reports and stops. It does not adjudicate its own findings or become the fixing agent. Switching models or loading this skill does not create independence.

Independent review is not automatic after implementation or self-review. Select it through Workflow only when requested or justified and authorized to protect a concrete risk, dependency, integration, or delivery boundary. A review budget permits no dispatch by itself.

## Establish What The Review Protects

Identify the exact code, diff, commit, or integrated state; its accepted outcome, non-goals, relevant requirements and amendments; the future action being protected; and the verification evidence and gaps.

Inspect the actual state and governing sources—not just the producer's summary or explanation. A detailed execution contract can itself have been mistaken. Check the user outcome before judging compliance with the suggested implementation steps.

Before reviewing changes to trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, security-relevant dependencies, code execution, or security-sensitive failure behavior, read [Security Risk Lens](references/security-risk-lens.md).

Use [Action Selection](../../skills/action-selection/SKILL.md) for uncertain or broad inspection. An obvious diff or source read does not need another selection exercise.

## Apply The Same Technical Kernel

Use lenses that can change the boundary judgment:

- **Alignment:** required behavior and accepted amendments are implemented without omission or invented obligations.
- **Correctness and integration:** reachable paths, affected callers, and components work together without regressions.
- **Failure and risk:** material errors, recovery, permissions, data, and compatibility are handled as required.
- **Evidence:** claims are supported at their required observing boundaries, not merely by green summaries.
- **Design and minimality:** complexity and coordination serve requirements or demonstrated needs rather than optional stronger guarantees.
- **Maintainability:** behavior and failure paths remain understandable and changeable.

Do not assume more implementation is better. Check both missing accepted work and unnecessary additions. A prototype result is not production acceptance, and a test protecting a mechanism does not make that mechanism required.

If the implementation follows an artifact whose baseline conflicts with a later accepted change, expose that source mismatch. Do not choose whichever source makes the work pass or treat every unselected experiment as a production obligation.

## Classify Before Calling Something A Defect

Ask in order:

1. Is the relevant behavior or source truth settled? If not, report a **Question** when it affects the boundary.
2. Are reachability and material consequence supported? If not, report **Needs evidence**, not a hypothetical defect.
3. Does this boundary require correction? If it cannot safely be crossed, report a **Blocking Issue**. If correction is required but safely deferrable, report a **Non-blocking Issue**.
4. Is it merely useful beyond this boundary? Omit it by default, or identify an **Improvement** when materially relevant or explicitly requested.

An Issue needs an exact location or path, violated requirement or invariant, supporting evidence, and concrete consequence. A Blocking Issue must explain why the protected boundary cannot be crossed.

Needs evidence must identify the claim, required observer, existing evidence and limit, why the gap matters, and the smallest observation that could disagree. First establish that the stronger claim is required; missing proof of an optional guarantee does not automatically justify more work. Check whether supplied observations apply to the reviewed candidate and whether material assertion changes preserved the required property. A missing or stale result is not itself a code defect; recover evidence or establish the observer before prescribing a fix.

Do not turn preferences, imagined edge cases, intentional deferrals, or hypothetical completeness into Issues. Finding no material issue is valid.

## Self-Review And Re-enter Narrowly

Apply the kernel silently after evidence initially supports the produced result. Do not create formal review items, a numbered review cycle, or an independent-review judgment for self-review.

For one clear covered defect, return to the producer, correct it, re-verify the affected boundary, and repeat only affected review lenses once. Do not restart every check or add a reviewer because a local correction occurred.

When the outcome remains settled but the approach is invalidated, return for implementation preparation. Use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) for unclear or repeatedly failing causes, and [Decision Gate](../../skills/decision-gate/SKILL.md) for unsettled accepted behavior or a user-owned choice. Return coordination or scope changes to [Workflow](../../skills/workflow/SKILL.md).

Stop self-review when the supported state is accepted or a material issue has a clear next route. Optional polish is not permission to continue editing.

## Perform A Selected Independent Review

Before preparing or performing it, read [Independent Work Reviewer Contract](references/independent-work-reviewer-contract.md).

Use supplied and available evidence. Do not run a missing active check unless review authority covers that exact check; otherwise report Needs evidence. A covered active check uses Verify Work's check-result and claim-result semantics without changing review ownership.

Inspect and report without edits, choosing among materially different remedies, adjudication, another review dispatch, or continuing until Pass. Recommend a specific correction only when supported rather than merely plausible.

The independent judgment is:

- **Blocking:** at least one Blocking Issue.
- **Inconclusive:** no Blocking Issue, but a material Question or Needs evidence prevents judgment.
- **Non-blocking:** only Non-blocking Issues remain.
- **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment or authorize implementation. Every judgment ends the review.

## Adjudicate The Returned Report

Read [Adjudicate Work Review](references/adjudicate-work-review.md) before adjudicating.

Check each material finding against the actual reviewed state, sources, and evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, already resolved, duplicate, preference-only, out of scope, or based on a source misread.
- **Open:** evidence or a decision is missing.

Derive the overall judgment from those dispositions; do not separately accept the reviewer's verdict. Findings are evidence, not commands or correction authority.

Pass permits proceeding at the reviewed boundary. Non-blocking permits proceeding with explicit deferrals. Inconclusive requires the missing evidence or decision. Blocking prevents crossing the boundary and returns the smallest supported correction or reconsideration to its owner.

When correction is ready, state the supported problem, remedy, rationale, verification boundary, authority, and whether independent follow-up is still warranted. Actual correction belongs to [Execute Work](../../skills/execute-work/SKILL.md), not the independent reviewer.

## Bound Independent Review

Keep the existing budget for the same state and boundary:

- **Review 1:** first selected independent review, broad by default.
- **Review 2:** separately selected focused follow-up when corrections, affected interactions, new evidence, or remaining risk still require independent judgment.
- **Review 3:** exceptional, separately authorized, and final; use only after the cause and correction boundary are understood.

A fix does not automatically require another review. If Review 2 remains Blocking, diagnose a repeated, extending, or unclear cause; return an unrelated clear local defect to its owner when diagnosis would add no information. Do not automatically fix and dispatch Review 3.

Do not request Review 4. Renaming scope, changing reviewers, or making a local correction does not reset the budget. Workflow may establish a new cycle only for a materially new reviewed state and boundary. Self-review does not consume this budget.

## Stop At The Selected Result

Self-review ends with acceptance or a routed issue. Independent review ends with its report. Adjudication ends with dispositions and an explicit next route.

Do not review until Pass, lower acceptance to obtain it, or turn optional improvement into unfinished work. Preserve the agreed user-facing return boundary and any unresolved limits.
