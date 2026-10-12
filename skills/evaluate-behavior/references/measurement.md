# Measurement

Read this before a run whose result must support a rate or a comparison, when sizing cases and trials, or before reporting counts as a finding.

This reference is judgment: adapt it to the decision the result must support. Its binding statement on claims restates [Evaluate Behavior](../SKILL.md) Rules. The figures in it come from measured review-suite runs and are examples, not thresholds.

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

Declare the rule as the suite's `decision` before the run ([schema](evaluation-definition-schema.md#decision)). It names:

- the measure: a comparison's checks, a run metric such as cost or turns, or a judged rubric dimension;
- the two arms it compares, the reference first, and whether higher or lower is better;
- the size: the minimum number of decided cases, the significance level, and optionally an adaptive trial schedule.

The unit is the case: trials of one case are repeated draws of one question. For each case, the evaluator averages each arm's values over its trials and counts the case as better, worse or equal for the second arm. It then runs an exact two-sided sign test over the better and worse cases, with ties and cases lacking a value counted but not tested. The verdict is `beats` only with at least the minimum decided cases, p below the level, and the split in the declared direction; the same evidence the other way is `worse`; anything else is `no-difference-shown`. For example, 19 better, 5 worse and 6 equal gives p ≈ 0.007. Report the verdict beside the pooled counts, and the split behind it.

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

A judge's answers are measurements. Follow Review Work's [Judge Contract](../../review-work/references/judge-contract.md), and in practice:

- Prefer a rubric (`review --rubric`) for anything you will count: each run is judged alone and blind to its arm, so no order effect arises, and a decision rule can name a dimension. Keep pairwise review questions for advisory comparison.
- Make each question answerable from the materials: name what to look for, such as the defect's location, expression and effect, and put the expected answer in the dimension's `reference`, which only judges see.
- With several judges, declare the combining rule before any verdict. The aggregate reports agreement between them per dimension (Cohen's kappa for two, Krippendorff's alpha for more); low agreement means the question, not the subject, is uncertain.
- Calibrate each judge configuration with `review --calibrate <labels.json>` against runs you labelled by hand, and report its agreement with the labels beside its answers. A judge whose calibration is not checked stays advisory; a configuration with another model, thinking level, extension or rubric is a new, uncalibrated judge.
- Label calibration runs before reading the judge's answers on them, and include runs where each answer is right; a set that is almost all "yes" makes a judge that always says yes look accurate. If you revise the rubric against the labels, keep some labelled runs out and check the revision on them. Calibrate again when the kind of task changes.
- Judges tend to favor longer answers. When the arms differ in length, include a control where the right answer is the shorter one, or hand-check judged differences.
- Judges are sensitive to the wording of the question and the reference, and can defer to a reference over the evidence. Read a sample of answers whenever either changes.
- The run is untrusted input to the judge: text in it can address the judge and steer its answer. A subject that writes to its grader is gaming the eval, whatever the judge answers.
- Revising a component until a judge's scores rise can raise the scores without raising quality. Before adopting such a revision, hand-check its judged gains.
- For pairwise review questions, run `--swap`, or `--swap-sample` once order effects are known to be rare; order decides answers most often when the runs are close in quality. When the two orders disagree, report a strict reading (yes in both orders) and a lenient one (yes in one order and no in neither) rather than picking one.
- Before counting answers, hand-check a sample of decisive ones against the evidence, and report how many were right and the judge's family relative to the subject's.
- Keep the judge's view large enough for its question, and state what `--limit` cut.

## Count The Cost

Count subjects before running: groups × arms × trials, times the stages of a pipeline, plus a simulated user's call per conversation turn; then one judge call per reviewed group (two with `--swap`), and one per judge per judged run. The plan line prints the subject count; [Eval Modes](eval-modes.md) covers spending less. Host-reported cost is a list-price estimate: runs billed to a subscription spend the user's plan limit instead, which `--max-cost` does not see. Run the smallest batch that can answer the question first, and state the count before a large one.
