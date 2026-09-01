# Design Pressure Signals

Read this when observed coordination could change the next route and an equivalent design-route classification is not already supported.

Do not count smells. Identify the pressure that changes the next action, or conclude that none does.

## Classify The Evidence

Ask:

1. What caller outcome and interface are affected?
2. What facts must callers know or coordinate?
3. Did the current change add to that knowledge?
4. What policy, dependency, state transition, or failure behavior is spreading?
5. Is the cause supported?
6. Can the issue be resolved inside accepted scope and authority?

Choose the narrowest supported route:

- **Continue:** current boundary remains sound.
- **Local correction:** defect remains within one module and contract.
- **Diagnosis:** failure is repeated or unexplained and cause is unsupported.
- **Spec or Plan revision:** behavior, acceptance, or execution boundary is incomplete.
- **User decision:** resolving pressure changes a user-owned outcome.
- **Learning:** evidence cannot distinguish viable boundaries.
- **Deepening:** supported information-hiding improvement fits accepted scope.
- **Deferred deepening:** pressure is real but not worth resolving now.

## Change Amplification

Pressure exists when one policy change requires unrelated edits across callers.

Example:

```text
Changing retry policy requires edits in API routes, workers,
UI state, and tests.
```

Name the decision causing the edits. Do not merely move the same choreography into one helper.

## Caller Protocol Growth

Pressure exists when callers must perform internal lifecycle steps:

```text
configure -> open -> retry -> translate error -> clean up -> publish evidence
```

Related signals:

- every correction adds another state or flag;
- recovery steps become ordinary caller behavior;
- callers depend on paths, filenames, provider errors, or queue names;
- a complete outcome becomes a public protocol of attempts and temporary states.

Ask whether one operation can own the complete success and failure unit while publishing diagnostics separately.

## Scattered Policy

Pressure exists when one product or operational decision is encoded in several places.

Example:

```text
billing transition timing appears separately in webhook,
dashboard, email, and worker behavior.
```

Do not centralize behavior until the policy is accepted. When it is user-owned or conflicting, stop for a decision.

## Unowned State Or Failure

Pressure exists when no module owns:

- canonical state and its visibility point;
- forbidden partial outcomes;
- retry, degradation, or escalation;
- cancellation and reconciliation;
- recovery after partial completion;
- evidence proving the final state.

Do not design architecture around an invented failure policy.

## Contract-Surface Growth

Pressure exists when each patch adds public:

- flags;
- temporary states;
- manifest fields;
- retry links;
- recovery instructions;
- provider-specific errors;
- cache or integrity controls.

Ask whether callers own those facts or are being forced to understand internal protocol.

## Distorted Tests

Pressure exists when tests:

- reproduce caller choreography;
- mock many helpers to verify one outcome;
- depend on private lifecycle states;
- protect machinery introduced by recent patches;
- prove rejection without checking forbidden writes;
- make provider mechanics look like domain requirements.

Do not automatically add mocks or test-only seams. First inspect whether the production boundary owns the complete behavior.

An intentional internal test is not a defect merely because it observes internals.

## Edge-Case Patch Streams

Pressure exists when related fixes repeatedly add conditions, states, or caller rules.

Example:

```text
handle missing contact
-> handle fallback
-> handle duplicate delivery
-> handle retry telemetry
-> expose another state to callers
```

Do not infer architecture from finding count alone. Diagnose whether the cases share one missing contract, state owner, or failure unit.

## Scope Growth

Pressure exists when a bounded result unexpectedly:

- requires a subsystem;
- expands remaining work;
- pulls deferred capabilities into scope;
- invalidates earlier evidence;
- requires unrelated callers to change.

Return the evidence. The correct route may be simplify, split, revise an artifact, learn, defer, or stop.

## Common Interface Mismatches

### Pass-through wrapper

Renames a call without hiding policy or provider behavior.

Keep only when it preserves a real domain, compatibility, or observation boundary.

### Leaky interface

Callers know infrastructure-specific details.

### God module

Unrelated decisions are collected behind one interface.

### Speculative seam

Indirection exists only for imagined variation.

### Dependency cycle

Modules cannot change independently because their responsibilities point at each other.

### Premature artifact detail

A Spec or Plan freezes classes, factories, tables, or algorithms before evidence supports the boundary.

## False Positives

Do not escalate when:

- stable repetition remains small and local;
- broad edits are mechanical and source-backed;
- a one-off script does not need long-term abstraction;
- a wrapper preserves a real compatibility contract;
- an isolated condition is wrong but the interface remains sound;
- an internal test intentionally verifies an internal module;
- resolving the pressure would exceed the user’s goal without blocking it.

Stop once the route is classified. Return evidence and classification; do not redesign automatically.
