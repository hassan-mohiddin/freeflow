# Test Design

Read this before designing or materially changing a behavior check, including regression or characterization coverage and a test's fixture or shared setup.

This reference is judgment, with one Rule: before reporting work done, give each changed existing test, fixture, snapshot or shared test setup its reason: it preserves the property the test checked, or it follows a behavior change the user agreed. Return any other such change to the user. Choose a real observing boundary and an independent expected result. It does not prescribe test-first sequencing, a fixed unit/integration/end-to-end ratio, or a test-count target.

## Start From Accepted Behavior

Name the caller-visible result, its governing source, and the behavior a wrong implementation would exhibit. Do not derive requirements from the code or preserve accidental machinery because it already has tests.

Assert only behavior that a source settled: the agreement, a spec, the project's docs, or existing tests. A behavior you chose while building has no such source; report it to the user as an open choice instead of asserting it as if it were required.

Expected results should come from accepted source truth, a worked example, a protocol contract, or an independently calculated value. Do not compute the expected value with the same algorithm being tested; that creates agreement by construction.

For a consequential or repeatedly misunderstood property, make the distinction concrete: required behavior, one relevant wrong behavior, and the observation that separates them. Ask whether that wrong implementation could still pass; if so, strengthen the seam or assertion.

When sensitivity remains uncertain, exercise one relevant counterexample or temporary isolated defect only within covered effects. Confirm the intended assertion detects the behavioral mistake; a compilation error or fixture crash proves no such sensitivity. Restore or discard the temporary change and check the actual candidate. Adequate inspection needs no extra run, and ordinary tests need no mandatory mutation-testing cycle.

Signs a test is too weak to detect the mistake:

- it would still pass if every import returned `undefined`;
- its assertion accepts many wrong values: truthy, defined, non-empty, a type or shape, a substring, or a range where one value is required;
- it checks that something was called, not what resulted;
- its expected value is computed by the code under test or the same algorithm.

Strengthen the assertion, or state what the test does not prove.

When a bug fix claims a regression check, run that check on the pre-fix code, for example in a worktree at the base with only the new test added, and report whether it failed there and how. A check that passes without the fix does not cover the bug: strengthen it or withdraw the regression claim. If it cannot run on the pre-fix code, say so.

## Choose The Confidence Boundary

Start from the highest stable interface used by callers, then choose the smallest environment that still exercises the required behavior and failure path:

- **Focused behavior test:** deterministic logic or one stable public operation.
- **Integration test:** collaborating components, persistence, serialization, process boundaries, or a real adapter contract.
- **End-to-end or user-path check:** an assembled flow whose value depends on the system working together.
- **Characterization:** observed existing behavior that must remain unchanged during a selected refactor.

Characterization records what exists, not what should exist. Protect only accepted behavior or behavior required to remain stable for the selected transformation. Return conflicting or undefined expectations before fossilizing them as tests.

A smaller environment is not better when it mocks away the claim. A larger one is not better when extra machinery adds noise without proving more.

Build inputs from what a real caller passes, including each kind of item that reaches the code, not only an idealized example. For a claim about speed, size, or scale, time the real operation next to a baseline: the same work done by a standard tool or by the unchanged code.

Prefer state, outputs, errors, persisted effects, and caller-visible behavior. Assert an internal interaction only when that interaction is itself contractual or the real effect cannot be observed safely. Keep one behavior concept per test; multiple assertions may describe one complete outcome.

## Preserve The Property When Revising A Check

When changing a material assertion or observer after failure, compare the old and new behavioral predicates: what could each accept incorrectly? Correct a wrong expectation from its governing source or repair the observer while preserving the required property. Explain a material change where the result is assessed; do not narrate routine assertion edits.

Exact position equality replaced by a non-negative-number check loses exactness. Inspecting a registration object instead of the next native request changes the observing boundary. Neither is an equivalent fixture repair.

A changed fixture, snapshot or shared setup (a `beforeEach`, `conftest.py`, a setup or test-config file) is a changed assertion for every test that uses it, even when no test file changed; so is a deleted, skipped or moved test. Before reporting work that touched existing tests or their setup, list every such change with [test-changes](../scripts/test-changes.mjs):

```text
node <verify-work-directory>/scripts/test-changes.mjs --base <the work's base commit> [--head <ref>] [--pattern <glob>] [--json]
```

It compares the base with the working tree unless `--head` is given, lists only files that existed at the base, and matches common test layouts for most mainstream languages by path; add `--pattern` for test helpers or fixtures stored elsewhere. Tests written inside source files, such as Rust's `#[cfg(test)]` modules or Python doctests, have no path of their own, so check those changes in the diff yourself. Give each listed change its reason, or return it to the user. Matching what the code now returns is not a reason: it makes the test agree with the code by construction.

If the replacement establishes less, leave the original claim unresolved unless other adequate evidence still establishes it at the required boundary. Return any remaining evidence limitation before acceptance. Under delegation, return it to the directing participant; changing user-owned acceptance still requires the user's decision. Do not freeze a demonstrably wrong test, or weaken a correct property because it is difficult to observe.

## Check Required Failures And Forbidden Effects

For accepted rejection, persistence, authorization, retry, cancellation, or recovery behavior, identify the dimensions that materially change the result:

```text
entry point
× valid or invalid input
× empty or existing accepted state
× pre-commit or post-commit failure
× first call or retry/replay
```

Select only rows that can disprove the required contract. Do not expand a matrix for hypothetical completeness. For the relevant rows, check returned results, allowed and forbidden effects, prior-state preservation, and required diagnostic or recovery evidence.

When accepted conditions can coincide and interact materially, check their composition rather than assuming isolated tests commute. For example, an invalid replacement must not destroy prior accepted state merely because the rejection return value is correct.

Undefined consequential failure behavior is a decision to resolve, not a test expectation to invent.

## Use Faithful Dependencies

Prefer, where practical:

1. the real implementation when safe, controllable, and sufficiently deterministic;
2. a lightweight fake preserving the relevant contract;
3. a stub supplying fixed data needed to reach the path;
4. a mock or spy when the interaction itself matters.

Before replacing a dependency, identify the behavior and effects it owns, which the claim depends on, and how the double preserves them. Replace the slow, external, destructive, privileged, or nondeterministic boundary—not the higher-level behavior the test claims to prove.

External APIs, email/payment delivery, uncontrollable time or randomness, destructive infrastructure, and unavailable remote services can justify doubles. A real filesystem or database may be simpler and more faithful than imitating it.

Preserve relevant fields, invariants, errors, and downstream effects. Check a double against an existing schema, recorded contract, or shared contract tests when drift could produce false confidence. Do not build a second production implementation inside the fixture.

Keep fixture construction and cleanup in test utilities. Do not add public production methods, flags, branches, or lifecycle operations used only by tests.

## Control Time And Concurrency Honestly

Prefer existing seams for clocks, randomness, scheduling, and external events. Do not expose new public test hooks merely for convenient assertions.

Use observable synchronization, deterministic inputs, bounded eventual assertions, or the real diagnostic loop instead of arbitrary sleeps as proof. When timing or flakiness remains unexplained, use [Diagnose Failure](../../diagnose-failure/SKILL.md) before selecting a production correction.

Test order does not establish correctness. A test written after code can be valid; an earlier test can still exercise the wrong path. Preserve evidence of which observations actually ran and never claim an unobserved earlier failure.

## Question Test Machinery Before Expanding It

Reconsider the seam when setup becomes more conditional than the behavior, doubles reproduce internal orchestration, private states must be exposed, or integration fails despite isolated tests passing.

A real integration check may be simpler than many mocks. When direct evidence shows caller coordination or unclear ownership, use [Design for Depth](../../design-for-depth/SKILL.md) to assess that boundary. Do not redesign production solely to satisfy a test framework or retain machinery that only its tests require.

Stop designing checks when the required behavior has an adequate independent observer. More green tests do not justify broader requirements or stronger completion claims.
