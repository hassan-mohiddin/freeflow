# Freeflow Toggle Implementation Plan

## Decision

Freeflow installed globally in Pi is inactive for a repo until `/setup-freeflow` creates a valid `.freeflow/config.json`.

A repo can then disable the full Freeflow runtime with top-level `enabled: false` without losing nested layer settings.

## Target Behavior

- Missing or invalid `.freeflow/config.json`: expose only setup/status/config entry points; do not inject Freeflow workflow context or expose Freeflow workflow skills.
- `.freeflow/config.json` with no `enabled` field: Freeflow is enabled for backward-compatible setup config.
- `enabled: false`: suppress workflow skills, output-router tools/context/hooks, delegation tools/context/hooks, and observed/native routing. Keep `/freeflow enable` available.
- `skills.enabled: false`: suppress Freeflow workflow skill exposure plus `mode-contract`, `workflow`, `interview-gate`, and discovery-light runtime context.
- `outputRouter.enabled` and `delegationHarness.enabled` remain independent layer toggles, but are effective only when top-level Freeflow is enabled.
- Unified `/freeflow settings` shows the master toggle first and greys out non-master rows while Freeflow is off.

## Implementation Slices

1. Runtime state
   - Add a single Pi extension reader for configured/enabled/effective state.
   - Make top-level `enabled` default to true only when config exists, parses, and matches the supported setup config shape.
   - Add `skills.enabled` default true.
   - Keep output-router normalization as source truth for router config.

2. Dynamic Pi skill exposure
   - Stop statically exposing `skills/` in `package.json`.
   - Add a `resources_discover` handler that exposes Freeflow skills only when config exists, Freeflow is enabled, and skills are enabled.
   - Exclude `output-router` and `delegation-harness` from model skill exposure; those stay runtime capability context only.
   - Expose `setup-freeflow` when setup is missing so users can initialize the repo.

3. Runtime context and hooks
   - Gate base runtime context on `skills.effective`.
   - Gate output-router and delegation context on their effective layer state.
   - Add a disabled sentinel when `enabled: false` so old activation blocks do not keep applying Freeflow behavior.
   - Make observed routing and native safety net no-op when Freeflow or output-router is not effective.

4. Commands and settings
   - Add `/freeflow`, `/freeflow status`, `/freeflow enable`, `/freeflow disable`, and `/freeflow settings`.
   - Keep `/output-router` and `/delegation-harness` as compatibility commands.
   - Make inactive settings rows non-editable, not merely greyed out.
   - Guard `/workflow` and direct Freeflow skill commands when skills are not effective.

5. Setup/docs/evidence
   - Update setup/activation contract wording to say Freeflow applies when enabled by `.freeflow/config.json`.
   - Update plugin docs for inactive-until-setup and layer toggles.
   - Add Pi extension tests for missing setup, master off, skills off, router-only, delegation-only, and settings row inactivity.

## Verification

- `npm run build:pi-extension`
- `node --test $(find pi-extension/tests -name '*.test.js' | sort)`
- `evals/scripts/check-runtime-context-hook.sh`
- `evals/scripts/check-activation-contract.sh` if activation contract/setup wording changes

## Out Of Scope

- Changing Codex/Claude marketplace behavior beyond docs/hook parity.
- A true install-wide package disable inside Freeflow. Pi package install/config owns that.
- Enabling output-router, delegation, observed routing, native safety net, or script transform by default.
