# Freeflow Runtime And Lifecycle

## Purpose

This document describes how Freeflow should behave after the first draft skill pack exists.

It covers:

- host agent modes versus Freeflow modes
- first-run setup
- mode persistence
- planning and execution lifecycle
- branching and re-entry
- missing runtime skills

This is architecture context, not an implementation plan.

## Host Modes Versus Freeflow Modes

Freeflow does not replace the host agent runtime.

Claude, Codex, and similar agents have their own permission modes. These control what tools the agent may use: read-only analysis, auto-editing, command approval, sandboxing, and full-access behavior.

Freeflow modes control workflow pressure:

- `conversation`: discussion, critique, explanation, exploration.
- `workflow`: normal consequential work.
- `strict-workflow`: high-risk or hard-to-reverse work.

Host modes answer:

> What can the agent do with tools?

Freeflow modes answer:

> How much workflow discipline should the agent apply?

For Freeflow tasks, the user should normally run the host agent in an edit-capable normal mode, not the host's native plan mode. Native plan modes are useful for safe read-only exploration, but Freeflow provides the planning lifecycle: discovery, specs, reviews, plans, execution, verification, and handoff.

Freeflow should not depend on host plan mode. It should work in Codex, Claude Code, and similar tools as a portable workflow layer.

## Setup

Freeflow needs a first-run setup flow.

Setup should be fast by default and only interview the user when there is a real decision.

Default setup creates:

```text
.freeflow/config.json
```

with:

```json
{
  "defaultMode": "workflow"
}
```

Minimal setup should not add any other config fields.

Optional evidence-routing config (`outputRouter`, `observedRouting`, `scriptTransform`) may be added only after the setup evidence-routing/script-execution decision point or an explicit request for generated-path hints, output thresholds, vault settings, native safety-net routing, observed MCP/web/fetch/code-search routing, or script-transform adapters. Missing optional sections means built-in defaults, not a warning. Native safety-net routing remains off unless explicitly requested and supported; observed routing handles configured MCP/web/fetch/code-search output after host execution.

Do not store:

- current mode
- current task
- current phase
- file inventories
- active plans
- version metadata
- activation file path

Version and migration fields can be added when Freeflow is close to shipping.

## Agent Instruction File

Setup should add the compact always-on runtime contract from `skills/setup-freeflow/references/activation-contract.md` to the host agent's repo instruction file.

Target file rules:

- If only `AGENTS.md` exists, update it.
- If only `CLAUDE.md` exists, update `CLAUDE.md` and import `.claude/rules/freeflow-core.md`.
- If both exist and the host target is obvious, update the host-relevant file.
- If both exist and the target is ambiguous, ask.
- If neither exists, ask which one to create.
- Update both only when the user asks for multi-agent setup.

If the user wants both files updated, explain the tradeoff:

- better activation across agents
- more drift risk

Codex setup should put Freeflow behavior in `AGENTS.md`, not `.codex/rules/*.rules`. Codex rules are shell approval/security policy, not model memory.

Claude setup should use `CLAUDE.md` plus an explicit import:

```md
## Freeflow

@.claude/rules/freeflow-core.md
```

The always-on text should stay compact because users often keep agent instruction files short and already have their own rules. Do not duplicate the full block in docs; use `activation-contract.md` as the source of truth and run `evals/scripts/check-activation-contract.sh` after changes.

Do not list the whole workflow or every mode in the activation block.

The full mode-contract, workflow, interview-gate, and output-router skills plus discovery-light guidance are loaded by plugin-bundled context hooks, not by setup copying full skills into repo memory.

Placement matters:

- Update an existing `## Freeflow` block in place.
- Otherwise place near existing agent skill/workflow sections when present.
- Otherwise append near the end.
- Do not place it above stronger repo-specific rules.
- Do not duplicate it.

## Context Files

Setup should not create an empty `CONTEXT.md`.

`CONTEXT.md` is domain language memory, not plugin state. Create or update it only when there is real glossary or context content to capture.

If `CONTEXT.md` exists, setup may note that Freeflow skills can use it. Do not fill it with generic Freeflow instructions.

ADRs remain reserved for hard-to-reverse, surprising, tradeoff-driven decisions.

## Runtime Context Hooks

Freeflow may ship plugin-bundled hooks that load existing mode-contract, workflow, interview-gate, discovery-light, and output-router context. These hooks belong to the installed plugin, not the target repo.

They should:

- load `skills/mode-contract/SKILL.md`
- load `skills/workflow/SKILL.md`
- load `skills/interview-gate/SKILL.md`
- load discovery-light guidance instead of the full Discover skill
- load `skills/output-router/SKILL.md`
- state the runtime priority: mode-contract handles mode issues first, workflow classifies, interview-gate stops silent decisions, discovery-light handles context-building, output-router chooses evidence transport
- run on session start for startup, resume, clear, and compact
- report whether setup appears complete, partial, or missing

They should not:

- run after every edit/write tool call
- block tools
- grant permissions
- enforce mode policy
- create repo-local hook files
- replace setup activation in `AGENTS.md` or `CLAUDE.md`

Setup itself should read the mode-contract, workflow, interview-gate, and output-router skills and apply discovery-light after successful verification, before its final response, so the current session has the runtime context loaded without a post-tool hook.

## Existing Rule Conflicts

Existing repo instructions are source truth.

If setup finds instructions that conflict with Freeflow's core behavior, it must name the conflict and ask.

Example conflict:

```text
Never ask questions. Always make a best guess and implement.
```

That conflicts with the interview gate. Setup should not silently rewrite it or pretend Freeflow can fully operate under it.

The user decides whether to:

- install Freeflow as advisory
- revise the conflicting rule
- skip setup

## Mode Persistence

Mode switches are task/conversation scoped by default.

Examples:

```text
/workflow conversation
/workflow workflow
/workflow strict-workflow
```

These apply to the current task or conversation unless the user explicitly asks to persist them.

Persisting requires explicit wording such as:

```text
Make strict-workflow the default for this repo.
```

Then setup or mode handling may update:

```json
{
  "defaultMode": "strict-workflow"
}
```

Do not write a persistent current-mode state file by default. That creates leakage risk: a strict mode chosen for one task can affect unrelated future work.

## Planning Phase

Planning decides what to build and how to build it.

It includes:

```text
discover
write-spec
review-artifact
write-plan
review-artifact
```

Discovery is the larger context-shaping unit. It interleaves evidence gathering, codebase exploration, external-source checking, brainstorming, targeted questions, and decision checkpointing before spec, plan, build, or durable memory. `/discover` is the direct route.

Discovery gathers evidence from the repo, provided sources, and current external sources when needed. It can be quick or deep. It ends in a checkpoint: chat for short-lived work, or the narrowest owning artifact when later work must rely on it.

Branching is normal. A conversation may fork into deeper discovery, return with a checkpoint and handoff, then continue the original direction-setting thread.

After enough context exists, `write-spec` converts the conversation and evidence into a durable artifact describing what should be built, what decisions were made, what was rejected, and what constraints matter.

`review-artifact` then checks whether the spec is fit to guide work. It should catch contradictions, missing owner decisions, unclear scope, or conflicts with live evidence.

`write-plan` converts the approved spec into an implementation plan. The plan explains how the work will be built: slices, files, tests, verification, and checkpoints.

Plans deserve review because they combine discovery, decisions, and specs into concrete execution. A bad plan can carry earlier cracks into implementation.

If review finds a real issue, the agent should not blindly fix and re-review in a loop. It should classify the issue, inspect evidence, use `review-work` or a fresh reviewer when useful, and fire the interview gate when the correction requires a user-owned decision.

Backward movement is expected:

```text
plan review -> spec revision -> plan revision -> final review
```

The planning phase is complete when the plan is reviewed enough to guide execution.

## Execution Phase

Execution does the work and proves it.

It includes:

```text
execute-plan
review-work
verify-work
commit-work
handoff
```

`execute-plan` should not rewrite the plan opportunistically. It should execute the fixed scope in vertical slices.

When execution discovers a new gap, source-truth conflict, impossible step, or hidden scope, it should stop and re-enter the workflow:

```text
execution -> interview-gate -> revise spec/plan or continue
```

Most workflow failures show up during execution. Good planning reduces this, but cannot eliminate it.

## Review And Verification

Review and verification are the execution closeout.

They are different checks and both must pass for consequential work.

`review-work` asks:

> Does the diff match the intent and engineering quality?

It checks scope, source truth, maintainability, architecture, risk, and whether the work actually matches the spec and plan.

`verify-work` asks:

> What fresh evidence shows this works?

It checks test output, typecheck output, lint output, browser checks, logs, screenshots, or other direct evidence.

Either can pass while the other fails.

Examples:

- Tests pass, but review fails because the implementation hardcodes billing policy or violates architecture.
- Review looks good, but verification fails because the test suite or browser check fails.

Completion claims require both review confidence and verification evidence when the work is consequential.

## Commit And Handoff

After successful execution, review, and verification, the work should be committed.

Freeflow has a first `commit-work` skill for the lightweight closeout guard.

That skill should cover:

- checking the staged/untracked diff
- ensuring unrelated user changes are not included accidentally
- writing useful commit messages
- referencing specs, plans, or decisions when useful
- respecting pre-commit/lint/test failures
- keeping commits small enough to debug and roll back

Orchestra had useful prior art around commit discipline and references, but Freeflow should avoid importing heavy machinery before behavior is proven.

After commit, create a handoff when continuity matters.

Handoff destination depends on use:

- temp handoff: immediate continuation after compaction or fresh chat
- memory handoff: durable project memory for future sessions

Handoffs are memory, not authority. Live repo evidence overrides stale handoff text.

## Cross-Cutting Skills

Some skills can fire in either planning or execution:

- `interview-gate`: user-owned decisions, ambiguity, source-truth conflicts, path conflicts.
- `diagnose-failure`: bugs, failing tests, regressions, unexpected behavior.
- `bypass`: skip unnecessary ceremony without skipping judgment.
- `mode-contract`: infer or discuss Freeflow modes.

`diagnose-failure` can be part of planning when discovery reveals a bug-like unknown, and part of execution when implementation or verification fails.

Discovery checkpoints record stable decisions only when they must survive beyond chat; session residue belongs in handoffs or plans.

`bypass` defaults to one action and never bypasses user-owned decisions, source-truth conflicts, risky domains, or verification.

## Developer Meta Skills

Freeflow includes developer-only or contributor-facing skills:

- `setup-freeflow`
- `write-skill`
- `evaluate-skill`

`setup-freeflow` installs the compact always-on runtime contract and minimal `.freeflow/config.json`; it can also add optional `outputRouter` config when explicitly requested.

`write-skill` encodes Freeflow's skill style:

- Matt-style concise pressure
- Obra-style phase boundaries
- Anthropic-style skill structure and progressive disclosure
- eval-backed iteration

`evaluate-skill` encodes Freeflow's eval loop:

```text
failure scenario -> baseline eval -> with-skill eval -> skill revision -> rerun
```

Many real agent failures should become evals. When an agent skips a phase, silently decides, ignores source truth, or mishandles ambiguity, that scenario can become a fixture or prompt eval.

These skills should not encourage end users to mutate core Freeflow skills casually. They are mainly for Freeflow contributors and developers creating their own skill packs.

Current evidence:

- `setup-freeflow` has focused setup evals for Codex and Claude activation shapes.
- `write-skill` has behavior and direct command evals showing that production-ready pressure must not overbuild skill folders.
- `evaluate-skill` has behavior and direct command evals showing that shortcut wording must not skip creating or updating an eval artifact before skill edits.
- Command-surface coverage is being updated for the discover migration. The current registry has 4 mode commands, 12 direct skill calls, and 3 developer skill calls. See `evals/reports/by-command-surface/command-surface-matrix.md`.
- The fixture harness supports Codex by default and Claude through `FREEFLOW_FIXTURE_AGENT=claude`; live Claude runs still require local Claude auth and are not active release blockers for Hassan's local Codex-first testing.

## Current Pack Readiness

The current development plugin has enough local Codex fixture evidence to start dogfooding in Hassan's other repos.

The local-only v0.1 acceptance suite passed after measured fixes in `evals/reports/acceptance/v0.1-acceptance-report.md`. The public marketplace repo now points both Codex and Claude at the single runtime under the repo root. Live Claude smoke evals and GitHub-install smoke tests are still deferred.

Current packaging shape:

- 18 active skills under `skills/`; deprecated skills live under root `deprecated/skills/` and are not part of the runtime skill surface.
- Single plugin runtime under the repo root, including skills, context hooks, manifests, evals, command-surface metadata, and refined plugin docs.
- Every `SKILL.md` is under the 100-line project budget.
- Extra reference files exist only where targeted evals or complexity justified progressive disclosure.
- Native slash handlers remain disabled; commands are model-routed through skill activation.
- Context-loading hooks are shipped to load mode-contract, workflow, interview-gate, discovery-light, and output-router context at session start.
- Setup reads mode-contract, workflow, interview-gate, and output-router context and applies discovery-light after successful setup verification for same-session use.
- Enforcement hooks remain deferred until skill behavior and evals prove mechanical enforcement is needed.

Reference-file additions from the reference-stack pass have landed. Do not add more references, scripts, examples, or assets merely because a skill is broad. Add them only when they keep the active `SKILL.md` short, reduce repeated deterministic work, or prevent a measured behavior failure.

## Open Implementation Work

Deferred validation work:

1. Run Claude paired smoke evals after local Claude auth is available.
2. Add stronger coverage only where real skill failures appear.

Do not add enforcement hooks yet.

Enforcement hooks should come after skill behavior and evals show where mechanical enforcement is needed.
