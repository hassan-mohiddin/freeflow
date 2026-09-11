---
name: execute-work
description: "Use when preparing and carrying out requested or approved concrete work, including implementation, fixes, prototypes, documentation, configuration, and repository maintenance."
---

# Execute Work

Produce the agreed concrete result through supported preparation, bounded execution, verification, and correction. Do not make the user supply an implementation plan when the request authorizes you to figure it out.

Workflow establishes the work agreement and coordinates authority, ownership, and the user-facing return boundary. Execute Work owns implementation preparation and continuation within it. Task memory belongs to Track Work; governing choices remain with the user.

## Establish The Execution Basis

Consume the current request, accepted discussion, governing artifacts, and relevant live state. Establish which assignment and stopping condition currently apply; do not combine older directions with a superseding contract. Resolve material ambiguity before dependent effects. Do not restart discovery because execution was selected.

Before production changes, establish:

- **Outcome:** the required result, constraints, non-goals, and acceptance boundary.
- **Approach:** the supported mechanism, affected code or artifacts, dependencies, and necessary ordering.
- **Evidence:** a check or observation capable of disagreeing with the result.
- **Agreement:** covered effects, extent of work, and when to return to the user.

Before effects, check whether a selected checkpoint or separately controlled boundary is already due. Do not cross it while unresolved.

If the agreement is materially unclear, return to [Workflow](../workflow/SKILL.md) before the unsettled execution. A clear request may already establish it; do not ask again merely to perform a ritual.

An agreement to fix a bug can cover investigation before the remedy is known. An agreement to return a plan does not cover production edits. Distinguish evidence gathering from implementation even when both are authorized.

Use [Discuss](../discuss/SKILL.md) when outcome or material approach alternatives need reconsideration, [Decision Gate](../decision-gate/SKILL.md) for one blocking user-owned choice or source conflict, and [Diagnose Failure](../diagnose-failure/SKILL.md) when the cause is unsupported.

## Gather Enough Context For This Unit

Choose the next coherent result, then identify what is missing to implement and check it. Reuse current supported sources; inspect only the live boundaries whose freshness matters.

Find the relevant mechanism, callers, contracts, and observing seam before changing them. Do not begin substantial implementation from a guessed API, ownership boundary, or failure cause. Do not read every file or settle every later Slice merely to avoid all uncertainty.

Readiness means you can explain what will change, why it should produce the accepted result, and how the result will be checked. It does not require knowing every line or helper in advance. If an unfamiliar fixture or observing stage could invalidate substantial dependent work, establish that observer first through a bounded investigation. Reuse adequate fixtures; do not make a separate prototype mandatory.

Before substantial implementation, read [Design for Depth](../design-for-depth/SKILL.md) and use its Implementation Decisions method when unresolved representation, identity, ownership, algorithm, or failure choices could invalidate significant dependent work. Reuse applicable design decisions already supplied; distinguish required constraints, suggested mechanisms, and local freedom. A reference to a design is not enough when its relevant content is unavailable. Resolve the consequential unknown, not every future coding detail.

Use [Action Selection](../action-selection/SKILL.md) when choosing the next source, observer, or effect is uncertain, broad, or repetitive. Stop gathering when the current unit is sufficiently supported. A mechanical read of a known caller or signature can remain inside execution; discovering an invalidated mechanism requires re-entry before dependent edits.

When specialized guidance is needed, read [Domain Skill Composition](../workflow/references/domain-skill-composition.md). Before writing or changing code, read [Code Practices](references/code-practices.md). Before designing or materially changing a behavior check, read [Test Design](../verify-work/references/test-design.md); choose its oracle from accepted behavior rather than the implementation.

## Keep The Unit Coherent

A bounded action produces one useful execution or learning result with a checkable claim. It may contain several files, tools, edits, and checks. Do not fragment it by command, file, test, or method change.

Choose work that can be understood, executed, checked, and corrected with a manageable working set. Split when dependencies, uncertainty, or distinct outcomes make one attempt unreliable; retain enough understanding of later constraints to avoid an obvious dead end.

When a Working Record exists, use [Track Work](../track-work/SKILL.md) for recovery and write-ahead Current Slice state before Slice execution. Preserve useful provisional remaining work and dependencies through its existing fields. Do not create memory for a short direct result merely because execution began.

Read [Execute Work Edges](references/execute-work-edges.md) when resuming uncertain prior work, changing a Slice boundary, reaching a selected checkpoint, or exposing separately controlled follow-on work.

## Execute Through One Suitable Method

Implement the supported approach directly when the outcome and mechanism are understood. Unfamiliar work may need preparation first; it does not automatically require a separate prototype or a test-first implementation sequence.

Use one primary method at a time:

- direct implementation for a supported change;
- [Simplify Code](../simplify-code/SKILL.md) when behavior-preserving complexity reduction is the accepted outcome;
- specialized domain guidance when the environment or risk needs it;
- a bounded learning action when an empirical uncertainty must be resolved before production work.

Preserve accepted behavior, failure semantics, repository conventions, and source truth. Do not rewrite tests, Specs, Plans, policies, or acceptance merely to make implementation pass.

Allow local choices of helpers, editing order, and focused checks while the agreed result and effects remain unchanged. Handle edge cases required by accepted behavior, direct evidence, or material safety; return undefined consequential behavior rather than encode a guess.

For an unfamiliar design boundary that could invalidate later work, establish its first coherent implementation and distinguishing observation before dependent expansion. Compare the actual ownership, identity, ordering, and failure behavior with the selected design—not merely its proposed filenames. Preserve accepted predicates when a sketch proves wrong; stop dependent effects and resolve the affected mechanism through the current owner. Supported local improvements need no automatic handback or separate review.

## Execute A Bounded Learning Action

Consume the declared question, observer, permitted effects, expected evidence, and return condition. If they are insufficient for safe execution, establish the missing basis through the requesting owner before acting. Do not assume Discuss was previously used or repeat framing that is already adequate.

Build and run only what the observation needs. Correct an understood local observer defect within scope. Before adding scaffolding or a dependency, check whether it serves the current observation or implements a future product. Return before materially expanding effects or pursuing a different question.

Stop when the question is answered or the observing limit is reached. Report support, contradiction, inconclusive evidence, or unavailable evidence honestly; do not keep polishing the prototype to manufacture a favorable result.

Return evidence, limits, exploratory artifacts, and residual effects to the owner that asked the question, following the agreed artifact disposition. Do not silently promote exploratory code into production, invent acceptance, or claim unobserved integration. The receiving owner assesses what the finding changes and which next action is supported and authorized.

## Re-enter When The Basis Changes

Do not continue merely because implementation has begun.

- Clear local defect and supported remedy -> correct within the same action.
- Required outcome clear but mechanism invalidated -> stop dependent edits and re-establish the approach.
- Failure cause unclear or correction repeats -> Diagnose Failure before another patch.
- Expected behavior or acceptance unsettled -> Discuss or Decision Gate.
- New requirement, scope, compatibility, persistence, evidence, or user-facing return boundary -> Workflow before adopting it.

Before pursuing a prerequisite, distinguish what the accepted outcome requires from what the current approach happens to need. Choose the smallest supported remedy preserving acceptance. A failed approach does not prove that a host change or stronger guarantee is necessary.

When corrections keep adding caller coordination, public states, flags, retries, test-only seams, or recovery rules, stop the patch stream. Diagnose the cause; use [Design for Depth](../design-for-depth/SKILL.md) when direct evidence establishes structural pressure. Do not use that lens to broaden ordinary local work.

Preserve unaffected changes and contradictory evidence. An optional improvement is not unfinished work.

## Verify And Self-Review The Result

Check at the boundary where a result will be accepted or used—not after every edit or command.

1. Run the covered focused checks through the actual behavior or artifact boundary.
2. Use [Verify Work](../verify-work/SKILL.md) to classify what the observations support and what remains unverified.
3. Once evidence initially supports the result, use [Review Work](../review-work/SKILL.md) for silent self-review of concrete work. Guiding artifacts use their owning artifact-review route.
4. Correct a supported local defect within authority, then rerun affected evidence and affected review lenses once.
5. Route unresolved or repeated failure rather than iterating blindly. Distinguish a code defect from an invalid observer, stale evidence, or a misunderstood assignment before selecting another correction.

A green check proves only its exercised assertions; a source read does not prove runtime behavior. Tests may be written before or after implementation as appropriate, without a formal test-first loop or invented earlier failure. Review judges suitability without replacing evidence. Evidence gaps in required behavior remain visible; optional stronger claims may be qualified instead of becoming extra work.

Independent review is separately selected. A self-review finding does not require a reviewer, and a reviewer suggestion does not authorize another change.

## Continue Or Return

Continue within the Slice while the next action serves the same outcome, remains covered, and can still be checked coherently. A method change, correction, or verification run does not create or close a Slice.

When durable memory exists, preserve only material changes to understanding, dependencies, scope, evidence, blockers, and the next useful action. Before context loss, record truthful partial state rather than rushing to completion. Resume only after required reconstruction and relevant live-state reconciliation.

Return to Workflow when a distinct Slice is ready, a selected checkpoint is due, the agreement changes, or no useful covered continuation remains. Workflow can select another already-authorized Slice without asking the user again. Internal method returns and delegation handbacks are not the user-facing endpoint.

Stop at the agreed return condition or an uncovered consequential boundary. Do not add cleanup, documentation, migration, deprecation, commit, push, integration, release, or launch merely because it would be useful.

Construct the report from inspected resulting files, assertions, and outputs—not requested changes phrased as accomplishments. Distinguish implemented, checked, and still unsupported properties. Account for relevant edits after the checks; do not pair a fresh pass with superseded code or test captures. Reuse applicable evidence and report missing bodies or cases explicitly. A completed action is not automatically a completed Slice, task, or delivery.
