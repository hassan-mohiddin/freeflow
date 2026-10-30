# Artifact Review

This reference is judgment; Review Work's Rules still bind. Its Independent Review section is a contract: the context to provide and the reviewer prompt are binding as written.

It covers documents that guide later work, such as a Spec, Plan, design, decision record, ADR, handoff, or skill, and accounts of work already done: a final report, a status or results note, or a Working Record. Reports And Records below adds what is particular to an account.

## Establish The Artifact And Its Intended Use

Goal: review the whole artifact, for the use it must actually serve.

Identify the artifact's exact state, type, intended use, accepted outcome and amendments, non-goals, governing format, source basis, unresolved questions, dependencies, and evidence gaps. Inspect the complete artifact and relevant sources directly, not only its author's narrative.

## Establish Which Sources Govern

Goal: judge against current accepted intent, not the artifact's own baseline.

Check current intent and accepted upstream requirements before dependent artifacts. Follow material amendments, supersession, and deliberately selected experimental findings. Do not infer acceptance from a proposal, a review label, a passing test, or an unexplained "user approved" summary.

Distinguish accepted behavior from the suggested implementation mechanism, and check both directions: has the artifact introduced stronger obligations than the accepted outcome needs, and has it omitted accepted changes or kept a superseded baseline? An experiment can establish a fact without selecting it for production; an implementation Plan cannot ignore later accepted learning because its older version was reviewed.

If upstream content is unresolved or contradictory, mark dependent material contingent rather than generating exhaustive downstream findings against an unsettled premise.

## Judge The Artifact By Its Job

Goal: ask of each artifact only what its job requires.

- **Spec or content contract:** the accepted content, behavior, boundaries, evidence, and uncertainty needed for its intended use.
- **Plan:** an inspectable, supported ordered strategy with scope, dependencies, assumptions, checks, and stop or invalidation conditions.
- **Decision record or ADR:** the choice, owner, source, alternatives, rationale, consequences, and revisit or supersession conditions.
- **Handoff:** enough truthful point-in-time context for its recipient to continue safely, without replacing the live record.
- **Report:** every claim the reader may act on matches what happened, every evidence pointer resolves and shows what the claim says, no claim is stronger than its evidence, and unfinished, skipped, or failed work is stated.
- **Working Record:** accurate current task state, recoverable Slices, decisions and work, compact evidence pointers with their limits, a provisional remaining route, defining artifacts and the sources recovery reads, sufficient for a fresh context to resume, and one next action.
- **Other artifact:** its declared purpose without taking over another artifact's job.

A proposal can be fit for discussion without being implementation-ready. Do not block on an open question the artifact intentionally preserves and whose answer its current use does not need.

## Apply The Lenses

Goal: use only the lenses that can change fitness.

- **Source alignment:** accepted requirements, amendments, decisions, and live facts agree with the artifact.
- **Sufficiency:** it contains enough for its use without implying every future question is settled.
- **Decision clarity:** required, tentative, open, deferred, and superseded material cannot be confused.
- **Evidence and acceptance:** load-bearing claims and completion conditions have suitable observing or falsifying mechanisms.
- **Failure and risk:** consequential behavior, failure states, forbidden outcomes, observers, and recovery are defined where required.
- **Dependency integrity:** relevant upstream and downstream sources agree, or their contingency is explicit, and provisional material is identified honestly.
- **Scope and minimality:** requirements and process are justified rather than speculative, mechanically exhaustive, or duplicating information owned elsewhere.
- **Clarity and continuity:** a future reader can use the artifact without reconstructing the author's private reasoning, the full transcript, or volatile copied context.

Do not demand implementation detail from a PRD, progress history from a Plan, or universal guarantees from a bounded prototype report.

## Reports And Records

Goal: compare an account of work done with what happened, not with how the author remembers it, so every claim the reader may act on is true and no stronger than its evidence.

Identify the account's reader and the moment it serves: handing work back to the user, recovering after context loss, or handing over to another agent. Gather what it describes: the commands run and their output, changed files and commits, run results, messages sent, and the requests and decisions it cites, and read that evidence directly. Read a Working Record through [Track Work](../../../skills/track-work/SKILL.md). A claim that matches the author's earlier summary but not the output it summarizes is wrong.

Instead of the lenses above, check each claim:

- **Fidelity:** each statement of what was done, found, or decided matches the actions and outputs it describes. Recompute counts, totals, and costs from the source instead of trusting the stated figure.
- **Pointers:** each commit, file, run ID, path, or link resolves, and what it shows is what the claim says.
- **Strength:** "verified" names a check that ran on the current state; "done" is not stated for work that was drafted, partly run, or run against an earlier state. A passing subset is not "tests pass".
- **Unfinished work:** skipped steps, failures, workarounds, and open questions are stated where the reader will see them, not left for the reader to infer from silence.
- **Attribution:** the user's words and decisions are quoted or cited as theirs; the author's inferences are labelled as inferences.

A wrong figure, a pointer that does not resolve, or a claim stronger than its evidence is an Issue when the reader could act on it: Blocking when acting on it would mislead the user or a resuming agent, Non-blocking when the error cannot change what they do. Wording and presentation preferences are not Issues.

The author corrects the account; a Working Record is revised through Track Work. When a claim turns out unsupported, correct the claim or gather the missing evidence through [Verify Work](../../../skills/verify-work/SKILL.md); never adjust the evidence to match the claim.

## Independent Review

Use this to brief an independent reviewer of anything but work: an artifact, a report or record, or an eval definition. The reviewer receives the prompt below filled in, with the complete artifact and its sources, and reads nothing else of this skill, so the prompt must stand alone.

Provide:

- artifact path, type, exact reviewed state, and intended use;
- accepted outcome, requirements, non-goals, and owner decisions;
- unresolved questions and known evidence gaps;
- the artifact's job and the lenses material to its intended use, each copied from this reference (for a report or record, its claim checks) or from Eval Definition Review, with whatever that section says to add;
- for a report or record, what the account describes: the commands, outputs, files, commits, and run results its claims rest on;
- the artifact-specific schema or format contract when one exists;
- relevant code, tests, policies, ADRs, established behavior, and the project's Review Rules (or its `REVIEW.md`), read from the base branch;
- upstream and downstream artifacts in dependency order, with the upstream authority and which material remains provisional or contingent;
- what the reviewer may run: the default in Review Work's Rules, another exact covered check with its expected evidence and stop condition, or nothing;
- the review number and, for Review 2 or 3, the previous report, its adjudication, and the revisions since the previous review's reviewed state, not the whole artifact history.

```md
# Independent Artifact Review

Review an artifact state you did not produce. Inspect the complete artifact, source truth, dependencies, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, settle owner decisions, revise anything, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden the artifact's job or treat possible improvement as unfinished work. Lead with the few items that can change fitness for the intended use. Prior review, artifact length, polished language, or producer confidence does not establish fitness.

Read the supplied evidence first. Run a check listed under May run, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. Reading files, with any command that only reads, is inspection, not a check. When a claim still lacks evidence, report **Needs evidence** with the load-bearing claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize revision or broaden the review.

## Artifact And Intended Use

- Artifact: [path]
- Type: [spec | PRD | issue | API contract | technical design | migration contract | plan | decision record | ADR | handoff | report | working record | eval definition | other]
- Reviewed state: [revision, hash, or other exact identity]
- Intended use: [decision or future action this artifact must support]
- Dependency order: [upstream -> downstream, or standalone]
- Its job: [the job the review method gives this type]

Do not require one artifact to perform another artifact's job.

## Accepted Outcome And Non-Goals

- Outcome: [accepted outcome]
- Requirements: [accepted requirements]
- Non-goals: [intentional exclusions]
- Owner decisions: [settled decisions or none]
- Unresolved questions: [questions or none]

## Source Truth

- [code, tests, policies, ADRs, Review Rules, established behavior, upstream artifacts]

## Evidence And Known Gaps

- Supporting evidence: [evidence or none]
- Known gaps: [gaps or none]

## Review Scope

- Review number: [1 | 2 | 3]
- Lenses: [each material lens or check, with its line from the review method]
- May run: [the project's declared checks, named | another exact covered check, its expected evidence and stop condition | nothing]

For Review 2 or 3:

- Previous report and its adjudication: [report path, or items with Accepted | Rejected | Open]
- Revisions since the previous review's reviewed state and new evidence: [bounded changes and evidence]
- Affected dependencies: [dependencies or none]
- Remaining risk: [narrow unresolved scope]

## Check

Apply only the listed lenses. Review upstream authority before dependent artifacts. When an upstream problem invalidates downstream assumptions, mark affected material contingent rather than generating exhaustive downstream findings against an unsettled basis.

Before calling something an Issue, ask:

1. Does fitness for the intended use depend on content, source truth, or an owner decision that remains unsettled? If yes, use **Question**.
2. Does fitness depend on a load-bearing claim or condition that available evidence cannot establish? If yes, use **Needs evidence**.
3. Is there a supported artifact defect requiring revision for the intended use? Use **Blocking Issue** when the artifact cannot safely guide that use, otherwise **Non-blocking Issue** when revision can be deferred safely.
4. Is the change merely useful beyond the intended use? Omit it by default; use **Improvement** only when materially relevant or requested.

A defect the reviewed revision did not introduce is **Pre-existing**: report it for the user with the evidence that it predates the revision. It is never a Blocking Issue.

A **Needs evidence** item must identify the load-bearing claim or condition, required observing boundary, available evidence and its limit, why the gap affects intended-use fitness, and the smallest evidence that could disagree. Establish that the claim is required. Distinguish a missing observation from a supported artifact defect; check whether evidence applies to the current artifact and accepted requirement rather than a superseded version. Do not prescribe broader implementation merely to fill an evidence gap.

A Blocking Issue must identify the exact location or dependency, violated source truth or artifact responsibility, evidence, concrete consequence for intended use, and revision constraints or owning activity to re-enter. Recommend a specific revision only when source intent and dependency effects support it. For any Issue, name the defect's class and every other place in the artifact where it occurs, not one instance.

For Review 2 or 3, inspect only the revisions since the previous review's reviewed state: accepted revisions, affected dependencies, new evidence, and remaining risk. Never repeat a finding already Accepted, Rejected, or fixed; reopen a Rejected one only with contradictory evidence. For each new Blocking Issue, state whether it repeats, extends, invalidates, or exposes another consequence of a prior revision; is independent; or cannot yet be related from the evidence. Report a related pattern rather than proposing another revision. Review 3 is final; do not recommend Review 4.

## Judgment

Blocking when at least one Blocking Issue exists; otherwise Inconclusive when a material Question or Needs evidence item prevents judgment; otherwise Non-blocking when only Non-blocking Issues remain; otherwise Pass. Improvements and Pre-existing items do not change the judgment.

The report is evidence for adjudication. It is not authority over source truth, owner decisions, revisions, dependencies, or another independent dispatch. Pass, Non-blocking, Inconclusive, and Blocking are all valid exits.

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

#### Pre-existing
- [location or dependency, defect, evidence that it predates the revision, consequence]

#### Improvements
- [only when materially relevant or requested: improvement, benefit, evidence]

Dependencies affected: [dependencies or none]
Contingent material: [material and upstream condition, or none]
Evidence gaps: [unproved claims or none]
```
