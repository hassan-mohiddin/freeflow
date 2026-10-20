# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `skills/evaluate-skill/scripts/lib/feasibility.mjs (added)`
  - `skills/evaluate-skill/scripts/lib/fixture-oracle.mjs (added)`
  - `skills/evaluate-skill/scripts/lib/plan.mjs`
  - `skills/evaluate-skill/scripts/lib/workspace.mjs`
  - `.skill-eval/evaluate-skill/tests/cases.test.mjs`
  - `.skill-eval/evaluate-skill/tests/feasibility.test.mjs (added)`
  - `.skill-eval/evaluate-skill/tests/plan.test.mjs`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements

Feasibility preflight decides, before any provider request or host capability is used, whether an evaluation case can run as declared. It reports exact blocking findings for problems it can find without a model run: evidence the subject cannot discover, required tools that are missing, literal requirements without a fixture source, undeclared equivalences, conflicting output assertions, budgets too small for the declared turns, packet limits, rubric text that leaks into the subject-visible prompt, and fixture-oracle pressure that a case declares.

1. Preflight compiles its findings before any provider request, model run or host capability access. A case with a blocking finding stops there.
2. Each finding has a stable identifier (for example `FEAS-FIXTURE-ORACLE`), a source span in the case, the evidence it was based on, and a blocking reason.
3. A case may declare `fixture_oracle` with `argv` (the executable `node` followed by a script path inside the fixture root), `expected_exit` (an integer) and optional `stdout_contains` literals. The workspace validator rejects unknown fields, any other executable, and a script path that does not stay inside the fixture root.
4. During preflight the declared oracle must reproduce the declared pressure: its exit code equals `expected_exit`, it does not time out, and its stdout contains every `stdout_contains` literal. Otherwise preflight reports `FEAS-FIXTURE-ORACLE` as blocking.
5. The oracle runs in a sandbox: no shell, a restricted environment with no inherited credentials, a bounded run time, and bounded output. It reports its exit code, signal, timeout state, stdout and stderr to the compiler.
6. Fixture contents are untrusted input, because a case can come from a third-party skill. Preflight may observe fixture contents only through what the case declares, and it must not give fixture content any effect on the host beyond those observations.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Ran the evaluate-skill tests that cover feasibility, case validation and plan construction, from the repository root:

    node --test .skill-eval/evaluate-skill/tests/feasibility.test.mjs .skill-eval/evaluate-skill/tests/cases.test.mjs .skill-eval/evaluate-skill/tests/plan.test.mjs

Result: 27 tests, 27 pass, 0 fail (feasibility 6, cases 8, plan 13).

The fixture-oracle sandbox test ("fixture oracle runs without a shell or inherited credential environment") and the blocking-before-host-access plan test pass. I did not run the model-backed evaluation paths, which need provider credentials.
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
