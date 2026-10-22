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

A task is fair when an agent that does the job correctly passes, and one that does not, fails.

- Everything a check requires is stated in the task or follows from it. A check that expects a file path the task never names fails a correct agent.
- Two people who know the domain would give each run the same pass or fail. When they would not, sharpen the task or the check before running.
- Passing requires doing the job, not a shortcut: editing or deleting tests, hard-coding an expected output, or writing text aimed at a judge.
- An arm that fails a case in every one of many trials usually has a broken task or check, not an incapable agent. Read its transcripts, and for a coding task run its reference solution, before revising the component.

## Grade By Requirement And Respect Variance

Grade each requirement a group checks, not only pass or fail. Label each as derivable from the request and code, dependent on a clarification, or imposed by the evaluator (an exact name or message only the checker knows); a failure on an evaluator-imposed requirement says little about the component.

For a task with several parts, give each part its own expectation, so a run that does most of the task reads differently from one that fails at once. The aggregate counts each check separately; it does not combine them into one weighted score.

One run per cell cannot separate a difference of one or two items from run-to-run variance. Repeat the cell, or report such a difference as unresolved.

Freeze the candidate before a batch runs; items used to develop a revision are not evidence for it (Hold Cases Out, below).

## Keep Separate Conclusions Separate

An explicitly delivered body may support first-read behavior while a natural prompt still fails activation. Preserve both conclusions; one does not repair the other.

## Claim Classes

Name the strongest claim the result must support before building cases, and report the strongest one it reached, never a stronger one.

| Claim | Minimum evidence | Not enough |
| --- | --- | --- |
| **Can do X** | One complete run that shows X, with its transcript | — |
| **Does X at a rate on this suite** | Pass, fail and unavailable counts per check, case and trial, with the case and trial counts stated; pass^k at the stated k for behavior relied on every time | One run; pass@k alone for behavior relied on every time |
| **A beats B** | Paired runs of both arms on the same cases, and a decision rule and size fixed before the run | Fewer cases than declared; transitions such as fail-to-pass; unpaired runs; a rule chosen after seeing results |
| **Ready** | Held-out cases, real services, pinned models, and evidence at the claim's own boundary | Any of the above alone. Evaluate Behavior never claims it |

"The candidate identified the defect in 69 of 90 reviews, the baseline in 42" is a count. "The candidate is better" needs the rule.

## Fix The Decision Rule First

Declare the rule as the suite's `decision` before the run ([authoring](authoring.md#decision) has its fields and defaults). It names:

- the measure: a comparison's checks, a run metric such as cost or turns, or a judged rubric dimension;
- the two arms it compares, the reference first, and whether higher or lower is better;
- the size: the minimum number of decided cases, the significance level, and optionally an adaptive trial schedule.

The unit is the case: trials of one case are repeated draws of one question, so each arm's values are averaged per case and an exact sign test runs over the cases that differ; authoring's Decision gives the verdicts. For example, 19 better, 5 worse and 6 equal gives p ≈ 0.007. Report the verdict beside the pooled counts, and the split behind it.

The sign test ignores how much better a case was, so it is conservative for measures with large per-case differences, such as cost. A rule written after seeing results is not a decision rule: write a new suite and run it fresh.

## Size Cases And Trials To The Decision

- **Few trials show little.** Three passes in three trials is consistent with a true pass rate near 0.3: the exact two-sided 95% lower bound is about 0.29.
- **pass^k and pass@k diverge.** At 75% per trial, all three of three trials succeed about 42% of the time, and at least one about 98%. Report pass^k for behavior a user relies on each time; pass@k fits only when a retry or a checker stands between the subject and the user.
- **Cases set what a comparison can detect.** A 20-point difference at 80% power needs roughly 62 to 93 cases per arm, depending on the base rate. A pilot of 20 or 30 cases detects only large effects; say so in its report. Early changes often have large effects, so 20 to 50 cases drawn from real failures are a good start.
- **More cases beat more trials.** Past a few trials per case, extra trials narrow the result little; extra cases narrow it more.
- **Cases that share a fixture or a task family are not independent.** Count the families as well as the cases, and spread cases across families.
- **Keep the subject's settings.** Lowering the thinking level or sampling temperature to cut variance changes the subject; do it only when that setting is the question.
- **Spend trials where a miss costs most.** Cases whose miss is the costlier error can run more trials than the rest, for example nine for known-issue cases and three for clean ones.
- **Fix the trial count before the run.** A three-trial look once suggested a drop in detection (80 against 74 of 90) that six trials did not confirm. Adding trials until a result looks right is selection. A decision's `trials` schedule is the one exception, because it is declared before the run: it adds trials only to cases whose sign is not yet stable, up to its maximum.

## Expect Run-To-Run Noise

The same baseline commit accepted 31 of 45 correct changes in one run and 38 of 45 in the next. A difference smaller than that swing, between two single runs, is not a result.

- Run both arms in the same batch, so they share conditions.
- Pool every baseline run of the same commit and the same case versions, and compare a later candidate with all of them, not the most favorable. A changed case or check starts a new series.
- When a claim is close, run a noise check (`component: []`), with identical arms; the gap it shows is the floor a real difference must clear.

## Keep Capability And Regression Suites Apart

- A **capability** suite asks what the agent cannot yet do reliably. It should start with a low pass rate, so a change has room to show. A suite where every arm passes nearly every case is saturated: a large improvement shows as a small change. Add harder cases, or move it to regression.
- A **regression** suite guards what already works and should sit near 100%. A drop means something broke. Read it per check and case: a sign test says `worse` only when many cases got worse, so a few broken cases show in the counts long before the verdict moves.
- A case that passes reliably in a capability suite can graduate into the regression suite.
- A check that passes in every arm and every trial does not separate the arms. Replace it in a capability suite; keep it in a regression suite only if it guards something that could break.

## Hold Cases Out

- Fix the split before any case is built or run, by a stable rule such as every third case in hash order.
- Tune wording against the tuning cases only. Report held-out cases separately, and never tune against them.
- Never report the score of a set you selected on as the result: choosing the best of several candidates by their held-out score makes that score optimistic.
- Cases written by the author of the guidance under test, or by the model under test, are not independent of it.

## Control Mechanical Checks That Approximate Meaning

A deterministic check that stands in for a meaning, such as a regex or "the review names the right file and line", needs a control: run it where the right answer is no. In one review suite, a check that a review named the seeded line "found" the seed in 30% to 46% of reviews of the clean version, because seeds sit where reviewers comment anyway. A check that fires on its controls cannot measure detection. Use it as a filter, or ask a judge.

## Read Before Counting

Before reporting a count, read the transcripts of failed runs and of a sample of passing ones. A failure should look fair: it is clear what the agent got wrong and why. When it is not, the task, the check or the harness is at fault, and the count measures that instead.

- A run the check failed may hold a valid solution the author did not foresee. Fix the check, not the agent.
- A run the check passed may have passed by a shortcut. Fix the check before counting it.
- When a judge and a deterministic check disagree, find which side is wrong: the agent, the check, or the judge. Fix that one and rerun; never average the two.

## Count Judge Answers With Care

A judge's answers are measurements, under Review Work's [Judge Contract](../../review-work/references/evals-and-judges.md#judge-contract). In practice:

- Check first and judge only what checks cannot answer. Count only rubric answers (`review --rubric`): each run is judged alone and blind to its arm, so no order effect arises, and a decision rule can name a dimension. Keep pairwise review questions for advisory comparison.
- Make each question answerable from the materials: name what to look for, such as the defect's location, expression and effect, and put the expected answer in the dimension's `reference`, which only judges see. Low agreement between judges (Cohen's kappa for two, Krippendorff's alpha for more, per dimension in the aggregate) means the question is uncertain: sharpen it and its reference before counting.
- Prefer a judge from another model family than the subject's, and record the relation either way.
- Calibrate each judge configuration with `review --calibrate <labels.json>` against runs you labelled by hand before reading the judge's answers on them, including runs where each answer is right: a set that is almost all "yes" makes a judge that always says yes look accurate. Keep some labelled runs out when you revise the rubric against the labels, and calibrate again when the kind of task changes.
- Judges favor longer answers, are sensitive to the wording of the question and reference, and can defer to a reference over the evidence. Include a control where the right answer is the shorter one when the arms differ in length, and read a sample of answers whenever the wording changes.
- The run is untrusted input to the judge; a subject that writes to its grader is gaming the eval, whatever the judge answers. Revising a component until a judge's scores rise can raise scores without raising quality: hand-check judged gains before adopting the revision.
- For pairwise questions, run `--swap`, or `--swap-sample` once order effects are known to be rare; when the two orders disagree, report a strict reading (yes in both orders) and a lenient one (yes in one order and no in neither).
- Before counting answers, hand-check a sample of decisive ones against the evidence, and report how many were right. Keep the judge's view large enough for its question; raise `--limit` and state what it cut.

## Count The Cost And Spend Less

Count subjects before running: groups × arms × trials, times the stages of a pipeline, plus a simulated user's call per conversation turn; then one judge call per reviewed group (two with `--swap`), and one per judge per judged run. The plan line prints the subject count. Host-reported cost is a list-price estimate: runs billed to a subscription spend the user's plan limit instead, which `--max-cost` does not see. Run the smallest batch that can answer the question first, and state the count before a large one.

Spend the fewest subject and judge calls that still answer the question: start from saved evidence; run `check-tasks`, which calls no model, while a dry run still runs subjects; run the smallest batch first with `--pilot` or one `--group`; let `--reuse` take unchanged arms, but run every arm fresh when a claim is close, since a reused run did not share the fresh arm's batch; remember that `--jobs` saves time, not spend; let a decision's adaptive `trials` schedule add trials only where the sign is unsettled; grade deterministically first, swap only a sample once order effects are known to be rare, and calibrate each judge configuration once. A cheaper judge that calibrates well is a valid choice.

## Defect Suites

For a reviewer, checker or anything else whose job is to find problems. Sizing, noise and judges are above; this section covers what is particular to detectors.

A detector is measured on two sides: how often it finds real problems, and how often it rejects sound work. One side alone means nothing; a reviewer that rejects everything finds every defect.

### Build Both Sides

- **Clean controls:** sound changes, put through the same detector, to measure false rejection.
- **Seeded defects:** planted in otherwise sound changes, in named classes such as a logic error a test catches, a convention broken against stated requirements, and a security flaw. Report each class separately.
- **Real defects:** taken from history, from the commit that introduced a defect a later commit fixed, without refactor-only hunks. Seeded and real defects can differ in detection by an order of magnitude, so report them separately and keep real ones in every comparison.

### Prove Every Label

- Show each defect is real before use: a test or probe that passes on the sound state and fails on the defective one, or for a convention, the quoted requirement and the line that breaks it. Reproduce the proof on a fresh export, not in the builder's tree.
- A real variant matches its introducing commit byte for byte.
- Audit the clean labels too. Trace each stated requirement to what its commit shows, narrow any that claim more, and check that the fixture holds the code each requirement depends on. A "clean" change with a genuine issue leaves the false-rejection measure and becomes a known-issue case; one audit moved 5 of 20.

### Keep The Answer Out Of Sight

- Nothing the detector sees may name the variant, the class or the defect: use neutral IDs and paths. A declared context path containing the variant name is enough to leak it.
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
