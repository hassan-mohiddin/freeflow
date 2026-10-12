# Work Review

Read this before reviewing code, a diff, a commit, an implementation, or integrated work.

This reference is judgment; Review Work's Rules still bind.

## Establish What The Review Protects

Goal: judge the actual state against its real sources, not the producer's account of it.

Identify the exact code, diff, commit, or integrated state; its accepted outcome, non-goals, relevant requirements and amendments; the future action being protected; and the verification evidence and gaps.

Without the requirements, a broken convention or a change that misses its intent is nearly invisible: get the requirements, acceptance criteria or plan in front of the review. When none exist, say so in the result, and do not report those defects as checked.

Inspect the actual state and governing sources, not just the producer's summary or explanation. A detailed execution contract can itself have been mistaken; check the user outcome before judging compliance with the suggested implementation steps.

Before reviewing changes to trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, security-relevant dependencies, code execution, or security-sensitive failure behavior, read [Security Risk Lens](security-risk-lens.md).

Use [Action Selection](../../../skills/action-selection/SKILL.md) for uncertain or broad inspection; an obvious diff or source read needs no selection exercise.

## Apply The Lenses

Goal: use only the lenses that can change the boundary judgment.

- **Source alignment:** required behavior and accepted amendments are implemented without omission or invented obligations.
- **Correctness and integration:** reachable paths, affected callers, and components work together without regressions. A requirement enforced on one path holds only when every path that reaches the same state enforces it; finding it met on the first path you read does not settle it.
- **Failure and risk:** material errors, recovery, permissions, data, and compatibility are handled as required.
- **Evidence and acceptance:** claims are supported at their required observing boundaries, not merely by green summaries.
- **Scope and minimality:** complexity and coordination serve requirements or demonstrated needs rather than optional stronger guarantees.
- **Maintainability:** behavior and failure paths remain understandable and changeable.

More implementation is not better: check both missing accepted work and unnecessary additions. A prototype result is not production acceptance, and a test protecting a mechanism does not make that mechanism required. If the implementation follows an artifact whose baseline conflicts with a later accepted change, expose that source mismatch rather than choose whichever source makes the work pass.

## Where Corrections Go

Actual correction returns to [Execute Work](../../../skills/execute-work/SKILL.md) under covered authority. When the outcome remains settled but the approach is invalidated, return for implementation preparation.
