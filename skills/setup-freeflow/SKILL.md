---
name: setup-freeflow
description: Use when setting up, installing, enabling, initializing, or configuring Freeflow in a repo, choosing Codex/Claude/multi-agent activation, creating `.freeflow/config.json`, changing the repo default mode during setup, or opting into output-router/observed-routing/script-transform setup.
---

# Setup Freeflow

Set up the smallest durable activation that makes Freeflow available in this repo.

Read `references/activation-contract.md` before rendering activation text or config. It is the canonical source for host blocks, config invariants, and drift checks.

Read `references/host-setup.md` when choosing Codex, Claude, both hosts, setup profile, hooks/trust guidance, or default mode shape.

Read `references/output-router-setup.md` only when the user asks for output-router/observed-routing/script-transform config or accepts the optional evidence-routing branch.

## Stop Before Editing

Do not create config, activation blocks, imports, or rule files until the host target is clear and repo-rule conflicts are resolved.

Hard stop before editing when:

- both `AGENTS.md` and `CLAUDE.md` exist and the user did not choose a host or ask for multi-agent setup;
- existing repo instructions conflict with asking before user-owned decisions;
- existing repo instructions conflict with verification before completion claims;
- Claude setup would create `.claude/rules/freeflow-core.md` but the user has not clearly chosen Claude or multi-agent setup.

For a hard stop, name the blocker and ask one direct question.

## Inspect

Inspect `.freeflow/config.json`, `AGENTS.md`, `CLAUDE.md`, `.claude/rules/freeflow-core.md`, `.codex/rules/`, existing `## Freeflow` blocks, and relevant repo instructions.

Existing repo instructions are source truth. If they conflict with Freeflow's core behavior, ask whether to install Freeflow as advisory, revise the conflicting rule, or skip setup. Advisory install is a user decision, not the default.

## Choose Target

- Codex target: `AGENTS.md`.
- Claude target: `CLAUDE.md` plus `.claude/rules/freeflow-core.md`.
- If only one host file exists, choose that host.
- If both host files exist and the request names a host, update that host.
- If both exist and the target is ambiguous, ask.
- If neither exists, ask which host to create.
- Update both only when the user asks for both or multi-agent setup. Mention duplicated host activation drift risk.

Do not treat the current agent runtime as target approval.

Update an existing `## Freeflow` block in place. Otherwise place it near existing agent/workflow instructions or append near the end. Never duplicate it.

Never use `.codex/rules/*.rules` for Freeflow behavior. Codex rules are shell approval/security policy, not model memory.

## Write Minimal Setup

Render activation from `references/activation-contract.md`.

- Codex: put the Codex core block in `AGENTS.md`.
- Claude: put only the Claude import block in `CLAUDE.md`, then put the Codex core block text in `.claude/rules/freeflow-core.md`.

Create or update `.freeflow/config.json` through the activation-contract config adapter.

Minimal setup writes only:

```json
{ "defaultMode": "workflow" }
```

Persist `conversation` or `strict-workflow` only when the user explicitly asks to make that valid mode the repo default. Do not infer `strict-workflow` from team setup, “strict gates,” “careful,” or high-risk examples.

Do not add current mode, task, phase, file inventory, plans, version metadata, activation paths, unrequested router keys, empty optional sections, repo-local hooks, docs inventories, state files, handoffs, skill inventories, setup-output-router skills, or empty `CONTEXT.md`.

Do not list the whole workflow, every mode, or full `interview-gate`/`discover` skills in always-loaded text. Plugin runtime loads runtime context.

## Optional Evidence Routing Branch

After minimal host/config setup, ask one optional capabilities question: whether to configure evidence routing, observed routing, or script transform adapters beyond built-in defaults.

If declined, keep minimal setup.

If accepted or explicitly requested, read `references/output-router-setup.md`. Ask only path-changing follow-ups, write only explicit decisions/overrides, and verify with `freeflow_status` when available.

Never enable observed routing, native safety-net routing, or script transform by default.

Script transform adapter install requires explicit consent and successful sandbox proof probing. Install adapters globally, not repo-locally, using the command documented in `references/output-router-setup.md`. Report probe failures instead of claiming a language is enabled.

## Verify

Before claiming setup is complete, check:

- config JSON parses;
- minimal config contains only `defaultMode` unless optional capabilities were accepted or explicitly requested;
- optional `outputRouter`, `observedRouting`, and `scriptTransform` config contains only requested valid keys;
- observed routing, native safety-net routing, and script transform are off unless explicitly requested and supported;
- every enabled observed-routing producer/server has user-chosen persistence: `exact`, `metadata-only`, or `none`; setup does not offer or write `redacted`;
- Codex setup has exactly one `## Freeflow` block in `AGENTS.md`;
- Claude setup has exactly one `CLAUDE.md` import and one `.claude/rules/freeflow-core.md` core file;
- `.codex/rules` was not created or changed for Freeflow behavior;
- no unrelated files changed.

After successful setup verification, read `../mode-contract/SKILL.md`, `../workflow/SKILL.md`, `../interview-gate/SKILL.md`, and `../output-router/SKILL.md` before the final response. Treat discovery-light as loaded with the runtime rule: inspect the smallest relevant evidence, answer directly, and ask only path-changing questions. Only say mode-contract, workflow, interview-gate, discovery-light, and output-router context is loaded for this session if all four files were read successfully.

If verification cannot run, say what remains unverified.
