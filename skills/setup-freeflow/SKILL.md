---
name: setup-freeflow
description: Use when activating Freeflow in a repository, repairing its repository or personal configuration, or checking whether the current host is delivering Freeflow context.
---

# Setup Freeflow

Create or repair the smallest valid layered setup. Keep repository activation, personal overrides, and host runtime delivery as separate facts.

- `.freeflow/config.json` is the required shared repository activation config.
- `.freeflow/local.json` is an optional per-checkout personal override. It cannot activate Freeflow by itself.
- Runtime delivery depends on the current host's installed and trusted adapter.

Answer setup questions and delivery checks read-only. An explicit action request authorizes the smallest selected setup change under the state rules below. When repository config is missing, first activation authorizes minimal shared config; it does not authorize personal overrides, optional capabilities, replacement of invalid config, or edits to repo-owned host instructions.

Read [the activation contract](references/activation-contract.md) before changing setup state. Read [host setup](references/host-setup.md) when runtime delivery, lifecycle, or host trust matters. Read [Output Router setup](references/output-router-setup.md) only when the user explicitly requests it during setup or repair; later tuning belongs to [Output Router](../output-router/SKILL.md).

## Establish Mutation Authority

Classify the current state before editing:

- **Unconfigured:** repository config is missing or invalid, so no Freeflow mode is effective. An explicit setup request may create minimal config when it is missing. Replacing or reinterpreting invalid config still requires the specific authority described below.
- **Configured but ineffective:** valid repository activation exists, but Freeflow is disabled, Skills are dormant, or invalid local config blocks runtime. No mode is effective. An explicit request governs the selected enablement, configuration, or repair; any dormant resolved mode does not.
- **Effective:** Freeflow Skills report an effective mode. Obey it. Conversation remains read-only; Workflow or Strict Workflow allows agent-performed mutation only for the separately requested setup or repair.

User-operated host settings are direct user actions, not agent-performed config edits. Prefer them when available and do not claim their state changed until the host reports it.

## Inspect The Layers

Before editing:

1. inspect `.freeflow/config.json` and `.freeflow/local.json` independently;
2. identify which requested values are shared repository state and which are personal overrides;
3. inspect repo instructions only when a conflict would change setup behavior;
4. identify the host and available delivery evidence when runtime status matters.

A valid repository config establishes activation. A missing local config inherits shared values. An invalid existing local config blocks effective Freeflow instead of falling back silently.

If setup is already valid and no change was requested, preserve it and report the effective sources. Do not rewrite config merely to normalize formatting or materialize defaults.

## Configure Shared Activation

For a new default setup, write:

```json
{
  "defaultMode": "workflow"
}
```

During first activation, an explicitly requested `conversation` or `strict-workflow` mode becomes the shared repository default. Preserve valid existing settings and add no unrequested keys or empty sections.

If repository config is invalid or conflicts with accepted source truth, use [Decision Gate](../decision-gate/SKILL.md) before replacing or reinterpreting it.

Do not create or append Freeflow instructions in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, or another host-owned instruction surface.

## Add Personal Overrides Only When Requested

Use `.freeflow/local.json` for an explicitly selected per-checkout override of `enabled`, `interactionContract`, `skills.enabled`, or `defaultMode`. Omitted values inherit from repository config and built-in defaults.

In Pi, `/freeflow settings` edits personal overrides and `/freeflow settings repo` edits shared settings. Prefer those controls when available.

Before writing local config in a Git checkout, verify it is untracked and ignored. Do not modify shared ignore policy merely to store a personal preference; use the host's safe settings path or local Git exclusion. Refuse to overwrite a tracked local config.

If local config is invalid, report that it blocks effective runtime. Repair or remove it only with authorization; never discard it and fall back silently.

## Keep Optional Setup Explicit

Do not ask an automatic capabilities question. Configure Output Router only when explicitly requested, using [Output Router setup](references/output-router-setup.md). Preserve valid existing capability config during idempotent setup.

## Establish Same-Turn Context

After successful verification, apply newly effective context directly for the remainder of the setup turn:

- read the [Interaction Contract](../../runtime/interaction-contract.md) when it is effective;
- read [Workflow](../workflow/SKILL.md) and [Mode Contract](../mode-contract/SKILL.md) when Skills are effective;
- read an explicitly configured capability skill only when runtime state says it is effective.

This direct read establishes same-turn guidance; it does not prove that a lifecycle adapter ran. If automatic delivery begins only at a lifecycle boundary, name the required next turn, reload, resume, clear, or compact action without claiming it already occurred.

## Verify And Report

Verify:

- repository config parses and contains a valid `defaultMode`;
- local config is missing or valid, personal, untracked, and ignored when applicable;
- effective `enabled`, Interaction Contract, Skills, and configured default values have the expected sources;
- Skills-disabled mode remains resolved but dormant;
- optional capability config changed only when requested;
- no repo-owned host instructions or unrelated files changed.

Report separately:

1. shared repository activation;
2. personal override state and effective sources;
3. effective capability state;
4. same-turn direct context reads;
5. automatic runtime delivery as **confirmed**, **unavailable**, or **unconfirmed**.
