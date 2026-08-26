# Activation Contract

Freeflow uses layered checkout configuration. Shared repository activation, personal overrides, and runtime delivery are separate facts.

## Repository Activation

`.freeflow/config.json` is the required shared activation boundary. Minimal setup is:

```json
{}
```

Missing core keys use built-in defaults:

- `enabled: true`
- `contextVirtualization: false`
- `conversationHistory: false`

Optional capability configuration is explicit and remains independently gated. The legacy `defaultMode`, `interactionContract`, and `skills` keys are unsupported and make the configuration invalid.

Do not add task state, phase, file inventories, plans, version metadata, activation paths, empty optional sections, host instruction copies, or generated workflow text.

Missing or invalid repository config means repository activation is absent. A valid config with effective `enabled: false` remains configured but inactive.

## Personal Overrides

`.freeflow/local.json` is optional per-checkout state. It cannot activate Freeflow without a valid repository config.

It may override these core values:

```json
{
  "enabled": false,
  "contextVirtualization": true,
  "conversationHistory": true
}
```

Every field is optional. Omission inherits the repository value, then the built-in default. Local core precedence is property-level, not whole-file replacement.

Keep local config untracked and ignored. In a Git checkout, prefer `.git/info/exclude` or an existing ignore rule over an unsolicited shared `.gitignore` edit. Refuse to write personal overrides to a tracked local file.

A missing local file means full inheritance. An invalid existing local file blocks effective Freeflow and must not silently fall back to repository settings. Repair or removal requires authorization.

## Effective Core State

Resolve remaining configurable values in this order:

```text
host session override -> personal override -> repository value -> built-in default
```

Host session overrides are host state, not config, and cannot bypass missing or invalid repository activation. Pi may temporarily override Freeflow enablement and the remaining optional context capabilities. Cognitive Routing has its own host-managed session control.

Effective Freeflow requires:

1. valid repository config;
2. missing or valid local config;
3. session-resolved `enabled: true`;
4. the mandatory `core.md` and `interaction-contract.md` prompt files.

The core prompt and Interaction Contract are always delivered together when Freeflow is enabled. Base Freeflow skills are exposed with that core surface. Context Virtualization, Conversation History, and Cognitive Routing remain independently gated capabilities.

## Mutation Authority By State

- **Unconfigured:** missing or invalid repository config means Freeflow is not effective. An explicit setup request may create missing minimal activation; replacing invalid config requires specific authorization and source-conflict resolution.
- **Configured but ineffective:** top-level disablement or invalid local config prevents effective Freeflow. An explicit request governs the selected enablement, configuration, or repair.
- **Effective:** obey the Interaction Contract and core Workflow guidance. Optional capability behavior remains subject to its own effective state.

A user operating native host settings changes host-managed state directly. That action is distinct from an agent editing `.freeflow/config.json` or `.freeflow/local.json`; verify the resulting source and effective state afterward.

## Runtime Delivery

Configuration does not prove runtime delivery.

When effective, host adapters deliver:

- `runtime/prompts/core.md`;
- `runtime/prompts/interaction-contract.md`;
- the base Freeflow skill surface;
- compact current capability state.

Pi may additionally expose explicitly enabled Pi capability skills and tools. Codex and Claude `SessionStart` hooks compose the mandatory core fragments. Adapters load context only; they do not enforce policy, block tools, grant permissions, or replace repo instructions.

A setup report classifies automatic delivery as:

- **confirmed:** trustworthy evidence shows the current host adapter ran;
- **unavailable:** the adapter is absent, disabled, denied, untrusted, or unsupported;
- **unconfirmed:** the host exposes no trustworthy execution evidence.

For the setup turn itself, direct reads of newly effective context establish guidance only for that turn. Report those reads separately from lifecycle delivery.

## Repo-Owned Instructions

Do not create replacement Freeflow text in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, or another repository instruction surface.

Existing repo instructions remain live source truth within host precedence. Inspect conflicts and use Decision Gate rather than overwriting them to make Freeflow appear active.

## Setup Invariants

Setup is:

- idempotent;
- minimal by default;
- explicit about shared versus personal state;
- fail-closed for an invalid personal layer;
- non-mutating toward repo-owned host instructions;
- explicit about same-turn reads versus automatic runtime delivery;
- free of generated replacement instructions and unrequested capability config.
