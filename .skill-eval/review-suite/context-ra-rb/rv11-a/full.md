# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `.skill-eval/evaluate-skill/reports/v3-phase1.md (added)`
  - `.skill-eval/evaluate-skill/tests/coordinator.test.mjs`
  - `.skill-eval/evaluate-skill/tests/semantic.test.mjs`
  - `docs/plans/skills/2026-07-13-freeflow-evaluator-v3-plan.md`
  - `skills/evaluate-skill/scripts/lib/coordinator.mjs`
  - `skills/evaluate-skill/scripts/lib/evaluate.mjs`
  - `skills/evaluate-skill/scripts/lib/semantic.mjs`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements: objective and semantic result axes in the evaluator

The evaluator keeps the objective result and the semantic (grader) result as separate axes. A case may receive diagnostic semantic grading after an objective failure, and that grading never becomes a promotable result.

1. The objective axis and the semantic axis stay separate. Objective verdicts come only from the objective checks. Semantic grading sets verdicts only for the case's semantic assertion IDs, and it never changes the verdict of an objective assertion.
2. When no objective assertion fails, semantic grading is promotable: its verdicts are merged into the case's assertions, and the semantic result records `diagnostic: false` and `promotable: true`.
3. When at least one objective assertion fails, semantic grading may still run, but only as diagnostic grading. The semantic result records `diagnostic: true` and `promotable: false`. Its verdicts are not merged into the assertions, so semantic assertions keep their objective verdicts, and the case verdict stays the objective verdict. The grader's evidence is still recorded under the semantic result.
4. Diagnostic grading tells the grader that it is non-promotable diagnostic grading after an objective failure, and that it cannot repair acceptance. Without the diagnostic option, semantic grading of a run whose objective checks failed is refused with "Semantic grading cannot repair failed objective evidence".
5. When semantic grading fails after the subject has run, the run ends incomplete. Its diagnostic lists the subject under `completed_variants` with its role, so the subject can be regraded, and no result is published.
6. An assembled semantic assertion carries the grader's evidence for that assertion, not a placeholder.
7. The grader's evidence reports the objective axis as it stands: `objective_checks_passed` is true exactly when the run's objective checks passed, for every kind of run the grader can receive.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.
- The change's declared tests, which the `tests` command runs.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Ran the evaluator's coordinator and semantic tests from the repository root:

    node --test .skill-eval/evaluate-skill/tests/coordinator.test.mjs .skill-eval/evaluate-skill/tests/semantic.test.mjs

Result: 16 tests, 16 pass, 0 fail.

The new tests cover diagnostic semantic grading after an objective failure (promotable false, diagnostic true, the objective verdict kept), the regradable subject when diagnostic grading fails, evidence carried into the assembled assertion, and the refusal of semantic grading of a failed objective run without the diagnostic option.

Not run: the git-backed plan and CLI tests, which read the repository history.
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
