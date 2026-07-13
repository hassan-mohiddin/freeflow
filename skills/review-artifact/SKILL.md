---
name: review-artifact
description: "Use after writing/revising and self-verifying an artifact when richer guidance would improve self-review, when a consequential artifact is replaced wholesale and prior review no longer applies, or for the standing independent spec/plan review, another authorized formal/fresh/second-opinion artifact review, `/review-artifact`, finding adjudication, or narrow confirmation. Reading it does not imply independence; `/review-artifact` defaults to formal review unless the user explicitly requests inline self-review."
---

# Review Artifact

Review whether a consequential artifact can guide its intended next boundary without causing wrong work, hidden decisions, unsafe promotion, or an implementation dead end.

This skill provides richer artifact-review method in two modes. Reading it never creates independence by itself. The writing skill's basic self-review remains the normal first check.

## Choose The Mode

**Enhanced self-review:** after source and claim self-verification supports the artifact, the writing agent may read this when basic self-review is too shallow, or when the user explicitly requests review guidance inline. Apply only relevant source, sufficiency, evidence, risk, scope, and clarity lenses; correct local reversible issues directly. Do not create a formal verdict, pass history, review artifact, or claim of independence. This mode never satisfies the standing artifact review.

**Formal independent review:** a separate fresh context applies the full finding, adjudication, and confirmation contract below. `/review-artifact` selects this mode by default unless the user explicitly says inline, self-review, or no separate reviewer.

## Formal Independent Mode

The artifact-review route chosen by `write-spec` is standing-authorized and needs no reconfirmation: one combined spec-then-plan review, separate spec and plan reviews for a high-risk spec-first route, or spec-only review. When the task deliverable is only that artifact, its review also satisfies final review.

A wholesale rewrite of a consequential durable artifact invalidates every review of the replaced contents. Treat the current contents as a new artifact state regardless of filename or intended boundary. After its sequential self-check supports the rewrite, run the selected standing artifact-review route before implementation. This is not confirmation of the old artifact. Lightweight or disposable drafts still do not create this checkpoint.

Any artifact review outside the selected route requires Workflow's consequential boundary and scoped user authorization, such as sensitive source truth, promotion into hard-to-reverse architecture, a large consequential plan, an unresolved route, or an explicit request.

Do not review independently merely because another artifact exists, a reviewed plan changed locally, a phase ended, or ordinary mistakes remain possible. Rolling-plan updates normally rely on source inspection, direct evidence, and the active agent's bounded self-review.

Use a separate reviewer context. If none is available, do not present the author's own reread as independent review.

## Review The Right Package

Give the reviewer:

- artifact type and the boundary it must support;
- accepted outcome, non-goals, and explicit owner decisions;
- the complete artifact or linked package;
- live code, tests, policies, ADRs, and established behavior needed to judge it;
- known evidence gaps and review history when applicable.

A spec and its provisional derived plan may receive one combined review. Review them in dependency order: judge the spec first; review the plan only if the spec is fit enough to plan from. If a spec blocker invalidates plan assumptions, mark the affected plan contingent instead of generating exhaustive downstream findings.

Use separate sequential spec and plan reviews only when the spec is itself a high-risk approval gate or writing the plan before acceptance would commit expensive or hard-to-reverse work.

Read [the artifact reviewer contract](references/reviewer-prompt.md) only for formal independent review.

## Source Truth

The artifact and reviewer are not authority over live evidence or owner decisions.

Do not treat review as permission to:

- invert accepted intent or rewrite source truth to obtain a pass;
- invent product, security, privacy, billing, permissions, data-loss, compatibility, API, migration, or architecture decisions;
- turn a handoff, plan, or reviewer preference into current behavior;
- require local reversible implementation details before evidence makes them useful.

Classify source conflicts and route user-owned decisions through Decision Gate.

## Review Proportionately

Select only lenses material to the boundary:

- **Source alignment:** requirements, owner decisions, and live facts agree.
- **Sufficiency:** enough is settled for the intended next action, not every future action.
- **Evidence:** load-bearing claims and promotion conditions have direct supporting or falsifying mechanisms.
- **Behavior and failure contract:** consequential states, forbidden outcomes, recovery, and observers are explicit where callers would otherwise invent them.
- **Planning horizon:** the immediate horizon is executable; later work remains directional.
- **Design depth:** interfaces hide rather than spread required coordination.
- **Scope:** the artifact does not convert bounded work into speculative platform design.
- **Clarity:** a future agent can act without transcript memory.

Use a high evidence bar for claims that cross the reviewed boundary without demanding exhaustive completion. Do not block on style, exact filenames, helper shapes, internal taxonomies, reversible choices, intentionally deferred work, or evidence needed only for a later promotion.

A blocker must name:

1. exact location and violated source truth;
2. concrete consequence for the boundary under review;
3. why the omission cannot be learned safely during reversible work;
4. smallest safe revision or backward route.

## Formal Findings And Adjudication

In formal independent mode, classify material findings:

- **Blocking:** the artifact would cause wrong work, hidden owner choice, unsafe promotion, violated source truth, or an implementation dead end at the reviewed boundary.
- **Non-blocking:** useful improvement that can be deferred safely.
- **Question:** a user-owned decision or missing requirement prevents the boundary decision.
- **Needs evidence:** a load-bearing claim lacks evidence required for this boundary.

A clean pass is valid. Reviewer count, issue count, or confidence does not decide truth.

The responsible agent adjudicates findings against live evidence:

- revise a clear local defect directly when intent and route stay unchanged;
- route path-changing findings to discovery, diagnosis, spec, planning, design, or Decision Gate;
- reject stale, duplicate, preference-only, or contract-inflating findings with evidence;
- preserve unaffected downstream work when an upstream finding changes only part of the package.

Do not create an autonomous review-revise-review loop or grow an artifact to chase approval.

## Confirmation Review

Do not schedule pass 2 by habit. It is another independent dispatch: require scoped user authorization unless the user already authorized review through closure. Then request one narrow confirmation only when an accepted blocker or required evidence gap materially benefits from reinspection.

Provide prior findings, adjudication, changed sections, supporting evidence, and one residual question. Do not restart the broad lens set or reopen settled findings without contradictory evidence.

One initial review plus one narrow confirmation is the normal maximum. A third pass is exceptional, owner-selected for unresolved high-risk work, and terminal. Never request a fourth review for the same scope.

If confirmation exposes repeated consequences of one unknown cause, stop reviewing revisions and diagnose the artifact or workflow failure. Redesign only if diagnosis establishes a structural cause.

## Report

Lead with findings ordered by consequence, then state:

- **Status:** Pass | Non-blocking | Blocking | Question | Needs evidence
- **Boundary reviewed:** what future action this review protects
- **Package dependency:** spec/plan or other upstream/downstream effect when relevant
- **Adjudication:** when receiving findings
- **Route:** proceed, revise locally, gather evidence, diagnose, ask owner, or move backward

A passing review informs the workflow route. It does not approve implementation, replace verification, or make later plan updates require another review.
