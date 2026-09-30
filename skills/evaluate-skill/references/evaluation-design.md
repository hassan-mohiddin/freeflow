# Evaluation Design

Read this before choosing or materially changing the behavioral question, evidence class, group shape, pressure, or baseline/candidate boundary.

This reference is judgment: adapt it to the question being answered. Its binding statements restate [Evaluate Skill](../SKILL.md) Rules or the definition schema.

## Map Claims To Evidence

| Claim | Required evidence |
| --- | --- |
| Description routes the earliest useful prompt | Natural activation |
| Body works with guaranteed context | Explicit body delivery |
| Nearby prompt is not hijacked | Natural activation plus behavioral output |
| Declared dependencies compose | Exact ordered composition |
| Guidance remains useful later | Multi-turn evidence |
| Files or structured state match | Artifact outcome |
| Behavior holds across named hosts | The same group semantics on every named host |

Record separately:

- declaration;
- resource materialization;
- delivery;
- observed reads;
- behavior;
- artifacts;
- derived grades;
- later semantic judgment.

A read does not prove compliance. Correct behavior does not prove which skill caused it.

## Choose The Smallest Group Shape

- **Description prompt:** natural activation and exact read timing.
- **Explicit body task:** first-read body behavior without activation ambiguity.
- **Fixture task:** files or repository state matter.
- **Stateful turns:** ordered conversation and retained use matter.
- **Saved-result review:** canonical evidence already answers the question.
- **Suite:** several independent questions require one ordered serial invocation.

Keep activation and body behavior separate unless their integrated interaction is the exact question and the current runner supports that observing boundary.

## Fix Exact Variants

Every group contains exactly:

- `baseline`;
- `candidate`.

For a new skill, baseline has no target.

For a revision, baseline names an exact immutable previous package. If no exact baseline exists, return to Write Skill before revision.

To learn whether a skill's body, not just its description, changes behavior, add a separate group whose baseline is a neutral package: the same name and description with a placeholder body. A candidate that matches the neutral baseline gains nothing from its body under that pressure.

For a description-only revision, body and resources remain byte-identical.

Freeze prompts or turns, fixture, tools, model, thinking, other skills, context, runtime, and criteria across variants.

## Design Common Questions

### Description activation

Use the earliest natural prompt where the target should become useful.

For a nearby prompt, predeclare whether success means:

- non-trigger; or
- safe behavior after activation.

### First-read body

Explicitly deliver the exact target body with only guaranteed context. Ambient package context cannot repair a hidden dependency.

### Dependency composition

Materialize exact ordered skills and context. Vary only the target snapshot. Do not provide a hidden base stack.

### Retained use

Use ordered turns in one persistent subject process. Repeated body delivery does not prove retained use.

### Artifact outcome

Grade files, changed paths, structured state, and events before relying on the final response. Preserve turn-scoped workspace evidence when later turns may change earlier state.

## Apply Real Pressure

A useful group:

- creates a natural temptation to violate the intended behavior;
- keeps criteria and review questions outside the prompt;
- exposes deterministic evidence where possible;
- distinguishes baseline from candidate behavior;
- remains realistic enough that passing behavior is useful.

Choose the pressure by the kind of instruction under test:

- **A Rule:** make breaking it the easy or rewarded path, such as urgency, a user request that conflicts with it, or a shortcut that saves work. The candidate passes only if the Rule holds.
- **Judgment:** include at least one case where following the default literally is the worse choice, next to a case where the default is right. The candidate passes on the outcome in both, so a variant that only obeys the default cannot pass.

## Grade By Requirement And Respect Variance

Grade each requirement a group checks, not only pass or fail. Label each as derivable from the request and code, dependent on a clarification, or imposed by the evaluator (an exact name or message only the checker knows); a failure on an evaluator-imposed requirement says little about the skill.

One run per cell cannot separate a difference of one or two items from run-to-run variance. Repeat the cell, or report such a difference as unresolved.

Freeze the candidate before a batch runs. Items used to develop a revision are not evidence for it: judge it on held-out items, and stop iterating on the items it was tuned against.

## Keep Separate Conclusions Separate

An explicitly delivered body may support first-read behavior while a natural prompt still fails activation. Preserve both conclusions; one does not repair the other.
