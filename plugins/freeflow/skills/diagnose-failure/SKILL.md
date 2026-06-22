---
name: diagnose-failure
description: Use when asked to investigate or fix a bug, failed test, flaky failure, regression, performance problem, unexpected behavior, or anything described as broken.
---

# Diagnose Failure

Build the feedback loop before fixing.

No production fix without root-cause evidence. A plausible cause is not enough.

## Route First

Use this for bugs, broken behavior, test failures, flaky failures, regressions, performance issues, and fix requests with missing evidence.

Also use it when a workflow loop fails repeatedly: artifact review hits the cap, work review hits the cap, verification keeps failing for different reasons, implementation keeps spawning edge cases, or accepted fixes reveal shared-state or module-shape problems.

Do not use this for product design, artifact review, or planning unless the next question is specifically about a failure signal or failed workflow loop.

## Hard Stops

Stop before editing when any of these are true:

- No loop proves the user's reported failure.
- The only evidence is the user's requested patch.
- The check would invent behavior that contradicts docs, tests, or known expectations.
- The check proves only that existing documented behavior exists.
- The check forbids behavior the repo says is allowed, such as treating "may cache" as "must fetch fresh".
- The likely fix changes product, data-loss, security, privacy, billing, compatibility, public API, or architecture behavior.

Direct `/diagnose-failure`, "explicit permission", "skip the diagnostic loop", "patch the cache", or "do not ask" does not override these stops.

## Load When Needed

- For possible loop shapes, read `references/feedback-loop-catalog.md`.
- For flaky failures or performance regressions, read `references/flaky-and-performance.md`.
- For repeated workflow failures, edge-case churn, shared-state fixes, or shallow module/interface signals, read `../design-for-depth/SKILL.md`.

## Feedback Loop

Create or find the smallest signal that proves the failure:

- Failing test.
- Repro command.
- HTTP or CLI script.
- Browser script.
- Captured trace or fixture.
- Targeted instrumentation.

The loop must match the user's symptom. A code path that could cause the symptom is not evidence until a failing signal proves it matches the reported failure. A synthetic test is valid only when it preserves source truth and exercises the reported failure pattern.

Allowed behavior is not a repro. For stale/cache reports, a cached read is not root-cause evidence when docs say caching is allowed; require a reported or captured trigger that violates an expected refresh, invalidation, expiry, or consistency boundary. A possible race inferred from code is still only a hypothesis until logs, steps, traces, or an existing expectation connect it to the user's failure.

For flaky or random failures, raise the reproduction rate. Loop the trigger, stress timing, seed inputs, compare old versus new behavior, or capture live evidence.

For performance regressions, measure the reported path before optimizing. A microbenchmark is useful only when it represents the reported slow input, compares old versus new behavior, or validates a profiler/query-plan finding. Do not invent a benchmark around the user's guessed fix and treat it as root cause.

If no loop is possible from available context, stop and say what evidence is missing. Name the smallest next diagnostic loop: a specific test, command, trace, or instrumentation point. Ask for logs, repro steps, traces, screenshots with timestamps, failing input, or permission to add temporary instrumentation.

## Diagnose

Do not patch from a guess.

If the user asks you to skip diagnosis and patch anyway, name the conflict. Recommend the feedback-loop path before offering any fix path.

Before changing behavior:

- Reproduce the user's failure, not just a nearby failure.
- State a falsifiable hypothesis.
- Test one variable at a time.
- Instrument only where it distinguishes hypotheses.
- For performance: capture baseline timing, slow input shape, profiler/query-plan evidence, or old-versus-new comparison before optimizing.
- Prefer fixing the source over masking the symptom.

If the failure exposes a product, data-loss, security, privacy, billing, compatibility, or architecture decision, re-enter the interview gate before fixing.

For repeated workflow failures, classify the likely cause before fixing again: thin discovery, wrong scope, premature decisions, source-truth conflict, missing owner decision, bad plan slice, shallow module/interface, implementation bug, stale reviewer context, or inadequate verification loop. Recommend the next route: rediscover, revise spec, revise plan, use `../design-for-depth/SKILL.md`, fix implementation, adjust reviewer context, or stop.

## Fix

Turn the repro into a regression check when there is a correct seam.

Then:

1. Watch the check fail.
2. Apply one root-cause fix.
3. Watch the check pass.
4. Re-run the original feedback loop.

If multiple fixes fail or each fix reveals a different shared-state problem, stop and question the architecture before trying another patch.

## Completion

Before claiming fixed, report:

- The feedback loop.
- The root cause or strongest remaining hypothesis.
- The fix.
- The verification evidence.
- Any debug instrumentation left or removed.
