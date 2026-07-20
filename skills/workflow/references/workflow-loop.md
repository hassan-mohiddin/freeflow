# Workflow Loop

Read this when the complete lifecycle, named skill edges, re-entry route, or possible exits are unclear. [Workflow](../SKILL.md) owns routing; each linked skill owns its method.

The **Interaction Lifecycle** contains the recurring **Feedback Loop**.

## Complete Lifecycle

```text
[1. ENTRY] -- work needed --> [2. FEEDBACK LOOP] -- supported --> [3. EXIT]
    |                              ^       |                         |
    +--------- direct exit --------+       +------ feedback --------+
    ^                                                               |
    +---------------- later user turn or evidence -------------------+
```

### 1. Entry

A user turn or new evidence is interpreted through the Interaction Contract and effective mode. Workflow may:

- answer, wait, defer, or stop directly;
- use Discuss or Decision Gate when direction is unsettled;
- choose the narrowest owner when work is needed.

Questions, criticism, examples, hypotheses, and recommendations are not action authority unless the whole turn clearly requests or approves the bounded action.

### 2. Feedback Loop

```text
Workflow chooses one owner
-> understand, decide, preserve, execute, or inspect
-> verify the resulting claim
-> self-review once when supported
-> route from evidence
   -> continue or correct locally
   -> diagnose an unsupported or repeated cause
   -> discuss changed direction
   -> revise the owning artifact
   -> gather evidence or a user decision
   -> use an approved checkpoint
   -> exit
```

The loop may recur many times inside one coherent Track Work slice. Re-entry preserves accepted decisions, valid work, evidence, and task state. A new method, finding, or review does not create a new slice by itself.

### 3. Supported Exit

A supported exit may answer, wait, pause, hand off, defer, stop, preserve an approved boundary, or complete the task. A later user turn or new evidence begins the lifecycle again.

## Skill Edges

- [Discuss](../../discuss/SKILL.md) shapes open direction. [Decision Gate](../../decision-gate/SKILL.md) owns one blocking user choice or source conflict. [Bypass](../../bypass/SKILL.md) reduces optional pressure inside accepted work.
- [Track Work](../../track-work/SKILL.md) decides whether continuity needs a Working Record and may surround any part of the loop. [Write Spec](../../write-spec/SKILL.md) and [Write Plan](../../write-plan/SKILL.md) own stable accepted content and ordered strategy; each has a separate [Review Artifact](../../review-artifact/SKILL.md) boundary.
- [Execute Work](../../execute-work/SKILL.md) owns bounded changes. [TDD](../../tdd/SKILL.md), [Simplify Code](../../simplify-code/SKILL.md), [Diagnose Failure](../../diagnose-failure/SKILL.md), and [Design for Depth](../../design-for-depth/SKILL.md) compose only when their conditions apply.
- [Verify Work](../../verify-work/SKILL.md) establishes what evidence proves. [Review Work](../../review-work/SKILL.md) and Review Artifact own self-review and selected independent judgment. Reading either review skill creates no independence.
- [Commit Work](../../commit-work/SKILL.md), [Handoff](../../handoff/SKILL.md), [Finish Branch](../../finish-branch/SKILL.md), [Migration Work](../../migration-work/SKILL.md), [Release Work](../../release-work/SKILL.md), and [Launch Work](../../launch-work/SKILL.md) own separately controlled boundaries. None authorizes the next stage automatically.

Use [domain skill composition](domain-skill-composition.md) when specialized engineering guidance must operate inside one of these routes.

## Authorization Edge

The [Interaction Contract](../../../runtime/interaction-contract.md) distinguishes discussion from authority. [Mode Contract](../../mode-contract/SKILL.md) constrains whether mutation is permitted; mode does not authorize work.

A clear request or approval may authorize one bounded outcome. An accepted Spec or Plan supplies direction unless its approval explicitly authorizes an action or checkpoint. A Working Record preserves authority but does not create it.

When a mutation or separately controlled action is not covered, Workflow recommends the exact action and waits for the user's response. It does not begin the action or a dependent next step. Existing authority covers contained implementation, tests, verification, and reversible local choices; do not ask again unless the boundary changes.

## Evidence And Re-entry

- A supported execution path is Execute Work → observe → Verify Work → silent self-Review Work → Workflow.
- A clear local defect returns to its owner for correction and re-verification.
- Failed or inconclusive evidence with an unsupported cause routes to Diagnose Failure before another patch.
- New options or invalid assumptions route to Discuss.
- A user-owned choice or source conflict routes to Decision Gate.
- Changed accepted content or strategy returns to the owning Spec or Plan.
- A coherent accepted correction may remain in the current Track Work slice; a distinct result, authority, or evidence boundary requires Workflow to establish the next slice.

Preserve valid work and revise only the affected layer. Do not continue because implementation started, redesign because an ordinary mistake occurred, or patch repeatedly when evidence points to one shared cause.

## Review And Checkpoint Edges

Specs and Plans receive separate independent artifact review after author self-review. Independent work review is selected for a plan-selected, explicitly requested, sensitive, hard-to-reverse, architecture-bearing, or strongly interacting boundary—not simply because work ended.

Independent review returns **Pass**, **Non-blocking**, **Inconclusive**, or **Blocking**. The active agent adjudicates every item. Review findings do not authorize edits, and a review budget does not authorize another dispatch. Corrections return to Execute Work or the artifact owner; focused follow-up occurs only when needed and authorized. Review 2 and Review 3 relationship and diagnosis rules live in the review skills.

A useful but unapproved review, correction, commit, or other checkpoint returns to Workflow to recommend and wait. Push, integration, migration, release, and launch remain separately controlled even when earlier work was authorized.

## Context And Completion

Before an expected context boundary, reconcile changed Working Record state. After compaction, summarization, resume, clear, or session navigation, read the complete record before continuing and compare it with the conversation and live state. Another conversation branch may contain memory, not authority.

Completion requires fresh evidence, supported self-review, resolved selected reviews, accurate task memory, synchronized required artifacts, and no hidden user-owned decision or source conflict.
