# Work Review

Read this before reviewing code, a diff, a commit, an implementation, or integrated work. Verify Work also points here to grade the one fact a safety claim rests on.

This reference is judgment; Review Work's Rules still bind.

## Establish What The Review Protects

Goal: judge the actual state against its real sources, not the producer's account of it.

Identify the exact code, diff, commit, or integrated state; its accepted outcome, non-goals, relevant requirements and amendments; the future action being protected; and the verification evidence and gaps.

Inspect the actual state and governing sources, not just the producer's summary or explanation. A detailed execution contract can itself have been mistaken; check the user outcome before judging compliance with the suggested implementation steps.

Before reviewing changes to trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, security-relevant dependencies, code execution, or security-sensitive failure behavior, read [Security Risk Lens](security-risk-lens.md).

## Apply The Lenses

Goal: use only the lenses that can change the boundary judgment.

- **Source alignment:** required behavior and accepted amendments are implemented without omission or invented obligations.
- **Correctness and integration:** reachable paths, affected callers, and components work together without regressions. Name the one fact the change's safety rests on and grade how it is known, weakest first: asserted; cited at file:line; reasoned through; run in a script against the real code; reproduced in the running app. A text search stops where the code hands bytes to something it does not show: library source at the version the project pins, wire formats and stored columns, feature flags, and code in other languages that reads the same data. Look there before grading the fact above reasoned.
- **Failure and risk:** material errors, recovery, permissions, data, and compatibility are handled as required.
- **Evidence and acceptance:** claims are supported at their required observing boundaries, not merely by green summaries.
- **Scope and minimality:** complexity and coordination serve requirements or demonstrated needs rather than optional stronger guarantees.
- **Maintainability:** behavior and failure paths remain understandable and changeable.

More implementation is not better: check both missing accepted work and unnecessary additions. A prototype result is not production acceptance, and a test protecting a mechanism does not make that mechanism required. If the implementation follows an artifact whose baseline conflicts with a later accepted change, expose that source mismatch rather than choose whichever source makes the work pass.

## Two Checks In Self-Review

Goal: the user sees every choice nobody agreed, and no existing check was bent to fit the work.

When self-reviewing your own work, also run:

- **Decision check:** list the choices the work made that the agreement did not settle, such as names, behavior in cases nobody specified, defaults, and conventions copied from nearby code. Mark each *agreed*, citing where the user agreed it (the Work Agreement, an existing Decision such as `D-003`, or the user's message), or *for the user*. Keep each choice for the user where the task keeps its open choices, and list them all in the hand-over report. With a Working Record, that place is [Discuss Work](../../../skills/discuss-work/SKILL.md)'s decision list, `sources/decisions.md`; never a Decision, which holds only what the user accepted. Building a choice does not settle it.
- **Test-integrity check:** run Verify Work's [test-changes](../../../skills/verify-work/scripts/test-changes.mjs) script from the work's base, and give each change to an existing test, fixture, or shared setup its reason as [Test Design](../../../skills/verify-work/references/test-design.md)'s Rule requires: it preserves the property, or follows a behavior change the user agreed. Return any other to the user.

## Where Corrections Go

Actual correction returns to [Execute Work](../../../skills/execute-work/SKILL.md) under covered authority. When the outcome remains settled but the approach is invalidated, return for implementation preparation.
