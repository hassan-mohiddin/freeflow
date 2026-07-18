---
name: mode-contract
description: Use when choosing, changing, or explaining how Freeflow mode applies to current work.
---

# Mode Contract

Apply the effective Freeflow mode without inferring a different mode from the task. Freeflow has exactly three mode values: `conversation`, `workflow`, and `strict-workflow`.

A mode changes how work proceeds; it does not authorize work, resolve a user-owned decision, or override live evidence.

## Establish The Active Mode

A mode is active only when the host reports that Freeflow Skills are effective. Keep the supplied layers distinct:

- **Repository default:** the shared `defaultMode` from `.freeflow/config.json`.
- **Personal default override:** an optional per-checkout `defaultMode` from `.freeflow/local.json`.
- **Session override:** an optional temporary mode managed by the host.
- **Resolved mode:** session override, otherwise personal default override, otherwise repository or built-in default.
- **Effective mode:** the resolved mode only while Skills are active; otherwise no Freeflow mode is effective.

If runtime reports that modes are inactive, preserve the resolved mode as dormant state without applying it. If effective-mode evidence is missing, do not guess or activate a fallback. Read [Setup Freeflow](../setup-freeflow/SKILL.md) when the user wants to configure, enable, or repair Freeflow.

Task shape does not change mode. A question during Workflow stays in Workflow; an implementation request during Conversation stays in Conversation until the user changes mode.

## Follow The Effective Mode

### Conversation

Answer, discuss, critique, explore, and perform requested read-only inspection.

Do not mutate files, repository state, external systems, or durable artifacts. If the user requests mutation, explain the boundary and ask them to switch to `workflow` or `strict-workflow` through the host's mode control before proceeding.

Ask only what the answer needs. Conversation mode does not require workflow artifacts, checkpoints, plans, specs, or independent review.

### Workflow

Use the adaptive [Workflow](../workflow/SKILL.md) for consequential or mutating work. Inspect or ask when ambiguity changes the next action, create durable artifacts only when they preserve needed state or decisions, and verify claims against fresh evidence.

Workflow mode does not itself authorize a slice or require every lifecycle phase.

### Strict Workflow

Use the same adaptive Workflow with stronger decision, evidence, and checkpoint pressure at high-risk or hard-to-reverse boundaries.

Apply that pressure when work materially affects security, privacy, billing, data loss, migrations, public interfaces, compatibility, deployment, or architecture. Use [Decision Gate](../decision-gate/SKILL.md) for choices or source conflicts that belong to the user in every mutating mode. Gather evidence for the relevant risk surface before crossing the boundary or claiming success.

Select artifacts, checkpoints, verification, and independent review when they reduce material risk. Do not add them automatically merely because Strict Workflow is active.

Strict Workflow does not grant authority, bypass safety, or turn every implementation detail into a user decision.

## Change Mode Deliberately

The user owns mode changes. Recommend `strict-workflow` when risk warrants it, but continue under the effective mode unless the user changes it or another workflow boundary blocks progress.

A task type, risk classification, direct skill call, or workflow route does not switch mode. Invoking an execution skill during Conversation still does not authorize mutation.

Use host-native mode control when available. In Pi:

```text
/freeflow mode
/freeflow mode conversation
/freeflow mode workflow
/freeflow mode strict-workflow
/freeflow mode reset
```

Pi handles these commands before the model runs. The three setting commands create a session override; `reset` clears it and returns to the configured default, including a personal override when present. `/freeflow mode` inspects or selects mode according to host UI support.

For a natural-language request to change Pi session mode, direct the user to the native command. Do not claim runtime state changed until the host reports the new effective mode.

Mention mode only when the user asks, configuration is being discussed, or it changes the next action.

## Change Defaults Separately

A persistent default change is not a session-mode change. An unqualified personal default request targets `.freeflow/local.json`; changing the shared repository default requires explicit repository, team, or shared-default wording.

In Pi, use `/freeflow settings` for personal overrides and `/freeflow settings repo` for shared defaults. In another host, use its native settings when available or update only the explicitly selected valid layer while preserving unrelated settings.

For agent-performed config edits, obey the effective mode when one exists. Conversation remains read-only. When no mode is effective because Freeflow is unconfigured, inactive, blocked by invalid config, or Skills are dormant, an explicit configuration or [Setup Freeflow](../setup-freeflow/SKILL.md) request governs the selected change; any dormant resolved mode is neither authority nor prohibition. User-operated host controls change their own state before the model continues.

A current session override remains effective until reset even when a configured default changes. If repository config is missing or invalid, route to Setup Freeflow; a personal override cannot activate Freeflow. If local config is invalid, report the blocking layer and repair or remove it only with authorization. Do not silently overwrite either source. Use Decision Gate when the requested default conflicts with established source truth or accepted direction.
