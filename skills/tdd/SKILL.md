---
name: tdd
description: Use when implementing or changing behavior test-first, fixing a bug with regression evidence, protecting behavior during refactoring, or when a test is difficult to write or starts shaping production design.
---

# Test-Driven Development

Selecting TDD creates no authority. Enter RED only when accepted behavior is settled and the current authority envelope covers the test and production effects.

Use one observed failing behavior check to guide the smallest complete implementation for one accepted behavior.

TDD is an execution method inside [Execute Work](../execute-work/SKILL.md). One vertical RED/GREEN/REFACTOR loop is a bounded action, not automatically a new Slice. Several accepted behavior loops may remain inside one coherent Slice; when durable task memory exists, [Track Work](../track-work/SKILL.md) preserves it as the Current Slice.

TDD does not define intended behavior. The accepted request, source truth, and user decisions establish what should happen.

## Use Or Exit Deliberately

Use TDD when test-first execution is selected for an accepted behavior change, bug correction with a supported cause, consequential logic, or refactor whose behavior needs protection.

Do not force test-first work onto documentation, static content, mechanical formatting, generated output, or a disposable learning prototype whose result is not selected production behavior.

Stop before RED when expected behavior, failure semantics, or a public contract is unsettled. Return the missing direction to [Workflow](../workflow/SKILL.md) rather than encoding a guess as a test.

When TDD applies, before designing or materially changing its behavior check, read [Test Design](references/test-design.md) to choose the test level, seam, oracle, doubles, rejected-state coverage, composed failures, time or concurrency boundary, and characterization strategy.

## Follow The Behavior Loop

```text
[Accepted behavior with settled expectation]
-> [Choose stable seam and independent oracle]
-> [RED: write and run the smallest behavior check]
   -> fails for expected missing behavior -> GREEN
   -> passes immediately -> inspect test, boundary, or existing behavior
   -> errors for unrelated reason -> correct harness or diagnose
-> [GREEN: smallest complete implementation]
-> [Verify focused behavior]
-> [REFACTOR when useful, without behavior change]
-> [Verify original path and affected boundary]
-> [Route]
   -> another accepted behavior in this slice -> next TDD loop
   -> coherent extension -> Workflow -> when covered, record if needed -> next TDD loop
   -> unclear cause or structural pressure -> Workflow
   -> supported bounded action -> return to Execute Work
```

Do not write all tests first and all implementation later. Finish, verify, and route one accepted behavior before starting another.

## Enforce The Test-First Evidence

- Observe RED failing for the intended missing behavior before changing production code.
- If RED passes immediately, inspect the test, observing boundary, and existing behavior; do not proceed to GREEN automatically.
- If RED fails because of syntax, setup, environment, or unrelated behavior, correct the harness or diagnose before implementation.
- Before changing production code for GREEN, read [Code Practices](../execute-work/references/code-practices.md). Then implement the smallest complete behavior.
- Refactor only when it improves the result while the focused behavior check remains green.
- Re-run the original path and smallest affected boundary before returning the supported action and evidence to Execute Work.
- Do not claim TDD when the check was written after implementation or RED was never observed for the intended reason.

## Keep Tests About Accepted Behavior

Use the behavior check as the RED/GREEN contract for one accepted behavior. Do not change a valid test, copy the production implementation into its expected value, or add production hooks used only by tests merely to reach GREEN.

Add an edge-case check only when accepted behavior, observed failure, material safety, or a settled failure contract requires it. If behavior is undefined, return it to Workflow. When related cases keep adding states, flags, setup, or patches, stop the behavior-loop stream and diagnose the shared contract, cause, ownership, or interface.

## Fix Bugs Through The Reported Boundary

First reproduce the reported symptom through the correct seam. A nearby failing path is not the bug.

If no reliable diagnostic loop or supported cause exists, use [Diagnose Failure](../diagnose-failure/SKILL.md) before selecting a production correction. After RED and GREEN, rerun both the minimized regression check and the original unminimized symptom or strongest available observer.

## Stop When Tests Start Designing The System

When Test Design's pressure signals appear, the next check requires an unplanned subsystem, or making it pass expands accepted scope, stop and return the evidence to Workflow. Use [Design for Depth](../design-for-depth/SKILL.md) only when that evidence establishes design-bearing interface or ownership pressure; diagnose repeated or unexplained failure before redesigning.

## Report

Report the accepted behavior and seam, observed RED result, GREEN implementation, refactor if any, original-path and broader verification, Slice effect when relevant, and remaining unverified behavior. Return route-changing evidence rather than silently beginning another behavior or slice.
