---
name: evaluate-skill
description: Use when evaluating or comparing agent-skill behavior.
---

# Evaluate Skill

Evaluate whether an exact skill changes agent behavior as intended under declared pressure. Evidence outranks confident prose.

A **group** asks one behavioral question through exactly two variants:

- `baseline`: no target skill or a previous snapshot;
- `candidate`: a new or updated snapshot.

The **subject** performs the declared task under one variant. A **suite** is an ordered batch of groups. The evaluator runs subjects, preserves canonical evidence, appends deterministic grades, and renders views. It does not decide whether a skill is good, ready, promotable, or suitable for production.

Inline examples teach the subject. They are candidate content, not evaluation evidence. Keep criteria and expected outcomes outside natural prompts.

## Route First

- Inspect adequate saved evidence before proposing a rerun or wording change.
- Reuse an existing group unchanged when it preserves the question, pressure, and fixed criteria.
- For a draft-only request, use [Write Skill](../write-skill/SKILL.md); do not fake a run.
- Preserve partial infrastructure evidence without treating unavailable behavior as pass or fail.
- Do not mutate canonical evidence or erase an unfavorable result.

Before a substantial rewrite, snapshot the complete current skill package and record an exact identity before editing; use that immutable state as the baseline. A small local wording correction needs no extra snapshot when its exact prior state is already recoverable and the change remains local.

## Name One Question

Separate the behavior being examined:

- **Description activation:** did a natural prompt cause an exact target read, and when?
- **First-read body behavior:** did explicit body delivery guide the subject with only guaranteed context?
- **Nearby behavior:** did a close case avoid activation or load without hijacking the task?
- **Dependency composition:** did exact ordered skills, resources, and context work together?
- **Retained use:** did guidance remain useful on later declared turns?
- **Artifact outcome:** did files, state, events, and responses match the fixed criterion?
- **Cross-host behavior:** did the same question hold on every named host?

One evidence class does not prove another. A successful read does not prove compliance. Direct body delivery cannot prove natural activation. One turn cannot prove retained use. Ambient installation cannot prove declared composition.

Read [evaluation design](references/evaluation-design.md) when choosing the question, evidence class, group shape, or variant boundary.

Keep description and body questions separate by default. `end-to-end` is reserved for an integrated activation-plus-behavior question, but the current runner rejects it before subject execution.

Two common boundary examples:

- If a complete saved result already answers the question, use `view` and raw artifact reads; do not rerun merely to demonstrate process.
- If explicit body delivery succeeds but a natural prompt never reads the skill, body behavior is supported while description activation still fails.

## Use The Smallest Valid Loop

1. Fix the group question, deterministic criteria, and review questions before subject output exists.
2. Preserve the earliest natural prompt or strongest pressure that should distinguish behavior.
3. For a new skill, use no target versus candidate. For a revision, use exact previous versus updated snapshots. For a description-only revision, keep body and resources byte-identical.
4. Keep prompts or turns, fixture, tools, model, thinking, other skills, context, and criteria fixed except for the target difference.
5. Run one group or an ordered suite serially.
6. Inspect deterministic facts and canonical evidence before judging meaning.
7. Let the active agent or user review unresolved behavior; never launch an automatic semantic grader.
8. Classify the failed boundary before editing and revise one measured pressure point.
9. Rerun the complete fixed group with both variants after a measured change.

If both variants pass, the pressure may be weak or the baseline sufficient. If both fail, distinguish the skill, fixture, environment, host, dependency, or criterion before editing.

## Declare The Definition

Use the exact [Evaluation Definition Schema](references/evaluation-definition-schema.md) for group, environment, expectation, suite, and selector shapes.

Declare the prompt or turns, fixture, exact ordered skills and target, working-tree or Git source, runtime host/session mode and ordered extension bundles when needed, literal/inherited environment sources, UTF-8 context, tools, model and thinking, deterministic expectations, comparison IDs, and review questions. Snapshot every declared subject resource. Ambient installation is not declared composition.

## Run And View

Use the canonical [skill evaluator](scripts/skill-eval.mjs):

```text
node <evaluate-skill-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant baseline|candidate]
node <evaluate-skill-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant baseline|candidate]
```

Run from the definition root. Definition targets resolve from the current working directory; suite group references resolve from the suite file. Results are stored under `<cwd>/.skill-eval/runs/<result-id>`. `view` accepts a stored result ID or explicit result directory.

With no selectors, every suite group and both variants are selected. `--group` is invalid for a direct group. Run `--help` before relying on an operation.

Pi is the direct subject process; a runtime profile may select the compatible `piflow` command as an explicit host variant. One-shot descriptions use fresh JSON-mode subjects. Ordered description turns and body groups use one isolated RPC process per variant. Body groups explicitly deliver one target on turn one. Declared extension bundles may provide custom tools and context injections; `bash`, definition-supplied command execution, and end-to-end execution are unsupported.

Read [execution and evidence](references/execution-and-evidence.md) when operating commands, resolving paths, interpreting states, or reasoning about Pi isolation, persistence, views, cancellation, cleanup, and safeguards.

## Grade And Inspect Facts

Append deterministic grades only after canonical run evidence exists. A grade is derived evidence and never mutates or invalidates a run.

Supported checks cover exact skill/resource reads, typed paths, changed paths, file/response text, explicit JSON states, tool-call outcomes and argument predicates, system-prompt or provider-context text by selected request and turn, valid turn scope, and factual baseline-to-candidate transitions. A failed check remains ordinary behavioral evidence. Missing evidence stays unavailable. Malformed checks or grading failures produce separate `grade-error` evidence. Transitions carry no quality or readiness meaning.

Prefer generated grade-first views for routine inspection. Use ordinary file tools for raw run, event, transcript, response, stderr, workspace, definition, grade, context-observation, and group artifacts. A view may remove repeated transport structure; it must not hide evidence required by the question.

Read [review and revision](references/review-and-revision.md) after evidence exists, when surfaces conflict, meaning still needs judgment, or a revision/rerun boundary must be chosen.

## Report And Stop

Report what ran, exact variant identities, deterministic results, infrastructure failures, unavailable evidence, viewed scope, and canonical result paths. State what the evidence proves and does not prove.

Stop rather than overclaim when required activation, first-read, composition, isolation, multi-turn, artifact, or host evidence is unavailable. The active agent or user judges unresolved behavior. The user decides whether to revise, use, publish, or reject a skill.

Never invoke archived evaluators.
