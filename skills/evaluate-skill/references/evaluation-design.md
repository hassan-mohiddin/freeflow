# Evaluation Design

Read this when choosing the behavioral question, evidence class, group shape, or baseline/candidate boundary.

## Keep Roles Distinct

- **Subject:** performs the declared task under one variant.
- **Evaluator:** isolates subjects and preserves canonical evidence.
- **Deterministic grader:** derives fixed mechanical facts after run persistence.
- **Reviewer:** the active agent or user judges unresolved meaning.
- **Author:** revises one measured pressure point.
- **User:** decides whether to revise, use, publish, or reject the skill.

The evaluator does not launch an automatic semantic grader or own readiness, promotion, or production status.

## Map Claims To Evidence

| Claim | Required evidence |
| --- | --- |
| Description routes the earliest useful prompt | Natural activation |
| Body works with guaranteed context | Explicit body delivery |
| Nearby prompt is not hijacked | Natural activation plus behavioral output |
| Declared dependencies compose | Exact ordered composition |
| Guidance remains useful later | Multi-turn evidence |
| Files or structured state match | Artifact outcome |
| Behavior holds on several hosts | The same group semantics on every named host |

Record declaration, materialization, delivery, observed reads, behavior, artifacts, and derived grades separately. A read does not prove compliance, and correct behavior does not prove which skill caused it.

## Choose The Smallest Group Shape

- **Description prompt:** natural activation and exact read timing.
- **Explicit body task:** first-read instructions and behavior without activation ambiguity.
- **Fixture task:** files or repository state matter.
- **Stateful turns:** ordered conversation and later behavior matter.
- **Saved-result review:** stored runs already answer the question; inspect them instead of rerunning.
- **Suite:** independent questions need one ordered serial invocation.

Keep description and body questions separate unless the integrated path is itself the question.

## Fix The Variants

Every group has exactly:

- `baseline`: no target for a new skill, or the exact previous snapshot for a revision;
- `candidate`: the new or updated snapshot.

For a description-only revision, keep body and resources byte-identical. Freeze prompts or turns, fixture, tools, model, thinking, other skills, context, and criteria across variants.

## Design Common Questions

### Description routing

Use the earliest natural prompt where the skill should become useful. For a nearby prompt, predeclare whether success means non-trigger or safe behavior after activation.

### First-read body

Explicitly deliver the exact body with only guaranteed context. Ambient package context cannot repair a missing dependency.

### Composition

Materialize exact ordered skills and context. Vary only the target snapshot. Standalone behavior should not receive a hidden base stack.

### Retained use

Use declared turns in one persistent subject process. Repeated explicit delivery does not prove retained use.

### Artifact outcome

Grade filesystem state, changed paths, file content, or JSON before relying on the final response. Preserve turn-scoped workspace evidence when later turns may change earlier state.

## Boundary Examples

Saved complete evidence already contains the required run, grade, and artifacts:

> Use `view` and ordinary file reads. Do not rerun merely to demonstrate the process.

An explicitly delivered body produces the right answer, but the natural prompt never reads the target:

> The body group supports first-read behavior. The description group still fails activation; body success cannot repair it.

## Apply Real Pressure

A useful group creates a real temptation to violate the rule, keeps criteria outside the prompt, exposes deterministic evidence where possible, and distinguishes baseline behavior from the candidate.

If both variants pass, the pressure may be weak or the baseline sufficient. If both fail, classify the skill, fixture, host, dependency, or criterion before editing.
