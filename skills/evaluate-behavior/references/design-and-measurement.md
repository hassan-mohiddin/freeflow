# Design And Measurement

This reference is judgment: adapt it to the question and to the decision the result must support. Its binding statements restate [Evaluate Behavior](../SKILL.md) Rules or the [authoring](authoring.md) contract. Its figures come from measured review-suite runs and are examples, not thresholds.

## Map Claims To Evidence

| Evidence class | The question it answers, and what observes it |
| --- | --- |
| Description activation | Did a natural prompt cause the exact target to be read, and when? Natural activation at the earliest useful prompt. |
| First-read body behavior | Did explicit body delivery guide the subject using only guaranteed context? |
| Nearby behavior | Did a close case avoid activation, or load without hijacking the task? Natural activation plus behavioral output. |
| Dependency composition | Did exact ordered skills, resources, and context work together? |
| Retained use | Did guidance remain useful on later declared turns without redelivery? Multi-turn evidence. |
| Artifact outcome | Did files, structured state, events, responses, and test commands match fixed criteria? |
| Cross-host behavior | Did the same behavioral question hold on every named host? One group per host, same semantics. |
| Delivery | Did the changed component reach the model, observed in the system prompt or provider context? |

Record separately:

- declaration;
- resource materialization;
- delivery;
- observed reads;
- behavior;
- artifacts;
- derived grades;
- judged evidence;
- later semantic judgment.

```text
successful read
≠ behavioral compliance

explicit body delivery
≠ natural activation

one turn
≠ retained use

ambient installation
≠ declared composition

correct behavior
≠ proof that the target caused it
```

## Choose The Smallest Group Shape

- **Description prompt:** natural activation and exact read timing.
- **Explicit body task:** first-read body behavior without activation ambiguity.
- **Fixture task:** files or repository state matter.
- **Stateful turns:** ordered conversation and retained use matter.
- **Saved-result review:** canonical evidence already answers the question.
- **Suite:** several independent questions require one ordered invocation, or a comparison needs a decision rule over several cases.
- **Conversation, pipeline, coding task or judged evaluation:** the behavior happens with a simulated user, across stages, in code that tests must run, or in meaning only a judge can read; see [coding tasks](coding-tasks.md) and [conversations, pipelines and judges](conversations-pipelines-judges.md).

Keep activation and body behavior separate unless their integrated interaction is the exact question and the current runner supports that observing boundary.

### Compare, Noise Check And Measure

- **Compare arms** answers whether the component changes behavior on this task. Picking the best of several candidates on the same cases selects on noise; confirm the winner on held-out cases.
- **A noise check** (`component: []`, identical arms) shows how much runs of one unchanged setup differ: the floor a real difference must clear. Run it in the same batch and on the same cases as the comparison it calibrates; one noise check is itself noisy, and a repeat of the reference as an extra arm in the comparison group gives the floor without a separate batch.
- **Measure** (one arm, its own reference) records a baseline to compare against later, scores a benchmark, or checks that a setup still passes what it passed before. It never supports a comparison: two setups measured separately ran in different batches and conditions, so when the question becomes which is better, run both as arms of one group with a decision rule. A benchmark score is a rate on this suite, with these checks and this setup, not readiness.

## Fix Exact Arms

A group runs two or more named arms, and one of them, `baseline` unless `reference` names another, is the reference the others are compared with. Two arms, `baseline` and `candidate`, answer most questions. Add an arm only when the question needs it, for example two candidate wordings against one baseline; each added arm adds subjects, and a decision rule compares only the two arms it names, so pick that pair before the run.

To learn whether a skill's body, not just its description, changes behavior, add a separate group whose baseline is a neutral package: the same name and description with a placeholder body. A candidate that matches the neutral baseline gains nothing from its body under that pressure.

Inline examples in the instructions under test teach the subject and are part of the candidate intervention; they are not independent evaluation evidence.

## Design Common Questions

### Description activation

Use the earliest natural prompt where the target should become useful.

For a nearby prompt, predeclare whether success means:

- non-trigger; or
- safe behavior after activation.

Test both sides in one suite: prompts where the target should be read and close prompts where it should not. A suite with only one side rewards a description that triggers on everything, or on nothing.

### First-read body

Explicitly deliver the exact target body with only guaranteed context. Ambient package context cannot repair a hidden dependency.

### Delivery

For a component that acts through what the host sends, such as an extension, a host setting or an instruction file, first check with a `context-text` expectation that it reached the model; a change that never reached it cannot explain a behavior difference.

### Dependency composition

Materialize exact ordered skills and context. Vary only the target snapshot. Do not provide a hidden base stack.

### Retained use

Use ordered turns in one persistent subject process. Repeated body delivery does not prove retained use.

### Artifact outcome

Grade files, changed paths, structured state, and events before relying on the final response. Preserve turn-scoped workspace evidence when later turns may change earlier state. When the outcome is working code, grade it with a command, such as hidden tests, rather than by reading it.

Grade what the agent produced, not the path it took. A required sequence of tool calls fails valid approaches the author did not foresee. Check a tool call only when the call is itself the behavior, such as a forbidden action or a confirmation the task requires.

## Apply Real Pressure

A useful group:

- creates a natural temptation to violate the intended behavior;
- keeps criteria and review questions outside the prompt;
- exposes deterministic evidence where possible;
- distinguishes the arms' behavior;
- remains realistic enough that passing behavior is useful.

Choose the pressure by the kind of instruction under test:

- **A Rule:** make breaking it the easy or rewarded path, such as urgency, a user request that conflicts with it, or a shortcut that saves work. The candidate passes only if the Rule holds.
- **Judgment:** include at least one case where following the default literally is the worse choice, next to a case where the default is right. The candidate passes on the outcome in both, so a variant that only obeys the default cannot pass.

## Make Tasks Fair

Research Work's [study](../../research-work/references/study.md#make-tasks-fair) says what a fair task is and how to grade one requirement at a time. For an agent's task:

- Passing must require doing the job, not a shortcut: editing or deleting tests, hard-coding an expected output, or writing text aimed at a judge.
- An arm that fails a case in every one of many trials usually has a broken task or check, not an incapable agent. Read its transcripts, and for a coding task run its reference solution, before revising the component.

## Grade By Requirement And Respect Variance

Label each requirement a group checks as derivable from the request and code, dependent on a clarification, or imposed by the evaluator (an exact name or message only the checker knows); a failure on an evaluator-imposed requirement says little about the component. For a task with several parts, give each part its own expectation; the aggregate counts each check separately and never combines them into one weighted score.

One run per cell cannot separate a difference of one or two items from run-to-run variance. Repeat the cell, or report such a difference as unresolved. Freeze the candidate before a batch runs; items used to develop a revision are not evidence for it (Hold Cases Out, below).

## Keep Separate Conclusions Separate

An explicitly delivered body may support first-read behavior while a natural prompt still fails activation. Preserve both conclusions; one does not repair the other.

## Claim Classes

Name the strongest claim the result must support before building cases, and report the strongest one it reached, never a stronger one. The general classes and the evidence levels they reach are in Research Work's [study](../../research-work/references/study.md#name-the-claim-class); for an agent eval they are:

| Claim | Minimum evidence | Not enough |
| --- | --- | --- |
| **Can do X** | One complete run that shows X, with its transcript | — |
| **Does X at a rate on this suite** | Pass, fail and unavailable counts per check, case and trial, with the case and trial counts stated; pass^k at the stated k for behavior relied on every time | One run; pass@k alone for behavior relied on every time |
| **A beats B** | Paired runs of both arms on the same cases, and a decision rule and size fixed before the run | Fewer cases than declared; transitions such as fail-to-pass; unpaired runs; a rule chosen after seeing results |
| **Ready** | Held-out cases, real services, pinned models, and evidence at the claim's own boundary | Any of the above alone. Evaluate Behavior never claims it |

"The candidate identified the defect in 69 of 90 reviews, the baseline in 42" is a count. "The candidate is better" needs the rule.

## Fix The Decision Rule First

Why the rule comes first, and what any decision rule names, is in Research Work's [study](../../research-work/references/study.md#fix-the-decision-rule-first). Declare the rule as the suite's `decision` before the run ([authoring](authoring.md#decision) has its fields and defaults). It names:

- the measure: a comparison's checks, a run metric such as cost or turns, or a judged rubric dimension;
- the two arms it compares, the reference first, and whether higher or lower is better;
- the size: the minimum number of decided cases, the significance level, and optionally an adaptive trial schedule.

The unit is the case: each arm's values are averaged per case, as Research Work's rule combines trials, and an exact sign test runs over the cases that differ. The verdict is `beats` only with at least the minimum decided cases, p below the level, and the split in the declared direction; the same evidence the other way is `worse`; anything else is `no-difference-shown`. For example, 19 better, 5 worse and 6 equal gives p ≈ 0.007. Report the verdict beside the pooled counts, and the split behind it.

The sign test ignores how much better a case was, so it is conservative for measures with large per-case differences, such as cost. To change the rule after seeing results, write a new suite and run it fresh.

## Size Cases And Trials To The Decision

Research Work's [study](../../research-work/references/study.md#size-to-the-decision) has the sizing rules: few trials show little, pass^k against pass@k, the cases a comparison needs (`stats.mjs power`), more cases beat more trials, families are not independent, the subject's settings stay as they are, and the count is fixed before the run. For an agent eval:

- **Spend trials where a miss costs most.** Cases whose miss is the costlier error can run more trials than the rest, for example nine for known-issue cases and three for clean ones.
- **Early changes often have large effects,** so 20 to 50 cases drawn from real failures are a good start; a pilot of that size reports that it detects only large effects.
- **Fix the trial count before the run.** A three-trial look once suggested a drop in detection (80 against 74 of 90) that six trials did not confirm. A decision's `trials` schedule is the one exception, because it is declared before the run: it adds trials only to cases whose sign is not yet stable, up to its maximum.

## Expect Run-To-Run Noise

The same baseline commit accepted 31 of 45 correct changes in one run and 38 of 45 in the next. What such a swing means for a result, and how to pool runs, is in Research Work's [study](../../research-work/references/study.md#measure-the-noise-floor); here a run's configuration is its commit and case versions.

- Run both arms in the same batch, so they share conditions.
- When a claim is close, run a noise check (`component: []`): the identical arms that Measure The Noise Floor describes.

## Keep Capability And Regression Suites Apart

Keep them apart as Research Work's [study](../../research-work/references/study.md#keep-capability-and-regression-studies-apart) says. In a regression suite, read the result per check and case: a sign test says `worse` only when many cases got worse, so a few broken cases show in the counts long before the verdict moves. A case that passes reliably in a capability suite can graduate into the regression suite.

## Hold Cases Out

Cases are the items of Research Work's [Hold Items Out](../../research-work/references/study.md#hold-items-out), and its split, tuning and independence rules apply to them as written: cases written by the author of the guidance under test, or by the model under test, are not independent of it.

## Control Mechanical Checks That Approximate Meaning

A deterministic check that stands in for a meaning, such as a regex or a check that a review names the right file and line, needs the controls Research Work's [study](../../research-work/references/study.md#validity-does-the-measure-track-the-claim) names, and what to do when it fires on them is there.

## Read Before Counting

Before reporting a count, read the transcripts of failed runs and of a sample of passing ones: they are the raw outputs Research Work's [study](../../research-work/references/study.md#read-raw-outputs-before-counting) says to read, with what to do when one shows the check or a judge is wrong.

## Count Judge Answers With Care

A judge's answers are measurements, under Review Work's [Judge Contract](../../review-work/references/evals-and-judges.md#judge-contract); what any judge needs before its answers count is in Research Work's [study](../../research-work/references/study.md#judges). In practice:

- Count only rubric answers (`review --rubric`): each run is judged alone and blind to its arm, so no order effect arises, and a decision rule can name a dimension. Keep pairwise review questions for advisory comparison.
- Name what to look for, such as the defect's location, expression and effect, and put the expected answer in the dimension's `reference`, which only judges see. Low agreement between judges (Cohen's kappa for two, Krippendorff's alpha for more, per dimension in the aggregate) means the question is uncertain: sharpen it and its reference before counting.
- Choose the judge and record its relation to the subject as the Judge Contract says.
- Calibrate each judge configuration with `review --calibrate <labels.json>` against runs you labelled by hand before reading the judge's answers on them, including runs where each answer is right: a set that is almost all "yes" makes a judge that always says yes look accurate. Keep some labelled runs out when you revise the rubric against the labels, and calibrate again when the kind of task changes. Calibration gives a judge validation record its agreement, and kappa per dimension; the interval comes from `stats.mjs interval wilson`, and the record's other checks (length control, decoys, repeatability, and both orders for a pairwise judge) are still needed before a judged dimension counts toward a decision. A configuration scored against labels is labelled, with its agreement; it is calibrated in Review Work's sense only with a passing record.
- Judges are sensitive to the wording of the question and reference, and can defer to a reference over the evidence: read a sample of answers whenever the wording changes. When the arms differ in length, include the length control Research Work describes.
- For pairwise questions, run `--swap`, or `--swap-sample` once order effects are known to be rare; when the two orders disagree, report a strict reading (yes in both orders) and a lenient one (yes in one order and no in neither).
- Keep the judge's view large enough for its question; raise `--limit` and state what it cut.

## Count The Cost And Spend Less

Count subjects before running: groups × arms × trials, times the stages of a pipeline, plus a simulated user's call per conversation turn; then one judge call per reviewed group (two with `--swap`), and one per judge per judged run. The plan line prints the subject count. Host-reported cost is a list-price estimate: runs billed to a subscription spend the user's plan limit instead, which `--max-cost` does not see. Run the smallest batch that can answer the question first, and state the count before a large one.

Spend the fewest subject and judge calls that still answer the question: start from saved evidence; run `check-tasks`, which calls no model, while a run with `--uncommitted` still runs subjects; run the smallest batch first with `--pilot` or one `--group`; let `--reuse` take unchanged arms, but run every arm fresh when a claim is close, since a reused run did not share the fresh arm's batch; remember that `--jobs` saves time, not spend; let a decision's adaptive `trials` schedule add trials only where the sign is unsettled; grade deterministically first, swap only a sample once order effects are known to be rare, and calibrate each judge configuration once. A cheaper judge that calibrates well is a valid choice.

## Under A Research Work Study Plan

When a Research Work study plan's arms are agent configurations, this evaluator runs them, and the plan's rules apply to the suite. Research Work owns those rules ([study](../../research-work/references/study.md)); this is what carries each one here:

- **The run and its verdict.** Run `skill-eval run` through `study.mjs run`, with `--results` inside the study's folder, so a receipt records the command and its exit code. The suite `decision` is the plan's decision rule, computed by the evaluator rather than by a `stats.mjs` receipt: write the hypothesis's `Method` as `computed: skill-eval suite decision, sign test`, and cite the aggregate in the register, so Research Work's gate traces its numbers there. Its test is the one `stats.mjs paired sign` computes; the unit, size and verdicts are this skill's, as Fix The Decision Rule First says.
- **Budgets per arm.** Arms differ only in the component, so they share turns, tools, model and thinking unless one of those is the component; write the same Budget for every arm compared. Tuning effort is yours to equalize: a candidate revised against these cases was tuned on them, so they are tuning cases (Hold Cases Out).
- **Validity.** For a coding task, `check-tasks` is the plan's validity check: the reference solution must pass and the unchanged fixture must fail. Run it through `study.mjs run --validity`; it exits non-zero on an unsolvable or already-solved group, and a not-checkable group needs another check. The evaluator's own validity gate ([running and evidence](running-and-evidence.md)) is a different check: it marks invalid a run that shows no model at work.
- **Contamination.** Grader files outside the fixture, the `answer-copy` and `outside-read` flags, and `network: "none"` control the plan's `grader and harness` and `tools and web` routes; `training data` (cases from a published benchmark) and `tuning` stay yours to record.
- **Model labels.** A judge under `review --rubric` is the plan's `judge`. Any other model whose labels the analysis counts, such as one inside a command grader, is a judge too, as Research Work's [study](../../research-work/references/study.md#judges) says.
- **Expected answers.** The Rule that keeps criteria, graders, review questions and rubric references away from subjects covers the evaluator's own files; Research Work's [rule](../../research-work/references/study.md#close-the-routes-contamination-takes) adds the prediction: no prompt, fixture or declared context an arm receives says which arm should win.

## Defect Suites

For a reviewer, checker or anything else whose job is to find problems. Sizing, noise and judges are above; this section covers what is particular to detectors.

A detector is measured on two sides, as Research Work's [study](../../research-work/references/study.md#detectors-measure-both-sides) says: how often it finds real problems, and how often it rejects sound work. One side alone means nothing; a reviewer that rejects everything finds every defect.

### Build Both Sides

- **Clean controls:** sound changes, put through the same detector, to measure false rejection.
- **Seeded defects:** planted in otherwise sound changes, in named classes such as a logic error a test catches, a convention broken against stated requirements, and a security flaw. Report each class separately.
- **Real defects:** taken from history, from the commit that introduced a defect a later commit fixed, without refactor-only hunks. Seeded and real defects can differ in detection by an order of magnitude, so report them separately and keep real ones in every comparison.

### Prove Every Label

- Show each defect is real before use: a test or probe that passes on the sound state and fails on the defective one, or for a convention, the quoted requirement and the line that breaks it. Reproduce the proof on a fresh export, not in the builder's tree.
- A real variant matches its introducing commit byte for byte.
- Audit the clean labels too. Trace each stated requirement to what its commit shows, narrow any that claim more, and check that the fixture holds the code each requirement depends on. A "clean" change with a genuine issue leaves the false-rejection measure and becomes a known-issue case; one audit moved 5 of 20.

### Keep The Answer Out Of Sight

- What the detector must not see is in Research Work's [study](../../research-work/references/study.md#detectors-measure-both-sides), and the defect's class is part of it: use neutral IDs and paths, since a declared context path containing the variant name is enough to leak it.
- Cases are built by someone other than the author of the guidance under test. Seeds are never written by the model under test.

### Give The Detector What Its Job Needs

- Give it the tools a careful person would use for the job, such as listing files and running the change's tests. A reviewer that cannot list files reviews the diff alone; one that cannot run the tests asks for evidence it could have produced.
- Make the harness reliable before measuring. Tests that fail under load, cut output and a misleading build status each produced rejections that belonged to the harness, not the detector.
- A change of tools or harness changes the measure. Results from before and after do not compare directly; say so.

### Score Detection And Rejection

- Fix the outcomes before the run, for example: a clean change is rejected when the review ends Inconclusive or Blocking. A deterministic check on the verdict line can score rejection; declare the comparison the suite's decision rule reads.
- Count a defect as found only when the detector identified it, by location and effect. Rejecting the change for another reason is not detection. A text check rarely tells the two apart; a rubric dimension such as "found the defect", with the defect's location and effect in a `reference` only judges see, usually does.
- Report, for each side and class: the counts, pass^k (found in every trial), the per-case split between arms, and held-out cases apart from tuning cases.
- Read the rejections of clean changes and sort their causes, such as harness fault, ignoring evidence the detector produced itself, demanding a test for behavior the code plainly shows, and genuine open questions. The causes point at the revision; the count alone does not.
- Weigh both sides before adopting a change. One wording raised acceptance of correct changes from 77% to 91% while detection held at 82% to 85%, and was adopted; a second sentence that also raised acceptance missed guard bypasses in otherwise sound changes, and was dropped.
- Combining several detectors' verdicts trades one side for the other: an "any" rule mostly adds false rejections, a unanimous rule loses detections. Detectors from different model families flag different items, but that has been seen to add false rejections more than detections; measure both sides before trusting a mixed panel.
- An adjudicator can reject a real defect, and nothing downstream recovers it. Count, from the stage outputs, the seeded defects some review found and the adjudicator dropped, and report them apart from defects no review found.
- To measure a review design rather than one reviewer, such as two independent reviews and an adjudicator, run it as a pipeline: each review a fresh stage that sees only the change, the adjudicator a stage that sees the reviews, and the adjudicator graded. Score both sides on its final verdict, and read the stage outputs to tell a missed defect from one the adjudicator dropped.
