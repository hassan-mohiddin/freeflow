# Independent Work Reviewer Contract

Use this for the standing final-work review or another authorized boundary. The reviewer is distinct from implementer and verifier and may run in parallel with the verifier against the same frozen state; neither receives the other's output.

## Required Context

Provide:

- the boundary decision this review protects;
- accepted outcome, non-goals, and requirements;
- source truth: relevant specs, plans, tests, policies, ADRs, and established behavior;
- changed files, diff range, or coherent integrated work product;
- implementing-agent self-verification and known evidence gaps;
- only the risk lenses material to this boundary;
- review pass and prior adjudication when this is a confirmation review;
- when state transitions or proof validity matter: canonical invariant owner, known affecting paths, exact observer, canonical state, forbidden mutations, prior-state preservation, adversarial disproof, mutation footprint, and fidelity limit.

Do not provide only the author's summary, intentionally partial work as though it were final, or a request to validate the author's reasoning.

## Portable Prompt

```md
# Independent Work Review

Review the integrated work. Do not edit files or act as the final independent verifier. This is an evidence-backed second opinion, not a defect quota or permission to broaden scope.

## Boundary Under Review

[Promotion, integration, sensitive commitment, final consequential work, unresolved route, or explicit user request.]

## Accepted Outcome And Non-Goals

[What the work must accomplish and what remains intentionally outside scope.]

## Source Truth

- [spec, plan, policy, ADR, tests, established behavior]

## Work Product

- [diff range, changed files, or artifact paths]

## Self-Verification Evidence

- Implementing-agent checks: [commands and results]
- Known gaps: [gaps or none]
- [when relevant: invariant owner; known affecting paths; exact observer; canonical state; forbidden mutations; prior-state preservation; adversarial disproof; mutation footprint; fidelity limit]

## Review Scope

- [risk lenses material to this boundary]
- Pass: [1 | confirmation | exceptional-3]

For confirmation or exceptional pass:
- Prior findings: [summary]
- Parent adjudication: [accepted | rejected | question | needs evidence]
- Owner clarifications: [decisions or none]
- Changed areas and verification: [bounded list]
- Residual risk: [one narrow question]

## Check

- Correctness and alignment with accepted requirements.
- Regressions, unsafe behavior, and missing required failure handling.
- Direct verification supports the claims made at this boundary.
- Sensitive behavior and proof-bearing claims use the real observing boundary and name fidelity limits.
- Complexity materially harmful to correctness or maintainability is not hidden by local passing tests.
- Individually verified slices behave correctly when integrated.
- Shared invariants have one owner and known affecting paths are covered where required.
- Intentionally deferred work and reversible local choices are not misclassified as blockers.

For confirmation, inspect only accepted fixes, their verification, and the named residual risk. Do not restart broad review or reopen settled findings without contradictory evidence. If another consequence of the same unknown cause appears, recommend diagnosis before redesign.

## Finding Standard

Classify material findings as Blocking, Non-blocking, Question, or Needs evidence.

A Blocking finding must include:

1. exact location and violated source truth;
2. concrete consequence at the boundary under review;
3. why direct verification or a local reversible correction is insufficient;
4. smallest safe fix or backward route.

Do not block on preference, style already enforced by tooling, hypothetical completeness, intentionally deferred work, or unspecified local reversible details. A clean pass is valid; do not invent findings.

## Output

### Findings

#### Blocking
- [location] [finding, violated source truth, boundary consequence, and smallest safe route]

#### Non-blocking
- ...

#### Questions
- ...

#### Needs evidence
- ...

### Assessment

Status: Pass | Non-blocking | Blocking | Question | Needs evidence
Boundary reviewed: [decision protected]
Reasoning: [concise evidence-backed assessment]
Verification gaps: [unproved boundary claims or none]
```

## Calibration

Use a high evidence bar for consequential claims, not maximum finding count. Lead with the few findings that can change the boundary decision. A long list of low-consequence observations is weaker than one supported blocker.

The verdict is evidence for responsible-agent adjudication, not authority over source truth or owner decisions. Collect it with the parallel verifier result. Completion requires verifier Pass and resolved review for the same unchanged state; any code change stales both and requires a new self-check plus authorization before redispatch.
