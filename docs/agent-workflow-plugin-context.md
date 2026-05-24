# Agent Workflow Skill Plugin Context

## Purpose

This document captures the working product direction for a plugin or skill pack that helps coding agents complete work from vague request to reviewed outcome without becoming bureaucratic or producing AI slop.

The goal is not to build a new agent. The goal is to build a portable plugin layer that can guide agents such as Claude, Codex, or similar coding agents through better task execution.

The central design idea is:

> Follow a simple forward workflow by default. When new ambiguity, missing context, or invalidated assumptions appear, re-enter clarification instead of silently patching forward.

## Background

Several existing skill/plugin styles informed this direction:

- Matt Pocock's skills are short, generalizable, and behavior-shaping. They encode stable judgment, exit conditions, and common failure prevention rather than cached repo facts.
- Obra's Superpowers skills are more workflow-oriented. They provide a stronger lifecycle from brainstorming to planning, execution, review, and handoff.
- Claude/Codex-style modes suggest that users should be able to choose how much process they want instead of having one workflow forced onto every interaction.

The desired plugin should combine:

- Matt-style concise behavioral constraints.
- Obra-style end-to-end workflow discipline.
- A universal backward-flow primitive for returning to clarification when work uncovers new uncertainty.
- User-controlled process modes so normal conversation remains lightweight.

## Problem Statement

Agents often fail not because they lack general intelligence, but because they drift through workflow boundaries:

- They implement before the problem is clear.
- They silently make product, scope, compatibility, or architecture decisions.
- They keep moving forward after implementation reveals a spec gap.
- They produce plans that look complete but rest on unresolved assumptions.
- They forget rules during long sessions or after compaction.
- They over-document volatile facts such as current directories or tech stack, which can be rediscovered cheaply and may go stale.
- They follow fixed workflows too rigidly, even when a small task does not need ceremony.

The plugin should solve for disciplined work without turning every interaction into a state-machine exercise.

## Product Direction

The plugin should be light by default and stricter by user choice or task risk.

The workflow should not be a rigid line. It should be a forward path with explicit backward re-entry:

```text
Clarify / Brainstorm
-> Research
-> Spec
-> Spec Review
-> Plan
-> Plan Review
-> Execute
-> Verify
-> Work Review
-> Commit / Handoff
```

Universal backward edge:

```text
Any State -> Interview Gate / Brainstorm -> Explicit Re-entry Decision
```

The backward destination should not be chosen silently by the agent. The agent should re-enter clarification, ask the user or inspect evidence, and then decide with the user whether to revise the spec, revise the plan, diagnose, split scope, open a bug, continue, or defer.

## Modes

The plugin should expose only three modes.

### Conversation Mode

Use when the user wants to talk, ask questions, explore ideas, or get quick analysis.

Characteristics:

- No required workflow artifacts.
- No transition logs.
- No plan/spec requirement.
- Normal conversation is preserved.
- The agent may still ask clarifying questions when needed.

### Workflow Mode

Use for normal consequential work such as feature implementation, non-trivial bug fixing, research, refactors, or reviews.

Characteristics:

- Uses the forward workflow as a guide.
- Uses gates when ambiguity appears.
- Creates specs, plans, or decision records only when useful.
- Verifies before claiming completion.
- Allows lightweight bypass for small reversible work.

### Strict Workflow Mode

Use for high-risk or team-sensitive work.

Examples:

- Auth, billing, security, migrations, data loss, public APIs, compatibility, deployment, cross-module architecture, or large refactors.

Characteristics:

- Requires explicit spec/plan/review/verification gates where appropriate.
- Hooks may block risky actions.
- Bypasses must be explicit.
- State and artifacts are more important.

## Mode Principle

Modes should change only:

1. What actions are allowed.
2. Which gates are mandatory.
3. Which artifacts are required.

They should not create three separate systems.

## User-Owned Decisions

The agent should not ask the user about every implementation detail. It should ask when the decision belongs to the user.

Agent may decide:

- Local, reversible implementation details.
- Naming that follows codebase conventions.
- Test placement when conventions are discoverable.
- Mechanical refactors.
- Narrow command selection for verification.

Agent should ask before deciding:

- Product behavior.
- Scope.
- Priority.
- Domain meaning.
- Compatibility.
- Public API behavior.
- User-facing behavior.
- Irreversible or hard-to-reverse architecture.
- Security, privacy, billing, or data-loss behavior.

This distinction prevents both silent decision-making and excessive questioning.

## Universal Interview Gate

The Interview Gate should be available from any state.

It fires when:

- A requirement is ambiguous and would change the plan.
- The agent is choosing between product behaviors.
- The agent is inventing domain meaning.
- Implementation reveals a design gap.
- Review finds repeated unresolved concerns.
- Verification fails in a way that challenges the spec.
- The agent is about to choose scope, priority, compatibility, or architecture silently.

Exit condition:

> Exit only when remaining ambiguity would not change the next forward action.

The Interview Gate should ask one question at a time, explain why it matters, and recommend the likely answer when possible.

The agent should inspect repo artifacts, docs, tests, logs, or external sources before asking the user when the answer is discoverable.

## State Artifacts

State artifacts are useful, but they should not become mandatory bookkeeping for every transition.

Avoid logging every normal step:

```text
Spec -> Review
Review -> Plan
Plan -> Execute
```

Instead, record only consequential workflow events:

- Re-entered brainstorm.
- User made a product/scope/domain decision.
- Spec or plan was superseded.
- Strict workflow was bypassed.
- Verification failure changed direction.
- Review plateau occurred.
- Active task was paused or handed off.

The log, if used, should capture why direction changed, not serve as a transcript of every move.

## Hooks

Hooks should be seatbelts, not the steering wheel.

They should not micromanage the agent's workflow. They should protect against expensive mistakes:

- Editing code in plan-only or strict contexts without required artifacts.
- Committing without verification when strict mode is active.
- Modifying protected docs directly instead of superseding them.
- Continuing after compaction without reloading active state.
- Performing destructive or irreversible actions without explicit approval.

Hooks should respect mode:

- Conversation Mode: minimal or no workflow enforcement.
- Workflow Mode: reminders and soft guardrails.
- Strict Workflow Mode: blocking guardrails for risky actions.

Bypass should be supported intentionally. Bypass should skip ceremony, not judgment.

## Durable Knowledge

The plugin should record stable knowledge, not volatile repo inventory.

Record:

- Domain vocabulary.
- Invariants.
- Product decisions.
- Architectural decisions.
- Rejected approaches.
- Compatibility constraints.
- Active unresolved questions.
- Review findings that affect direction.

Do not record:

- Current file tree.
- Current directory list.
- Temporary implementation inventory.
- Tech stack summaries that can be rediscovered.
- Dependency versions unless they are part of a decision.

The agent can inspect volatile facts when needed.

## Skill Pack Shape

The plugin should be composed of small skills rather than one large workflow skill.

Potential skills:

- `workflow`: route through modes, forward states, and re-entry.
- `grill-context`: clarify until ambiguity no longer changes the next action.
- `research-brief`: gather evidence and summarize only decision-relevant findings.
- `diagnose-failure`: reproduce before hypothesizing.
- `write-spec`: turn aligned context into a concise spec.
- `review-spec`: find gaps, hidden decisions, and missing constraints.
- `write-plan`: produce an executable implementation plan from an approved spec.
- `execute-plan`: implement in small verified steps.
- `verify-work`: run and interpret tests/checks.
- `review-work`: review for bugs, regressions, and missing tests first.
- `capture-decisions`: record durable terms and hard-to-reverse decisions.
- `handoff`: preserve current state, decisions, artifacts, and next action.

Each skill should remain short and behavior-shaping.

## Skill Writing Rules

Good skills should include:

- State: what mode of work the agent is in.
- Loop: what repeated action happens.
- Priority: what matters most.
- Exit condition: when the agent may move on.
- Failure prevention: what common mistake this skill blocks.

Good skills should avoid:

- Long generic advice.
- Cached facts the agent can inspect.
- Repo-specific file lists unless the skill is repo-specific.
- Explaining concepts the model already knows.
- Artificial checklists for low-risk tasks.

Before adding an instruction, ask:

- Will this still be true after the repo changes?
- Does this prevent a known agent failure?
- Does it define state, transition, or exit condition?
- Can the agent inspect this fact instead?
- Would this instruction still matter six months from now?

If not, remove it.

## Example Core Workflow Skill

```md
---
name: workflow
description: Use when work needs to move through clarification, specification, planning, execution, verification, review, or handoff without making silent user-owned decisions.
---

# Workflow

Use Conversation Mode for normal discussion.

Use Workflow Mode for consequential work.

Use Strict Workflow Mode for high-risk work.

Follow the forward path by default:

Clarify -> Research -> Spec -> Review Spec -> Plan -> Review Plan -> Execute -> Verify -> Review Work -> Handoff.

At any state, if new ambiguity, missing context, failed assumptions, or repeated review findings appear, re-enter Interview Gate / Brainstorm.

Do not choose the rewind destination silently. Clarification decides the next forward state.

Agents may make local, reversible implementation decisions. Ask before product, scope, domain, priority, compatibility, public API, user-facing, or irreversible architecture decisions.

Record durable decisions. Do not record volatile repo inventory.
```

## Open Questions

- What exact command surface should the plugin expose?
- Should mode be stored in a small state file, inferred from command context, or both?
- Should bypass be scoped to one action, one task, or until changed?
- Which hooks should ship in the first version?
- Should strict mode be opt-in only, or can the agent recommend switching into it?
- What artifact paths should be conventional without becoming mandatory?
- How should the plugin stay portable across Claude, Codex, and other agent environments?
- How should the plugin test whether a skill actually changes agent behavior?

## Recommended MVP

Start with:

- Three modes: Conversation, Workflow, Strict Workflow.
- One universal backward primitive: re-enter Interview Gate / Brainstorm.
- A small workflow skill plus a few micro-skills.
- No mandatory transition log for normal forward motion.
- Optional consequential-event logging only.
- Hooks only for high-risk actions, and only in Workflow or Strict Workflow modes.

The first version should prove that the plugin can preserve depth and discipline without forcing ceremony onto simple conversations.

