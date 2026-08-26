# ADR 0011: Single Adaptive Workflow

## Status

Accepted.

## Decision

Freeflow has one adaptive Workflow and no user-selectable process modes.

- The Interaction Contract interprets the whole user turn and distinguishes discussion, tentative direction, and authorization.
- Workflow chooses the narrowest owner and scales pressure to consequence, uncertainty, interaction, and reversibility.
- High-risk or hard-to-reverse work receives stronger decisions, evidence, verification, and checkpoints through the same Workflow.
- `runtime/prompts/core.md` contains stable shared guidance, loops, Workflow, Action Selection, and Supported Exit cues.
- `runtime/prompts/interaction-contract.md` remains a separate mandatory prompt fragment so its behavior can be changed independently.
- `enabled` is the only Freeflow core switch. Base skills are available whenever Freeflow is enabled; optional capabilities retain independent gates.
- The former `defaultMode`, `interactionContract`, and `skills` configuration keys are unsupported and invalidate configuration.

## Rationale

The previous values duplicated behavior already owned by the Interaction Contract and Workflow while adding persistent state, configuration, host controls, and token-bearing runtime context. Risk-sensitive pressure is a property of the current work, not a global user-selected process.

Keeping the Interaction Contract as a separate mandatory fragment preserves a clean editing seam: its turn-interpretation behavior can change without changing the rest of the core guidance.

## Consequences

- Mode settings, commands, session persistence, and the Mode Contract skill are removed from the active package.
- Existing mode configuration is a breaking invalidation rather than a compatibility path.
- Current docs and release notes describe the change; released evidence and historical archives remain immutable.
- Host permission and model-compute controls remain separate from Freeflow Workflow policy.
