# Freeflow Current State

> **Doc ID:** STATE-2026-07-11-freeflow-current
> **Owner:** Hassan Mohiddin
> **Type:** Current State
> **Status:** Current candidate
> **Source:** Live repository, current runtime/tests, package metadata, historical v0.1 acceptance evidence, and archived Output Router evidence.

Freeflow is a portable feedback-based control system for coding agents.

## Product Shape

- Exactly three modes: `conversation`, `workflow`, and `strict-workflow`.
- One Interaction Lifecycle runs from Entry through a Feedback Loop when needed to a Supported Exit.
- The active agent owns understanding, routing, authorized work, factual verification, correction, adjudication, and completion.
- Every interaction carries an outcome-and-effect-scoped authority envelope established by a direct request or still-valid approval; mode, skill selection, usefulness, and new evidence do not widen it.
- Passive observation may support an inquiry. Active evidence generation and mutation or delivery require coverage by the current authority envelope; cumulative effects use the strongest relevant boundary.
- Verification remains active-agent factual work. Independent review is separately selected judgment.
- Specs and Plans receive separate Review Artifact boundaries.
- Working Records preserve living task state across compaction and session navigation without becoming authority.
- Review ends with Pass, Non-blocking, Inconclusive, or Blocking; findings do not authorize edits.
- Repeated or unexplained failure routes to diagnosis before redesign unless direct structural evidence already establishes the cause.

The adaptive candidate remains **Unverified** pending current baseline-vs-with-skill behavioral evaluation.

## Runtime And Configuration

`.freeflow/config.json` is required shared repository activation. Optional `.freeflow/local.json` supplies per-checkout personal core overrides and cannot activate Freeflow alone. Host session mode overrides have highest temporary mode precedence. Pi stores broader core and mode overrides in branch-aware session JSONL; Claude and Codex store mode-only overrides in plugin-owned data keyed by host session ID. Session controls do not mutate either config file.

Invalid existing local core config fails closed, and session enablement cannot bypass missing or invalid repository activation.

When effective, host adapters compose static fragments from `runtime/prompts/` and expose discoverable skills/tools from one effective-state snapshot. Runtime State is appended to every provider invocation with the current mode, capability statuses, and Cognitive Routing Control/Profile.

The Interaction Contract is prompt-only. Skills is the parent gate for Cognitive Routing, Context Virtualization, and Conversation History. Full Workflow and capability bodies are discoverable rather than persistent bootstrap content. Runtime context guides behavior; it does not enforce policy, block tools, grant permissions, or replace repository instructions.

Pi reads config before turns, composes prompt fragments, filters historical bootstrap entries, restores session mode entries, and dynamically exposes normal and effective capability skills/tools. Codex and Claude use one shared runtime hook without full Workflow bootstrap injection; `UserPromptSubmit` emits only for explicit session-mode controls and stays silent on ordinary prompts.

Setup reports automatic delivery as confirmed, unavailable, or unconfirmed and distinguishes same-turn direct reads from adapter execution.

## Skill Surface

The cross-host model surface contains 26 active model/contributor skill packages, including Action Selection. Pi separately provides Cognitive Routing, Context Virtualization, and Conversation History as Skills-gated capabilities outside `skills/`. Static prompt fragments live under `runtime/prompts/`. Output Router is retired from the live package and preserved under `.deprecated/output-router/`; it is no longer discovered, loaded, or registered.

Canonical collaboration and execution skills are `discuss`, `track-work`, and `execute-work`. Pi retains `/discover` and `/execute-plan` as Pi-only compatibility aliases without restoring deleted skill identities.

See `plugin-docs/skill-routing.md` for the typed owner, route, and reference map.

Subject skill bodies contain executing-agent instructions only. Draft, Unverified, Production-Ready, and evidence-gap metadata remain in external eval/report/current-state surfaces.

## Command Surface

Current metadata declares:

- 4 mode commands;
- 19 direct command names: 17 canonical plus 2 Pi-only aliases;
- 3 contributor/setup calls;
- 2 Pi native settings commands.

Freeflow uses host-native skill invocation instead of duplicate manifest command handlers: Claude namespaced slash skills, Codex `/skills` and `$skill` mentions, and Pi registered commands. Claude and Codex additionally use their prompt hook for deterministic session-mode controls.

## Package And Release Boundary

- Repository root is the single source of truth.
- Current package version is `0.5.0`.
- GitHub repository: `hassan-mohiddin/freeflow`.
- npm package: `@hassangameryt/freeflow`.
- Host targets: Codex, Claude Code, and Pi.
- Local Pi/PiFlow development uses a committed exact-revision Freeflow snapshot; it is not a production release or source-precedence mechanism.
- PiFlow owns its host launcher, import, isolated state, update, and upstream synchronization; Freeflow does not ship those tools.
- The npm tarball contains runtime-required files and excludes GitHub-only plugin docs, project docs, `.skill-eval/`, deprecated historical material, and generated eval runs.
- Enforcement hooks and CLI enforcement are not shipped.

The Pi formatter/generated-output contract remains deferred until this worktree is merged into a clean `main`-based worktree. Current bounded runtime changes preserve checked-in generated formatting deliberately.

## Evidence Boundary

Historical v0.1 acceptance reports remain documentary evidence for the released predecessor behavior. They do not verify the current adaptive candidate.

Current deterministic evidence includes:

- layered Pi repository/personal/session config and mode tests;
- Codex/Claude lifecycle hook checks;
- prompt-fragment, Runtime State, capability-gating, and discoverable-skill checks;
- command-surface and model-discovery checks;
- Skill Author structure/dependency tests;
- Evaluate Skill case-schema tests;
- Context Virtualization and Cognitive Routing deterministic extension tests and focused runtime checks.

Use `.skill-eval/` for current skill-evaluation definitions and accepted bundles. Use `.deprecated/skill-evals-v1/` only for historical evidence.

## Known Deferred Work

- Run behavioral activation, first-read, composition, retained-use, and nearby-pressure evals for the revised skills.
- Resolve `/freeflow enable` and `/freeflow disable` repository-versus-personal scope through an explicit product decision.
- Establish the deterministic formatter/generated-output contract after merge.
- Run fresh GitHub-install smoke checks for Codex, Claude, and Pi before the next release.
- Consider enforcement only after measured repeated failures show concise guidance is insufficient.

## Current Completion Boundary

Before freezing the candidate:

1. finish active-skill and durable-surface alignment;
2. pass activation, command, link, structure, focused runtime, and package checks;
3. preserve remaining unsupported behavioral claims as Unverified;
4. update the Working Record and present the final S-015 result for user review.
