# ADR 0011: Single Adaptive Workflow

## Status

Accepted. Amended 2026-10-05 (selectable runtime prompts) and 2026-10-22 (prompts and skills on every host, in every scope). Its Workflow parts are superseded by [ADR 0014: Capability Skills And A Compact Core](0014-capability-skills-and-a-compact-core.md) (2026-10-22); see the amendment below.

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

## Amendment (2026-10-05): selectable runtime prompts on other hosts

On hosts other than Pi, a `prompts` setting in `.freeflow/config.json` or `.freeflow/local.json` turns each runtime prompt on or off: `core`, `interactionContract` and `workingMethod`, each on by default, the personal file overriding the shared one prompt by prompt. The Interaction Contract is therefore mandatory only on Pi, which always delivers every runtime prompt and ignores the setting. The former top-level `interactionContract` key stays unsupported and still invalidates configuration.

Hosts and the models they run differ in how much of this guidance they need, so the user chooses, with one default for every host.

## Amendment (2026-10-22): runtime prompts and skills on every host

The `prompts` setting now applies on Pi too, and a `skills` setting turns each skill but Setup Freeflow off; both have rows in `/freeflow settings` in the Session, Personal and Repository scopes. The Interaction Contract is no longer mandatory on Pi: turned off, it is left out of the system section and Freeflow stays active, while a missing prompt file still makes Freeflow unavailable. On Pi an off skill is not loaded and its command refuses; hosts that load plugin skills themselves get a `Skills off:` line in the Runtime State. The former top-level `interactionContract` key, and the single `skills: { "enabled": false }` switch removed in 0.7.0, stay unsupported. The user asked for these switches; their effect on behavior has not been evaluated.

## Amendment (2026-10-22): no Workflow skill

[ADR 0014](0014-capability-skills-and-a-compact-core.md) removes the Workflow skill. The second and fourth Decision bullets no longer hold as written: no skill chooses the owner; each skill's description says when it applies, and `runtime/prompts/core.md` carries the cycle (agree before building, build and verify, review and hand over), what authorizes work and where to stop, not Workflow or Action Selection cues. "One adaptive Workflow" now means that one cycle, scaled to the work. The rest of this decision stands: no user-selectable process modes, stronger pressure for high-risk work through the same cycle, the Interaction Contract as its own fragment, `enabled` as the only core switch, and the removed mode keys invalidating configuration.
