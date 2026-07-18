# Discussion Checkpoints

Read this when closing or preserving a compact discussion checkpoint.

A checkpoint records enough shared understanding to continue or choose the next action. It does not mean discussion is permanently complete.

## Keep It In Chat When Possible

Keep the checkpoint in the conversation when the current context can safely continue. Use only the fields that help:

```text
Goal or question:
Current understanding:
Settled:
Tentative:
Open:
Evidence or alternatives that matter:
Approved or proposed checkpoints, if any:
Recommended next action:
```

Do not turn a checkpoint into a transcript, questionnaire, frozen architecture, automatic spec, or complete plan.

## Preserve Selected Checkpoints

When discussion proposes or approves an execution checkpoint, preserve only what later action needs:

```text
Status: Proposed | Approved
Type:
Purpose:
Due boundary:
Conditions:
Approval scope:
```

Do not infer authorization from a recommendation. Keep local commit approval separate from push or integration, and keep migration, deprecation, release, and launch separately controlled.

## Preserve It When Needed

Choose the artifact by the information that must survive:

- **Working Record:** evolving task and checkpoint state, slices, decisions, evidence, history, and next action. Read [Track Work](../../track-work/SKILL.md).
- **Write Spec:** stable accepted content needs a separate durable artifact. Read [Write Spec](../../write-spec/SKILL.md).
- **Write Plan:** a stable ordered strategy and its selected checkpoints need a separate artifact. Read [Write Plan](../../write-plan/SKILL.md).
- **ADR:** a surprising, hard-to-reverse repo-level decision needs durable rationale.
- **Handoff:** one point-in-time continuation state must be transferred to another context or owner.
- **Domain documentation:** stable terminology or domain meaning belongs in an existing glossary or domain source.

Do not create an artifact merely because discussion occurred. Prefer an existing repository convention; ask before inventing a destination whose authority, durability, or ownership matters.

## Re-Entry Checkpoint

When new evidence reopens discussion, preserve only the affected change:

```text
New evidence:
Invalidated assumption:
Still valid:
Decision, slice, or artifact affected:
Question or experiment now needed:
```

Do not restart from zero or rewrite unaffected decisions and work.
