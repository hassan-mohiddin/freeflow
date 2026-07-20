---
name: review-artifact
description: Use when reviewing a Working Record, spec, PRD, issue, API contract, technical design, migration contract, plan, decision record, ADR, handoff, or other durable artifact for fitness to guide its intended use.
---

# Review Artifact

Judge whether an artifact is aligned, sufficient, and fit to guide its intended use.

## Choose The Review Role

Choose the role before reviewing:

- **Self-review:** you produced the artifact. Inspect it silently using the relevant boundary and lenses below. Correct clear local issues within existing authority. Create no formal review items, judgment, number, or cycle. Return unresolved material issues to [Workflow](../workflow/SKILL.md).
- **Independent review:** you did not produce the reviewed state. Inspect and report without editing. Use the formal item, judgment, and report method below. The receiving active agent adjudicates and routes the result.

Reading this skill does not create independence. If you produced the artifact, do not present your own judgment as independent review. Read [the reviewer prompt](references/reviewer-prompt.md) when preparing or performing a separately selected independent review.

## Establish The Boundary

Understand:

- artifact type, current state, and intended use;
- accepted outcome, requirements, and non-goals;
- owner decisions and unresolved questions;
- relevant code, tests, policies, ADRs, and established behavior;
- upstream and downstream artifacts;
- evidence gaps and prior review when applicable.

Review the complete current artifact, not only its summary, change description, or author's reasoning. Review upstream authority before dependent artifacts. If an upstream issue invalidates downstream assumptions, mark affected material contingent instead of generating exhaustive findings against an unresolved basis.

When reviewing a Working Record, read [Track Work](../track-work/SKILL.md), which owns its format and lifecycle.

## Judge The Artifact By Its Job

- **Working Record:** living task memory with accurate current state, recoverable slices and decisions, compact evidence pointers, and one next useful action.
- **Spec or durable content artifact:** accepted content, behavior, boundaries, evidence, and uncertainty needed for its stated use.
- **Plan:** an inspectable ordered strategy with scope, dependencies, assumptions, checks, and stop conditions.
- **Decision record or ADR:** decision, owner, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** a point-in-time continuation package that preserves what its recipient needs without replacing live task memory.
- **Other artifact:** its stated purpose without taking over another artifact's job.

## Review Proportionately

Apply only lenses that can materially change fitness:

- **Source alignment:** agrees with accepted requirements, owner decisions, and live facts.
- **Fitness and sufficiency:** contains enough for its intended use without pretending every future question is settled.
- **Decision clarity:** required, tentative, open, deferred, and superseded information cannot be confused.
- **Evidence and acceptance:** load-bearing claims and acceptance conditions have suitable supporting or falsifying mechanisms.
- **Behavior and failure contract:** consequential states, forbidden outcomes, observers, and recovery are explicit where required.
- **Dependency integrity:** upstream and downstream artifacts remain consistent; provisional work is identified honestly.
- **Scope and minimality:** avoids speculative design, unnecessary process, and hypothetical completeness.
- **Clarity and continuity:** a future reader can use it without transcript memory or volatile copied context.

A pass is valid. Do not invent items, require exhaustive edge cases, report wording or filename preferences, reopen intentional deferrals, or demand evidence needed only for a later boundary.

## Classify Independent Review Items

- **Blocking Issue:** a supported defect, inconsistency, omission, or risk that must be resolved before the artifact guides its intended use.
- **Non-blocking Issue:** a real issue that can be deferred safely for this boundary.
- **Question:** material intent, requirements, or an owner decision is unclear.
- **Needs evidence:** a load-bearing claim or condition cannot be established.
- **Improvement:** a materially useful enhancement not required by this boundary. It does not affect judgment or authorize revision.

A Blocking Issue must name the exact location, violated source truth or artifact responsibility, evidence, concrete consequence for intended use, and smallest safe revision or owning activity to re-enter.

1. **Blocking:** one or more Blocking Issues exist.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material Unresolved items remain. Improvements may still be reported.

Pass, Non-blocking, Inconclusive, and Blocking are all valid review exits. A review ends with its report; it does not remain active until the artifact passes.

## Adjudicate And Route

After independent review, the receiving active agent adjudicates each item against the artifact, source truth, and evidence:

- **Accepted:** supported and applicable.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, outside the artifact's job, or based on a source misread.
- **Open:** a question or evidence gap prevents acceptance or rejection.

Confirm whether each accepted Issue is Blocking or Non-blocking, then derive the adjudicated judgment. Do not accept the reviewer's overall judgment separately.

Route from the adjudicated result:

- **Pass:** use the artifact for its intended purpose.
- **Non-blocking:** use it with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not use the artifact across the blocked boundary; re-enter its narrowest owner, defer, or stop.

Review findings are evidence, not commands. They do not authorize revision. Accepted revisions leave review and return to the artifact's owning skill; they may remain in the same [Track Work](../track-work/SKILL.md) slice while its intended result stays coherent.

When revision authority is not already explicit, ask once for either:

- the accepted revisions plus one warranted focused follow-up review; or
- the accepted revisions alone when direct source evidence can settle the changed boundary.

Then wait for the user's response. Do not revise or dispatch a follow-up from the request, and do not ask again when existing authority already covers the bounded revision or review.

Run a follow-up only when the changed boundary or affected dependencies still need independent judgment and that dispatch is authorized. Do not revise source truth, accepted intent, or owner decisions merely to satisfy a reviewer or obtain Pass.

## Limit The Review Cycle

For one independently reviewed artifact state and intended-use boundary:

1. Review 1 is the normal broad review.
2. Review 2, when needed and authorized, focuses on accepted revisions, affected dependencies, and remaining risk.
3. Review 3 is exceptional, authorized separately, and final for that cycle.

The budget is a cap, not dispatch authority. Do not request Review 4. At the cap, adjudicate and return control to Workflow; the artifact may be used, remain blocked, re-enter its owner, defer, or stop.

After Review 2 is adjudicated Blocking, stop before proposing another revision or Review 3. Classify its relationship to the prior revision:

- If the blocker repeats, extends, invalidates, or exposes another consequence of the prior revision, or its cause remains unsupported, read [Diagnose Failure](../diagnose-failure/SKILL.md) and diagnose the shared cause before another revision.
- If it is an independent clear local defect with a supported cause, return directly to the artifact's owner and state why diagnosis is unnecessary.

A reviewer judgment alone does not trigger diagnosis; active-agent adjudication and evidence do. Review 3 is final judgment after the cause and revision boundary are understood, not a third attempt to discover the cause through revisions. Workflow may later establish a new cycle only for a materially new artifact state and intended-use boundary; local edits, a different reviewer, or renamed scope do not reset it.

## Report

For self-review, report no formal review result. Correct clear local issues and surface only unresolved material issues that change fitness or route.

For independent review, use the structured output in [the reviewer prompt](references/reviewer-prompt.md). The receiving agent reports the reviewer and adjudicated judgments, each material item's Accepted, Rejected, or Open outcome and reason, affected dependencies, remaining open items, and authorized or proposed next route.

Omit empty groups. Support material judgments and adjudication with source or evidence rather than confidence.
