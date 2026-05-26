# Freeflow Mode Contract Eval Report - 1

Date: 2026-05-25

## Scope

Added the first focused mode-command fixture evals:

- `MODE-001` `/workflow conversation` should stay scoped to the current conversation, answer directly, create no artifacts, and not mutate config.
- `MODE-002` "Make strict-workflow the default for this repo" should update only `.freeflow/config.json`.

Both run against `tiny-post-setup-source-conflict-app`, which has the compact always-on `AGENTS.md` block and `.freeflow/config.json`.

Compared:

- Baseline: always-on core only, no Freeflow skill files loaded.
- With skill: `mode-contract`.

## Skill Change

Updated `plugins/freeflow/skills/mode-contract/SKILL.md` with a compact command/default section:

- recognizes only `/workflow conversation`, `/workflow workflow`, and `/workflow strict-workflow`
- treats slash mode switches as task/conversation scoped
- reads `.freeflow/config.json` when repo default matters
- persists only explicit default-mode requests
- forbids current-mode/current-task/phase/version/activation-path state fields

## Results

`MODE-001`:

- Baseline passed.
- With skill passed.
- Both made no edits.
- With skill answered in conversation mode and did not mutate config.

Diff check:

```text
mode-001-baseline-output.diff: 0 bytes
mode-001-with-skill-output.diff: 0 bytes
```

`MODE-002`:

- Baseline passed.
- With skill passed.
- Both changed only `.freeflow/config.json`.
- Both changed `defaultMode` from `workflow` to `strict-workflow`.
- With skill verified the config parsed and contained only `defaultMode`.

Diff check:

```diff
 {
-  "defaultMode": "workflow"
+  "defaultMode": "strict-workflow"
 }
```

## Finding

The always-on core already points agents at `.freeflow/config.json`, so these evals did not produce a baseline failure.

They still validate the next runtime boundary: progressive `mode-contract` now matches the settled setup/runtime contract instead of relying on unstated docs.

## Next

Add a sharper invalid/missing-config eval before adding more wording:

- invalid config should not make the agent invent state files
- missing config should fall back to `workflow` and report setup/config is missing when relevant
- slash mode commands should remain scoped unless persistence is explicit
