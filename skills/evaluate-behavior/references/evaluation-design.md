# Evaluation Design

Read this before choosing or materially changing the behavioral question, evidence class, group shape, pressure, arms, or component boundary.

This reference is judgment: adapt it to the question being answered. Its binding statements restate [Evaluate Behavior](../SKILL.md) Rules or the definition schema.

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
| An extension, setting, model or instruction change reaches the model | Delivery, observed in the system prompt or provider context |

Record separately:

- declaration;
- resource materialization;
- delivery;
- observed reads;
- behavior;
- artifacts;
- derived grades;
- judged evidence;
- later semantic judgment.

A read does not prove compliance. Correct behavior does not prove which component caused it.

## Choose The Smallest Group Shape

- **Description prompt:** natural activation and exact read timing.
- **Explicit body task:** first-read body behavior without activation ambiguity.
- **Fixture task:** files or repository state matter.
- **Stateful turns:** ordered conversation and retained use matter.
- **Saved-result review:** canonical evidence already answers the question.
- **Suite:** several independent questions require one ordered invocation, or a comparison needs a decision rule over several cases.
- **Conversation, pipeline, coding task or judged evaluation:** the behavior happens with a simulated user, across stages, in code that tests must run, or in meaning only a judge can read; see [Eval Modes](eval-modes.md).

Keep activation and body behavior separate unless their integrated interaction is the exact question and the current runner supports that observing boundary.

## Fix Exact Arms

A group runs two or more named arms, and one of them, `baseline` unless `reference` names another, is the reference the others are compared with. Two arms, `baseline` and `candidate`, answer most questions. Add an arm only when the question needs it, for example two candidate wordings against one baseline, or a repeat of the reference to show noise in the same batch; each added arm adds subjects, and a decision rule compares only the two arms it names.

For a new skill, baseline has no target.

For a revision of anything, baseline names the exact immutable previous state, such as a commit. If none exists, preserve it before revising (for a skill, through Write Skill).

For a setting, a model or an extension, baseline is the value in use, and candidate is the one proposed.

To learn whether a skill's body, not just its description, changes behavior, add a separate group whose baseline is a neutral package: the same name and description with a placeholder body. A candidate that matches the neutral baseline gains nothing from its body under that pressure.

For a description-only revision, body and resources remain byte-identical; the group's `"revision": "description-only"` makes the evaluator check this before any subject runs.

Freeze prompts or turns, fixture, tools, every configuration part other than the component, and criteria across arms. Put what may differ in the group's `component`; the evaluator refuses a group whose arms differ anywhere else.

## Design Common Questions

### Description activation

Use the earliest natural prompt where the target should become useful.

For a nearby prompt, predeclare whether success means:

- non-trigger; or
- safe behavior after activation.

### First-read body

Explicitly deliver the exact target body with only guaranteed context. Ambient package context cannot repair a hidden dependency.

### Delivery

For a component that acts through what the host sends, such as an extension, a host setting or an instruction file, first check with a `context-text` expectation that it reached the system prompt or provider context. A change that never reached the model cannot explain a behavior difference.

### Dependency composition

Materialize exact ordered skills and context. Vary only the target snapshot. Do not provide a hidden base stack.

### Retained use

Use ordered turns in one persistent subject process. Repeated body delivery does not prove retained use.

### Artifact outcome

Grade files, changed paths, structured state, and events before relying on the final response. Preserve turn-scoped workspace evidence when later turns may change earlier state. When the outcome is working code, grade it with a command, such as hidden tests, rather than by reading it.

## Apply Real Pressure

A useful group:

- creates a natural temptation to violate the intended behavior;
- keeps criteria and review questions outside the prompt;
- exposes deterministic evidence where possible;
- distinguishes the arms' behavior;
- remains realistic enough that passing behavior is useful.

Choose the pressure by the kind of instruction under test:

- **A Rule:** make breaking it the easy or rewarded path, such as urgency, a user request that conflicts with it, or a shortcut that saves work. The candidate passes only if the Rule holds.
- **Judgment:** include at least one case where following the default literally is the worse choice, next to a case where the default is right. The candidate passes on the outcome in both, so a variant that only obeys the default cannot pass.

## Grade By Requirement And Respect Variance

Grade each requirement a group checks, not only pass or fail. Label each as derivable from the request and code, dependent on a clarification, or imposed by the evaluator (an exact name or message only the checker knows); a failure on an evaluator-imposed requirement says little about the component.

One run per cell cannot separate a difference of one or two items from run-to-run variance. Repeat the cell, or report such a difference as unresolved.

Freeze the candidate before a batch runs. Items used to develop a revision are not evidence for it: judge it on held-out items, and stop iterating on the items it was tuned against.

[Measurement](measurement.md) sizes cases and trials to the claim, and covers noise between runs, held-out splits and controls for checks.

## Keep Separate Conclusions Separate

An explicitly delivered body may support first-read behavior while a natural prompt still fails activation. Preserve both conclusions; one does not repair the other.
