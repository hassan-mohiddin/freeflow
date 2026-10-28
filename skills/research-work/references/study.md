# Study

This reference is judgment about designing and running a study: adapt it to the question and to the decision the result must support. Its binding parts are the Rules in [Research Work](../SKILL.md#rules) and the formats `study.mjs` writes and enforces, a contract in [artifacts](artifacts.md): the [study plan](artifacts.md#study-plan), the [run ledger](artifacts.md#run-ledger) and the [deviation log](artifacts.md#deviation-log).

Goal: a plan, written and locked before any data exists, whose result can only come out one of a few ways, each of which tells the reader what to do; and a record in which every number traces to a command that produced it, under the plan that was locked, with nothing that went wrong missing.

## Answer The Twelve Questions

The study plan is the answers to these questions, written before the first run that counts. At `check` rigor the plan answers 1, 3, 4, 5 and 10; at `study` and `publication`, all twelve. Judging someone else's study applies the same twelve to it.

| # | Question | What a good answer holds |
| --- | --- | --- |
| 1 | **The claim** | One sentence, without jargon, naming the quantity, the comparison and the scope |
| 2 | **Who uses it** | Who acts on the result, and what changes under each outcome |
| 3 | **The prediction** | The primary metric, named now; the smallest effect worth detecting and the power to detect it; the result that counts as failure |
| 4 | **Compared to what** | How it is done today; the baseline and a trivial baseline (a do-nothing agent, a constant answer); the tuning and compute each arm gets |
| 5 | **The unit and the count** | What one observation is; where its variation comes from (tasks, runs, prompts, seeds); how many; what fixed the number; the stopping rule |
| 6 | **Validity** | Why the measure tracks the claim: an oracle scores full and a do-nothing arm near zero before any result is read; a judge has its validation record ([measurement](measurement.md)). For each check, its tolerance and one rule for what its failure does: stop, or make named verdicts undecided |
| 7 | **Reliability** | The noise floor, measured on a frozen pilot; seeds and other randomness controls |
| 8 | **Raw outputs first** | Which raw outputs you will read before computing any metric |
| 9 | **Rival explanations** | For each, the check that separates it from the claim; the analysis path itself is one |
| 10 | **The interval** | Its method, the variation it covers, its assumptions; for a comparison, the interval on the paired difference; whether a number is one run, a mean, or a best of N |
| 11 | **Fixed before the data** | Who has seen how much data; which choices are fixed (hypotheses, analysis, exclusions including refused or malformed outputs, prompts, tuning and its split); everything else is exploratory |
| 12 | **Where it holds** | The conditions covered, and one where it should fail; the exact model snapshot and access date; every planned outcome reported |

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
- the test and its level, and the minimum number of decided units;
- what each outcome licenses: the claim, its opposite, "no difference shown", and "undecided" when fewer units are decided than the minimum. An undecided claim stays confirmatory in the register, its result stated as undecided at L2 (a computed status, not a comparison); it supports neither the claim nor "no difference".

For paired pass or fail outcomes, the exact McNemar test on the discordant items (`stats.mjs paired mcnemar`); for paired scores, the paired difference with its interval, or a sign-flip permutation for few items. A rule written after seeing results is not a decision rule: amend the plan and the hypothesis it changes becomes exploratory, which `study.mjs amend` records and the register's validation enforces.

Several planned comparisons share the error rate: name them in the plan and correct them with Holm (`stats.mjs correct holm`). A comparison the plan does not name is exploratory, uncorrected, and at most L3.

## Compare Against Fair Baselines

- **A trivial baseline** shows what the measure gives for nothing: a do-nothing agent, a constant answer, the majority class. A method that barely beats it has not shown much.
- **Equal budgets.** For a confirmatory comparison, every arm gets the same tuning effort and compute budget. Standards ask only that tuning be disclosed; this rule is stricter because unequal tuning alone has reversed published rankings.
- **The same conditions.** Run the arms in the same batch, on the same items, in an order that does not favor one.

## Size To The Decision

- **Few trials show little.** Three passes in three trials is consistent with a true rate near 0.3: the exact two-sided 95% lower bound is about 0.29 (`stats.mjs interval`, method `exact-binomial`).
- **pass^k and pass@k diverge.** At 75% per trial, all three of three succeed about 42% of the time and at least one about 98%. Report pass^k for behavior relied on every time; pass@k fits only when a retry or a checker stands between the result and its user (`stats.mjs passk`).
- **Items set what a comparison can detect.** Compute the count before running (`stats.mjs power mcnemar-cases` or `power paired-cases`) and state it in question 3; the plan's validation refuses a confirmatory hypothesis whose plan states no power computation (its numbers, or the `stats.mjs power` command that gave them) or why none applies. A 20-point difference at 80% power needs roughly 62 to 93 items per arm, depending on the base rate; a pilot of 20 or 30 detects only large effects, and says so.
- **More items beat more trials.** Past a few trials per item, extra trials narrow the result little; extra items narrow it more.
- **Items that share a source are not independent.** Count the families as well as the items, spread items across families, and analyze with clusters (`stats.mjs interval clustered` or `interval bootstrap` with clusters; for pass or fail values with few clusters, `interval clustered-bayes`, since the cluster-robust interval undercovers there).
- **Keep the subject's settings.** Lowering temperature or effort to cut variance changes the subject; do it only when that setting is the question.
- **Fix the count before the run.** Adding trials or items until a result looks right is selection. A sequential or adaptive schedule is valid only when the plan declares it, rule and maximum included.

## When The Quantity Is Computed

Some studies compute their quantity instead of sampling it: an interval's coverage summed over every outcome, an error rate by enumeration, a property of an algorithm over a grid. There is no sampling error, so no test, interval or power calculation applies. The decision rule is a threshold on the computed value, with its margin fixed in the plan, and the plan states the numerical error in its place: the gap to a finer grid, or a simulation's agreement with the exact value, each with a tolerance. Validity checks still apply, and an oracle with a known answer (an interval guaranteed to cover) is the strongest. A computed value under a stated model is L2, a plain fact within that model; a comparison of computed values whose rule the locked plan fixed is L4 at its boundary.

## Pilot, Then Lock

A pilot checks that the instrument works: the oracle scores full, the do-nothing arm scores near zero, the outputs can be read, and the cost per run is known. A pilot check covers the units the study will judge, or the plan says which it covered and what that leaves untested. Run it before the lock; its receipts are marked as before the lock and are not evidence for the claim. Use it to measure the noise floor (Measure The Noise Floor, below) and to size the study, never to choose the hypothesis it then confirms. The scripts cannot see whether a pilot shaped a hypothesis, so question 11 says what the pilot showed and who saw it, and a hypothesis written after seeing a pilot's result is exploratory.

Lock the plan when the twelve answers are written and the user has agreed them: the lock is the user's decision at `study` and `publication` rigor, recorded as a decision Checkpoint through [Track Work](../../track-work/SKILL.md), and `study.mjs lock --by` names who locked it ([running](#running-the-study)).

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

For each explanation other than the claim, name the check that would tell them apart, and run it: a placebo arm, a shuffled label, the same change on a task where it should not matter, a second model. The analysis path is a rival too: if a different reasonable analysis would change the answer, report both, or fix the analysis in the plan before seeing data.

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
- **Derived steps get receipts too, without a unit:** combining per-unit outputs, the validity checks that read study outputs, the verdicts. The order is the planned runs, then the validity checks on their outputs, then the verdicts; a verdict computed before its validity check is read before the measure is known to work.
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

Run `study.mjs check` before the analysis. It refuses a plan that changed since its lock, an uncleared deviation, and a planned trial (each trial number up to the plan's count, run with `--trial`) with neither a receipt nor a cleared deviation covering it. It does not read the exit code of a derived step: a validity check that failed holds the analysis only once you log it as a deviation. Then compute every statistic with `stats.mjs` as the plan's decision rule says, register each claim with its numbers and the result file they come from, and run the checks in [Research Work](../SKILL.md#check-the-report), with `--plan` and `--results`.
