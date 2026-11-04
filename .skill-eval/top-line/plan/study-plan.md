# Study Plan: Top-line suite v1: Freeflow against plain Claude Code

> **Type:** Study Plan
> **Status:** Draft
> **Owner:** Hassan Mohiddin
> **Rigor:** study

## 1. The claim

Freeflow's own claim (the map's Evals section): on real coding tasks, Claude Code with Freeflow gets better results than plain Claude Code with the same model, at a total cost that is not higher, and the more so the longer the task. Suite v1 tests it on 20 tasks taken from Freeflow's own merged pull requests.

## 2. Who uses it

Hassan, deciding what Freeflow's next work should be and whether its overhead pays for itself; later, Freeflow's users reading its README's claim. The smoke subset (5 of the tasks) is the regression check Freeflow's contributors run when a skill, hook, prompt or driver changes.

## 3. The prediction

The primary metric is success per task: whether every trial's held-back tests all pass (pass^3), compared by exact McNemar. predictions-v1.md holds the predictions, written before any run: no success difference on one-Slice fixes, higher success with Freeflow on long tasks, and a higher list-price cost for Freeflow on fixes. The smallest effect worth detecting is Freeflow alone solving 5 of 20 tasks that plain does not, against 1 of 20 the other way. Power: `stats.mjs power mcnemar` at n 20, armOnly 0.25, referenceOnly 0.05 gives 0.196; `power mcnemar-cases` gives 61 tasks for 80% power at that effect. Suite v1 detects only a large effect on success, and is sized by what Freeflow's merged pull requests give with tests the agent cannot see and by the run budget; the paired bootstrap on cost, time and the test score (the share of held-back tests passed) adds resolution per task.

## 4. Compared to what

Today: plain Claude Code, headless (`claude -p`), with Haiku 5.5 at effort xhigh and no plugin, in a clean configuration (`--setting-sources ""`). That is the `plain` arm, the reference. The `freeflow` arm is the same command, model, effort, tools, container, simulated user and turn cap, plus the Freeflow package built from commit ff2b4d9b (main 0c6da0e3 merged into this suite's branch) as the session's plugin and a fresh Freeflow store: Freeflow is the component compared, not extra compute. Neither arm is tuned on these tasks. The trivial baseline is the starting commit itself: check-tasks shows every task's tests fail there and pass at its merge.

## 5. The unit and the count

The unit is the task: 20 tasks, each run 3 times per arm, so 120 subject runs. Trials of a task are averaged into pass@1 and pass^3 per arm, never pooled across tasks. Sizes: 6 fixes, 10 features, 4 long tasks (tasks.json).

## 6. Validity

check-tasks, with no model, shows each task's held-back tests fail on its starting commit and pass on its merge, in the suite's own container image. A Freeflow run whose event log holds no line is invalid (the plugin did not run) and never counts; any run with no model turn, no tokens or no answer is invalid. The pilot checks that both arms' shells work in the container (the harness probe) and that Freeflow's event log is written.

## 7. Reliability

Three trials per task and arm; the noise floor is read from the pilot's paired runs before the batch. Variance sources: sampling (not seeded on Claude Code), the simulated user (Haiku 5.5 at low effort, the same card for both arms), Claude Code's version (recorded per run), and run order (subjects run in parallel, interleaved by the evaluator). Prompt wording is fixed in tasks.json.

## 8. Raw outputs first

Every run keeps its transcript, its stream-json events, its workspace, its grader output and, for the Freeflow arm, its event log under the evaluator's canonical results; deterministic grades are read before any judgement of meaning.

## 9. Rival explanations

A Freeflow gain could come from its longer system prompt rather than its workflow: the overhead line of each Freeflow run says how much input Freeflow added, and the ablation ladder (Track Work, gates, Review Work off) separates parts later. A task may be unsolvable for both arms (the held-back tests assert exact wording): those tasks are ties, counted, and marked for retirement after two versions. The simulated user may answer one arm differently: both get the same card, and its turns are counted as interruptions.

## 10. The interval

Success: exact McNemar p over the discordant tasks. Cost, wall time, the test score and interruptions: a paired bootstrap 95% interval of the mean per-task difference, 10,000 resamples, seed 1, from `stats.mjs`'s bootstrapMean as the evaluator calls it.

## 11. Fixed before the data

Fixed in suite-v1.json and here before any run: the tasks, their starting commits and held-back tests, the arms, the model and effort, the five decision rules, the trial count and predictions-v1.md. No pilot has run when this plan is locked; the pilot's result is added as an amendment, and a reference arm passing every pilot unit is reported there as saturation. The tasks were drafted by the build from the merged pull requests' messages and tests, without any run.

## 12. Where it holds

Freeflow's own repository, Claude Code 2.1.318 headless, Haiku 5.5 at xhigh, tasks of one repository's history, a container without network, automatic compaction off (the evaluator's default), so no compaction happens in either arm. Not shown: other projects (Hassan adds them later), Opus, interactive sessions, Freeflow's own compaction, Pi or Codex.

## Hypotheses

| ID | Hypothesis | Kind | Metric | Decision rule | Method |
| --- | --- | --- | --- | --- | --- |
| C1 | Freeflow solves more tasks than plain Claude Code | confirmatory | hidden-tests pass^3 per task | exact McNemar, alpha 0.05, at least 6 discordant tasks, freeflow ahead | paired mcnemar |
| C2 | Freeflow's list-price cost per task is not higher | exploratory | listCost | paired bootstrap 95% interval of the mean difference, lower is better, at least 10 tasks | bootstrap mean |
| C3 | Freeflow's wall time per task is not longer | exploratory | durationMs | paired bootstrap 95% interval, lower is better, at least 10 tasks | bootstrap mean |
| C4 | Freeflow passes a larger share of the held-back tests | exploratory | score.hidden-tests | paired bootstrap 95% interval, higher is better, at least 10 tasks | bootstrap mean |
| C5 | Freeflow needs the user no more often | exploratory | interruptions | paired bootstrap 95% interval, lower is better, at least 10 tasks | bootstrap mean |

## Planned runs

| Unit | Arm | Trials | Budget |
| --- | --- | --- | --- |
| 20 tasks | plain | 3 | Claude Code headless, Haiku 5.5 xhigh, read, write, edit, find, grep and bash in the container, the simulated user up to 8 turns, no tuning |
| 20 tasks | freeflow | 3 | Claude Code headless, Haiku 5.5 xhigh, read, write, edit, find, grep and bash in the container, the simulated user up to 8 turns, no tuning |

## Analysis variants

| ID | Variant | What it changes |
| --- | --- | --- |
| V1 | Success as pass@1 above one half | success per task is the majority of trials instead of every trial |
| V2 | Per size | C1 and E1 read separately for fixes, features and long tasks, as predictions-v1.md predicts them |

## Models in the method

| Role | Model | Snapshot | Accessed |
| --- | --- | --- | --- |
| subject | Claude Haiku 5.5 | claude-haiku-5-5 | 2026-11-04 |
| annotator | Claude Haiku 5.5 (the simulated user) | claude-haiku-5-5 | 2026-11-04 |

## Contamination

| Route | Control |
| --- | --- |
| training data | unknown: the pull requests are public on GitHub, some before the model's cutoff |
| prompts and examples | the requests and cards were written from the pull requests' messages; neither holds a test or the solution |
| tuning | none: no prompt or setting was tuned on these tasks |
| tools and web | the workspace is the starting commit's tree with no Git history and no network, so no later commit is reachable |
| grader and harness | the held-back tests sit outside the workspace and are copied in only after the run |

## Amendments

- 2026-11-04, by the coordinator of freeflow/task-001, before any run: The Freeflow arm is built from ff2b4d9b, the suite's branch with main 0c6da0e3 merged in (#159 delegation across sessions, #160 check-return, #161 routing), instead of 83000618, which predates them, so the eval measures Freeflow as it is on main. No hypothesis, rule, metric, task or arm changed; no run had been made. (plan d73357d59f8d)
