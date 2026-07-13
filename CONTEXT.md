# Freeflow

Freeflow is a plugin context for improving how coding agents handle consequential work. Its language centers on workflow pressure, user-owned decisions, verification, and portable skill behavior.

## Language

**Freeflow**:
A plugin or skill pack that guides coding agents through consequential work without becoming a new agent.
_Avoid_: Orchestra, agent framework, workflow engine

**Workflow Pressure**:
The amount of explicit coordination and evidence a task needs. Increase it only when consequence, uncertainty, or reversibility requires it—not because more lifecycle steps are available.
_Avoid_: bureaucracy, artifact count, automation level

**Conversation Mode**:
A mode for discussion, explanation, critique, and exploration where no workflow artifacts are required.
_Avoid_: casual mode, no-rules mode

**Workflow Mode**:
The default mode for consequential work. It follows an adaptive engineering loop and routes backward when new evidence changes the next safe action.
_Avoid_: auto mode, normal mode

**Strict Workflow Mode**:
A mode for high-risk work where owner decisions, evidence, and consequential boundaries are stronger without making every slice require review.
_Avoid_: safe mode, locked mode

**Responsible Engineer**:
The active agent owns locally authorized implementation, verification, correction, and learning. It uses evidence rather than continuous supervision while preserving user authority over intent and consequential decisions.
_Avoid_: supervised typist, infallible agent, obedient child

**Primary Feedback Loop**:
Implementation, tests, runtime evidence, and one sequential self-check: self-verification first, then bounded self-review only when evidence supports the outcome. Review/verify skills may enhance either method inline; independent contexts sit outside this loop.
_Avoid_: reviewer-driven development, independent context after every slice

**Formal Independent Review**:
Strict judgment from a separate reviewer context. A consequential artifact phase has a standing route chosen by `write-spec`: one combined review or separate spec/plan reviews when high risk; final review may run in parallel with the distinct final verifier against the same frozen implementation, without shared outputs. Additional reviews require scoped user authorization.
_Avoid_: self-review, defect quota, mandatory intermediate ceremony

**Independent Verification**:
One factual evidence run by a fresh verifier distinct from implementer and reviewer. At final assurance it runs in parallel with the reviewer against the same frozen implementation and without shared output. Another run requires user authorization.
_Avoid_: self-verification, `/verify-work` activation, reviewer inspection

**Decision Gate**:
A stop that fires when the next action depends on a user-owned decision, source-truth conflict, or materially different path.
_Avoid_: interview, questionnaire, permission check

**Route Check**:
The lightweight check after a meaningful slice that compares evidence with the accepted outcome, assumptions, interface, scope, and remaining path.
_Avoid_: status update, mandatory user checkpoint

**Backward Edge**:
A deliberate return to the narrowest owning activity when new evidence invalidates the current path while preserving work and decisions that remain valid. Repeated failure routes to diagnosis before redesign unless structural evidence already establishes the cause.
_Avoid_: restart, automatic redesign, patch loop

**Semantic Failure Unit**:
The smallest outcome whose success, rejection, written state, forbidden effects, post-commit failure, and recovery must be owned together.
_Avoid_: file batch, caller choreography, test count

**Evidence Boundary**:
The strongest claim directly supported by the observing mechanism. Helper execution, registered entrypoint invocation, native host dispatch, and installed-artifact behavior are different boundaries.
_Avoid_: integration passed, self-reported proof, assumed execution

**Self-Check**:
The active agent's sequential feedback pair after meaningful work: self-verify first; only then self-review once. Both use the same active context.
_Avoid_: independent assurance, parallel self-check, reviewer-driven feedback

**Self-Review**:
The active agent silently checks its own work once after self-verification supports the outcome, against source truth, evidence, and route. Kernel/Workflow provide the basic method; review skills may enhance it inline without creating independence.
_Avoid_: independent review, asking the user to check, review pass zero

**Self-Verification**:
The active agent runs and interprets direct evidence for its own claims. Kernel/Workflow provide the basic method; `verify-work` may enhance it after any meaningful slice without dispatching a verifier.
_Avoid_: independent verification, test exit code without interpretation, reviewer judgment

**Rolling Plan**:
A plan whose current horizon is executable while later phases remain directional and are refined from evidence.
_Avoid_: frozen task list, roadmap

**Learning Slice**:
A bounded experiment or prototype that answers one named uncertainty with evidence and a discard-or-promote rule.
_Avoid_: speculative implementation, production shortcut

**Delivery Slice**:
A bounded vertical slice that produces accepted observable behavior and verification.
_Avoid_: file batch, horizontal layer

**Deepening Slice**:
A bounded behavior-preserving slice that improves module depth, locality, or interface leverage.
_Avoid_: cleanup while here, architecture rewrite

**Discovery**:
The discovery loop before spec, plan, build, or durable memory. It interleaves evidence gathering, codebase exploration, external-source checking, brainstorming, targeted questions, and decision checkpointing. `/discover` is the user-facing route.
_Avoid_: report-only brief, grilling phase, capture phase, questionnaire

**Checkpoint**:
The output of discovery: current understanding, evidence, settled/tentative/open decisions, recommendation, and next route. It can stay in chat or be saved in the narrowest owning artifact.
_Avoid_: transcript, automatic spec, decision dump

**User-Owned Decision**:
A product, scope, domain, compatibility, public API, security, privacy, billing, data-loss, or hard-to-reverse architecture choice that the agent must not silently make.
_Avoid_: preference, blocker

**Source-of-Truth Conflict**:
A conflict between the latest request or handoff and live evidence such as docs, tests, specs, policies, ADRs, or established behavior.
_Avoid_: stale context, mismatch

**Path Conflict**:
A material difference between what the user asked for and what the agent is about to do next. The agent should name both paths and ask which one to follow.
_Avoid_: preference, implementation detail

**Release**:
An immutable versioned consumer artifact, tag, or publication checkpoint. A release is not necessarily deployed.
_Avoid_: deploy, rollout

**Shipping / Launch**:
Deploying or exposing behavior in production through an observable, recoverable rollout. Shipping may consume a release but is a separate decision.
_Avoid_: commit, tag, package publication

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
An evaluation run without Freeflow skill instructions.
_Avoid_: control agent, default test

**With-Skill Eval**:
An evaluation run with Freeflow skill instructions active.
_Avoid_: plugin run, enhanced agent

**Adversarial Fixture Eval**:
An evaluation that gives the agent a small repo fixture and pressure that should expose a workflow failure, then judges behavior with final output and diffs.
_Avoid_: smoke test, clean prompt

**Developer Skill Call**:
A skill call used while developing plugins or skills, not a normal workflow state for user task execution.
_Avoid_: workflow command, user task segment

**Reference Skill Stack**:
The temporary stack used to build Freeflow before Freeflow can safely guide its own development.
_Avoid_: dependency stack, plugin hierarchy

**Matt Style**:
The preferred Freeflow interaction and skill-writing style: concise, behavior-shaping, low-ceremony, eval-backed, and focused on the rule most likely to prevent failure.
_Avoid_: minimalism, short docs

**Obra Workflow Reference**:
The Superpowers-derived lifecycle reference for phase boundaries, planning, execution, verification, debugging, review, and handoff discipline.
_Avoid_: main workflow, mandatory ceremony

**Anthropic Skill Creator Reference**:
The reference for skill structure, progressive disclosure, trigger wording, baseline versus with-skill evals, and measured iteration.
_Avoid_: skill authority, final workflow

**Workflow Paradox**:
The bootstrapping problem where Freeflow cannot be the main process for building itself until its behavior is validated.
_Avoid_: circular dependency

**Plugin Runtime**:
The installable Freeflow skills, hooks, manifests, built routing/delegation code, and Pi extension sourced from the repo root. GitHub also contains public docs and eval evidence that are excluded from npm.
_Avoid_: duplicate package copy, generated mirror

**Activation Boundary**:
A valid `.freeflow/config.json`; the only repo state that activates Freeflow.
_Avoid_: AGENTS/CLAUDE activation block, generated rule file

**Runtime Kernel**:
The canonical compact system-level behavior contract shared by host adapters on every turn.
_Avoid_: duplicated core skill bodies, host-file copy

**Workflow Bootstrap**:
The full Workflow skill loaded once on the first turn into persistent session context; it is separate from the per-turn kernel.
_Avoid_: repeated Workflow messages, one-turn-only system injection

**Runtime Delivery**:
Evidence that the current host adapter actually loaded the kernel; separate from repo activation.
_Avoid_: config presence alone, assumed hook trust

**Public Repo**:
The repository root is the plugin root and also contains marketplace indexes, README, license, changelog, and repo memory.
_Avoid_: separate generated package, nested runtime copy

**Project Docs**:
`docs/` contains project memory for Freeflow planning, current state, discovery notes, handoffs, and durable project decisions.
_Avoid_: generated package copy, public install docs

**Plugin Docs**:
Refined user-facing docs live under `plugin-docs/`. These explain workflow, skills, architecture, release evidence, and release ADRs for users or contributors.
_Avoid_: raw discovery notes, handoffs

## Flagged Ambiguities

**Memory**:
Use `handoff`, `temp handoff`, or `memory handoff` when the distinction matters. Generic "memory" is ambiguous because it can mean conversation context, repo docs, Codex memories, or durable handoff artifacts.

**Workflow**:
Use `workflow mode` for the plugin mode and `adaptive workflow loop` for the recurring execution-and-learning path. Do not use "workflow" when you mean a rigid state machine or fixed forward sequence.

**Authority**:
Live repo evidence, explicit user decisions, and accepted ADRs can be authoritative. Handoffs are not authoritative unless later confirmed by live evidence or the user.

**Superpowers**:
Use `Obra/Superpowers` when referring to the workflow reference plugin. Do not imply Superpowers is the main methodology for this repo; Matt style has preference for interaction shape and skill wording.

## Example Dialogue

Developer: "The handoff says to change billing behavior. Should I implement it?"

Domain expert: "No. That is a source-of-truth conflict if the live policy or tests disagree. Use the Decision Gate before editing."

Developer: "Should the agent ask every time it picks an implementation detail?"

Domain expert: "No. Ask for user-owned decisions. Local reversible implementation choices can be made from repo conventions."

Developer: "Is this a temp handoff or a memory handoff?"

Domain expert: "Ask the user if the destination matters. A fresh-chat continuation is usually a temp handoff; durable project memory belongs in repo docs."

Developer: "Should I use Superpowers or Matt's skills here?"

Domain expert: "Use Matt as the primary style and behavior reference. Use Obra/Superpowers for lifecycle coverage, and use Anthropic skill-creator for eval-driven skill creation."
