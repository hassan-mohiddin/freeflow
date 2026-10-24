---
name: verify-work
description: "Use whenever you need to know whether something works or a claim is true: running tests, builds, linters or type checks; reproducing a bug or checking a fix; trying the real path in the running software, a browser or a CLI; measuring performance; and reading what the output actually shows, including failures and conflicting results. Read it before saying a change works, is fixed or is done. Also use when writing, designing or changing a test, fixture or regression check; when a claim depends on an integration, host lifecycle, an installed package, rendered UI or browser behavior, or performance; and when setting up, following or updating a project's saved steps for launching its software and trying each feature as a user would, or rechecking them after the software changed."
---

# Verify Work

Determine what fresh direct evidence establishes about a specific claim at the boundary where it must hold.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

Read the routed reference before designing or selecting evidence. Loading one does not expand the required claim.

| Situation | Go to |
| --- | --- |
| Designing or materially changing a behavior check, including regression or characterization coverage and a test's fixture or shared setup | [Test Design](references/test-design.md); before reporting such a change, list it with [test-changes](scripts/test-changes.mjs) |
| A claim that depends on a registered callback or executor, host lifecycle, producer invocation, fallback protocol, installed package, or absence counter | [Runtime Evidence: Integration](references/runtime-evidence.md#integration) |
| Rendered UI, browser behavior, accessibility, client networking, console state, visual output, or browser runtime performance | [Runtime Evidence: Browser](references/runtime-evidence.md#browser) |
| Latency, throughput, memory, CPU, bundle, query, rendering, capacity, or resource-regression claims | [Runtime Evidence: Performance](references/runtime-evidence.md#performance) |
| A claim about what a user sees or does in the running software, or a change to code a feature file covers | [Runtime Evidence: Project Recipe](references/runtime-evidence.md#project-recipe) |
| Setting up a saved, tested way to check the project's software live (feature files, a shared guide and a helper that launches it and drives each feature as a user would), or rechecking one after the software changed, a feature was added, or the docs check marks a feature file stale | [Feature Map](references/feature-map.md) |
| Contradictions that are unexplained, or failure that repeats | Execute Work's [diagnose](../../skills/execute-work/references/diagnose.md) |
| Expected behavior that is unsettled, or sources that conflict | [Discuss Work](../../skills/discuss-work/SKILL.md) |

## Rules

- Verification establishes facts, not review judgment, authority, or permission to continue. A Supported claim permits judgment of the result; it does not establish a review Pass, close a Slice, or authorize delivery.
- Never encode a guess as an expected result. When expected behavior is unsettled or sources conflict, return the issue through Discuss Work. A test that pins a choice the user has not agreed says so.
- Run an active check (a test, build, reproduction, benchmark, or instrumentation) only when it is covered: a request or agreement covers the checks its work needs, and an independent review covers what its brief's `May run` line names. Otherwise propose the purpose, observer, expected evidence, and stop condition to the user and wait.
- Never rerun until unfavorable evidence disappears, and never change valid tests, implementation, Specs, policy, or acceptance merely to make a signal green. Preserve failures, contradictions, and partial or reduced-fidelity results.
- If a revised check establishes less than the original, the original claim stays Inconclusive unless other evidence establishes it at the required boundary; expose that limitation before acceptance rather than carry the stronger claim into the report.
- Missing evidence is not zero, safe, passed, or probably correct. Never invent a receipt or an earlier failing run that was not observed. If the user skips a check, leave the corresponding claim unverified.
- Base reports on actual assertions, outputs, and the state examined, not on test names or on the requested work phrased as accomplishments.

## Establish The Claim And Its Source

Goal: know exactly what is being claimed, where it must hold, and why it is expected, before choosing a check.

Identify the behavior or property, the required observing boundary, and the source of its expectation. Keep this compact when obvious; do not let an available test silently narrow a broader claim. Claims may concern behavior, a reported failure, structural validity, interfaces, integration, host lifecycle, installed artifacts, failure or recovery semantics, performance, or repository state. A claim that a change is safe names the one fact it rests on, with a check that shows it, graded as [Work Review](../../skills/review-work/references/work.md)'s safety-evidence lens describes.

Distinguish required acceptance from an optional stronger assertion. If evidence for an optional claim is unavailable, qualify or withdraw that claim rather than automatically add implementation. A required guarantee remains unresolved until supported or explicitly changed by its owner.

## Choose Sufficient Evidence

Goal: the smallest observation that could actually disagree with the claim, at the right boundary.

Use the smallest direct observation that can disagree with the claim. Before relying on an unfamiliar fixture for substantial dependent work, establish that it reaches the required observing stage and distinguishes the relevant wrong behavior. Reuse an adequate existing fixture.

For saved evidence, identify what code or artifact, check, configuration, and environment it examined, using existing outputs and source identities where available. Compare relevant later changes, including new files and generated output; HEAD alone does not identify an uncommitted candidate. Keep two facts separate: the observation occurred, and it applies to the current state. A later edit does not erase an earlier pass, and uncertain applicability does not certify the new candidate. Report missing identity or output rather than building a new evidence store. Reuse results whose applicability remains supported; rerun only affected evidence, and do not repeat checks merely because another activity or context began.

When the project keeps a feature map (feature files in its developer docs that drive the software as a user would, set up and kept through [Feature Map](references/feature-map.md)), find the feature files covering the changed code with Write Docs' docs check, `docs-check.mjs --covering <path> --driven`, or in Execute Work's self-review report. A claim about what a user sees in a feature such a file covers needs its steps driven through the Project Recipe route; tests settle it only where they exercise that same path. A file marked stale was not driven since its code changed.

Passing tests do not prove behavior they do not exercise. Source inspection does not prove runtime execution; a helper call does not prove registration, native dispatch, or installed-package behavior; a happy path does not establish failure handling.

## Run Without Manufacturing A Signal

Goal: the observation reflects the candidate, not the harness or the schedule.

Before parallel checks, compare what each may write or remove. Serialize checks that share generated directories, caches, outputs, package roots, fixture state, ports, databases, or intentionally stale artifacts. Reproduce a concurrency-induced failure under a non-overlapping schedule before attributing it to production code.

For each covered check:

1. Run the complete selected observation.
2. Inspect output, exit status, assertions, and lower-level evidence that could contradict its summary.
3. Confirm that the intended path ran and the observer matched the claim.
4. Compare the observation with the independent expectation and its source.

For a consequential claim, keep the check as a re-runnable script in the task's scratch location and point to it.

Before revising a material assertion after failure, use Test Design to compare what the old and new checks establish. Repair source-backed observer or expectation errors.

Tests may be written before or after implementation as the task warrants; no test-first sequence is required, and test order is not evidence of validity. When a failure supports a diagnosis or regression claim, actually observe it at the relevant boundary.

## Classify Execution And Support Separately

Goal: never let a check's outcome stand in for what the evidence proves.

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

A Passed check can leave the claim Inconclusive. A no-regression or parity claim without an observed baseline is Inconclusive. A Failed check can expose a defect, an invalid expectation, an environment problem, or a source conflict; classify only the supported conclusion, and diagnose when contradictions are unexplained or failure repeats.

## Return Evidence To Its Owner

Goal: the activity using the claim gets the observation and its limits, and nothing it did not ask for.

Return the observation and its limits to the activity using the claim. Distinguish implemented behavior, exercised checks, and supported claims, and list missing material cases even when the suite passes.

When answering a review Needs evidence item, preserve its pointer, claim, required observing boundary, previous evidence limit, and why the gap mattered, and return the result to the receiving agent, whose [adjudication](../../skills/review-work/references/adjudication.md) decides what each claim result settles. Do not revise the independent report, adjudicate its findings, authorize correction, or select another review from verification.

## Report And Stop

Report each claim in this shape:

```text
Review item: [only when answering one]
Claim @ required boundary: [claim result] ([check result]) by [evidence].
Proves:
Does not prove:
Required next evidence: [only when unresolved]
```

One straightforward Supported claim needs only the middle three lines. When evidence is adverse, conflicting, consequential, multi-boundary or returning to adjudication, give each claim and boundary its own entry. Do not manufacture empty fields or proof beyond the observation. When the result changes the work's direction or reaches its boundary, return it to the current owner. Stop once the claim is classified and the supported next route or missing evidence is explicit.
