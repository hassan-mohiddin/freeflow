---
name: evaluate-skill
description: Use when evaluating, comparing, or making readiness claims about agent-skill behavior.
---

# Evaluate Skill

Judge whether an exact skill changes agent behavior as intended under natural pressure. Evidence outranks confident prose.

A **variant** is one fixed skill-and-context condition being compared. The **subject** is the agent performing the natural task under that variant.

Inline examples teach the subject. They are part of the candidate, not evaluation evidence. Behavioral evals keep criteria outside the natural prompt and test what the agent actually does.

## Route First

- Grade adequate saved evidence before proposing a rerun or wording change.
- Reuse an existing case unchanged when it already preserves the failure and fixed criteria.
- For a draft-only request, use [Write Skill](../write-skill/SKILL.md), record the result as Draft or Unverified in the eval artifact, report, or response, and keep that status out of the subject `SKILL.md`; do not fake a run.
- Require evidence relevant to every readiness or host-support claim.
- After infrastructure failure, discard partial outcomes and rerun every variant as one whole case.
- Follow explicit constraints. Do not mutate adequate evidence merely to demonstrate process order.

## Name The Question

Separate the behavior being claimed:

- **First activation:** does a natural prompt cause the host to load the exact description and skill snapshot at the earliest useful moment?
- **First-read comprehension:** can the delivered body guide correct behavior with only guaranteed prior context?
- **Nearby behavior:** does a close case avoid activation or load without hijacking the task?
- **Dependency composition:** does the skill work with the exact declared base stack and resources?
- **Retained use:** does the method remain available across the claimed later turns?
- **Artifact outcome:** do files, commands, state, and reports match the required behavior?
- **Cross-host behavior:** does the same case hold on every named host?

One evidence class does not prove another. Direct body delivery cannot prove native activation. One turn cannot prove retained use. Ambient context cannot prove declared composition.

Read [evaluation architecture](references/evaluation-architecture.md) when selecting evidence classes. Read [eval patterns](references/eval-patterns.md) when choosing the smallest case shape.

## Smallest Valid Loop

1. Fix criteria before candidate output exists.
2. Preserve the earliest natural prompt or strongest pressure that should change behavior.
3. Choose a fair variant: no skill, exact old snapshot, release, candidate, description-only change, or declared composition.
4. Plan before spending model requests.
5. Keep prompt, fixture, tools, host, model, and thinking settings fixed across variants.
6. Grade objective artifacts first; use fresh semantic judgment only for unresolved meaning.
7. Classify the failure before editing.
8. Revise one measured pressure point and rerun the whole case.

For a nearby prompt, define whether success means no activation or safe behavior after activation. Do not treat every extra read as a behavioral failure.

## Execution

Use direct child processes for ordinary cases. Do not spend parent or subagent context merely to run a subject.

Use the bundled [skill evaluator](scripts/skill-eval.mjs). Resolve the link relative to this skill directory, then run `node <resolved-path> doctor|init|evaluate`. A complete `evaluate` invocation declares the skill, case, timeout, retained-output limit, and model/process limits. Use `--plan-only` before model execution so the owner can inspect the case, limits, and spend.

The default source lives under `.skill-eval/<skill-name>/`. Subjects receive only the natural prompt, isolated fixture, declared immutable skill resources, and allowed tools. Do not supply author discussion, desired reasoning, assertions, expected outcomes, reports, or another variant unless that material naturally belongs to the user task.

Use [portable execution](references/portable-execution.md) for capability fallbacks and isolation. Use [token-efficient execution](references/token-efficient-execution.md) before expanding cases, models, turns, or evidence scope.

## Grade And Diagnose

- Files, diffs, exit status, events, usage, and protocol fields are objective evidence.
- Final response is lower priority than contradictory artifacts.
- A subject never grades its own run in the same conversation.
- Semantic graders use fresh context, fixed criteria, opaque labels, sanitized paths, and visible uncertainty.
- Missing usage or cost is unavailable, not zero.
- Infrastructure failure publishes diagnostics only.

Classify failures precisely:

- activated too early, too late, or not at all;
- description relies on unavailable vocabulary;
- body fails on first read;
- undeclared or undelivered dependency;
- normal-path guidance hidden in a reference;
- nearby activation hijacks behavior;
- retained-context or multi-turn failure;
- wording, placement, missing stop, structure, fixture, host, or grader failure.

Read [grading priority](references/grading-priority.md) when evidence conflicts. Read [grading and revision](references/grading-and-revision.md) before deciding a revision or rerun.

## Stop

Stop rather than overclaim when required activation, first-read, composition, isolation, multi-turn, or host evidence is unavailable. Label a cheaper fallback Diagnostic, Reduced-Fidelity, or Unsupported when it changes the question. The owner decides disputed behavior and readiness.
