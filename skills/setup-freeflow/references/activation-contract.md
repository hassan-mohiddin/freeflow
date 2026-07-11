# Activation Contract

`.freeflow/config.json` is Freeflow's sole repo activation boundary.

## Config

Minimal valid setup:

```json
{
  "defaultMode": "workflow"
}
```

Supported defaults:

- `conversation`
- `workflow`
- `strict-workflow`

A config may also contain documented top-level `enabled`, `skills.enabled`, `outputRouter`, nested `outputRouter.observedRouting`, nested `outputRouter.scriptTransform`, and `delegationHarness` settings. Add them only after the setup capabilities decision point, a `/freeflow` settings change, or an explicit request. Preserve valid existing settings during idempotent setup.

Missing optional sections mean built-in defaults. Output Router and Delegation Harness remain disabled by default. Never enable observed routing, native safety-net routing, Delegation Harness, or script transform without explicit opt-in. Use `output-router-setup.md` for config shape, persistence choices, and proof-gated adapters.

Do not add current mode, task, phase, file inventory, plans, version metadata, activation paths, empty optional sections, docs inventories, state files, handoffs, skill inventories, or empty `CONTEXT.md`.

Missing or invalid config means Freeflow is not active for the repo. `"enabled": false` means installed and configured but disabled.

## Runtime Delivery

Activation and delivery are separate facts:

- **Repo activation:** valid `.freeflow/config.json`.
- **Runtime delivery:** the current host's installed, trusted adapter injects the canonical compact kernel and loads the full Workflow skill once into session context.

Pi uses the extension's `before_agent_start` path, appends the kernel to the existing system prompt, and stores Workflow as a hidden persistent custom message. Codex and Claude use the packaged lifecycle hook. Adapters load `skills/decision-gate/references/runtime-kernel.md` and bootstrap the full `skills/workflow/SKILL.md`; full `mode-contract` and `decision-gate` bodies remain on demand.

Output Router and Delegation Harness remain independent capability sections controlled by config. The compact-kernel change does not alter their skill bodies, tool/runtime ownership, opt-in defaults, or setup policy.

A setup report must say whether runtime delivery is confirmed, unavailable, or unconfirmed. Config alone is not evidence that a Codex or Claude hook executed.

## Repo-Owned Instructions

Do not create replacement Freeflow text in:

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/rules/freeflow-core.md`

Existing repo-owned instructions remain authoritative within normal host precedence. Inspect them for conflicts; do not overwrite them to make Freeflow appear active.

## Invariants

Setup must be:

- idempotent;
- additive only where config must be created;
- non-mutating toward user-owned host instructions;
- free of generated replacement kernels;
- explicit about runtime-hook evidence;
- compatible with same-session kernel, Workflow, and conditional enabled-capability loading without claiming lifecycle injection already occurred.
