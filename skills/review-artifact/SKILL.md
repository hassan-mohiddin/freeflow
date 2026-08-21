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

Reading this skill does not create independence. If you produced the artifact, do not present your own judgment as independent review. Read the [Independent Artifact Reviewer Contract](references/independent-artifact-reviewer-contract.md) when preparing or performing a separately selected independent review.

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

After independent review, the receiving active agent adjudicates each material item against the artifact, source truth, and evidence rather than forwarding the report:

- **Accepted:** supported and applicable. State the actual artifact problem, consequence for its intended use, and whether the revision basis is supported or uncertain.
- **Rejected:** unsupported, stale, resolved, duplicate, preference-only, outside the artifact's job, or based on a source misread. State why.
- **Open:** a question or evidence gap prevents acceptance or rejection. State the concern, potential consequence, and missing evidence or decision.

A reviewer's suggested revision may bound an item, but it does not settle source intent or select the revision. Confirm whether each accepted Issue is Blocking or Non-blocking, derive the adjudicated judgment, and do not accept the reviewer's overall judgment separately.

- **Pass:** use the artifact for its intended purpose.
- **Non-blocking:** use it with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not use the artifact across the blocked boundary; re-enter its narrowest owner, defer, or stop.

### Decide Whether Revision Is Ready

A revision is ready when the artifact's job, the problem and consequence, and enough source or decision basis support a bounded revision. When the issue and source are clear, the revision local, affected dependencies known, and no material alternative or user choice remains, include adjudication and revision in the same assistant response.

Use the current response for a separate problem checkpoint when findings interact, source intent or dependency effects remain uncertain, accepted content or strategy is challenged, materially different revisions remain, the artifact relies on an unsupported failure cause, or user input could change the approach:

1. Report the adjudication, problem and consequence, revision-basis status, settled constraints, and controlling question or evidence.
2. Name [Discuss](../discuss/SKILL.md), [Diagnose Failure](../diagnose-failure/SKILL.md), [Decision Gate](../decision-gate/SKILL.md), evidence gathering, or the artifact's affected owner as the next route, then stop and wait.

Continue revision selection only when a later user turn or new evidence supplies enough support. Do not request revision authority before selecting a direction or wait for the user to elicit the missing analysis. The checkpoint is not another review and creates no revision or dispatch authority.

A revision-ready route states the proposed revision and rationale, dependency impact, verification boundary, whether focused follow-up is needed, and authority status. Findings are evidence, not commands, and do not authorize revision. Accepted revisions return to the artifact's owning skill and may remain in the same [Track Work](../track-work/SKILL.md) slice while its intended result stays coherent.

Use existing revision authority when it covers the result. Otherwise ask once for the revision and any warranted focused follow-up; omit follow-up when direct source evidence can settle the changed boundary. Then wait; do not revise or dispatch a follow-up from the request itself. Run follow-up only when the changed boundary or affected dependencies still need independent judgment and that dispatch is authorized. Do not revise source truth, accepted intent, or owner decisions merely to satisfy a reviewer or obtain Pass.

## Limit The Review Cycle

For one independently reviewed artifact state and intended-use boundary:

1. Review 1 is the normal broad review.
2. Review 2, when needed and authorized, focuses on accepted revisions, affected dependencies, and remaining risk.
3. Review 3 is exceptional, separately authorized, and final.

The budget is a cap, not dispatch authority. Do not request Review 4; return control to Workflow at the cap.

After Review 2 is adjudicated Blocking, stop before another revision or Review 3:

- If the blocker repeats, extends, invalidates, or exposes another consequence of the prior revision, or its cause remains unsupported, read [Diagnose Failure](../diagnose-failure/SKILL.md) and diagnose the shared cause first.
- If it is an independent clear local defect with a supported cause, return to the artifact's owner and state why diagnosis is unnecessary.

Diagnosis follows adjudicated evidence, not reviewer judgment alone. Review 3 is final judgment after the cause and revision boundary are understood, not another attempt to discover them through revisions. Workflow may establish a new cycle only for a materially new reviewed state and intended-use boundary; local edits, a different reviewer, or renamed scope do not reset it.

## Report

For self-review, report no formal result. Correct clear local issues and surface only unresolved material issues that change fitness or route.

For independent review, use the [Independent Artifact Reviewer Contract](references/independent-artifact-reviewer-contract.md) and stop with its report. The receiving agent then reports the reviewer and adjudicated judgments, each material item's outcome and reason, and either the problem checkpoint or revision-ready route defined above. Omit empty groups and support the result with source or evidence rather than confidence.
