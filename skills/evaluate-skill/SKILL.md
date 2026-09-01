---
name: evaluate-skill
description: Use when evaluating or comparing agent-skill behavior.
---

# Evaluate Skill

Determine whether an exact skill package changes agent behavior as intended under declared pressure. Evidence outranks confident prose.

A **group** asks one behavioral question through exactly two variants:

- `baseline`: no target skill for a new skill, or one exact immutable previous package for a revision;
- `candidate`: one exact new or updated package.

The **subject** performs the declared task under one variant. The **evaluator** isolates subjects and preserves canonical evidence. The **deterministic grader** derives fixed mechanical facts after run persistence. A **suite** runs an ordered set of independent groups.

Evaluate Skill does not author or revise skills, decide semantic quality, claim readiness, or choose publication. [Write Skill](../write-skill/SKILL.md) owns package preservation and revision. The active agent or user judges unresolved meaning. The user decides whether to revise, use, publish, or reject the skill.

Inline examples teach the subject and are part of the candidate intervention. They are not independent evaluation evidence. Keep deterministic criteria and review questions outside natural subject prompts.

## Route From Existing Evidence First

Before proposing a run or revision:

- inspect adequate saved evidence;
- reuse an existing group unchanged when it still preserves the question, pressure, variants, and fixed criteria;
- use saved views and raw artifact reads when a complete result already answers the question;
- preserve partial infrastructure evidence without converting unavailable behavior into pass or fail;
- do not mutate canonical evidence or erase an unfavorable result.

For a draft-only request, use Write Skill. Do not fabricate behavioral evidence.

A revision comparison requires an exact immutable baseline identity. If none exists, return to Write Skill to preserve the complete current package before revision. Evaluate Skill consumes baseline and candidate identities; it does not create a baseline by editing the package it is evaluating.

## Name One Behavioral Question

Name the exact claim and observing mechanism before choosing the group shape.

Evidence classes include:

- **Description activation:** did a natural prompt cause the exact target to be read, and when?
- **First-read body behavior:** did explicit body delivery guide the subject using only guaranteed context?
- **Nearby behavior:** did a close case avoid activation or load without hijacking the task?
- **Dependency composition:** did exact ordered skills, resources, and context work together?
- **Retained use:** did guidance remain useful on later declared turns without redelivery?
- **Artifact outcome:** did files, structured state, events, and responses match fixed criteria?
- **Cross-host behavior:** did the same behavioral question hold on every named host?

One evidence class does not prove another.

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

Read [Evaluation Design](references/evaluation-design.md) before choosing or materially changing the question, evidence class, group shape, pressure, or baseline/candidate boundary.

## Design The Smallest Valid Comparison

Before subject output exists:

1. fix one behavioral question;
2. fix deterministic expectations and review questions;
3. preserve the earliest natural prompt or strongest pressure capable of distinguishing behavior;
4. declare exact baseline and candidate identities;
5. keep prompt or turns, fixture, tools, model, thinking, other skills, context, runtime, and criteria fixed except for the target difference;
6. run one group or an ordered suite serially;
7. inspect canonical evidence and deterministic facts before judging meaning;
8. classify the failed boundary before proposing revision;
9. return one measured revision target to Write Skill;
10. rerun the complete fixed group with both variants after a behavioral change.

For a new skill:

```text
baseline: no target skill
candidate: exact candidate package
```

For a revision:

```text
baseline: exact previous package
candidate: exact revised package
```

For a description-only revision, keep body, references, scripts, and other resources byte-identical.

If both variants pass, the pressure may be weak or the baseline already sufficient. If both fail, distinguish skill, fixture, dependency, environment, host, isolation, and criterion failures before revising instructions.

## Declare The Complete Environment

Use the exact [Evaluation Definition Schema](references/evaluation-definition-schema.md) when authoring or checking group and suite JSON.

Declare:

- prompt or ordered turns;
- fixture;
- exact ordered skill packages and target index;
- working-tree or Git source identity;
- context resources;
- tools;
- model and thinking;
- runtime host and extension bundles when needed;
- literal and inherited environment sources;
- deterministic expectations and comparison IDs;
- review questions.

Snapshot every declared subject resource. Ambient installation is not declared composition.

Criteria and review questions remain outside the subject prompt.

## Run And Preserve Canonical Evidence

Before operating the evaluator, resolving paths, interpreting states, or reasoning about host execution, read [Execution and Evidence](references/execution-and-evidence.md).

Use the canonical [skill evaluator](scripts/skill-eval.mjs):

```text
node <evaluate-skill-directory>/scripts/skill-eval.mjs run <suite-or-group-path> [--group <id-or-position>] [--variant baseline|candidate]
node <evaluate-skill-directory>/scripts/skill-eval.mjs view <result-id-or-directory> [--group <id-or-position>] [--variant baseline|candidate]
```

Run from the definition root.

With no selectors, run or view every suite group and both variants. Selectors narrow execution or viewing scope; they do not modify definitions.

Canonical results live under:

```text
<definition-root>/.skill-eval/runs/<result-id>
```

A view is a projection of saved evidence, not its canonical source. Use ordinary file tools when exact run, event, transcript, response, stderr, workspace, definition, grade, context-observation, or group artifacts matter.

Do not invoke archived evaluators.

## Derive Facts Without Inventing Meaning

Append deterministic grades only after canonical run evidence exists.

Deterministic checks may establish exact facts such as:

- skill or resource reads;
- file and path state;
- changed paths;
- file or response text;
- JSON validity or values;
- tool-call outcomes and argument predicates;
- context text at a selected surface, request, and turn;
- factual baseline-to-candidate transitions.

A failed check remains ordinary behavioral evidence. It does not turn a valid subject run into infrastructure failure.

Missing evidence remains unavailable.

Malformed expectations or grading failures produce separate `grade-error` evidence and do not rewrite canonical run evidence.

A transition such as `fail-to-pass` is a factual comparison. It does not mean bad-to-good, not-ready-to-ready, or rejected-to-promotable.

## Review Meaning After Evidence Exists

After canonical evidence and deterministic grades exist, read [Review and Revision](references/review-and-revision.md) when:

- evidence conflicts;
- semantic meaning remains unresolved;
- the failed boundary must be classified;
- a revision target must be selected;
- rerun scope is uncertain.

The evaluator does not launch an automatic semantic grader.

The active agent or user may judge reasoning quality, authority preservation, architectural fitness, recommendation quality, or semantic completeness. Keep that judgment, cited evidence, uncertainty, and limits outside canonical run and grade state.

## Return Revision To The Author

When evidence supports a candidate change:

1. identify the exact failed boundary;
2. preserve the canonical result path and relevant evidence;
3. state one measured revision target;
4. keep unrelated instructions and criteria stable;
5. return revision to Write Skill;
6. rerun the complete fixed group with both variants after the change.

Do not edit the skill from Evaluate Skill.

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

Stop rather than overclaim when required activation, first-read, composition, retained-use, isolation, artifact, or host evidence is unavailable.

The active agent or user judges unresolved behavior. The user decides whether to revise, use, publish, or reject the skill.
