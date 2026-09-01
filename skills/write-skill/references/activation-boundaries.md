# Activation Boundaries

Read this when activation is unclear or evidence shows missed, late, early, task-hijacking, or retained-interference behavior.

A description should make the skill available at the earliest useful decision without requiring language introduced by the skill itself.

## Diagnose The First Read

Identify:

- the earliest natural prompt or task state where the skill can change behavior;
- cues visible before the body is read;
- context guaranteed before activation;
- the consequence of missing or delaying the read;
- the consequence if a nearby prompt also loads the skill;
- how retained guidance should behave after the immediate method ends.

Do not optimize for repeated reads. A body may enter context once and continue influencing later messages and tool interactions until context projection or loss.

## Compare Activation Costs

False-positive and false-negative activation have different costs.

A false-positive read may be acceptable when:

- loading cost is proportionate;
- the body identifies that its method does not apply;
- it exits without changing ownership or route;
- retained instructions do not hijack later work.

A false negative is material when missing the first useful read causes:

- an irreversible or expensive action;
- a wrong owner or method;
- repeated low-value environment interactions;
- missing safety or evidence boundaries;
- later work that the skill cannot reliably undo.

Prefer recall when nearby reads are demonstrably safe and missed activation is materially worse. Tighten activation when early or retained guidance can distort ordinary work.

## Check The Cues

Useful cues include:

- the skill’s core job;
- natural user verbs;
- visible task situations;
- observable distinctions from neighboring jobs.

Reject cues that depend on:

- vocabulary defined only in the body or an optional sibling;
- future-duration guesses;
- unexplained internal classifications or named phases;
- generic “help with” or “improve” language;
- marketing claims;
- exhaustive trigger catalogs.

Guaranteed base context may define a term. Otherwise use plain observable language.

## Test Nearby And Retained Behavior

A nearby case can pass through:

- **Non-trigger:** the skill is not read.
- **Safe read:** the body loads, exits or defers correctly, and does not interfere later.

Test both the immediate response and later declared turns when retained influence matters.

Examples:

Broad useful trigger:

> Use when committing work.

Over-specified trigger that hides the job:

> Use after final verification when a planned checkpoint requires a locally reviewable commit.

Broad safe-read trigger:

> Use when working with software design—especially boundaries, interfaces, ownership, state, and failure behavior.

The body must exit when the local interface remains sound and avoid turning later local choices into architecture work.

## Preserve The Evidence Boundary

Natural activation proves the host read the exact skill snapshot from a natural prompt.

Explicit body delivery tests first-read instructions, not activation.

Dependency composition tests exact declared skill and context order.

Multi-turn evidence tests retained use.

Artifact and transcript evidence show whether activation helped, exited safely, or hijacked behavior.

Preserve:

- the earliest useful positive prompt;
- at least one close nearby case;
- later-turn evidence when retained influence is part of the claim.

Do not infer one evidence class from another.
