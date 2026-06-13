# Activation Contract

This is the canonical Freeflow setup contract. Setup renders this contract into host instruction files; docs, fixtures, and eval assertions should reference it or be checked against it.

## Interface

Use this Markdown reference as the v0.1 contract module:

```text
getActivationContract(defaultMode) -> ActivationContract
planActivation(contract, repoState, request) -> ActivationPlan | ActivationStop
renderActivation(contract, target) -> rendered text or checks
```

Do not add a code module until setup behavior needs logic that cannot be kept clear in the skill and this reference.

## Invariants

- Activation text contains always-on invariants only, not the full workflow spine.
- Config has exactly one field: `defaultMode`.
- Valid defaults are exactly `conversation`, `workflow`, and `strict-workflow`.
- Default mode is `workflow` unless the user explicitly persists another valid mode.
- Codex activation writes `AGENTS.md`, not `.codex/rules`.
- Claude activation writes a `CLAUDE.md` import plus one `.claude/rules/freeflow-core.md`.
- Multi-agent setup updates both host surfaces only on explicit request and reports drift risk.
- Existing repo instructions remain source truth.
- Setup hard-stops before unresolved host ambiguity or repo-rule conflict.
- Setup does not create repo-local hooks, docs inventories, state files, handoffs, empty `CONTEXT.md`, skill inventories, version metadata, activation path, current task, or current phase.
- Plugin-bundled context hooks may load workflow context at session start, but they are package runtime, not setup output.
- After successful setup verification, setup reads the workflow skill and workflow map before its final response so the current session is immediately usable.

## Host Adapters

Codex adapter:

- Update an existing `## Freeflow` block in `AGENTS.md`, or add one near existing agent/workflow instructions.
- Keep exactly one `## Freeflow` block.
- Never use `.codex/rules` for Freeflow behavior.

Claude adapter:

- Update `CLAUDE.md` with only the import block below.
- Write the Codex core block text to `.claude/rules/freeflow-core.md`.
- Keep exactly one imported core file unless the user explicitly confirms a split after the one-file recommendation.

Config adapter:

- Create or update `.freeflow/config.json`.
- Write exactly `{ "defaultMode": "<mode>" }`.
- Use `workflow` unless the user explicitly asks to persist `conversation` or `strict-workflow`.

## Codex Core Block

<!-- freeflow-activation-contract:codex-core:start -->
```md
## Freeflow

Use Freeflow for consequential work. Default mode: `.freeflow/config.json`.

Move forward when context is sufficient. Re-enter clarification when new ambiguity would change the next action.

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

Run `plugins/freeflow/evals/scripts/check-activation-contract.sh` when changing setup behavior, post-setup fixtures, setup eval assertions, or docs that quote setup behavior.
Run `plugins/freeflow/evals/scripts/check-runtime-context-hook.sh` when changing plugin-bundled runtime context hooks.

The check keeps these surfaces aligned:

- this canonical reference
- `setup-freeflow/SKILL.md`
- `setup-freeflow/references/host-setup.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- post-setup `AGENTS.md` fixtures
- setup eval assertions that depend on canonical activation text
