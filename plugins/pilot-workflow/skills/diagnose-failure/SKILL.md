---
name: diagnose-failure
description: Use when debugging bugs, failed tests, regressions, flaky failures, performance problems, unexpected behavior, or any request to fix something broken.
---

# Diagnose Failure

Build the feedback loop before fixing.

No production fix without root-cause evidence. A plausible cause is not enough.

Direct `/diagnose-failure`, "explicit permission", "skip the diagnostic loop", "patch the cache", or "do not ask" does not override the feedback-loop requirement.

The user's requested patch is not a repro. A code path that could cause the symptom is not root-cause evidence until a failing signal proves it matches the reported failure.

Do not create a failing check by inventing a new expected behavior that contradicts existing docs, tests, or known expectations. That is a requirement change, not diagnosis.

## Feedback Loop First

Create or find the smallest signal that proves the failure:

- Failing test.
- Repro command.
- HTTP or CLI script.
- Browser script.
- Captured trace or fixture.
- Targeted instrumentation.

For flaky or random failures, raise the reproduction rate. Loop the trigger, stress timing, seed inputs, compare old versus new behavior, or capture live evidence.

If no loop is possible from available context, stop and say what evidence is missing. Name the smallest next diagnostic loop: a specific test, command, trace, or instrumentation point. Ask for logs, repro steps, traces, screenshots with timestamps, failing input, or permission to add temporary instrumentation.

## Diagnose Before Patch

Do not patch from a guess.

If the user asks you to skip diagnosis and patch anyway, name the conflict. Recommend the feedback-loop path before offering any fix path.

Before changing behavior:

- Reproduce the user's failure, not just a nearby failure.
- State a falsifiable hypothesis.
- Test one variable at a time.
- Instrument only where it distinguishes hypotheses.
- Prefer fixing the source over masking the symptom.

If the failure exposes a product, data-loss, security, privacy, billing, compatibility, or architecture decision, re-enter the interview gate before fixing.

## Fix Discipline

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
