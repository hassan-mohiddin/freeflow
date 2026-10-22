# Work Review

This reference is judgment; Review Work's Rules still bind. Its Independent Review section is a contract: the brief and the reviewer's instructions are binding as written.

## Establish What The Review Protects

Goal: judge the actual state against its real sources, not the producer's account of it.

Identify the exact code, diff, commit, or integrated state; its accepted outcome, non-goals, relevant requirements and amendments; the future action being protected; and the verification evidence and gaps.

Inspect the actual state and governing sources, not just the producer's summary or explanation. A detailed execution contract can itself have been mistaken; check the user outcome before judging compliance with the suggested implementation steps.

## Apply The Lenses

Goal: use only the lenses that can change the boundary judgment.

- **Source alignment:** required behavior and accepted amendments are implemented without omission or invented obligations.
- **Correctness and integration:** reachable paths, affected callers, states, and components work together without regressions.
- **Safety evidence:** name the one fact the change's safety rests on and grade how it is known, weakest first: asserted; cited at file:line; reasoned through; scripted against the real code; reproduced in the running app. A text search for callers stops at dynamic dispatch, configuration and feature flags, generated code, library source at the pinned version, wire formats and stored columns, and code in other languages or repositories that reads the same data; look there before grading the fact above reasoned.
- **Failure and risk:** material errors, recovery, permissions, data, and compatibility are handled safely, as required.
- **Evidence and acceptance:** claims are supported at their required observing boundaries, not merely by green summaries.
- **Scope and minimality:** complexity and coordination serve requirements or demonstrated needs rather than optional stronger guarantees.
- **Maintainability:** behavior and failure paths remain understandable and changeable, without hidden policy or fragile coupling.

More implementation is not better: check both missing accepted work and unnecessary additions. A prototype result is not production acceptance, and a test protecting a mechanism does not make that mechanism required. If the implementation follows an artifact whose baseline conflicts with a later accepted change, expose that source mismatch rather than choose whichever source makes the work pass.

## Two Checks In Self-Review

Goal: the user sees every choice nobody agreed, and no existing check was bent to fit the work.

When self-reviewing your own work, also run:

- **Decision check:** run [Discuss Work](../../../skills/discuss-work/SKILL.md#account-at-the-end)'s decision check against its decision list (with a Working Record, `sources/decisions.md`).
- **Test-integrity check:** run Verify Work's [test-changes](../../../skills/verify-work/scripts/test-changes.mjs) script from the work's base, and settle each listed change to an existing test, fixture, or shared setup as [Test Design](../../../skills/verify-work/references/test-design.md)'s Rule requires.

## Security Risk Lens

This section is judgment, with two Rules: security-sensitive product behavior stays user-owned, so never invent access, retention, logging, or fail-open or fail-closed policy during review; and never copy secrets, credentials, unrestricted personal data, or sensitive payloads into review context. It helps frame review and does not replace repository security policy, threat modeling, specialist review, or stack-specific hardening guidance.

### Establish Authority

Identify:

- assets and data requiring protection;
- actors, roles, tenants, and privilege levels;
- trust boundaries and external systems;
- accepted security and privacy policy and threat model;
- compatibility and failure behavior that security controls must preserve.

### Trace The Paths

Review the affected path from boundary to effect:

- authentication: who or what is this actor;
- authorization: may this actor perform this operation on this resource;
- input: validation, canonicalization, size, encoding, and injection surfaces;
- output: escaping, disclosure, error detail, and side channels;
- data: collection, transport, storage, isolation, retention, deletion, and audit;
- secrets: source, scope, rotation, exposure, and logging;
- execution: shell, file, URL, template, deserialization, plugin, or code-loading boundaries;
- dependencies: provenance, permissions, known risk, update impact, and transitive behavior;
- failure: partial state, retries, lockout, rate limits, rollback, and fail-open or fail-closed behavior.

Look for confused-deputy and cross-tenant paths, not only malformed input.

### Require Boundary-Matched Evidence

Prefer evidence at the real boundary:

- tests proving allowed and denied roles and resources;
- negative input and injection cases;
- dependency or configuration inspection tied to the shipped artifact;
- logs or traces demonstrating no secret or sensitive leakage;
- failure-path tests for partial authorization, retry, and recovery;
- specialist analysis for cryptography, sandboxing, identity protocols, or high-impact threats.

A generic scanner pass cannot prove authorization logic or policy correctness. A unit test cannot prove deployed headers, identity configuration, or infrastructure permissions.

Use the smallest sanitized evidence that supports the item.

### Calibrate Items

Treat supported exploitable behavior, policy violation, unintended privilege or data exposure, unsafe failure semantics, secret leakage, or a missing required control as an Issue.

Classify it against accepted security policy and the reviewed boundary:

- **Blocking:** crossing the boundary would remain unsafe, non-compliant, or contrary to a required control.
- **Non-blocking:** the issue is real but can be deferred safely without violating the accepted boundary.

Use **Question** when security behavior or accepted risk remains undecided. Use **Needs evidence** when a control may exist but the available test or environment cannot establish it.

Treat materially useful defense in depth beyond the accepted boundary as an Improvement. Omit theoretical hardening, preference, or hypothetical completeness.

Do not omit an observed security issue because the selected lenses were narrower. Name the asset, path, precondition, consequence, evidence, and source requirement.

### Return Through The Selected Role

For self-review, route a security concern that changes the route to its owner: Execute Work's [diagnose](../../../skills/execute-work/references/diagnose.md) for unknown exploitability or cause, [Discuss Work](../../../skills/discuss-work/SKILL.md) for missing policy or accepted-risk decisions, Execute Work's [design](../../../skills/execute-work/references/design.md#pressure-signals) when trust decisions spread across callers, and [Deliver Work](../../../skills/deliver-work/SKILL.md)'s launch route when the concern affects production rollout.

For independent review, classify the concern in the review report and stop. Do not route, correct, or dispatch follow-up. The receiving agent adjudicates the report and selects what follows.

## Independent Review

Use this to brief an independent reviewer of work, and, as that reviewer, to review it.

### The Brief

The brief points to where the reviewer finds each input; the reviewer reads them itself. Never paste the requirements, the diff, the docs, or the evidence into it, and never send only your summary of them. Write the brief in this shape, one labelled line each:

```md
Review: [1 | 2 | 3]
Boundary: [the protected future action]
Reviewed state: [commit]
Method: [path to Review Work's SKILL.md] and its references/work.md
Agreement: [path to the Working Record, read through its resume view, or to the accepted outcome, requirements and non-goals; plus any Spec or Plan it names]
Docs: [paths to the dev docs covering the changed files, read from the base branch | none]
Review rules: [path to the project's Review Rules or REVIEW.md, read from the base branch | none]
Diff: [base]..[head]
Evidence: [path to the verification evidence and known gaps; check it, don't trust it | none]
May run: [the project's declared checks, named | another exact covered check, its expected evidence and stop condition | nothing]
Previous report: [Review 2 or 3 only: path to the previous report and its adjudication]
Report: [path to write the report to]
```

Write each path in backticks. Add a `Lenses:` line only to narrow the review to the lenses material to this boundary, and a `Notes:` line pointing to the invariant, state owner, affecting paths, observer, forbidden mutations, prior-state requirements, adversarial disproof, mutation footprint and fidelity limits when state transitions or proof integrity matter. `May run` defaults to what Review Work's Rules allow a reviewer. For Review 2 or 3, the diff is the range since the previous review's reviewed state, not the whole change.

[review-packet](../scripts/review-packet.mjs) writes this brief for you: `node <review-work-directory>/scripts/review-packet.mjs --review <n> --base <ref> --task <task folder> --boundary <the protected action>` fills every line it can (the Review 2 or 3 diff from the previous brief's reviewed state, the docs covering the changed files, the declared checks), leaves the rest empty and runs check-brief. Before dispatching, run [check-brief](../scripts/check-brief.mjs) on the brief: `node <review-work-directory>/scripts/check-brief.mjs <brief> [--root <repository>]`. It refuses a brief missing a required line or naming a path or commit that does not exist. Dispatch only a brief it accepts; if it cannot run, check the same by hand and say so in the record.

A reviewer that cannot read files is a host gap: record it, and do not paste the inputs instead.

### Reviewing As The Independent Reviewer

The reviewer reads this section, not a copy of it.

Review work you did not produce. Inspect the work, source truth, and evidence the brief points to directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work. Lead with the few items that can change the boundary judgment; prior review, urgency, implementation effort, or producer confidence does not establish correctness.

Read the brief's pointers: the agreement (through the Working Record's resume view when the brief names one), the docs, the Review Rules, and the diff. Then read the evidence as claims to check. Run a check listed under `May run`, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

Apply the lenses the brief names, or all of those under Apply The Lenses. Do not search for unrelated issues. Report an out-of-scope issue only when it materially affects whether this boundary may be crossed. Classify each item and determine the judgment as Review Work's SKILL.md does: "Classify Before Calling Something A Defect" and the independent judgment under "Perform A Selected Independent Review".

For Review 2 or 3, inspect only the diff since the previous review's reviewed state: accepted corrections, affected interactions, new evidence, and remaining risk. Never repeat a finding already Accepted, Rejected, or fixed; reopen a Rejected one only with contradictory evidence. For each new Blocking Issue, state whether it repeats, extends, invalidates, or exposes another consequence of a prior correction; is independent; or cannot yet be related from the evidence. Report a related pattern rather than proposing another patch. Review 3 is final; do not recommend Review 4.

The report is evidence for adjudication. It is not authority over source truth, owner decisions, corrections, or another independent dispatch. Pass, Non-blocking, Inconclusive, and Blocking are all valid exits. Write it in this shape, omitting empty groups and Improvements that are neither materially relevant nor requested:

```md
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
```
