# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `skills/evaluate-skill/scripts/lib/evaluate.mjs`
  - `skills/evaluate-skill/scripts/lib/pi-adapter.mjs`
  - `skills/evaluate-skill/scripts/lib/plan.mjs`
  - `skills/evaluate-skill/scripts/lib/process.mjs`
  - `skills/evaluate-skill/scripts/lib/semantic.mjs`
  - `.skill-eval/evaluate-skill/tests/pi-adapter.test.mjs`
  - `.skill-eval/evaluate-skill/tests/plan.test.mjs`
  - `.skill-eval/evaluate-skill/tests/process.test.mjs (added)`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements

The evaluator runs a Pi subject process and keeps the canonical evidence of what it printed. Pi writes a JSON event stream to stdout. The evaluator bounds two things separately. The retained output is the evidence kept for review and is capped by `outputLimitBytes`. The raw transport is every byte read from stdout and stderr, and it is capped by `transportLimitBytes` as an internal safeguard against unbounded output.

1. Before a stdout line is retained, a Pi JSON event is compacted. A `message_update` event keeps `type` and `assistantMessageEvent`, without `partial`. A `message_start` event keeps `type`, and the message `id` and `role`. `turn_end` and `agent_end` keep only `type`. A `tool_execution_update` event keeps `type`, `toolCallId` and `toolName`. Any other event, and any line that is not JSON, is retained unchanged.
2. A retained line ends with a newline when its input line ended with one. A final line that has no newline is retained without one.
3. The retained output limit applies to the compacted output. A chunk that would take the retained output past `outputLimitBytes` is not retained; the run is terminated and reports `output_limit_exceeded`.
4. `retained_output_bytes` reports the bytes actually kept in stdout and stderr. It never exceeds `outputLimitBytes`.
5. `transport_bytes` counts every raw byte read from stdout and stderr, before compaction. When it exceeds `transportLimitBytes`, the run is terminated and reports `transport_limit_exceeded`.
6. Compaction of a cumulative `message_update` stream does not count against the retained output limit, so a long streamed answer that compacts to a small retained output is not reported as an output overflow.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Ran the evaluator tests that cover the Pi process runner, the Pi adapter and plan construction, from the repository root:

    node --test .skill-eval/evaluate-skill/tests/process.test.mjs .skill-eval/evaluate-skill/tests/pi-adapter.test.mjs .skill-eval/evaluate-skill/tests/plan.test.mjs

Result: 14 tests, 14 pass, 0 fail (process 2, pi-adapter 4, plan 8).

The streamed-update test shows that 100 compacted updates of about 10 KB each stay under the retained output limit while the raw transport is above 1 MB. The raw transport safeguard test still terminates unbounded output. I did not run the model-backed evaluation paths, which need provider credentials.
~~~~

- Known gaps: as the author's report above states them.

## Review Scope

- Review number: 1
- Material lenses: source alignment, correctness and integration, failure and risk, evidence and acceptance, scope and minimality, maintainability
- Active evidence authority: none; no check is declared for this change

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
