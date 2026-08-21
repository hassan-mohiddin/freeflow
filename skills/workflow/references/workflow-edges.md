# Workflow Edges

Read this after [Workflow](../SKILL.md) when one interaction changes its authority envelope, crosses owners, resumes after context loss, or reaches a selected review or checkpoint. Workflow owns routing; linked skills own their methods.

## Change Authority Deliberately

The current authority envelope remains valid while the requested outcome, permitted effects, evidence boundary, and stop condition remain unchanged.

Use these transition rules:

- Tool choice does not create a new boundary when it is entailed by an already authorized outcome.
- Effects are cumulative. If an action both generates evidence and changes state, apply the mutation or delivery boundary.
- A useful experiment, test, correction, review, or follow-on stage remains uncovered unless the current envelope entails it.
- New evidence may support a different route, but it does not authorize that route's active evidence, mutation, delivery, or separately controlled checkpoint.
- An accepted extension may remain in the current Track Work slice when its result stays coherent, but record it write-ahead when a Working Record exists.
- A distinct outcome, effect class, evidence boundary, stop condition, or authority source requires Workflow to establish the next action before it begins.

When authority is missing, return one bounded proposal:

```text
Purpose:
Action:
Expected evidence or result:
Stop condition:
```

Ask one direct authorization question and wait. Do not dispatch the action or a dependent step from the proposal.

## Re-enter The Narrowest Owner

Route only the responsibility changed by evidence:

- unsettled direction or viable alternatives → [Discuss](../../discuss/SKILL.md);
- one blocking user-owned choice or source conflict → [Decision Gate](../../decision-gate/SKILL.md);
- unsupported or repeated cause → [Diagnose Failure](../../diagnose-failure/SKILL.md);
- changed stable content → [Write Spec](../../write-spec/SKILL.md);
- changed ordered strategy → [Write Plan](../../write-plan/SKILL.md);
- stale or incomplete task memory → [Track Work](../../track-work/SKILL.md);
- supported authorized correction → [Execute Work](../../execute-work/SKILL.md) or the affected artifact owner;
- claim beyond current evidence → [Verify Work](../../verify-work/SKILL.md) when its active check is authorized;
- structural ownership, interface, state, or failure pressure → [Design for Depth](../../design-for-depth/SKILL.md).

Preserve accepted decisions, valid work, evidence, and unaffected artifact layers. Do not restart the task because one owner changed, continue because implementation began, or redesign because an ordinary mistake occurred.

## Continue Or Split A Slice

A Feedback Loop may recur many times inside one coherent Track Work slice. A method change, failed check, review finding, or correction does not create a new slice by itself.

Continue the slice when:

- the intended result remains coherent;
- the authority envelope covers the next action;
- the combined boundary can still be verified as one unit;
- no selected checkpoint or stop condition is due.

Return to Workflow before a distinct result, uncovered effect, independently useful evidence boundary, changed execution strategy, or separately controlled action begins.

## Resume From Durable State

After compaction, summarization, clear, resume, or session navigation:

1. Re-read the owning skill when its body is absent.
2. Retrieve the Working Record's bounded `resume` view when one exists.
3. Reopen only the accepted artifact or source needed for the next decision.
4. Compare memory with the current conversation and live repository state.
5. Re-establish the authority envelope from valid current-session authority; do not import it from another branch, summary, Plan, Handoff, or record.

Before an expected context boundary, reconcile changed Working Record state. Retrieve older history only when the next decision requires it.

## Route Selected Review And Checkpoints

An authorized independent review follows this route:

```text
Review Work or Review Artifact
-> reviewer report
-> Workflow adjudication
   -> Pass -> proceed within existing authority
   -> Non-blocking -> proceed with explicit deferrals
   -> Inconclusive -> gather the missing evidence or decision
   -> Blocking -> stop before the boundary
-> accepted item needs correction or revision
   -> remedy unresolved -> problem checkpoint
   -> remedy supported + authority -> owning skill -> Verify Work
   -> remedy supported + missing authority -> propose and wait
-> focused follow-up only when needed and authorized
```

Reading [Review Work](../../review-work/SKILL.md) or [Review Artifact](../../review-artifact/SKILL.md) creates neither independence nor dispatch authority. Review findings do not authorize correction. A review budget caps dispatches; it does not authorize another one.

[Commit Work](../../commit-work/SKILL.md), [Handoff](../../handoff/SKILL.md), [Finish Branch](../../finish-branch/SKILL.md), [Migration Work](../../migration-work/SKILL.md), [Release Work](../../release-work/SKILL.md), and [Launch Work](../../launch-work/SKILL.md) remain separately controlled. [Bypass](../../bypass/SKILL.md) may reduce optional pressure inside accepted work but cannot widen authority, change mode, erase evidence, or remove a selected checkpoint.

## Reach A Supported Exit

Use Workflow's completion boundary after the final owner returns supported evidence. A later user turn or material new evidence begins another Interaction Lifecycle. Re-establish its envelope from the new turn and any still-valid approval; do not assume continuation or discard valid authority mechanically.
