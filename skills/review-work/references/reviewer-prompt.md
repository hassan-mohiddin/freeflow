# Work Reviewer Contract

Use this to prepare a portable review context. It defines what the reviewer must know and how findings should be judged; it does not depend on a particular agent, model, or harness.

## Required Context

Provide:

- accepted outcome and requirements;
- source truth: relevant specs, plans, tests, policies, ADRs, and established behavior;
- changed files, diff range, or concrete work product;
- claimed verification and known evidence gaps;
- relevant risk lenses;
- review pass number;
- when state transitions or proof validity materially affect correctness: the canonical invariant owner; every known entrypoint, caller, or adapter that can affect it; and each claim's exact observer, canonical state, forbidden mutations, prior-state preservation, adversarial disproof, mutation footprint, and fidelity limit.

For pass 2 or 3, also provide:

- prior findings;
- parent adjudication: accepted, rejected, question, or needs evidence;
- owner clarifications;
- changes made since the prior pass;
- the narrow residual risk to inspect.

Do not provide only the author's summary or ask the reviewer to validate the author's reasoning.

## Portable Prompt

```md
# Work Review

Review the completed work. Do not edit files.

## Accepted Outcome

[What the work must accomplish and its explicit non-goals.]

## Source Truth

- [spec, plan, policy, ADR, tests, established behavior]

## Work Product

- [diff range, changed files, or artifact paths]

## Claimed Verification

- [commands or checks already run]
- [known gaps]
- [when state transitions or proof validity materially affect correctness: canonical invariant owner; known entrypoints/callers/adapters; exact observer, canonical state, forbidden mutations, prior-state preservation, adversarial disproof, mutation footprint, and fidelity limit]

## Review Pass

Pass: [1 | 2 | 3]

For pass 2 or 3:
- Prior findings: [summary]
- Parent adjudication: [accepted | rejected | question | needs evidence]
- Owner clarifications: [decisions or none]
- Changed areas: [files or sections]
- Residual risk: [narrow question]

## Check

- Correctness and alignment with accepted requirements.
- Regressions, unsafe behavior, and missing failure handling.
- Tests and verification support the claims being made.
- Proof-bearing claims identify the real observing boundary, an adversarial disproof, shared mutation footprints, and any weaker-fidelity limit.
- Security, privacy, billing, permissions, compatibility, public API, and data safety where relevant.
- Complexity and abstractions are justified by the accepted outcome or an observed failure.
- Tests protect intended behavior rather than machinery introduced by the implementation.
- Individually valid slices have not accumulated scope drift, caller coordination, or a shallow interface.
- Shared invariants have one named owner and every known entrypoint, caller, or adapter that can affect them is covered by implementation and evidence.
- Remaining work is shrinking and the claimed next route still fits the evidence.
- For security-sensitive work, use `security-risk-lens.md` and applicable repo/domain policy rather than a generic checklist.

For follow-up review, inspect accepted fixes and named residual risk. Do not restart broad review, reopen settled decisions, or re-raise rejected findings without contradictory live evidence. If pass 2 exposes another branch, caller, adapter, or persisted-state consequence of the same invariant, report the failure unit as unstable and recommend design or diagnosis rather than another local fix batch.

## Finding Standard

Classify findings as:

- Blocking
- Non-blocking
- Question
- Needs evidence

A Blocking finding must include:

1. exact file and line;
2. violated accepted requirement or source truth;
3. concrete consequence;
4. why it cannot remain a local reversible implementation choice;
5. smallest safe fix or backward route.

Do not block on preference, style already enforced by tooling, hypothetical completeness, or unspecified local reversible details. Review can pass with non-blocking findings; do not invent findings.

## Output

### Findings

#### Blocking
- [file:line] [finding, violated requirement, consequence, and smallest safe route]

#### Non-blocking
- ...

#### Questions
- ...

#### Needs evidence
- ...

### Assessment

Status: Pass | Non-blocking | Blocking | Question | Needs evidence
Reasoning: [concise evidence-backed assessment]
Verification gaps: [unproved claims or none]
```

## Calibration

Lead with the few findings that can change the route. A long list of low-consequence observations is weaker than one well-supported blocker.

A reviewer verdict is evidence for parent adjudication, not authority to edit source truth or settle owner decisions. Use `Non-blocking` status only when findings are deferrable and no blocker, unresolved owner question, or required evidence gap prevents proceeding. A passing review returns to the workflow route check; it does not authorize continuation by itself. On pass 3, report remaining risk and stop; do not recommend another broad review.
