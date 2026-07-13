# Freeflow Runtime And Lifecycle

## Purpose

This document describes Freeflow's current runtime boundary and adaptive lifecycle.

It covers:

- host agent modes versus Freeflow modes
- first-run setup
- mode persistence
- planning and execution lifecycle
- branching and backward routing
- runtime context and capability boundaries

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

Setup should be fast by default and ask the user only when there is a real decision.

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

Optional repo runtime toggles (`enabled`, `skills.enabled`) and evidence-routing config (`outputRouter`, `observedRouting`, `scriptTransform`) may be added only after the setup evidence-routing/script-execution decision point, a `/freeflow` settings change, or an explicit request for generated-path hints, output thresholds, vault settings, native safety-net routing, observed MCP/web/fetch/code-search routing, or script-transform adapters. Missing `enabled` and `skills.enabled` means enabled only after this config file exists, parses, and matches the supported setup config shape. Missing optional routing sections means built-in defaults, not a warning. Native safety-net routing remains off unless explicitly requested and supported; observed routing handles configured MCP/web/fetch/code-search output after host execution.

Do not store:

- current mode
- current task
- current phase
- file inventories
- active plans
- version metadata

Do not add version fields without an accepted compatibility requirement.

## Activation Boundary And Host Instructions

`.freeflow/config.json` is the sole repo activation boundary. The canonical contract lives in `skills/setup-freeflow/references/activation-contract.md`.

Setup does not create or modify Freeflow text in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, or `.codex/rules/`. Those files remain repo-owned instructions, not activation markers.

A valid config proves repo activation. It does not prove runtime delivery. The current host must have an installed and trusted adapter that loads `skills/decision-gate/references/runtime-kernel.md` as system context and the full `skills/workflow/SKILL.md` once into session context.

Setup should report runtime delivery separately as confirmed, unavailable, or unconfirmed. For Codex and Claude, host trust and hook registration remain visible through host hook/plugin status. If the adapter is absent, disabled, denied, unsupported, or cannot be verified, say so rather than copying the kernel into repo instructions.

Existing repo instructions are still source truth. Inspect them when they may conflict with Freeflow behavior, and ask before enabling a path that would silently contradict them.

## Context Files

Setup should not create an empty `CONTEXT.md`.

`CONTEXT.md` is domain language memory, not plugin state. Create or update it only when there is real glossary or context content to capture.

If `CONTEXT.md` exists, setup may note that Freeflow skills can use it. Do not fill it with generic Freeflow instructions.

ADRs remain reserved for hard-to-reverse, surprising, tradeoff-driven decisions.

## Runtime Context Hooks

Freeflow ships one canonical compact runtime kernel plus a first-turn Workflow bootstrap through host adapters. The kernel routes mode-setting, reset, inference, or discussion to the full Mode Contract on demand. Codex and Claude use the plugin-bundled lifecycle hook; Pi uses `before_agent_start`, appends the kernel to the existing system prompt, and stores Workflow as a hidden persistent custom message.

Adapters should:

- stay inert until `.freeflow/config.json` exists, parses, and matches the supported setup config shape
- treat config as the only activation boundary
- suppress all Freeflow runtime context when top-level `enabled: false`
- load `skills/decision-gate/references/runtime-kernel.md` only when `skills.enabled` is effective
- load the full `skills/workflow/SKILL.md` on the first turn, including a conversational greeting
- avoid duplicating Workflow while its stable bootstrap marker remains in active session context
- allow later Workflow reads through normal progressive disclosure
- keep full `mode-contract`, `decision-gate`, `discover`, and other skills available on demand
- load `skills/output-router/SKILL.md` only when Output Router is effective
- load `skills/delegation-harness/SKILL.md` only when Delegation Harness is effective
- run on session start for startup, resume, clear, and compact in Codex/Claude
- refresh and append effective system context before every Pi agent turn while keeping the full Workflow body in persistent session context

They should not:

- run after every edit/write tool call
- block tools
- grant permissions
- enforce mode policy
- create repo-local hook files
- read host instruction files as activation markers
- replace or rewrite the existing system prompt

After successful verification, setup itself should read and apply the canonical kernel, full Workflow skill, and any capability skill effective in the resulting config so the current setup session can continue consistently. If automatic delivery begins only at a lifecycle boundary, setup should report the required reload and classify delivery as confirmed, unavailable, or unconfirmed.

## Existing Rule Conflicts

Existing repo instructions are source truth.

If setup finds instructions that conflict with Freeflow's core behavior, it must name the conflict and ask.

Example conflict:

```text
Never ask questions. Always make a best guess and implement.
```

That conflicts with the decision gate. Setup should not silently rewrite it or pretend Freeflow can fully operate under it.

The user decides whether to:

- install Freeflow as advisory
- revise the conflicting rule
- skip setup

## Mode Persistence

Mode switches are task/conversation scoped by default.

Examples:

```text
/freeflow mode conversation
/freeflow mode workflow
/freeflow mode strict-workflow
/freeflow mode reset
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

## Planning And Discovery

Planning is conditional and rolling. Enter the narrowest activity that resolves the current uncertainty:

```text
discover                 when the option space or intended outcome is unclear
write-spec               when behavior or acceptance needs a durable contract
review-artifact          for the standing consequential spec/plan review or another authorized formal review
write-plan               when execution needs ordered slices and checks
```

Discovery interleaves the smallest useful repo, provided-source, and current external evidence with option shaping and targeted questions. It ends in a checkpoint in chat or the narrowest durable artifact. Do not force every task through discovery.

`write-spec` records agreed behavior, boundaries, failure semantics, and acceptance evidence. `write-plan` produces an executable current horizon while later phases remain directional. Later phases are refined from evidence rather than frozen prematurely.

A consequential durable artifact phase receives the standing route selected by `write-spec`: one combined spec-then-plan review, separate spec and plan reviews for high-risk spec-first approval, or spec-only review. A plan without a spec receives its own standing review. These selected artifact reviews need no reconfirmation. Findings are evidence to adjudicate, not instructions that override source truth. One narrow confirmation requires scoped authorization and accepted blockers that need reinspection; a third pass is exceptional, owner-selected, and terminal.

## Execution And Routing

Execution advances one meaningful slice at a time:

```text
learning slice           answer one named uncertainty
delivery slice           produce accepted observable behavior
deepening slice          improve locality or interface leverage without behavior change
```

`execute-plan` owns lifecycle routing. `tdd` is an optional test-first method for observable behavior; `simplify-code` owns behavior-preserving complexity reduction; `migration-work` owns consumer movement and removal proof; `diagnose-failure` owns reproduction and root cause.

After every meaningful slice:

```text
slice -> sequential self-check: self-verification -> if supported, self-review once -> route check
```

Kernel/Workflow provide one basic sequential self-check: self-verification first, then self-review only when evidence supports the outcome. Review/verify skills may enhance those methods inline after any meaningful slice without creating independence. Correct local reversible mistakes directly, and route repeated or unexplained failure to diagnosis before redesign. If evidence invalidates an assumption, preserve valid work and return only the affected layer to discovery, spec, planning, execution, diagnosis, design, formal review, verification, or the Decision Gate.

## Review And Verification

Self-verification is universal per meaningful slice and proportionate to the claim. It may use tests, typechecks, lint, browser/runtime evidence, logs, screenshots, benchmarks, or other direct evidence. `verify-work` may enhance it after any slice; `review-work` or `review-artifact` may enhance self-review. Reading these skills never implies another agent.

Standing final assurance uses three distinct contexts. After the sequential final self-check, freeze one implementation state and dispatch a fresh verifier plus a different fresh reviewer in parallel. Neither consumes the other's output; collect factual verifier evidence and reviewer judgment before adjudicating.

The artifact reviewer and parallel final verifier/reviewer need no reconfirmation. Any extra independent context requires scoped authorization. Completion needs verifier Pass plus resolved review for the same unchanged state. Any code change stales both results; self-check the fix and ask before redispatch.

## Conditional Closeout And Delivery

Closeout steps are selected rather than mandatory:

- `commit-work` creates an authorized, coherent rollback checkpoint without staging unrelated user changes.
- `handoff` preserves evidence and route state when work pauses, compacts, or changes owner. Handoffs are memory, not authority; live repo evidence wins.
- `finish-branch` handles merge, PR, keep, discard, and cleanup choices after the branch is complete and verified.
- `release-work` prepares, publishes, and verifies an immutable versioned consumer artifact.
- `launch-work` deploys or exposes behavior through an observable, recoverable production rollout.

Release and shipping are distinct. A replacement release may need to precede consumer migration; migration proof must precede a later removal or breaking release. A published release may still require a separately authorized deployment or rollout.

## Cross-Cutting Skills

- `decision-gate`: user-owned decisions, source-truth conflicts, and material path substitutions.
- `design-for-depth`: spreading caller knowledge, states, edge cases, or coordination pressure.
- `diagnose-failure`: bugs, failing tests, regressions, flaky or unclear behavior.
- `bypass`: skip unnecessary ceremony without skipping judgment.
- `mode-contract`: infer or discuss Freeflow modes.

Discovery checkpoints record stable decisions only when they must survive beyond chat; session residue belongs in handoffs or rolling plans. `bypass` defaults to one action and never bypasses user-owned decisions, source conflicts, self-verification, or standing artifact/final assurance when claiming readiness or completion.

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

Current evidence inventory (historical behavior reports do not verify revised skills until rerun):

- `setup-freeflow` has registered config-only and runtime-delivery fixture definitions for Codex and Claude; they remain Unverified, and earlier host-file setup reports are historical.
- `write-skill` has behavior and direct command evals showing that production-ready pressure must not overbuild skill folders.
- `evaluate-skill` has behavior and direct command evals showing that shortcut wording must not skip creating or updating an eval artifact before skill edits.
- Command-surface coverage is current for the direct Freeflow routes. The current registry has 4 mode commands, 16 direct skill calls, 3 developer skill calls, and 3 Pi native settings commands. See `evals/reports/by-command-surface/command-surface-matrix.md`.
- The fixture harness supports Codex by default and Claude through `FREEFLOW_FIXTURE_AGENT=claude`; live Claude runs still require local Claude auth and are not active release blockers for Hassan's local Codex-first testing.

## Current Pack Readiness

The published workflow and runtime retain historical fixture and deterministic evidence. The current 26-skill adaptive snapshot is structurally integrated but remains Unverified pending behavioral evaluation. It may be dogfooded only with that limitation explicit.

Current packaging shape:

- 26 active skills under `skills/`; deprecated skills live under root `deprecated/skills/` and are outside the runtime skill surface.
- Single plugin runtime under the repo root, including skills, context hooks, manifests, evals, command-surface metadata, and refined plugin docs.
- Active skill files stay behavior-focused; conditional depth lives in references where it prevents repetition or measured failure.
- Codex and Claude slash-style calls remain model-routed. Pi registers the direct and developer calls in `command-surface.json` plus native settings commands.
- Context-loading hooks and the Pi extension stay inert until `.freeflow/config.json` exists, parses, and matches the supported setup config shape, then load the canonical compact kernel and independently enabled capability context.
- Setup reads and applies the canonical kernel plus any capability skill effective after setup for same-session use, while reporting host runtime delivery separately.
- Enforcement hooks remain deferred until skill behavior and evals prove mechanical enforcement is needed.

Do not add more references, scripts, examples, or assets merely because a skill is broad. Add them only when they keep active guidance focused, reduce repeated deterministic work, or prevent a measured behavior failure.

## Open Implementation Work

1. Finish the evaluator architecture.
2. Run baseline-vs-with-skill evaluation for revised and new skills, including activation and composition pressure cases.
3. Run deferred Claude and cross-host install smoke checks when preparing the next release.

Do not add enforcement hooks before measured behavior shows where mechanical enforcement is needed.
