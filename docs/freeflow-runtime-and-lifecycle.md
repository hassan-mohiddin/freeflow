# Freeflow Runtime And Lifecycle

## Purpose

This document describes the current runtime boundary and adaptive control model. It is architecture context, not an implementation plan.

## Product Boundary

Freeflow is a portable feedback-based control system for coding agents. Host runtimes still own tools, sandboxing, permissions, and approvals. Freeflow controls interaction interpretation, workflow pressure, routing, evidence, review selection, task memory, and completion claims.

It has exactly three modes:

- `conversation`: discussion, exploration, and passive inspection of existing evidence without exercising target behavior or intentionally changing task state;
- `workflow`: active evidence generation and normal consequential or mutating work;
- `strict-workflow`: stronger decision, evidence, and checkpoint pressure at high-risk boundaries.

Task shape does not silently switch mode. Host permission modes remain separate.

Each interaction carries an authority envelope: requested outcome, permitted effects, evidence boundary, and stop condition. Passive observation inspects existing evidence or sources without exercising target behavior or intentionally changing task state. Active evidence generation exercises target behavior to produce new evidence; mutation or delivery changes repository, durable task or session, or external state. Effects are cumulative, so the strongest relevant authority and mode boundary applies. Mode, skill selection, useful follow-on work, and new evidence do not widen the envelope.

## Layered Configuration

`.freeflow/config.json` is required shared repository activation. Minimal activation is:

```json
{
  "defaultMode": "workflow"
}
```

`.freeflow/local.json` is optional per-checkout personal core state. It cannot activate Freeflow without valid repository config.

Core mode precedence is:

```text
host session mode override -> personal override -> repository value -> built-in default
```

Pi session overrides can temporarily change Freeflow master enablement, Interaction Contract, Skills, and mode in branch-aware Pi session JSONL. Claude and Codex support mode-only session overrides in plugin-owned data keyed by the host session ID. No session override mutates config files or bypasses missing or invalid repository activation. An invalid existing local core layer fails closed instead of silently inheriting repository values.

The Interaction Contract may resolve independently. Skills is the parent gate for the Pi-only Cognitive Routing, Context Virtualization, and Conversation History capabilities; their settings are unavailable while Skills is ineffective. A mode remains resolved but dormant while Skills are ineffective. Effective-state resolution enforces this relationship independently of the settings UI.

Do not store task state, active slices, Plans, current session overrides, file inventories, or generated workflow instructions in config.

## Activation Versus Delivery

Valid repository config establishes activation state. It does not prove that a host adapter delivered model context.

Setup reports automatic delivery as:

- **confirmed:** trustworthy current-host evidence shows delivery;
- **unavailable:** the adapter is absent, disabled, denied, untrusted, or unsupported;
- **unconfirmed:** installation may exist but current execution cannot be established.

Setup does not generate Freeflow blocks in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.codex/rules/`, or another repository instruction surface. Existing instructions remain source truth and may create a Decision Gate when they conflict with requested behavior.

## Model-Facing Runtime Layers

Freeflow separates model-facing delivery into three layers:

1. **Stable prompt fragments:** `runtime/prompts/` owns core guidance, mode semantics, Interaction Contract, shared terminology, the three nested loops, Workflow and Action Selection cues, Supported Exit, and compact child-capability cues.
2. **Runtime State:** an extension-generated message is appended to every provider invocation with current default/active mode, effective capability statuses, and Cognitive Routing Control/Profile. It is present even when Freeflow is disabled or unconfigured and is not system-prompt policy.
3. **Discoverable skills:** normal skills under `skills/` are exposed when Skills is effective; child capability skills under `capabilities/` are exposed only when Skills and the child capability are effective.

Interaction Contract is prompt-only and not discoverable. Full Workflow (`skills/workflow/SKILL.md`), Action Selection, Cognitive Routing, Context Virtualization, and Conversation History bodies are discoverable methods, not always-injected system context. Runtime adapters load and gate content; they do not enforce policy, block tools, grant permissions, or replace repository instructions.

## Host Lifecycle

### Codex And Claude

The packaged runtime hook uses event-specific outputs over one shared state resolver. It reads static fragments from `runtime/prompts/`, delivering core, Interaction Contract, and Skills fragments when their effective gates apply; it no longer injects a full Workflow bootstrap. `UserPromptSubmit` handles only explicit native or conservative natural-language session-mode controls, updates plugin-owned state before that same request, and emits a compact mode delta. On Claude, synchronous `SessionEnd(reason="clear")` stages the active override as a host-process-and-workspace-scoped, one-shot handoff for the immediately following `SessionStart(source="clear")`; the handoff expires after one minute, is atomically claimed, and is discarded when invalid or stale. Codex currently reports only `SessionEnd(reason="other")`, so it continues to restore clear state by the host session identifier. Ordinary prompts emit nothing.

The hook remains inert without valid repository activation, fails closed on invalid personal core state, preserves the host's existing context, and never inspects, reports, or injects Pi-only capabilities. Session state survives lifecycle restoration, is isolated by hashed host/session identity, and expires through bounded cleanup rather than repository files.

### Pi

The Pi extension reads both config layers before agent turns. It:

- composes capability-gated static fragments from `runtime/prompts/` during `before_agent_start`;
- appends one unified volatile `Freeflow Runtime State` message before every provider request with the current default/active mode, effective capabilities, and Cognitive Routing `Control`/`Profile`;
- exposes normal `skills/` packages when Skills is effective and child capability `SKILL.md` packages only when their parent and child gates are effective;
- exposes capability tool operations from the same effective-state snapshot;
- filters historical one-time bootstrap entries without creating new ones;
- restores temporary mode from Pi session entries and refreshes state at session start and compaction.

`/freeflow settings` edits personal core overrides. `/freeflow settings session` manages branch-aware Pi session overrides for Freeflow, Interaction Contract, Skills, and mode without changing config files. `/freeflow settings repo` edits shared repository settings. `/freeflow mode` remains the direct temporary mode control.

## Same-Turn Setup

A config written during setup is visible to later runtime lifecycle calls, not retroactively to an adapter invocation that already occurred.

After successful setup verification, Setup reads newly effective prompt fragments and discoverable skills directly for the remainder of the setup turn. It reports those direct reads separately from automatic delivery and names any required reload, resume, clear, compact, or next-turn boundary.

## Interaction Lifecycle

One user turn or new evidence begins an Interaction Lifecycle:

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

At Entry, the Interaction Contract interprets the whole user turn and Workflow establishes the current authority envelope from it and any still-valid prior approval. Entry may route directly to an answer, wait, deferment, or stop. When work is needed, Workflow selects the narrowest owning skill without widening that envelope.

The Feedback Loop applies to every bounded activity, including a whole task, slice, subtask, artifact revision, or small local change:

```text
orient to accepted intent, task memory, and live evidence
-> use the owning skill
-> when an environment action branches, use Action Selection
-> implement, discuss, test, or observe
-> verify what the evidence proves
-> once initially supported, self-review the resulting state
-> only then accept, reuse, or claim that activity complete
-> continue, correct, diagnose, revise, ask, defer, or stop
```

Preserve valid work. Re-enter only the activity whose responsibility changed. Repeated or unexplained failure routes to diagnosis before redesign unless direct structural evidence already establishes the cause.

## Discussion, Artifacts, And Plans

Discuss owns collaborative exploration when options, assumptions, tradeoffs, or new evidence could materially change direction. Design for Depth may compose as a lens while the boundary remains design-bearing.

Artifacts remain conditional:

- Working Record: evolving task state and continuity;
- Spec: stable accepted content;
- Plan: stable ordered strategy that can be stated without guessing;
- Handoff: point-in-time continuation transfer.

A Plan does not carry execution progress. Evolving state and supported deviations belong in the Working Record. Specs and Plans receive separate independent Review Artifact boundaries after author self-review.

## Slices And Task Memory

A slice is one coherent Learning, Delivery, or Deepening result. One current slice may span several Feedback Loop iterations, discussions, reviews, corrections, and checkpoints while its intended result remains coherent.

Before accepted work expands, return the extension to Workflow. Continue write-ahead only when the intended result remains coherent and the current authority envelope covers its effects and evidence boundary; otherwise establish a new bounded result and authority source. Routine in-slice feedback is not checkpoint history.

When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, Workflow requests the Working Record's bounded `resume` view before continuing and retrieves exact entities only when needed. The record is compared with the current conversation and live state; memory from another conversation branch does not create authority.

## Verification And Review

Verification is factual work owned by the active agent. Verify Work deepens claim and evidence-boundary analysis without creating another role or authority to generate evidence. Run an active check only when the current authority envelope covers it directly or as contained verification; otherwise Workflow proposes the check and waits.

Self-review is required for every completed bounded activity, remains silent, and follows initially supported verification. It belongs to the authorized activity without widening authority: clear local issues required by the accepted outcome may be corrected and re-verified before the final state is frozen. Review Work and Review Artifact can deepen self-review or guide a separately selected independent reviewer.

Independent review ends with Pass, Non-blocking, Inconclusive, or Blocking. The active agent adjudicates each item. Findings do not authorize edits.

Use the current authority envelope when it covers an accepted correction. Otherwise request the correction plus any warranted focused follow-up together, or the correction alone. A review budget caps dispatches but does not authorize another review. Corrections leave review and return to Execute Work or the artifact owner; they may remain in the same coherent Working Record slice.

## Controlled Boundaries

These jobs remain separately controlled:

- Commit Work: authorized coherent local commit or simple push;
- Finish Branch: integration, PR, preservation, discard, or cleanup;
- Migration Work: consumer/state movement and removal proof;
- Release Work: versioned publication;
- Launch Work: production deployment or exposure;
- Handoff: point-in-time continuation transfer.

Bypass changes optional method pressure inside an accepted action. It does not change mode, authorize work, resolve source conflicts, weaken verification/self-review, or remove a selected review or checkpoint.

## Supported Exits

A Supported Exit may answer, wait, pause, hand off, defer, stop, preserve a controlled boundary, or complete.

Completion requires fresh active-agent verification, the required self-review for every completed bounded activity, resolved selected reviews, accurate Working Record state when present, synchronized required durable artifacts, and no hidden user-owned decision or source conflict.

## Current Package Shape

The cross-host model surface contains 26 active model/contributor skill packages, including Action Selection. Pi separately provides Cognitive Routing, Context Virtualization, and Conversation History under `capabilities/` as Skills-gated capabilities outside the cross-host skill registry. Static prompt fragments live under `runtime/prompts/`. Retired Output Router material is preserved under `.deprecated/output-router/`.

Retired Delegation Harness implementation and evidence remain under `.deprecated/delegation-harness/` and are not part of runtime delivery.

The current adaptive candidate remains Unverified pending behavioral evaluation. Context-loading and deterministic runtime tests establish structure and delivery boundaries, not natural activation or retained behavior.
