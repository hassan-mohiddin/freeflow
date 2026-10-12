---
name: review-work
description: "Use when reviewing code, other finished work, a report or task record of work done, an eval case, or a document that will guide later work, such as a spec, plan, design, decision record, handoff, or skill, for whether it is correct and complete enough to use: your own before reporting or using it, or another's, or when weighing a review report of it. Running checks to see whether it works is Verify Work."
---

# Review Work

Judge whether the actual work satisfies the accepted outcome, remains proportionate, and has enough evidence for a named boundary; or whether a complete artifact faithfully represents accepted intent and is sufficient for its named use. An artifact's internal consistency is not enough if it consistently describes the wrong outcome or an obsolete baseline.

[Verify Work](../../skills/verify-work/SKILL.md) establishes what observations prove. Review judges their sufficiency and the resulting work or artifact; it does not replace verification, create evidence, choose user-owned behavior, settle owner decisions, or authorize corrections or revisions.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Independent review is never automatic after implementation, after self-review, or after writing or revising a Spec or Plan. Select it through [Workflow](../../skills/workflow/SKILL.md) only when requested, or justified and authorized, to protect a concrete risk, dependency, integration, delivery, or intended-use boundary. A review budget permits no dispatch by itself, and switching models or compute profiles, or loading this skill, does not create independence: it needs a separately selected reviewer in a separate context. Repeating a review with the same model adds no independent vote. A reviewer from a different model family changes what gets flagged but has not been shown to find more real defects; record the reviewer's model and family.
- An independent reviewer reports and stops: no edits, no owner decisions, no choosing among materially different remedies or revisions, no adjudication, no further dispatch, and no continuing until Pass. It runs a missing active check only when review authority covers that exact check; otherwise it reports Needs evidence.
- Findings are evidence, not commands or authority to correct or revise. Derive the judgment from your dispositions rather than adopting the reviewer's verdict or conclusion. Actual correction of work belongs to [Execute Work](../../skills/execute-work/SKILL.md) under covered authority; actual revision of an artifact returns through Workflow to the artifact's owning skill.
- Never lower acceptance or change tests, Specs, policies, or source truth to obtain Pass. Never settle a user decision or revise upstream intent, accepted content, or owner decisions merely to make an artifact consistent or to obtain Pass. Never repeat a review merely to obtain Pass.
- Never request Review 4. Renaming scope or intended use, changing reviewers, or making a local correction or revision does not reset the review budget.
- Never present a review judgment or an artifact's fitness as acceptance, implementation, or execution authority.

## Choose The Review Role

Goal: the review done is the one the boundary needs.

- **Self-review:** the producer or author checks its own supported result or artifact before accepting, reusing, or using it. This is the normal required route.
- **Independent review:** a separately selected reviewer judges a state it did not produce, from a separate context.
- **Adjudication:** the receiving agent checks a returned independent report and decides what its findings establish.

## Choose What Is Reviewed

Goal: apply the method that fits what is under review, not a generic checklist.

- **Work:** code, a diff, a commit, an implementation, or integrated state. Read [Work Review](references/work.md) before reviewing it.
- **Artifact:** a document that will guide later work, such as a Spec, Plan, design, decision record, ADR, Handoff, or skill. Read [Artifact Review](references/artifact.md) before reviewing it.
- **Report or record:** an account of work already done, such as a final report to the user, a status or results note, or a Working Record. Read [Report And Record Review](references/report-and-record.md) before reviewing it.
- **Eval definition:** a case, suite, fixture, grader, or rubric that will be run to measure behavior. Read [Eval Definition Review](references/eval-definition.md) before reviewing it, and before spending on its runs.

Each reference names what to establish first, the sources that govern, and the lenses that can change the judgment for that kind.

Before a model reviews anything, run the deterministic checks that apply and could fail on their own, such as the project's checks, a validator, a docs check, or a definition loader. Give their results to the reviewer as evidence. A model review does not replace a check that can fail mechanically.

## Classify Before Calling Something A Defect

Goal: every reported item is supported and names the right kind of problem.

Ask in order:

1. Is the relevant behavior or source truth settled (for an artifact, also the content and any owner choice its intended use depends on)? If not, report a **Question** when it affects the boundary or intended use.
2. Are reachability, the load-bearing claim, and the material consequence supported by available evidence? If not, report **Needs evidence**, not a hypothetical defect.
3. Does this boundary or intended use require correction or revision? If it cannot safely be crossed, report a **Blocking Issue**. If correction or revision is required but safely deferrable, report a **Non-blocking Issue**.
4. Is it merely useful beyond this boundary or use? Omit it by default, or identify an **Improvement** when materially relevant or explicitly requested.

An Issue needs an exact location, path, or dependency; the violated requirement, invariant, source, or artifact responsibility; supporting evidence; and a concrete consequence. A Blocking Issue must explain why the protected boundary cannot be crossed or the intended use cannot proceed. Recommend a specific correction or revision only when source intent, evidence, and dependency consequences support it rather than merely make it plausible.

Needs evidence identifies the load-bearing claim, required observer, existing evidence and its limit, why the gap matters, and the smallest observation that could disagree. First establish that the stronger claim is required; missing proof of an optional guarantee does not justify more work, and an optional stronger claim may be qualified rather than expanding the task. Check whether supplied observations apply to the reviewed candidate and whether material assertion changes preserved the required property. For an artifact, check which source or check state a reported pass examined and whether later changes reduced acceptance or invalidated it; a newer report cannot repair that mismatch. A missing or stale result is not itself a code defect: recover evidence or establish the observer before prescribing a fix. When you can recover it yourself, by running a check you are authorized to run or by reading the code, do so and judge from what you observed: a check the author skipped and you have since run is not Needs evidence.

Do not turn preferences, wording or presentation, imagined or exhaustive edge cases, intentional deferrals, or hypothetical completeness into Issues. Finding no material issue is valid.

## Self-Review And Re-enter Narrowly

Goal: catch real defects in your own result without turning review into an open-ended editing or rewriting loop.

Apply the kind's lenses silently once evidence initially supports the produced result or the artifact's load-bearing facts; do not create formal review items, a numbered review cycle, or an independent-review judgment for self-review.

For one clear covered defect (for an artifact, one whose revision basis is settled), return to the producing or authoring activity, correct or revise it, reconcile an artifact's affected dependencies within authority, re-verify the affected boundary or factual claims, and repeat only the affected lenses once (for an artifact, source alignment as well). Do not restart every check or add a reviewer because a local correction occurred.

Route by what changed:

- the outcome remains settled but the implementation approach is invalidated: return for implementation preparation;
- changed direction or strategy: [Discuss](../../skills/discuss/SKILL.md);
- unsettled accepted behavior, a user-owned choice, or a source conflict: [Decision Gate](../../skills/decision-gate/SKILL.md);
- an unclear, unsupported, or repeatedly failing cause: [Diagnose Failure](../../skills/diagnose-failure/SKILL.md);
- coordination or scope changes: Workflow.

Stop self-review when the supported state is accepted, the artifact is fit for its agreed use, or a material issue has a clear next route. Optional polish is not permission to continue editing, and self-review is not a reason to add independent review.

## Perform A Selected Independent Review

Goal: a separate context judges the state from the evidence and reports once.

Before preparing or performing it, read [Independent Reviewer Contract](references/reviewer-contract.md). Use supplied and available evidence; a covered active check uses Verify Work's check-result and claim-result semantics without changing review ownership.

When a model's verdict on another agent's output will be used as evidence, whether it comes from an independent reviewer, an eval's advisory reviewer, or a grading judge, read [Judge Contract](references/judge-contract.md) before selecting the judge or using its verdict.

The independent judgment is:

- **Blocking:** at least one Blocking Issue.
- **Inconclusive:** no Blocking Issue, but a material Question or Needs evidence prevents judgment.
- **Non-blocking:** only Non-blocking Issues remain.
- **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment or authorize implementation or revision. Every judgment ends the review.

## Adjudicate The Returned Report

Goal: decide what the report actually establishes before acting on it.

Read [Adjudicate A Review](references/adjudication.md) before adjudicating. Check each material finding against the actual reviewed state or artifact, sources, dependencies, and evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, already resolved, duplicate, preference-only, out of scope or outside the artifact's job, or based on a source or dependency misread.
- **Open:** evidence or an owner decision is missing.

Pass permits proceeding at the reviewed boundary or with the intended use. Non-blocking permits it with explicit deferrals. Inconclusive requires the missing evidence or decision. Blocking prevents crossing the boundary or the disputed use and returns the smallest supported correction, revision, or reconsideration to its owner (for an artifact, through Workflow).

When a correction or revision is ready, state the supported problem, remedy or revision basis, rationale, dependency impact, verification or observing boundary, authority, and whether independent follow-up is still warranted.

## Bound Independent Review

Goal: independent judgment is spent where it changes the outcome.

For the same reviewed state and boundary or intended use:

- **Review 1:** first selected independent review, broad by default.
- **Review 2:** separately selected focused follow-up when corrections or revisions, affected interactions or dependencies, new evidence, or remaining risk still require independent judgment.
- **Review 3:** exceptional, separately authorized, and final; only after the cause, revision basis, and correction or dependency boundary are understood.

A fix or revision does not automatically require another review. If Review 2 remains Blocking, diagnose a repeated, extending, or unclear cause; return an unrelated clear local defect to its owner when diagnosis would add no information, rather than fix and dispatch Review 3 automatically. Workflow may start a new cycle only for a materially new reviewed state and boundary or intended use. Self-review does not consume this budget.

## Stop At The Selected Result

Self-review ends with acceptance, supported fitness, or a routed issue. Independent review ends with its report. Adjudication ends with dispositions and an explicit next route. Do not turn optional improvement into unfinished work; preserve the agreed user-facing return boundary and any unresolved limits.
