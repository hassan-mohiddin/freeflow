# Study Design

This reference is judgment: adapt it to the question and to the decision the result must support. The study plan's format, and what `study.mjs` enforces about it, are a contract in [artifacts](artifacts.md#study-plan).

Goal: a plan, written and locked before any data exists, whose result can only come out one of a few ways, each of which tells the reader what to do.

## Answer The Twelve Questions

The study plan is the answers to these questions, written before the first run that counts. At `check` rigor the plan answers 1, 3, 4, 5 and 10; at `study` and `publication`, all twelve. Judging someone else's study applies the same twelve to it.

| # | Question | What a good answer holds |
| --- | --- | --- |
| 1 | **The claim** | One sentence, without jargon, naming the quantity, the comparison and the scope |
| 2 | **Who uses it** | Who acts on the result, and what changes under each outcome |
| 3 | **The prediction** | The primary metric, named now; the smallest effect worth detecting and the power to detect it; the result that counts as failure |
| 4 | **Compared to what** | How it is done today; the baseline and a trivial baseline (a do-nothing agent, a constant answer); the tuning and compute each arm gets |
| 5 | **The unit and the count** | What one observation is; where its variation comes from (tasks, runs, prompts, seeds); how many; what fixed the number; the stopping rule |
| 6 | **Validity** | Why the measure tracks the claim: an oracle scores full and a do-nothing arm near zero before any result is read; a judge has its validation record ([measurement](measurement.md)) |
| 7 | **Reliability** | The noise floor, measured on a frozen pilot; seeds and other randomness controls |
| 8 | **Raw outputs first** | Which raw outputs you will read before computing any metric |
| 9 | **Rival explanations** | For each, the check that separates it from the claim; the analysis path itself is one |
| 10 | **The interval** | Its method, the variation it covers, its assumptions; for a comparison, the interval on the paired difference; whether a number is one run, a mean, or a best of N |
| 11 | **Fixed before the data** | Who has seen how much data; which choices are fixed (hypotheses, analysis, exclusions including refused or malformed outputs, prompts, tuning and its split); everything else is exploratory |
| 12 | **Where it holds** | The conditions covered, and one where it should fail; the exact model snapshot and access date; every planned outcome reported |

A rule that hides a search is not fixed: "stop when p < 0.05" fixes nothing. A plan that cannot fail tests nothing; question 3's failure result is the plan's most important line.

## Name The Claim Class

Name the strongest claim the result must support before building anything, and report the strongest one it reached, never a stronger one. Each class reaches a level on the [evidence scale](../SKILL.md#the-evidence-scale):

| Claim | Minimum evidence | Level | Not enough |
| --- | --- | --- | --- |
| **Can do X** | One complete run that shows X, with its raw output | L3 | — |
| **Does X at a rate, here** | Pass, fail and unavailable counts per item and trial, with the item and trial counts and an interval | L3 | One run |
| **A beats B, here** | Paired runs of both arms on the same items, and a decision rule and size fixed before the data | L4 | Fewer items than planned; unpaired runs; a rule chosen after seeing results |
| **Holds generally** | The comparison replicated across independent models, tasks, groups or sources | L5 | One setting, however large |

"The candidate found the defect in 69 of 90 reviews, the baseline in 42" is a count. "The candidate is better" needs the rule.

## Fix The Decision Rule First

The decision rule turns the data into a verdict, and it is written into the plan's Hypotheses before the data exists. It names:

- the metric, and which direction is better;
- the arms, the reference first;
- the unit the test runs over, and how repeated trials of one unit combine (usually averaged per unit, since trials of one item are repeated draws of one question);
- the test and its level, and the minimum number of decided units;
- what each outcome licenses: the claim, its opposite, and "no difference shown".

For paired pass or fail outcomes, the exact McNemar test on the discordant items (`stats.mjs paired mcnemar`); for paired scores, the paired difference with its interval, or a sign-flip permutation for few items. A rule written after seeing results is not a decision rule: amend the plan and the hypothesis it changes becomes exploratory, which `study.mjs amend` records and the register's validation enforces.

Several planned comparisons share the error rate: name them in the plan and correct them with Holm (`stats.mjs correct holm`). A comparison the plan does not name is exploratory, uncorrected, and at most L3.

## Compare Against Fair Baselines

- **A trivial baseline** shows what the measure gives for nothing: a do-nothing agent, a constant answer, the majority class. A method that barely beats it has not shown much.
- **Equal budgets.** For a confirmatory comparison, every arm gets the same tuning effort and compute budget. Standards ask only that tuning be disclosed; this rule is stricter because unequal tuning alone has reversed published rankings.
- **The same conditions.** Run the arms in the same batch, on the same items, in an order that does not favor one.

## Size To The Decision

- **Few trials show little.** Three passes in three trials is consistent with a true rate near 0.3: the exact two-sided 95% lower bound is about 0.29 (`stats.mjs interval`, method `exact-binomial`).
- **pass^k and pass@k diverge.** At 75% per trial, all three of three succeed about 42% of the time and at least one about 98%. Report pass^k for behavior relied on every time; pass@k fits only when a retry or a checker stands between the result and its user (`stats.mjs passk`).
- **Items set what a comparison can detect.** Compute the count before running (`stats.mjs power mcnemar-cases` or `power paired-cases`). A 20-point difference at 80% power needs roughly 62 to 93 items per arm, depending on the base rate; a pilot of 20 or 30 detects only large effects, and says so.
- **More items beat more trials.** Past a few trials per item, extra trials narrow the result little; extra items narrow it more.
- **Items that share a source are not independent.** Count the families as well as the items, spread items across families, and analyze with clusters (`stats.mjs interval clustered` or `interval bootstrap` with clusters).
- **Keep the subject's settings.** Lowering temperature or effort to cut variance changes the subject; do it only when that setting is the question.
- **Fix the count before the run.** Adding trials or items until a result looks right is selection. A sequential or adaptive schedule is valid only when the plan declares it, rule and maximum included.

## Pilot, Then Lock

A pilot checks that the instrument works: the oracle scores full, the do-nothing arm scores near zero, the outputs can be read, and the cost per run is known. Run it before the lock; its receipts are marked as before the lock and are not evidence for the claim. Use it to measure the noise floor (Measure The Noise Floor, below) and to size the study, never to choose the hypothesis it then confirms.

Lock the plan when the twelve answers are written and the user has agreed them: the lock is the user's decision at `study` and `publication` rigor, recorded as a decision Checkpoint through [Track Work](../../track-work/SKILL.md), and `study.mjs lock --by` names who locked it ([running](running.md)).

## Measure The Noise Floor

The same configuration run twice gives different results. A difference smaller than that swing, between two single runs, is not a result.

- Run identical arms (an A/A comparison) on a frozen pilot; the gap it shows is the floor a real difference must clear.
- Pool every run of one configuration on the same items, and compare a later arm with all of them, not the most favorable. A changed item or check starts a new series.

## Keep Capability And Regression Studies Apart

- A **capability** study asks what does not yet work reliably. It should start with a low pass rate, so a change has room to show. One where every arm passes nearly every item is saturated: add harder items, or move it to regression.
- A **regression** study guards what works and should sit near 100%. Read it per item: a test over many items moves only when many got worse, so a few broken items show in the counts first.
- A check that passes in every arm and every trial does not separate the arms. Replace it in a capability study; keep it in a regression study only if it guards something that could break.

## Hold Items Out

- Fix the split before any item is built or run, by a stable rule such as every third item in hash order.
- Tune against the tuning items only. Report held-out items separately, and never tune against them.
- Never report the score of a set you selected on: choosing the best of several candidates by their held-out score makes that score optimistic.
- Items written by the author of what is under test, or by the model under test, are not independent of it.
- Keep held-out answers in a private repository or as hashes, so they do not leak into training data or prompts.

## Separate Rival Explanations

For each explanation other than the claim, name the check that would tell them apart, and run it: a placebo arm, a shuffled label, the same change on a task where it should not matter, a second model. The analysis path is a rival too: if a different reasonable analysis would change the answer, report both, or fix the analysis in the plan before seeing data.

## The Quick Check

For one reversible decision ("did my prompt change help?"): a `check`-rigor plan answering questions 1, 3, 4, 5 and 10; about 20 tasks, both arms on each; one trial per arm unless the noise floor says otherwise; the paired result with its interval. Lock it before running when the answer should count as a comparison (L4 at that boundary); unlocked, it is an observation (L3). Say what the interval rules out: 20 tasks detect only a large effect.
