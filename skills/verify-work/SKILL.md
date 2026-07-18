---
name: verify-work
description: Use when verifying work or a claim after implementation, tests, builds, runtime checks, failures, conflicting evidence, or incomplete evidence.
---

# Verify Work

Determine whether fresh evidence supports a specific claim at the required observing boundary.

Verification is factual: what ran, what happened, and what that result proves. The active agent owns verification and routes from its result. Reading or invoking this skill changes neither role nor authority; it creates no review judgment or permission to continue.

## Name The Claim

State the claim before choosing the check. Include the behavior or property and the boundary where it must hold.

Claims may concern:

- observable behavior or a reported failure;
- build, type, lint, format, schema, or structural validity;
- public interfaces, integration, host lifecycle, or installed artifacts;
- failure, retry, recovery, degradation, or fail-closed behavior;
- performance or resource bounds;
- artifact completeness or repository state.

Do not let an available check silently narrow a broader claim.

## Choose Evidence That Can Disagree

Use the smallest direct evidence that can falsify the claim. Evidence must be fresh for the code, configuration, environment, and artifact being assessed.

Passing tests do not prove behavior they do not exercise. A happy path does not prove failure handling. Source inspection does not prove runtime execution. A helper call does not prove registration, host dispatch, or installed-package behavior.

Read [integration evidence](references/integration-evidence.md) for callback, host-lifecycle, installed-artifact, absence, or mutation-footprint claims. Read [browser runtime evidence](references/browser-runtime-evidence.md) for rendered, interactive, network, accessibility, console, or visual claims. Read [performance evidence](references/performance-evidence.md) for latency, throughput, memory, CPU, bundle, query, or resource claims.

Review may judge whether evidence is sufficient, but review does not prove that behavior occurred.

## Run And Interpret

1. Run the complete selected check.
2. Read the relevant output, exit status, and lower-level evidence that can contradict a summary.
3. Confirm the intended success or failure path and observing boundary were exercised.
4. Compare the observation with the exact claim and source requirement.
5. Preserve contradictory evidence; do not rerun until an unfavorable result disappears.
6. State unavailable, stale, partial, or reduced-fidelity evidence honestly.

Do not convert missing evidence into zero, safe, passed, or probably correct. If the user skips a check, respect that choice and leave the corresponding claim unverified.

Do not change implementation, tests, checks, specs, policies, or acceptance merely to make the signal green. When the cause of a contradiction is unclear, report the contradiction rather than inventing one.

## Classify The Result

Keep check execution separate from claim support.

**Check result:**

- **Passed:** the check completed successfully.
- **Failed:** the check completed and observed a failure.
- **Error:** the check itself did not execute validly.
- **Unavailable:** the required check could not be run.

**Claim result:**

- **Supported:** direct fresh evidence establishes the claim at its stated boundary.
- **Contradicted:** evidence shows the claim is false.
- **Inconclusive:** evidence exists but cannot establish or refute the claim at the required boundary.
- **Unavailable:** the required evidence cannot currently be obtained safely or reliably.

A passed check may still leave the claim inconclusive. A failed check may expose an implementation defect, an invalid check, an environment problem, or a source conflict; classify only what evidence supports.

When contradictory evidence is unexplained or failure repeats, read [Diagnose Failure](../diagnose-failure/SKILL.md). When evidence exposes a user-owned decision or source conflict, read [Decision Gate](../decision-gate/SKILL.md).

## Report

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

Omit `Required next evidence` when the claim is fully supported or contradicted. When the result changes or ends the current path, use [Workflow](../workflow/SKILL.md) to choose what follows.
