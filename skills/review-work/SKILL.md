---
name: review-work
description: "Use when judging implementation or integrated work through self-review or independent review, or when adjudicating a returned independent review report."
---

# Review Work

Judge whether the actual work satisfies the accepted outcome, remains proportionate, and has enough evidence for a named boundary.

[Verify Work](../../skills/verify-work/SKILL.md) establishes what observations prove. Review judges their sufficiency and the resulting work; it does not replace verification, choose user-owned behavior, or authorize corrections.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Independent review is never automatic after implementation or self-review. Select it through [Workflow](../../skills/workflow/SKILL.md) only when requested, or justified and authorized, to protect a concrete risk, dependency, integration, or delivery boundary. A review budget permits no dispatch by itself, and switching models or loading this skill does not create independence.
- An independent reviewer reports and stops: no edits, no choosing among materially different remedies, no adjudication, no further dispatch, and no continuing until Pass. It runs a missing active check only when review authority covers that exact check; otherwise it reports Needs evidence.
- Findings are evidence, not commands or correction authority. Derive the judgment from your dispositions; never adopt the reviewer's verdict wholesale. Actual correction belongs to [Execute Work](../../skills/execute-work/SKILL.md) under covered authority.
- Never lower acceptance or change tests, Specs, policies, or source truth to obtain Pass, and never review until Pass.
- Never request Review 4. Renaming scope, changing reviewers, or making a local correction does not reset the review budget.

## Choose The Review Role

Goal: the review done is the one the boundary needs.

- **Self-review:** the producer checks its own supported result before accepting or reusing it. This is the normal required route.
- **Independent review:** a separately selected reviewer judges a state it did not produce, from a separate context.
- **Adjudication:** the receiving agent checks a returned independent report and decides what its findings establish.

## Establish What The Review Protects

Goal: judge the actual state against its real sources, not the producer's account of it.

Identify the exact code, diff, commit, or integrated state; its accepted outcome, non-goals, relevant requirements and amendments; the future action being protected; and the verification evidence and gaps.

Inspect the actual state and governing sources, not just the producer's summary or explanation. A detailed execution contract can itself have been mistaken; check the user outcome before judging compliance with the suggested implementation steps.

Before reviewing changes to trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, security-relevant dependencies, code execution, or security-sensitive failure behavior, read [Security Risk Lens](references/security-risk-lens.md).

Use [Action Selection](../../skills/action-selection/SKILL.md) for uncertain or broad inspection; an obvious diff or source read needs no selection exercise.

## Apply The Same Technical Kernel

Goal: use only the lenses that can change the boundary judgment.

- **Alignment:** required behavior and accepted amendments are implemented without omission or invented obligations.
- **Correctness and integration:** reachable paths, affected callers, and components work together without regressions.
- **Failure and risk:** material errors, recovery, permissions, data, and compatibility are handled as required.
- **Evidence:** claims are supported at their required observing boundaries, not merely by green summaries.
- **Design and minimality:** complexity and coordination serve requirements or demonstrated needs rather than optional stronger guarantees.
- **Maintainability:** behavior and failure paths remain understandable and changeable.

More implementation is not better: check both missing accepted work and unnecessary additions. A prototype result is not production acceptance, and a test protecting a mechanism does not make that mechanism required. If the implementation follows an artifact whose baseline conflicts with a later accepted change, expose that source mismatch rather than choose whichever source makes the work pass.

## Classify Before Calling Something A Defect

Goal: every reported item is supported and names the right kind of problem.

Ask in order:

1. Is the relevant behavior or source truth settled? If not, report a **Question** when it affects the boundary.
2. Are reachability and material consequence supported? If not, report **Needs evidence**, not a hypothetical defect.
3. Does this boundary require correction? If it cannot safely be crossed, report a **Blocking Issue**. If correction is required but safely deferrable, report a **Non-blocking Issue**.
4. Is it merely useful beyond this boundary? Omit it by default, or identify an **Improvement** when materially relevant or explicitly requested.

An Issue needs an exact location or path, the violated requirement or invariant, supporting evidence, and a concrete consequence; a Blocking Issue must explain why the protected boundary cannot be crossed.

Needs evidence identifies the claim, required observer, existing evidence and its limit, why the gap matters, and the smallest observation that could disagree. First establish that the stronger claim is required; missing proof of an optional guarantee does not justify more work. Check whether supplied observations apply to the reviewed candidate and whether material assertion changes preserved the required property. A missing or stale result is not itself a code defect: recover evidence or establish the observer before prescribing a fix.

Do not turn preferences, imagined edge cases, intentional deferrals, or hypothetical completeness into Issues. Finding no material issue is valid.

## Self-Review And Re-enter Narrowly

Goal: catch real defects in your own result without turning review into an open-ended editing loop.

Apply the kernel silently after evidence initially supports the produced result; do not create formal review items, a numbered review cycle, or an independent-review judgment for self-review.

For one clear covered defect, return to the producer, correct it, re-verify the affected boundary, and repeat only the affected lenses once. Do not restart every check or add a reviewer because a local correction occurred.

When the outcome remains settled but the approach is invalidated, return for implementation preparation. Use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) for unclear or repeatedly failing causes, [Decision Gate](../../skills/decision-gate/SKILL.md) for unsettled accepted behavior or a user-owned choice, and Workflow for coordination or scope changes.

Stop self-review when the supported state is accepted or a material issue has a clear next route. Optional polish is not permission to continue editing.

## Perform A Selected Independent Review

Goal: a separate context judges the state from the evidence and reports once.

Before preparing or performing it, read [Independent Work Reviewer Contract](references/independent-work-reviewer-contract.md). Use supplied and available evidence; a covered active check uses Verify Work's check-result and claim-result semantics without changing review ownership. Recommend a specific correction only when supported rather than merely plausible.

The independent judgment is:

- **Blocking:** at least one Blocking Issue.
- **Inconclusive:** no Blocking Issue, but a material Question or Needs evidence prevents judgment.
- **Non-blocking:** only Non-blocking Issues remain.
- **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment or authorize implementation. Every judgment ends the review.

## Adjudicate The Returned Report

Goal: decide what the report actually establishes before acting on it.

Read [Adjudicate Work Review](references/adjudicate-work-review.md) before adjudicating. Check each material finding against the actual reviewed state, sources, and evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, already resolved, duplicate, preference-only, out of scope, or based on a source misread.
- **Open:** evidence or a decision is missing.

Pass permits proceeding at the reviewed boundary. Non-blocking permits proceeding with explicit deferrals. Inconclusive requires the missing evidence or decision. Blocking prevents crossing the boundary and returns the smallest supported correction or reconsideration to its owner.

When correction is ready, state the supported problem, remedy, rationale, verification boundary, authority, and whether independent follow-up is still warranted.

## Bound Independent Review

Goal: independent judgment is spent where it changes the outcome.

For the same state and boundary:

- **Review 1:** first selected independent review, broad by default.
- **Review 2:** separately selected focused follow-up when corrections, affected interactions, new evidence, or remaining risk still require independent judgment.
- **Review 3:** exceptional, separately authorized, and final; only after the cause and correction boundary are understood.

A fix does not automatically require another review. If Review 2 remains Blocking, diagnose a repeated, extending, or unclear cause; return an unrelated clear local defect to its owner when diagnosis would add no information, rather than fix and dispatch Review 3 automatically. Workflow may start a new cycle only for a materially new reviewed state and boundary. Self-review does not consume this budget.

## Stop At The Selected Result

Self-review ends with acceptance or a routed issue. Independent review ends with its report. Adjudication ends with dispositions and an explicit next route. Do not turn optional improvement into unfinished work; preserve the agreed user-facing return boundary and any unresolved limits.
