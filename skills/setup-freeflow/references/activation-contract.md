# Activation Contract

Canonical setup contract for host instruction files and `.freeflow/config.json`.

Setup renders this reference. Do not copy full skills, workflow maps, or runtime hook code into repo activation files.

## Invariants

- Activation text contains only always-on invariants.
- Minimal config has exactly one field: `defaultMode`.
- Valid defaults are exactly `conversation`, `workflow`, and `strict-workflow`.
- Default mode is `workflow` unless the user explicitly persists another valid mode.
- Optional `outputRouter`, `observedRouting`, and `scriptTransform` config is allowed only after the capabilities decision point or an explicit request.
- Removed `capture` and `providers` config is not written by setup.
- Codex activation writes `AGENTS.md`, not `.codex/rules`.
- Claude activation writes a `CLAUDE.md` import plus one `.claude/rules/freeflow-core.md` file.
- Multi-agent setup updates both host surfaces only on explicit request and reports drift risk.
- Existing repo instructions remain source truth.
- Setup hard-stops before unresolved host ambiguity or repo-rule conflict.
- Setup does not create repo-local hooks, docs inventories, state files, handoffs, empty `CONTEXT.md`, skill inventories, `setup-output-router` skills, version metadata, activation path, current task, or current phase.
- Plugin-bundled context hooks may load mode-contract, workflow, interview-gate, discovery-light, and output-router context at session start, but they are package runtime, not setup output.
- After successful setup verification, setup reads the mode-contract, workflow, interview-gate, and output-router skills before its final response and applies the discovery-light runtime rule so the current session is immediately usable.

## Host Adapters

Codex:

- Update an existing `## Freeflow` block in `AGENTS.md`, or add one near existing agent/workflow instructions.
- Keep exactly one `## Freeflow` block.
- Never use `.codex/rules` for Freeflow behavior.

Claude:

- Put only the Claude import block in `CLAUDE.md`.
- Put the Codex core block text in `.claude/rules/freeflow-core.md`.
- Keep exactly one imported core file unless the user explicitly confirms a split after the one-file recommendation.

Config:

- Create or update `.freeflow/config.json`.
- For minimal setup, write exactly `{ "defaultMode": "<mode>" }`.
- Use `workflow` unless the user explicitly asks to persist `conversation` or `strict-workflow`.
- Add optional config only after the capabilities decision point or an explicit request, using `output-router-setup.md`.
- Missing optional sections mean built-in defaults, not setup failure.
- Never enable observed routing or native safety-net routing by default.
- Observed routing requires explicit producer/server entries and user-chosen persistence: `exact`, `metadata-only`, or `none`. Do not offer or write `redacted`.

## Codex Core Block

<!-- freeflow-activation-contract:codex-core:start -->
```md
## Freeflow

Use Freeflow for consequential work. Default mode: `.freeflow/config.json`.

Move forward when context is sufficient. Re-enter clarification when new ambiguity would change the next action.

Treat questions as questions and suggestions as hypotheses. Answer directly; do not infer correction, permission, or agreement.

Ask before user-owned decisions: product behavior, scope, public APIs, security, privacy, billing, data loss, compatibility, permissions, or irreversible architecture.

Treat live repo evidence and existing docs/tests as source truth. If the user request conflicts with them, stop and ask before changing behavior.

Verify before completion claims. Capture only stable decisions, glossary terms, ADR-worthy tradeoffs, or useful handoff memory.
```
<!-- freeflow-activation-contract:codex-core:end -->

## Claude Import Block

<!-- freeflow-activation-contract:claude-import:start -->
```md
## Freeflow

@.claude/rules/freeflow-core.md
```
<!-- freeflow-activation-contract:claude-import:end -->

## Drift Checks

Run `evals/scripts/check-activation-contract.sh` when changing setup behavior, post-setup fixtures, setup eval assertions, or docs that quote setup behavior.
Run `evals/scripts/check-runtime-context-hook.sh` when changing plugin-bundled runtime context hooks.

The check keeps these surfaces aligned:

- this canonical reference
- `setup-freeflow/SKILL.md`
- `setup-freeflow/references/host-setup.md`
- `docs/freeflow-runtime-and-lifecycle.md` in the Freeflow development repo
- post-setup `AGENTS.md` fixtures
- setup eval assertions that depend on canonical activation text
