---
name: design-for-depth
description: Use when working with software design—especially boundaries, interfaces, ownership, state, and failure behavior.
---

# Design For Depth

Reduce coordination by hiding internal decisions behind small, stable, outcome-level interfaces.

A **module** is anything with an interface and implementation. A **caller** is anything that uses or coordinates the module through its interface, such as application code, another service, a script, a test, a tool, or an agent. Its **interface** is every fact callers must know to use it correctly: inputs, decisions, states, ordering, errors, side effects, configuration, timing, and failure behavior. **Depth** is useful behavior and hidden complexity per unit of interface knowledge.

A **seam** is a boundary where behavior, dependencies, or observation can change without forcing surrounding edits. An **adapter** is a concrete implementation supplied at that seam. Add a seam for real variation or a required testing or observation boundary—not imagined flexibility.

Use this as a compositional lens, not a mandatory phase or permission to refactor.

## Compose The Lens Early

Use this lens during design-bearing discussion before core boundaries settle. Use it while writing a Spec or Plan when ownership, interfaces, state, or failure behavior shapes the contract. Keep it available during execution, TDD, and review when the work must preserve those decisions or exposes new coordination.

Feedback may also route here after [Diagnose Failure](../diagnose-failure/SKILL.md) establishes structural ownership, interface, state, or failure-unit pressure. Ordinary bugs, failed tests, or finding count do not prove bad design.

Do not force this lens onto a local change whose interface remains sound. Do not use architecture language to hide product decisions or turn reversible implementation detail into ceremony.

## Start With Outcome And Failure

Before choosing classes, services, states, or adapters, establish:

- the complete outcome callers need and the decisions they genuinely own;
- the coordination or likely-changing policy the module can hide;
- visible success and the **failure unit**—the smallest outcome treated as one success, failure, and recovery boundary;
- failure observers, state or evidence written, forbidden partial outcomes, response policy (stop, fail closed/open, degrade, retry, or escalate), safe restart, recovery, and required proof.

These form the **failure contract**. Failure behavior is part of the interface even when its mechanism remains private.

When the boundary changes product behavior, public interfaces, compatibility, permissions, security, privacy, billing, data loss, migration direction, or another user-owned outcome, use [Decision Gate](../decision-gate/SKILL.md). This lens surfaces the decision; it does not make it silently.

## Hide Coordination

Prefer interfaces where callers ask for an outcome and the module owns internal protocol.

Before exposing a flag, state, path, filename, ordering rule, retry, timing behavior, or error, ask:

- Does the caller own this choice?
- Does exposing it make correct use easier?
- Is it stable enough to become a contract?
- Could one outcome-level operation hide it?

Keep caller-owned outcomes and decisions public. Keep internal sequencing, storage, cleanup, provider mechanics, integrity publication, and optimization private unless correct use requires caller control.

Read [software design philosophy](references/software-design-philosophy.md) when structural pressure is supported but the likely-changing decision or missing information-hiding boundary cannot yet be named.

## Recognize Structural Pressure

Structural pressure appears when caller knowledge, duplicated policy, lifecycle choreography, test-only exposure, or unowned failure behavior spreads across a boundary, or a bounded outcome requires an unplanned subsystem because no current seam owns it.

Read [design pressure signals](references/design-pressure-signals.md) when that evidence may change the next route. The reference owns the detailed classifier and examples; the signals justify design attention, not automatic refactoring.

Diagnose repeated or unexplained failure before redesigning. Direct design work is appropriate when structural pressure is already observable or an important boundary must be chosen before implementation.

## Shape The Interface

Before comparing materially different interfaces, read [the interface design loop](references/interface-design-loop.md) when structural pressure or an important pre-implementation correctness boundary makes ownership consequential, especially when authority, canonical state, atomic visibility, replay, cancellation, or post-commit recovery affects correctness.

The reference owns the complete comparison method. Prefer the interface that removes caller knowledge, localizes likely change, makes correct use easy, preserves honest failure and recovery, and costs proportionate evidence.

Do not force multiple designs for an obvious local choice. When evidence cannot distinguish viable seams, use the reference's bounded learning route rather than quietly implementing the whole subsystem.

## Tests And Evidence

The intended interface is the normal test surface. If tests must bypass it, reproduce caller choreography, or mock many owned internals, question the module shape before adding test machinery.

Architecture-bearing tests should protect accepted behavior, observed failure, or a settled failure contract. Tests that exist only to protect unnecessary machinery do not justify that machinery.

Exploratory code may produce design evidence. It does not become production architecture without deliberate selection through [Workflow](../workflow/SKILL.md), implementation as an authorized slice, and verification at the required boundary.

## Boundary Examples

- A core operation is being discussed, but partial failure is unspecified → define the failure unit and surface any owner decision before settling the interface.
- Every caller coordinates retry, storage, cleanup, and error translation → consider an outcome-level module that owns the protocol.
- One isolated condition is wrong while callers and the interface remain valid → make a local correction; do not redesign.
- Related failures repeatedly add shared states and caller rules → diagnose the common cause, then use this lens only when structural pressure is supported.

## Return The Route

Return the structural evidence, affected boundary, materially different options when needed, recommendation, and unresolved owner decisions to Workflow. Recommend the narrowest route: continue, run a learning slice, revise a Spec or Plan, use Decision Gate, propose a bounded deepening slice, defer, or stop.

A design recommendation does not authorize implementation. Do not expose speculative variation, broaden accepted scope, or refactor merely because a deeper design is possible. Freeze a supported design boundary instead of pursuing architectural completeness.
