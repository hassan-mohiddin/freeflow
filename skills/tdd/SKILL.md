---
name: tdd
description: Use when implementing or changing observable behavior test-first, fixing a bug with regression evidence, choosing a test seam for a planned slice, or when a test is hard to write, passes immediately, conflicts with source truth, or starts driving architecture.
---

# Test-Driven Development

> Status: Unverified candidate

Use one failing behavior check to guide one minimal implementation slice.

TDD is an implementation method inside the workflow, not authority to invent behavior. Source truth, the accepted spec, and explicit owner decisions define what should happen.

## Route First

Use TDD for behavior changes, bug fixes, consequential logic, and refactors whose behavior needs protection.

Do not force test-first work onto documentation, static content, mechanical formatting, generated output, or disposable prototypes that answer a named question. A prototype must have a discard-or-promote rule and cannot become production code silently.

Stop before writing a test when expected behavior, failure semantics, or public contracts are unsettled. Route to `../decision-gate/SKILL.md`, Discover, or spec revision instead of encoding a guess as a test.

## Choose The Seam

Test observable behavior through the highest stable interface that exercises the real requirement.

A good seam:

- is used by callers, not created only for tests;
- lets the test survive internal refactoring;
- reaches the real failure or behavior path;
- keeps setup proportional to the behavior;
- produces an outcome that can disagree with the implementation.

If the only possible test bypasses the interface, mocks many owned internals, duplicates caller choreography, or needs production test hooks, use `../design-for-depth/SKILL.md` before adding more test machinery.

Read [test design](references/test-design.md) when choosing the test level, introducing fakes/stubs/mocks, characterizing legacy behavior, designing rejected-state or composed-failure coverage, controlling time or concurrency, or deciding whether test difficulty is design pressure.

## One Vertical Loop

For one accepted behavior:

1. **RED:** write the smallest test or executable check that expresses the behavior.
2. **Verify RED:** run it and confirm it fails for the expected missing behavior—not syntax, setup, environment, or an unrelated defect.
3. **GREEN:** write the smallest complete implementation that makes this behavior pass. Do not anticipate future slices.
4. **Verify GREEN:** run the focused check and confirm clean output.
5. **REFACTOR:** improve names, duplication, and structure without changing behavior; keep the check green.
6. **VERIFY THE SLICE:** run the original symptom or user path and the smallest broader checks needed for affected behavior.
7. **ROUTE CHECK:** ask whether the next planned test still fits the interface and whether the current architecture remains valid.

Then choose the next behavior. Do not write all tests first and all implementation later.

## Test Quality

Prefer:

- state and observable outcomes over internal call sequences;
- real implementations, then fakes, then stubs, with mocks only at slow, nondeterministic, destructive, or external boundaries;
- independent expected values from source truth or worked examples;
- one behavior per test;
- descriptive names in domain language;
- failure-path tests for fail-closed, retry, recovery, degradation, and graceful-failure claims.

For a rejected or fail-closed operation that may write or replace accepted state, the test must assert both the visible rejection and the state boundary: forbidden writes do not occur and, when prior accepted state may exist, it remains unchanged. If rejected diagnostics are required, assert that they remain separate from canonical accepted state.

When security, transactional, cancellation, retry, or recovery conditions can coincide under the accepted failure contract, include one composed case. Do not rely only on isolated single-condition tests.

Do not:

- assert that a mock was called when the real outcome can be observed;
- add production methods used only by tests;
- change a valid test merely to make implementation pass;
- copy the implementation algorithm into the expected value;
- treat coverage or test count as proof of useful behavior;
- add edge cases without an accepted requirement, measured failure, or settled failure contract.

## Bug Fixes

First reproduce the reported symptom through the correct seam.

A nearby failing path is not the bug. If no reproducible loop exists, use `../diagnose-failure/SKILL.md` before proposing a production fix.

After RED/GREEN, rerun both the minimized regression check and the original unminimized symptom.

## Architecture And Backward Edge

A local red-green loop does not prove the global design is right.

Stop and trigger a design or plan checkpoint when:

- a second unexpected edge case appears at the same seam;
- each test requires another public state, flag, retry, or setup path;
- test setup grows faster than behavior coverage;
- tests increasingly protect machinery introduced by earlier fixes;
- the next test requires an unplanned subsystem or cross-cutting refactor;
- making the test pass invalidates earlier evidence or expands scope;
- the interface is difficult to use correctly or impossible to test without internals.

Do not keep adding tests and patches because the loop is green. Re-enter design, spec, or planning when the evidence changes the route.

## Completion Evidence

Report:

```text
Behavior / seam:
RED command and expected failure:
GREEN command and result:
Original-path verification:
Broader checks:
Remaining unverified behavior:
Route check: proceed | review | commit | redesign | revise plan/spec | stop
```

Do not claim TDD from tests written after implementation or a test that was never observed failing for the intended reason.
