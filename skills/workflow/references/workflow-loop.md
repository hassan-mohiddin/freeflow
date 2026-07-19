# Workflow Loop

Read this when the complete lifecycle, named skill edges, or possible exits are unclear. [Workflow](../SKILL.md) owns routing; each linked skill owns its method.

The **Interaction Lifecycle** is directed and contains the **Feedback Loop**.

## Interaction Lifecycle

```text
[1. ENTRY] -- owning activity needed --> [2. FEEDBACK LOOP] -- supported exit --> [3. SUPPORTED EXIT]
    |                                      ^        |                                   |
    |                                      |________| feedback                          |
    +---------------- direct supported exit ------------------------------------------->|
    ^                                                                                    |
    +---------------- later user turn or new evidence -----------------------------------+

1. ENTRY
   User turn or new evidence
   -> Interaction Contract
   -> effective mode context
   -> Workflow chooses the first owner

2. FEEDBACK LOOP
   Workflow
   -> Discuss with Design for Depth when design-bearing / Decision Gate / Bypass
   -> Track Work before Workflow routes concrete work to Execute Work, and whenever durable task memory may be needed
      -> no record needed or authorized slice selected
         -> Execute Work only for requested or approved concrete changes when effective mode permits mutation
            -> TDD / Simplify Code / Design for Depth when useful
            -> Diagnose Failure when cause is unsupported
            -> Verify Work
            -> Review Work for self-review
      -> record recommendation, record-only approval, or blocked mode
         -> wait
   -> Write Spec -> Review Artifact -> Workflow
   -> Write Plan -> Review Artifact -> Workflow
   -> selected independent Review Work or Review Artifact
   -> Workflow routes from the result
   -> continue / correct / gather evidence / revise / re-enter

3. SUPPORTED EXIT OR CONTROLLED BOUNDARY
   answer | wait | pause | handoff | defer | stop | complete

   Commit Work, Finish Branch, Migration Work, Release Work, or Launch Work
   may return evidence to the Feedback Loop or establish the selected exit.
```

Entry may bypass the Feedback Loop for a supported direct response. Otherwise the middle node recurs whenever evidence requires another owner. Re-entry preserves valid work and state; a later turn or new evidence begins the Interaction Lifecycle again.

## Edge Rules

- The [Interaction Contract](../../../runtime/interaction-contract.md) distinguishes questions, discussion, and action authority. Effective mode constrains mutation; [Mode Contract](../../mode-contract/SKILL.md) explains mode state and change boundaries.
- [Track Work](../../track-work/SKILL.md) may surround any part of the Feedback Loop. Working Record review is optional and explicitly selected. [Write Spec](../../write-spec/SKILL.md) and [Write Plan](../../write-plan/SKILL.md) produce separate artifacts with separate [Review Artifact](../../review-artifact/SKILL.md) boundaries.
- [Execute Work](../../execute-work/SKILL.md) owns bounded changes. [TDD](../../tdd/SKILL.md), [Simplify Code](../../simplify-code/SKILL.md), [Diagnose Failure](../../diagnose-failure/SKILL.md), and [Design for Depth](../../design-for-depth/SKILL.md) compose when their conditions apply. [Verify Work](../../verify-work/SKILL.md), [Review Work](../../review-work/SKILL.md), and Review Artifact may enhance self-checks or run separately selected independent review; reading them creates no independence.
- [Commit Work](../../commit-work/SKILL.md), [Handoff](../../handoff/SKILL.md), [Finish Branch](../../finish-branch/SKILL.md), [Migration Work](../../migration-work/SKILL.md), [Release Work](../../release-work/SKILL.md), and [Launch Work](../../launch-work/SKILL.md) are separately authorized boundaries. None authorizes the next stage automatically.

## Feedback And Re-entry

A supported execution path is Execute Work → observe → Verify Work → self-Review Work → Workflow. Failed or inconclusive evidence may support local correction or Diagnose Failure. New options route to Discuss, owner choices or source conflicts to Decision Gate, and changed contracts or strategy to the owning Spec or Plan.

Independent review ends with Pass, Non-blocking, Inconclusive, or Blocking. The active agent adjudicates. Corrections leave review and return to the owning implementation or artifact skill; they may remain in one Track Work slice while its result stays coherent. Review findings do not authorize edits, and review budgets do not authorize another dispatch.

Before an expected context boundary, reconcile changed Working Record state. After compaction, summarization, resume, clear, or session navigation, read the complete record before continuing its task and compare it with the current conversation and live state. Another conversation branch may have written memory, not authority.

Completion requires fresh evidence, supported self-review, resolved selected reviews, accurate task memory, synchronized required artifacts, and no hidden user-owned decision or source conflict.
