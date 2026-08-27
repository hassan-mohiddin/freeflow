# Independent Artifact Reviewer Contract

Read this before preparing or performing a separately selected independent review of a durable artifact.

The reviewer did not produce the reviewed artifact state. Give them the complete artifact, source truth, dependencies, and evidence needed to judge it directly. Do not provide only the producer's summary, reasoning, or change description.

## Required Context

Provide:

- artifact path, type, exact reviewed state, and intended use;
- accepted outcome, requirements, non-goals, and owner decisions;
- unresolved questions and known evidence gaps;
- the artifact-specific schema or format contract when one exists;
- relevant code, tests, policies, ADRs, and established behavior;
- upstream and downstream artifacts in dependency order;
- only the review lenses material to the intended use;
- active evidence authority: none, or each exact covered check with its expected evidence and stop condition;
- review number and, for follow-up, prior items, adjudication, revisions, and new evidence.

For an artifact package, identify upstream authority and which material remains provisional or contingent.

## Reviewer Prompt

```md
# Independent Artifact Review

Review an artifact state you did not produce. Inspect the complete artifact, source truth, dependencies, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, settle owner decisions, revise anything, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden the artifact's job or treat possible improvement as unfinished work.

Use supplied and already available evidence. Do not start a missing active check unless the review contract explicitly authorizes that exact check. Otherwise report **Needs evidence** with the load-bearing claim and required observing boundary. When an exact check is covered, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize revision or broaden the review.

## Artifact And Intended Use

- Artifact: [path]
- Type: [working record | spec | PRD | issue | API contract | technical design | migration contract | plan | decision record | ADR | handoff | other]
- Reviewed state: [revision, hash, or other exact identity]
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
- Active evidence authority: [none | exact covered check, expected evidence, and stop condition]

For Review 2 or 3:

- Prior items and adjudication: [Accepted | Rejected | Open]
- Revisions and new evidence: [bounded changes and evidence]
- Affected dependencies: [dependencies or none]
- Remaining risk: [narrow unresolved scope]

## Judge The Artifact By Its Job

- **Working Record:** accurate living task memory with recoverable slices and decisions, compact evidence pointers, and one next useful action.
- **Spec or durable content artifact:** accepted content, behavior, boundaries, evidence, and uncertainty needed for its stated use.
- **Plan:** an inspectable ordered strategy with scope, dependencies, assumptions, checks, and stop conditions.
- **Decision record or ADR:** the decision, owner, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** a point-in-time continuation package that preserves what its recipient needs without replacing live task memory.
- **Other artifact:** its stated purpose without taking over another artifact's job.

Do not require one artifact to perform another artifact's job.

## Check

Apply only the selected lenses:

- the artifact agrees with accepted requirements, owner decisions, and live facts;
- it contains enough for its intended use without pretending every future question is settled;
- required, tentative, open, deferred, and superseded information cannot be confused;
- load-bearing claims and acceptance conditions have suitable supporting or falsifying mechanisms;
- consequential behavior, failure states, forbidden outcomes, observers, and recovery are explicit where required;
- upstream and downstream artifacts remain consistent and provisional material is identified honestly;
- it avoids speculative scope, unnecessary process, and duplicated information owned elsewhere;
- a future reader can use it without transcript memory or volatile copied context.

Review upstream authority before dependent artifacts. When an upstream problem invalidates downstream assumptions, mark affected material contingent rather than generating exhaustive downstream findings against an unsettled basis.

Before calling something an Issue, ask:

1. Does fitness for the intended use depend on content, source truth, or an owner decision that remains unsettled? If yes, use **Question**.
2. Does fitness depend on a load-bearing claim or condition that available evidence cannot establish? If yes, use **Needs evidence**.
3. Is there a supported artifact defect requiring revision for the intended use? Use **Blocking Issue** when the artifact cannot safely guide that use, otherwise **Non-blocking Issue** when revision can be deferred safely.
4. Is the change merely useful beyond the intended use? Omit it by default; use **Improvement** only when materially relevant or requested.

A **Needs evidence** item must identify the load-bearing claim or condition, required observing boundary, available evidence and its limit, why the gap affects intended-use fitness, and the smallest evidence that could disagree.

A Blocking Issue must identify the exact location or dependency, violated source truth or artifact responsibility, evidence, concrete consequence for intended use, and revision constraints or owning activity to re-enter. Recommend a specific revision only when source intent and dependency effects support it.

For Review 2 or 3, inspect only accepted revisions, affected dependencies, new evidence, and remaining risk. Do not reopen Rejected items without contradictory evidence. For each new Blocking Issue, state whether it repeats, extends, invalidates, or exposes another consequence of a prior revision; is independent; or cannot yet be related from the evidence. Report a related pattern rather than proposing another revision. Review 3 is final; do not recommend Review 4.

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
Artifact: [reviewed artifact]
Intended use: [reviewed boundary]
Reviewed state: [state identity]
Judgment: Pass | Non-blocking | Inconclusive | Blocking
Reasoning: [concise evidence-backed judgment]
Relationship to prior items (Review 2 or 3 only): [related consequence | independent defect | unclear, with evidence]

### Review Items

#### Issues — Blocking
- [location or dependency, issue, violated source or responsibility, evidence, consequence, revision constraints or owning activity]

#### Issues — Non-blocking
- [location or dependency, issue, evidence, why it can be deferred]

#### Unresolved — Questions
- [question, effect on judgment, required answer]

#### Unresolved — Needs evidence
- [load-bearing claim or condition, required observing boundary, available evidence and limit, effect on intended-use fitness, smallest evidence that could disagree]

#### Improvements
- [only when materially relevant or requested: improvement, benefit, evidence]

Dependencies affected: [dependencies or none]
Contingent material: [material and upstream condition, or none]
Evidence gaps: [unproved claims or none]
```

## Calibration

Lead with the few items that can change fitness for the intended use. Prior review, artifact length, polished language, or producer confidence does not establish fitness.

The report is evidence for adjudication. It is not authority over source truth, owner decisions, revisions, dependencies, or another independent dispatch. Pass, Non-blocking, Inconclusive, and Blocking are all valid exits.
