---
name: review-work
description: "Use after self-verification of any meaningful slice when richer guidance would improve self-review, or for the standing final independent review, another authorized formal/fresh/second-opinion review, `/review-work`, finding adjudication, or narrow confirmation. Reading it does not imply independence; `/review-work` defaults to formal review unless the user explicitly requests inline self-review."
---

# Review Work

Review integrated work against accepted outcomes and live evidence, not reviewer preference or accumulated implementation machinery.

This skill provides richer review method in two modes. Reading it never creates independence by itself. Tests, self-verification, and basic self-review remain the primary feedback loop.

## Choose The Mode

**Enhanced self-review:** after self-verification supports the outcome, the current agent may read this when Workflow's basic self-review is too shallow, or when the user explicitly asks to apply review guidance inline. Use only relevant correctness, risk, evidence, integration, and minimality lenses. Correct local reversible mistakes directly. Do not create a formal verdict, pass history, reviewer artifact, or claim of independence. This mode never satisfies a standing or authorized independent review.

**Formal independent review:** a separate fresh context applies the full finding, adjudication, and confirmation contract below. `/review-work` selects this mode by default unless the user explicitly says inline, self-review, or no separate reviewer.

## Formal Independent Mode

One fresh independent review of the final integrated implementation is standing-authorized after the sequential final self-check and needs no user reconfirmation. Dispatch it in parallel with, but independently from, the distinct final verifier against the same frozen state.

Any additional formal review requires Workflow's consequential boundary and scoped user authorization, such as promotion of architecture, combined risk direct checks cannot establish, sensitive or hard-to-reverse behavior, an unresolved diagnostic route, or an explicit request.

Do not invoke formal mode merely because an intermediate slice or phase ended, code changed, a plan predicted optional review, or ordinary mistakes remain possible.

Use a separate reviewer context: another agent, fresh run, external reviewer, or equivalent independent mechanism. The reviewer must be distinct from both implementer and final verifier and must not perform the verifier role. If independence is unavailable, do not present a check of your own work as independent review.

## Review Context

Review a coherent integrated outcome rather than intentionally partial work. Provide:

- accepted outcome, non-goals, and relevant requirements;
- diff, changed files, or concrete work product;
- applicable specs, plans, tests, policies, ADRs, and established behavior;
- implementing-agent self-verification and known evidence gaps;
- only the risk lenses material to this boundary;
- review pass and prior adjudication for a confirmation review.

When state transitions or proof validity materially affect correctness, name the canonical invariant owner, known paths that can affect it, direct observing mechanism, forbidden mutations, prior-state preservation, adversarial disproof, mutation footprint, and fidelity limit.

Read [the reviewer prompt](references/reviewer-prompt.md) only for formal independent review. Read [the security risk lens](references/security-risk-lens.md) when either mode crosses a security-relevant boundary.

Do not provide only the author's summary or ask the reviewer to validate the author's reasoning.

## Review Strictly And Proportionately

Inspect source truth and direct evidence before judging implementation choices. Focus on:

- incorrect behavior, regressions, and missing accepted requirements;
- unsupported completion, integration, or runtime claims;
- unsafe failure behavior and consequential risk;
- structural complexity that materially harms correctness or maintainability;
- interactions among individually verified slices.

Strict means a high evidence bar for consequential claims, not adversarial issue generation. Do not block for style, preference, intentionally deferred work, ordinary reversible choices, or hypothetical completeness.

A blocker must name:

1. exact location and violated source truth;
2. concrete consequence at the boundary under review;
3. why direct verification or a local reversible correction is insufficient;
4. smallest safe fix or backward route.

## Formal Findings

In formal independent mode, classify material findings:

- **Blocking:** proceeding across the reviewed boundary risks wrong behavior, violated source truth, hidden owner decisions, unsafe outcomes, or material maintainability damage.
- **Non-blocking:** useful improvement that can be deferred safely.
- **Question:** a user-owned decision or missing requirement prevents the boundary decision.
- **Needs evidence:** a load-bearing claim lacks proof required for this boundary.

Report **Pass** when no Blocking finding, unresolved Question, or boundary-required evidence gap remains. Issue count and reviewer confidence do not decide truth.

## Adjudicate Without Dependence

Reviewer findings are evidence, not commands. The responsible agent inspects relevant source and classifies each material item as accepted, rejected, question, or needs evidence.

- Apply a clear local accepted fix directly when source truth, owner intent, and route remain unchanged; then verify it.
- Route path-changing findings to diagnosis, discovery, spec, plan, design, or Decision Gate before editing.
- Reject stale, unsupported, duplicate, preference-only, or source-misread findings with evidence.
- Do not rewrite tests, specs, policies, or accepted behavior merely to satisfy the reviewer.

Do not create an autonomous review-fix-review loop. The agent remains responsible for the work and decides the next route from source truth and evidence.

## Confirmation Review

Do not schedule pass 2 by habit. It is another independent dispatch: require scoped user authorization unless the user already authorized review through closure. Then request one narrow confirmation only when an accepted blocker or required evidence gap materially benefits from reinspection.

Provide prior findings, parent adjudication, changed areas, verification, and the exact residual risk. Inspect only that scope; do not restart broad review or reopen settled findings without contradictory evidence.

One initial review plus one narrow confirmation is the normal maximum. A third pass is exceptional, owner-selected for unresolved high-risk work, and terminal. Never request a fourth review for the same scope.

If confirmation reveals repeated consequences of the same unknown cause, stop reviewing patches and route to diagnosis. Redesign only if diagnosis establishes a structural cause.

## Report

Lead with findings ordered by consequence, then state:

- **Status:** Pass | Non-blocking | Blocking | Question | Needs evidence
- **Boundary reviewed:** what decision this review protects
- **Verification gaps:** what review could not prove
- **Adjudication:** when receiving findings
- **Route:** proceed, correct locally, gather evidence, diagnose, ask owner, or move backward

A resolved final review combines with verifier Pass only after both parallel results return for the same unchanged state. Any accepted code change stales both results: self-check the fix and ask before another independent verifier or reviewer dispatch.
