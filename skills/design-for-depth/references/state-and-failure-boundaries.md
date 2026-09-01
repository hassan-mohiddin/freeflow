# State And Failure Boundaries

Read this when correctness materially depends on canonical state, partial effects, atomic visibility, concurrency, cancellation, retries, recovery, reconciliation, or evidence of the final outcome.

Do not apply this reference to a simple local value change whose state owner and failure behavior are already sound.

## Name Canonical State

Identify:

- canonical source of truth;
- who may create, replace, or invalidate it;
- visible states and invariants;
- commit or visibility point;
- diagnostic versus authoritative records;
- what callers may safely cache or infer.

Do not let several modules each behave as the source of truth.

A log, cache, temporary file, UI projection, or recovery marker is not canonical merely because it is observable.

## Define State Transitions

For every material transition, establish:

```text
precondition
-> accepted operation
-> commit or visibility point
-> resulting canonical state
-> evidence
```

Name forbidden transitions and partial states.

Prefer one owner for transition policy. Callers should not reproduce state-machine rules independently.

## Bound Partial Effects

When an operation affects several resources or can fail midway, establish:

- which effects may occur before commitment;
- which effects are forbidden before commitment;
- what must be rolled back, reconciled, or retained;
- what prior accepted state must survive;
- how partial outcomes are detected;
- what result is safe to expose.

Atomicity may come from transactions, staging, replacement, versioning, or explicit reconciliation. Do not claim atomic behavior from intention alone.

## Separate Retry, Resume, And Replay

These are different capabilities:

- **Retry:** attempt the same operation again.
- **Resume:** continue incomplete work from preserved state.
- **Replay:** apply an event or request again.
- **Idempotency:** repeated application has one supported effect.
- **Recovery:** restore a safe supported state.
- **Reconciliation:** compare and resolve divergent state.

Supporting one does not imply the others.

Expose them only when required by accepted behavior or observed failure.

## Design Concurrency Deliberately

When operations can overlap, identify:

- shared state;
- ordering and visibility;
- lost-update or duplicate-effect risk;
- serialization or conflict rule;
- cancellation behavior;
- stale-read policy;
- observer capable of proving the required outcome.

Do not add locks, queues, retries, or optimistic versions without naming the invariant they protect.

## Define Failure And Recovery

For the failure unit, state:

- who observes failure;
- canonical state after failure;
- diagnostic evidence;
- forbidden partial effects;
- fail-open, fail-closed, degrade, stop, retry, or escalation behavior;
- safe restart or recovery operation;
- evidence proving recovery.

A graceful error response does not prove graceful state handling.

## Keep Recovery Out Of Ordinary Callers

Callers should normally request an outcome and receive supported success or failure.

Do not require every caller to know:

- cleanup order;
- retry schedule;
- temporary paths;
- partial-state markers;
- provider error translation;
- reconciliation commands.

Publish diagnostics without exposing recovery choreography unless callers genuinely own recovery.

## Test State And Failure Through Observable Invariants

Tests should verify:

- accepted final state;
- preserved prior state;
- forbidden writes;
- composed failures;
- retry or replay behavior when required;
- cancellation and recovery;
- evidence at the real observing boundary.

A passing happy-path test does not prove partial-failure safety.

## Return

Return:

- canonical state and owner;
- material invariants;
- transition and visibility boundary;
- failure unit;
- forbidden partial outcomes;
- retry, resume, replay, and recovery capabilities actually required;
- evidence and remaining uncertainty;
- narrowest supported route.

Stop when state and failure ownership are sufficient for the current design decision. Do not design every theoretical failure mode.
