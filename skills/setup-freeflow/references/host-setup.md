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
/freeflow settings          personal overrides
/freeflow settings session  temporary session overrides
/freeflow settings repo     shared repository settings
/freeflow mode               direct temporary session mode
```

Session settings can temporarily inherit, enable, or disable Freeflow, Interaction Contract, and Skills, and can override mode. One reset action clears all four overrides. They persist in the active Pi session branch JSONL, never write `.freeflow/config.json` or `.freeflow/local.json`, and cannot bypass missing or invalid repository activation. Master or Skills changes reload Pi resources when supported.

Personal settings use omission to inherit. The settings path refuses to overwrite invalid or tracked local config and establishes local Git exclusion when needed. These are user-operated host controls; they update state before the next model turn. Agent-performed file edits still follow Setup Freeflow's mutation-authority rules.

When effective, Pi's `before_agent_start` path preserves the existing system prompt, adds current layered status and enabled model-facing context, and loads Workflow as one hidden persistent message while Skills are enabled. Interaction Contract delivery is independent from Skills. Mode Contract remains on demand.

A config written during setup is visible to the available Pi adapter on the next agent turn. After first activation, tell the user to run `/reload` so Pi refreshes skills and resources fully. Without reload, the adapter can load core runtime context on the next agent turn, but resource discovery waits for reload. A session-mode command applies before the next model turn and does not require reload. For the remainder of the setup turn, read newly effective context directly after verification instead of claiming that another `before_agent_start` invocation already occurred.

Confirm automatic delivery through current extension status or runtime evidence when available.

## Codex And Claude

The packaged runtime hook reads the same repository and local layers plus plugin-owned session mode state. At supported session start, resume, clear, and compact boundaries, `SessionStart` restores the complete enabled context. On submitted prompts, `UserPromptSubmit` changes mode only for an explicit native or conservative natural-language session control and otherwise emits nothing.

When top-level Freeflow is effective, the hook loads the Interaction Contract if enabled and the full Workflow bootstrap if Skills are enabled. It reports configured, session, resolved, and effective mode state without treating a configured default as the current session mode.

After first-time setup, tell the user to trigger the least disruptive supported host-native lifecycle boundary: resume, clear, compact, or a new session/startup as available. Name the exact control supported by the current host; do not prescribe Pi's `/reload`. Until that boundary runs, use same-turn direct reads without claiming automatic delivery.

Classify delivery as:

- **confirmed** when the current adapter invocation is evidenced;
- **unavailable** when the plugin or hook is absent, disabled, denied, untrusted, or unsupported;
- **unconfirmed** when the adapter may be installed and trusted but the host exposes no trustworthy evidence that it ran for the current lifecycle.

Installed and trusted registration can establish availability for the next lifecycle action; it does not prove delivery already occurred.

Do not compensate for unavailable or unconfirmed delivery by copying Freeflow text into repository instructions.

Do not install repo-local hooks, CLI commands, lint rules, global standards, documentation inventories, or state files during setup.

## Conflicts

Repository instructions can conflict with Freeflow behavior even though they are not activation markers. Name the conflict and ask before changing setup or behavior when it would alter the next action.
