# Freeflow

Freeflow is a portable workflow layer for coding agents. Its language centers on workflow pressure, user-owned decisions, evidence, and low-ceremony feedback.

## Language

**Freeflow**:
A plugin or skill pack that guides coding agents without becoming a new agent or workflow engine.
_Avoid_: Orchestra, agent framework, governance system

**Workflow Pressure**:
The explicit coordination and evidence a task needs. Increase it only when consequence, uncertainty, interaction, or reversibility warrants it.
_Avoid_: bureaucracy, artifact count, lifecycle completeness

**Conversation Mode**:
Discussion, explanation, critique, exploration, and passive inspection of existing evidence without exercising target behavior or intentionally changing task state.
_Avoid_: casual mode, no-rules mode, active evidence generation

**Workflow Mode**:
The default mode for active evidence generation and consequential or mutating work. It uses the Interaction Lifecycle and scales pressure to the task.
_Avoid_: auto mode, mandatory pipeline

**Strict Workflow Mode**:
The same adaptive Workflow with stronger decision, evidence, and checkpoint pressure at high-risk or hard-to-reverse boundaries.
_Avoid_: locked mode, review after every slice

**Interaction Contract**:
The compact runtime guidance for interpreting the whole user turn, distinguishing questions and tentative ideas from authorization, and recommending discussion when collaboration has material value.
_Avoid_: duplicate compact interaction contract, duplicate Workflow body

**Interaction Lifecycle**:
One directed interaction from Entry through a Feedback Loop when needed to a Supported Exit. A later user turn or new evidence begins the lifecycle again.
_Avoid_: fixed forward pipeline, phase machine

**Feedback Loop**:
The recurrent inner loop: orient, act or observe through the owning skill, verify, self-review when supported, then route from evidence.
_Avoid_: review-driven development, mandatory artifact sequence

**Supported Exit**:
An evidence-supported answer, wait, pause, handoff, deferment, stop, controlled boundary, or completion.
_Avoid_: forced completion, automatic next phase

**Responsible Engineer**:
The active agent owns understanding, routing, locally authorized work, verification, correction, adjudication, and completion while preserving user authority over intent and consequential decisions.
_Avoid_: supervised typist, infallible agent

**Authority Envelope**:
The bounded requested outcome, permitted effects, evidence boundary, and stop condition established by a direct request or still-valid approval.
_Avoid_: permission inferred from mode, skill selection, usefulness, or new evidence

**Passive Observation**:
Inspection of existing evidence or sources without exercising target behavior or intentionally changing task state.
_Avoid_: classifying a new test, reproduction, runtime interaction, benchmark, or instrumentation as passive observation

**Active Evidence Generation**:
Exercising target behavior to produce new evidence.
_Avoid_: automatic permission to run because the result would be informative

**Mutation Or Delivery**:
Changing repository, durable task or session, or external state. Effects are cumulative; apply the strongest relevant authority and mode boundary.
_Avoid_: treating a non-file side effect or delivery step as passive because no source file changed

**Route From Evidence**:
Choose the smallest useful next action from what direct evidence and accepted intent now support.
_Avoid_: continue because work started, redesign from one ordinary mistake

**Re-entry**:
Return only to the narrowest owning activity whose responsibility changed, preserving valid work and decisions.
_Avoid_: restart, global reversal, patch loop

**Decision Gate**:
A stop for one user-owned decision, source-truth conflict, or material path change that blocks safe progress.
_Avoid_: interview, permission ceremony

**Discuss**:
Collaborative exploration or revision when open direction, alternatives, assumptions, or new evidence could materially change the next action.
_Avoid_: questionnaire, automatic discovery phase

**Working Record**:
Living task memory for current context, one current slice, proposed work, decisions, evidence pointers, history, and the next useful action. It is memory, not authority.
_Avoid_: progress-log Plan, transcript, second task system

**Slice**:
One coherent learning, delivery, or deepening result that can be executed and checked as a unit. Its boundary may extend write-ahead only when the intended result remains coherent and Workflow confirms that the authority envelope covers the extension.
_Avoid_: file batch, automatic phase

**Learning Slice**:
A bounded experiment that answers one named uncertainty with evidence and a discard, revise, or promote condition.
_Avoid_: speculative production implementation

**Delivery Slice**:
A bounded unit that produces accepted observable behavior or another concrete result.
_Avoid_: horizontal layer, progress bucket

**Deepening Slice**:
A bounded behavior-preserving improvement to module depth, locality, or interface leverage.
_Avoid_: cleanup while here, architecture rewrite

**Self-Verification**:
The active agent runs and interprets direct evidence for a factual claim at the required boundary.
_Avoid_: separate factual role, passing command without interpretation

**Self-Review**:
After verification supports the result, the active agent silently judges its own work once for alignment, suitability, and unnecessary complexity.
_Avoid_: independent review, formal review cycle, performative pass

**Independent Review**:
Evidence-backed judgment from a separate context that did not produce the reviewed state. It reports without editing; the active agent adjudicates and routes the result.
_Avoid_: self-review, continuous supervision, automatic dispatch

**Review Exit**:
Pass, Non-blocking, Inconclusive, or Blocking. All end the review; none authorizes edits.
_Avoid_: review continues until Pass

**Review Budget**:
A cap on independent reviews for one state and boundary, not authorization to dispatch another reviewer.
_Avoid_: automatic review-fix-review loop

**Checkpoint**:
A deliberately selected independent review, local commit, user decision, or continuity boundary before dependent work. Routine in-slice feedback is not checkpoint history.
_Avoid_: every slice ending, nearby question, status update

**Spec**:
Stable accepted content, behavior, boundaries, and uncertainty in a durable artifact.
_Avoid_: progress report, implementation sequence

**Plan**:
A stable ordered execution strategy used when scope, dependencies, mechanism, and checks can be stated without guessing.
_Avoid_: rolling progress record, provisional roadmap

**Handoff**:
A compact point-in-time continuation package for a pause, context change, or ownership transfer. It is memory, not authority.
_Avoid_: transcript, Working Record replacement

**User-Owned Decision**:
A product, scope, domain, compatibility, public API, security, privacy, billing, data-loss, migration, deployment, or hard-to-reverse architecture choice the agent must not make silently.
_Avoid_: reversible local choice

**Source-of-Truth Conflict**:
A conflict among the request and live code, tests, specs, docs, policies, ADRs, or established behavior that changes the next safe action.
_Avoid_: excuse to overwrite the older source

**Evidence Boundary**:
The strongest claim directly supported by the observing mechanism. Source inspection, helper execution, registered entrypoint invocation, native host dispatch, and installed-artifact behavior are different boundaries.
_Avoid_: integration passed, assumed execution

**Bypass**:
A scoped reduction of optional workflow pressure inside an already accepted action. It does not change mode, authority, safety, evidence, or selected review.
_Avoid_: permanent exception, implementation authorization

**Release**:
An immutable versioned consumer artifact, tag, or publication checkpoint. A release is not necessarily deployed.
_Avoid_: launch, rollout

**Launch**:
Deploying or exposing behavior in production through an observable, recoverable rollout.
_Avoid_: commit, merge, package publication

**Activation Boundary**:
A valid `.freeflow/config.json`; the required shared repository state that can activate Freeflow.
_Avoid_: host instruction block, `.freeflow/local.json` alone

**Personal Override**:
Optional per-checkout `.freeflow/local.json` core settings layered over repository configuration. It cannot activate Freeflow by itself.
_Avoid_: shared team config, silent fallback from invalid local state

**Workflow Bootstrap**:
The full Workflow skill loaded into session context when Skills are effective. It is separate from the Interaction Contract.
_Avoid_: repeated Workflow injection, duplicate compact contract

**Runtime Delivery**:
Evidence that the current host adapter delivered effective Interaction Contract, Workflow, mode, and capability context. Configuration alone does not prove delivery.
_Avoid_: assumed hook trust, activation equals execution

**Plugin Runtime**:
The installable skills, runtime Interaction Contract, hooks, manifests, built capability code, and Pi extension sourced from the repository root.
_Avoid_: generated package mirror

**Baseline Eval**:
An evaluation run without the target skill instructions.
_Avoid_: control agent

**With-Skill Eval**:
An evaluation run with the exact target skill and declared context.
_Avoid_: enhanced agent

**Adversarial Fixture Eval**:
A case that applies natural pressure likely to expose the target workflow failure and grades behavior through saved evidence.
_Avoid_: clean prompt, subjective self-assessment

**Matt Style**:
Concise, behavior-shaping, low-ceremony skill wording focused on the rule most likely to prevent failure.
_Avoid_: shortness without completeness

## Flagged Ambiguities

**Workflow**:
Use `workflow mode` for the mode, `Interaction Lifecycle` for one directed interaction, and `Feedback Loop` for recurrence inside it.

**Review**:
State `self-review` or `independent review`. Reading a review skill does not create independence.

**Memory**:
Use `Working Record` for living task memory and `Handoff` for point-in-time transfer. Neither overrides live evidence or user decisions.

**Authority**:
Direct requests and still-valid explicit approvals establish the current envelope. Accepted source truth, policy, mode, task memory, and artifacts may constrain action but do not create or widen authority. Specs, Plans, Working Records, reviews, and handoffs preserve or judge state; they do not silently authorize active evidence generation, mutation, or delivery.
