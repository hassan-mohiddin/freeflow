# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `scripts/freeflow-snapshot.mjs`
  - `scripts/freeflow-snapshot.test.mjs`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements: runtime dependencies in the development snapshot

`scripts/freeflow-snapshot.mjs` builds a self-contained development snapshot of one committed Freeflow revision. This change makes the snapshot carry the package's declared runtime dependencies, installed from that revision's committed lockfile.

1. A refresh archives the selected committed revision (HEAD by default) with `git archive`. Uncommitted and ignored files are excluded.
2. When the snapshot package declares dependencies, the refresh installs the production tree from the revision's committed package-lock.json with npm ci --omit=dev --ignore-scripts --legacy-peer-deps --no-audit --no-fund; no development dependencies are installed.
3. The refresh runs npm ci with --ignore-scripts, so no lifecycle script (install, preinstall, postinstall, prepare) of an installed dependency runs.
4. A snapshot package that declares runtime dependencies but has no committed `package-lock.json` fails the refresh with an error that names the lockfile, and publishes nothing.
5. The package tarball is produced with `npm pack --ignore-scripts`. The packed package must contain every required runtime entrypoint.
6. Each installed runtime dependency is present under `node_modules` in the published package. Publication fails if a runtime dependency has no version.
7. Snapshot metadata records `runtimeDependenciesInstalled`, `packageLockSha256` (the SHA-256 of the lockfile bytes), and one `runtimeDependencies` entry per declared dependency with its name, requested spec, installed version, and lockfile integrity when the lockfile has one.
8. `packageFileCount` counts the files of the packed package. `fileCount` counts the files of the published target, so it is larger than `packageFileCount` when runtime dependencies are installed.
9. A snapshot package with no runtime dependencies is published without `node_modules`, and its metadata records `runtimeDependenciesInstalled: false` with an empty `runtimeDependencies` list.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.
- The change's declared tests, which the `tests` command runs.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Ran the snapshot script tests from the repository root:

    node --test scripts/freeflow-snapshot.test.mjs

Result: 4 tests, 4 pass, 0 fail (about 4 seconds). The first test now builds a fixture with a file-based runtime dependency and checks that the published target contains it, that the metadata records the lockfile digest and the dependency record, and that `fileCount` exceeds `packageFileCount`. The first-installation and HEAD-replacement checks also confirm the dependency is present. The two failure-path tests pass unchanged.

Not run: the repository-wide `npm run check` gate, and a real refresh of the development snapshot target.
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

Write review.md in the task's format: its first line is the Judgment line, as the task says; the fields below follow it.

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
