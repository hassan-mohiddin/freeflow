# Activation Contract

Freeflow uses layered checkout configuration. Shared repository activation, personal overrides, and runtime delivery are separate facts.

## Repository Activation

`.freeflow/config.json` is the required shared activation boundary. Minimal setup is:

```json
{
  "defaultMode": "workflow"
}
```

Supported defaults are `conversation`, `workflow`, and `strict-workflow`. Missing core keys use built-in defaults:

- `enabled: true`
- `interactionContract: true`
- `skills.enabled: true`
- `defaultMode: workflow`

Repository config may also contain documented Output Router settings. Add optional settings only after an explicit request and preserve valid existing settings during idempotent setup.

Do not add current mode, task state, phase, file inventories, plans, version metadata, activation paths, empty optional sections, host instruction copies, or generated workflow text.

Missing or invalid repository config means repository activation is absent. A valid config with effective `enabled: false` remains configured but inactive.

## Personal Overrides

`.freeflow/local.json` is optional per-checkout state. It cannot activate Freeflow without a valid repository config.

It may override these core values:

```json
{
  "enabled": true,
  "interactionContract": true,
  "skills": {
    "enabled": true
  },
  "defaultMode": "strict-workflow"
}
```

Every field is optional. Omission inherits the repository value, then the built-in default. Local core precedence is property-level, not whole-file replacement.

The local file may also contain documented local-only `processing` config. It must not contain repository-owned Output Router config.

Keep local config untracked and ignored. In a Git checkout, prefer `.git/info/exclude` or an existing ignore rule over an unsolicited shared `.gitignore` edit. Refuse to write personal overrides to a tracked local file.

A missing local file means full inheritance. An invalid existing local file blocks effective Freeflow and must not silently fall back to repository settings. Repair or removal requires authorization.

## Effective Core State

Resolve core values in this order:

```text
host session override -> personal override -> repository value -> built-in default
```

Host session overrides, where supported, may temporarily change Freeflow master enablement, Interaction Contract, Skills, and mode. They are host session state, not config, and cannot bypass missing or invalid repository activation.

Effective Freeflow requires:

1. valid repository config;
2. missing or valid local config;
3. session-resolved `enabled: true`.

The Interaction Contract and Skills are independent resolved switches. When Skills are disabled, the configured mode remains visible as resolved state but no Freeflow mode is effective.

Repository-owned Output Router settings remain independent capability config and take effect only while top-level Freeflow is enabled.

## Mutation Authority By State

Mode constrains agent-performed setup only when a mode is effective:

- **Unconfigured:** missing or invalid repository config means no effective mode. An explicit setup request may create missing minimal activation; replacing invalid config requires specific authorization and source-conflict resolution.
- **Configured but ineffective:** top-level disablement, dormant Skills, or invalid local config leaves no effective mode. An explicit request governs the selected enablement, configuration, or repair; any reported resolved mode remains dormant state only.
- **Effective:** obey the reported mode. Conversation is read-only. Workflow and Strict Workflow allow only separately authorized setup or repair.

A user operating native host settings changes host-managed state directly. That action is distinct from an agent editing `.freeflow/config.json` or `.freeflow/local.json`; verify the resulting source and effective state afterward.

## Runtime Delivery

Configuration does not prove runtime delivery.

When effective, host adapters may deliver:

- `runtime/interaction-contract.md` when the Interaction Contract switch is enabled;
- one full `skills/workflow/SKILL.md` bootstrap when Skills are enabled;
- compact active or dormant mode and capability state;
- explicitly enabled capability context owned by that capability.

The full Mode Contract and other workflow skills remain on demand. Adapters load context only; they do not enforce policy, block tools, grant permissions, or replace repo instructions.

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
