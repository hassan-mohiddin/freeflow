# Activation Contract Deepening

> **Date:** 2026-05-28
> **Type:** Issue
> **Status:** Open
> **Area:** Freeflow setup and always-on runtime

## Summary

Freeflow's activation contract is shallow because the compact always-on block and host setup rules are copied across setup skill prose, runtime docs, research notes, setup fixtures, and eval assertions.

Deepen this into one activation contract module with host adapters and drift checks.

## Evidence

Discovery artifact:

- [Architecture review candidates](artifacts/2026-05-28-architecture-review-candidates.html)

Focused interface review:

- [Activation contract interface review](artifacts/2026-05-28-activation-contract-interface-review.html)

Current files:

- `skills/setup-freeflow/SKILL.md`
- `skills/setup-freeflow/references/host-setup.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `docs/research/freeflow-always-on-memory.md`
- `evals/fixtures/tiny-post-setup-*/AGENTS.md`
- `evals/registries/fixture-evals.json`

## Problem

The activation contract has weak locality:

- canonical activation text lives inside `setup-freeflow/SKILL.md`
- runtime docs repeat the same block
- research docs repeat the same block
- post-setup fixtures repeat the same block
- setup eval assertions repeat the same invariants
- Codex and Claude host differences are encoded in setup prose

The module is shallow because changing the activation contract requires understanding and updating too many surfaces.

## Recommendation

Use a hybrid design:

```text
setup-freeflow
  -> planActivation(contract, repoState, request)
       -> CodexActivationAdapter | ClaudeActivationAdapter
       -> ConfigAdapter
       -> Drift checks for fixtures/docs/eval assertions
```

This combines:

- canonical activation contract
- setup-oriented planning interface
- Codex and Claude host adapters
- docs/fixture/eval drift checks

Do not turn this into a broad docs generator. Docs and fixtures should either reference the contract or be checked against it.

## Desired Interface

Core module shape:

```text
getActivationContract(defaultMode) -> ActivationContract
planActivation(contract, repoState, request) -> ActivationPlan | ActivationStop
renderActivation(contract, target) -> rendered text or checks
```

Targets:

- `codex`: render compact core block for `AGENTS.md`
- `claude-import`: render `CLAUDE.md` import block
- `claude-core`: render compact core block for `.claude/rules/freeflow-core.md`
- `fixture`: render or check fixture activation text
- `docs`: render or check docs excerpt
- `eval-assertions`: provide invariant checks, not full prose duplication

## Invariants

- Activation text contains always-on invariants only, not the full workflow spine.
- Config has exactly one field: `defaultMode`.
- Valid defaults are exactly `conversation`, `workflow`, and `strict-workflow`.
- Default mode is `workflow` unless the user explicitly persists another valid mode.
- Codex activation writes `AGENTS.md`, not `.codex/rules`.
- Claude activation writes `CLAUDE.md` import plus one `.claude/rules/freeflow-core.md`.
- Multi-agent setup updates both host surfaces only on explicit request and reports drift risk.
- Existing repo instructions remain source truth.
- Setup must hard-stop before unresolved host ambiguity or repo-rule conflict.
- Setup must not create hooks, docs inventories, state files, handoffs, empty `CONTEXT.md`, skill inventories, version metadata, activation path, current task, or current phase.

## Adapter Strategy

Host adapters:

- `CodexActivationAdapter`: owns `AGENTS.md` placement and exact block count.
- `ClaudeActivationAdapter`: owns `CLAUDE.md` import plus `.claude/rules/freeflow-core.md`.
- `ConfigAdapter`: owns `.freeflow/config.json` parse/write/validation.

Check adapters:

- `FixtureEvalAdapter`: checks setup fixtures against canonical contract.
- `DocsExcerptAdapter`: checks docs excerpts that intentionally quote activation text.
- `EvalAssertionAdapter`: keeps setup eval assertions aligned with contract invariants.

## Follow-Up Checklist

Use this as a readiness checklist for future work, not as an approved implementation plan.

- [ ] Decide whether activation contract should be code, a reference file, or a checked Markdown snippet.
- [ ] Add or update eval coverage before changing setup behavior.
- [ ] Preserve current `STP-001` through `STP-008` behavior.
- [ ] Preserve post-setup always-on behavior covered by `AON-001`.
- [ ] Preserve Codex `AGENTS.md` and Claude import/core-file shapes.
- [ ] Preserve `.codex/rules` avoidance.
- [ ] Preserve no-empty-`CONTEXT.md` setup rule.
- [ ] Add drift check for copied activation text or replace copies with generated/linked excerpts.
- [ ] Update setup docs and fixtures only after contract/check shape is clear.
- [ ] Run setup eval subset after changes.
- [ ] Run always-on runtime eval if installed activation text changes.
- [ ] Run `git diff --check`.

## Non-Goals

- Do not add hooks.
- Do not add native slash handlers.
- Do not make setup a docs generator.
- Do not include the full workflow lifecycle in always-on activation text.
- Do not add `.codex/rules` behavior files.
- Do not create `CONTEXT.md` during setup.

## Open Questions

- Should the canonical contract live in `setup-freeflow` references, a shared runtime reference, or a small validation script?
- Should setup fixtures import the canonical text, or should tests compare their copied text against it?
- Should docs quote the full activation block or only describe it and link to the setup skill?
- How should drift checks avoid becoming hook/CLI enforcement before eval evidence justifies enforcement?
