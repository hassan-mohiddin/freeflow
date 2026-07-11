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
- activation file path

Do not add version or migration fields without an accepted config-migration requirement.

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

The full mode-contract, workflow, decision-gate, discovery-light guidance, and enabled capability context are loaded by plugin-bundled context hooks or the Pi extension, not by setup copying full skills into repo memory.

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

Freeflow may ship plugin-bundled hooks that load existing mode-contract, workflow, decision-gate, discovery-light, and enabled capability context. These hooks belong to the installed plugin, not the target repo.

They should:

- stay inert until `.freeflow/config.json` exists, parses, and matches the supported setup config shape
- suppress all Freeflow runtime context when top-level `enabled: false`
- load `skills/mode-contract/SKILL.md`, `skills/workflow/SKILL.md`, and `skills/decision-gate/SKILL.md` only when `skills.enabled` is effective
- load discovery-light guidance instead of the full Discover skill only when `skills.enabled` is effective
- load `skills/output-router/SKILL.md` only when output-router is effective
- load `skills/delegation-harness/SKILL.md` only when delegation harness is effective
- state the runtime priority for whichever layers are active
- run on session start for startup, resume, clear, and compact
- report whether setup appears complete or partial once config activates the runtime

They should not:

- run after every edit/write tool call
- block tools
- grant permissions
- enforce mode policy
- create repo-local hook files
- replace setup activation in `AGENTS.md` or `CLAUDE.md`

Setup itself should read the base workflow skills and enabled capability skills and apply discovery-light after successful verification, before its final response, so the current session has the runtime context loaded without a post-tool hook.

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
review-artifact          when independent judgment would materially reduce risk
write-plan               when execution needs ordered slices and checks
```

Discovery interleaves the smallest useful repo, provided-source, and current external evidence with option shaping and targeted questions. It ends in a checkpoint in chat or the narrowest durable artifact. Do not force every task through discovery.

`write-spec` records agreed behavior, boundaries, failure semantics, and acceptance evidence. `write-plan` produces an executable current horizon while later phases remain directional. Later phases are refined from evidence rather than frozen prematurely.

Artifact review is conditional. Findings are evidence for the parent to adjudicate, not instructions that automatically override source truth. Follow-up review should narrow to accepted fixes and stop after three total passes; unresolved disagreement then goes to the owner or is recorded as residual risk.

## Execution And Routing

Execution advances one meaningful slice at a time:

```text
learning slice           answer one named uncertainty
delivery slice           produce accepted observable behavior
deepening slice          improve locality or interface leverage without behavior change
```

`execute-plan` owns lifecycle routing. `tdd` is an optional test-first method for observable behavior; `simplify-code` owns behavior-preserving complexity reduction; `deprecation-and-migration` owns consumer movement and removal proof; `diagnose-failure` owns reproduction and root cause.

After every meaningful slice:

```text
slice -> fresh verification -> route check
```

Continue when evidence supports the accepted route. If evidence invalidates an assumption, preserve valid work and return only the affected layer to discovery, design, spec, planning, execution, diagnosis, review, verification, or the Decision Gate. Do not silently rewrite accepted behavior or patch around an invalid plan.

## Review And Verification

Verification is universal per meaningful slice and proportionate to the claim. It may use tests, typechecks, lint, browser/runtime evidence, logs, screenshots, benchmarks, or other direct evidence. A completion claim must state what was actually proved and what remains unverified.

Independent review is conditional on risk, uncertainty, public surface area, or the value of a fresh judgment. It asks whether the change matches intent, source truth, engineering quality, and risk constraints. Fresh review guidance is mechanism-neutral: use whatever independent context the host can provide without making agent, model, worktree, or parallelism choices part of the skill contract.

Review and verification answer different questions. Either can pass while the other fails. Accepted findings route to the narrowest owning activity; disputed findings are adjudicated against evidence rather than applied performatively.

## Conditional Closeout And Delivery

Closeout steps are selected rather than mandatory:

- `commit-work` creates an authorized, coherent rollback checkpoint without staging unrelated user changes.
- `handoff` preserves evidence and route state when work pauses, compacts, or changes owner. Handoffs are memory, not authority; live repo evidence wins.
- `finish-branch` handles merge, PR, keep, discard, and cleanup choices after the branch is complete and verified.
- `release-work` prepares, publishes, and verifies an immutable versioned consumer artifact.
- `shipping-and-launch` deploys or exposes behavior through an observable, recoverable production rollout.

Release and shipping are distinct. A replacement release may need to precede consumer migration; migration proof must precede a later removal or breaking release. A published release may still require a separately authorized deployment or rollout.

## Cross-Cutting Skills

- `decision-gate`: user-owned decisions, source-truth conflicts, and material path substitutions.
- `design-for-depth`: spreading caller knowledge, states, edge cases, or coordination pressure.
- `diagnose-failure`: bugs, failing tests, regressions, flaky or unclear behavior.
- `bypass`: skip unnecessary ceremony without skipping judgment.
- `mode-contract`: infer or discuss Freeflow modes.

Discovery checkpoints record stable decisions only when they must survive beyond chat; session residue belongs in handoffs or rolling plans. `bypass` defaults to one action and never bypasses user-owned decisions, source-truth conflicts, risky checks, or verification.

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

- `setup-freeflow` has focused setup evals for Codex and Claude activation shapes.
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
- Context-loading hooks and the Pi extension stay inert until `.freeflow/config.json` exists, parses, and matches the supported setup config shape, then load enabled mode-contract, workflow, decision-gate, discovery-light, and capability context.
- Setup reads base workflow context and enabled capability context, then applies discovery-light after successful setup verification for same-session use.
- Enforcement hooks remain deferred until skill behavior and evals prove mechanical enforcement is needed.

Do not add more references, scripts, examples, or assets merely because a skill is broad. Add them only when they keep active guidance focused, reduce repeated deterministic work, or prevent a measured behavior failure.

## Open Implementation Work

1. Finish the evaluator architecture.
2. Run baseline-vs-with-skill evaluation for revised and new skills, including activation and composition pressure cases.
3. Run deferred Claude and cross-host install smoke checks when preparing the next release.

Do not add enforcement hooks before measured behavior shows where mechanical enforcement is needed.
