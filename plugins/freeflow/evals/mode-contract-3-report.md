# Freeflow Mode Contract Eval Report - 3

Date: 2026-05-25

## Scope

Added `MODE-005`: `/workflow strict-workflow` followed by "Use strict-workflow from now on for this repo unless I say otherwise" and a tiny settings-title fix.

The target behavior:

- Treat `/workflow strict-workflow` as scoped to the current task or conversation.
- Do not persist mode from "from now on", "until I say otherwise", or "for this repo" unless the user explicitly asks to change the default.
- Fix only `src/settings-page.ts`.
- Do not edit `.freeflow/config.json`.
- Do not create Freeflow state files.

Compared:

- Baseline: always-on core only, no Freeflow skill files loaded.
- With skill before wording change: `mode-contract`.
- With skill after wording change: `mode-contract`.

## Results

Baseline failed scope.

It fixed `src/settings-page.ts`, but also created a new `tests/settings-page.test.md` artifact for a tiny typo fix:

```text
Only in .../mode-005-baseline/tests: settings-page.test.md
```

Initial with-skill failed persistence.

It correctly fixed `src/settings-page.ts`, but also changed repo default mode:

```diff
-  "defaultMode": "workflow"
+  "defaultMode": "strict-workflow"
```

Final with-skill passed after tightening `mode-contract`.

The final diff only changed the target source file:

```diff
-export const settingsPageTitle = "Setings";
+export const settingsPageTitle = "Settings";
```

No config or state files changed.

## Skill Change

Added one pressure-specific rule to `mode-contract`:

```text
Phrases like "from now on", "until I say otherwise", or "for this repo" still do not persist mode unless paired with an explicit default change request.
```

`mode-contract/SKILL.md` is 71 lines after the change.

## Decision

Keep the wording. It prevents a real measured failure without adding runtime machinery or broad command infrastructure.
