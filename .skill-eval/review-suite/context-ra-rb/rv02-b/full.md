# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `dev-docs/guides/performance.md`
  - `dev-docs/subsystems/cognitive-routing.md`
  - `dev-docs/subsystems/request-history-and-cache.md`
  - `pi-extension/dist/cognitive-routing/event-store.js`
  - `pi-extension/dist/host/read-only-session.js`
  - `pi-extension/dist/index.js`
  - `pi-extension/dist/provider-support/openai/index.js`
  - `pi-extension/src/cognitive-routing/event-store.ts`
  - `pi-extension/src/host/read-only-session.ts`
  - `pi-extension/src/index.ts`
  - `pi-extension/src/provider-support/openai/index.ts`
  - `pi-extension/tests/cognitive-routing/README.md`
  - `pi-extension/tests/cognitive-routing/startup-verification.test.js (added)`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements: verify routing's startup by the session file's tail, and never trust a reload

At session start, routing checks that the session it replays is persisted. Pi parses the session file when it opens a session and appends each entry synchronously after that, so the check can start from a trust point and read only the bytes appended since. A reload keeps Pi's session in memory without re-reading the file, so a reload must not establish a trust point.

1. When Pi has just parsed the session file at session start, routing records the file's size and entry count as its trust point. A later startup check reads only the bytes appended since that point. When those bytes are exactly Pi's in-memory entries, in order, routing needs no whole-file snapshot.
2. Without a trust point, or when any appended bytes differ from Pi's in-memory entries, routing reads a whole-file snapshot and decides from that comparison.
3. A routing entry that Pi holds in memory but that the session file does not contain blocks routing. It is not treated as persisted.
4. A session start that Pi reports as a reload establishes no trust point, because the session stays in memory and the file is not re-read. A trust point from before the reload still applies after it.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.
- The change's declared tests, which the `tests` command runs.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Ran the startup verification tests from the pi-extension directory:

    node --test tests/cognitive-routing/startup-verification.test.js

Result: 4 tests, 4 pass, 0 fail.

The tests cover a start Pi just loaded, verified by the file's tail without a snapshot; the full snapshot deciding when there is no trust point; an entry Pi holds but never wrote blocking routing; and a reload not trusting a file it did not re-read.

Not run: the full cognitive-routing suite and the performance budget check.
~~~~

- Known gaps: as the author's report above states them.

## Review Scope

- Review number: 1
- Material lenses: source alignment, correctness and integration, failure and risk, evidence and acceptance, scope and minimality, maintainability
- Active evidence authority: the `tests` command (through `run_command`), which runs the change's declared tests on the full tree, in your own copy, with no edits

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

A defect the change did not introduce is **Pre-existing**: report it for the user with the evidence that it predates the change. It is never a Blocking Issue.

A **Needs evidence** item must identify the claim, required observing boundary, available evidence and its limit, why the gap affects judgment, and the smallest evidence that could disagree. Establish that the claim is required. Check the candidate examined and any later code/test changes; a weakened assertion or superseded capture cannot establish current acceptance. Missing evidence does not by itself justify an implementation fix or a stronger requirement.

A Blocking Issue must identify the exact location, violated requirement or source truth, evidence, concrete boundary consequence, and correction constraints or owning activity to re-enter. Recommend a specific correction only when directly supported. For any Issue, name the defect's class and every other place in the reviewed state where it occurs, not one line.

For Review 2 or 3, inspect only the diff since the previous review's reviewed state: accepted corrections, affected interactions, new evidence, and remaining risk. Never repeat a finding already Accepted, Rejected, or fixed; reopen a Rejected one only with contradictory evidence. For each new Blocking Issue, state whether it repeats, extends, invalidates, or exposes another consequence of a prior correction; is independent; or cannot yet be related from the evidence. Report a related pattern rather than proposing another patch. Review 3 is final; do not recommend Review 4.

## Determine The Judgment

1. **Blocking:** at least one Blocking Issue exists.
2. **Inconclusive:** no Blocking Issue exists, but a material Question or Needs evidence item prevents judgment.
3. **Non-blocking:** only Non-blocking Issues remain.
4. **Pass:** no Issues or material unresolved items remain.

Improvements and Pre-existing items do not change the judgment.

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

#### Pre-existing
- [location, defect, evidence that it predates the change, consequence]

#### Improvements
- [only when materially relevant or requested: improvement, benefit, evidence]

Evidence gaps: [unproved claims or none]
