# Study: Design, Measurement And Running

This reference is judgment about designing, measuring and running a study: adapt it to the question and to the decision the result must support. Its binding parts are the Rules in [Research Work](../SKILL.md#rules) and its Formats section, a contract that `study.mjs` writes and enforces: the [study plan](#study-plan), the [run ledger](#run-ledger), the [deviation log](#deviation-log) and the [judge validation record](#judge-validation-record), without which the register's validation caps a judged claim.

Goal: a plan, written and locked before any data exists, whose result can only come out one of a few ways, each of which tells the reader what to do; every number it reports measuring what the claim is about, and coming out the same if measured again; and a record in which every number traces to a command that produced it, under the plan that was locked, with nothing that went wrong missing.

## Answer The Twelve Questions

The study plan is the answers to these questions, written before the first run that counts. At `check` rigor the plan answers 1, 3, 4, 5 and 10; at `study` and `publication`, all twelve. Judging someone else's study applies the same twelve to it.

| # | Question | What a good answer holds |
| --- | --- | --- |
| 1 | **The claim** | One sentence, without jargon, naming the quantity, the comparison and the scope |
| 2 | **Who uses it** | Who acts on the result, and what changes under each outcome |
| 3 | **The prediction** | The primary metric, named now; the smallest effect worth detecting and the power to detect it; the result that counts as failure |
| 4 | **Compared to what** | How it is done today; the baseline and a trivial baseline (a do-nothing agent, a constant answer); the tuning and compute each arm gets; the baseline's published number reproduced here, both reported |
| 5 | **The unit and the count** | What one observation is; where its variation comes from (tasks, runs, prompts, seeds); how many; what fixed the number; the stopping rule |
| 6 | **Validity** | Why the measure tracks the claim: an oracle scores full and a do-nothing arm near zero before any result is read; a judge has its validation record ([Judges](#judges)). For each check, its tolerance and one rule for what its failure does: stop, or make named verdicts undecided |
| 7 | **Reliability** | The noise floor, measured on a frozen pilot; each source of variance and how it is controlled: prompt format and wording, seeds and sampling, environment and versions, run order |
| 8 | **Raw outputs first** | Which raw outputs you will read before computing any metric |
| 9 | **Rival explanations** | For each, the check that separates it from the claim; the analysis path itself is one |
| 10 | **The interval** | Its method, the variation it covers, its assumptions; for a comparison, the interval on the paired difference; whether a number is one run, a mean, or a best of N |
| 11 | **Fixed before the data** | Who has seen how much data; which choices are fixed (hypotheses, analysis, exclusions including refused or malformed outputs, prompts, tuning and its split); everything else is exploratory |
| 12 | **Where it holds** | The conditions covered, and one where it should fail; the exact model snapshot and access date, in the `## Models in the method` table for every model that judges, annotates, generates or is studied; every planned outcome reported |

A rule that hides a search is not fixed: "stop when p < 0.05" fixes nothing, and the plan's validation refuses a rule that stops when a result turns significant unless it names a sequential test built for repeated looks. The validation reads the wording, so it catches the usual ways of writing such a rule, not every one; read the rule yourself too. A plan that cannot fail tests nothing; question 3's failure result is the plan's most important line.

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
- the test and its level, and the minimum number of decided units; and in the Hypotheses' `Method` column, the `stats.mjs` family and method that computes it (`paired mcnemar`), followed by the correction applied to it when several comparisons share the error rate (`paired mcnemar; correct holm`), or `computed: <how>` for a quantity computed another way. Compute the verdict through a receipt (`study.mjs run --output <result.json> -- node stats.mjs <family> --input <in.json> --out <result.json>`): every `stats.mjs` result records `computed_by`, and the register's validation with `--plan` refuses a confirmatory verdict whose result file (the one holding the claim's numbers) was computed by another method (under a corrected rule, by anything but the correction) or written by no receipt of the locked study that ran `stats.mjs`. Name the Method before the runs that count: adding one by amendment after them changes the hypothesis, which then is exploratory;
- what each outcome licenses: the claim, its opposite, "no difference shown", and "undecided" when fewer units are decided than the minimum. An undecided claim stays confirmatory in the register, its result stated as undecided at L2 (a computed status, not a comparison); it supports neither the claim nor "no difference".

For paired pass or fail outcomes, the exact McNemar test on the discordant items (`stats.mjs paired mcnemar`); for paired scores, the paired difference with its interval, or a sign-flip permutation for few items. A rule written after seeing results is not a decision rule: amend the plan and the hypothesis it changes becomes exploratory, which `study.mjs amend` records and the register's validation enforces.

Several planned comparisons share the error rate: name them in the plan and correct them with Holm (`stats.mjs correct holm`). A comparison the plan does not name is exploratory, uncorrected, and at most L3.

## Compare Against Fair Baselines

- **A trivial baseline** shows what the measure gives for nothing: a do-nothing agent, a constant answer, the majority class. A method that barely beats it has not shown much.
- **Equal budgets.** For a confirmatory comparison, every arm gets the same tuning effort and compute budget. Standards ask only that tuning be disclosed; this rule is stricter because unequal tuning alone has reversed published rankings. Write each arm's budget in Planned runs' `Budget` column, mark a do-nothing or oracle arm `control`, and an arm outside the comparison (a baseline at its published settings) `not compared: <why>`; the plan's validation refuses a confirmatory plan whose other arms' budgets differ.
- **A baseline as strong as published.** Reproduce the baseline's published number in your setup before comparing, and report both; a baseline that runs below its published number makes any method look better.
- **The same conditions.** Run the arms in the same batch, on the same items, in an order that does not favor one.

## Size To The Decision

- **Few trials show little.** Three passes in three trials is consistent with a true rate near 0.3: the exact two-sided 95% lower bound is about 0.29 (`stats.mjs interval`, method `exact-binomial`).
- **pass^k and pass@k diverge.** At 75% per trial, all three of three succeed about 42% of the time and at least one about 98%. Report pass^k for behavior relied on every time, with its interval (`passk task-interval`, or `suite-interval` over tasks); pass@k fits only when a retry or a checker stands between the result and its user (`stats.mjs passk`).
- **Items set what a comparison can detect.** Compute the count before running (`stats.mjs power mcnemar-cases` or `power paired-cases`) and state it in question 3; the plan's validation refuses a confirmatory hypothesis whose plan states no power computation (its numbers, or the `stats.mjs power` command that gave them) or why none applies. A 20-point difference at 80% power needs roughly 62 to 93 items per arm, depending on the base rate; a pilot of 20 or 30 detects only large effects, and says so.
- **Report every seed, aggregated.** With a few seeds per method on several tasks, report the interquartile mean over all runs (`stats.mjs aggregate iqm`), with its stratified bootstrap interval: an outlying run moves it less than the mean, and on few tasks it is less noisy than the median. Report also the probability that one method beats the other (`aggregate improvement`). The mean and median are of the per-task means; the optimality gap's `target` is 1 unless the scores use another scale. With fewer than 5 runs in a task the interval is unreliable, and the result warns. Never report the best seeds alone.
- **More items beat more trials.** Past a few trials per item, extra trials narrow the result little; extra items narrow it more.
- **Items that share a source are not independent.** Count the families as well as the items, spread items across families, and analyze with clusters (`stats.mjs interval clustered` or `interval bootstrap` with clusters; for pass or fail values with few clusters, `interval clustered-bayes`, since the cluster-robust interval undercovers there).
- **Keep the subject's settings.** Lowering temperature or effort to cut variance changes the subject; do it only when that setting is the question.
- **Fix the count before the run.** Adding trials or items until a result looks right is selection. A sequential or adaptive schedule is valid only when the plan declares it, rule and maximum included.

## When The Quantity Is Computed

Some studies compute their quantity instead of sampling it: an interval's coverage summed over every outcome, an error rate by enumeration, a property of an algorithm over a grid. There is no sampling error, so no test, interval or power calculation applies. The decision rule is a threshold on the computed value, with its margin fixed in the plan, and the plan states the numerical error in its place: the gap to a finer grid, or a simulation's agreement with the exact value, each with a tolerance. Validity checks still apply, and an oracle with a known answer (an interval guaranteed to cover) is the strongest. A computed value under a stated model is L2, a plain fact within that model; a comparison of computed values whose rule the locked plan fixed is L4 at its boundary.

## Close The Routes Contamination Takes

A model can score well because it has seen the answers. Record in the plan's `## Contamination` table how each route is controlled, or `unknown`: `training data` (the items or their answers published before the model's cutoff), `prompts and examples` (a test item or its answer in a prompt or a few-shot example), `tuning` (prompts or settings tuned on the items that score them), `tools and web` (a tool, search or file the arm can reach that holds the answer), `grader and harness` (an expected answer or a hint in what the harness or grader shows the arm). A route left `unknown` is a limit the report states.

Nothing an arm, a worker or a judge receives states the prediction or the answer the study expects, beyond the reference a judge scores against: text that does is a deviation. A prompt that leans toward an answer moves a model's verdict.

## Pilot, Then Lock

A pilot checks that the instrument works: the oracle scores full, the do-nothing arm scores near zero, the outputs can be read, and the cost per run is known. A pilot check covers the units the study will judge, or the plan says which it covered and what that leaves untested. Run it before the lock ([Lock, Then Run](#lock-then-run)). Use it to measure the noise floor (Measure The Noise Floor, below) and to size the study, never to choose the hypothesis it then confirms. The scripts cannot see whether a pilot shaped a hypothesis, so question 11 says what the pilot showed and who saw it, and a hypothesis written after seeing a pilot's result is exploratory.

Write the pilot's result in question 11 as one line, the reference arm first: `Pilot result: <arm> <passed> of <units>, <arm> <passed> of <units>`. A study whose reference arm already passes every pilot unit has no room to show a gain, and ends undecided at the ceiling, so `study.mjs lock` refuses it: harden or add units, make it a regression study ([Keep Capability And Regression Studies Apart](#keep-capability-and-regression-studies-apart)), or lock with `--saturated "<why it should run anyway>"`, which the lock records.

A study with human participants (people you recruit to rate, answer or be observed) stops for the user and their institution's ethics process before any data is collected; Research Work does not decide consent or ethics approval.

Lock the plan when the twelve answers are written and the user has agreed them. The plan's open choices (the claim sought, each decision rule and its method, the arms and their budgets, the count) go in the task's decision list as the brief's do ([evidence](evidence.md#agree-it)), so the agreement shows them. The lock is the user's decision at `study` and `publication` rigor, recorded as an agreement update in their words through [Track Work](../../track-work/SKILL.md), and `study.mjs lock --by` names who locked it ([running](#running-the-study)).

## Measure The Noise Floor

The same configuration run twice gives different results. A difference smaller than that swing, between two single runs, is not a result.

- Run identical arms (an A/A comparison) on a frozen pilot; the gap it shows is the floor a real difference must clear.
- Pool every run of one configuration on the same items, and compare a later arm with all of them, not the most favorable. A changed item or check starts a new series.

## Keep Capability And Regression Studies Apart

- A **capability** study asks what does not yet work reliably. It should start with a low pass rate, so a change has room to show. One where every arm passes nearly every item is saturated: add harder items, or move it to regression.
- A **regression** study guards what works and should sit near 100%. Read it per item: a test over many items moves only when many got worse, so a few broken items show in the counts first.
- A check that passes in every arm and every trial does not separate the arms. Replace it in a capability study; keep it in a regression study only if it guards something that could break.

## Hold Items Out

- Fix the split before any item is built or run, by a stable rule such as every third item in hash order, and mark it in the plan's Planned runs (`Split`: `tuning` or `held-out`). Each receipt records its split, and `study.mjs check` refuses a held-out run made before the lock.
- Tune against the tuning items only. Report held-out items separately, and never tune against them.
- Never report the score of a set you selected on: choosing the best of several candidates by their held-out score makes that score optimistic. Improving a prompt or a method from earlier runs makes those runs' items tuning items; only items nothing was tuned on can support a confirmatory claim.
- Items written by the author of what is under test, or by the model under test, are not independent of it.
- Keep held-out answers in a private repository or as hashes, so they do not leak into training data or prompts.

## Separate Rival Explanations

For each explanation other than the claim, name the check that would tell them apart, and run it: a placebo arm, a shuffled label, the same change on a task where it should not matter, a second model. The analysis path is a rival too: if a different reasonable analysis would change the answer, report both, or fix the analysis in the plan before seeing data. List each other analysis you will run in the plan's `## Analysis variants` table (V1, V2, …); report each in a register row that names it as `variant V2`. The lock records the variants, and register validation with `--plan` refuses one that no row names, even after an amendment removed it.

## Validity: Does The Measure Track The Claim?

A measure is a proxy for the thing the claim is about. Before reading any result, show it can tell the cases apart:

- **An oracle scores full.** The reference solution, a gold answer, or a known-good run passes every check.
- **A do-nothing arm scores near zero.** An empty answer, a constant output, or an agent that does nothing fails. A measure a do-nothing arm passes is measuring the task's leniency.
- **A measure a trivial answer maxes out needs its cost beside it.** An interval covering everything has full coverage, and a reviewer that flags everything finds every defect: report coverage with width, detection with false rejection, and include the trivial answer as a control.
- **Stable under refinement.** A result computed on a grid or by simulation should not move on a finer grid or with more draws: check it at a tolerance fixed in the plan.
- **Controls where the right answer is no.** A check that stands in for a meaning (a regex, "the answer names the right file and line") needs runs where the meaning is absent. In one review study, a check that a review named the seeded line "found" the seed in 30% to 46% of reviews of the clean version, because seeds sit where reviewers comment anyway. A check that fires on its controls cannot measure detection: use it as a filter, or ask a validated judge.

## Make Tasks Fair

A task is fair when an agent or method that does the job correctly passes, and one that does not, fails.

- Everything a check requires is stated in the task or follows from it. A check that expects a name the task never gives fails a correct answer.
- Two people who know the domain would give each output the same grade. When they would not, sharpen the task or the check before running.
- Passing requires doing the job, not a shortcut around the check.
- An arm that fails an item in every one of many trials usually has a broken item or check. Read its outputs, and run the reference solution, before blaming the arm.

Grade each requirement a check covers, not only pass or fail, and note which requirements follow from the task and which only the checker knows; a failure on the second kind says little. For a task with parts, check each part, so a run that does most of the task reads differently from one that fails at once. Keep the checks separate; do not combine them into one weighted score.

## Reliability: Would It Repeat?

- Measure the noise floor on a frozen pilot before the study ([Measure The Noise Floor](#measure-the-noise-floor)).
- Record every seed and source of randomness. Resampling in `stats.mjs` takes a `seed` field (1 when omitted) and reports it.
- A judge or rater whose answers change on the same input is part of the noise: measure its agreement with itself, or with other raters (`stats.mjs agreement`).
- **Prompt format is part of the measure.** Wording, order and format alone can move a model's score by tens of points; one study measured up to 76. When the claim is not about one exact prompt, run several formats and report the range: list each format as an analysis variant (`V<n>`) in the plan.
- Pin what can drift ([Pin What Can Drift](#pin-what-can-drift)). A result on "the latest model" is a result on an unknown one.

## Read Raw Outputs Before Counting

Before computing any metric, read a sample of the raw outputs: the failures, and some passes. A failure should look fair: it is clear what went wrong and why. When it does not, the task, the check or the harness is at fault, and the count measures that instead.

- A failed output may hold a valid answer the check did not foresee. Fix the check, then rerun; never adjust the count by hand.
- A passed output may have passed by a shortcut. Fix the check before counting it.
- When a judge and a deterministic check disagree, find which is wrong (the subject, the check or the judge), fix that one, and rerun; never average the two.

## Judges

A model judge's answers are measurements of an instrument whose error is unknown until measured. This section says what any judge needs before its answers count; Review Work's Judge Contract says what to record each time one is used, and Evaluate Behavior's design-and-measurement reference how its evaluator runs and calibrates one. A judge's verdict counts toward a claim only with a judge validation record that passes; without one, a claim resting on the judge is at most L1, and `artifact.mjs validate` refuses more for a register row whose Source cites `judge:<record>`.

The record holds:

- **Agreement with a gold set**: the share of gold items the judge got right, with its Wilson interval (`stats.mjs interval wilson`), and kappa beside it when one answer dominates the gold set (`agreement cohen`, `agreement pabak`; on an ordered scale, `agreement weighted` with `"weights": "quadratic"` for ratings; it defaults to linear). Report the raw agreement beside every kappa: kappa alone hides how often the raters agree. The gold answers come from people, or from an oracle, never from the judge or the model under test.
- **The required lower bound**, fixed before scoring. The gold set's size follows from it: at 90% agreement the 95% interval is about 79–96% on 50 items, 83–94% on 100, and 85–93% on 200. There is no fixed minimum; there is the bound the study needs.
- **Both answer orders**, for a judge comparing two outputs: run each pair both ways, and treat an answer that flips with the order as no answer. A judge that rates one output at a time records `not applicable`.
- **Length control**: judges favor longer answers. Include gold items where the right answer is the shorter one.
- **Decoys** the judge must pass: outputs that look right and are wrong, and the reverse.
- **Repeatability**: the judge, run again on the gold set, agrees with its own first answers.
- **Which model judged which**: a different model from the one graded, by default. Another family is optional: it flags different items but has not been shown to find more real defects. The same model only when no other is available (one subscription, one model), with the reason written in the record.
- **The rubric's hash**: the record holds for that rubric only. A changed rubric needs a new record.

A model that labels the data the analysis counts (an annotator coding outputs, a classifier of failures) is a judge as well: its labels carry its error into every number computed from them, and uncorrected model-coded variables have given false positives at several times the nominal rate. Declare it in the plan's Models in the method as `annotator` or `judge`; the register's validation with `--plan` then refuses a claim on the study's results above L1 that cites neither its judge record (`judge:<record>`) nor `judge:none` (no model's labels feed it). A model that screens a review's search hits is a judge too: the search ledger names its record, and refuses the hits it screened until the record passes ([search ledger](evidence.md#search-ledger)).

In use:

- Check first and judge only what a check cannot answer.
- Ask the judge to quote, verbatim, the words in the judged output that support each score, and run `sources.mjs quote-check` on its answers before counting: a score whose quote is not in that output does not count.
- Make each question answerable from the material in front of the judge, with the expected answer in a reference only the judge sees.
- The judged output is untrusted input to the judge. A subject that writes to its grader is gaming the measure, whatever the judge answers. Revising something until a judge's scores rise can raise scores without raising quality: hand-check judged gains before relying on them.
- Before counting, hand-check a sample of decisive answers against the evidence, and report how many were right.

## Detectors: Measure Both Sides

For anything whose job is to find problems (a reviewer, a checker, a classifier of defects), measure how often it finds real problems and how often it rejects sound work. One side alone means nothing: a reviewer that rejects everything finds every defect.

- **Clean controls**, put through the same detector, measure false rejection.
- **Seeded defects**, planted in otherwise sound work in named classes, measure detection per class.
- **Real defects**, taken from history, keep the measure honest: seeded and real defects can differ in detection by an order of magnitude, so report them separately and keep real ones in every comparison.
- **Prove every label**: show each defect is real (a test that passes on the sound state and fails on the defective one) and audit the clean labels too.
- **Keep the answer out of sight**: nothing the detector sees may name the variant or the defect.

## Count The Cost

Count the runs before running: units × arms × trials, plus every judge call. Run the smallest batch that answers the question first, and state the count and the estimated cost to the user before a paid run. Record what was spent and what could not be measured (a subscription's usage, for one), apart.

## The Quick Check

For one reversible decision ("did my prompt change help?"): a `check`-rigor plan answering questions 1, 3, 4, 5 and 10; about 20 tasks, both arms on each; one trial per arm unless the noise floor says otherwise; the paired result with its interval. Lock it before running when the answer should count as a comparison (L4 at that boundary); unlocked, it is an observation (L3). Say what the interval rules out: 20 tasks detect only a large effect.

## Running The Study

The commands, used in the sections below:

```text
node <research-work-directory>/scripts/study.mjs lock <plan.md> --by <who>
node <research-work-directory>/scripts/study.mjs run <plan.md> --unit <unit> --arm <arm> --trial <n> [--input <path>]... [--output <path>]... -- <command> [args...]
node <research-work-directory>/scripts/study.mjs deviation <plan.md> --what <what> --by <who> [--unit <unit>] [--arm <arm>]
node <research-work-directory>/scripts/study.mjs clear <plan.md> <D-id> --by <who>
node <research-work-directory>/scripts/study.mjs amend <plan.md> --by <who> --reason <why>
node <research-work-directory>/scripts/study.mjs check <plan.md>
```

### Lock, Then Run

- Lock the plan once the user has agreed it, where the user can answer: the agent the user talks to locks it, with `--by` holding who agreed, their words and the date, and who ran the lock. A worker routed a study by another agent cannot hear the user, so it never locks; it runs the plan the lock already holds, and returns a plan that is not locked to whoever routed it. Runs before the lock are pilots: their receipts say so, and they are not evidence for the claim.
- A change to the plan after the lock is an amendment, with its reason. An amendment after study runs exist that adds or changes a hypothesis makes it exploratory; the lock records which, and the register's validation enforces it. Amend before running whenever you can.

### Run Every Step Through A Receipt

Run each command that produces data through `study.mjs run`, with its unit, arm and trial, and declare the files it reads (`--input`) and writes (`--output`) so their hashes are recorded, including code it imports from outside the study folder, such as `<research-work-directory>/scripts/lib/stats.mjs`. A step without a receipt reads as not run.

- **A non-zero exit is data.** A failing test, a refused answer or a crashed agent is an outcome of the study; the receipt records it and the analysis decides what it means, as the plan's question 11 said exclusions would be handled. Never rerun a failure until it passes and keep only the pass.
- **Every attempt stays.** A command that could not start, a run cut short, a run you would rather forget: each has its receipt. The manifest counts only runs that started toward a planned trial.
- **Turn off a harness's own retries,** or record each retry: a harness that retries a failed evaluation until it passes (some do, by default) hides the failures the study must count.
- **Blocked is not zero.** A run that produced no score stays missing in the analysis; never impute a value for it, and say how many there were.
- **Derived steps get receipts too, without a unit:** combining per-unit outputs, the validity checks that read study outputs, the verdicts. Run each validity check with `study.mjs run --validity`, as a command that exits non-zero when the check fails (the oracle does not score full, the do-nothing arm does not score near zero): `study.mjs` reads only the exit code, so a script that prints a failure and exits 0 passes. A failing one logs a deviation that holds `check` until it is cleared with what the plan's question 6 says its failure means, and `check` notes a study with no validity check run. The order is the planned runs, then the validity checks on their outputs, then the verdicts; a verdict computed before its validity check is read before the measure is known to work.
- **One command, one receipt.** A script that runs every arm in one process hides which arm failed. Run per unit and arm when the plan's units are what the analysis counts.
- **Read what a model arm actually received.** When agents are the arms, read the first turns of one transcript per batch, pilots included, before counting anything: an orchestration tool can add its own text to what a worker receives, such as the user's latest message framed as instructions, and a batch started at another moment can receive different text. Text the locked prompts do not hold is a difference in inputs; log it as a deviation for the user, even when both arms received it.

### Keep Raw Data Immutable

- Never edit a raw output. Derived files (a parsed score table, an aggregate) are written by a script from the raw outputs, and that script runs through a receipt too. A file rewritten by a later receipt is that receipt's now; `study.mjs check` refuses a file that no longer matches the last receipt that wrote it.
- Keep raw outputs, including failed and excluded ones, with the study: question 12 promises every planned outcome is reported.
- Results the register cites (`results.json`, a log line) are files the receipts' outputs hash, so a number in the report traces to a command.

### Log Every Deviation

A deviation is anything that departs from the locked plan: a run skipped, an item dropped, a tool upgraded mid-study, a different model snapshot, or a validity check that failed. Log it with `study.mjs deviation` when it happens, one per unit and arm it affects. It holds the analysis until someone clears it with `study.mjs clear --by`, applying what the plan says that failure means.

Who may clear it: you, for a deviation that changes nothing the claim rests on (a rerun after the runner lost its connection before the command started); the user, for anything that changes what the result can claim (an item dropped, a budget cut, a changed model). The log names the clearer either way, so no deviation is cleared unseen.

### What The Records Can And Cannot Show

The lock, the run ledger and the deviation log are plain files. Their checks catch slips: a plan changed without an amendment, a receipt edited, removed or reordered, a result rewritten after its receipt. They cannot stop a deliberate rewrite, such as a lock edited by hand or a ledger recomputed from its first line. Commit them as the study goes, so the repository's history is the audit. When the plan is tracked by git and committed as it stands, `study.mjs lock` and `amend` record the commit that holds it, and `check` refuses a lock whose commit is not in HEAD's history or does not hold the locked plan; a plan git does not track, as in an ignored task folder, is locked without an anchor, and `check` says so.

### Pin What Can Drift

Record the exact model snapshot and the date it was called, dataset and tool versions, and the environment the commands ran in. The receipt records each program's path and hash; record the rest in the plan's question 12 or a deviation when it changes.

### Count And Spend

Before a paid run, give the user the count of runs and calls and the estimated cost, and run only with their yes. Run the pilot first to measure cost per run. Record what was spent and what could not be measured.

### Analyze Only After The Check

Run `study.mjs check` before the analysis. It refuses a plan that changed since its lock, an uncleared deviation, and a planned trial (each trial number up to the plan's count, run with `--trial`) with neither a receipt nor a cleared deviation covering it. It does not read the exit code of a derived step, except a validity check run with `--validity`, whose failure logged its own deviation; any other failed check holds the analysis only once you log it as a deviation. Then compute every statistic with `stats.mjs` as the plan's decision rule says, register each claim with its numbers and the result file they come from, and run the gate in [Research Work](../SKILL.md#check-the-report), which validates the register with `--plan` and traces with `--results` when the plan is in the project.

## Formats

This section is a contract: the files below follow it as written. Every format starts with the [header](evidence.md#header); creating and checking them is in [the formats' commands](evidence.md#formats).

### Study Plan

Written at Design, before the first run that counts; `init study-plan --rigor <rigor>` creates the sections for that rigor. The header adds **Rigor**. Sections, none empty:

| Section | Holds |
| --- | --- |
| `## 1. The claim` … `## 12. Where it holds` | The answers to the twelve questions in [Answer The Twelve Questions](#answer-the-twelve-questions). At `check` rigor only 1, 3, 4, 5 and 10 are required |
| `## Hypotheses` | One table: `ID` (the claim ID the register will use), `Hypothesis`, `Kind` (`confirmatory` or `exploratory`), `Metric`, `Decision rule`, and optionally `Method`: the `stats.mjs` family and method that computes the rule (`paired mcnemar`), followed by any correction applied to it (`paired mcnemar; correct holm`), or `computed: <how>`. A confirmatory row names its metric, rule and, with the column, its method; `-` is allowed only for an exploratory one |
| `## Planned runs` | One table: `Unit`, `Arm`, `Trials` (a whole number of at least 1), then optionally `Split` (`tuning` or `held-out`), then optionally `Budget` (the tuning effort and compute the arm gets; `control` for a do-nothing or oracle arm; `not compared: <why>` for an arm outside the comparison), one row per unit and arm. With a confirmatory hypothesis, every Budget other than those two must be the same |
| `## Analysis variants` | At `study` and `publication` rigor: `none`, or one table, `ID` (`V1`, …, each once), `Variant`, `What it changes`: each other reasonable analysis that will be run and reported. The lock records them, so an amendment cannot drop one unreported |
| `## Models in the method` | At `study` and `publication` rigor: `none`, or one table, `Role` (`judge`, `annotator`, `generator` or `subject`), `Model`, `Snapshot` (the exact version, never `latest`), `Accessed` (`YYYY-MM-DD`, no later than today) |
| `## Contamination` | At `study` and `publication` rigor: one table, `Route`, `Control`, with one row for each of `training data`, `prompts and examples`, `tuning`, `tools and web` and `grader and harness`, and its control or `unknown` ([Close The Routes Contamination Takes](#close-the-routes-contamination-takes)) |
| `## Amendments` | `none`, then one line per amendment, written by `study.mjs amend` |

At `study` and `publication` rigor, a plan with no lock file beside it must have the Models in the method and Contamination sections and the `Method` and `Budget` columns: validation, `study.mjs lock` and `study.mjs check` refuse one without them. A plan already locked before they existed is noted, not refused, and adds them by amendment; Analysis variants stays a note. A Method added after study runs changes its hypothesis, which becomes exploratory, so add it before the runs that count.

`study.mjs lock` writes `<plan>.lock.json` beside the plan: the plan's sha256 (over everything but `## Amendments`), `by` (who agreed, their words and the date, and who ran the lock when that was someone else), when, its hypotheses, and `git`: the commit and path that hold the plan, or the reason it is not anchored; and, when the plan has a `Pilot result:` line, `pilot` (each arm's passed and units) and any `saturated` reason given at the lock; each amendment adds an entry with its hash, who, when, why, and every hypothesis it added or changed after study runs existed, none of which can then be confirmatory. Never edit the lock by hand.

### Run Ledger

`runs.jsonl` beside the plan, one receipt per line, appended by `study.mjs run` and never edited. A receipt holds: `id` (`R1`, …), `unit`, `arm`, `trial`, `split` (from the plan, or null), `validity` (true on a validity check run with `--validity`), `plan_sha256` and `plan_locked` (whether that hash was locked when it ran), `argv`, `cwd`, `program` (the resolved path and its sha256), `inputs` and `outputs` (each path, relative to the plan's folder, with its sha256, or null when absent), `started_at`, `finished_at`, `duration_ms`, `exit_code` (null when the command could not start), `signal`, `error`, the last 2 KB of stdout and stderr, and `prev_sha256`, the sha256 of the line before it (null on the first). The chain makes an edited, removed or reordered line visible: `study.mjs check` reports where it breaks.

### Deviation Log

`deviations.jsonl` beside the plan, appended by `study.mjs deviation` and `study.mjs clear`. A `deviation` line has `id` (`D1`, …), `what`, `unit` and `arm` (or null), `by` (who logged it) and `at`; a `clearance` line has the deviation's `id`, `by` (who cleared it) and `at`. Its lines are hash-chained like the run ledger's. A deviation without a clearance holds `study.mjs check`. A cleared deviation naming a unit (and arm) covers that unit's missing trials.

### Judge Validation Record

One per judge configuration and rubric, made before any of the judge's answers count. The header adds these fields, all filled:

| Field | Holds |
| --- | --- |
| Judge | The model, its version and settings |
| Rubric | The path of the frozen rubric |
| Rubric sha256 | Its sha256, 64 lowercase hex characters |
| Gold items | How many items with known answers it was scored on |
| Agreement | Its agreement with the gold answers, 0 to 1 |
| Interval | `[low, high]` and the method, from `stats.mjs` |
| Required lower bound | The lowest interval bound the study accepts, fixed before scoring |
| Both orders, Length control, Decoys, Repeatability | `passed`, `failed` or `not run`; Both orders may also be `not applicable`, for a judge that rates one output at a time; Repeatability is the judge's agreement with itself on a rerun |
| Judge and graded | `different family`, `different model`, or `same model: <why no other model was available>` |
| Result | `pass` or `fail` |

Result can be `pass` only when the interval's lower bound reaches the required bound and all four controls `passed` (Both orders may be `not applicable`); validation refuses a record that says otherwise. A `## Notes` section says how the gold set was built and what the decoys were.

### Judge Answers

A JSONL file, one answer per line: `item`, `score`, `quote` (the judged output's own words supporting the score, at least four of them) and `output` (the judged output's path, relative to the answers file). `sources.mjs quote-check <answers.jsonl>` refuses an answer with no quote, a quote under four words, or one not found in its output.
