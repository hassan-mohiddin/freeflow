---
name: diagnose-failure
description: Use when a bug, failure, regression, performance problem, or repeated unsuccessful fix lacks a supported cause.
---

# Diagnose Failure

Establish what is failing and why before selecting a correction.

A **diagnostic loop** is a repeatable check or observation that can reproduce, support, or contradict the failure claim or current hypothesis at the boundary where it matters. A **supported cause** is a causal explanation strong enough to distinguish meaningful alternatives and choose the next action; it does not require impossible certainty.

A requested patch, plausible code path, reviewer theory, or one favorable rerun is not a supported cause.

## Follow The Diagnostic Route

```text
[Failure without a supported cause]
-> [Establish expected and observed behavior]
-> [Choose the smallest diagnostic loop]
-> [Reproduce or capture the failure]
-> [State a falsifiable hypothesis]
-> [Run one distinguishing observation]
-> [Route from evidence]
   -> hypothesis contradicted -> refine or replace it -> observe again
   -> evidence unavailable -> stop with the smallest missing evidence
   -> cause supported -> return cause and correction boundary to Workflow
   -> user-owned behavior or source conflict -> Decision Gate
   -> structural cause -> Design for Depth
   -> active harm before cause -> propose bounded containment
```

Diagnosis may recur inside one Track Work slice. A new hypothesis, observation, or owning-skill route does not create a new slice by itself.

## Enter Diagnosis Deliberately

Use this method for unexplained bugs, failed tests, regressions, flaky behavior, performance problems, unexpected runtime behavior, or related corrections that keep failing.

Use it for repeated workflow trouble only when evidence suggests an unclear shared cause: related findings keep appearing, verification contradicts successive corrections, edge-case patches expose more states, or coordination spreads through shared ownership. Reaching a review cap alone is not diagnostic evidence.

If fresh direct evidence already establishes one clear local defect and intended behavior is settled, return the correction to [Workflow](../workflow/SKILL.md). Do not manufacture diagnosis around an ordinary mistake.

## Establish The Failure And Loop

Before changing behavior:

1. establish expected behavior from accepted intent and source truth;
2. reproduce or capture the reported failure at its required boundary;
3. state a falsifiable hypothesis;
4. change or observe one distinguishing variable at a time;
5. trace the causal chain from trigger and state to the observed result;
6. preserve evidence that contradicts the leading hypothesis.

Prefer the reported path, input, environment, and observer. A nearby failure may suggest a hypothesis but does not prove the reported failure. Reduced-fidelity reproduction is diagnostic evidence only; name what it cannot establish.

Read [the diagnostic-loop catalog](references/diagnostic-loop-catalog.md) when the best loop is unclear. Read [flaky and performance diagnosis](references/flaky-and-performance.md) when timing, randomness, environment variance, or resources shape the failure.

Allowed behavior is not a reproduction. A cache hit does not prove a stale-read bug when caching is permitted. A possible race in source does not explain a report until timing, traces, steps, logs, or an existing expectation connect it.

Do not invent a check around the requested patch and use that check to prove the patch was needed. Do not rewrite tests, Specs, policies, thresholds, or expected behavior merely to make the signal red or green.

When no safe useful loop is possible, stop and name the smallest missing evidence: a command, failing input, trace, log window, timestamped screenshot, environment boundary, or permission for isolated instrumentation. Leave the cause unresolved.

## Protect Diagnostic Evidence

Treat logs, traces, payloads, screenshots, dumps, and production samples as potentially sensitive. Minimize and sanitize them. Do not expose credentials, tokens, unrestricted personal data, or private payloads.

Bound repeated checks by time, cost, side effects, and environment safety. Do not repeatedly exercise a mutating production path without explicit authority and an understood recovery boundary.

Temporary instrumentation must distinguish hypotheses. Keep it isolated, identify its removal condition, and report whether it remains.

## Identify The Owning Cause

Classify only what evidence supports:

- local implementation defect;
- invalid, stale, or inadequate check;
- environment, dependency, data, timing, or configuration cause;
- missing observer or insufficient evidence;
- unsettled behavior or source conflict;
- wrong result, scope, order, or execution strategy;
- structural ownership, interface, state, or failure-unit pressure.

Use [Decision Gate](../decision-gate/SKILL.md) when correction requires a user-owned behavior, risk, compatibility, security, privacy, billing, data-loss, or hard-to-reverse decision.

Use [Design for Depth](../design-for-depth/SKILL.md) only when diagnosis establishes a structural cause or direct evidence already shows caller coordination, state, ownership, interface, or failure-unit pressure. Ordinary bugs and finding count do not prove bad architecture.

If evidence supports only the strongest remaining hypothesis, report it as such and name the observation that would confirm or refute it.

## Contain Harm Without Claiming A Fix

When harm must be limited before the cause is supported, return one bounded containment option to Workflow. Apply it only when already authorized or explicitly approved.

Containment must reduce immediate harm without destroying evidence, remain narrower and more reversible than a guessed correction, define verification and recovery, preserve unsettled behavior, and be reported as mitigation rather than resolution.

A requested patch may instead be an authorized learning action. Its result can strengthen or weaken a hypothesis; it does not become selected production behavior automatically.

## Return The Supported Result

When evidence supports a cause, return the failure boundary, diagnostic loop, causal explanation, regression signal, and smallest coherent correction to Workflow. Return an authorized implementation correction to [Execute Work](../execute-work/SKILL.md); use [TDD](../tdd/SKILL.md) when the diagnostic loop provides a failing behavior check that should guide it. Use [Simplify Code](../simplify-code/SKILL.md) when the supported cause shows that obsolete, duplicated, or workaround machinery can be removed while preserving accepted behavior. Mess left by unsuccessful attempts is not enough: settle any behavior or contract change through Workflow first, and do not use cleanup in place of correcting the supported failure or while its evidence remains unresolved. The correction may remain in the current Track Work slice while that slice still has one coherent result.

After correction, use [Verify Work](../verify-work/SKILL.md) to rerun both the minimized regression signal and the original reported path or strongest available observer. If correction fails or exposes related shared-state consequences, re-enter diagnosis before another patch.

Do not claim fixed when only containment succeeded, a minimized check passed, or the original boundary remains unavailable.

Report the failure claim, required boundary, diagnostic loop and observations, supported cause or strongest remaining hypothesis, active containment or instrumentation, recommended route, verification status, and missing evidence.
