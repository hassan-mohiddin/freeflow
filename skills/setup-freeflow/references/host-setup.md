# Host Setup

Host choice affects runtime delivery and settings controls, not the required repository activation shape.

## Shared Checkout Shape

Every host requires:

```text
.freeflow/config.json
```

Each checkout may also use:

```text
.freeflow/local.json
```

The repository file establishes shared activation. The local file supplies optional personal overrides and cannot activate Freeflow alone. Keep it untracked and ignored.

Do not generate host-specific Freeflow instructions in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, or another repo-owned instruction surface.

## Pi

The Pi extension reads both config layers before each agent turn. A valid repository config plus a missing or valid local layer is required before Freeflow can become effective.

Pi provides these settings scopes:

```text
/freeflow settings       personal overrides
/freeflow settings repo  shared repository settings
/freeflow mode            temporary session mode
```

Personal settings use omission to inherit. The settings path refuses to overwrite invalid or tracked local config and establishes local Git exclusion when needed. These are user-operated host controls; they update state before the next model turn. Agent-performed file edits still follow Setup Freeflow's mutation-authority rules.

When effective, Pi's `before_agent_start` path preserves the existing system prompt, adds current layered status and enabled model-facing context, and loads Workflow as one hidden persistent message while Skills are enabled. Interaction Contract delivery is independent from Skills. Mode Contract remains on demand.

A config written during setup is visible to the next agent turn. For the remainder of the setup turn, read newly effective context directly after verification instead of claiming that another `before_agent_start` invocation already occurred.

Confirm automatic delivery through current extension status or runtime evidence when available.

## Codex And Claude

The packaged lifecycle hook reads the same repository and local layers at supported session start, resume, clear, and compact boundaries.

When top-level Freeflow is effective, the hook loads the Interaction Contract if enabled and the full Workflow bootstrap if Skills are enabled. It reports layered value sources and active or dormant mode state. Optional capabilities remain independently gated by valid repository config and top-level Freeflow.

After first-time setup, use the host's relevant lifecycle action before relying on automatic delivery.

Classify delivery as:

- **confirmed** when the current adapter invocation is evidenced;
- **unavailable** when the plugin or hook is absent, disabled, denied, untrusted, or unsupported;
- **unconfirmed** when the adapter may be installed and trusted but the host exposes no trustworthy evidence that it ran for the current lifecycle.

Installed and trusted registration can establish availability for the next lifecycle action; it does not prove delivery already occurred.

Do not compensate for unavailable or unconfirmed delivery by copying Freeflow text into repository instructions.

## Optional Capabilities

Do not ask a generic capability question during normal setup. If Output Router is explicitly requested, use `output-router-setup.md` and keep its config in the shared repository layer unless the documented setting is specifically local-only.

Setup does not offer or add deprecated Delegation Harness config. Preserve valid existing compatibility config unless the user separately authorizes a change.

Do not install repo-local hooks, CLI commands, lint rules, global standards, documentation inventories, or state files during setup.

## Conflicts

Repository instructions can conflict with Freeflow behavior even though they are not activation markers. Name the conflict and ask before changing setup or behavior when it would alter the next action.
