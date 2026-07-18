---
name: tdd
description: Use when implementing or changing behavior test-first, fixing a bug with regression evidence, protecting behavior during refactoring, or when a test is difficult to write or starts shaping production design.
---

# Test-Driven Development

Use one failing behavior check to guide one minimal implementation slice.

TDD does not define intended behavior. The accepted request, source truth, and user decisions establish what should happen.

## Use TDD When

Use TDD for behavior changes, bug fixes, consequential logic, and refactors whose behavior needs protection.

Do not force test-first work onto documentation, static content, mechanical formatting, generated output, or a disposable prototype whose purpose is learning rather than production behavior.

Stop before writing a test when expected behavior, failure semantics, or a public contract is unsettled. Return the missing decision or direction to [Workflow](../workflow/SKILL.md) instead of encoding a guess as a test.

## Choose The Seam

Test observable behavior through the highest stable interface that exercises the real requirement.

A useful seam:

- is used by callers rather than created only for tests;
- survives internal refactoring;
- reaches the real behavior or failure path;
- keeps setup proportionate;
- can disagree with the implementation.

Read [Test Design](references/test-design.md) when the test level, expected-value oracle, double, rejected state, composed failure, time or concurrency boundary, or legacy seam is unclear.

If testing requires many owned internals, duplicated caller choreography, or production hooks used only by tests, return the design pressure to Workflow before adding more test machinery.

## Run One Vertical Loop

For one accepted behavior:

1. **RED:** write the smallest test or executable check that expresses the behavior.
2. **Verify RED:** run it and confirm it fails for the expected missing behavior—not syntax, setup, environment, or an unrelated defect.
3. **GREEN:** write the smallest complete implementation that makes this behavior pass. Read [Code Practices](../execute-work/references/code-practices.md) while changing code.
4. **Verify GREEN:** run the focused check and confirm the expected result.
5. **REFACTOR:** improve names, duplication, comments, and structure without changing behavior; keep the check green.
6. **VERIFY THE SLICE:** rerun the original symptom or user path and the smallest broader checks needed for affected behavior.
7. **ROUTE:** stop, select the next accepted behavior, or return new evidence to Workflow.

Do not write all tests first and all implementation later. Once this behavior is supported and the slice self-review is complete, freeze it; possible polish or another imagined case is separate work.

## Keep Tests About Accepted Behavior

Prefer:

- observable state and outcomes over internal call sequences;
- real implementations, then fakes, then stubs, with mocks only at boundaries where interaction must be observed;
- expected values derived independently from source truth or worked examples;
- descriptive names in domain language;
- one behavior concept per test;
- failure-path coverage for accepted rejection, retry, recovery, degradation, or fail-closed claims.

Do not:

- copy the implementation algorithm into the expected value;
- add production methods used only by tests;
- change a valid test merely to make implementation pass;
- treat coverage or test count as proof of useful behavior;
- add an edge-case test solely because the case can be imagined.

Add an edge-case test when accepted behavior, an observed failure, material safety, or a settled failure contract requires it. If expected behavior is undefined, return it to Workflow. When related cases keep producing states, flags, setup, or patches, stop the red-green stream and diagnose the shared contract, cause, ownership, or interface.

## Fix Bugs Through The Reported Symptom

First reproduce the reported symptom through the correct seam. A nearby failing path is not the bug.

If no reproducible loop exists, use [Diagnose Failure](../diagnose-failure/SKILL.md) before proposing a production fix. After RED and GREEN, rerun both the minimized regression check and the original unminimized symptom.

## Stop When The Test Starts Designing The System

A green local loop does not prove the global design is right. Return evidence to Workflow when:

- test setup grows faster than behavior coverage;
- each case requires another public state, flag, retry, or fallback;
- tests increasingly protect machinery introduced by earlier fixes;
- the next test requires an unplanned subsystem or broad refactor;
- making the test pass expands scope or invalidates earlier evidence;
- the interface is difficult to use correctly or test without internals.

Do not keep adding tests and patches because each local loop can be made green. Diagnose repeated or unexplained failures before redesigning.

## Report

Report the behavior and seam, observed RED failure, GREEN result, original-path verification, broader checks, and remaining unverified behavior. Do not claim TDD when the test was written after implementation or was never observed failing for the intended reason.
