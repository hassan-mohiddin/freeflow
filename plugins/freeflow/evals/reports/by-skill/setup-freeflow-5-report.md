# Setup Freeflow Eval Report - Iteration 5

Date: 2026-06-20

## Scope

Added optional output-router repo config setup to `setup-freeflow` while preserving the minimal setup contract.

Owned paths:

- `plugins/freeflow/skills/setup-freeflow/SKILL.md`
- `plugins/freeflow/skills/setup-freeflow/references/activation-contract.md`
- `plugins/freeflow/skills/setup-freeflow/references/host-setup.md`
- `plugins/freeflow/skills/setup-freeflow/references/output-router-setup.md`
- `plugins/freeflow/evals/prompts/stp-011.txt`
- `plugins/freeflow/evals/registries/fixture-evals.json`

## Skill Change

`setup-freeflow` now owns optional `outputRouter` config when explicitly requested.

Minimal setup still writes only `defaultMode`. The skill now says:

- do not ask every setup user about router config;
- do not add empty `outputRouter` or dump defaults;
- ask if the user requests router setup without naming config knobs;
- never enable native safety-net routing by default;
- do not create a separate `setup-output-router` skill.

## Eval Added

Added:

- `STP-011`: setup optional output-router config.

Expected behavior:

- set up Codex with exactly one Freeflow block in `AGENTS.md`;
- create `.freeflow/config.json` with `defaultMode: "workflow"` and only explicitly requested `outputRouter` keys;
- set `postToolRouting` to `off`, `largeOutputLines` to `2000`, and `generatedPaths` to `graphify-out/**` and `dist/**`;
- avoid safety-net/strict enablement, hooks, docs, state files, `.codex/rules`, and any `setup-output-router` skill.

## Results

`STP-011` current skill: pass.

Saved output reports:

- `AGENTS.md` received the canonical Freeflow Codex block.
- `.freeflow/config.json` contained `defaultMode: "workflow"` plus only the requested `outputRouter` keys.
- Verification reported JSON parsing, `postToolRouting: "off"`, generated paths, `largeOutputLines: 2000`, one activation block, and no extra setup artifacts.

Observed config from the fixture run:

```json
{
  "defaultMode": "workflow",
  "outputRouter": {
    "postToolRouting": "off",
    "largeOutputLines": 2000,
    "generatedPaths": [
      "graphify-out/**",
      "dist/**"
    ]
  }
}
```

## Evidence

Saved final run:

- `plugins/freeflow/evals/runs/manual/stp-011-with-skill-codex-output.md`

Mechanical grade:

```sh
plugins/freeflow/evals/scripts/grade-fixture-eval.sh STP-011 --output plugins/freeflow/evals/runs/manual/stp-011-with-skill-codex-output.md
# pass: setup-router-required-files pass; setup-router-final-output pass
```

Dry-run setup resolution:

```sh
plugins/freeflow/evals/scripts/run-fixture-eval.sh STP-011 --dry-run
# resolved fixture, prompt, output path, and codex adapter
```

## Review Fixes

Focused review found two blockers after the initial skill/config update:

- `STP-011` was present in `fixture-evals.json` but missing from `skill-evidence.json` under `setup-freeflow`.
- `plugins/freeflow/hooks/freeflow-runtime-context.mjs` still treated config as valid only when `.freeflow/config.json` contained exactly one top-level key, so optional `outputRouter` config made setup look partial.

Fixes:

- Registered `STP-011` under `setup-freeflow` skill evidence.
- Updated the runtime context hook to accept minimal config or `defaultMode` plus object-shaped `outputRouter`.
- Extended `check-runtime-context-hook.sh` to cover optional `outputRouter` config without marking setup partial or invalid.

## Verification

Commands:

```sh
jq empty plugins/freeflow/evals/registries/fixture-evals.json
jq empty plugins/freeflow/evals/registries/skill-evidence.json
plugins/freeflow/evals/scripts/check-activation-contract.sh
plugins/freeflow/evals/scripts/check-runtime-context-hook.sh
plugins/freeflow/evals/scripts/run-fixture-eval.sh STP-011 --dry-run
plugins/freeflow/evals/scripts/run-fixture-eval.sh STP-011 --with-skill
plugins/freeflow/evals/scripts/grade-fixture-eval.sh STP-011 --output plugins/freeflow/evals/runs/manual/stp-011-with-skill-codex-output.md
plugins/freeflow/evals/scripts/skill-evidence.sh setup-freeflow
```
