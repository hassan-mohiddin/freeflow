---
name: discover
description: "Use for sustained collaborative exploration before or during consequential work: shaping an idea, comparing approaches, reopening assumptions, deciding architecture direction, investigating what to build, or using new implementation/review evidence to choose the next decision, experiment, slice, spec, or plan route."
---

# Discover

Explore breadth before committing to depth.

Discover is a collaborative loop, not a questionnaire or one-time phase. It can begin work or be re-entered when implementation, review, or verification changes the landscape.

The goal is not to settle the whole project. Converge only far enough to choose the next sound decision, experiment, slice, artifact, or route.

`decision-gate` owns user-authority and source-conflict stops. Discover owns the broader shared-understanding loop after no immediate gate blocks progress.

## Use Full Discover

Use full Discover when:

- the problem, outcome, scope, or route is still forming;
- materially different product, technical, or architectural approaches exist;
- conceptual, interface, state, workflow, or context-boundary questions need sustained exploration;
- evidence gathering, brainstorming, and decisions need to interleave;
- later work invalidates an assumption or exposes new option space;
- a checkpoint must guide a spec, plan, learning slice, or future session.

Do not use full Discover for a direct bounded factual answer or when an approved plan, review, verification, commit, or other specific skill already owns a clear next action.

## Work At The Right Altitude

Before asking details, identify the highest unresolved parent question.

Do not decide leaf details whose relevance depends on unsettled purpose, actors, scope, system boundaries, or approach. Button color waits for product and visual direction; retry timing waits for failure semantics and ownership.

Inspect the smallest live evidence that can change the map:

- code, tests, docs, specs, policies, ADRs, issues, logs, traces, and repo state;
- provided files, URLs, screenshots, transcripts, and user context;
- current primary sources when external facts or versions matter.

Facts are inspected. User-owned decisions go through `../decision-gate/SKILL.md`.

## Diverge

Build a compact breadth map before recommending a route:

- desired outcome and actors;
- current facts and constraints;
- materially different approaches or hypotheses;
- assumptions each approach depends on;
- risks, dependencies, and unknowns;
- questions answerable only through implementation or observation.

Generate alternatives only when they are materially different. Do not manufacture three options around an obvious local choice.

Do not rank every option immediately. Early recommendations anchor the discussion and turn collaboration into approval. First make the option space and tradeoffs legible.

## Deepen Selectively

Choose the uncertainty with the greatest effect on the next route, risk, or amount of future coordination.

Use the method that can actually answer it:

- discussion for intent and tradeoffs;
- repo or source inspection for facts;
- `../design-for-depth/SKILL.md` for modules, interfaces, seams, ownership, and failure contracts;
- `../diagnose-failure/SKILL.md` for a concrete failure signal;
- a bounded prototype, benchmark, or learning slice when evidence can only come from building.

Discover may define a learning slice, but does not silently turn discussion into implementation. Name the question, evidence, discard-or-promote rule, and backward checkpoint, then route to execution when the user has requested or approved the experiment.

## Question Discipline

Ask only when the answer changes the next route and cannot be discovered from evidence.

Ask one focused question at a time when a user-owned decision blocks progress. Do not walk the user through a prewritten tree or attach a preferred answer to every question.

Recommendations are calibrated:

- during divergence, explain tradeoffs without forcing a winner;
- when evidence favors a path, give a provisional recommendation and what could disprove it;
- at convergence, recommend the next route and name residual uncertainty;
- for user-owned choices, never treat the recommendation as approval.

Treat challenges, counterexamples, criticism, and changed constraints as input that can reopen the map.

## Track The Working State

Track only what helps the conversation move:

- **Settled:** supported fact or explicit decision.
- **Tentative:** current hypothesis or provisional direction.
- **Open:** unresolved and capable of changing the route.
- **Test during implementation:** safe technical uncertainty assigned to a learning or delivery slice.
- **Deferred:** real but irrelevant to the current phase.
- **Invalidated:** prior assumption contradicted by new evidence.

Keep this state in chat unless later work or another session needs it. Do not create memory for ceremony.

## Converge

Converge when remaining ambiguity does not block the next sound action—not when every future question is answered.

A valid convergence may select:

- one owner decision;
- one research or design question;
- one learning slice;
- the next delivery phase;
- a spec or plan route;
- a backward revision;
- an explicit defer or stop.

Preserve open implementation questions when resolving them through bounded evidence is safer than guessing now.

## Re-Entry

Do not restart discovery from zero when later work reveals new evidence.

State:

```text
New evidence:
Invalidated assumption:
Still valid:
Affected spec / plan / phases / slices:
Available routes:
Decision or experiment needed:
```

Then update only the owning decisions and downstream work that the evidence invalidated.

## Checkpoint

Close consequential discovery with a checkpoint in chat. Save it only when it must guide later work. Read [checkpoints](references/checkpoints.md) before saving and [artifact destinations](references/artifact-destinations.md) when ownership is unclear.

Before routing to a spec or plan, sweep only for remaining questions that would change behavior, scope, acceptance, public contracts, failure semantics, sensitive policy, architecture direction, or the next evidence path.

`Next:` names the recommended forward, backward, branch, or stop route. It is not permission to take it.
