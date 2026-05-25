# Agent Workflow Plugin Contract

## Purpose

This contract defines the first implementation boundary for the agent workflow plugin.

The plugin is a portable workflow layer for coding agents. It helps an agent clarify, research, specify, plan, execute, verify, review, and hand off work while preserving user control over consequential decisions.

The plugin is not a new agent. It is a set of skills, optional hooks, and conventions that can guide different agents such as Codex, Claude Code, or similar coding environments.

The candidate plugin should not take the `orchestra` name by default. Use a temporary candidate name until behavior evals show that it substantially improves agent behavior. The old Orchestra repo is prior art and failure evidence, not a source tree to copy.

## Product Thesis

The plugin should make disciplined work feel natural:

> Use a lightweight forward workflow by default. When new ambiguity, missing context, or invalidated assumptions appear, re-enter clarification instead of silently patching forward.

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

- Treat the workflow spine as the default guide.
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
- Hooks may block risky actions.

Strict Workflow Mode must exist, but initial development should optimize Conversation Mode and Workflow Mode first.

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
/workflow conversation
/workflow workflow
/workflow strict-workflow
```

Optional aliases may be added later, but the contract should not depend on aliases.

Direct skill calls should be possible for technical users:

```text
/grill-context
/research-brief
/write-spec
/review-artifact
/write-plan
/execute-plan
/diagnose-failure
/verify-work
/review-work
/commit-work
/capture-decisions
/handoff
/bypass
/write-skill
/evaluate-skill
```

Direct skill calls are manual state selection. If the user calls `/execute-plan`, the agent should treat that as permission to operate in that workflow segment, while still firing the interview gate if a user-owned decision appears.

Current candidate plugins may route these through skill activation and model behavior rather than native host slash-command handlers. Do not assume a host command is registered until the host manifest or runtime proves it.

## Situation Routing

Workflow instructions should use situation language, not hard dependency names.

Examples:

- Say "run an interview gate," not "use creator X's grilling skill."
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

## Workflow Spine

Default forward flow:

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

The workflow is a guide, not a mandatory checklist for every task.

The agent should scale the amount of process to:

- Task risk.
- Task ambiguity.
- User preference.
- Existing repo conventions.
- Whether the work is reversible.

## Backward Flow

The universal backward edge is:

```text
Any State -> Interview Gate / Brainstorm -> Explicit Re-entry Decision
```

When new uncertainty appears, the agent should not silently choose a backward destination such as "rewrite spec" or "change plan."

Instead:

1. Re-enter clarification.
2. Ask or inspect evidence.
3. State what changed.
4. Decide the re-entry destination explicitly.

Possible re-entry destinations:

- Continue.
- Revise spec.
- Revise plan.
- Split scope.
- Diagnose failure.
- File a bug.
- Defer.
- Stop and ask user.

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

## Interview Gate

The interview gate can fire from any state.

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
- Stop when remaining ambiguity would not change the next forward action.

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

This boundary should be encoded in the `interview-gate` skill.

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

The initial implementation should start with the smallest skill set that can prove the workflow behavior:

```text
mode-contract
workflow
interview-gate
```

Add follow-on core skills only when the preceding behavior is useful under eval pressure:

```text
verify-work
handoff
```

Candidate later skills:

```text
grill-context
research-brief
write-spec
review-artifact
write-plan
execute-plan
diagnose-failure
review-work
capture-decisions
bypass
```

Do not start by writing every skill. The useful test is whether the smallest active skill set changes behavior under pressure.

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

## Acceptance Criteria For First Implementation

The first implementation is useful when:

- The agent can infer Conversation Mode vs Workflow Mode correctly in common cases.
- The agent asks before making user-owned decisions.
- The agent inspects discoverable evidence before asking.
- The agent can move backward from execution/review/verification into clarification.
- The agent does not create unnecessary artifacts for simple work.
- The agent uses artifacts as lightweight recoverable memory instead of asking the user to repaste context.
- The agent communicates crisply without losing technical precision.
- The agent verifies before claiming completion.
- The agent refuses to rewrite source-of-truth artifacts merely to satisfy the latest request.
- The user can manually call a workflow segment.
- The user can bypass one unnecessary gate without disabling judgment.

## Frozen Decisions

Frozen for initial development:

- Exactly three modes: Conversation, Workflow, Strict Workflow.
- Workflow Mode is the main/default work mode.
- Conversation Mode disables workflow pressure.
- Strict Workflow Mode exists but is not the first optimization target.
- Universal backward edge goes through the interview gate.
- Source-of-truth conflicts require pause and explicit user confirmation before edits.
- Handoffs are memory, not authority.
- Bypass defaults to one-action.
- Hooks come after core skill behavior and evals.
- The first implementation starts with the smallest skill set that can prove behavior under eval pressure.
- Do not copy old Orchestra files into the candidate plugin.
- Do not persist review artifacts by default.
- Do not build `/teach`, `/violation`, hooks, or old command compatibility before behavior evidence exists.

Not frozen:

- Final plugin name.
- Candidate plugin path.
- Exact command aliases.
- Exact artifact directory names.
- Exact hook implementation.
- Exact eval prompt wording.
- Exact skill body wording.

## Companion Artifacts

Use companion artifacts for current state instead of embedding it in this contract:

- Current skill files live under the active plugin draft.
- Current eval evidence lives in eval reports.
- Current continuation state lives in handoffs.
