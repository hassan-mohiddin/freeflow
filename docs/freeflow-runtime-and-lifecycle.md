# Freeflow Runtime And Lifecycle

## Purpose

This document describes the current runtime boundary and adaptive control model. It is architecture context, not an implementation plan.

## Product Boundary

Freeflow is a portable feedback-based control system for coding agents. Host runtimes still own tools, sandboxing, permissions, and approvals. Freeflow controls interaction interpretation, workflow pressure, routing, evidence, review selection, task memory, and completion claims.

It has exactly three modes:

- `conversation`: read-only discussion and exploration;
- `workflow`: normal consequential or mutating work;
- `strict-workflow`: stronger decision, evidence, and checkpoint pressure at high-risk boundaries.

Task shape does not silently switch mode. Host permission modes remain separate.

## Layered Configuration

`.freeflow/config.json` is required shared repository activation. Minimal activation is:

```json
{
  "defaultMode": "workflow"
}
```

`.freeflow/local.json` is optional per-checkout personal core state. It cannot activate Freeflow without valid repository config.

Core precedence is:

```text
Pi session override -> personal override -> repository value -> built-in default
```

Pi session overrides can temporarily change Freeflow master enablement, Interaction Contract, Skills, and mode. They live in branch-aware Pi session JSONL, do not mutate config files, and cannot bypass missing or invalid repository activation. An invalid existing local core layer fails closed instead of silently inheriting repository values.

The Interaction Contract, Skills, and top-level Freeflow switch resolve independently. A mode remains resolved but dormant while Skills are ineffective. Pi owns its separately gated Output Router configuration and capability runtime.

Do not store task state, active slices, Plans, current session overrides, file inventories, or generated workflow instructions in config.

## Activation Versus Delivery

Valid repository config establishes activation state. It does not prove that a host adapter delivered model context.

Setup reports automatic delivery as:

- **confirmed:** trustworthy current-host evidence shows delivery;
- **unavailable:** the adapter is absent, disabled, denied, untrusted, or unsupported;
- **unconfirmed:** installation may exist but current execution cannot be established.

Setup does not generate Freeflow blocks in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.codex/rules/`, or another repository instruction surface. Existing instructions remain source truth and may create a Decision Gate when they conflict with requested behavior.

## Model-Facing Runtime Layers

Freeflow delivers two guidance layers:

1. `runtime/interaction-contract.md` owns compact turn interpretation when the Interaction Contract switch is effective.
2. `skills/workflow/SKILL.md` owns the Interaction Lifecycle, Feedback Loop, routing, review, task continuity, and Supported Exits while Skills are effective.

Hosts also provide compact active or dormant mode state. Mode Contract and other workflow skills remain on demand. Pi alone loads Output Router guidance while that capability is effective.

The Interaction Contract is the only compact interaction-guidance artifact. Runtime adapters load context; they do not enforce policy, block tools, grant permissions, or replace repository instructions.

## Host Lifecycle

### Codex And Claude

The packaged lifecycle hook reads repository and personal layers at supported startup, resume, clear, and compact boundaries. When effective, it delivers the Interaction Contract, Workflow bootstrap, and compact active or dormant mode state before the next model request. Ordinary prompts do not duplicate the payload, and the hook does not inspect, report, or inject Pi-only capabilities.

The hook remains inert without valid repository activation, fails closed on invalid personal core state, and preserves the host's existing context.

### Pi

The Pi extension reads both config layers before agent turns. It:

- appends compact runtime state and the Interaction Contract during `before_agent_start`;
- stores Workflow as one hidden persistent custom message while Skills are effective;
- restores temporary mode from Pi session entries;
- refreshes state at session start and compaction;
- dynamically exposes 25 model/contributor skills;
- loads Output Router context and tools only when effective.

`/freeflow settings` edits personal core overrides. `/freeflow settings session` manages branch-aware Pi session overrides for Freeflow, Interaction Contract, Skills, and mode without changing config files. `/freeflow settings repo` edits shared repository settings. `/freeflow mode` remains the direct temporary mode control.

## Same-Turn Setup

A config written during setup is visible to later runtime lifecycle calls, not retroactively to an adapter invocation that already occurred.

After successful setup verification, Setup reads newly effective Interaction Contract, Workflow, Mode Contract, and explicitly configured capability guidance directly for the remainder of the setup turn. It reports those direct reads separately from automatic delivery and names any required reload, resume, clear, compact, or next-turn boundary.

## Interaction Lifecycle

One user turn or new evidence begins an Interaction Lifecycle:

```text
[Entry] -> [Feedback Loop when needed] -> [Supported Exit]
   ^              ^        |                  |
   |              |________|                  |
   |__________________________________________|
            later user turn or evidence
```

Entry may route directly to an answer, wait, deferment, or stop. When work is needed, Workflow selects the narrowest owning skill.

The Feedback Loop is:

```text
orient to accepted intent, task memory, and live evidence
-> use the owning skill
-> implement, discuss, test, or observe
-> verify what the evidence proves
-> when supported, self-review once
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

Before accepted work expands, decide write-ahead whether it extends the current slice or needs a new result, authority source, or evidence boundary. Routine in-slice feedback is not checkpoint history.

When an ongoing task resumes after compaction, summarization, clear, resume, or session navigation, Workflow reads the complete Working Record before continuing. The record is compared with the current conversation and live state; memory from another conversation branch does not create authority.

## Verification And Review

Verification is factual work owned by the active agent. Verify Work deepens claim and evidence-boundary analysis without creating another role.

Self-review is silent and follows only supported verification. Review Work and Review Artifact can deepen self-review or guide a separately selected independent reviewer.

Independent review ends with Pass, Non-blocking, Inconclusive, or Blocking. The active agent adjudicates each item. Findings do not authorize edits.

When correction authority is not already explicit, request accepted corrections plus any warranted focused follow-up together, or corrections alone. A review budget caps dispatches but does not authorize another review. Corrections leave review and return to Execute Work or the artifact owner; they may remain in the same coherent Working Record slice.

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

Completion requires fresh active-agent verification, one supported self-review, resolved selected reviews, accurate Working Record state when present, synchronized required durable artifacts, and no hidden user-owned decision or source conflict.

## Current Package Shape

The cross-host model surface contains 25 active model/contributor skill packages. The Pi package separately includes Output Router under `capabilities/` as an optional gated capability outside host skill discovery.

Retired Delegation Harness implementation and evidence remain under `deprecated/delegation-harness/` and are not part of runtime delivery.

The current adaptive candidate remains Unverified pending behavioral evaluation. Context-loading and deterministic runtime tests establish structure and delivery boundaries, not natural activation or retained behavior.
