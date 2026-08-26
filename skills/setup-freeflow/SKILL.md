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

Read [the activation contract](references/activation-contract.md) before changing setup state. Read [host setup](references/host-setup.md) when runtime delivery, lifecycle, or host trust matters.

## Establish Mutation Authority

Classify the current state before editing:

- **Unconfigured:** repository config is missing or invalid, so Freeflow is not effective. An explicit setup request may create minimal config when it is missing. Replacing or reinterpreting invalid config still requires the specific authority described below.
- **Configured but ineffective:** valid repository activation exists, but Freeflow is disabled or an invalid local config blocks runtime. No Freeflow guidance is effective. An explicit request governs the selected enablement, configuration, or repair.
- **Effective:** Freeflow core guidance, the Interaction Contract, and base skills are effective. An explicit setup or repair request may be carried out within its authority; optional capability behavior remains independently gated.

User-operated host settings are direct user actions, not agent-performed config edits. Prefer them when available and do not claim their state changed until the host reports it.

## Inspect The Layers

Before editing:

1. inspect `.freeflow/config.json` and `.freeflow/local.json` independently;
2. identify which requested values are shared repository state and which are personal overrides;
3. inspect repo instructions only when a conflict would change setup behavior;
4. identify the host and available delivery evidence when runtime status matters.

A valid repository config establishes activation. A missing local config inherits repository settings. An invalid existing local config blocks effective Freeflow instead of falling back silently.

If setup is already valid and no change was requested, preserve it and report the effective sources. Do not rewrite config merely to normalize formatting or materialize defaults.

## Configure Shared Activation

For a new setup, write the minimal activation boundary:

```json
{}
```

Add `enabled: false` only when the user explicitly requests Freeflow to be disabled. Add optional capability configuration only when the user explicitly requests it.

If repository config is invalid or conflicts with accepted source truth, use [Decision Gate](../decision-gate/SKILL.md) before replacing or reinterpreting it.

Do not create or append Freeflow instructions in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, or another host-owned instruction surface.

## Add Personal Overrides Only When Requested

Use `.freeflow/local.json` for an explicitly selected per-checkout override of `enabled`, `contextVirtualization`, or `conversationHistory`. Omitted values inherit from repository config and built-in defaults. Configure optional Cognitive Routing values only through its explicit settings surface.

In Pi, `/freeflow settings` edits personal overrides and `/freeflow settings repo` edits shared settings. Prefer those controls when available.

Before writing local config in a Git checkout, verify it is untracked and ignored. Do not modify shared ignore policy merely to store a personal preference; use the host's safe settings path or local Git exclusion. Refuse to overwrite a tracked local config.

If local config is invalid, report that it blocks effective runtime. Repair or remove it only with authorization; never discard it and fall back silently.

## Establish Same-Turn Context

After successful verification, apply newly effective context directly for the remainder of the setup turn:

- read the [Interaction Contract](../../runtime/prompts/interaction-contract.md);
- read [Workflow](../workflow/SKILL.md) when Freeflow is effective.

These direct reads establish same-turn guidance; they do not prove that a lifecycle adapter ran. After first activation, use [host setup](references/host-setup.md) to name the exact host-native lifecycle action for automatic delivery and resource refresh, state what applies before that boundary, and keep delivery confirmed, unavailable, or unconfirmed from evidence.

## Verify And Report

Verify:

- repository config parses and is the required activation boundary;
- local config is missing or valid, personal, untracked, and ignored when applicable;
- effective `enabled`, core guidance, and optional capability values have the expected sources;
- no repo-owned host instructions or unrelated files changed.

After verification supports a setup result, silently self-review the final observed or changed state before accepting, reusing, or reporting it. Correct clear local issues within the existing setup authority and re-verify the affected boundary; stop on ambiguity, route change, or an out-of-envelope correction.

Report separately:

1. shared repository activation;
2. personal override state and effective sources;
3. effective Freeflow core guidance, Interaction Contract, base skills, and optional capability state;
4. same-turn direct context reads;
5. automatic runtime delivery as **confirmed**, **unavailable**, or **unconfirmed**.
