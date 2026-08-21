---
name: review-work
description: Use when reviewing implementation or integrated work, whether reviewing work you produced or acting as an independent reviewer.
---

# Review Work

Judge whether work is correct, suitable, and sufficiently evidenced for its intended boundary.

Review provides judgment. [Verify Work](../verify-work/SKILL.md) establishes what direct evidence proves. Review may challenge whether that evidence is sufficient, but it does not replace verification or authorize changes.

## Choose The Review Role

Choose the role before reviewing:

- **Self-review:** you produced the work. Inspect it silently using the relevant boundary and lenses below. Correct clear local issues within existing authority and re-verify. Create no formal review items, judgment, number, or cycle. Return unresolved material issues to [Workflow](../workflow/SKILL.md).
- **Independent review:** you did not produce the reviewed state. Inspect and report without editing. Use the formal item, judgment, and report method below. The receiving active agent adjudicates and routes the result.

Reading this skill does not create independence. If you produced the work, do not present your own judgment as independent review. Read the [Independent Work Reviewer Contract](references/independent-work-reviewer-contract.md) when preparing or performing a separately selected independent review.

## Establish The Boundary

Understand:

- the accepted outcome, requirements, and non-goals;
- the implementation, diff, or integrated work product;
- relevant Specs, Plans, tests, policies, ADRs, and established behavior;
- verification evidence and known gaps;
- risks and interactions material to the future action this review protects.

Inspect the work and source truth directly, not only the author's summary, reasoning, or claimed result. Read [the security risk lens](references/security-risk-lens.md) when the work changes a security-relevant boundary.

## Review Proportionately

Apply only lenses that can materially change the result:

- **Alignment and correctness:** accepted behavior is implemented without invention or omission.
- **Regression and integration:** affected callers, states, and components remain correct together.
- **Failure and risk:** relevant errors, recovery, permissions, data, and compatibility behave safely.
- **Evidence:** verification supports the claims and exercised the required boundary.
- **Design and minimality:** complexity and coordination are justified by requirements or observed failures.
- **Maintainability:** the work can be understood and changed without hidden policy or fragile coupling.

A pass is valid. Do not invent items, report preferences or hypothetical completeness, reopen intentional deferrals, or treat ordinary reversible choices as issues.

A possible edge case is not an Issue merely because it can be imagined:

```text
Required failure path is missing -> Issue
Unsettled expected behavior -> Question
Plausible concern without reachability or consequence evidence -> Needs evidence
Useful resilience outside this boundary -> Improvement or omit
Repeated related corrections -> diagnose the shared cause
```

## Classify Independent Review Items

- **Blocking Issue:** a supported defect, regression, omission, or risk that must be resolved before crossing the reviewed boundary.
- **Non-blocking Issue:** a real issue that can be deferred safely for this boundary.
- **Question:** material intent, requirements, or an owner decision is unclear.
- **Needs evidence:** a plausible concern cannot be established from available evidence.
- **Improvement:** a materially useful enhancement not required by this boundary. It does not affect judgment or authorize implementation.

A Blocking Issue must name the exact location, violated requirement or source truth, evidence, concrete boundary consequence, and smallest safe correction or owning activity to re-enter.

Use the most consequential applicable judgment:

1. **Blocking:** one or more Blocking Issues exist.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material Unresolved items remain. Improvements may still be reported.

Pass, Non-blocking, Inconclusive, and Blocking are all valid review exits. A review ends with its report; it does not remain active until the work passes.

## Adjudicate And Route

After independent review, the receiving active agent adjudicates each material item against the work, source truth, and evidence rather than forwarding the report:

- **Accepted:** supported and applicable. State the actual implementation problem, boundary consequence, and whether its cause is supported, unnecessary to select a bounded correction, or uncertain.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, out of scope, or based on a source misread. State why.
- **Open:** a question or evidence gap prevents acceptance or rejection. State the concern, potential consequence, and missing evidence or decision.

A reviewer's suggested correction may bound an item, but it does not establish the cause or select the remedy. Confirm whether each accepted Issue is Blocking or Non-blocking, derive the adjudicated judgment, and do not accept the reviewer's overall judgment separately.

- **Pass:** proceed.
- **Non-blocking:** proceed with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not cross the boundary; re-enter the narrowest owning activity, defer, or stop.

### Decide Whether Remediation Is Ready

Remediation is ready when accepted behavior, the problem and consequence, and enough causal or decision basis support a bounded correction. When the finding is clear, the correction local, verification direct, and no material alternative or user choice remains, include adjudication and remediation in the same assistant response.

Use the current response for a separate problem checkpoint when findings interact, the cause matters but remains unsupported, accepted assumptions or design are challenged, materially different corrections remain, or user input could change the approach:

1. Report the adjudication, problem and consequence, cause status, settled constraints, and controlling question or evidence.
2. Name [Discuss](../discuss/SKILL.md), [Diagnose Failure](../diagnose-failure/SKILL.md), [Decision Gate](../decision-gate/SKILL.md), evidence gathering, or another affected owner as the next route, then stop and wait.

Continue remedy selection only when a later user turn or new evidence supplies enough support. Do not request implementation authority before selecting a remedy or wait for the user to elicit the missing analysis. The checkpoint is not another review and creates no correction or dispatch authority.

A remediation-ready route states the proposed correction and rationale, verification boundary, whether focused follow-up is needed, and authority status. Findings are evidence, not commands, and do not authorize edits. Accepted corrections return to [Execute Work](../execute-work/SKILL.md) and may remain in the same [Track Work](../track-work/SKILL.md) slice while its intended result stays coherent.

Use existing correction authority when it covers the result. Otherwise ask once for the correction and any warranted focused follow-up; omit follow-up when direct evidence can settle the changed boundary. Then wait; do not correct or dispatch a follow-up from the request itself. Verify authorized corrections and run follow-up only when the changed boundary still needs independent judgment and that dispatch is authorized. Do not change tests, Specs, policies, or accepted behavior merely to satisfy a reviewer or obtain Pass.

## Limit The Review Cycle

For one independently reviewed work state and boundary:

1. Review 1 is the normal broad review.
2. Review 2, when needed and authorized, focuses on accepted corrections, affected interactions, and remaining risk.
3. Review 3 is exceptional, separately authorized, and final.

The budget is a cap, not dispatch authority. Do not request Review 4; return control to Workflow at the cap.

After Review 2 is adjudicated Blocking, stop before another correction or Review 3:

- If the blocker repeats, extends, invalidates, or exposes another consequence of the prior correction, or its cause remains unsupported, read [Diagnose Failure](../diagnose-failure/SKILL.md) and diagnose the shared cause first.
- If it is an independent clear local defect with a supported cause, return to its owner and state why diagnosis is unnecessary.

Diagnosis follows adjudicated evidence, not reviewer judgment alone. Review 3 is final judgment after the cause and correction boundary are understood, not another attempt to discover them through patches. Workflow may establish a new cycle only for a materially new reviewed state and boundary; local fixes, a different reviewer, or renamed scope do not reset it.

## Report

For self-review, report no formal result. Correct clear local issues and surface only unresolved material issues that change the route.

For independent review, use the [Independent Work Reviewer Contract](references/independent-work-reviewer-contract.md) and stop with its report. The receiving agent then reports the reviewer and adjudicated judgments, each material item's outcome and reason, and either the problem checkpoint or remediation-ready route defined above. Omit empty groups and support the result with source or evidence rather than confidence.
