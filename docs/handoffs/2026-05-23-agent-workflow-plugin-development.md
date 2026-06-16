# Agent Workflow Plugin Development Handoff

## Purpose

Use this handoff to continue development of the agent workflow plugin from a fresh or forked conversation without repasting the full prior discussion.

## Current State

We are designing a portable plugin/skill pack for coding agents such as Codex, Claude Code, and similar environments.

The plugin should guide agents through consequential work without becoming bureaucratic or producing AI slop.

Core thesis:

> Use a lightweight forward workflow by default. When new ambiguity, missing context, or invalidated assumptions appear, re-enter clarification instead of silently patching forward.

## Canon Documents

Read in this order:

1. `docs/research/agent-workflow-plugin-context.md`
   - Captures the original product direction and reasoning.
2. `docs/plans/skill-inventory-and-plugin-plan.md`
   - Canon-frozen for development planning as of 2026-05-23.
   - Maps Matt Pocock, Obra/Superpowers, and Anthropic skill-creator patterns into our planned plugin.
3. `docs/plugin-contract.md`
   - Current implementation contract.
   - Defines modes, command surface, bypass, interview gate, artifacts, state, hooks, portability, and first acceptance criteria.
4. `docs/research/workflow-behavior-evals.md`
   - Pressure scenarios for testing whether the skills actually improve agent behavior.

## Reference Plugins

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

Installed/enabled status was checked in `~/.codex/config.toml`:

```text
superpowers@openai-curated = enabled
mattpocock-skills@personal = enabled
skill-creator@claude-plugins-official = enabled
caveman@caveman-repo = enabled
```

## Frozen Decisions

- Exactly three modes: Conversation, Workflow, Strict Workflow.
- Workflow Mode is the main/default work mode.
- Conversation Mode disables workflow pressure.
- Strict Workflow Mode exists but is not the first optimization target.
- Universal backward edge goes through the interview gate.
- Bypass defaults to one-action.
- Hooks come after core skill behavior and evals.
- Initial core skills are `mode-contract`, `workflow`, `interview-gate`, `verify-work`, and `handoff`.
- Artifacts/specs/docs/handoffs are the lightweight memory layer.
- Crisp communication is part of the plugin philosophy.
- The candidate plugin should not use the `orchestra` name until evals prove it deserves that name.
- The old Orchestra repo is failure evidence and prior art, not a source tree to copy.

## Not Frozen

- Final plugin name.
- Exact command aliases.
- Exact artifact directory names.
- Exact hook implementation.
- Exact eval prompt wording.
- Exact skill body wording.

## Target Initial Skills

Build only the first core skills first:

```text
mode-contract
workflow
interview-gate
verify-work
handoff
```

Do not start by writing every skill.

First success question:

> Can `workflow` plus `interview-gate` make the agent avoid silent decisions and recover from backward-flow situations without creating unnecessary ceremony?

## Initial Eval Set

Start with:

```text
WF-001 Vague Feature Request
WF-002 Conversation Mode Quick Analysis
WF-005 Implementation Reveals Spec Gap
WF-010 Artifact As Memory Layer
```

Before calling the first implementation usable, add:

```text
WF-007 Verification Failure Changes Direction
WF-011 Crisp Communication
```

## Development Method

Do not use the unfinished workflow plugin as the authority while building it.

Use:

```text
Research -> Draft -> Human Review -> Eval -> Revise
```

Role separation:

- User owns product decisions and philosophy.
- Agent drafts, compares, implements, and surfaces tradeoffs.
- Reference skills provide patterns.
- Evals test behavior.
- Baselines prove whether the skill changes anything.

## Immediate Next Step

Scaffold the plugin only after confirming the handoff is sufficient.

Recommended next sequence:

1. Choose plugin name/path.
2. Scaffold plugin directory with `.codex-plugin/plugin.json` and `skills/`.
3. Draft `skills/mode-contract/SKILL.md`.
4. Draft `skills/workflow/SKILL.md`.
5. Draft `skills/interview-gate/SKILL.md`.
6. Convert the initial eval set into machine-readable eval prompts.
7. Run baseline vs with-skill comparison.
8. Revise before adding more skills.

## Communication Preference

Keep outputs crisp.

Avoid:

- Long process narration.
- Generic praise.
- Repeating existing docs.
- Volatile repo summaries.
- Premature implementation.

Prefer:

- Findings and decisions first.
- Short reasoning.
- Concrete next action.
- File references when useful.
