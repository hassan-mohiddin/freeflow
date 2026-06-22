---
name: design-for-depth
description: Use when shaping, reviewing, implementing, or diagnosing work where module/interface/seam choices affect complexity, locality, testability, future change, or repeated edge-case churn. Use for architecture direction, growing scope, shallow modules, bad seams, broad refactors, and review loops that keep finding new edge cases.
---

# Design For Depth

Use this as a lens, not a phase.

Core rule: if complexity is spreading across callers, tests, docs, artifacts, or review comments, stop and classify the design pressure before patching forward.

Goal: hide useful complexity behind stable interfaces so future callers, tests, reviewers, and agents coordinate less.

Do not add architecture ceremony when the next action is small, local, and reversible. Do not use architecture language to hide product or policy decisions.

## Load When Needed

Read `references/software-design-philosophy.md` when shaping architecture direction, reviewing a design-heavy artifact, or diagnosing repeated design failure.

Read `references/design-pressure-signals.md` when reviewing code/work for shallow modules, scattered policy, edge-case churn, or refactor candidates.

Do not load references for every small design question. The active skill should be enough for routine routing.

## Language

Use these terms consistently:

- **Module** — anything with an interface and implementation: function, class, package, subsystem, workflow slice.
- **Interface** — everything a caller, user, test, or future agent must know: types, invariants, ordering, errors, configuration, performance, side effects, and policy context.
- **Implementation** — details hidden behind the interface.
- **Depth** — leverage at the interface. Deep modules hide useful behavior behind a smaller interface.
- **Shallow module** — interface is nearly as complex as implementation, or callers coordinate details the module should own.
- **Seam** — where behavior, ownership, or variation can change without editing surrounding work.
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Locality** — changes, bugs, decisions, and verification stay near one module.
- **Leverage** — future work gets more behavior from less interface knowledge.

Avoid using “architecture” as a vague quality claim. Name the module, interface, hidden decision, seam, adapter, locality, or leverage.

## Signals

Use this lens when evidence shows:

- one concept requires many unrelated file, test, doc, or reviewer-comment changes;
- callers know ordering, flags, retries, cleanup, cache, auth, billing, migration, privacy, permissions, or compatibility policy;
- tests reach past the interface to assert normal behavior;
- review findings become a stream of edge-case patches;
- the same conditional or policy appears in multiple callers;
- a module is mostly pass-through naming around another module;
- a seam exists only for theoretical future variation;
- a spec or plan encodes detailed implementation guesses before evidence exists;
- the agent can only explain correctness by listing coordinated steps across modules.

Do not use this lens just because work is “important.” Use it when interface shape changes the next action.

## Tests

Use the smallest test that changes the route:

- **Deletion test:** if deleting the module makes complexity vanish, it may be pass-through ceremony. If complexity reappears across callers, tests, docs, or review comments, it was earning its keep.
- **Interface test surface:** callers and tests should exercise normal behavior through the same interface. If tests bypass it, mock internals, or duplicate setup, the module shape may be wrong.
- **Variation test:** one adapter is a hypothetical seam. Two adapters, a real test double, or a known upcoming variation justify a seam better.
- **Locality test:** one behavior change should not scatter policy, error handling, retries, logging, auth, billing, compatibility, docs, and tests across unrelated places.
- **Decision-hiding test:** design decisions likely to change should live behind modules, not in every caller or artifact.
- **Obscurity test:** if a fresh agent must read many files to learn a simple rule, the design may be obscure even if each file is small.

## Route

If the current direction spreads complexity, do not patch forward silently.

Classify the pressure:

- **Local fix:** same interface, complexity stays hidden; continue in the current phase.
- **Plan defect:** slice boundary, check, or implementation path is wrong; revise the plan.
- **Spec gap:** behavior, scope, or acceptance is unclear; revise the spec or return to discovery.
- **Owner decision:** public API, compatibility, security, privacy, billing, data-loss, permissions, migration, or hard-to-reverse architecture changes; use the interview gate.
- **Refactor candidate:** current behavior is valid but the module is shallow; propose a bounded deepening path before editing.
- **Stop/defer:** design pressure is real but not worth solving in this scope; record or defer it explicitly.

## Non-Goals

Do not:

- introduce abstractions for imagined future variation;
- hide product or policy decisions inside architecture wording;
- rewrite source truth to make a design cleaner;
- turn every feature into upfront architecture design;
- broaden a narrow fix into a refactor without user approval;
- treat line count, file count, indirection, or pattern names as proof of quality;
- claim a design is better without evidence from code, tests, review, usage, or an explicit owner decision.
