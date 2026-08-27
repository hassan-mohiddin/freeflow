---
name: diagnose-failure
description: Use when a bug, failure, regression, performance problem, or repeated unsuccessful correction lacks a supported cause.
---

# Diagnose Failure

Establish what is failing and why before selecting a correction.

A **diagnostic loop** is a repeatable observation that can support, contradict, or leave unresolved a hypothesis at the boundary where the failure matters.

A **supported cause** is a causal explanation strong enough to distinguish meaningful alternatives and bound the next action. It does not require impossible certainty.

A requested patch, plausible code path, reviewer theory, observation consistent with one hypothesis, or one favorable rerun is not a supported cause.

Diagnosis owns the hypothesis, causal interpretation, and correction boundary. It does not authorize active evidence generation or correction.

## Enter Only When Cause Is Unsettled

Use diagnosis for:

- an unexplained bug, failed test, regression, or runtime failure;
- flaky, timing-dependent, environmental, or performance behavior;
- contradictory evidence;
- related corrections that keep failing;
- patches that repeatedly expose additional state or coordination;
- review findings whose shared cause remains unsupported.

Do not diagnose an ordinary mistake when fresh evidence already establishes one clear local defect and accepted behavior is settled. Return that correction to [Workflow](../../skills/workflow/SKILL.md).

Review count, finding count, or several bugs in one area do not by themselves prove a shared or structural cause.

Diagnosis may recur inside one Slice. A new hypothesis or observation does not create a new Slice by itself. When a Working Record exists, use [Track Work](../../skills/track-work/SKILL.md) to preserve the current hypothesis, evidence, blocker, and next distinguishing action.

## Establish The Failure Boundary

Before generating new evidence, identify:

- the failure claim;
- accepted expected behavior and its source;
- observed behavior and existing evidence;
- reported input, state, environment, and reproduction path;
- the strongest boundary currently observed;
- differences between the reported path and available reproduction;
- evidence that already contradicts possible explanations.

Prefer the reported path, environment, and observer. A nearby failure may suggest a hypothesis but does not establish the reported failure.

Reduced-fidelity reproduction remains diagnostic evidence only. State what it cannot prove.

Allowed behavior is not reproduction. A cache hit does not prove a stale-read defect when caching is permitted. A possible race in source does not explain a report until timing, traces, state, or accepted behavior connects it.

## State Competing Hypotheses

State one falsifiable leading hypothesis and only the viable alternatives the next observation must distinguish.

For each, identify:

```text
Hypothesis:
Predicted observation:
Observation that would contradict it:
Meaningful alternative:
```

Do not create a hypothesis around the requested patch and then use that hypothesis to prove the patch is necessary.

When accepted behavior, source truth, or a user-owned choice is unsettled, use [Decision Gate](../../skills/decision-gate/SKILL.md) rather than diagnosing an invented expectation.

## Choose One Distinguishing Loop

Choose the smallest observation whose possible outcomes differ between the meaningful hypotheses at the required boundary.

When the exact loop is not obvious, or several loop shapes remain plausible, read the [Diagnostic Loop Catalog](references/diagnostic-loop-catalog.md).

When timing, randomness, environmental variance, concurrency, or resource behavior shapes the failure, also read [Flaky and Performance Diagnosis](references/flaky-and-performance-diagnosis.md) before selecting or running the loop.

When several tools or observers could execute the same selected loop, or the likely interaction is broad, use [Action Selection](../../skills/action-selection/SKILL.md). It selects the interaction; Diagnose Failure retains the hypothesis and causal question.

Before an active observation, confirm that the authority envelope covers:

- the exact path and environment;
- mutation, repetition, instrumentation, and cost;
- evidence collection and sensitive-data handling;
- cleanup, rollback, or recovery.

Otherwise return the loop's purpose, expected distinguishing evidence, and stop condition to Workflow and wait.

When no safe useful loop exists, stop with the smallest missing evidence: failing input, command, trace, log window, seed, timestamp, environment, permission, or isolated instrumentation.

## Run And Interpret One Iteration

Run one covered observation and change one distinguishing variable at a time.

Apply [Verify Work](../../skills/verify-work/SKILL.md) when the observation requires its full claim-and-boundary method. Diagnosis retains ownership of causal inference after verification returns the evidence.

Keep three results separate.

### Check Result

How did the selected observation's defined assertion execute?

Use Verify Work's check-result semantics:

- **Passed:** the observation executed validly and its assertion held.
- **Failed:** the observation executed validly and its assertion did not hold.
- **Error:** the observer or execution was invalid.
- **Unavailable:** the observation could not be attempted safely or reliably.

A target path may intentionally fail while the diagnostic check Passes. An Error or Unavailable observer says nothing about the production cause.

### Hypothesis Result

What does the evidence establish about the tested hypothesis?

- **Supported:** direct evidence establishes the hypothesis at its stated boundary.
- **Contradicted:** evidence shows the hypothesis is false.
- **Inconclusive:** the observation cannot distinguish it from meaningful alternatives.
- **Unavailable:** the required evidence cannot currently be obtained.

### Cause Status

- **Supported:** the evidence establishes a useful causal explanation.
- **Unresolved:** one or more causal links or meaningful alternatives remain open.

A Supported hypothesis does not automatically establish a Supported cause.

A cause is Supported only when the evidence:

1. establishes the relevant failure or strongest available observer;
2. behaves as the causal explanation predicts;
3. materially weakens meaningful alternatives;
4. connects trigger and state through mechanism to the observed symptom;
5. is sufficient to bound a correction or other next action without guessing.

If evidence supports only the strongest remaining hypothesis, report it as such and identify the observation that would confirm or refute the missing causal link.

## Route From The Iteration

- **Check Error:** repair or replace the observer; do not change production code.
- **Check Unavailable:** stop with the missing evidence or authority.
- **Hypothesis Contradicted:** preserve the evidence, then refine or replace the hypothesis.
- **Hypothesis Inconclusive:** choose a sharper distinguishing loop.
- **Hypothesis Supported, cause Unresolved:** test the remaining causal link or alternative.
- **Cause Supported:** return the causal explanation and correction boundary to Workflow.
- **Behavior or source conflict:** use Decision Gate.
- **Supported structural pressure:** apply [Design for Depth](../../skills/design-for-depth/SKILL.md) under the current owner.
- **Active harm before cause:** return one bounded containment option to Workflow.

Do not continue because diagnosis started. Stop when no safe observation can materially improve the route.

## Protect Diagnostic Evidence

Treat logs, traces, payloads, screenshots, dumps, production samples, and browser state as potentially sensitive. Minimize and sanitize them. Do not expose credentials, tokens, unrestricted personal data, or private payloads.

Bound repetition by time, cost, side effects, and environment safety. Do not repeatedly exercise mutating production behavior without explicit authority and an understood recovery boundary.

Temporary instrumentation must distinguish hypotheses. Keep it isolated and state:

- what it observes;
- mutation or performance impact;
- cleanup and removal condition;
- whether it remains after diagnosis.

Preserve contradictory and unfavorable evidence. Do not rerun until it disappears.

## Identify The Owning Cause

Classify only what evidence supports:

- local implementation defect;
- invalid, stale, or inadequate check;
- environment, dependency, data, timing, or configuration cause;
- missing observer or insufficient evidence;
- unsettled behavior or source conflict;
- wrong result, scope, order, or execution strategy;
- structural ownership, interface, state, or failure-unit pressure.

Diagnosis determines whether observed pressure is causal.

Use Design for Depth only after diagnosis establishes structural pressure, or when direct design evidence independently establishes caller coordination, distributed policy, unowned state, interface leakage, or failure-unit pressure. Design for Depth shapes the supported ownership boundary; it does not re-prove the cause.

If design work exposes an unsupported causal assumption that changes the boundary choice, re-enter diagnosis with that exact assumption and the alternatives it must distinguish.

## Contain Harm Without Claiming A Fix

When immediate harm must be limited before cause is Supported, return one bounded containment option to Workflow.

Containment must:

- reduce immediate harm;
- remain narrower and more reversible than a guessed correction;
- preserve diagnostic evidence;
- define verification and recovery;
- avoid settling unresolved behavior;
- be reported as mitigation, not resolution.

A requested patch may instead be an authorized learning action. Its result can strengthen or weaken a hypothesis; it does not become selected production behavior automatically.

## Return The Correction Boundary

When cause is Supported, return:

- failure claim and required boundary;
- diagnostic loop and observation;
- check result and hypothesis result;
- causal chain;
- alternatives weakened and uncertainty remaining;
- owning cause;
- smallest coherent correction boundary;
- minimized regression signal;
- original reported path or strongest available observer.

The evidence supports the route but does not authorize correction.

Return an authorized correction to [Execute Work](../../skills/execute-work/SKILL.md). Use [TDD](../../skills/tdd/SKILL.md) when the diagnostic loop supplies a stable failing behavior check. Use [Simplify Code](../../skills/simplify-code/SKILL.md) only when the supported cause shows that obsolete or workaround machinery can be removed without changing accepted behavior. Do not use cleanup in place of correcting the supported failure or while its evidence remains unresolved.

After correction, use Verify Work to check both:

1. the minimized regression signal;
2. the original reported path or strongest available observer.

If correction fails, or exposes related shared-state consequences, re-enter diagnosis before another patch.

Do not claim fixed when only containment succeeded, a nearby check passed, or the original boundary remains unavailable.

## Report Proportionately

For one unresolved iteration:

```text
Failure @ boundary:
Diagnostic loop:
Check result:
Hypothesis result:
Cause status: Unresolved
Next distinguishing evidence:
```

For a supported cause, containment, conflicting evidence, or a route handoff:

```text
Failure claim:
Required boundary:
Expected / observed:
Diagnostic loop and evidence:
Check result:
Hypothesis result:
Cause status:
Causal explanation or strongest remaining hypothesis:
Alternatives weakened / unresolved:
Containment or instrumentation:
Correction boundary or next evidence:
Post-correction verification:
```

Omit fields that do not apply. Stop when the supported route, missing evidence, containment boundary, or unresolved decision is explicit.
