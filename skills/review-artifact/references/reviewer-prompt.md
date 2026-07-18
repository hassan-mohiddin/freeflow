# Independent Artifact Reviewer Contract

Use this when preparing an independent review of a durable artifact.

The reviewer did not produce the artifact. Give them the artifact, source truth, and evidence needed to judge it directly. The reviewer reports review items without editing.

## Required Context

Provide:

- artifact path, type, current state, and intended use;
- accepted outcome, requirements, and non-goals;
- owner decisions and unresolved questions;
- relevant code, tests, policies, ADRs, and established behavior;
- the artifact-specific schema or format contract when one exists;
- upstream and downstream artifacts in dependency order;
- known evidence gaps;
- review number and, for a follow-up, prior items, adjudication, revisions, and new evidence.

For an artifact package, identify upstream authority and which work remains provisional or dependent.

## Reviewer Prompt

```md
# Independent Artifact Review

Review an artifact you did not produce. Inspect the complete artifact and source evidence directly. Report review items without editing. The review ends with this report; do not revise the artifact, dispatch a follow-up, or keep reviewing merely to obtain Pass.

A pass is valid. Do not invent items, broaden the artifact's job, or treat possible improvement as unfinished work.

## Artifact And Intended Use

- Artifact: [path]
- Type: [working record | spec | PRD | issue | API contract | technical design | migration contract | plan | decision record | ADR | handoff | other]
- Reviewed state: [revision, hash, or other identity]
- Intended use: [decision or future action this artifact must support]
- Dependency order: [upstream -> downstream, or standalone]

## Accepted Outcome And Non-Goals

- Outcome: [accepted outcome]
- Requirements: [accepted requirements]
- Non-goals: [intentional exclusions]
- Owner decisions: [settled decisions or none]
- Unresolved questions: [questions or none]

## Source Truth

- [code, tests, policies, ADRs, established behavior, upstream artifacts]

## Evidence And Known Gaps

- Supporting evidence: [evidence or none]
- Known gaps: [gaps or none]

## Review Scope

- Review number: [1 | 2 | 3]
- Material lenses: [source alignment | fitness and sufficiency | decision clarity | evidence and acceptance | behavior and failure contract | dependency integrity | scope and minimality | clarity and continuity]

For Review 2 or 3:
- Prior items and adjudication: [Accepted | Rejected | Open]
- Revisions and new evidence: [bounded changes and evidence]
- Affected dependencies: [dependencies or none]
- Remaining risk: [narrow unresolved scope]

## Judge The Artifact By Its Job

- **Working Record:** accurate living task memory with recoverable slices and decisions, compact evidence pointers, and one next useful action.
- **Spec or durable content artifact:** accepted content, behavior, boundaries, evidence, and uncertainty needed for its stated use.
- **Plan:** inspectable ordered strategy with scope, dependencies, assumptions, checks, and stop conditions.
- **Decision record or ADR:** decision, owner, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** point-in-time continuation package that preserves what its recipient needs without replacing live task memory.
- **Other artifact:** its stated purpose without taking over another artifact's job.

## Check

Apply only the selected lenses:

- The artifact agrees with accepted requirements, owner decisions, and live facts.
- It contains enough for its intended use without pretending every future question is settled.
- Required, tentative, open, deferred, and superseded information cannot be confused.
- Load-bearing claims and acceptance conditions have suitable supporting or falsifying mechanisms.
- Consequential behavior, failure states, forbidden outcomes, observers, and recovery are explicit where required.
- Upstream and downstream artifacts remain consistent; provisional work is identified honestly.
- It avoids speculative scope, unnecessary process, transcript history, and duplicated information owned elsewhere.
- A future reader can use it without transcript memory or volatile copied context.

Do not demand exhaustive edge cases. A possible condition is not an Issue unless the artifact's intended use requires it, evidence shows it matters, or omission creates material risk. Use Question when expected behavior is undefined, Needs evidence when support is missing, and Improvement for useful content not required by this boundary.

If an upstream issue invalidates downstream assumptions, mark the affected material contingent instead of generating exhaustive downstream items.

For Review 2 or 3, inspect only accepted revisions, affected dependencies, new evidence, and remaining risk. Do not reopen Rejected items without contradictory evidence. If another related omission suggests one unclear cause, report that pattern rather than proposing another patch. Review 3 is final for this cycle; do not recommend Review 4.

## Classify Review Items

- **Blocking Issue:** supported defect or risk that must be resolved before the artifact guides its intended use.
- **Non-blocking Issue:** real issue that can be deferred safely for this boundary.
- **Question:** material intent, requirement, or owner decision is unclear.
- **Needs evidence:** a load-bearing claim or condition cannot be established.
- **Improvement:** useful enhancement not required for this boundary. It does not affect judgment or authorize revision.

A Blocking Issue must include its exact location, violated source truth or artifact responsibility, evidence, concrete consequence for intended use, and smallest safe revision or owning activity to re-enter.

## Determine The Judgment

1. **Blocking:** one or more Blocking Issues exist.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material Unresolved items remain. Improvements may still be reported.

## Output

Review type: independent
Review number: [1 | 2 | 3]
Artifact: [reviewed artifact]
Intended use: [reviewed boundary]
Reviewed state: [state identity]
Judgment: Pass | Non-blocking | Inconclusive | Blocking
Reasoning: [concise evidence-backed judgment]

### Review Items

#### Issues — Blocking
- [location, issue, violated source or responsibility, evidence, consequence, smallest safe correction]

#### Issues — Non-blocking
- [location, issue, evidence, why it can be deferred]

#### Unresolved — Questions
- [question, effect on judgment, required answer]

#### Unresolved — Needs evidence
- [concern, missing evidence, evidence needed]

#### Improvements
- [improvement, benefit, supporting evidence]

Dependencies affected: [dependencies or none]
Evidence gaps: [unproved claims or none]
```

## Calibration

Use a high evidence bar, not a high item count. Lead with the few items that can change the artifact's fitness judgment. Prior review, artifact length, author confidence, or polished language does not establish fitness.

The review is evidence for adjudication, not authority over source truth, owner decisions, revisions, or another independent dispatch. Pass, Non-blocking, Inconclusive, and Blocking are all valid exits.
