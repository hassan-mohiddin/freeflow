---
name: review-work
description: Use when reviewing completed work, checking a change before merge or handoff, preparing review context, receiving or applying review feedback, running a follow-up review, deciding whether findings block progress, or handling a repeated review loop.
---

# Review Work

Review against accepted outcomes and live evidence, not reviewer preference or accumulated implementation machinery.

A review should find consequential defects, requirement gaps, regressions, unsafe behavior, and unjustified complexity. Issue count is not quality. A clean pass is valid.

Review is evidence, not verification. Passing review does not prove tests, builds, failure behavior, or runtime claims that were not independently exercised.

## Review Context

Prefer an independent reviewer with fresh context when novelty, risk, or author blind spots justify it. The mechanism may be another agent, a fresh run, an external reviewer, or any equivalent independent context. If independent review is unavailable or disproportionate, review inline and state that it was not independent.

Use formal review where it can change confidence or route: architecture-bearing, sensitive, integration, accumulated-risk, or final work. Do not review every slice by habit. When individually valid slices interact or accumulate design pressure, review the combined behavior and interface rather than only the latest diff.

Give the reviewer the work product and source truth, not only the author's summary or reasoning. Include:

- the accepted outcome and relevant requirements;
- the diff, changed files, or concrete work product;
- applicable specs, plans, tests, policies, ADRs, and established behavior;
- claimed verification and known gaps;
- risk lenses that matter for this change.

For stateful or proof-bearing work, include a compact claim map: claim, exact observing mechanism, canonical state, forbidden mutations, prior-state preservation, and known fidelity limit. Use `../verify-work/SKILL.md` to prepare integration evidence when registration, host dispatch, producer execution, fallback, installed artifacts, counters, or shared verification state matter.

Read [the reviewer prompt](references/reviewer-prompt.md) when preparing review context, reviewing strict or high-risk work, or running review pass 2 or 3.

## Review

Inspect source truth and tests before judging implementation choices.

Lead with:

- incorrect behavior, regressions, and missing requirements;
- security, privacy, billing, permission, compatibility, API, or data-safety risk;
- missing tests or claims unsupported by verification;
- failure behavior proved only by a happy-path check;
- structural changes that spread complexity or exceed the accepted outcome.

Read [the security risk lens](references/security-risk-lens.md) when work changes trust boundaries, authentication, authorization, permissions, untrusted input, secrets, sensitive data, dependencies, external integrations, or security-relevant failure behavior.

Check minimality against the accepted outcome:

- Does each new mechanism serve an accepted requirement or observed failure?
- Did the change add speculative abstraction, compatibility, recovery, scale, or flexibility?
- Do tests protect intended behavior, or merely legitimize machinery introduced by the change?
- Have locally valid slices accumulated scope drift, caller coordination, or a shallow interface?
- Is remaining work shrinking, and does the next bounded route still hold?
- Would a smaller design preserve the required behavior and trust?

Do not block because code differs from reviewer preference or leaves local reversible implementation details unspecified.

## Finding Contract

Classify every material finding:

- **Blocking:** proceeding would risk wrong behavior, violated source truth, hidden owner decisions, unsafe outcomes, or material maintainability damage.
- **Non-blocking:** useful improvement that can be deferred without invalidating the work.
- **Question:** an owner decision or missing requirement prevents a verdict.
- **Needs evidence:** the claim may be valid, but available evidence cannot establish it.

A review passes when no accepted blocker, unresolved owner question, or required evidence gap prevents proceeding. Non-blocking findings may remain on a passing review.

A blocking finding must name:

1. the exact location;
2. the violated accepted requirement or source truth;
3. the concrete consequence;
4. why the issue cannot remain a local reversible choice;
5. the smallest safe fix or backward route.

Review can pass. Do not invent findings to justify the review.

## Adjudicate Feedback

Reviewer findings are evidence, not commands. Before editing, inspect the relevant code, tests, docs, and prior decisions, then classify each material item:

- **Accepted:** valid and safe to apply without changing settled intent.
- **Rejected:** stale, unsupported, already resolved, equivalent, preference-only, or based on a source-contract misread.
- **Question:** requires owner direction.
- **Needs evidence:** inspect or verify more before deciding.

Do not use performative agreement. State the technical requirement, evidence, disagreement, or action.

A non-passing review is a phase exit, not an autonomous patch loop. When an accepted blocker, unresolved question, or required evidence gap prevents proceeding, the receiving turn ends with adjudication and route only. Do not edit from that review batch in the same turn, even when the reviewer or user says to apply everything and continue reviewing.

## Source-Truth Guard

Feedback is not approval to change source truth.

Stop before editing when a finding would:

- contradict tests, specs, policies, ADRs, or established behavior;
- change product, security, privacy, billing, permissions, data loss, compatibility, public API, or irreversible architecture behavior;
- guess what an ambiguous reviewer meant;
- approve failure semantics without a source-backed failure contract;
- turn a narrow comment into an unapproved broad refactor.

Name the conflict and ask which path to follow. When an owner decision blocks the route, end with a direct choice question.

## Apply Accepted Findings

On a later explicit fix pass:

- apply independent, clear findings one at a time;
- keep each change scoped to the accepted finding;
- verify each fix;
- stop blocked or interacting items before editing them;
- push back on incorrect feedback with source evidence.

If accepted findings expose a shallow interface, bad seam, or repeated edge-case patching, route through `../design-for-depth/SKILL.md` before broad refactoring.

Do not apply a non-pass batch and request another review in one autonomous loop.

## Follow-Up Reviews

A follow-up review continues the same review history even when the reviewer is fresh.

Provide:

- review pass number;
- prior findings and parent adjudication;
- owner clarifications;
- files or sections changed in response;
- the narrow residual risk still requiring review.

Inspect accepted fixes and named residual risk. Do not rerun the original broad review, reopen settled decisions, or re-raise rejected findings without contradictory live evidence.

If pass 2 exposes another branch, caller, adapter, or persisted-state consequence of the same invariant, the failure unit is unstable. Stop the follow-up patch loop and route through design or diagnosis before another fix batch.

## Review Budget

Aim to finish in two passes: initial review, then one confirmation after an explicit fix pass.

Three review passes is the hard cap for the same work and scope. The third pass is terminal: classify the findings, do not edit from that batch, and do not request a fourth review.

If accepted blocking, question, or needs-evidence findings remain after pass 3, diagnose whether the outcome, source contract, discovery, spec, plan, design, implementation, verification, scope, or reviewer calibration is wrong or too thin. Route backward instead of grinding forward.

## Report

Lead with findings ordered by consequence, then state:

- **Status:** Pass | Non-blocking | Blocking | Question | Needs evidence
- **Accepted/rejected adjudication:** when feedback is incoming
- **Verification gaps:** claims review could not prove
- **Route:** proceed, gather evidence, ask owner, apply accepted fixes later, or move backward

If no findings remain, say the review passed and name residual assumptions or unverified behavior. A pass returns to the workflow route check; it is not automatic permission to continue.
