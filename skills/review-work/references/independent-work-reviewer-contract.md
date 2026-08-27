# Independent Work Reviewer Contract

Read this before preparing or performing a separately selected independent review of implementation or integrated work.

The reviewer did not produce the reviewed state. Give them the work product, source truth, and evidence needed to judge it directly. Do not provide only the producer's summary, reasoning, or claimed result.

## Required Context

Provide:

- the work and future action covered by the review;
- accepted outcome, requirements, and non-goals;
- relevant Specs, Plans, tests, policies, ADRs, and established behavior;
- the implementation, changed files, or diff range;
- verification evidence and known gaps;
- only the review lenses material to this boundary;
- active evidence authority: none, or each exact covered check with its expected evidence and stop condition;
- review number and, for follow-up, prior items, adjudication, corrections, and new evidence.

When state transitions or proof integrity matter, also provide the invariant or state owner, affecting paths, observing mechanism, forbidden mutations, prior-state requirements, adversarial disproof, mutation footprint, and fidelity limits.

## Reviewer Prompt

```md
# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Use supplied and already available evidence. Do not start a missing active check unless the review contract explicitly authorizes that exact check. Otherwise report **Needs evidence** with the claim and required observing boundary. When an exact check is covered, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: [boundary]
- Reviewed state: [commit, tree, diff, or other exact identity]
- Work: [diff range, changed files, implementation, or integrated result]

## Accepted Outcome And Non-Goals

- Outcome: [required result]
- Requirements: [accepted requirements]
- Non-goals: [intentional exclusions]

## Source Truth

- [Specs, Plans, tests, policies, ADRs, and established behavior]

## Verification Evidence

- Checks and results: [commands, observations, and results]
- Known gaps: [gaps or none]
- When relevant: [state owner, affecting paths, observer, forbidden mutations, prior-state requirements, adversarial disproof, mutation footprint, fidelity limits]

## Review Scope

- Review number: [1 | 2 | 3]
- Material lenses: [alignment and correctness | regression and integration | failure and risk | evidence | design and minimality | maintainability]
- Active evidence authority: [none | exact covered check, expected evidence, and stop condition]

For Review 2 or 3:

- Prior items and adjudication: [Accepted | Rejected | Open]
- Clarifications: [settled decisions or none]
- Corrections and new evidence: [changes and verification]
- Remaining risk: [narrow unresolved scope]

## Check

Apply only the selected lenses:

- accepted behavior is implemented without invention or omission;
- affected callers, states, and components remain correct together;
- material failure paths and risks are handled safely;
- verification supports the claims at the required boundary;
- complexity and coordination are justified;
- the work remains understandable without hidden policy or fragile coupling.

Do not search for unrelated issues. Report an out-of-scope issue only when it materially affects whether this boundary may be crossed.

Before calling something an Issue, ask:

1. Is required behavior or source truth settled? If not, use **Question**.
2. Are reachability and material consequence supported? If not, use **Needs evidence**.
3. Does the boundary require correction? Use **Blocking Issue** when it cannot be crossed safely, otherwise **Non-blocking Issue** when correction can be deferred safely.
4. Is the change merely useful beyond this boundary? Omit it by default; use **Improvement** only when materially relevant or requested.

A **Needs evidence** item must identify the claim, required observing boundary, available evidence and its limit, why the gap affects judgment, and the smallest evidence that could disagree.

A Blocking Issue must identify the exact location, violated requirement or source truth, evidence, concrete boundary consequence, and correction constraints or owning activity to re-enter. Recommend a specific correction only when directly supported.

For Review 2 or 3, inspect only accepted corrections, affected interactions, new evidence, and remaining risk. Do not reopen Rejected items without contradictory evidence. For each new Blocking Issue, state whether it repeats, extends, invalidates, or exposes another consequence of a prior correction; is independent; or cannot yet be related from the evidence. Report a related pattern rather than proposing another patch. Review 3 is final; do not recommend Review 4.

## Determine The Judgment

1. **Blocking:** at least one Blocking Issue exists.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material unresolved items remain.

Improvements do not change the judgment.

## Output

Omit empty groups. Do not include Improvements unless they are materially relevant or explicitly requested.

Review type: independent
Review number: [1 | 2 | 3]
Boundary: [reviewed work and protected future action]
Reviewed state: [state identity]
Judgment: Pass | Non-blocking | Inconclusive | Blocking
Reasoning: [concise evidence-backed judgment]
Relationship to prior items (Review 2 or 3 only): [related consequence | independent defect | unclear, with evidence]

### Review Items

#### Issues — Blocking
- [location, issue, violated source, evidence, consequence, correction constraints or owning activity]

#### Issues — Non-blocking
- [location, issue, evidence, why it can be deferred]

#### Unresolved — Questions
- [question, effect on judgment, required answer]

#### Unresolved — Needs evidence
- [claim, required observing boundary, available evidence and limit, why the gap affects judgment, smallest evidence that could disagree]

#### Improvements
- [only when materially relevant or requested: improvement, benefit, evidence]

Evidence gaps: [unproved claims or none]
```

## Calibration

Lead with the few items that can change the boundary judgment. Prior review, urgency, implementation effort, or producer confidence does not establish correctness.

The report is evidence for adjudication. It is not authority over source truth, owner decisions, corrections, or another independent dispatch. Pass, Non-blocking, Inconclusive, and Blocking are all valid exits.
