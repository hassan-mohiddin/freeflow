---
name: setup-freeflow
description: Use when setting up, installing, enabling, initializing, or configuring Freeflow in a repo, choosing Codex/Claude/multi-agent activation, creating `.freeflow/config.json`, or changing the repo default mode during setup.
---

# Setup Freeflow

Use `references/activation-contract.md` before rendering activation text, config, or host setup.

Use `references/host-setup.md` when the request mentions Codex, Claude, both hosts, team setup, solo setup, strict defaults, hooks, CLI, or setup profiles.

Use `references/output-router-setup.md` when setup reaches the optional evidence-routing decision point or asks for output-router/observed-routing/script-transform repo config, generated-path hints, native safety-net routing, vault settings, or output thresholds.

## Stop Before Editing

Do not create config, add activation blocks, imports, or rule files until setup has a clear host target and no unresolved repo-rule conflict.

Hard stops:
- both `AGENTS.md` and `CLAUDE.md` exist, and the user did not explicitly choose a host or ask for multi-agent setup
- existing repo instructions conflict with asking before user-owned decisions
- existing repo instructions conflict with verification before completion claims
- Claude setup would add `.claude/rules/freeflow-core.md` but the user has not clearly chosen Claude or multi-agent setup

For a hard stop, make no file changes. Name the blocker and ask one direct question.

## Inspect

Inspect `.freeflow/config.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/rules/freeflow-core.md`, `.codex/rules/`, existing `## Freeflow` blocks, and conflicting repo instructions.

Existing repo instructions are source truth. If a rule conflicts with Freeflow's core behavior, name the conflict and ask whether to install Freeflow as advisory, revise the rule, or skip setup. Advisory install is a user decision, not the default.

## Target

- Codex target: update `AGENTS.md`.
- Claude target: update `CLAUDE.md` and `.claude/rules/freeflow-core.md`.
- If only `AGENTS.md` exists, choose Codex.
- If only `CLAUDE.md` exists, choose Claude.
- If both exist and the user explicitly named the host target, update that host's files.
- If both exist and the target is ambiguous, ask before editing.
- If neither exists, ask which one to create.
- Update both only when the user asks for multi-agent setup. Mention duplicated host activation drift risk.

Do not treat the current agent runtime alone as target approval. A Codex run in a repo that also has `CLAUDE.md` still needs the user to choose unless the request or repo instructions make the target explicit.

Update an existing `## Freeflow` block in place. Otherwise place the block near existing agent skill/workflow sections, or append near the end. Never duplicate it. Do not use `.codex/rules/*.rules` for Freeflow behavior; Codex rules are shell approval/security policy, not model memory.

## Config

Create or update `.freeflow/config.json` using the config adapter in `references/activation-contract.md`.

Minimal setup writes only `defaultMode`. Use `workflow` unless the user explicitly asks to persist a valid repo default: `conversation`, `workflow`, or `strict-workflow`.

Ask one optional capabilities decision point after minimal host/config setup: whether to configure evidence routing and script transform adapters beyond the minimal default. If declined, keep the minimal setup path.

If accepted, read `references/output-router-setup.md` and ask only path-changing follow-ups: router profile or intentional overrides, observed MCP/web/fetch/code-search producers to enable, persistence for each enabled producer/server, native safety-net policy, and whether to install global script transform adapters. Write high-level decisions and explicit overrides only. Do not add empty `outputRouter`, `observedRouting`, or `scriptTransform` objects, and do not dump effective defaults.

If the user consents to script transform setup, install adapters globally, not repo-locally. Resolve `../../router/dist/setup/script-transform-adapters.js` relative to this skill file and run:

```sh
node <plugin-root>/router/dist/setup/script-transform-adapters.js install --config .freeflow/config.json
```

The installer uses `~/.cache/freeflow-script-adapters` by default, or `FREEFLOW_SCRIPT_TRANSFORM_ADAPTERS_HOME` when set. It installs JavaScript, jq, Python adapter packages, and a JSPI-capable `node@24` support runtime for Python, probes sandbox proofs, and writes `scriptTransform.enabled=true` with only proof-passing languages. Python/Eryx uses the setup-installed child Node process launched with `--experimental-wasm-jspi`; if that runtime cannot run the proofs, report the probe failure instead of claiming Python is enabled.

If the user asks for router setup but gives no config knobs, say the router works with built-in defaults and ask which optional config they want persisted. Recommend no repo config unless they need observed routing, repo-specific hints, script transform setup, or safety-net behavior.

Never enable observed routing or native safety-net routing by default. Observed routing requires explicit producer/server entries and a user-chosen persistence mode for each enabled entry. `outputRouter.postToolRouting: "safety-net"` requires an explicit request; `strict` is reserved and needs a separate confirmation before writing. Script transform may be enabled during setup only after explicit adapter-install/config consent and successful sandbox proof probing.

Do not infer `strict-workflow` from "team", "strict gates", "careful", or high-risk examples. Recommend or ask unless the user explicitly says to make a mode the repo default.

Do not add current mode, task, phase, file inventory, active plans, version metadata, activation file path, or unrequested router keys.
Mode switches are task/conversation scoped unless the user explicitly asks to persist a different default mode.

## Activation

Render the canonical blocks from `references/activation-contract.md`.

For Codex, put the Codex core block in `AGENTS.md`.

For Claude, put only the Claude import block in `CLAUDE.md`, then put the Codex core block text in `.claude/rules/freeflow-core.md`. Do not create separate Claude rule files for `interview-gate` or `discover`; plugin runtime loads them.

Do not list the whole workflow, every mode, or full `interview-gate`/`discover` skill in always-loaded text. Do not split into multiple always-loaded Freeflow rule files unless the user explicitly confirms that split after the one-file recommendation.

## Do Not Create

Setup must not create empty `CONTEXT.md`, docs pages, repo-local hooks, state files, handoffs, skill inventories, `setup-output-router` skills, or `.codex/rules` behavior files.
`CONTEXT.md` is domain language memory, not plugin state.
Plugin-bundled context hooks are installed with Freeflow, not created by repo setup.

## Verify

Before claiming setup is complete, check:
- config JSON parses
- minimal config contains only `defaultMode` with the requested explicit default, or `workflow` when no explicit default was requested
- optional `outputRouter`, `observedRouting`, and `scriptTransform` config appears only after the capabilities decision point or explicit request, and contains only requested valid keys
- observed routing, native safety-net routing, and script transform are off unless explicitly requested and supported
- every enabled observed-routing producer/server has user-chosen persistence: `exact`, `metadata-only`, or `none`; setup does not offer or write `redacted`
- Codex setup has exactly one `## Freeflow` block in `AGENTS.md`
- Claude setup has exactly one `CLAUDE.md` import and one `.claude/rules/freeflow-core.md` core file
- when script transform setup was accepted, global adapters were installed under the reported adapter home, `freeflow_status` shows available adapters, and `.freeflow/config.json` enables only proof-passing `scriptTransform.languages`
- `.codex/rules` was not created or changed for Freeflow behavior
- no unrelated files changed

After successful setup verification, read `../mode-contract/SKILL.md`, `../workflow/SKILL.md`, `../interview-gate/SKILL.md`, `../discover/SKILL.md`, and `../output-router/SKILL.md` before the final response. Only say mode-contract, workflow, interview-gate, discover, and output-router context is loaded for this session if all five files were read successfully.

If verification cannot run, say what remains unverified.
