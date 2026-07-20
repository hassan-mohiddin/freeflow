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

Reading this skill does not create independence. If you produced the work, do not present your own judgment as independent review. Read [the reviewer prompt](references/reviewer-prompt.md) when preparing or performing a separately selected independent review.

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

After independent review, the receiving active agent adjudicates each item against the work, source truth, and evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, out of scope, or based on a source misread.
- **Open:** a question or evidence gap prevents acceptance or rejection.

Confirm whether each accepted Issue is Blocking or Non-blocking, then derive the adjudicated judgment. Do not accept the reviewer's overall judgment separately.

Route from the adjudicated result:

- **Pass:** proceed.
- **Non-blocking:** proceed with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not cross the boundary; re-enter the narrowest owning activity, defer, or stop.

Review findings are evidence, not commands. They do not authorize edits. Accepted implementation corrections leave review and return to [Execute Work](../execute-work/SKILL.md); they may remain in the same [Track Work](../track-work/SKILL.md) slice while its intended result stays coherent.

When correction authority is not already explicit, ask once for either:

- the accepted corrections plus one warranted focused follow-up review; or
- the accepted corrections alone when direct evidence can settle the changed boundary.

Then wait for the user's response. Do not correct or dispatch a follow-up from the request, and do not ask again when existing authority already covers the bounded correction or review.

Verify authorized corrections. Run a follow-up only when the changed boundary still needs independent judgment and that dispatch is authorized. Do not change tests, Specs, policies, or accepted behavior merely to satisfy a reviewer or obtain Pass.

## Limit The Review Cycle

For one independently reviewed work state and boundary:

1. Review 1 is the normal broad review.
2. Review 2, when needed and authorized, focuses on accepted corrections, affected interactions, and remaining risk.
3. Review 3 is exceptional, authorized separately, and final for that cycle.

The budget is a cap, not dispatch authority. Do not request Review 4. At the cap, adjudicate and return control to Workflow; the work may proceed, remain blocked, re-enter another owner, defer, or stop.

After Review 2 is adjudicated Blocking, stop before proposing another correction or Review 3. Classify its relationship to the prior correction:

- If the blocker repeats, extends, invalidates, or exposes another consequence of the prior correction, or its cause remains unsupported, read [Diagnose Failure](../diagnose-failure/SKILL.md) and diagnose the shared cause before another patch.
- If it is an independent clear local defect with a supported cause, return directly to its owning activity and state why diagnosis is unnecessary.

A reviewer judgment alone does not trigger diagnosis; active-agent adjudication and evidence do. Review 3 is final judgment after the cause and correction boundary are understood, not a third attempt to discover the cause through patches. Workflow may later establish a new cycle only for a materially new reviewed state and boundary; local fixes, a different reviewer, or renamed scope do not reset it.

## Report

For self-review, report no formal review result. Correct clear local issues and surface only unresolved material issues that change the route.

For independent review, use the structured output in [the reviewer prompt](references/reviewer-prompt.md). The receiving agent reports the reviewer and adjudicated judgments, each material item's Accepted, Rejected, or Open outcome and reason, remaining open items, and authorized or proposed next route.

Omit empty groups. Support material judgments and adjudication with source or evidence rather than confidence.
