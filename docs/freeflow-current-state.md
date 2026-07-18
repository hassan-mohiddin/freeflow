# Freeflow Current State

> **Doc ID:** STATE-2026-07-11-freeflow-current
> **Owner:** Hassan Mohiddin
> **Type:** Current State
> **Status:** Current candidate
> **Source:** Live repository, current runtime/tests, package metadata, historical v0.1 acceptance evidence, and current router evidence.

Freeflow is a portable feedback-based control system for coding agents.

## Product Shape

- Exactly three modes: `conversation`, `workflow`, and `strict-workflow`.
- One Interaction Lifecycle runs from Entry through a Feedback Loop when needed to a Supported Exit.
- The active agent owns understanding, routing, authorized work, factual verification, correction, adjudication, and completion.
- Verification remains active-agent factual work. Independent review is separately selected judgment.
- Specs and Plans receive separate Review Artifact boundaries.
- Working Records preserve living task state across compaction and session navigation without becoming authority.
- Review ends with Pass, Non-blocking, Inconclusive, or Blocking; findings do not authorize edits.
- Repeated or unexplained failure routes to diagnosis before redesign unless direct structural evidence already establishes the cause.

The adaptive candidate remains **Unverified** pending current baseline-vs-with-skill behavioral evaluation.

## Runtime And Configuration

`.freeflow/config.json` is required shared repository activation. Optional `.freeflow/local.json` supplies per-checkout personal core overrides and cannot activate Freeflow alone. A Pi session mode override has highest temporary mode precedence.

Invalid existing local core config fails closed.

When effective, host adapters deliver:

- `runtime/interaction-contract.md` as compact interaction guidance;
- one `skills/workflow/SKILL.md` session bootstrap while Skills are effective;
- compact active/dormant mode and capability state;
- effective optional capability context.

The Interaction Contract is the only compact interaction-guidance artifact. Interaction Contract and Skills are independently resolved switches. Runtime context guides behavior; it does not enforce policy, block tools, grant permissions, or replace repository instructions.

Pi reads config before turns, appends effective compact context, stores Workflow as one hidden persistent message, restores session mode entries, and dynamically exposes model skills. Codex and Claude use packaged lifecycle hooks at supported start, resume, clear, and compact boundaries.

Setup reports automatic delivery as confirmed, unavailable, or unconfirmed and distinguishes same-turn direct reads from adapter execution.

## Skill Surface

The package contains 27 skill packages:

- 25 active model/contributor skills;
- Output Router as an optional separately gated runtime capability;
- Delegation Harness as deprecated compatibility state, not offered by Setup or exposed through active model discovery.

Canonical collaboration and execution skills are `discuss`, `track-work`, and `execute-work`. Pi retains `/discover` and `/execute-plan` as Pi-only compatibility aliases without restoring deleted skill identities.

See `plugin-docs/skill-routing.md` for the typed owner, route, and reference map.

Subject skill bodies contain executing-agent instructions only. Draft, Unverified, Production-Ready, and evidence-gap metadata remain in external eval/report/current-state surfaces.

## Command Surface

Current metadata declares:

- 4 mode commands;
- 19 direct command names: 17 canonical plus 2 Pi-only aliases;
- 3 contributor/setup calls;
- 3 Pi native settings commands.

Codex and Claude have no native Freeflow slash handlers. Pi registers direct commands through its extension.

## Package And Release Boundary

- Repository root is the single source of truth.
- Current package version is `0.3.0`.
- GitHub repository: `hassan-mohiddin/freeflow`.
- npm package: `@hassangameryt/freeflow`.
- Host targets: Codex, Claude Code, and Pi.
- The npm tarball contains runtime-required files and excludes GitHub-only plugin docs, project docs, `.skill-eval/`, router eval evidence, deprecated historical material, and generated eval runs.
- Enforcement hooks and CLI enforcement are not shipped.

The Pi formatter/generated-output contract remains deferred until this worktree is merged into a clean `main`-based worktree. Current bounded runtime changes preserve checked-in generated formatting deliberately.

## Evidence Boundary

Historical v0.1 acceptance reports remain documentary evidence for the released predecessor behavior. They do not verify the current adaptive candidate.

Current deterministic evidence includes:

- layered Pi repository/personal/session config and mode tests;
- Codex/Claude lifecycle hook checks;
- canonical Workflow-bootstrap delivery checks;
- command-surface and model-discovery checks;
- Skill Author structure/dependency tests;
- Evaluate Skill case-schema tests;
- router retrieval, command-output, observed-routing, storage, transform, and sandbox reports under `router/evals/reports/`.

Use `.skill-eval/` for current skill-evaluation definitions and accepted bundles. Use `deprecated/skill-evals-v1/` only for historical evidence.

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
