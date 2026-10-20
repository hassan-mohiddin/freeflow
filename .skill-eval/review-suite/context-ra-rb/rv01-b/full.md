# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `capabilities/compaction/SKILL.md`
  - `capabilities/compaction/references/summary-format.md`
  - `pi-extension/dist/compaction/carry.js`
  - `pi-extension/dist/compaction/controller.js`
  - `pi-extension/dist/compaction/results.js`
  - `pi-extension/src/compaction/README.md`
  - `pi-extension/src/compaction/carry.ts`
  - `pi-extension/src/compaction/controller.ts`
  - `pi-extension/src/compaction/results.ts`
  - `pi-extension/tests/compaction/agent-path.test.js`
  - `pi-extension/tests/compaction/carry.test.js`
  - `pi-extension/tests/compaction/notices.test.js`
  - `pi-extension/tests/compaction/worker-warning.test.js`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements: numbered carried files, and the compaction notices

The change numbers carried files and carried read results by file line, and changes what the compaction notices tell the agent to do and to say.

1. Carried files and carried read results print each line with its file line number, then a tab, then the line's text. Numbers are right-aligned to the width of the largest number in the block, so lines 9 to 11 print as " 9", "10", "11".
2. A carried read result is numbered from the offset its read started at: a read at offset 3 prints its first line as 3.
3. Pi's note at the end of a partial read (the "[Showing lines ...]" or "[N more lines in file ...]" note) is not numbered.
4. The 'Files, read at compaction' section states that its file bodies, and the text read results below it, are numbered by file line; errors, images and other tool results are not.
5. The warning ("Compaction is due soon") lets a worker finish a return that ends within a step or two, instead of compacting first. "Compact now" still tells a worker to compact before it returns, since the Coordinator and the next assignment continue the same history.
6. The notices do not say that Pi compacts only once a run ends; each notice describes Pi's threshold without tying it to the end of a run.
7. The Coordinator's notice under projection still says not to compact itself, and to delegate the compaction to a worker.
8. The compaction skill matches the notices: under Cognitive Routing a worker compacts before it returns when compact now applies, and may finish a return that ends within a step or two when only the warning applies.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.
- The change's declared tests, which the `tests` command runs.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Ran the carried-context and worker-notice tests on the branch:

    node --test pi-extension/tests/compaction/carry.test.js pi-extension/tests/compaction/worker-warning.test.js

Result: 7 tests, 7 pass, 0 fail. The carry tests cover numbered carried files and a read result numbered from its offset, including the partial-read note.

Did not rerun the notices and agent-path tests after the wording change to the notices.

Not run: `npm run check`.
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
