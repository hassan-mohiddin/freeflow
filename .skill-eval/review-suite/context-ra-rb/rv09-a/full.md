# Independent Work Review

Review work you did not produce. Inspect the supplied work, source truth, and evidence directly. Report without editing. The review ends with this report; do not adjudicate findings, fix items, dispatch follow-up, or continue merely to obtain Pass.

A pass is valid. Use a high evidence bar, not a high item count. Do not broaden scope or treat possible improvement as unfinished work.

Read the supplied evidence first. Run a check listed under Active evidence authority, in your own copy, only when that evidence is missing or does not convince you; run nothing else, and make no edits, network calls, or paid runs. When a claim still lacks evidence, report **Needs evidence** with the claim and required observing boundary. When you run a check, apply Verify Work's check-result and claim-result semantics; active evidence does not authorize editing or broaden the review.

## Boundary

- Protected future action: ready for PR review
- Reviewed state: the change in this workspace: `change.diff`, with the changed files after the change in `files/`
- Work: `change.diff`, which changes these files (each after the change in `files/`):
  - `pi-extension/src/freeflow-context/tool.ts`
  - `pi-extension/src/runtime/runtime-context.ts`
  - `pi-extension/tests/cognitive-routing/profile-resolution.test.js`
  - `pi-extension/tests/context-virtualization/extension.test.js`
  - `pi-extension/tests/integration/prompt-architecture.test.js`

## Accepted Outcome And Non-Goals

- Outcome: the change does what the requirements below state.
- Requirements: as accepted, pasted from the change's requirements:

~~~~markdown
# Requirements

Freeflow runs as an extension inside Pi. A subagent session is a child session started by a configured subagent (the Explorer, Reviewer and general-purpose agents). A subagent session keeps Freeflow's mandatory core guidance and its base skills, but its optional capabilities are disabled. The optional capabilities are Context Virtualization, Conversation History and Cognitive Routing.

1. A session is a subagent session when its system prompt identifies it as one. Configured subagents identify themselves in one of two ways: the host stamps the tag `<active_agent name="...">` on child sessions, or the agent's own prompt carries the capability-disable marker `<!-- freeflow-subagent-capabilities: disabled -->`, which the Explorer, Reviewer and general-purpose prompts use.
2. In a subagent session, the capability state reports each optional capability with `enabled: false` and `effective: false`, and with a `blockingReason` whose code is `disabled`. The core Freeflow state stays enabled.
3. In a subagent session, the optional capability prompts are not added to the system prompt, and no Context Virtualization, Conversation History or Cognitive Routing skill directories are offered for discovery. The mandatory Freeflow core prompts and base skills, such as `action-selection`, are still offered.
4. In a subagent session the `freeflow_context` tool is not active.
5. A main (non-subagent) session keeps its configured optional capabilities unchanged.
6. When no Freeflow Context operation is active, the `freeflow_context` tool publishes a placeholder parameter schema that is an object with no `oneOf` list, so that Codex accepts the schema.
~~~~

- Non-goals: none stated.

## Source Truth

- The accepted requirements above. No Specs, Plans, policies or ADRs are supplied.

## Verification Evidence

- Checks and results: the author's report, pasted from `verification.md`:

~~~~markdown
# Verification

Compiled the extension with the project configuration:

    tsc -p pi-extension/tsconfig.json

It compiles without errors. Ran the context-virtualization extension test after the schema change:

    node --test pi-extension/tests/context-virtualization/extension.test.js

Result: 12 tests, 12 pass, 0 fail. The placeholder-schema test and the Context Virtualization registration tests pass.
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
