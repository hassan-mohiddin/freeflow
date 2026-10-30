---
name: setup-freeflow
description: "Use when installing, activating or turning off Freeflow in a repository, changing or repairing its repository or personal configuration (.freeflow/config.json, .freeflow/local.json), setting up the Freeflow store that keeps task memory (local, or cloud with a private repository), or checking whether the current host is loading Freeflow's guidance and skills."
---

# Setup Freeflow

Create or repair the smallest valid layered setup. Keep repository activation, personal overrides, and host runtime delivery as separate facts.

- `.freeflow/config.json` is the required shared repository activation config.
- `.freeflow/local.json` is an optional per-checkout personal override. It cannot activate Freeflow by itself.
- Runtime delivery depends on the current host's installed and trusted adapter. Configuration does not prove runtime delivery.

Answer setup questions and delivery checks read-only. An explicit action request authorizes the smallest selected setup change under the state rules below. When repository config is missing, first activation authorizes minimal shared config; it does not authorize personal overrides, optional capabilities, replacement of invalid config, or edits to repo-owned host instructions.

## Routes

| Situation | Go to |
| --- | --- |
| Activating, or changing shared or personal setup | Establish Mutation Authority, then Inspect The Layers, then the section for that layer |
| Repository config invalid, or conflicting with accepted source truth or repository instructions | [Discuss Work](../discuss-work/SKILL.md), before replacing or reinterpreting it |
| Setting up the Freeflow store for task memory, local or cloud, or moving a local store to the cloud | Set Up The Store, below |
| Whether the host delivers Freeflow, or which host action refreshes it | Hosts, below |
| Cognitive Routing or Tool Execution values | Their explicit settings surface (on Pi, `/freeflow settings`), only when the user requests them |

## Establish Mutation Authority

Classify the current state before editing:

- **Unconfigured:** repository config is missing or invalid, so repository activation is absent and Freeflow is not effective. An explicit setup request may create minimal config when it is missing. Replacing or reinterpreting invalid config requires specific authorization and resolving the source conflict.
- **Configured but ineffective:** valid repository activation exists, but effective `enabled` is `false` or an invalid local config blocks runtime. No Freeflow guidance is effective. An explicit request governs the selected enablement, configuration, or repair.
- **Effective:** Freeflow core guidance, the Interaction Contract, and base skills are effective; obey them. An explicit setup or repair request may be carried out within its authority; optional capability behavior remains independently gated.

User-operated host settings are direct user actions, not agent-performed config edits. Prefer them when available, do not claim their state changed until the host reports it, and verify the resulting source and effective state afterward.

## Inspect The Layers

Before editing:

1. inspect `.freeflow/config.json` and `.freeflow/local.json` independently;
2. identify which requested values are shared repository state and which are personal overrides;
3. inspect repo instructions only when a conflict would change setup behavior;
4. identify the host and available delivery evidence when runtime status matters.

A valid repository config establishes activation. A missing local config inherits repository settings. An invalid existing local config blocks effective Freeflow instead of falling back silently.

Resolve each configurable value in this order:

```text
host session override -> personal override -> repository value -> built-in default
```

Host session overrides are host state, not config, and cannot bypass missing or invalid repository activation. Pi may temporarily override Freeflow enablement, and Cognitive Routing has its own host-managed session control. Effective Freeflow requires a valid repository config, a missing or valid local config, session-resolved `enabled: true`, and the prompt files the host delivers (Hosts, below).

If setup is already valid and no change was requested, preserve it and report the effective sources. Do not rewrite config merely to normalize formatting or materialize defaults.

## Configure Shared Activation

For a new setup, write the minimal activation boundary:

```json
{}
```

Missing core keys use the built-in default `enabled: true`. Add `enabled: false` only when the user explicitly requests Freeflow to be disabled. Add optional capability configuration only when the user explicitly requests it. Do not add task state, phase, file inventories, plans, version metadata, activation paths, empty optional sections, host instruction copies, or generated workflow text.

These keys are unsupported in either config file and make it invalid until repaired: `defaultMode`, `interactionContract`, `skills`, `contextVirtualization`, and `conversationHistory`. The user deletes them wherever present; setup never migrates or removes them automatically.

Do not create or append Freeflow instructions in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, or another host-owned instruction surface, including to compensate for unavailable or unconfirmed delivery. Existing repo instructions remain live source truth within host precedence. They are not activation markers, but they can conflict with Freeflow behavior: name a conflict and ask through Discuss Work before changing setup or behavior when it would alter the next action, rather than overwriting them to make Freeflow appear active. Do not install repo-local hooks, CLI commands, lint rules, global standards, documentation inventories, or state files during setup.

## Add Personal Overrides Only When Requested

Use `.freeflow/local.json` for an explicitly selected per-checkout override of `enabled`:

```json
{
  "enabled": false
}
```

Omitted values inherit from repository config and built-in defaults; local precedence is per property, not whole-file replacement. Configure optional Cognitive Routing values only through its explicit settings surface.

Before writing local config in a Git checkout, verify it is untracked and ignored. Do not modify shared ignore policy merely to store a personal preference: prefer the host's safe settings path, `.git/info/exclude`, or an existing ignore rule. Refuse to overwrite a tracked local config.

If local config is invalid, report that it blocks effective runtime. Repair or remove it only with authorization; never discard it and fall back silently.

## Set Up The Store

[Track Work](../track-work/SKILL.md) keeps task memory in the Freeflow store: one private Git repository at `FREEFLOW_HOME` (default `~/.freeflow`), apart from every code repository. Set it up when the user asks, or says yes when Track Work asks to make it. Its script is `node <track-work-directory>/scripts/working-record.mjs`.

Ask one question, local or cloud, with local first as the default:

- **Local:** the store on this device only; nothing leaves the machine. `store init`.
- **Cloud:** the same store with the user's own private repository as its remote, kept in step on every device. `store init --remote <url>` lays an empty repository out as the store, or joins one that already is. A cloud session needs cloud, since its container is thrown away: the store's repository must be one of the session's repositories, with `FREEFLOW_HOME` pointing at its clone.

A local store moves to the cloud later with `store remote --url <url>`, which pushes its whole history into an empty private repository. Commits in the store are authored as the user (`--git-name` and `--git-email` when Git has no identity), with no trailers. `store init` refuses a folder that holds Pi's Task Memory (`registry.json`) or anything else: ask the user where the store should go. Never point the store at a repository that is not the user's own and private. Report where the store is and whether it is local or cloud, from `store status`.

## Hosts

When Freeflow is effective, host adapters deliver `runtime/prompts/core.md`, `interaction-contract.md` and `working-method.md`, the base Freeflow skill surface, and compact current capability state; on Pi also `tool-execution.md` and `cognitive-routing.md` while those capabilities are effective, with their skills and tools. Adapters load context only; they do not enforce policy, block tools, grant permissions, or replace repo instructions. Context Virtualization and Conversation History are removed.

### Pi

The Pi extension reads both config layers before each agent turn. When Freeflow is enabled it always delivers the core prompt, Interaction Contract and Working Method together, keeping the existing system prompt. Runtime State is refreshed at session start, after context reconstruction or loss, and when displayed state changes; unchanged state remains in the provider context. Skill and capability bodies stay discoverable rather than delivered as hidden persistent messages.

Settings scopes:

```text
/freeflow settings          personal overrides
/freeflow settings session  temporary Freeflow and Cognitive Routing session controls
/freeflow settings repo     shared repository settings
```

Session settings can temporarily inherit, enable, or disable Freeflow and override Cognitive Routing profiles and delegation; one reset action clears them. They persist in the active Pi session branch, never write either config file, and cannot bypass missing or invalid repository activation. The personal settings path uses omission to inherit, refuses to overwrite invalid or tracked local config, and establishes local Git exclusion when needed. These user-operated controls update state before the next model turn and reload Pi resources when supported.

A config written during setup is visible to the adapter on the next agent turn. After first activation, tell the user to run `/reload` so Pi refreshes skills and resources fully; without it, core runtime context loads on the next turn but resource discovery waits. Confirm automatic delivery through current extension status or runtime evidence.

### Codex And Claude Code

The packaged runtime hook reads the same two layers. At supported `SessionStart` boundaries (startup, resume, clear, and compact) it loads `core.md`, `interaction-contract.md` and `working-method.md`, each unless `prompts` (`core`, `interactionContract`, `workingMethod`; each a boolean, on by default, personal overriding shared per prompt) turns it off, and emits a compact active Runtime State. It does not process submitted prompts, persist session controls, inject skill bodies, or inspect Pi-only capabilities.

After first-time setup, tell the user to trigger the least disruptive supported host-native lifecycle boundary: resume, clear, compact, or a new session or startup, as available. Name the exact control the current host supports; do not prescribe Pi's `/reload`.

## Establish Same-Turn Context

After successful verification, apply newly effective context directly for the remainder of the setup turn:

- read the [Interaction Contract](../../runtime/prompts/interaction-contract.md);
- read the [core guidance](../../runtime/prompts/core.md) and the [Working Method](../../runtime/prompts/working-method.md) when Freeflow is effective.

These direct reads establish same-turn guidance; they do not prove that a lifecycle adapter ran, and no further adapter invocation has occurred yet. After first activation, name the exact host-native lifecycle action for automatic delivery and resource refresh (Hosts, above), and state what applies before that boundary.

## Verify And Report

Verify:

- repository config parses and is the required activation boundary;
- local config is missing or valid, personal, untracked, and ignored when applicable;
- effective `enabled`, core guidance, and optional capability values have the expected sources;
- no repo-owned host instructions or unrelated files changed, and running setup again would change nothing.

After verification supports a setup result, silently self-review the final observed or changed state before accepting, reusing, or reporting it. Correct clear local issues within the existing setup authority and re-verify the affected boundary; stop on ambiguity, route change, or an out-of-envelope correction.

Classify automatic runtime delivery from evidence:

- **confirmed:** trustworthy evidence shows the current host adapter ran for the current lifecycle;
- **unavailable:** the adapter, plugin or hook is absent, disabled, denied, untrusted, or unsupported;
- **unconfirmed:** the adapter may be installed and trusted, but the host exposes no trustworthy evidence that it ran. Installed and trusted registration establishes availability for the next lifecycle action, not delivery.

Report separately:

1. shared repository activation;
2. personal override state and effective sources;
3. effective Freeflow core guidance, Interaction Contract, base skills, and optional capability state;
4. same-turn direct context reads;
5. automatic runtime delivery as **confirmed**, **unavailable**, or **unconfirmed**.
