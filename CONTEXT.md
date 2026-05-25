# Pilot Workflow

Pilot Workflow is a candidate plugin context for improving how coding agents handle consequential work. Its language centers on workflow pressure, user-owned decisions, verification, and portable skill behavior.

## Language

**Pilot Workflow**:
A candidate plugin or skill pack that guides coding agents through consequential work without becoming a new agent.
_Avoid_: Orchestra, agent framework, workflow engine

**Workflow Pressure**:
The amount of process the plugin applies to a task. More pressure means more gates, artifacts, and verification before action.
_Avoid_: bureaucracy, automation level

**Conversation Mode**:
A mode for discussion, explanation, critique, and exploration where no workflow artifacts are required.
_Avoid_: casual mode, no-rules mode

**Workflow Mode**:
The default mode for consequential work. It follows a lightweight forward workflow and re-enters clarification when ambiguity would change the next action.
_Avoid_: auto mode, normal mode

**Strict Workflow Mode**:
A mode for high-risk work where gates, artifacts, and verification are stronger.
_Avoid_: safe mode, locked mode

**Interview Gate**:
A clarification gate that fires when the agent would otherwise make a user-owned decision or proceed with context that could change the next action.
_Avoid_: questionnaire, permission check

**User-Owned Decision**:
A product, scope, domain, compatibility, public API, security, privacy, billing, data-loss, or hard-to-reverse architecture choice that the agent must not silently make.
_Avoid_: preference, blocker

**Source-of-Truth Conflict**:
A conflict between the latest request or handoff and live evidence such as docs, tests, specs, policies, ADRs, or established behavior.
_Avoid_: stale context, mismatch

**Path Conflict**:
A material difference between what the user asked for and what the agent is about to do next. The agent should name both paths and ask which one to follow.
_Avoid_: preference, implementation detail

**Handoff**:
A compact continuation artifact for a future agent or session. A handoff is memory, not authority.
_Avoid_: transcript, source of truth

**Temp Handoff**:
A handoff for immediate continuation after compaction or in a fresh chat. It should live outside durable project memory unless the user asks otherwise.
_Avoid_: memory handoff, project note

**Memory Handoff**:
A handoff stored as durable project memory because its contents should help future sessions beyond the immediate next chat.
_Avoid_: temp handoff, scratch note

**Baseline Eval**:
An evaluation run without Pilot Workflow skill instructions.
_Avoid_: control agent, default test

**With-Skill Eval**:
An evaluation run with Pilot Workflow skill instructions active.
_Avoid_: plugin run, enhanced agent

**Adversarial Fixture Eval**:
An evaluation that gives the agent a small repo fixture and pressure that should expose a workflow failure, then judges behavior with final output and diffs.
_Avoid_: smoke test, clean prompt

**Developer Skill Call**:
A skill call used while developing plugins or skills, not a normal workflow state for user task execution.
_Avoid_: workflow command, user task segment

**Reference Skill Stack**:
The temporary stack used to build Pilot Workflow before Pilot Workflow can safely guide its own development.
_Avoid_: dependency stack, plugin hierarchy

**Matt Style**:
The preferred Pilot Workflow interaction and skill-writing style: concise, behavior-shaping, low-ceremony, eval-backed, and focused on the rule most likely to prevent failure.
_Avoid_: minimalism, short docs

**Obra Workflow Reference**:
The Superpowers-derived lifecycle reference for phase boundaries, planning, execution, verification, debugging, review, and handoff discipline.
_Avoid_: main workflow, mandatory ceremony

**Anthropic Skill Creator Reference**:
The reference for skill structure, progressive disclosure, trigger wording, baseline versus with-skill evals, and measured iteration.
_Avoid_: skill authority, final workflow

**Workflow Paradox**:
The bootstrapping problem where Pilot Workflow cannot be the main process for building itself until its behavior is validated.
_Avoid_: circular dependency

## Flagged Ambiguities

**Memory**:
Use `handoff`, `temp handoff`, or `memory handoff` when the distinction matters. Generic "memory" is ambiguous because it can mean conversation context, repo docs, Codex memories, or durable handoff artifacts.

**Workflow**:
Use `workflow mode` for the plugin mode and `workflow spine` for the forward sequence of work. Do not use "workflow" when you mean a rigid state machine.

**Authority**:
Live repo evidence, explicit user decisions, and accepted ADRs can be authoritative. Handoffs are not authoritative unless later confirmed by live evidence or the user.

**Superpowers**:
Use `Obra/Superpowers` when referring to the workflow reference plugin. Do not imply Superpowers is the main methodology for this repo; Matt style has preference for interaction shape and skill wording.

## Example Dialogue

Developer: "The handoff says to change billing behavior. Should I implement it?"

Domain expert: "No. That is a source-of-truth conflict if the live policy or tests disagree. Use the interview gate before editing."

Developer: "Should the agent ask every time it picks an implementation detail?"

Domain expert: "No. Ask for user-owned decisions. Local reversible implementation choices can be made from repo conventions."

Developer: "Is this a temp handoff or a memory handoff?"

Domain expert: "Ask the user if the destination matters. A fresh-chat continuation is usually a temp handoff; durable project memory belongs in repo docs."

Developer: "Should I use Superpowers or Matt's skills here?"

Domain expert: "Use Matt as the primary style and behavior reference. Use Obra/Superpowers for lifecycle coverage, and use Anthropic skill-creator for eval-driven skill creation."
