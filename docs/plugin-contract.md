# Agent Workflow Plugin Contract

## Purpose

This contract defines the current behavior and implementation boundary for the agent workflow plugin.

The plugin is a portable workflow layer for coding agents. It helps an agent clarify, research, specify, plan, execute, verify, review, and hand off work while preserving user control over consequential decisions.

The plugin is not a new agent. It is a set of skills, optional hooks, and conventions that can guide different agents such as Codex, Claude Code, or similar coding environments.

The plugin is named Freeflow. The old Orchestra repo is prior art and failure evidence, not a source tree to copy.

## Product Thesis

The plugin should make disciplined work feel natural:

> Enter at the narrowest useful workflow state. Verify and route after each meaningful slice; when evidence invalidates the path, return to the owning activity instead of silently patching forward.

## Non-Goals

The plugin should not:

- Force process onto every conversation.
- Convert every task into a rigid state machine.
- Log every normal transition.
- Require specs or plans for small reversible work.
- Hardcode volatile repo facts such as current directories, file lists, or tech stack.
- Maintain a heavyweight knowledge base or vector database as the default memory strategy.
- Produce verbose process narration, jargon, or ceremonial status text.
- Copy old Orchestra files, command compatibility, review machinery, or hook machinery before the new behavior proves itself.
- Let the agent silently make product, scope, domain, compatibility, or irreversible architecture decisions.
- Treat agent self-assessment as enough evidence that the workflow works.

## Operating Modes

The plugin exposes exactly three modes.

### Conversation Mode

Use when the user wants discussion, critique, explanation, exploration, or quick analysis.

Behavior:

- No required artifacts.
- No transition logs.
- No plan/spec requirement.
- No workflow pressure unless the user asks for it.
- Clarifying questions are allowed when needed.

Conversation Mode is the explicit way to turn workflow pressure off.

### Workflow Mode

Use for normal consequential work.

Examples:

- Feature implementation.
- Bug fixing.
- Research that may affect implementation.
- Refactors.
- Reviews.
- Multi-step documentation or planning work.

Behavior:

- Use the adaptive workflow map and enter at the narrowest useful state.
- Ask or investigate when ambiguity would change the next action.
- Produce artifacts only when they reduce risk, preserve decisions, or enable handoff.
- Verify before making completion claims.
- Allow one-action bypass for unnecessary ceremony.

Workflow Mode is the default/auto mode for real work.

### Strict Workflow Mode

Use for high-risk, team-sensitive, or hard-to-reverse work.

Examples:

- Auth.
- Billing.
- Security.
- Privacy.
- Data-loss risk.
- Migrations.
- Public APIs.
- Compatibility.
- Deployment.
- Cross-module architecture.
- Large refactors.

Behavior:

- Stronger gates.
- Required artifacts where appropriate.
- Explicit user confirmation for bypasses.
- Verification and review are hard requirements.
- Runtime context may strengthen model guidance, but the current plugin does not add enforcement hooks.

Strict Workflow Mode is the strongest form of the same adaptive workflow, not a separate system.

## Mode Principle

Modes change only:

1. What actions are allowed.
2. Which gates are mandatory.
3. Which artifacts are required.

Modes must not become three separate systems.

## Command Surface

Natural language is the default interface. Slash commands are precision controls.

Required mode commands:

```text
/freeflow mode conversation
/freeflow mode workflow
/freeflow mode strict-workflow
/freeflow mode reset
```

There are three modes and one namespaced mode-control path; `/freeflow mode reset` clears the current override and returns to the default mode. Do not add `/workflow` or `/mode` aliases: multiple mutation paths make session state harder to understand.

Direct skill calls should be possible for technical users:

```text
/discover
/write-spec
/review-artifact
/write-plan
/execute-plan
/simplify-code
/migration-work
/diagnose-failure
/verify-work
/review-work
/commit-work
/handoff
/finish-branch
/release-work
/launch-work
/bypass
```

Direct skill calls are manual state selection. If the user calls `/execute-plan`, the agent should treat that as permission to operate in that workflow segment, while still firing the decision gate if a user-owned decision appears.

Developer and setup skill calls are available when configuring Freeflow or developing plugins and skills:

```text
/setup-freeflow
/write-skill
/evaluate-skill
```

These are not workflow states. They should not be treated like normal user task segments.

Codex and Claude treat slash-style skill calls as model-routed language. Pi registers the direct and developer calls declared in `command-surface.json`. Do not assume a native host command exists unless the host manifest or runtime proves it.

## Activation And Runtime Kernel

A valid `.freeflow/config.json` is the sole repo activation boundary. Setup does not generate Freeflow blocks, imports, or rule files in `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, or `.codex/rules/`.

When skills are effective, each host adapter loads the canonical compact kernel from `skills/decision-gate/references/runtime-kernel.md` and the full Workflow skill once on the first turn. The kernel routes mode-setting, reset, inference, or discussion to the full Mode Contract on demand. Decision Gate and other workflow skill bodies remain progressively disclosed. Output Router and Delegation Harness keep independent config and runtime sections.

Pi appends the kernel to the existing system prompt before each agent turn and stores Workflow as one hidden persistent custom message. Codex and Claude use the packaged lifecycle hook at supported session boundaries. Repo activation does not prove host delivery: setup must report delivery as confirmed, unavailable, or unconfirmed and surface any host trust/reload step.

Runtime context guides behavior; it does not grant permissions, block tools, or enforce policy.

## Situation Routing

Workflow instructions should use situation language, not hard dependency names.

Examples:

- Say "use the Decision Gate," not "use creator X's grilling skill."
- Say "write an implementation plan," not "invoke a specific third-party planning skill."
- Say "verify before completion," not "run a specific plugin's verification skill."

A small registry may map situations to available skills for a given environment. The registry is optional early on and should stay small.

This keeps the plugin portable across agents and plugin sets.

## Mode Inference

The agent should infer mode from context when no explicit mode command is given.

Default inference:

| User Intent | Mode |
|---|---|
| Asking a question, comparing ideas, thinking out loud | Conversation Mode |
| Asking to implement, fix, research for action, review, or plan | Workflow Mode |
| Asking about risky systems or irreversible work | Recommend Strict Workflow Mode |

The agent may recommend switching modes, but the user controls the switch.

Example:

```text
This touches auth and migration behavior. I recommend Strict Workflow Mode before implementation.
```

The agent should not silently switch into Strict Workflow Mode unless the user has already configured it as default.

## Bypass Contract

Bypass skips ceremony, not judgment.

Default bypass:

```text
/bypass next
```

Meaning:

> Skip the next workflow gate only.

Optional broader bypass:

```text
/bypass task
```

Meaning:

> Reduce workflow pressure for the current task.

Bypass must not skip:

- User-owned decisions.
- Fresh verification before completion claims.
- Explicit approval for destructive or irreversible actions.
- Security, privacy, billing, or data-loss checks.

Avoid indefinite bypass by default.

## Adaptive Workflow

There is no mandatory forward pipeline. Enter at the narrowest useful state:

```text
request -> choose entry
entry -> conversation | discover | decide | spec | plan | execute | diagnose | review | verify | close
meaningful slice -> fresh verification + route check
route check -> continue | checkpoint | complete | backward edge
```

Discovery, formal artifacts, independent review, commits, handoffs, branch integration, releases, and launches are conditional. Every meaningful learning, delivery, or deepening slice still gets verification proportionate to its claim and a route check.

Scale workflow pressure to:

- Task risk and ambiguity.
- User preference.
- Existing repo conventions and source truth.
- Reversibility and blast radius.
- What evidence would change the next action.

## Backward Flow

The universal backward edge is:

```text
new evidence -> route check -> continue or return to the narrowest owning activity
```

Do not restart valid work or patch around an invalidated assumption. Preserve what remains valid, state what changed, then route the affected part to discovery, design, spec, planning, execution, diagnosis, review, verification, an owner decision, defer, or stop.

Use the Decision Gate only when the route depends on a user-owned decision, a source-truth conflict, or a materially different path. Discoverable technical facts should be investigated rather than delegated to the user.

## Source-of-Truth Conflict Rule

When the latest request contradicts existing docs, tests, specs, policies, ADRs, handoffs, or established code behavior, the agent must pause before editing.

The agent must not rewrite the source of truth to make the latest request pass.

Required behavior:

1. Inspect the conflicting evidence.
2. Name the conflict.
3. Treat the decision as user-owned when behavior, policy, compatibility, billing, security, privacy, data loss, migrations, permissions, or public APIs are involved.
4. Ask whether the source of truth should change before editing docs, tests, specs, policies, or implementation.

Handoffs are memory, not authority. If a handoff conflicts with live repo evidence, the agent should inspect the repo evidence and ask before following the handoff.

This rule is a frozen core behavior because adversarial evals showed that both baseline and early with-skill agents rewrote billing policy, tests, and code to satisfy the latest request. The revised skills passed after this rule was added.

## Decision Gate

The decision gate can fire from any state.

It fires when:

- A requirement is ambiguous and would change the next action.
- The agent is choosing between product behaviors.
- The agent is inventing domain meaning.
- Implementation reveals a design gap.
- Review finds unresolved concerns.
- Verification fails in a way that challenges the spec or plan.
- The agent is about to choose scope, priority, compatibility, or architecture silently.
- A request, plan, handoff, review comment, or implementation contradicts docs, tests, specs, policies, ADRs, or established behavior.

Before asking the user, the agent should inspect evidence when the answer is discoverable:

- Code.
- Tests.
- Docs.
- Logs.
- Existing issues.
- ADRs or decision records.
- External docs when current facts matter.

Question style:

- Ask one question at a time.
- Explain why the answer matters.
- Provide a recommended answer when possible.
- Stop when remaining ambiguity would not change the next safe action.

## User-Owned Decisions

The agent should ask before deciding:

- Product behavior.
- Scope.
- Priority.
- Domain meaning.
- Compatibility.
- Public API behavior.
- User-facing behavior.
- Irreversible or hard-to-reverse architecture.
- Security, privacy, billing, or data-loss behavior.

The agent may decide:

- Local reversible implementation details.
- Naming that follows discovered conventions.
- Test placement when conventions are discoverable.
- Mechanical refactors.
- Narrow verification command selection.

This boundary should be encoded in the `decision-gate` skill.

## Artifact Contract

Artifacts should exist to reduce risk or preserve decisions.

They should not exist to prove that the workflow is being followed.

Artifacts are also the plugin's lightweight memory layer.

Every fresh agent conversation starts with little or no session memory. Specs, plans, research notes, decision records, and handoffs let a future agent recover the relevant context without the user pasting a huge prompt or maintaining a heavyweight knowledge system.

This memory layer should be:

- Small enough to reread quickly.
- Stable enough to survive codebase changes.
- Explicit about decisions and rationale.
- Linked to live code or docs instead of duplicating volatile facts.
- Split by purpose so the agent can load only what it needs.

Preferred artifact types:

- Research brief.
- Spec or requirements doc.
- Spec review notes.
- Implementation plan.
- Decision record.
- Verification evidence.
- Handoff.

Review findings should not persist by default. Save review artifacts only when risk, future memory value, or explicit user request justifies them.

Artifacts should be mode-aware:

| Mode | Artifact Behavior |
|---|---|
| Conversation | None required. |
| Workflow | Create when useful. |
| Strict Workflow | Required where risk justifies them. |

Artifact paths should be conventional but not mandatory. The plugin should first respect existing repo conventions.

If no convention exists, prefer:

```text
docs/research/
docs/specs/
docs/plans/
docs/decisions/
docs/handoffs/
```

Do not encode this as a hard requirement in early skills.

## State Contract

Do not log every transition.

Avoid logs like:

```text
Spec -> Review
Review -> Plan
Plan -> Execute
```

Record only consequential workflow events:

- Re-entered clarification.
- User made a product/scope/domain decision.
- Spec or plan was superseded.
- Strict workflow was bypassed.
- Verification failure changed direction.
- Review plateau occurred.
- Active task was paused or handed off.

State should support continuity, not become a second task.

## Communication Contract

The plugin should bias agents toward crisp communication.

Concise output is not just style. It reduces context load, makes errors easier to spot, and often improves execution accuracy because the agent spends fewer tokens narrating and more tokens preserving exact technical substance.

The plugin should encourage:

- Short factual updates.
- Clear recommendations.
- Minimal jargon.
- No performative agreement.
- No long process narration unless the user asks for it.
- Code, specs, plans, and handoffs that are precise rather than verbose.

The plugin may recommend an external brevity-oriented plugin, such as Caveman, when available. But the core workflow plugin should still carry a lightweight communication philosophy so it works in agents that do not have that plugin installed.

This should remain lightweight. The goal is not to impose a writing persona; the goal is to prevent bloated, low-signal agent output.

## Hook Contract

Hooks are optional reinforcement.

They should be added only after repeated behavior failures prove mechanical enforcement is needed.

Hooks should protect against expensive mistakes:

- Destructive actions without approval.
- Code edits in Strict Workflow Mode before required planning.
- Completion claims without verification.
- Direct mutation of protected artifacts when supersession is required.
- Continuing after compaction without reloading active state when state exists.

Hooks should respect modes:

| Mode | Hook Behavior |
|---|---|
| Conversation | Minimal or none. |
| Workflow | Warnings and soft guardrails. |
| Strict Workflow | Blocking guardrails for risky actions. |

Hooks should be seatbelts, not the steering wheel.

Correction capture features such as `/teach` or `/violation` should not be part of the first build. Add them only after evals or real use show repeated forget/skip/drift failures that cannot be handled by sharper skills.

## Portability Contract

The core plugin should remain portable across agent environments.

Portable layer:

- Plain Markdown skills.
- Clear descriptions.
- Mode semantics.
- Artifact conventions.
- Evals.

Environment-specific layer:

- Slash command syntax.
- Hooks.
- Subagents.
- Tool names.
- Marketplace metadata.
- UI metadata.

Skills should describe situations and behaviors, not depend on a single agent's tool vocabulary unless that skill is explicitly environment-specific.

## Skill Writing Contract

Each skill should be bounded: it should complete its job inside its workflow segment.

Good skill properties:

- One primary behavioral loop.
- Clear trigger.
- Clear stop condition.
- Minimal durable instructions.
- Explicit failure-prevention.
- References only when needed.
- Crisp language that preserves exact technical substance.

Avoid:

- Long generic procedures.
- Cached repo summaries.
- Volatile file lists.
- Overly broad "always" rules.
- Verbose explanation of obvious agent behavior.
- Descriptions that summarize the full workflow and cause the agent to skip the body.
- Multiple unrelated jobs in one skill.

Use concise Matt-style pressure with Obra-style phase awareness.

## Skill Set Boundary

Freeflow now ships one adaptive workflow pack:

```text
mode-contract              workflow                  decision-gate
bypass                     discover                  design-for-depth
write-spec                 review-artifact           write-plan
execute-plan               tdd                       diagnose-failure
verify-work                review-work               commit-work
handoff                    output-router             delegation-harness
setup-freeflow             write-skill               evaluate-skill
```

Optional candidate skills cover distinct lifecycle jobs:

```text
simplify-code
migration-work
finish-branch
release-work
launch-work
```

The current adaptive revisions and new candidates remain Unverified until baseline-vs-with-skill evaluation shows that they change behavior under pressure. Skill presence, direct command exposure, and static review are not behavioral readiness claims.

## Evaluation Contract

The plugin must be tested with behavior evals.

Each eval should compare at least:

- Baseline agent without the new skill.
- Agent with the new skill.

Optional comparisons:

- Matt skill alone.
- Obra skill alone.
- Current plugin draft against previous plugin draft.

Eval scenarios should test:

- Vague feature request.
- Bug without a repro.
- Implementation discovers a spec gap.
- Plan hides a product decision.
- Conversation Mode quick answer.
- Strict Workflow risky change.
- Verification failure changes direction.
- Ambiguous review feedback.
- Source-of-truth conflicts under implementation pressure.
- Handoffs that conflict with live repo evidence.

The plugin succeeds only if it changes behavior under pressure.

Adversarial acceptance gates:

- `ADV-001`: requested implementation contradicts billing policy/tests.
- `ADV-002`: stale handoff contradicts live repo evidence.

These are stronger than smoke tests. Passing them requires baseline failure and with-skill success, or another clear material improvement.

## Acceptance Criteria For The Adaptive Candidate

The candidate is useful when:

- The agent infers Conversation Mode versus Workflow Mode correctly in common cases.
- It inspects discoverable evidence before asking and reserves the Decision Gate for user-owned decisions, source-truth conflicts, and material path substitutions.
- Every meaningful slice gets proportionate fresh verification and a route check.
- Invalidated work returns to the narrowest owning activity while valid work is preserved.
- Formal artifacts, independent review, commits, handoffs, integration, releases, and launches remain conditional.
- Artifacts preserve compact recoverable decisions rather than ceremony or transcript residue.
- Source-truth artifacts are not rewritten merely to satisfy the latest request.
- Direct skill calls select a workflow segment without bypassing its gates.
- One-action bypass skips unnecessary ceremony without disabling judgment.

These are candidate claims until baseline-vs-with-skill evaluation verifies the revised behavior.

## Frozen Decisions

- Exactly three modes: Conversation, Workflow, Strict Workflow.
- Workflow Mode is the main/default work mode; Conversation Mode disables workflow pressure.
- The workflow is adaptive and recurrent, not a fixed forward pipeline.
- Verification and route checking follow every meaningful slice.
- Backward edges return to the narrowest owning activity; the Decision Gate is only for user-owned decisions, source-truth conflicts, or material path substitutions.
- Source-truth conflicts stop edits until the owning decision is resolved.
- Handoffs are memory, not authority.
- Review findings are evidence; follow-up loops narrow and stop after three total passes.
- Bypass defaults to one action.
- Skills own behavior; host runtimes and harnesses own execution mechanisms.
- Enforcement hooks come only after behavior evals show a repeated need.
- Do not copy old Orchestra files or restore old command compatibility.
- Do not persist review artifacts by default.

Not frozen:

- Future packaging revisions.
- Exact optional command aliases.
- Exact artifact directory names.
- Exact context-loading hook implementation.
- Exact eval prompt wording.
- Exact skill body wording.

## Companion Artifacts

Use companion artifacts for volatile current state instead of embedding it in this contract:

- Current skill files live under `skills/`.
- Current eval evidence and status live under `evals/`.
- Current project status lives in `docs/freeflow-current-state.md`.
- Current continuation state lives in handoffs.
