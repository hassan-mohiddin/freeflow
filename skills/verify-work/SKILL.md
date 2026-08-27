---
name: verify-work
description: Use when verifying work or a claim after implementation, tests, builds, runtime checks, failures, conflicting evidence, or incomplete evidence.
---

# Verify Work

Determine whether fresh evidence supports a specific claim at the required observing boundary.

Verification is factual: what ran, what happened, and what that result proves. The active agent owns verification and routes from its result. Reading or invoking this skill changes neither role nor authority and creates no review judgment or permission to continue.

## Name The Claim

State the claim before choosing the check. Include the behavior or property and the boundary where it must hold. Keep this compact when both are obvious; do not let an available check silently narrow a broader claim.

Claims may concern:

- observable behavior or a reported failure;
- build, type, lint, format, schema, or structural validity;
- public interfaces, integration, host lifecycle, or installed artifacts;
- failure, retry, recovery, degradation, or fail-closed behavior;
- performance or resource bounds;
- artifact completeness or repository state.

## Choose Evidence That Can Disagree

Use the smallest direct evidence that can falsify the claim. Evidence must be fresh for the code, configuration, environment, and artifact being assessed.

Verification inherits the current authority envelope. Existing evidence may be inspected without a new run. Run a new active check only when that envelope covers it directly or as contained verification; otherwise return its purpose, expected evidence, and stop condition to [Workflow](../../skills/workflow/SKILL.md) and wait.

Verify Work owns the claim and required evidence boundary. When several covered observers can falsify the same claim, or the likely check is broad, use [Action Selection](../../skills/action-selection/SKILL.md) to choose and bound one environment interaction. It returns the observation; Verify Work interprets and classifies support. Skip it when one exact check is already selected.

Before running covered checks concurrently, compare what each may write or remove. Run checks serially when they share generated directories, caches, build outputs, package roots, fixture state, ports, databases, or intentional stale-artifact files. A concurrency-induced red signal is orchestration evidence, not automatically an implementation defect; reproduce it under a non-overlapping or serial schedule before changing production code.

Passing tests do not prove behavior they do not exercise. A happy path does not prove failure handling. Source inspection does not prove runtime execution. A helper call does not prove registration, host dispatch, or installed-package behavior.

Before selecting or running evidence:

- read [integration evidence](references/integration-evidence.md) when a claim depends on a registered callback or executor, host lifecycle, producer invocation, fallback protocol, installed package, or absence counter;
- read [browser runtime evidence](references/browser-runtime-evidence.md) when a claim depends on rendered UI, browser behavior, accessibility, client networking, console state, visual output, or browser runtime performance;
- read [performance evidence](references/performance-evidence.md) when verifying latency, throughput, memory, CPU, bundle, query, rendering, capacity, or resource-regression claims.

For browser-performance claims, read both Browser Runtime Evidence for runtime fidelity and Performance Evidence for workload, baseline, variance, and metrics.

Review may judge whether evidence is sufficient, but review does not prove that behavior occurred.

## Run And Interpret

Once the selected check is authorized:

1. Run the complete selected check.
2. Read the relevant output, exit status, and lower-level evidence that can contradict a summary.
3. Confirm the defined assertion and intended success or failure path were exercised.
4. Confirm the observing boundary actually matched the claim.
5. Compare the observation with the exact claim and source requirement.
6. Preserve contradictory evidence; do not rerun until an unfavorable result disappears.
7. State unavailable, stale, partial, or reduced-fidelity evidence honestly.

Do not convert missing evidence into zero, safe, passed, or probably correct. If the user skips a check, respect that choice and leave the corresponding claim unverified.

Do not change implementation, tests, checks, Specs, policies, or acceptance merely to make the signal green. When the cause of a contradiction is unclear, report the contradiction rather than inventing one.

## Classify The Result

Keep check execution separate from claim support.

**Check result** is relative to the check's defined assertion—not whether the target operation happened to succeed or fail:

- **Passed:** the check executed validly and its defined assertion held.
- **Failed:** the check executed validly and its defined assertion did not hold.
- **Error:** the observing mechanism or check execution was invalid.
- **Unavailable:** the required check could not be attempted safely or reliably.

A check can Pass while intentionally observing rejection, failure, rollback, or fail-closed behavior.

**Claim result:**

- **Supported:** direct fresh evidence establishes the claim at its stated boundary.
- **Contradicted:** evidence shows the claim is false.
- **Inconclusive:** evidence exists but cannot establish or refute the claim at the required boundary.
- **Unavailable:** the required evidence cannot currently be obtained safely or reliably.

A Passed check may still leave the claim Inconclusive. A Failed check may expose an implementation defect, an invalid expectation, an environment problem, or a source conflict; classify only what evidence supports.

When contradictory evidence is unexplained or failure repeats, read [Diagnose Failure](../../skills/diagnose-failure/SKILL.md). When evidence exposes a user-owned decision or source conflict, read [Decision Gate](../../skills/decision-gate/SKILL.md).

## Return Evidence To Review

When verification answers a review **Needs evidence** item, preserve the original review-item pointer, claim, required observing boundary, available evidence and prior limit, and why the gap affects review judgment.

Return the verification result to the receiving agent for adjudication:

- **Supported:** the factual gap may be resolved; do not infer review Pass.
- **Contradicted:** the finding may be established, invalidated, or expose a source conflict; do not classify the review item here.
- **Inconclusive:** the review item remains Open when the gap is material.
- **Unavailable:** the review item remains Open and the observing limitation must remain explicit.

Verification does not revise the independent review report, adjudicate findings, authorize correction, or select follow-up review.

## Report Proportionately

For one straightforward Supported claim with an obvious check and boundary, use the compact form:

```text
Claim @ required boundary: Supported ([check result]) by [evidence].
Proves:
Does not prove:
```

Use the full form when the result is Contradicted, Inconclusive, or Unavailable; several claims or boundaries are involved; evidence conflicts; the claim is consequential; or the result returns to review adjudication:

```text
Claim:
Required boundary:
Evidence:
Check result:
Claim result:
Proves:
Does not prove:
Required next evidence:
```

When returning evidence for adjudication, prepend `Review item:` with the original item pointer. Omit `Required next evidence` when the claim is fully Supported or Contradicted. When the result changes or ends the current path, return it to [Workflow](../../skills/workflow/SKILL.md) to choose what follows.
