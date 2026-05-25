# Agent Workflow Plugin Skill Inventory And Development Plan

## Purpose

This document maps the installed Matt Pocock skills, Obra/Superpowers skills, and Anthropic-style skill creation process into the planned agent workflow plugin.

The goal is not to copy an existing plugin. The goal is to use existing skills as reference material, then build a portable plugin that guides agents through consequential work without excessive ceremony, silent decisions, or AI slop.

Working product thesis:

> A lightweight workflow layer for coding agents that defaults to disciplined execution, lets the user choose process intensity, and re-enters clarification whenever new uncertainty would change the next action.

Canon status:

- Canon-frozen for development planning as of 2026-05-23.
- Frozen: borrowing strategy, target modes, initial skill pack, phase order, and workflow-paradox controls.
- Not frozen: exact skill wording, eval prompt wording, plugin name/path, hook implementation details, and future artifact conventions.

## Installed Reference Sources

Matt Pocock skills:

```text
/Users/mohammedhassanmohiddin/.codex/plugins/cache/personal/mattpocock-skills/0.1.0/skills
```

Superpowers skills:

```text
/Users/mohammedhassanmohiddin/.codex/plugins/cache/openai-curated/superpowers/6188456f/skills
```

Anthropic skill creator:

```text
/Users/mohammedhassanmohiddin/.codex/plugins/cache/claude-plugins-official/skill-creator/local/skills/skill-creator/SKILL.md
```

## Core Borrowing Strategy

Use the reference skills as a source corpus, not as hard dependencies.

Borrow:

- Matt's concise, behavior-shaping style.
- Matt's focus on one strong loop per skill.
- Obra's end-to-end workflow coverage.
- Obra's insistence on review, verification, and handoff.
- Anthropic's eval-driven skill iteration.

Change:

- Avoid forcing the full workflow on every conversation.
- Avoid making every transition a logged state-machine event.
- Avoid requiring docs/artifacts for small reversible work.
- Avoid hardcoding volatile repo inventory into long-lived instructions.
- Avoid letting the agent judge its own workflow quality without external tests or user review.

## Source Skill Inventory

### Matt Pocock Skills

| Skill | What It Does Well | What We Borrow | What We Change |
|---|---|---|---|
| `grill-me` | Relentless one-question-at-a-time clarification until shared understanding. | Core loop for interview gate and context grilling. | Add explicit user-owned decision categories and workflow re-entry semantics. |
| `grill-with-docs` | Challenges language against glossary/docs and captures stable decisions. | Domain vocabulary discipline, ADR sparingness, inspect-before-ask. | Make artifact writing optional and mode-aware; avoid assuming `CONTEXT.md` convention everywhere. |
| `to-prd` | Converts conversation into product/requirements artifact without over-interviewing. | Synthesis from known context, no file paths in durable requirements, testing decisions. | Generalize from PRD to spec/artifact generation; make issue publishing optional. |
| `diagnose` | Strong bug loop: build feedback loop, reproduce, hypothesize, instrument, fix, postmortem. | Feedback-loop-first debugging and refusal to guess without a repro. | Integrate as one possible workflow branch rather than a separate world. |
| `tdd` | Vertical red-green-refactor with behavior-focused tests. | Tracer-bullet execution and behavior-over-implementation testing. | Do not force TDD for every tiny change unless mode/risk calls for it. |
| `handoff` | Compact continuation artifact, avoids duplicating content already captured elsewhere. | Handoff as final workflow artifact and compaction recovery pattern. | Add active mode/state/re-entry context when relevant. |
| `triage` | Small state machine with maintainer control and ready-for-agent criteria. | Role/state clarity and user override handling. | Use state-machine ideas sparingly; avoid issue-tracker coupling as a core requirement. |
| `write-a-skill` | Simple skill authoring structure and progressive disclosure. | Concise `SKILL.md`, triggers in descriptions, scripts only when deterministic. | Use Anthropic/Obra eval discipline for behavior testing. |

Matt-style takeaway:

> A good skill is not a manual. It is a pressure system. It tells the agent what behavior to maintain, what loop to run, and when not to proceed.

### Obra / Superpowers Skills

| Skill | What It Does Well | What We Borrow | What We Change |
|---|---|---|---|
| `using-superpowers` | Makes skill use mandatory and prevents rationalized skipping. | Explicit skill-routing discipline and user-instruction priority. | Soften for conversation mode; our plugin should not make every exchange procedural. |
| `brainstorming` | Creates a design gate before implementation. | Explore context, ask one question at a time, present approaches, get approval. | Remove always-design-for-everything rule; allow lightweight workflow and backward re-entry. |
| `writing-plans` | Produces concrete implementation plans with paths, commands, tests, and checkpoints. | Detailed execution plans when the task warrants it. | Avoid requiring full code snippets for every plan; scale detail to risk and mode. |
| `executing-plans` | Loads, reviews, executes, verifies, and stops on blockers. | Plan review before execution and stop-on-unclear rule. | Add explicit backward path to interview gate/spec revision instead of only returning to plan review. |
| `verification-before-completion` | Evidence before completion claims. | Completion claims require fresh verification. | Keep this strict across modes for consequential work. |
| `systematic-debugging` | Root cause before fixes. | No random fix attempts; investigate before changing. | Blend with Matt `diagnose` and prefer feedback-loop-first language. |
| `test-driven-development` | Strong TDD discipline. | Red-green verification and test-first pressure for risky behavior changes. | Allow exceptions with user approval in workflow mode; strict mode can enforce harder. |
| `requesting-code-review` | Fresh review context and early review. | Review at checkpoints and before merge/handoff. | Use review as a gate only when risk warrants; not every small edit needs subagent review. |
| `receiving-code-review` | Evaluate feedback instead of blindly implementing. | Technical skepticism, clarify unclear feedback first, one item at a time. | Generalize beyond code review to any external/judge feedback. |
| `finishing-a-development-branch` | Structured completion choices. | Final options and cleanup discipline. | Make git integration optional because plugin should be portable across agents and environments. |
| `writing-skills` | Skill creation as TDD for process documentation. | Baseline failure, pressure scenarios, then skill revision. | Use Anthropic viewer/benchmark process where available. |

Obra-style takeaway:

> A workflow skill should control phase boundaries. It is strongest when it prevents premature implementation and unverified completion.

### Anthropic Skill Creator

| Area | What It Gives Us |
|---|---|
| Skill structure | `SKILL.md` with concise body, optional references/scripts/assets. |
| Trigger design | Description is the main trigger; make it pushy enough but not workflow-heavy. |
| Evals | Run test prompts with skill and without skill; compare outputs. |
| Baselines | Prove that the skill changes behavior instead of assuming it does. |
| Human review | User reviews outputs and gives feedback before the skill is declared good. |
| Iteration | Revise skill based on repeated failure patterns, not vibes. |

Anthropic-style takeaway:

> The plugin should be judged by behavior under pressure, not by how good the skill files sound.

## Target Plugin Shape

The plugin should expose three modes:

```text
conversation
workflow
strict-workflow
```

Natural language should be the default interface. Slash commands are precision controls.

Example mode commands:

```text
/workflow conversation
/workflow workflow
/workflow strict-workflow
```

Example direct skill calls:

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
```

Developer skill calls:

```text
/write-skill
/evaluate-skill
```

The command surface should not be the only path. A normal user should be able to say "help me build this feature" and the agent should infer workflow mode.

## Target Skill Pack

| Target Skill | Source Inspiration | Job | Notes |
|---|---|---|---|
| `workflow` | Obra lifecycle + our mode design | Central workflow spine and mode rules. | First skill to draft. Should be short and authoritative. |
| `interview-gate` | Matt `grill-me`, `grill-with-docs` | Fire anywhere when user-owned decisions or context gaps appear. | Most important micro-skill. Prevents silent decisions. |
| `grill-context` | Matt `grill-me` | Deep question loop for design/context clarification. | Used when the user explicitly wants intense interrogation. |
| `research-brief` | Matt style + Obra context exploration | Gather current evidence before decisions. | Should avoid stale repo summaries; inspect live facts. |
| `write-spec` | Matt `to-prd`, Obra `brainstorming` | Convert known context into durable requirements/spec artifact. | Should avoid exact file paths unless they encode a stable decision. |
| `review-artifact` | Obra spec self-review + prior project review lessons | Check specs, plans, decision notes, research briefs, handoffs, and other artifacts for ambiguity, contradictions, scope, and missing decisions. | Generalizes the planned `review-spec`; can trigger interview gate. |
| `write-plan` | Obra `writing-plans` | Convert approved spec into executable implementation plan. | Detail scales by risk/mode. |
| `execute-plan` | Obra `executing-plans`, Matt `tdd` | Execute plan with checkpoints, tests, and stop conditions. | Must be allowed to re-enter earlier states. |
| `diagnose-failure` | Matt `diagnose`, Obra `systematic-debugging` | Debug bugs, failed tests, regressions, and unexpected behavior. | Feedback loop before fix. |
| `verify-work` | Obra `verification-before-completion` | Require evidence before completion claims. | Should be strict for consequential work. |
| `review-work` | Obra `requesting-code-review`, `receiving-code-review` | Review diff/output against requirements and technical quality. | Can be human, subagent, or self-review depending environment. |
| `commit-work` | Orchestra commit prior art + Obra closeout | Commit only reviewed, verified, intended work. | Lightweight guard; avoids old hook/canon-frozen machinery until evals prove need. |
| `capture-decisions` | Matt `grill-with-docs` | Record durable glossary/ADR/spec decisions. | Avoid transition spam. |
| `handoff` | Matt `handoff`, Obra finishing branch | Compact current state for continuation. | Reference artifacts instead of duplicating them. |
| `bypass` | Our mode discussion | Skip next workflow gate intentionally. | Default should be one-action bypass. One-task bypass may exist explicitly. |
| `write-skill` | Matt `write-a-skill` + Anthropic `skill-creator` | Draft and revise compact behavior-shaping skills. | Use external skill-creator for structure; add Pilot/Matt wording discipline. |
| `evaluate-skill` | Anthropic `skill-creator` + Pilot eval harness | Turn failures into baseline vs with-skill evals and revise from evidence. | Prefer diff/assertion evidence; call `write-skill` for wording changes. |

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

Universal backward edge:

```text
Any State -> Interview Gate / Brainstorm -> Explicit Re-entry Decision
```

The backward edge is the plugin's key differentiator. Work often reveals gaps after planning or during implementation. The plugin should treat this as normal, not as failure.

## Mode Semantics

### Conversation Mode

Use for discussion, explanation, critique, or lightweight analysis.

Rules:

- No required artifacts.
- No transition logs.
- No plan/spec requirement.
- Ask questions when needed, but do not impose workflow.

### Workflow Mode

Default for consequential work.

Rules:

- Follow the workflow spine as a guide.
- Use the interview gate when ambiguity would change the next action.
- Create artifacts only when they reduce risk or preserve decisions.
- Verify before completion claims.
- Allow one-action bypass.

### Strict Workflow Mode

Use for high-risk or team-sensitive work.

Rules:

- Stronger gates.
- Required artifacts where appropriate.
- Verification and review become harder requirements.
- Hooks may block risky actions.
- Bypasses must be explicit and recorded when consequential.

Strict mode should exist, but it is not the first optimization target.

## Bypass Policy

Default bypass should be one-action:

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

> Reduce workflow pressure for the current task, but do not skip user-owned decisions or verification claims.

Avoid indefinite bypass by default. It is too easy to forget.

## User-Owned Decisions

The agent should ask before deciding:

- Product behavior.
- Scope.
- Priority.
- Domain meaning.
- Compatibility.
- Public API behavior.
- User-facing behavior.
- Irreversible architecture.
- Security, privacy, billing, or data-loss behavior.

The agent may decide:

- Local reversible implementation details.
- Naming that follows discovered conventions.
- Test placement when conventions are clear.
- Mechanical refactors.
- Narrow verification command selection.

This prevents both silent product decisions and excessive questioning.

## Development Process

We should not use the unfinished workflow plugin as the authority while building it.

Use a simpler external process:

```text
Research -> Draft -> Human Review -> Eval -> Revise
```

Role separation:

- User owns product philosophy and final decisions.
- Agent drafts, compares, implements, and surfaces tradeoffs.
- Reference skills provide source patterns.
- Evals test behavior under pressure.
- Baselines prove whether the plugin improves anything.

## Development Phases

### Phase 0: Reference Sync

Status: mostly complete.

Actions:

- Confirm Matt and Obra plugins are installed, enabled, and readable.
- Read the relevant source skills.
- Capture source-skill inventory and mapping.

### Phase 1: Plugin Contract

Define the stable contract before writing many skills:

- Plugin purpose.
- Three modes.
- Command surface.
- Bypass policy.
- User-owned decision rules.
- Artifact philosophy.
- Hook philosophy.
- Portability rules.

Output:

```text
docs/plugin-contract.md
```

### Phase 2: Behavior Evals

Create pressure scenarios before polishing skills.

Eval categories:

- Vague feature request.
- Bug report without reproducible steps.
- Implementation reveals a spec gap.
- Plan contains hidden product decision.
- User asks for quick conversation-mode answer.
- Strict-mode risky migration.
- Verification failure challenges original spec.
- Review feedback is ambiguous or partly wrong.

Each eval should define:

- Prompt.
- Expected good behavior.
- Failure modes to catch.
- Whether artifacts should be produced.
- Whether interview gate should fire.

Output:

```text
docs/workflow-behavior-evals.md
```

### Phase 3: Plugin Scaffold

Create the plugin only after the contract and eval shape are clear.

Expected structure:

```text
agent-workflow-plugin/
  .codex-plugin/
    plugin.json
  skills/
    workflow/
      SKILL.md
    interview-gate/
      SKILL.md
    ...
```

Do not add hooks in the first scaffold unless a specific hook is already justified.

### Phase 4: Core Skills First

Draft only the foundational skills first:

```text
workflow
interview-gate
verify-work
handoff
```

Reason:

- `workflow` defines the spine.
- `interview-gate` prevents silent decisions.
- `verify-work` prevents false completion.
- `handoff` preserves continuity without logging every step.

### Phase 5: Baseline Evals

Run each pressure scenario:

- Without the new skill.
- With the new skill.
- Optionally with Matt or Obra skill alone.

Judge whether the new plugin actually changes behavior:

- Did it ask when it should ask?
- Did it avoid asking when evidence was discoverable?
- Did it avoid unnecessary artifacts?
- Did it re-enter clarification when assumptions failed?
- Did it verify before claiming completion?
- Did it preserve user control?

### Phase 6: Add Secondary Skills

After core behavior works, add:

```text
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

Each secondary skill should be bounded: it should complete its job inside its state without requiring the whole workflow to be manually invoked.

### Phase 7: Hooks

Add hooks only after repeated failures prove a behavior needs mechanical reinforcement.

Candidate hooks:

- Warn or block destructive actions without approval.
- Warn before code edits in strict mode without a plan.
- Remind verification before completion in workflow/strict modes.
- Prevent direct mutation of protected artifacts where supersession is required.
- Recover active state after compaction only when a state artifact exists.

Hooks should be seatbelts, not the steering wheel.

### Phase 8: Dogfooding With Controls

Use the plugin on real tasks, but do not let it grade itself.

Controls:

- Keep user review gates.
- Compare behavior against baseline cases.
- Record failures as eval scenarios.
- Prefer small revisions over broad rewrites.
- Do not let the agent silently expand scope.

## Avoiding The Workflow Paradox

The workflow paradox:

> We are building a workflow using the agent that the workflow is supposed to control.

Mitigation:

- Use the unfinished workflow as an object of study, not as the authority.
- Keep human decision gates for product and philosophy.
- Write evals before declaring success.
- Run baselines without the skill.
- Compare against Matt and Obra behavior where useful.
- Treat agent self-assessment as weak evidence.
- Use independent review when available.
- Record repeated failures as test cases, not as excuses to add more prose.

The plugin should not be considered successful because its documents are persuasive. It should be considered successful only when it changes agent behavior under realistic pressure.

## Immediate Next Steps

Recommended next sequence:

1. Review this inventory and adjust the target skill list.
2. Write `docs/plugin-contract.md`.
3. Write `docs/workflow-behavior-evals.md`.
4. Scaffold the plugin directory.
5. Draft `workflow/SKILL.md`.
6. Draft `interview-gate/SKILL.md`.
7. Run the first baseline comparison.

Do not start by writing every skill. The first success condition is narrower:

> Can `workflow` plus `interview-gate` make the agent avoid silent decisions and recover from backward-flow situations without creating unnecessary ceremony?
