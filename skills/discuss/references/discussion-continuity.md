# Discussion Continuity

Read this when preserving a compact discussion state or re-entry summary, or when carrying a selected checkpoint from discussion.

A **discussion state summary** records enough shared understanding to continue or choose the next action. It is not a Checkpoint unless Workflow deliberately selects a boundary that dependent work must not cross unresolved.

## Keep It In Chat When Possible

Keep the summary in conversation when the current context can safely continue. Use only fields that help:

```text
Goal or question:
Current understanding:
Settled:
Tentative:
Open:
Evidence or alternatives that matter:
Selected checkpoints, if any:
Recommended or accepted next action:
Authority source or approval needed:
```

Do not turn a summary into a transcript, questionnaire, frozen architecture, automatic Spec, Plan, Working Record, or checkpoint.

## Preserve Selected Checkpoints Separately

When discussion proposes a possible checkpoint, record it as proposed rather than selected. Workflow selects it only when its additional boundary materially protects dependent work and its authority is covered.

For a selected checkpoint preserve only what later action needs:

```text
Status: Selected
Type:
Purpose:
Due boundary:
Condition:
Selection source:
Authority scope:
```

Do not infer authorization from a recommendation. Keep local commit authority separate from push or integration, and keep migration, deprecation, release, and launch separately controlled.

When durable task memory is needed, [Track Work](../../track-work/SKILL.md) owns the pending checkpoint and terminal result. The discussion summary remains conversational state rather than duplicate checkpoint history.

## Preserve A Durable Artifact Only When Needed

Choose the artifact by the information that must survive:

- **Working Record:** evolving task state, selected checkpoints, Slices, Decisions, evidence, History, and next action. Read [Track Work](../../track-work/SKILL.md).
- **Spec:** stable accepted content needs a durable source. Read [Write Spec](../../write-spec/SKILL.md).
- **Plan:** a stable ordered strategy and its selected checkpoints need an execution artifact. Read [Write Plan](../../write-plan/SKILL.md).
- **ADR:** a surprising, hard-to-reverse repository decision needs durable rationale.
- **Handoff:** one point-in-time continuation package must transfer to another context or owner.
- **Domain documentation:** stable terminology or domain meaning belongs in an existing glossary or domain source.

Do not create an artifact merely because discussion occurred. Prefer an existing repository convention; ask before inventing a destination whose authority, durability, or ownership matters.

## Preserve Re-Entry State

When new evidence reopens discussion, preserve only the affected change:

```text
New evidence:
Invalidated assumption:
Still valid:
Decision, Slice, or artifact affected:
Question or learning action now needed:
Authority or user decision needed:
```

Do not restart from zero or rewrite unaffected decisions, evidence, artifacts, or work.
