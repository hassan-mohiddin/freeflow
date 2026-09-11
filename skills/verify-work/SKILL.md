---
name: verify-work
description: "Use when verifying work or a claim after implementation, tests, builds, runtime checks, failures, conflicting evidence, or incomplete evidence."
---

# Verify Work

Determine what fresh direct evidence establishes about a specific claim at the boundary where it must hold.

Verification establishes facts, not review judgment, authority, or permission to continue. A passing command is not automatically a supported outcome. Test order is not evidence of test validity or implementation correctness.

## Establish The Claim And Its Source

Before choosing a check, identify the behavior or property, the required observing boundary, and the source of its expectation. Keep this compact when obvious; do not let an available test silently narrow a broader claim.

Claims may concern behavior, a reported failure, structural validity, interfaces, integration, host lifecycle, installed artifacts, failure or recovery semantics, performance, or repository state.

Distinguish required acceptance from an optional stronger assertion. If evidence for an optional claim is unavailable, qualify or withdraw that claim rather than automatically add implementation. A required guarantee remains unresolved until supported or explicitly changed by its owner.

When expected behavior is unsettled or sources conflict, return the issue through [Workflow](../../skills/workflow/SKILL.md) or [Decision Gate](../../skills/decision-gate/SKILL.md). Do not encode a guess as an expected result.

## Choose Sufficient Evidence

Use the smallest direct observation that can disagree with the claim. Before relying on an unfamiliar fixture for substantial dependent work, establish that it reaches the required observing stage and distinguishes the relevant wrong behavior. Reuse an adequate existing fixture; observer preparation is not a mandatory separate prototype.

For saved evidence, identify what code/artifact, check, configuration, and environment it examined, using existing outputs and source identities where available. Compare relevant subsequent changes, including new files and generated output. HEAD alone does not identify an uncommitted candidate. Reuse results whose applicability remains supported; rerun only affected evidence when authorized. Do not repeat checks merely because another activity or context began.

Keep two facts separate: the observation occurred, and it applies to the current state. A later edit does not erase an earlier pass; uncertain applicability does not certify the new candidate. Report missing identity or output rather than inventing a receipt or building a new evidence store.

Run active checks only when covered by the current agreement, including contained verification. Otherwise return the purpose, observer, expected evidence, and stop condition to Workflow and wait. A test, reproduction, benchmark, or instrumentation is active evidence generation even before production edits.

Use [Action Selection](../../skills/action-selection/SKILL.md) when several observers are plausible or the likely interaction is broad. It selects and bounds the interaction; Verify Work retains the claim and interprets support. An already-selected focused check needs no extra tool-selection ceremony.

Read the relevant reference before designing or selecting evidence:

- [Test Design](references/test-design.md) before designing or materially changing a behavior check, including regression or characterization coverage.
- [Integration Evidence](references/integration-evidence.md) when a claim depends on a registered callback or executor, host lifecycle, producer invocation, fallback protocol, installed package, or absence counter.
- [Browser Runtime Evidence](references/browser-runtime-evidence.md) for rendered UI, browser behavior, accessibility, networking, console state, visual output, or browser runtime performance.
- [Performance Evidence](references/performance-evidence.md) for latency, throughput, memory, CPU, bundle, query, rendering, capacity, or resource-regression claims.

Browser-performance claims need both browser fidelity and performance methodology. Loading a reference does not expand the required claim.

Passing tests do not prove behavior they do not exercise. Source inspection does not prove runtime execution; a helper call does not prove registration, native dispatch, or installed-package behavior. A happy path does not establish failure handling.

## Run Without Manufacturing A Signal

Before parallel checks, compare what each may write or remove. Serialize checks that share generated directories, caches, outputs, package roots, fixture state, ports, databases, or intentionally stale artifacts. Reproduce a concurrency-induced failure under a non-overlapping schedule before attributing it to production code.

For each covered check:

1. Run the complete selected observation.
2. Inspect output, exit status, assertions, and lower-level evidence that could contradict its summary.
3. Confirm that the intended path ran and the observer matched the claim.
4. Compare the observation with the independent expectation and its source.
5. Preserve failures, contradictions, and partial or reduced-fidelity results.

Do not rerun until unfavorable evidence disappears or change valid tests, implementation, Specs, policy, or acceptance merely to make a signal green. Before revising a material assertion after failure, use Test Design to compare what the old and new checks establish. Repair source-backed observer or expectation errors; a weaker replacement leaves the original claim Inconclusive unless other evidence establishes it. Expose that limitation before acceptance rather than carry the stronger claim into the report.

Tests may be written before or after implementation as the task warrants. No formal test-first sequence is required. If using a failure to support diagnosis or regression claims, actually observe it at the relevant boundary; do not invent an earlier failing run from a later passing test.

## Classify Execution And Support Separately

**Check result** describes the selected check's defined assertion:

- **Passed:** it executed validly and the assertion held.
- **Failed:** it executed validly and the assertion did not hold.
- **Error:** the observing mechanism or execution was invalid.
- **Unavailable:** the check could not be attempted safely or reliably.

A check may Pass by observing an expected rejection or failure.

**Claim result** describes what the evidence establishes:

- **Supported:** direct fresh evidence establishes the claim at its required boundary.
- **Contradicted:** evidence shows the claim is false.
- **Inconclusive:** available evidence cannot establish or refute it at that boundary.
- **Unavailable:** required evidence cannot currently be obtained safely or reliably.

A Passed check can leave the claim Inconclusive. A Failed check can expose a defect, invalid expectation, environment problem, or source conflict. Classify only the supported conclusion. Missing evidence is not zero, safe, passed, or probably correct.

If the user skips a check, respect that choice and leave the corresponding claim unverified. Use [Diagnose Failure](../../skills/diagnose-failure/SKILL.md) when contradictions are unexplained or failure repeats.

## Return Evidence To Its Owner

Return the observation and its limits to the activity using the claim. Base the report on actual assertions, outputs, and the state examined—not test names or the requested work phrased as accomplishments. Distinguish implemented behavior, exercised checks, and supported claims; list missing material cases even when the suite passes. Supported verification permits judgment of the result; it does not itself establish review Pass, close a Slice, or authorize delivery.

When answering a review Needs evidence item, preserve its pointer, claim, required observing boundary, previous evidence limit, and why the gap mattered. Return the result to the receiving agent for adjudication:

- Supported may settle the factual gap without settling the review.
- Contradicted may establish or invalidate a finding or expose a source conflict.
- Inconclusive or Unavailable leaves a material gap open.

Do not revise the independent report, adjudicate its findings, authorize correction, or select another review from verification.

## Report And Stop

For one straightforward Supported claim, report briefly:

```text
Claim @ required boundary: Supported ([check result]) by [evidence].
Proves:
Does not prove:
```

Use fuller reporting when evidence is adverse, conflicting, consequential, multi-boundary, or returning to adjudication:

```text
Review item: [when applicable]
Claim:
Required boundary:
Evidence:
Check result:
Claim result:
Proves:
Does not prove:
Required next evidence: [only when unresolved]
```

Do not manufacture empty fields or proof beyond the observation. When the result changes the work's direction or reaches its boundary, return to Workflow. Stop once the claim is classified and the supported next route or missing evidence is explicit.
