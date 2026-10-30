---
name: evaluate-behavior
description: "Use when testing, evaluating or comparing how an agent behaves: whether a skill triggers, whether a change to a prompt, skill, model, setting or extension changes outcomes, measuring a reviewer or checker, or benchmarking agents on coding tasks, conversations or pipelines. Also use when writing or checking an eval's JSON files, running an eval and reading its results, and deciding what a result can claim, how many cases and trials it needs and what it costs."
---

# Evaluate Behavior

Determine whether a declared change to an agent's setup changes its behavior as intended under declared pressure. Evidence outranks confident prose.

A **configuration** is everything that can shape the agent's behavior: host, model, skills, instruction files, and host extensions and settings. A **group** asks one behavioral question by running named **arms** of one configuration on the same task, usually `baseline` (the **reference**: the setup without the change, such as no target skill, the previous commit, or the setting off) and `candidate` (the same setup with exactly the declared change, its **component**); a single arm measures one setup alone. The **subject** is the agent performing the task in one arm. The **evaluator** isolates subjects and preserves canonical evidence; the **deterministic grader** derives fixed facts after the run is saved; a **judge** is a separate model whose answers are **judged evidence**. A **suite** runs ordered groups and may declare a **decision** rule that turns their results into a verdict.

Evaluate Behavior does not change what it evaluates, claim readiness, or choose adoption. The component's owner revises it: [Write Skill](../write-skill/SKILL.md) for a skill or other instruction text; extension code goes to its owner, and a model, setting or extension choice to the user.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

| Situation | Go to |
| --- | --- |
| The question, evidence class, arms, pressure or component; what the result can claim, the decision rule, cases and trials, noise, judge counts, cost | [design and measurement](references/design-and-measurement.md) |
| Measuring a reviewer, checker, or other detector | its [Defect Suites](references/design-and-measurement.md#defect-suites) |
| A Research Work study plan's arms run here: its method, budgets, validity check, contamination and judges | its [Under A Research Work Study Plan](references/design-and-measurement.md#under-a-research-work-study-plan) |
| Writing or checking group, suite, or configuration JSON | [authoring](references/authoring.md) |
| A coding task (hidden tests, declared commands, a shell, a container, network), or the Claude Code host | [coding tasks](references/coding-tasks.md) |
| A conversation, a pipeline, a rubric and judges, or a runtime profile | [conversations, pipelines and judges](references/conversations-pipelines-judges.md) |
| Running the evaluator and reading its results; evidence that conflicts, the failed boundary, a revision target, or rerun scope | [running and evidence](references/running-and-evidence.md), and `skill-eval --help` |
| Reviewing a definition before paying for its runs | Review Work's [Eval Definition Review](../review-work/references/evals-and-judges.md#eval-definition-review) |
| Choosing a judge or relying on its answers | Review Work's [Judge Contract](../review-work/references/evals-and-judges.md#judge-contract) |

## Rules

- Never mutate canonical evidence or erase an unfavorable result. Preserve partial and infrastructure evidence without converting unavailable behavior into pass or fail.
- Never fabricate behavioral evidence. Missing evidence stays unavailable.
- Compare a change only against an exact immutable baseline, such as a commit. If none exists, preserve the current state first (for a skill or instruction text, through Write Skill); never create a baseline by editing what is being evaluated.
- Keep deterministic criteria, grader files, review questions and rubric references out of subject prompts, the fixture and declared subject context.
- Declare every part of the configuration that can change behavior. Ambient installation, settings, or context are not declared composition.
- Claim only what the evidence class observed; one class never proves another.
- Never write that one arm beats another without paired runs on the same cases and a suite `decision` declared before the run; the evaluator reports "beats" only from that rule. Below that, report counts.
- Never cite a run made with `--uncommitted` as evidence. When a run is refused for uncommitted inputs, commit the candidate and the definition, or run with `--uncommitted` for your own checking only; its subjects still run and call models.
- Never change the component under test while evaluating it. Return one measured revision target to its owner.
- After a behavioral change, rerun the complete fixed group with every arm. Never hand-pick an earlier run as the fresh counterpart or rerun only the preferred arm; an earlier run may stand in only through `--reuse`, which matches the arm's exact inputs, and the report names it as reused.
- Judged evidence is its own class. Judge answers are stored apart from run and deterministic grade files, with each judge's identity and calibration status (labelled with its agreement, or not checked; calibrated only with a passing judge validation record), and count toward a claim only through a decision rule declared before the run. They never change run or grade files and never establish readiness.
- Before a run that calls a model, state how many subject and judge calls it makes and what it is estimated to cost, and get the user's yes, unless the task's work agreement already covers that run. A run billed to a subscription spends the user's plan limit, which is a cost too.
- Never ask a measured arm's subject for notes on the guidance under test: asking changes the behavior being measured. Notes belong to a trial.
- Installing anything an eval needs, such as the VM runtime behind a confined shell, is the user's decision. Relay the evaluator's exact refusal and ask before installing; never install silently.
- Never invoke archived evaluators.
- Never clear a run's transcript-scan flag on your own judgment. Show the user the flag and its evidence, and run `skill-eval clear` only with their decision and their reason.

## Design The Smallest Valid Comparison

Goal: the arms differ only in the component, under pressure strong enough to show it, in a run no larger than the claim needs.

Answer from saved evidence or an existing group when they still fit (the same question, pressure, arms and fixed criteria); for a draft-only request, use Write Skill. Do not rerun merely to demonstrate process. Name one behavioral question, its evidence class, and the strongest claim the result must support: can do X, a rate on this suite, or A beats B; readiness is beyond Evaluate Behavior. Activation, first-read body and nearby behavior are questions about skills; for other components, check delivery, behavior and artifact outcome first.

Choose the component:

| Change under test | Component | Baseline |
| --- | --- | --- |
| A new or revised skill | `subject.skills`, `subject.target`, `subject.source` | no target, or the previous commit |
| An instruction or context file | `subject.context` | without the file, or its previous commit |
| A model or thinking level | `model.model`, `model.thinking` | the model in use |
| An extension or plugin, or a host setting | `host.extensions`, `host.settings` | without it, or its current version or value |

The task's fixture and the runtime are shared by every arm and cannot be the component.

Choose the mode by where the behavior happens; modes combine:

- **Compare:** arms run the same task once per trial; the default.
- **Noise check:** `component: []` with identical arms; their gap is the floor a real difference must clear.
- **Measure:** one arm; a rate on this suite, never a comparison.
- **Trial:** one arm on a real task whose subject keeps a friction log; its output is findings to adjudicate, never a rate or a comparison ([Trial A Skill On A Real Task](#trial-a-skill-on-a-real-task)).
- **Conversation:** a simulated user who knows only its card answers back.
- **Pipeline:** ordered stages, each a subject that sees only what it declares.
- **Coding task:** hidden tests or other commands grade the changed repository.
- **Judged evaluation:** judges answer a rubric for each run alone, blind to its arm.

Before subject output exists:

1. fix one behavioral question;
2. fix deterministic expectations, rubric and review questions;
3. preserve the earliest natural prompt or strongest pressure capable of distinguishing behavior;
4. declare each arm's exact identity, and the suite's decision rule when the claim is a comparison;
5. keep prompt or turns, fixture, tools, and every configuration part other than the component fixed, along with the criteria;
6. run one group or an ordered suite;
7. inspect canonical evidence and deterministic facts before judging meaning;
8. classify the failed boundary before proposing revision.

If every arm passes, the pressure may be weak or the baseline already sufficient. If every arm fails, distinguish component, fixture, dependency, environment, host, isolation, and criterion failures before revising anything.

## Trial A Skill On A Real Task

Goal: before a new or changed skill is measured, find where it makes an agent hesitate, guess, backtrack or redo work, cheaply, on work that matters.

- Give one subject a real task the skill serves, with its configuration named, through the evaluator in Measure shape when the task fits a definition, or as a fresh agent briefed with the task otherwise. Keep its transcript.
- Its brief asks for a friction log as it works, in Review Work's [report shape](../review-work/references/work.md#review-items) with `Review type: trial`: each place the skill made it hesitate, guess, backtrack or repeat work, a check that refused correct work or passed wrong work, a step that cost more than it gave, each with the file and line of the skill text or script, what happened, the consequence and the fix it would want. A check that passed wrong work is Blocking.
- A friction log is a reviewer's report, not evidence: adjudicate every item through Review Work's [adjudication](../review-work/references/adjudication.md) before the owner changes anything, and check it with `check-adjudication.mjs`. Some items are the subject's own mistake.
- A trial supports no rate and no comparison. Measure after the accepted fixes, with arms that keep no notes.

## Run And Read The Evidence

Run the canonical [skill evaluator](scripts/skill-eval.mjs) from the definition root: `node <evaluate-behavior-directory>/scripts/skill-eval.mjs <run|check-tasks|view|review|clear> ...`. Run every eval this way, so it finishes fast and nothing is paid for twice:

1. Count the runs: groups × arms × trials, and the judge calls.
2. For a coding task, run `check-tasks`, which calls no model.
3. Run a pilot first, `--pilot <n>`. Before its first subject it checks each shell arm's harness with no model call: a command in the workspace, one naming a path outside it, the first again, a write under `/tmp`, and which of `node`, `python3` and `git` the shell has. It stops when the shell stopped working after a probe, when the arms found different things, or on a broken run, grade or comparison; otherwise it prints the harness findings, which apply to every arm, and measures the cost per run.
4. Set `--max-cost` from the pilot's cost per run, and give the user the count and the estimated cost before the batch (Rules); where agents ran evals for this task or project before, Track Work's `working-record.mjs estimate --plan` shows what they cost (kind `eval`), a check on the estimate. `--max-cost` counts list price, not a subscription's usage, so a large batch still waits for the user's yes; subjects already running when it is reached still finish.
5. Run the batch in the background and keep working. Subjects run four at once by default, fewer when arms run in containers; `--jobs 1` runs one at a time. An agent you hand the run to can be the smallest capable model ([delegation](../execute-work/references/delegation.md)).
6. After a stop, rerun the same command with `--reuse`: finished runs are not paid for again.
7. Hold the runs the transcript scan flags out of the counts until the user clears them (Rules).
8. For a Research Work study, write the pilot's result in the plan before the lock: `study.mjs lock` refuses a plan whose reference arm passed every pilot unit ([study](../research-work/references/study.md#pilot-then-lock)).

Use `--trials <n>` before claiming a difference. Canonical results live under `<definition-root>/.skill-eval/runs/<result-id>`; a view is a projection of them. A failed check is behavioral evidence; a transition such as `fail-to-pass` is a fact, not a verdict.

## Report And Stop

Report:

- what ran;
- each arm's exact identity, and which is the reference;
- selected groups and arms, and any run reused from an earlier result;
- deterministic results, with case and trial counts and pass^k;
- metrics that bear on the question, such as cost, turns or duration per arm;
- the decision's verdict, with its split, p and rule, when the suite declares one, and otherwise the claim class reached;
- judged evidence apart from deterministic results, with each judge's identity and calibration status;
- infrastructure failures, invalid runs with their reasons, runs held for uncleared transcript flags, cancellation, or unavailable evidence;
- viewed scope and canonical result paths;
- what the evidence proves;
- what it does not prove;
- any supported failed boundary or revision target.

Stop rather than overclaim when required delivery, activation, first-read, composition, retained-use, isolation, artifact, or host evidence is unavailable. The user decides whether to revise, adopt, or reject the change.
