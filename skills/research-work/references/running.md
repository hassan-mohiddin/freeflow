# Running A Study

This reference is judgment about running; what `study.mjs` records and refuses is a contract in [artifacts](artifacts.md#run-ledger).

Goal: every number in the analysis can be traced to a command that produced it, under the plan that was locked, and nothing that went wrong is missing from the record.

```text
node <research-work-directory>/scripts/study.mjs lock <plan.md> --by <who>
node <research-work-directory>/scripts/study.mjs run <plan.md> --unit <unit> --arm <arm> --trial <n> [--input <path>]... [--output <path>]... -- <command> [args...]
node <research-work-directory>/scripts/study.mjs deviation <plan.md> --what <what> --by <who> [--unit <unit>] [--arm <arm>]
node <research-work-directory>/scripts/study.mjs clear <plan.md> <D-id> --by <who>
node <research-work-directory>/scripts/study.mjs amend <plan.md> --by <who> --reason <why>
node <research-work-directory>/scripts/study.mjs check <plan.md>
```

## Lock, Then Run

- Lock the plan once the user has agreed it, where the user can answer: the agent the user talks to locks it, with `--by` holding who agreed, their words and the date, and who ran the lock. A worker routed a study by another agent cannot hear the user, so it never locks; it runs the plan the lock already holds, and returns a plan that is not locked to whoever routed it. Runs before the lock are pilots: their receipts say so, and they are not evidence for the claim.
- A change to the plan after the lock is an amendment, with its reason. An amendment after study runs exist that adds or changes a hypothesis makes it exploratory; the lock records which, and the register's validation enforces it. Amend before running whenever you can.

## Run Every Step Through A Receipt

Run each command that produces data through `study.mjs run`, with its unit, arm and trial, and declare the files it reads (`--input`) and writes (`--output`) so their hashes are recorded, including code it imports from outside the study folder, such as `<research-work-directory>/scripts/lib/stats.mjs`. A step without a receipt reads as not run.

- **A non-zero exit is data.** A failing test, a refused answer or a crashed agent is an outcome of the study; the receipt records it and the analysis decides what it means, as the plan's question 11 said exclusions would be handled. Never rerun a failure until it passes and keep only the pass.
- **Every attempt stays.** A command that could not start, a run cut short, a run you would rather forget: each has its receipt. The manifest counts only runs that started toward a planned trial.
- **Turn off a harness's own retries,** or record each retry: a harness that retries a failed evaluation until it passes (some do, by default) hides the failures the study must count.
- **Blocked is not zero.** A run that produced no score stays missing in the analysis; never impute a value for it, and say how many there were.
- **Derived steps get receipts too, without a unit:** combining per-unit outputs, the validity checks that read study outputs, the verdicts. The order is the planned runs, then the validity checks on their outputs, then the verdicts; a verdict computed before its validity check is read before the measure is known to work.
- **One command, one receipt.** A script that runs every arm in one process hides which arm failed. Run per unit and arm when the plan's units are what the analysis counts.

## Keep Raw Data Immutable

- Never edit a raw output. Derived files (a parsed score table, an aggregate) are written by a script from the raw outputs, and that script runs through a receipt too. A file rewritten by a later receipt is that receipt's now; `study.mjs check` refuses a file that no longer matches the last receipt that wrote it.
- Keep raw outputs, including failed and excluded ones, with the study: question 12 promises every planned outcome is reported.
- Results the register cites (`results.json`, a log line) are files the receipts' outputs hash, so a number in the report traces to a command.

## Log Every Deviation

A deviation is anything that departs from the locked plan: a run skipped, an item dropped, a tool upgraded mid-study, a different model snapshot, or a validity check that failed. Log it with `study.mjs deviation` when it happens, one per unit and arm it affects. It holds the analysis until someone clears it with `study.mjs clear --by`, applying what the plan says that failure means.

Who may clear it: you, for a deviation that changes nothing the claim rests on (a rerun after the runner lost its connection before the command started); the user, for anything that changes what the result can claim (an item dropped, a budget cut, a changed model). The log names the clearer either way, so no deviation is cleared unseen.

## What The Records Can And Cannot Show

The lock, the run ledger and the deviation log are plain files. Their checks catch slips: a plan changed without an amendment, a receipt edited, removed or reordered, a result rewritten after its receipt. They cannot stop a deliberate rewrite, such as a lock edited by hand or a ledger recomputed from its first line. Commit them as the study goes, so the repository's history is the audit.

## Pin What Can Drift

Record the exact model snapshot and the date it was called, dataset and tool versions, and the environment the commands ran in. The receipt records each program's path and hash; record the rest in the plan's question 12 or a deviation when it changes.

## Count And Spend

Before a paid run, give the user the count of runs and calls and the estimated cost, and run only with their yes. Run the pilot first to measure cost per run. Record what was spent and what could not be measured.

## Analyze Only After The Check

Run `study.mjs check` before the analysis. It refuses a plan that changed since its lock, an uncleared deviation, and a planned trial (each trial number up to the plan's count, run with `--trial`) with neither a receipt nor a cleared deviation covering it. It does not read the exit code of a derived step: a validity check that failed holds the analysis only once you log it as a deviation. Then compute every statistic with `stats.mjs` as the plan's decision rule says, register each claim with its numbers and the result file they come from, and run the checks in [Research Work](../SKILL.md#check-the-report), with `--plan` and `--results`.
