# Pilot Workflow Command Surface Eval Report - 1

Date: 2026-05-25

## Scope

Audited the slash-like command surface after mode setup work.

The question was whether Pilot already has all plugin slash commands and whether they work when users call them.

## Result

Pilot has the documented command surface as model-routed skill calls, not native host slash-command handlers.

Added `plugins/pilot-workflow/command-surface.json` as the canonical command map:

- 3 mode commands route to `mode-contract`
- 13 direct skill calls map to existing skills
- native slash handlers are explicitly `false`

Added `plugins/pilot-workflow/evals/scripts/audit-command-surface.sh` to verify:

- registry JSON parses
- every direct command maps to an existing skill
- every mode command routes to `mode-contract`
- command docs mention every registered command
- plugin manifest does not pretend native slash handlers exist

## Fix

`docs/plugin-contract.md` omitted `/commit-work` even though the skill exists and the inventory listed it. The contract now includes `/commit-work`.

The contract also states that current candidate plugins may route commands through skill activation and model behavior rather than native host slash-command handlers.

## Verification

```text
Command surface audit passed: 13 direct skill calls, 3 mode commands, native slash handlers disabled.
```

## Decision

Do not add native slash-command runtime yet. Current evidence only supports skill/model-routed commands.

Next useful eval: pick one direct command, likely `/execute-plan` or `/commit-work`, and test that the model treats the slash call as permission to enter that segment while still preserving user-owned decision gates.
