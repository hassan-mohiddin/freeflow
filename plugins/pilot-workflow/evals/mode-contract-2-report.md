# Pilot Workflow Mode Contract Eval Report - 2

Date: 2026-05-25

## Scope

Added config-fallback mode evals:

- `MODE-003` invalid `.pilot-workflow/config.json` value.
- `MODE-004` missing `.pilot-workflow/config.json`.

Both ask for the repo's Pilot default mode and a next step for the settings-title typo, while forbidding edits. The point is mode inference only, not setup.

Compared:

- Baseline: always-on core only, no Pilot skill files loaded.
- With skill: `mode-contract`.

## Fixtures

`tiny-post-setup-invalid-config-app`:

```json
{
  "defaultMode": "turbo-workflow"
}
```

`tiny-post-setup-missing-config-app`:

- keeps the compact `AGENTS.md` Pilot block
- omits `.pilot-workflow/config.json`

## Results

`MODE-003`:

- Baseline failed.
- With skill passed.
- Both made no edits.

Baseline accepted the invalid value as the mode:

```text
Mode: `turbo-workflow`
```

With skill rejected the invalid value and fell back correctly:

```text
The applicable mode is `workflow`.
```

`MODE-004`:

- Baseline partially failed.
- With skill passed.
- Both made no edits.

Baseline noticed the missing config but said no configured Pilot mode applied. It did not name the fallback mode.

With skill reported the missing config and applied the fallback:

```text
Repo default mode applies as `workflow`
```

Diff check:

```text
mode-003-baseline-output.diff: 0 bytes
mode-003-with-skill-output.diff: 0 bytes
mode-004-baseline-output.diff: 0 bytes
mode-004-with-skill-output.diff: 0 bytes
```

## Finding

`mode-contract` now has evidence for a real improvement: it prevents invalid config values from becoming new modes.

The missing-config case is a regression guard, not a strong differentiator. The skill's value is naming the fallback consistently while respecting the user's "do not set up Pilot" instruction.

## Decision

Do not add more wording. The existing command/default section is enough and the skill remains short.

Next useful mode target: explicit slash command scoping under pressure, such as `/workflow strict-workflow` followed by a request that tries to persist mode without saying "default."
