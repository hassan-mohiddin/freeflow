---
name: evaluate-behavior
description: "Use when testing, evaluating, or comparing how an agent behaves, such as whether a skill triggers or a change to its setup changes outcomes."
---

# Evaluate Behavior

Determine whether a declared change to an agent's setup changes its behavior as intended under declared pressure. Evidence outranks confident prose.

A **configuration** is everything that can shape the agent's behavior: host, model, skills, instruction files, and host extensions and settings. A **group** asks one behavioral question by running named **arms** of one configuration on the same task, usually two or more. One arm is the **reference** the others are compared with; a single arm measures one setup alone. The usual pair is:

- `baseline`, the reference: the setup without the change, such as no target skill, the previous commit, or the setting off;
- `candidate`: the same setup with exactly the declared change, its **component**.

Other shapes name their own arms, such as several candidates against one baseline, or identical arms to measure noise.

The **subject** is the agent performing the declared task in one arm. The **evaluator** isolates subjects and preserves canonical evidence. The **deterministic grader** derives fixed mechanical facts after the run is saved. A **judge** is a separate model that answers what checks cannot; its answers are **judged evidence**. A **suite** runs an ordered set of independent groups, and may declare a **decision** rule that turns their results into a verdict.

Evaluate Behavior does not change what it evaluates, claim readiness, or choose adoption. The component's owner revises it: [Write Skill](../write-skill/SKILL.md) for a skill or other instruction text, including the authoring loop an evaluation serves. The active agent or user judges unresolved meaning; the user decides whether to revise, adopt, or reject the change.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Never mutate canonical evidence or erase an unfavorable result. Preserve partial and infrastructure evidence without converting unavailable behavior into pass or fail.
- Never fabricate behavioral evidence. Missing evidence stays unavailable.
- Compare a change only against an exact immutable baseline, such as a commit. If none exists, preserve the current state first (for a skill or instruction text, through Write Skill); never create a baseline by editing what is being evaluated.
- Keep deterministic criteria, grader files, review questions and rubric references out of subject prompts, the fixture and declared subject context.
- Declare every part of the configuration that can change behavior. Ambient installation, settings, or context are not declared composition.
- Claim only what the evidence class observed; one class never proves another.
- Never write that one arm beats another without paired runs on the same cases and a suite `decision` declared before the run; the evaluator reports "beats" only from that rule. Below that, report counts.
- Never cite a dry run as evidence. When a run is refused for uncommitted inputs, commit the candidate and the definition, or keep the run as a dry run for your own checking only.
- Never change the component under test while evaluating it. Return one measured revision target to its owner.
- After a behavioral change, rerun the complete fixed group with every arm. Never hand-pick an earlier run as the fresh counterpart or rerun only the preferred arm; an earlier run may stand in only through `--reuse`, which matches the arm's exact inputs, and the report names it as reused.
- Judged evidence is its own class. Judge answers are stored apart from run and deterministic grade files, with each judge's identity and calibration status, and count toward a claim only through a decision rule declared before the run. They never change run or grade files and never establish readiness.
- Installing anything an eval needs, such as the VM runtime behind a confined shell, is the user's decision. Relay the evaluator's exact refusal and ask before installing; never install silently.
- Never invoke archived evaluators.

## Start From Existing Evidence

Goal: answer the question with the least new evidence that can answer it.

Before proposing a run or revision:

- inspect adequate saved evidence, through views and raw artifact reads when a complete result already answers the question;
- reuse an existing group unchanged when it still preserves the question, pressure, arms, and fixed criteria;
- for a draft-only request, use Write Skill instead.

Do not rerun merely to demonstrate process.

## Name One Behavioral Question

Goal: one question, observed at the boundary where the claim lives.

Name the exact claim and observing mechanism before choosing the group shape. Evidence classes include:

- **Description activation:** did a natural prompt cause the exact target to be read, and when?
- **First-read body behavior:** did explicit body delivery guide the subject using only guaranteed context?
- **Nearby behavior:** did a close case avoid activation or load without hijacking the task?
- **Dependency composition:** did exact ordered skills, resources, and context work together?
- **Retained use:** did guidance remain useful on later declared turns without redelivery?
- **Artifact outcome:** did files, structured state, events, responses, and test commands match fixed criteria?
- **Cross-host behavior:** did the same behavioral question hold on every named host? The evaluator currently runs only native Pi hosts.
- **Delivery:** did the changed component reach the model, such as a setting's instructions in the system prompt? Check it before blaming behavior.

Activation, first-read body and nearby behavior are questions about skills. For other components, delivery, behavior and artifact outcome come first.

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

Test Rules and judgment differently, in a skill or any other instruction text. A Rule needs pressure to break it; it passes only if it holds. Judgment needs a case where following the default literally is the worse choice; it passes on outcome, so a candidate that only obeys cannot pass.

Read [Evaluation Design](references/evaluation-design.md) before choosing or materially changing the question, evidence class, group shape, pressure, arms, or component boundary.

## Decide What The Result Must Support

Goal: the claim sets the size of the run, not the other way round.

Before building cases, name the strongest claim the result must support:

- **can do X:** one complete run that shows it;
- **does X at a rate on this suite:** counts per check, case and trial, and pass^k for behavior relied on every time;
- **A beats B:** paired runs on the same cases, with a suite `decision` declaring the measure, the two arms, the direction and the size before the run;
- **ready:** beyond Evaluate Behavior; it needs held-out cases and evidence at the claim's own boundary.

Read [Measurement](references/measurement.md) before a run that must support a rate or a comparison. Read [Defect Suites](references/defect-suites.md) before measuring a reviewer, checker or other detector.

## Choose The Component

Goal: the arms differ in exactly the thing the question is about.

| Change under test | Component | Baseline | Revision goes to |
| --- | --- | --- | --- |
| A new or revised skill | `subject.skills`, `subject.target`, `subject.source` | no target, or the previous commit | Write Skill |
| An instruction or context file | `subject.context` | without the file, or its previous commit | Write Skill |
| A model or thinking level | `model.model`, `model.thinking` | the model in use | the user's choice |
| An extension or plugin, or a host setting | `host.extensions`, `host.settings` | without it, or its current version or value | the extension's owner, or the user's choice |

The task's fixture and the runtime are shared by every arm and cannot be the component. To learn how much runs of one setup differ, declare `component: []`: a noise check with identical arms.

## Choose The Mode

Goal: the run shape matches how the behavior happens in practice.

- **Compare:** arms run the same task once per trial; the default.
- **Noise check:** `component: []` with identical arms; the gap between them is the floor a real difference must clear.
- **Measure:** one arm and nothing to compare; it yields a rate on this suite with pass^k, metrics and judged scores, never a comparison or a decision.
- **Conversation:** the subject talks with a simulated user who knows only what its card says.
- **Pipeline:** ordered stages, each a separate subject that sees only what it declares, such as two reviews and an adjudicator.
- **Coding task:** the subject changes a repository and commands such as hidden tests grade the result; a reference solution proves the task solvable before any model runs, and a confined shell is available only behind a declared, verified isolation.
- **Judged evaluation:** judges answer a rubric for each run alone, blind to its arm, where deterministic checks cannot decide.

Read [Eval Modes](references/eval-modes.md) before using any mode other than a plain comparison, and before a batch whose cost matters.

## Design The Smallest Valid Comparison

Goal: the only difference between arms is the component, and the pressure is strong enough to show it.

Before subject output exists:

1. fix one behavioral question;
2. fix deterministic expectations, rubric and review questions;
3. preserve the earliest natural prompt or strongest pressure capable of distinguishing behavior;
4. declare each arm's exact identity, and the suite's decision rule when the claim is a comparison;
5. keep prompt or turns, fixture, tools, and every configuration part other than the component fixed, along with the criteria;
6. run one group or an ordered suite;
7. inspect canonical evidence and deterministic facts before judging meaning;
8. classify the failed boundary before proposing revision.

For a new skill, the baseline has no target skill. For a revised skill, the baseline is the exact previous package. For a description-only skill revision, keep body, references, scripts, and other resources byte-identical, and declare `"revision": "description-only"` so the evaluator refuses a group that changes more.

If every arm passes, the pressure may be weak or the baseline already sufficient. If every arm fails, distinguish component, fixture, dependency, environment, host, isolation, and criterion failures before revising anything.

Inline examples in the instructions under test teach the subject and are part of the candidate intervention; they are not independent evaluation evidence.

## Declare The Complete Environment

Use the exact [Evaluation Definition Schema](references/evaluation-definition-schema.md) when authoring or checking group and suite JSON. Declare:

- prompt or ordered turns;
- fixture;
- exact ordered skill packages and target index, when the subject has skills;
- working-tree or Git source identity;
- context resources;
- tools and any declared commands, and a shell's isolation when the subject needs one;
- model and thinking;
- host, its version, extensions and settings, and the runtime prompt mode and extension bundles when needed;
- literal and inherited environment sources;
- participants, when more than one agent takes part;
- deterministic expectations, command graders and comparison IDs, and a reference solution for a coding task;
- review questions, or a rubric with its judges and combining rule;
- the suite's decision rule, when the claim is a comparison.

## Run And Preserve Canonical Evidence

Before operating the evaluator, resolving paths, interpreting states, or reasoning about host execution, read [Execution and Evidence](references/execution-and-evidence.md).

Use the canonical [skill evaluator](scripts/skill-eval.mjs) from the definition root:

```text
node <evaluate-behavior-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant <arm>] [--trials <n>] [--max-cost <total>] [--jobs <n>] [--cpu-jobs <n>] [--reuse] [--pilot <n>] [--results <dir>] [--yes] [--dry-run] [--skip-reference-check] [--source <arm>=<commit>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs check-tasks <suite-or-group-path> [--group <id-or-position>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant <arm>] [--html <file>] [--results <dir>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-id-or-directory> (--model <provider/model> | --configuration <file>) [--group <id-or-position>] [--thinking <level>] [--swap | --swap-sample <fraction>] [--limit <name>=<chars>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-or-aggregate-id> --rubric [--model <provider/model>] [--configuration <file>]
node <evaluate-behavior-directory>/scripts/skill-eval.mjs review <result-or-aggregate-id> --calibrate <labels.json>
```

One run per arm cannot separate a behavioral difference from sampling noise. Use `--trials <n>` before claiming a difference; each trial is an independent complete result, and the aggregate counts their deterministic grades with pass^k, summarizes run metrics such as cost, turns and tokens per arm, and, when the suite declares a decision, records its verdict. A suite with a decision always runs as trials, and may schedule extra trials for undecided cases itself. Use `--max-cost` when trials or suites could spend more than intended; it bounds the host's list-price estimate, not a subscription's plan limit, so state the subject count before a large batch. Run `check-tasks` before spending on a coding task; it calls no model. `--pilot`, `--reuse` and `--jobs` cut the cost and time of a batch ([Eval Modes](references/eval-modes.md)); `--results` stores results outside the definition root, and `view` and `review` take the same flag to find them. `--source <arm>=<commit>` runs an arm at another commit for that run only, without editing the definition.

With no selectors, run or view every suite group and every arm. Selectors narrow execution or viewing scope; they do not modify definitions.

Canonical results live under `<definition-root>/.skill-eval/runs/<result-id>`. A view, including the `--html` page, is a projection of saved evidence, not its canonical source; use ordinary file tools when the exact run, event, transcript, response, stderr, workspace, definition, grade, judged grade, context-observation, or group artifact matters.

## Derive Facts Without Inventing Meaning

Deterministic grades are appended only after canonical run evidence exists. They can establish exact facts such as:

- skill or resource reads;
- file and path state;
- changed paths;
- file or response text;
- JSON validity or values;
- tool-call outcomes and argument predicates;
- context text at a selected surface, request, and turn;
- a grader command's exit code and which required tests passed;
- factual transitions from the reference arm to each other arm.

A failed check remains ordinary behavioral evidence; it does not turn a valid subject run into infrastructure failure. Malformed expectations or grading failures produce separate `grade-error` evidence and do not rewrite run evidence.

A transition such as `fail-to-pass` is a factual comparison. It does not mean bad-to-good, not-ready-to-ready, or rejected-to-promotable.

## Review Meaning After Evidence Exists

After canonical evidence and deterministic grades exist, read [Review and Revision](references/review-and-revision.md) when evidence conflicts, semantic meaning remains unresolved, the failed boundary must be classified, a revision target must be selected, or rerun scope is uncertain.

Two commands ask a judge, and both store judged evidence apart from run and grade files:

- `review` records an advisory answer to each group's review questions from a model that sees every arm's run side by side, unlabeled, in `semantic-grade.json`. Pass `--swap`, or `--swap-sample` on a sample of groups, to check that the order of the runs did not decide the answers.
- `review --rubric` has the group's declared judges (or the one `--model` names) answer its rubric for each run alone, blind to its arm, combined by the group's declared rule, in `judged-grade.json` beside the run. A decision rule may name a rubric dimension as its measure.

Before choosing a judge or relying on its answers, read Review Work's [Judge Contract](../review-work/references/judge-contract.md). `review --calibrate <labels.json>` scores judges against hand labels and records each judge configuration's calibration; until then its answers carry `calibration not checked`. A judge or reviewer runs on the group's host setup by default, such as a subscription's auth extension; pass `--configuration` only to run it on a different setup. Before counting a judge's answers, hand-check a sample of them against the evidence ([Measurement](references/measurement.md)).

The active agent or user may judge reasoning quality, authority preservation, architectural fitness, recommendation quality, or semantic completeness. Keep that judgment, cited evidence, uncertainty, and limits outside canonical run and grade state.

## Return Revision To The Author

When evidence supports a candidate change:

1. identify the exact failed boundary;
2. preserve the canonical result path and relevant evidence;
3. state one measured revision target, keeping unrelated instructions and criteria stable;
4. return revision to the component's owner;
5. rerun the complete fixed group with every arm after the change.

If the evaluation definition or criterion is wrong, preserve the old result and state that it no longer answers the revised question. Do not reinterpret it as evidence for the new question.

## Report And Stop

Report:

- what ran;
- each arm's exact identity, and which is the reference;
- selected groups and arms, and any run reused from an earlier result;
- deterministic results, with case and trial counts and pass^k;
- metrics that bear on the question, such as cost, turns or duration per arm;
- the decision's verdict, with its split, p and rule, when the suite declares one, and otherwise the claim class reached;
- judged evidence apart from deterministic results, with each judge's identity and calibration status;
- infrastructure failures, cancellation, or unavailable evidence;
- viewed scope;
- canonical result paths;
- what the evidence proves;
- what it does not prove;
- any supported failed boundary or revision target.

Stop rather than overclaim when required delivery, activation, first-read, composition, retained-use, isolation, artifact, or host evidence is unavailable. The user decides whether to revise, adopt, or reject the change.
