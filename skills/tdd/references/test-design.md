# Test Design

Read this when the right test level is unclear, a dependency needs a double, legacy behavior lacks a seam, or test setup starts driving production design.

The goal is confidence in accepted behavior, not maximal isolation or a fixed unit/integration/end-to-end ratio. One TDD behavior loop is a bounded action and may remain inside a larger coherent Track Work slice.

## Choose The Confidence Boundary

Start from the highest stable interface used by callers, then choose the smallest test environment that still exercises its real behavior and failure path:

- **Focused behavior test:** deterministic logic or one stable public operation can prove the requirement.
- **Integration test:** correctness depends on collaborating components, persistence, serialization, process boundaries, or a real adapter contract.
- **End-to-end or user-path check:** the requirement is a critical flow whose value depends on the assembled system.
- **Characterization test:** existing behavior must be observed and protected before a behavior-preserving refactor.

A characterization test records current behavior; it does not make that behavior desired or authoritative. Stop when intended behavior conflicts with source truth or remains user-owned.

A smaller environment is not better when it mocks away the behavior being claimed. A larger environment is not better when its extra machinery adds noise without proving more.

## Build An Independent Oracle

Expected results should come from source truth, a worked example, a protocol contract, or an independently calculated value.

Do not compute the expected value with the same algorithm as the implementation. That produces agreement by construction.

Prefer observable state, outputs, errors, persisted effects, and caller-visible behavior. Assert an interaction only when that interaction is itself part of the accepted contract or the real effect cannot be observed safely at this test boundary.

Keep one behavior concept per test. Multiple assertions are fine when they jointly describe one outcome.

## Rejection And Composed Failures

For authority, persistence, canonical evidence, retry, cancellation, or recovery behavior, identify the dimensions that materially change the outcome:

```text
entry point
× valid or invalid input
× empty or existing accepted state
× pre-commit or post-commit failure
× first call or retry/replay
```

Do not expand this into an exhaustive matrix by habit. Select the smallest rows that can disprove the accepted failure contract. For each selected row, assert:

- returned result;
- allowed writes or effects;
- forbidden writes or effects;
- preservation of prior accepted state;
- required diagnostic or recovery evidence.

When two accepted conditions can coincide, test the composition rather than assuming isolated cases commute. Examples include cancellation plus integrity failure, successful commit plus failed reconciliation, invalid replacement plus existing valid state, or bounded recovery plus continuation redemption.

## Choose A Test Double

Preference order:

1. **Real implementation:** use when deterministic, fast enough, safe, and controllable.
2. **Fake:** a lightweight working implementation that preserves the relevant contract.
3. **Stub:** returns fixed data needed to reach the behavior under test.
4. **Mock or spy:** records interactions; use sparingly when the interaction itself matters.

Before replacing a dependency, identify:

- the behavior and side effects it owns;
- which of those effects the test depends on;
- the boundary being isolated;
- how the double stays faithful to the real contract and failure modes.

Mock the slow, external, destructive, privileged, or nondeterministic boundary—not a higher-level operation whose behavior the test needs.

Useful double boundaries often include external APIs, email or payment delivery, uncontrollable clocks or randomness, destructive infrastructure, and unavailable remote services. Databases and filesystems may be cheaper and more trustworthy to use for real than to imitate.

A fake or stub must preserve the fields, invariants, errors, and side effects relevant downstream. Validate it against a schema, recorded contract, or shared contract tests when drift would create false confidence.

Do not add public production methods, flags, branches, or lifecycle operations used only by tests. Keep cleanup and fixture construction in test utilities unless production genuinely owns that behavior.

## Time, Randomness, And Concurrency

Prefer an existing controllable boundary for clocks, randomness, scheduling, and external events. Do not expose new public test hooks merely to make assertions convenient.

Avoid arbitrary sleeps as proof. Use observable synchronization, deterministic inputs, bounded eventual assertions, or the real diagnostic loop.

When a race or flaky path cannot be made deterministic, use [Diagnose Failure](../../diagnose-failure/SKILL.md) to raise the reproduction rate and gather evidence before changing production behavior.

## Pressure Signals

Question the seam before adding more test machinery when:

- mock setup is longer or more conditional than the behavior;
- removing a mock changes what the test is actually proving;
- many owned internals must be exposed or replaced;
- doubles duplicate production orchestration;
- test-only production APIs appear;
- integration repeatedly fails despite isolated tests passing;
- fixtures must know internal states, ordering, or cleanup protocols callers should not coordinate.

A real integration test may be simpler than a network of mocks. If the difficulty reflects caller choreography or a shallow interface, use [Design for Depth](../../design-for-depth/SKILL.md) rather than designing production around the test framework.
