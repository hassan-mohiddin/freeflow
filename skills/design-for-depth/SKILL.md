---
name: design-for-depth
description: Use when module, interface, seam, state, role, failure-contract, or test-boundary choices affect complexity and reversibility; when caller coordination is growing; or when implementation/review keeps producing edge-case patches, public states, flags, retries, or broad refactors.
---

# Design For Depth

Use this as a lens, not a mandatory phase.

Design for less coordination: callers, tests, docs, reviewers, and future agents should ask for an outcome through a small stable interface while the module owns internal sequencing and policy.

If each local fix increases caller knowledge, stop specifying or patching the current interface. Reconsider the module shape before adding another state, flag, retry, wrapper, or test.

Do not use architecture language to hide product decisions or turn a local reversible change into ceremony.

## Core Terms

- **Module:** anything with an interface and implementation.
- **Interface:** everything a caller must know: inputs, invariants, ordering, states, errors, configuration, side effects, performance, policy, and failure behavior.
- **Depth:** useful behavior and hidden decisions per unit of interface knowledge.
- **Seam:** where behavior or variation can change without surrounding edits.
- **Adapter:** a concrete implementation at a seam.
- **Locality:** change, bugs, decisions, and verification stay near one module.
- **Failure contract:** failure modes, observers, written state, forbidden outcomes, fail-open/closed/degrade/escalate/retry behavior, recovery, and proof.

Read [software design philosophy](references/software-design-philosophy.md) when shaping consequential architecture or explaining why a module is shallow. Read [design pressure signals](references/design-pressure-signals.md) when code, plans, tests, or reviews show complexity spread.

## Structural Pressure Loop

When pressure changes the route:

1. **Name the outcome.** What complete result should the caller request?
2. **Choose the failure unit.** What is atomic success, what may remain diagnostic, what is safe to restart, and what must never happen?
3. **Inventory caller knowledge.** List the ordering, states, paths, roles, retries, cleanup, configuration, storage, errors, compatibility, cost, and recovery facts callers must coordinate.
4. **Separate ownership.** Keep caller-owned decisions public; move internal protocol behind the module.
5. **Classify maturity.** Is each proposed mechanism required for trust, safety, efficiency, scale, or portability?
6. **Design it twice when structural.** Produce materially different interfaces before selecting one; do not generate cosmetic variants.
7. **Compare.** Judge depth, locality, correct-use ergonomics, misuse risk, failure behavior, reversibility, maturity fit, and evidence cost.
8. **Route.** Continue, define a learning slice, revise plan/spec, ask the owner, deepen through a bounded refactor, defer, or stop.

Read [the interface design loop](references/interface-design-loop.md) when caller knowledge is still growing, an interface is hard to reverse, or a bounded experiment is needed to choose between designs.

Do not patch the current interface before alternatives exist when every fix expands its contract surface.

## Contract Surface

Every observable flag, path, filename, state, ordering rule, timing behavior, and error can become depended upon.

Before exposing one, ask:

- Does the caller own this choice?
- Does exposure make correct use easier?
- Is the behavior stable enough to become a contract?
- Is it merely internal protocol?
- Could one outcome-level operation hide it?

Public interfaces expose caller-owned outcomes and decisions. Keep storage, retries, cleanup, integrity publication, provider mechanics, and internal lifecycle state private unless callers must control them.

## Tests And Evidence

The interface is the normal test surface. If tests must bypass it, duplicate orchestration, or mock many owned internals, question the module shape before adding test helpers.

Every architecture-bearing test should protect an accepted requirement, measured failure, or settled failure contract. Tests that disappear with an unnecessary mechanism do not justify that mechanism.

When source inspection cannot choose between designs, define a bounded learning slice:

```text
Question:
Competing designs:
Smallest experiment:
Evidence required:
Discard-or-promote rule:
Backward checkpoint:
```

Code can produce design evidence. Exploratory code does not become production architecture without deliberate promotion, review, and verification.

## Pressure Triggers

Stop local patching when:

- a second unexpected defect appears at the same seam;
- fixes add caller knowledge, public states, flags, or recovery rules;
- tests increasingly target lifecycle machinery introduced by earlier fixes;
- a narrow slice requires an unplanned subsystem;
- implementation invalidates earlier evidence;
- remaining work grows after slices complete;
- review produces an edge-case stream rather than isolated defects;
- correctness can be explained only as coordinated steps across modules.

These are checkpoint triggers, not automatic refactor permission.

## Route

Classify the pressure:

- **Continue/local fix:** the interface remains valid and complexity stays hidden.
- **Learning slice:** evidence is needed before choosing a design.
- **Plan defect:** slice boundary, order, checkpoint, or implementation path is wrong.
- **Spec/Discover:** behavior, scope, acceptance, or option space is unsettled.
- **Owner decision:** public API, compatibility, security, privacy, billing, data loss, permissions, migration, or hard-to-reverse architecture; use `../decision-gate/SKILL.md`.
- **Bounded deepening:** behavior is settled but the module is shallow; propose scope before editing.
- **Defer/stop:** pressure is real but not worth solving in the current scope.

The deletion test diagnoses depth; it does not authorize deletion. Understand callers, tests, history, source truth, and why the module exists before removing it.

## Non-Goals

Do not:

- introduce seams for imagined variation;
- treat file or line count as architecture evidence;
- require multiple designs for obvious local choices;
- expose efficiency or scale machinery as public bootstrap contract without observed need;
- freeze an architecture when a bounded experiment can answer the question more honestly;
- broaden scope or change sensitive behavior without owner approval;
- claim a design is deeper without evidence about caller knowledge, locality, tests, or change surface.
