---
name: diagnose-failure
description: "Use when a bug, failure, regression, performance problem, or repeated unsuccessful correction lacks a supported cause."
---

# Diagnose Failure

Establish what fails and why before selecting a correction. A supported cause distinguishes meaningful alternatives well enough to bound the next action; it does not require impossible certainty.

A plausible path, requested patch, reviewer theory, or favorable rerun is not a supported cause. Diagnosis owns the causal question, interpretation, and correction boundary—not authority to run experiments or change production.

## Enter For An Unsettled Cause

Use diagnosis for unexplained bugs, failed checks, regressions, flaky or environmental behavior, contradictory observations, and corrections that repeatedly fail or expose related coordination.

Do not investigate an ordinary mistake when fresh evidence already establishes a clear local defect and the accepted remedy. Return that correction to [Workflow](../../skills/workflow/SKILL.md). Finding count or several bugs in one area does not establish a shared structural cause.

Keep diagnosis within the same coherent Slice. Use [Track Work](../../skills/track-work/SKILL.md) when continuity requires preserving the hypothesis, discriminating evidence, rejected approaches, blocker, and next useful action. Do not record every trial.

## Establish The Failure, Not The Proposed Fix

Identify only what the investigation needs:

- accepted expected behavior and its source;
- observed symptom and available counterevidence;
- relevant input, state, environment, timing, and reported path;
- the strongest boundary actually observed;
- any difference between that boundary and the reported failure.

Prefer the reported path and environment. A nearby symptom may suggest a hypothesis but does not reproduce the reported defect. State reduced-fidelity limits explicitly.

Allowed behavior is not a bug: a cache hit does not establish stale-read failure when caching is permitted. A possible race in source is not the cause without evidence connecting its timing and state to the symptom.

Use [Decision Gate](../../skills/decision-gate/SKILL.md) when accepted behavior or source truth is unsettled. Do not invent an expectation and then diagnose why the implementation violates it.

## Choose A Distinguishing Observation

State a falsifiable leading explanation and only the viable alternatives the next observation must distinguish:

```text
Hypothesis:
Predicted observation:
What would contradict it:
Meaningful alternative:
```

Choose a repeatable diagnostic loop whose possible results differ between those explanations. Do not build a hypothesis around the requested patch and then treat consistency with it as proof of necessity.

Read [Diagnostic Loop Catalog](references/diagnostic-loop-catalog.md) when the exact loop is not obvious or several loop shapes are plausible. Read [Flaky and Performance Diagnosis](references/flaky-and-performance-diagnosis.md) when timing, randomness, environment, concurrency, or resources shape the failure.

Use [Action Selection](../../skills/action-selection/SKILL.md) when tools, targets, or observers for the selected causal question remain uncertain or broad. Stop reading when adequate context supports the experiment; the objective is not exhaustive understanding of the subsystem.

Before active evidence generation, confirm that the agreement covers the path, environment, repetition, instrumentation, cost, sensitive-data handling, and cleanup or recovery. Covered bug investigation needs no extra permission solely because it is diagnosis. Otherwise return the proposed observation and stop condition to Workflow and wait.

If no safe useful observer is available, report the smallest missing input, trace, environment, permission, or instrumentation rather than patching a guess.

## Interpret One Iteration

Run one covered observation, changing one distinguishing variable at a time. Use [Verify Work](../../skills/verify-work/SKILL.md) for its claim-and-boundary method when needed. Diagnosis retains ownership of causal inference.

Keep three results separate:

- **Check result:** Passed, Failed, Error, or Unavailable under Verify Work's assertion-relative meanings. Observing an expected target failure can be a Passed check.
- **Hypothesis result:** Supported, Contradicted, Inconclusive, or Unavailable at the stated observing boundary.
- **Cause status:** Supported or Unresolved.

A supported hypothesis need not establish the cause. A useful supported cause connects trigger and state through mechanism to the symptom, predicts the observations, materially weakens viable alternatives, and is sufficient to bound a correction without guessing.

If only the strongest remaining hypothesis is supported, say so and identify its missing causal link. Do not claim certainty from one consistent observation.

Route from the result:

- Check Error -> repair or replace the observer, not production.
- Check Unavailable -> return the missing evidence or authority.
- Hypothesis Contradicted -> preserve the result and revise the explanation.
- Hypothesis Inconclusive -> choose a sharper observer if one is useful and covered.
- Hypothesis Supported, cause Unresolved -> test the remaining material link or alternative.
- Cause Supported -> return the correction boundary.

Stop when the cause is sufficiently supported or no covered observation can materially improve the decision. Do not keep investigating merely because stronger certainty is imaginable.

## Keep The Investigation Inside The Task

Before following another prerequisite, distinguish a limitation of the current observer or approach from a requirement of the accepted outcome. A failed reproduction method is not proof that production needs new infrastructure, stronger guarantees, or a host change.

Choose the smallest supported correction preserving accepted behavior. If the remedy changes scope, compatibility, public behavior, failure semantics, or another user-owned boundary, return the concrete consequence and alternatives through Workflow before adopting it.

Classify only the owning cause supported by evidence:

- local implementation defect;
- invalid, stale, or inadequate check;
- environment, dependency, data, timing, or configuration issue;
- missing observer or evidence;
- unsettled behavior or source conflict;
- wrong result, scope, order, or strategy;
- structural ownership, interface, state, or failure-unit pressure.

Use [Design for Depth](../../skills/design-for-depth/SKILL.md) when causal or direct design evidence establishes structural pressure. It shapes the boundary without re-proving the cause. If design reveals an unsupported causal premise, return to diagnosis with that exact uncertainty.

## Protect Evidence And Contain Harm

Logs, traces, payloads, dumps, screenshots, and browser state may be sensitive. Minimize and sanitize them; do not expose credentials or unnecessary private data. Bound repetitions by time, cost, effects, and environment safety. Preserve unfavorable evidence rather than rerunning until it disappears.

Temporary instrumentation must distinguish hypotheses. Keep it isolated and state its observer, mutation/performance impact, removal condition, and whether it remains afterward.

When immediate harm needs containment before diagnosis is settled, return one narrower, reversible mitigation to Workflow. It must preserve evidence, define checking and recovery, and avoid settling undefined behavior. Report mitigation as containment, not resolution.

A requested experimental patch can generate evidence when authorized as learning. It does not automatically select production behavior or authorize continuing beyond its question.

## Return A Supported Correction Boundary

Return proportionately:

- failure and accepted expectation at the required boundary;
- observed diagnostic loop, check result, and hypothesis result;
- causal chain, alternatives weakened, and remaining uncertainty;
- owning cause and smallest coherent correction;
- minimized regression signal and original reported path or strongest available observer;
- instrumentation, containment, residual effects, and authority limits.

An already-covered correction can return to [Execute Work](../../skills/execute-work/SKILL.md). Preserve the diagnostic evidence and use suitable regression checks without prescribing a formal test-first sequence. Use [Verify Work](../../skills/verify-work/SKILL.md) to design or classify those checks. Use [Simplify Code](../../skills/simplify-code/SKILL.md) only for an accepted behavior-preserving removal of obsolete or workaround machinery, not as a substitute for the fix.

After correction, verify the minimized regression signal and the original reported path or strongest available observer. A nearby passing test is insufficient. If the fix fails or reveals related shared-state consequences, re-enter the affected causal question before another patch.

Stop with the supported correction, missing evidence, containment boundary, or unresolved decision explicit. Do not claim fixed when only mitigation succeeded or the reported boundary remains unverified.
