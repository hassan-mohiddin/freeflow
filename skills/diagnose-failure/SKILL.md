---
name: diagnose-failure
description: Use when a bug, failure, regression, performance problem, or repeated unsuccessful fix lacks a supported cause.
---

# Diagnose Failure

Establish what is failing and why before selecting a correction.

A **feedback loop** is a repeatable check or observation that can reproduce or contradict the reported failure at the boundary where it matters. A **supported cause** is a causal explanation strong enough to distinguish meaningful alternatives and choose the next action; it does not require impossible certainty.

A requested patch, plausible code path, reviewer theory, or one passing rerun is not a supported cause.

## Enter Diagnosis Deliberately

Use this method for unexplained bugs, failed tests, regressions, flaky behavior, performance problems, unexpected runtime behavior, or related corrections that keep failing.

Use it for a repeated workflow loop only when the pattern suggests an unclear shared cause: related review findings keep appearing, verification contradicts successive fixes, edge-case patches expose more states, or corrections spread through shared ownership. Reaching a review cap by itself is not diagnostic evidence.

If fresh direct evidence already establishes a clear local defect and intended behavior is settled, do not manufacture more diagnosis. Return the correction to [Workflow](../workflow/SKILL.md).

## Build The Feedback Loop

Create or find the smallest signal that can disagree with the failure claim. Read [the feedback-loop catalog](references/feedback-loop-catalog.md) when the best loop is unclear. Read [flaky and performance diagnosis](references/flaky-and-performance.md) for those failure types.

Prefer the reported path, input, environment, and observing boundary. A nearby failure may help form a hypothesis but does not prove the reported failure. A reduced-fidelity reproduction is diagnostic evidence only; name what it cannot establish.

Before changing behavior:

1. Establish the expected behavior from accepted intent and source truth.
2. Reproduce or capture the failure.
3. State a falsifiable hypothesis.
4. Change or observe one distinguishing variable at a time.
5. Trace the causal chain from trigger and state to the observed result.
6. Preserve evidence that contradicts the leading hypothesis.

Allowed behavior is not a repro. A cache hit does not prove a stale-read bug when caching is permitted. A possible race in source does not explain the report until timing, logs, traces, steps, or an existing expectation connect it to the failure.

Do not invent a check around the requested patch and use that check to prove the patch was needed. Do not rewrite tests, specs, policies, thresholds, or expected behavior merely to make the signal red or green.

When no safe useful loop is currently possible, stop and name the smallest missing evidence: a command, failing input, trace, log window, screenshot with timestamp, environment boundary, or instrumentation point. Missing evidence leaves the cause unresolved.

## Protect Diagnostic Evidence

Treat logs, traces, payloads, screenshots, dumps, and production samples as potentially sensitive. Minimize and sanitize captured evidence. Do not expose credentials, tokens, unrestricted personal data, or private payloads.

Bound repeated checks by time, cost, side effects, and environment safety. Do not repeatedly exercise a mutating production path without explicit authorization and an understood recovery boundary.

Temporary instrumentation must distinguish hypotheses. Keep it isolated, identify its removal condition, and report whether it remains.

## Diagnose The Owning Cause

Classify only what evidence supports:

- local implementation defect;
- invalid, stale, or inadequate check;
- environment, dependency, data, timing, or configuration cause;
- missing observer or insufficient evidence;
- unsettled behavior or source conflict;
- wrong scope, slice, order, or execution strategy;
- structural ownership, interface, state, or failure-unit pressure.

Route to the narrowest owner. Use [Decision Gate](../decision-gate/SKILL.md) when correction requires a user-owned behavior, risk, compatibility, security, privacy, billing, data-loss, or hard-to-reverse decision.

Read [Design for Depth](../design-for-depth/SKILL.md) only when diagnosis establishes a structural cause or direct evidence already shows caller coordination, state, ownership, interface, or failure-unit pressure. Ordinary bugs and finding count do not prove bad architecture.

If evidence supports only a strongest remaining hypothesis, report it as such and name the observation that would confirm or refute it. Do not silently promote it to root cause.

## Boundary Examples

- “Add retries” is requested, but no evidence connects retries to the reported failure → treat the patch as a hypothesis and build the feedback loop.
- A failing check and trace establish one incorrect condition while the interface remains valid → return one bounded correction; do not manufacture further diagnosis.
- Successive fixes add caller states, cleanup rules, and related failures → diagnose the shared cause; use Design for Depth only when structural pressure is supported.
- Production harm is active but the cause remains open → propose reversible containment with verification and rollback; report mitigated, not fixed.

## Contain Harm Without Claiming A Fix

When harm must be limited before the cause is established, return a bounded containment option to Workflow. Apply it only when already authorized or explicitly approved.

Containment must:

- reduce the immediate harm without destroying diagnostic evidence;
- remain narrower and more reversible than a guessed correction;
- define verification, rollback, and removal conditions;
- preserve unsettled behavior and owner decisions;
- be reported as mitigation, not resolution.

A requested patch may instead be an explicitly bounded learning experiment. Its result can strengthen or weaken a hypothesis; it does not become production behavior without deliberate selection.

## Route The Supported Result

When evidence establishes a correctable cause, return the cause, affected boundary, regression signal, and smallest coherent correction to Workflow. Apply an authorized correction as one [Execute Work](../execute-work/SKILL.md) slice; use [TDD](../tdd/SKILL.md) when a failing behavior check should guide it.

After correction, read [Verify Work](../verify-work/SKILL.md). Re-run both the minimized regression signal and the original reported path or strongest available observing boundary. If the correction fails or exposes related shared-state consequences, return to diagnosis before another patch.

Do not redesign unless evidence identifies structure as the cause. Do not claim fixed when only containment succeeded, the minimized check passed, or the original boundary remains unavailable.

## Report

State:

- failure claim and required boundary;
- feedback loop and observed evidence;
- supported cause or strongest remaining hypothesis;
- containment or instrumentation still active;
- recommended route or correction boundary;
- verification status and missing evidence.
