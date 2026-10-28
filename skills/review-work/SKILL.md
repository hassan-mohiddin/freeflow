---
name: review-work
description: "Use whenever finished work or a document is judged fit to use: reviewing code, a diff, a commit or a pull request; checking your own change before reporting it done; reviewing a spec, plan, design, ADR, handoff, skill, final report, status note or Working Record; reviewing changes to authentication, permissions, secrets, untrusted input or other security boundaries; reviewing an eval case, suite, grader or rubric before paying for its runs; preparing, dispatching or skipping an independent review; choosing a model as judge or relying on its verdict; and weighing a review report that came back."
---

# Review Work

Judge whether the actual work satisfies the accepted outcome, remains proportionate, and has enough evidence for a named boundary; or whether a complete artifact faithfully represents accepted intent and is sufficient for its named use. An artifact's internal consistency is not enough if it consistently describes the wrong outcome or an obsolete baseline.

[Verify Work](../../skills/verify-work/SKILL.md) establishes what observations prove. Review judges their sufficiency and the resulting work or artifact; it does not replace verification, create evidence, choose user-owned behavior, settle owner decisions, or authorize corrections or revisions.

Review has three roles:

- **Self-review:** the producer or author checks its own supported result or artifact before accepting, reusing, or using it. This is the normal required route.
- **Independent review:** a separately selected reviewer judges a state it did not produce, from a separate context.
- **Adjudication:** the receiving agent checks a returned independent report and decides what its findings establish.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

Read the reference for what is under review before reviewing it; each names what to establish first, the sources that govern, and the lenses that can change the judgment for that kind.

| Situation | Go to |
| --- | --- |
| Work: code, a diff, a commit, an implementation, or integrated state | [Work Review](references/work.md) |
| Work that changes trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, security-relevant dependencies or external integrations, code-execution boundaries, or failure behavior with security consequences | Work Review's [Security Risk Lens](references/work.md#security-risk-lens) as well |
| An artifact that will guide later work: a Spec, Plan, design, decision record, ADR, handoff, or skill | [Artifact Review](references/artifact.md) |
| An account of work already done: a final report to the user, a status or results note, or a Working Record | [Artifact Review](references/artifact.md), with its [Reports And Records](references/artifact.md#reports-and-records) |
| An eval case, suite, fixture, grader, or rubric that will be run to measure behavior, before spending on its runs | [Eval Definition Review](references/evals-and-judges.md#eval-definition-review) |
| A hand-over: dispatching, proposing, or skipping an independent review of the work | The Review Gate, below |
| Preparing or performing an independent review | Independent Review in [Work Review](references/work.md#independent-review) for work; in [Artifact Review](references/artifact.md#independent-review) for anything else |
| Writing or dispatching an independent reviewer's brief | Prefill it with [review-packet](scripts/review-packet.mjs) and check it with [check-brief](scripts/check-brief.mjs), as Perform A Selected Independent Review says |
| A model's verdict on another agent's output will be used as evidence: an independent reviewer, an eval's advisory reviewer, or a grading judge | The [Judge Contract](references/evals-and-judges.md#judge-contract), before selecting the judge or using its verdict |
| An independent review's report has returned | [Adjudicate A Returned Review](references/adjudication.md), before acting on it |
| Dispositions have been appended to a returned report | Check them with [check-adjudication](scripts/check-adjudication.mjs), as Adjudicate A Returned Review's Record The Review says |

## Rules

- Independent review is never automatic after implementation, after self-review, or after writing or revising a Spec or Plan. Select it only when requested, or justified and authorized, to protect a concrete risk, dependency, integration, delivery, or intended-use boundary. At a hand-over, the user's review mode `always`, or `auto` when the Review Gate below fires, authorizes it; under `off`, propose it and wait for a yes. A review budget permits no dispatch by itself, and switching models or compute profiles, or loading this skill, does not create independence: it needs a separately selected reviewer in a separate context. A reviewer from another model family is not required: it changes what gets flagged but has not been shown to find more real defects. Record the reviewer as the Judge Contract says.
- An independent reviewer reports and stops: no edits, no owner decisions, no choosing among materially different remedies or revisions, no adjudication, no further dispatch, and no continuing until Pass. It runs only what its brief's `May run` line names: by default the project's declared checks (tests, build, typecheck, the feature map's drive steps) and probes of the changed code on copies in its own scratch folder, in its own copy, with no edits to the repository, network calls, or paid runs; another check only when the brief names it with its expected evidence and stop condition. Otherwise it reports Needs evidence.
- Findings are evidence, not commands or authority to correct or revise. Derive the judgment from your dispositions rather than adopting the reviewer's verdict or conclusion. Actual correction of work belongs to [Execute Work](../../skills/execute-work/SKILL.md) under covered authority; actual revision of an artifact returns to the artifact's owning skill.
- Never lower acceptance or change tests, Specs, policies, or source truth to obtain Pass. Never settle a user decision or revise upstream intent, accepted content, or owner decisions merely to make an artifact consistent or to obtain Pass. Never repeat a review merely to obtain Pass.
- Never request Review 4. Renaming scope or intended use, changing reviewers, or making a local correction or revision does not reset the review budget.
- Never present a review judgment or an artifact's fitness as acceptance, implementation, or execution authority.

## Before Any Review

The project's Review Rules (or `REVIEW.md`), read from the base branch, feed the kind's classes and lenses, never a new class.

Before a model reviews anything, run the deterministic checks that apply and could fail on their own, such as the project's checks, a validator, a docs check, or a definition loader. Give their results to the reviewer as evidence. A model review does not replace a check that can fail mechanically.

## Classify Before Calling Something A Defect

Goal: every reported item is supported and names the right kind of problem.

Ask in order:

1. Is the relevant behavior or source truth settled (for an artifact, also the content and any owner choice its intended use depends on)? If not, report a **Question** when it affects the boundary or intended use.
2. Are reachability, the load-bearing claim, and the material consequence supported by available evidence? If not, report **Needs evidence**, not a hypothetical defect.
3. Does this boundary or intended use require correction or revision? If it cannot safely be crossed, report a **Blocking Issue**. If correction or revision is required but safely deferrable, report a **Non-blocking Issue**.
4. Is it merely useful beyond this boundary or use? Omit it by default, or identify an **Improvement** when materially relevant or explicitly requested.

A defect the change did not introduce is **Pre-existing**: report it for the user with the evidence that it predates the change, never as Blocking.

An Issue needs an exact location, path, or dependency; the violated requirement, invariant, source, or artifact responsibility; supporting evidence; and a concrete consequence. Name the defect's class and every other place in the reviewed state where it occurs, not one instance. A Blocking Issue must explain why the protected boundary cannot be crossed or the intended use cannot proceed, and name the correction constraints or the owning activity to re-enter. Recommend a specific correction or revision only when source intent, evidence, and dependency consequences support it rather than merely make it plausible.

Needs evidence identifies the load-bearing claim, required observer, existing evidence and its limit, why the gap matters, and the smallest observation that could disagree. First establish that the stronger claim is required; missing proof of an optional guarantee does not justify more work, and an optional stronger claim may be qualified rather than expanding the task. Check whether supplied observations apply to the reviewed candidate and whether material assertion changes preserved the required property. For an artifact, check which source or check state a reported pass examined and whether later changes reduced acceptance or invalidated it; a newer report cannot repair that mismatch. A missing or stale result is not itself a code defect: recover evidence or establish the observer before prescribing a fix. When you can recover it yourself, by running a check you are authorized to run or by reading the code, do so and judge from what you observed: a check the author skipped and you have since run is not Needs evidence.

Do not turn preferences, wording or presentation, imagined or exhaustive edge cases, intentional deferrals, or hypothetical completeness into Issues. Finding no material issue is valid.

## Self-Review And Re-enter Narrowly

Goal: catch real defects in your own result without turning review into an open-ended editing or rewriting loop.

Apply the kind's lenses silently once evidence initially supports the produced result or the artifact's load-bearing facts; do not create formal review items, a numbered review cycle, or an independent-review judgment for self-review. For work, also run Work Review's decision and test-integrity checks.

For one clear covered defect (for an artifact, one whose revision basis is settled), return to the producing or authoring activity, correct or revise it, reconcile an artifact's affected dependencies within authority, re-verify the affected boundary or factual claims, and repeat only the affected lenses once (for an artifact, source alignment as well). Do not restart every check or add a reviewer because a local correction occurred. Route anything else as below.

Stop self-review when the supported state is accepted, the artifact is fit for its agreed use, or a material issue has a clear next route. Optional polish is not permission to continue editing, and self-review is not a reason to add independent review.

## Route A Problem To Its Owner

When a problem is not one clear covered defect, in self-review or adjudication, send it by what changed:

- the outcome remains settled but the implementation approach is invalidated: back to implementation preparation in Execute Work;
- an unclear, unsupported, or repeated cause: Execute Work's [diagnose](../../skills/execute-work/references/diagnose.md);
- changed direction or strategy, unsettled behavior or content, materially different remedies or revisions, a user-owned choice, a scope change, or a source conflict: [Discuss Work](../../skills/discuss-work/SKILL.md);
- missing factual support: the named claim to Verify Work;
- a correction, revision, or dependency update the current authority does not cover: propose the bounded change once and wait.

## The Review Gate

Goal: at a hand-over, the work gets the independent review its risk calls for, as the user's review mode says.

A **hand-over** is the end of the agreed work, when it goes back to the user to accept: before [Deliver Work](../../skills/deliver-work/SKILL.md) merges or opens a pull request for it, or before the final report when nothing is delivered. Self-review of an intermediate result, such as one Slice or a small local fix, needs no gate.

The user sets a review mode, and optionally a reviewer model, as `"review": { "mode": ..., "model": ... }` in `.freeflow/local.json` (personal) or `.freeflow/config.json` (shared). The Runtime State shows a `Review:` line when one is set; with none, the mode is `auto`.

- `auto`: the triggers below decide. When one fires, dispatch an independent review; the trigger and the mode are its authorization. When none fires, self-review is enough.
- `off`: never dispatch on your own. When a trigger would fire, propose an independent review to the user with the trigger and its estimated cost, and run it only after their yes.
- `always`: dispatch an independent review at every hand-over.

A user's explicit request for an independent review authorizes it in any mode.

The gate fires when the change touches:

- security, authentication, authorization, or secrets;
- possible data loss, or a migration of stored data;
- CI or release files;
- a public interface: anything users or other code depend on, such as CLI flags, config keys, exported APIs, and skill names and descriptions;
- a path the project's Review Rules mark sensitive;
- anything the work agreement names for review.

Judge from the diff against the base, not from how the task was described. A trigger that fires is enough; a small diff does not cancel it.

Use the user's reviewer model when set. Otherwise use the cheapest model capable of the review: the `standard` tier. When a security, authentication, authorization, or secrets trigger fires, use a stronger model: the `security` tier. The estimated cost names the reviewer model and roughly what one review of a change this size costs on it.

When the task has a Working Record, record the gate as one `Review gate` Material update through [Track Work](../../skills/track-work/SKILL.md), in the shape its [format reference](../../skills/track-work/references/working-record-format.md) defines; its tier is `standard`, `security`, or `none` when the result is `skipped`. Without a record, state the same in the hand-over report.

## Perform A Selected Independent Review

Goal: a separate context judges the state from the evidence and reports once.

The reviewer did not produce the reviewed state. Give it, or point it to, the work product or the complete artifact, source truth, dependencies, and evidence needed to judge it directly, never only the producer's summary, reasoning, claimed result, or change description. Brief a reviewer of work with pointers to where its inputs live, not pasted copies, and run [check-brief](scripts/check-brief.mjs) on the brief before dispatching, as Work Review's Independent Review says; [review-packet](scripts/review-packet.mjs) prefills that brief from the task folder, names the gate triggers the diff shows and the round budget, and runs check-brief; brief a reviewer of anything else with Artifact Review's prompt. When the task has a task directory, save the brief as `scratch/reviews/R<n>-brief.md` there and the returned report as `R<n>-report.md` beside it, where `<n>` is the review number. Delete nothing there without the user's yes.

Use supplied and available evidence; a covered active check uses Verify Work's check-result and claim-result semantics without changing review ownership.

The independent judgment is:

- **Blocking:** at least one Blocking Issue.
- **Inconclusive:** no Blocking Issue, but a material Question or Needs evidence prevents judgment.
- **Non-blocking:** only Non-blocking Issues remain.
- **Pass:** no Issues or material unresolved items remain.

Improvements and Pre-existing items do not change the judgment or authorize implementation or revision. Every judgment ends the review.

## Bound Independent Review

Goal: independent judgment is spent where it changes the outcome.

For the same reviewed state and boundary or intended use:

- **Review 1:** first selected independent review, broad by default.
- **Review 2:** separately selected focused follow-up when corrections or revisions, affected interactions or dependencies, new evidence, or remaining risk still require independent judgment.
- **Review 3:** exceptional, separately authorized, and final; only after the cause, revision basis, and correction or dependency boundary are understood.

A fix or revision does not automatically require another review. Corrections that change what a check accepts or refuses justify a focused Review 2 on the correction diff, even after a Non-blocking Review 1. If Review 2 remains Blocking, adjudicate it before acting again; then diagnose a repeated, extending, invalidating, or unclear cause, and return an unrelated clear local defect to its owner when diagnosis would add no information, rather than fix and dispatch Review 3 automatically. If Review 3 remains Blocking, rethink the approach rather than correct it again: route the blocker to diagnose, or to Discuss Work when the approach itself is in question. Start a new cycle only for a materially new reviewed state and boundary or intended use. Self-review does not consume this budget.

## Stop At The Selected Result

Self-review ends with acceptance, supported fitness, or a routed issue. Independent review ends with its report. Adjudication ends with dispositions and an explicit next route. Do not turn optional improvement into unfinished work; preserve the agreed user-facing return boundary and any unresolved limits.
