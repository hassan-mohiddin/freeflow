---
name: evaluate-skill
description: Use when evaluating or comparing agent-skill behavior.
---

# Evaluate Skill

Determine whether an exact skill package changes agent behavior as intended under declared pressure. Evidence outranks confident prose.

A **group** asks one behavioral question through exactly two variants:

- `baseline`: no target skill for a new skill, or one exact immutable previous package for a revision;
- `candidate`: one exact new or updated package.

The **subject** performs the declared task under one variant. The **evaluator** isolates subjects and preserves canonical evidence. The **deterministic grader** derives fixed mechanical facts after the run is saved. A **suite** runs an ordered set of independent groups.

Evaluate Skill does not author or revise skills, decide semantic quality, claim readiness, or choose publication. [Write Skill](../write-skill/SKILL.md) owns package preservation and revision. The active agent or user judges unresolved meaning; the user decides whether to revise, use, publish, or reject the skill.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- Never mutate canonical evidence or erase an unfavorable result. Preserve partial and infrastructure evidence without converting unavailable behavior into pass or fail.
- Never fabricate behavioral evidence. Missing evidence stays unavailable.
- Compare a revision only against an exact immutable baseline. If none exists, return to Write Skill to preserve the current package; never create a baseline by editing the package being evaluated.
- Keep deterministic criteria and review questions out of subject prompts and declared subject context.
- Declare every subject resource. Ambient installation or context is not declared composition.
- Claim only what the evidence class observed; one class never proves another.
- Never edit the skill from Evaluate Skill. Return one measured revision target to Write Skill.
- After a behavioral change, rerun the complete fixed group with both variants. Never reuse an earlier run as the fresh counterpart or rerun only the preferred variant.
- Advisory review and semantic judgment never enter canonical run or grade state, and neither establishes readiness.
- Never invoke archived evaluators.

## Start From Existing Evidence

Goal: answer the question with the least new evidence that can answer it.

Before proposing a run or revision:

- inspect adequate saved evidence, through views and raw artifact reads when a complete result already answers the question;
- reuse an existing group unchanged when it still preserves the question, pressure, variants, and fixed criteria;
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
- **Artifact outcome:** did files, structured state, events, and responses match fixed criteria?
- **Cross-host behavior:** did the same behavioral question hold on every named host? The evaluator currently runs only Pi and PiFlow hosts.

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

Test a skill's Rules and its judgment differently. A Rule needs pressure to break it; it passes only if it holds. Judgment needs a case where following the default literally is the worse choice; it passes on outcome, so a candidate that only obeys cannot pass.

Read [Evaluation Design](references/evaluation-design.md) before choosing or materially changing the question, evidence class, group shape, pressure, or baseline/candidate boundary.

## Design The Smallest Valid Comparison

Goal: the only difference between variants is the target, and the pressure is strong enough to show it.

Before subject output exists:

1. fix one behavioral question;
2. fix deterministic expectations and review questions;
3. preserve the earliest natural prompt or strongest pressure capable of distinguishing behavior;
4. declare exact baseline and candidate identities;
5. keep prompt or turns, fixture, tools, model, thinking, other skills, context, runtime, and criteria fixed except for the target difference;
6. run one group or an ordered suite serially;
7. inspect canonical evidence and deterministic facts before judging meaning;
8. classify the failed boundary before proposing revision.

For a new skill, the baseline has no target skill. For a revision, the baseline is the exact previous package. For a description-only revision, keep body, references, scripts, and other resources byte-identical.

If both variants pass, the pressure may be weak or the baseline already sufficient. If both fail, distinguish skill, fixture, dependency, environment, host, isolation, and criterion failures before revising instructions.

Inline examples in the skill teach the subject and are part of the candidate intervention; they are not independent evaluation evidence.

## Declare The Complete Environment

Use the exact [Evaluation Definition Schema](references/evaluation-definition-schema.md) when authoring or checking group and suite JSON. Declare:

- prompt or ordered turns;
- fixture;
- exact ordered skill packages and target index;
- working-tree or Git source identity;
- context resources;
- tools and any declared commands;
- model and thinking;
- runtime host, prompt mode, and extension bundles when needed;
- literal and inherited environment sources;
- deterministic expectations and comparison IDs;
- review questions.

## Run And Preserve Canonical Evidence

Before operating the evaluator, resolving paths, interpreting states, or reasoning about host execution, read [Execution and Evidence](references/execution-and-evidence.md).

Use the canonical [skill evaluator](scripts/skill-eval.mjs) from the definition root:

```text
node <evaluate-skill-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant baseline|candidate] [--trials <n>] [--max-cost <total>]
node <evaluate-skill-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant baseline|candidate]
node <evaluate-skill-directory>/scripts/skill-eval.mjs review <result-id-or-directory> --model <provider/model> [--group <id-or-position>] [--thinking <level>]
```

One run per variant cannot separate a behavioral difference from sampling noise. Use `--trials <n>` before claiming a difference; each trial is an independent complete result, and the aggregate only counts their deterministic grades. Use `--max-cost` when trials or suites could spend more than intended.

With no selectors, run or view every suite group and both variants. Selectors narrow execution or viewing scope; they do not modify definitions.

Canonical results live under `<definition-root>/.skill-eval/runs/<result-id>`. A view is a projection of saved evidence, not its canonical source; use ordinary file tools when the exact run, event, transcript, response, stderr, workspace, definition, grade, context-observation, or group artifact matters.

## Derive Facts Without Inventing Meaning

Deterministic grades are appended only after canonical run evidence exists. They can establish exact facts such as:

- skill or resource reads;
- file and path state;
- changed paths;
- file or response text;
- JSON validity or values;
- tool-call outcomes and argument predicates;
- context text at a selected surface, request, and turn;
- factual baseline-to-candidate transitions.

A failed check remains ordinary behavioral evidence; it does not turn a valid subject run into infrastructure failure. Malformed expectations or grading failures produce separate `grade-error` evidence and do not rewrite run evidence.

A transition such as `fail-to-pass` is a factual comparison. It does not mean bad-to-good, not-ready-to-ready, or rejected-to-promotable.

## Review Meaning After Evidence Exists

After canonical evidence and deterministic grades exist, read [Review and Revision](references/review-and-revision.md) when evidence conflicts, semantic meaning remains unresolved, the failed boundary must be classified, a revision target must be selected, or rerun scope is uncertain.

The evaluator never grades meaning automatically. `review` records an optional advisory answer to each review question from a separate model that sees the two runs unlabeled, in `semantic-grade.json`.

The active agent or user may judge reasoning quality, authority preservation, architectural fitness, recommendation quality, or semantic completeness. Keep that judgment, cited evidence, uncertainty, and limits outside canonical run and grade state.

## Return Revision To The Author

When evidence supports a candidate change:

1. identify the exact failed boundary;
2. preserve the canonical result path and relevant evidence;
3. state one measured revision target, keeping unrelated instructions and criteria stable;
4. return revision to Write Skill;
5. rerun the complete fixed group with both variants after the change.

If the evaluation definition or criterion is wrong, preserve the old result and state that it no longer answers the revised question. Do not reinterpret it as evidence for the new question.

## Report And Stop

Report:

- what ran;
- exact baseline and candidate identities;
- selected groups and variants;
- deterministic results;
- infrastructure failures, cancellation, or unavailable evidence;
- viewed scope;
- canonical result paths;
- what the evidence proves;
- what it does not prove;
- any supported failed boundary or revision target.

Stop rather than overclaim when required activation, first-read, composition, retained-use, isolation, artifact, or host evidence is unavailable. The user decides whether to revise, use, publish, or reject the skill.
