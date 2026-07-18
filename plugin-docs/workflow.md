# Workflow

Freeflow is a workflow layer, not a new agent. The active agent owns understanding, routing, authorized work, verification, correction, adjudication, and completion.

## Modes

- `conversation`: read-only discussion, critique, explanation, and exploration. Agent-performed mutation requires switching mode first.
- `workflow`: the default for consequential or mutating work. Use the adaptive lifecycle and scale pressure to risk.
- `strict-workflow`: the same lifecycle with stronger decision, evidence, and checkpoint pressure at high-risk or hard-to-reverse boundaries.

Mode changes do not authorize work or resolve decisions. Task type and direct skill calls do not switch mode.

## Activation And Configuration

Freeflow requires a valid shared `.freeflow/config.json`. Optional `.freeflow/local.json` supplies per-checkout personal core overrides and cannot activate Freeflow by itself. A Pi session mode override sits above configured defaults temporarily.

```text
session mode
-> personal default override
-> repository default
-> built-in default
```

A configured mode is dormant while Skills are ineffective. An invalid existing local config fails closed instead of silently inheriting shared settings.

Pi `/freeflow settings` edits personal overrides; `/freeflow settings repo` edits shared configuration. `/freeflow mode` manages only the temporary session override.

## Interaction Lifecycle

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

Entry is a user turn or new evidence interpreted through the Interaction Contract and effective mode. It may lead directly to an answer, wait, deferment, or stop. When work is needed, Workflow chooses the narrowest owning skill.

The Feedback Loop is:

```text
orient to accepted intent, task memory, and live evidence
-> act, discuss, test, or observe through the owning skill
-> verify what direct evidence proves
-> when supported, self-review once
-> continue, correct, diagnose, revise, ask, defer, or stop
```

A later turn or new evidence begins another Interaction Lifecycle. Re-enter only the owning activity whose responsibility changed; preserve valid work and decisions.

## Conditional Artifacts

Artifacts have distinct jobs:

- **Working Record:** living task context, one current slice, proposed work, decisions, evidence pointers, history, and next action.
- **Spec:** stable accepted content, behavior, boundaries, and uncertainty.
- **Plan:** stable ordered execution strategy when dependencies, mechanism, and checks can be stated without guessing.
- **Handoff:** point-in-time continuation context for a pause or transfer.

They are conditional memory, not proof or authority over contradictory live evidence. Specs and Plans each receive a separate independent Review Artifact after author self-review. Working Records do not require independent review by default.

## Review And Verification

Verification is factual work owned by the active agent. Verify Work may deepen the method; reading it does not dispatch or create another role.

Self-review is silent and follows only supported verification. Review Work and Review Artifact may deepen self-review or guide a separately selected independent reviewer. Reading either skill does not create independence.

Independent review ends with one valid exit:

- **Pass:** proceed.
- **Non-blocking:** proceed with explicit deferrals.
- **Inconclusive:** gather the missing evidence or decision.
- **Blocking:** do not cross the boundary; re-enter the narrowest owner, defer, or stop.

Review findings are evidence, not commands. If correction authority is not already explicit, ask once for accepted corrections plus any warranted focused follow-up review, or corrections alone. Review budgets cap dispatches; they do not authorize another review.

Corrections leave review and return to Execute Work or the artifact owner. They may remain in the same coherent Working Record slice. Before expanded work starts, decide and record whether it extends that slice or needs a distinct result, authority, or evidence boundary.

## Task Continuity

When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, read its complete Working Record before continuing task work. Compare it with the current conversation and live state. Another conversation branch may have written memory, not authority.

Routine in-slice feedback is not checkpoint history. Record state changes, accepted boundary extensions, decisions, blockers, evidence, and selected checkpoint results—not every edit or comment.

## Checkpoints And Closeout

Independent review, a local commit, a user decision, and continuity transfer are additional checkpoints only when selected. A slice ending alone does not require one.

Commit, branch integration, migration, release, launch, and destructive cleanup remain separately controlled. Bypass may reduce optional pressure inside an accepted action, but it cannot change mode, create authority, erase evidence, remove selected review, or weaken a completion claim.

A Supported Exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete. Completion requires fresh verification, one supported self-review, resolved selected reviews, accurate task memory, synchronized required docs, and no hidden owner decision or source conflict.

See [Skill routing](skill-routing.md) for the shipped methods, ownership, routes, and references.
