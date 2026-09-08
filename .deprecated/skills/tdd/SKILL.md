---
name: tdd
description: Use when implementing or changing settled behavior test-first, reproducing a bug through regression evidence, or protecting existing behavior before a refactor.
---

# Test-Driven Development

Use one observed failing behavior check to guide the smallest complete implementation for one settled behavior.

TDD provides test-first behavior discipline. It does not define intended behavior, authorize test or production effects, select or close a Slice, or prove claims beyond its observing boundary.

One behavior loop is one coherent method result. It may contain several reads, edits, commands, and focused checks. Finish and return one behavior before starting another.

## Enter With Settled Behavior

Before RED, establish:

- the accepted behavior and caller-visible result;
- relevant success and failure semantics;
- the boundary where the behavior must hold;
- authority covering both the check and production effects;
- the expected reason RED should fail.

Return unsettled behavior, source conflicts, or user-owned choices to [Workflow](../workflow/SKILL.md). Do not encode a guess as a test.

Use TDD for:

- accepted behavior changes;
- bug corrections with a supported cause or reliable regression loop;
- consequential logic whose contract benefits from executable evidence;
- characterization needed before a protected refactor.

Do not force TDD onto documentation, static content, formatting, generated output, or a disposable prototype that is not selected production behavior.

When a bug lacks a supported cause or reliable reproduction, use [Diagnose Failure](../diagnose-failure/SKILL.md) before selecting a production correction.

## Design The Behavior Check

Before designing or materially changing the check, read [Test Design](references/test-design.md).

Name:

- the behavior concept;
- the stable caller-visible seam;
- an oracle independent from the implementation;
- the expected missing behavior RED should expose;
- the focused and affected boundaries that must be rerun after GREEN.

Use the smallest test environment that still exercises the real behavior and relevant failure path. Do not choose a smaller boundary that mocks away the claim or a larger one that adds noise without proving more.

Keep one behavior concept per loop. Several assertions are appropriate when they jointly describe one outcome.

## Follow The Behavior Loop

```text
[Settled accepted behavior]
-> [Choose stable seam and independent oracle]
-> [RED: write and run the smallest behavior check]
   -> fails for the intended missing behavior -> GREEN
   -> passes immediately -> inspect test, boundary, and existing behavior
   -> errors or fails elsewhere -> correct the harness or diagnose
-> [GREEN: implement the smallest complete behavior]
-> [Run the focused behavior check]
-> [REFACTOR locally when useful]
-> [Rerun the original path and affected boundary]
-> [Return the method result and evidence]
```

Do not write all tests first and implementation later. Finish one behavior loop before another.

## Observe Valid RED

Run RED before changing production behavior.

RED is valid only when:

- the check executes through the intended seam;
- its assertion represents accepted behavior;
- it fails because the behavior is missing or incorrect;
- unrelated syntax, setup, environment, or fixture failures do not explain it.

If the check passes immediately, inspect whether:

- the behavior already exists;
- the assertion is ineffective;
- the observing boundary is wrong;
- the test is reproducing a nearby path rather than the reported behavior.

Do not proceed automatically to GREEN.

Correct a clear local harness defect. When the failure remains unexplained or repeated harness changes do not establish valid RED, return to Diagnose Failure.

## Implement Complete GREEN

Before changing production code, read [Code Practices](../execute-work/references/code-practices.md).

Implement the smallest complete behavior that satisfies the accepted contract—not merely the visible assertion.

Do not:

- weaken or rewrite a valid test to obtain GREEN;
- calculate expected values through production logic;
- add public hooks, states, flags, or branches used only by tests;
- silently invent fallback, retry, recovery, or edge-case behavior;
- broaden implementation into another accepted behavior.

If GREEN requires an unsettled behavior, public contract, subsystem, or material scope expansion, return the evidence to Workflow.

## Refactor Locally

Refactor only when it improves the behavior just implemented while its focused check remains green.

TDD refactoring is immediate local cleanup within the behavior loop. It may improve names, remove nearby duplication, simplify control flow, or clarify ownership without changing the accepted result.

Do not turn REFACTOR into a general cleanup stream. When reducing existing complexity is itself an accepted result, return the completed behavior loop and use [Simplify Code](../simplify-code/SKILL.md) as a separate execution route.

When test pressure exposes caller coordination, public states, test-only seams, or ownership problems, preserve that evidence. Use [Design for Depth](../design-for-depth/SKILL.md) only when structural pressure is supported.

## Fix Bugs Through The Reported Boundary

First reproduce the reported symptom through the correct seam. A nearby failing path is diagnostic evidence, not the bug.

After GREEN, rerun:

1. the minimized regression check;
2. the original unminimized symptom or strongest available observer;
3. the smallest affected boundary capable of exposing regression.

Do not report a fix when only the minimized check passes and the reported boundary remains unavailable.

## Return The Method Result

Return to the current owner with:

- accepted behavior and observing seam;
- observed RED result and why it was valid;
- GREEN implementation result;
- local refactor, when performed;
- focused, original-path, and affected-boundary evidence;
- what the evidence supports and does not support;
- unresolved or unverified behavior.

Do not select another behavior, close the Slice, trigger review, commit, or continue merely because GREEN was reached.
