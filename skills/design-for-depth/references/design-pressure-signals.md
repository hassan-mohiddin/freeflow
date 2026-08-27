# Design Pressure Signals

Read this when observed coordination could change what the current owner should do next and an equivalent design-route classification is not already supported.

Do not use this as a smell-counting checklist. Identify the pressure that changes the next action, or conclude that none does.

## Classify The Evidence

Ask:

1. What outcome and interface are affected?
2. What facts must callers know or coordinate?
3. Did the current change add to that knowledge?
4. What policy, state transition, or failure behavior is spreading?
5. Can the issue be resolved within accepted scope and authority?

Then choose the narrowest supported classification:

- **Continue:** the interface remains sound.
- **Local correction:** the defect stays within the current module.
- **Diagnosis:** failure is repeated or unexplained and its cause is not supported.
- **Spec or Plan revision:** accepted behavior or the execution boundary is incomplete.
- **Owner decision:** resolving the pressure changes a user-owned outcome.
- **Learning:** evidence cannot distinguish viable boundaries.
- **Deepening:** a supported information-hiding improvement fits accepted scope.
- **Deferred deepening:** pressure is real but not worth resolving now.

## Change Amplification

Pressure exists when one policy change requires unrelated edits across callers.

Examples:

- retry rules changed in every route;
- permission semantics copied across API, UI, worker, and tests;
- billing transitions encoded separately in webhook, email, and dashboard;
- cache freshness flags threaded through callers.

Name the decision causing the edits. Do not merely centralize the same choreography under a new name.

## Caller Protocol Growth

Pressure exists when callers must know or perform internal lifecycle steps:

```text
configure -> open -> retry -> translate errors -> clean up -> publish evidence
```

Related signals include:

- every correction adds another state or flag;
- recovery instructions become part of ordinary use;
- callers depend on paths, filenames, provider errors, or queue names;
- a complete outcome becomes a public protocol of attempts and temporary states.

Ask whether one operation can own the complete success and failure unit while publishing useful diagnostics separately.

## Unowned Policy, State, Or Failure

Pressure exists when no module owns:

- a product or operational policy;
- canonical state and its visibility point;
- forbidden partial outcomes;
- retry, degradation, escalation, or recovery behavior;
- reconciliation after cancellation or partial completion.

When choosing the behavior would affect product, security, privacy, permissions, billing, compatibility, public APIs, migration, or data loss, stop for an owner decision rather than selecting architecture around an invented answer.

## Distorted Tests And Evidence

Pressure exists when tests:

- reproduce caller choreography;
- mock many helpers to verify one outcome;
- depend on private lifecycle states;
- protect machinery introduced by recent patches rather than accepted behavior;
- prove rejection without checking forbidden writes or prior-state preservation.

Do not automatically add mocks or internal seams. First ask whether the production interface owns the right behavior.

An intentional internal test is not a defect merely because it observes internals. The concern is surrounding callers needing knowledge the module should hide.

## Scope Growth

Pressure exists when a bounded result unexpectedly requires a new subsystem, expands remaining work, pulls deferred capabilities into scope, or invalidates earlier verification.

Return that evidence to Workflow. It may require simplifying, splitting, revising the owning artifact, deferring the deeper design, or stopping for direction.

## Common Interface Mismatches

- **Pass-through wrapper:** renames a call without hiding policy or provider behavior.
- **Leaky interface:** callers know infrastructure-specific details.
- **God module:** unrelated decisions are collected behind one interface.
- **Speculative seam:** indirection exists only for imagined variation.
- **Edge-case patch stream:** related fixes repeatedly add states and caller rules.

A seam may still be justified by real variation, a known migration, or a required testing or observation boundary. The number of implementations is evidence, not a rigid rule.

## False Positives

Do not escalate when:

- a stable repeated pattern remains small and local;
- broad edits are mechanical and source-backed;
- a one-off script does not need long-term abstraction;
- a wrapper preserves a real compatibility or domain contract;
- an isolated condition is wrong but the interface remains valid;
- resolving the pressure would exceed the user's goal without blocking it.

Stop when the route is classified. Return the evidence and classification to the main skill; do not redesign automatically.
