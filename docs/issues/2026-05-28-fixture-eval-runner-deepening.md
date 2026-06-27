# Fixture Eval Runner Deepening

> **Date:** 2026-05-28
> **Type:** Issue
> **Status:** Open
> **Area:** Freeflow eval harness

## Summary

Freeflow's fixture eval runner is shallow across the Codex and Claude paths. The current scripts repeat fixture staging, prompt assembly, host invocation, output capture, diff capture, git metadata capture, dry-run behavior, and policy checks.

Deepen this into one fixture eval runner module with a small caller interface and host-specific adapters.

## Evidence

Discovery artifact:

- [Architecture review candidates](artifacts/2026-05-28-architecture-review-candidates.html)

Focused interface review:

- [Fixture eval runner interface review](artifacts/2026-05-28-fixture-eval-runner-interface-review.html)

Current files:

- `evals/scripts/run-fixture-eval-by-id.sh`
- `evals/scripts/run-codex-fixture-eval.sh`
- `evals/scripts/run-claude-fixture-eval.sh`
- `evals/registries/fixture-evals.json`
- `evals/runbooks/fixture-eval-runbook.md`
- `evals/suites/v0.1-acceptance-suite.md`

## Problem

The current runner shape has weak locality:

- registry lookup lives in the ID runner
- fixture copy/setup lives in host-specific runners
- prompt assembly is duplicated between Codex and Claude runners
- output/diff/git evidence capture is duplicated
- dry-run semantics differ between the ID runner and Claude runner
- host-specific command construction is mixed with shared fixture lifecycle behavior

The module is shallow because callers and maintainers must understand too much implementation detail to run or extend an Adversarial Fixture Eval.

## Recommendation

Use a hybrid design:

```text
run-fixture-eval.sh <eval-id> [--baseline] [--agent codex|claude] [--dry-run] [...]
  -> runAdversarialFixtureEval(params)
       -> AgentAdapter(codex|claude)
```

This combines:

- common-caller CLI ergonomics
- minimal request/result module interface
- explicit Codex/Claude adapter seam

Reject a broad flexible interface for now. It risks turning the runner into a workflow engine and weakening depth with too many optional policy knobs.

## Desired Interface

Common caller:

```sh
evals/scripts/run-fixture-eval.sh IVG-001
```

Explicit cases:

```sh
evals/scripts/run-fixture-eval.sh IVG-001 --baseline
evals/scripts/run-fixture-eval.sh FX-004 --agent claude --baseline
evals/scripts/run-fixture-eval.sh STP-001 --dry-run
```

Internal module shape:

```text
runAdversarialFixtureEval(params) -> FixtureEvalResult
```

Core params:

- `evalId`
- `variant`: `baseline` or `with-skill`
- `agent`: `codex` or `claude`
- `runDir`
- `outputFile`
- `skillFiles`
- `dryRun`
- `requireEmptyDiff`
- host options parsed at the CLI edge

## Invariants

- `evalId` must resolve to exactly one registry entry.
- `baseline` never loads Freeflow skill files or Plugin Runtime context.
- `with-skill` intentionally activates skill files or Plugin Runtime context.
- `baseline_fixture_root` wins only for Baseline Eval.
- fixture source is never mutated.
- all agent writes happen inside the isolated run directory.
- diff evidence is captured after model execution when possible.
- dry-run resolves registry, fixture, prompt, adapter, command shape, and output paths without copying fixtures or invoking host commands.
- output sidecars derive from one output stem.

## Adapter Strategy

Keep one real seam for host commands:

```text
AgentAdapter.run(preparedRun) -> AgentRunResult
```

Adapters:

- `CodexAdapter`: owns `codex exec`, sandbox flags, and output-last-message behavior.
- `ClaudeAdapter`: owns `claude -p`, plugin dir, bare mode, tools, permission mode, stderr/status behavior.

Local-substitutable behavior should stay inside the runner implementation or small helpers:

- registry parsing
- prompt resolution
- fixture staging
- fixture setup
- diff capture
- git metadata capture
- artifact naming

## Follow-Up Checklist

Use this as a readiness checklist for future work, not as an approved implementation plan.

- [ ] Decide implementation language: keep Bash, or move shared runner core to Node/Python.
- [ ] Add or update eval coverage before refactoring runner behavior.
- [ ] Preserve current Baseline Eval and With-Skill Eval semantics.
- [ ] Preserve fixture isolation and diff/git evidence capture.
- [ ] Decide whether existing runner scripts remain compatibility wrappers or become private implementation details.
- [ ] Keep host-specific behavior behind a Codex/Claude adapter seam.
- [ ] Avoid turning the registry into a workflow engine.
- [ ] Update runbook and acceptance-suite command examples if the interface changes.
- [ ] Verify representative dry-run behavior.
- [ ] Verify at least one Codex fixture eval.
- [ ] Verify Claude dry-run; live Claude run remains dependent on local Claude auth.
- [ ] Run relevant JSON/plugin/eval validation if touched.
- [ ] Run `git diff --check`.

## Non-Goals

- Do not add hooks.
- Do not add native slash handlers.
- Do not make the registry a full workflow engine.
- Do not add grading logic to the runner. It should capture evidence, not decide pass/fail.
- Do not publish generated eval run output.

## Open Questions

- Is Bash still the right implementation language once the interface owns structured registry validation and result objects?
- Should `skillFiles` move into registry metadata for common With-Skill Eval calls?
- Should the new runner fail on agent nonzero by default after saving artifacts, or preserve current host-specific behavior?
- Should old `run-codex-fixture-eval.sh` and `run-claude-fixture-eval.sh` remain public entry points or become private adapters?
