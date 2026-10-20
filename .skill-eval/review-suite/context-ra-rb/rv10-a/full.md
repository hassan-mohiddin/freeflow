# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `.skill-eval/evaluate-skill/tests/compact-evidence.test.mjs (added)`
  - `skills/evaluate-skill/scripts/lib/compact-evidence.mjs (added)`
  - `skills/evaluate-skill/scripts/lib/plan.mjs`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements: CEV1 compact evidence

`compact-evidence.mjs` encodes an evaluation's evidence as CEV1, a compact line-oriented text whose facts trace back to exact sources, and chooses between that text and canonical JSON. Every byte count reports the UTF-8 size of the text it describes.

1. `encodeCev1(records)` writes one line per record. The header is `H|CEV1`; each other line is the record type followed by its fields as `key=value`, sorted by key and joined with `|`. The text ends with a newline. Encoding is deterministic.
2. A value containing a backslash, '|', a newline, a carriage return, or another C0 control character or DEL is escaped so that decodeCev1 returns the original value.
3. `decodeCev1` rejects text that does not end with a newline, a duplicate field, or an invalid escape.
4. Records must start with one `H|CEV1` header and end with one `R` record. Each `S` (source) record has an id, a kind, a path or output, a SHA-256, a non-negative integer byte count, and a recoverability class. Source ids are unique.
5. Each `F` (fact) record names a known source and has a name, value, span, and operation identity (`<name>@<sha256>`). Its recoverability cannot be stronger than its source's. A fact that breaks these rules is rejected with an error that names the field or source at fault.
6. `renderCompactEvidence` uses CEV1 only when the lineage encodes, the `R` record's `canonicalSha256` matches the canonical JSON, and the CEV1 text is strictly smaller in bytes than the canonical JSON. Otherwise it returns canonical JSON with a `reason` of `lineage-invalid` or `compact-not-smaller`.
7. The canonical text is `JSON.stringify(canonical, null, 2)` followed by a newline. `recovery.canonical_sha256` is the SHA-256 of that text.
8. `bytes.canonical` is the UTF-8 byte length of the canonical text, and `bytes.compact` is the UTF-8 byte length of the CEV1 text (null when lineage is invalid). `bytes.omitted` is `canonical - compact` when CEV1 is used, and 0 otherwise.
9. When lineage is invalid, the result carries the lineage error message in `lineage_error`.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.
- The change's declared tests, which the `tests` command runs.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Ran the compact-evidence tests from the repository root:

    node --test .skill-eval/evaluate-skill/tests/compact-evidence.test.mjs

Result: 5 tests, 5 pass, 0 fail. The tests cover round-tripping escaped values, rejecting missing or overstated fact lineage, choosing CEV1 when lineage is exact and the bytes decrease, falling back to canonical JSON when the reduction is not beneficial, and failing closed when lineage cannot be expressed.

Not run: the plan tests, which hash the evaluator source list that this change extends.
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
