# Independent Work Reviewer Contract

Use this when preparing an independent review of implementation or integrated work.

The reviewer did not produce the work. Give them the work product, source truth, and evidence needed to judge it directly. Do not provide only the author's summary, reasoning, or claimed result.

## Required Context

Provide:

- the work and future action covered by the review;
- accepted outcome, requirements, and non-goals;
- relevant specs, plans, tests, policies, ADRs, and established behavior;
- the implementation, changed files, or diff range;
- verification evidence and known gaps;
- only the review lenses material to this boundary;
- review number and, for a follow-up, prior items, adjudication, corrections, and new evidence.

When state transitions or proof integrity matter, also provide the invariant or state owner, affecting paths, observing mechanism, forbidden mutations, prior-state requirements, adversarial disproof, mutation footprint, and fidelity limits.

## Reviewer Prompt

```md
# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report review items without editing. The review ends with this report; do not fix items, dispatch a follow-up, or keep reviewing merely to obtain Pass.

A pass is valid. Do not invent items, broaden scope, or treat possible improvement as unfinished work.

## Boundary

[Work and future action this review covers.]

## Accepted Outcome And Non-Goals

- Outcome: [required result]
- Requirements: [accepted requirements]
- Non-goals: [intentional exclusions]

## Source Truth

- [specs, plans, tests, policies, ADRs, and established behavior]

## Work Product

- Reviewed state: [commit, tree, diff, or other identity]
- Work: [diff range, changed files, implementation, or integrated result]

## Verification Evidence

- Checks and results: [commands, observations, and results]
- Known gaps: [gaps or none]
- When relevant: [state owner, affecting paths, observer, forbidden mutations, prior-state requirements, adversarial disproof, mutation footprint, fidelity limits]

## Review Scope

- Review number: [1 | 2 | 3]
- Material lenses: [alignment and correctness | regression and integration | failure and risk | evidence | design and minimality | maintainability]

For Review 2 or 3:
- Prior items and adjudication: [Accepted | Rejected | Open]
- Clarifications: [settled decisions or none]
- Corrections and new evidence: [changes and verification]
- Remaining risk: [narrow unresolved scope]

## Check

Apply only the selected lenses:

- The work satisfies accepted behavior without invention or omission.
- Affected callers, states, and components remain correct together.
- Relevant failure paths and material risks are handled safely.
- Verification supports the claims and exercised the required boundary.
- Complexity and coordination are justified by requirements or observed failures.
- The work remains understandable and changeable without hidden policy or fragile coupling.

Do not search for unrelated issues. Report an out-of-scope issue only when it materially affects whether this boundary may be crossed.

A possible edge case is not an Issue without accepted behavior, observed reachability, or material risk. Use Question when expected behavior is unclear, Needs evidence when reachability or consequence is unsupported, and Improvement for useful resilience not required by the boundary.

For Review 2 or 3, inspect only accepted corrections, affected interactions, new evidence, and remaining risk. Do not reopen Rejected items without contradictory evidence. For every new Blocking Issue, state whether it repeats, extends, invalidates, or exposes another consequence of a prior correction; is independent; or cannot yet be related from the evidence. Report a related pattern rather than proposing another patch. Review 3 is final for this cycle; do not recommend Review 4.

## Classify Review Items

- **Blocking Issue:** supported defect or risk that must be resolved before crossing this boundary.
- **Non-blocking Issue:** real issue that can be deferred safely for this boundary.
- **Question:** material intent, requirement, or owner decision is unclear.
- **Needs evidence:** a plausible concern cannot be established from available evidence.
- **Improvement:** useful enhancement not required for this boundary. It does not affect judgment or authorize implementation.

A Blocking Issue must include its exact location, violated requirement or source truth, evidence, concrete boundary consequence, and smallest safe correction or owning activity to re-enter.

## Determine The Judgment

1. **Blocking:** one or more Blocking Issues exist.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material Unresolved items remain. Improvements may still be reported.

## Output

Review type: independent
Review number: [1 | 2 | 3]
Boundary: [reviewed work and future action]
Reviewed state: [state identity]
Judgment: Pass | Non-blocking | Inconclusive | Blocking
Reasoning: [concise evidence-backed judgment]
Relationship to prior items (Review 2 or 3 only): [related consequence | independent defect | unclear, with evidence]

### Review Items

#### Issues — Blocking
- [location, issue, violated source, evidence, consequence, smallest safe correction]

#### Issues — Non-blocking
- [location, issue, evidence, why it can be deferred]

#### Unresolved — Questions
- [question, effect on judgment, required answer]

#### Unresolved — Needs evidence
- [concern, missing evidence, evidence needed]

#### Improvements
- [improvement, benefit, supporting evidence]

Evidence gaps: [unproved claims or none]
```

## Calibration

Use a high evidence bar, not a high item count. Lead with the few items that can change the boundary judgment. Prior review, urgency, implementation effort, or author confidence does not establish correctness.

The review is evidence for adjudication, not authority over source truth, owner decisions, corrections, or another independent dispatch. Pass, Non-blocking, Inconclusive, and Blocking are all valid exits.
