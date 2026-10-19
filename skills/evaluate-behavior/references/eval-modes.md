# Eval Modes

Read this before using any mode other than a plain comparison, and before a batch whose cost matters.

This reference is judgment: adapt it to the question being answered. Its binding statements restate [Evaluate Behavior](../SKILL.md) Rules or the [definition schema](evaluation-definition-schema.md), which owns every field named here.

Each mode is a group shape; modes combine, such as a coding task judged by a rubric, or a pipeline whose final stage runs hidden tests. Choose the mode by where the behavior happens in practice, then keep the comparison as small as the question allows.

## Compare Arms

- **Answers:** does the component change behavior on this task?
- **Declare:** `arms`, the `reference` when it is not `baseline`, and `component`; expectations that share a comparison ID, one per arm; for a "beats" claim, a suite `decision` naming the measure, the two arms and the direction.
- **Yields:** each arm's run and grade, factual transitions from the reference, per-trial pairs and pass^k in an aggregate, run metrics per arm with paired differences, and the decision's verdict.
- **Pitfalls:** every added arm adds subjects, and a decision compares only the two arms it names, so pick that pair before the run. Picking the best of several candidates on the same cases selects on noise; confirm the winner on held-out cases ([Measurement](measurement.md)).

## Noise Check

- **Answers:** how much do runs of one unchanged setup differ?
- **Declare:** `component: []` and two or more identical arms.
- **Yields:** transitions and pairs between arms that cannot differ in setup; any gap is run-to-run variation, the floor a real difference must clear.
- **Pitfalls:** run it in the same batch and on the same cases as the comparison it calibrates. One noise check is itself noisy; a repeat of the reference as an extra arm in the comparison group gives the floor without a separate batch.

## Measure

- **Answers:** how well does one setup do on this suite? Use it to record a baseline you will compare against later, to score a benchmark, or to check that a setup still passes what it passed before.
- **Declare:** `arms` with a single arm, which is its own reference; no `component`, or `component: []`; and no expectation with a `comparison`.
- **Yields:** checks with pass^k over trials, run metrics, judged scores from `review --rubric`, command graders and reference checks as usual; the aggregate's claim is a rate on this suite.
- **Pitfalls:**
  - It never supports a comparison claim. A suite `decision` refuses a one-arm group, and a pairwise `review` refuses it; judge it with `--rubric`.
  - Measuring two setups separately and setting their rates side by side is not a comparison: they ran in different batches and conditions. When the question becomes "which is better", run both as arms of one group with a decision rule.
  - A benchmark score is a rate on this suite, with these checks and this setup. It is not readiness.

## Conversation

- **Answers:** does the agent behave well when a user answers back, such as asking for what it needs, or not asking for what it was already told?
- **Declare:** a body group whose `input` is the opening prompt, and `participants` with protocol `conversation`: the simulated user's model, a card holding everything it knows, `max_turns`, and a stop phrase.
- **Yields:** the subject's transcript with every user message, the user's identity and each message's prompt hash, and how the conversation ended: the stop phrase, the turn limit, the subject stopping, or a user error.
- **Grade:** success usually has several parts. Check the end state the conversation should leave with deterministic expectations, read its length from the run metrics, and judge the quality of the interaction with a rubric.
- **Pitfalls:** the simulated user is a model; its card bounds what it may say, and it answers "I don't know" otherwise, but read some conversations before trusting a count. A conversation that hits the turn limit usually means the subject never finished. The user's model and card are part of the task: keep them identical across arms. Each turn costs a user call as well as a subject turn.

## Pipeline

- **Answers:** does a staged workflow produce the right final outcome, such as two independent reviews and an adjudicator, or a coordinator's plan and an executor's change?
- **Declare:** `participants` with protocol `pipeline`: ordered stages, each with its own `input` and `sees` (the fixture, or an earlier stage's response or files), `fresh` for a stage that must not see earlier ones, and `graded` for the stage the expectations apply to (the last by default).
- **Yields:** a full run per stage, the graded stage as the arm's run, and every stage's response and files.
- **Compare designs:** arms may differ in `participants` itself when `component` names it, such as one reviewer against two reviews and an adjudicator; an arm without `participants` runs one ordinary subject.
- **Pitfalls:** a stage sees only what `sees` lists, and nothing by default. Every stage uses the arm's configuration, so the component applies to all stages at once; a stage cannot have a configuration of its own, and the stages' different jobs come from their inputs. A stage that fails stops the pipeline. Grading only the final stage hides where an error began; read the earlier stages before naming the failed boundary. Cost grows with the number of stages.

## Coding Task

- **Answers:** does the agent's change work, judged by running it rather than reading it?
- **Declare:** a body group with the repository as its fixture and tools to edit it; `command` expectations whose `argv` runs hidden tests, a linter or a build on a copy of the final workspace, with grader `files` kept outside the fixture and a `pass` rule (an exit code, or named required tests); declared `commands` and `run_command` when the subject should run tests itself; a `reference_solution` proving the task solvable; and a `shell` or a container `environment` only when the task needs `bash`, or a toolchain the host lacks.
- **Grade both directions:** tests of the new behavior, which fail on the unchanged fixture and must pass after the change, and the existing tests the change must not break, which pass before and must still pass. Passing only the first rewards a change that breaks something else.
- **Yields:** each command's exit code, output tails and per-test results, with the share of required tests passed as a score; a reference check per group.
- **Pitfalls:**
  - Run `check-tasks` first. It applies the reference solution and runs the graders with no model. A task the reference fails measures the grader, not the agent, and `run` refuses it unless told to skip the check. It also runs the graders on the unchanged fixture, which must fail them; a task already solved measures nothing, and `run` refuses it too. For every group it then lists what the copy lacks against the setting the task came from: Git history (a workspace is never a repository), ignored files the fixture holds (a clone lacks them) or the task names (such as `.env`), and tools or network the task refers to but the subject lacks. Judge each gap before running: give the subject what the task needs, or reword the task.
  - A required test name that matches nothing fails every arm; the reference check catches it.
  - Grader files inside the fixture, or named in the prompt, leak the answer.
  - A subject can make tests pass by editing them. List every test you rely on, existing ones included, in the grader `files`: a grader file replaces whatever the subject left at that path. A `changed-paths` expectation with `excludes` also shows whether the subject touched them.
  - A container image is pinned by digest and never pulled by the evaluator; when it is missing, relay the refusal and ask the user before pulling. In a container environment the subject's `bash` and declared commands run in its own container, and graders in a fresh one from the same image, so all three use the image's toolchain; `check-tasks` runs the reference check's graders in the image too. Declare `network: "none"` when the subject's code must not reach the network, the host's files or the login: it is then refused unless every path that runs that code is confined ([Network](evaluation-definition-schema.md#network)).
  - Grader commands run with the evaluator's host permissions, and run whatever the subject wrote. Run only tasks whose fixture and graders you trust.
  - A subject without a shell runs only the declared commands, which is often enough. A shell needs a host extension that confines it, such as a micro-VM, which the evaluator probes before any subject runs. When the isolation needs software this machine lacks, the group is refused with what is missing and how to install it: relay that refusal to the user and ask before installing anything.

## Judged Evaluation

- **Answers:** what deterministic checks cannot decide, such as whether a review named the defect by location and effect, whether a report's claims rest on its sources, or how actionable an answer is.
- **Declare:** a `rubric` of dimensions, each with a question, its answers (yes, no or unknown, or a 0 to 2 score), and an optional `reference` that only judges see (keep it outside the fixture and the subject's declared context); dimensions are not weighted. Then `judges`, each model and thinking configuration once; and `combine` when there are several, declared before any verdict. A judge runs on the subjects' host setup unless it declares its own configuration, and the setup each judge used is recorded with its verdict. A decision may name a dimension as its measure.
- **Yields:** for each run, every judge's answers with evidence, the combined answer, what the judge saw and what was withheld, and contract gaps such as an unchecked calibration; per arm in an aggregate, answer counts, pass^k, means, agreement between judges, and each judge's calibration.
- **Write the rubric:**
  - One dimension per thing to judge, each with a concrete yes and no, and the evidence a yes needs. "Is the answer good?" is too vague to agree on; an exact phrase is too brittle to be fair.
  - For an open-ended answer, list the key facts or claims a good answer must contain as separate dimensions, and put them in the references.
  - Put a short worked example of a yes and a no in the reference when the question leaves room for reading; examples make judges more consistent, though consistency alone is not accuracy.
  - Each judge answers every dimension in one reply, so answers to one dimension can colour another. Keep the rubric to the dimensions the question needs.
- **Pitfalls:**
  - Check first; judge only what checks cannot answer.
  - A judge of the subject's model family judges its own kind; prefer a different family, and record the relation either way.
  - Repeated calls to one configuration are one vote, not several.
  - An uncalibrated judge's answers are advisory. Label a sample of runs by hand and run `review --calibrate`; a change of model, thinking, extension or rubric makes a new judge to calibrate.
  - Low agreement between judges means the question is unclear; sharpen the question and its reference before counting answers.
  - A judge that sees cut material cannot answer a question about what was cut; raise `--limit`.
  - Pairwise `review` questions remain useful for an advisory side-by-side reading of the arms; they are not a measure.

## Spend Less

Goal: the fewest subject and judge calls that still answer the question.

- **Start from saved evidence.** A complete result that answers the question needs no rerun.
- **Check before running.** `check-tasks` costs no model call. A dry run is not free: it still runs subjects, only without supporting a claim.
- **Run the smallest batch first.** `--pilot <n>` runs the first n groups once and stops before the batch on any failed or invalid run, grade error, or comparison no arm passed; otherwise the batch continues, and with trials the pilot counts as the first trial of its groups. For a closer look, select one group with `--group` and read its result first. The plan line counts the subjects before anything starts, and `--max-cost` stops new subjects at a spend ceiling.
- **Reuse identical runs.** With `--reuse`, an arm whose exact inputs (task, fixture and grader content, effective configuration, skill and context content or commit, model, host version and evaluator) match an indexed complete run takes that run instead of running again, typically an unchanged baseline. Every complete canonical run is indexed, with or without `--reuse`, so an earlier run such as a pilot can count; a run held for transcript flags no one has cleared is never reused. Reused runs are listed as reused. They did not run in the same batch as the fresh arm, so when a claim is close, run every arm fresh.
- **Run in parallel.** `--jobs <n>` runs up to n subjects at once, and `--cpu-jobs <n>` bounds local work such as grader commands. Parallelism saves time, not spend; keep it within what the provider's rate limits and the machine can carry.
- **Use adaptive trials.** A decision's `trials` schedule starts every case at `initial` trials and adds `step` more only to cases whose sign is not yet stable, up to `max`, instead of running every case at the maximum.
- **Economize judges.** Grade deterministically first and judge only what is left. Use `--swap-sample` once order effects are known to be rare. Keep each judge's view as large as its question needs and no larger. Calibrate once per judge configuration; the calibration is kept while the configuration stays the same. A cheaper judge that calibrates well is a valid choice.
- **Spend trials where a miss costs most,** such as more trials for known-defect cases than for clean ones ([Measurement](measurement.md)).
