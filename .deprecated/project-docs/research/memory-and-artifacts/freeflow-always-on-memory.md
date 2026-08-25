# Freeflow Always-On Memory

Date: 2026-05-25

## Decision

Freeflow should install a small always-on runtime contract for each host agent, then keep full workflow behavior in progressive skills.

Always-load invariants. Progressively load procedure. Mechanically enforce only after evals prove wording fails.

## Why

Freeflow needs to survive cold starts, fresh conversations, and compaction. The agent should remember Freeflow's core behavior before it decides whether to invoke a skill.

But always-loaded text is expensive and easy to overfit. It should contain only invariants that must be active for normal interaction:

- use Freeflow for consequential work
- read default mode from `.freeflow/config.json`
- move forward when context is sufficient
- re-enter clarification when ambiguity changes the next action
- ask before user-owned decisions
- treat live repo evidence and source-truth docs/tests as authority
- verify before completion claims
- capture stable decisions only

Everything else belongs in skills.

## Recommended Core Block

Use this as the source text for host-specific activation:

```md
## Freeflow

Use Freeflow for consequential work. Default mode: `.freeflow/config.json`.

Move forward when context is sufficient. Re-enter clarification when new ambiguity would change the next action.

Ask before user-owned decisions: product behavior, scope, public APIs, security, privacy, billing, data loss, compatibility, permissions, or irreversible architecture.

Treat live repo evidence and existing docs/tests as source truth. If the user request conflicts with them, stop and ask before changing behavior.

Verify before completion claims. Capture only stable decisions, glossary terms, ADR-worthy tradeoffs, or useful handoff memory.
```

This replaces the current weaker setup block only after evals confirm the change improves behavior without adding ceremony.

## Codex Implementation

Codex always-on behavior should use `AGENTS.md` or `AGENTS.override.md`.

Setup should create:

```text
.freeflow/config.json
```

and update the chosen instruction file:

```text
AGENTS.md
```

Do not use `.codex/rules/*.rules` for Freeflow behavior. Codex rules are shell approval/security policy. They are loaded by the runtime, but not as model memory.

Use `.codex/rules/*.rules` only for hard shell policy, such as blocking `git push`, deploys, destructive commands, or requiring approval for publish actions.

Codex skills remain the main portable mechanism:

```text
.agents/skills/<skill>/SKILL.md
```

or installed plugin skills.

## Claude Implementation

Claude should use `CLAUDE.md` plus an imported Freeflow core file.

Recommended structure:

```text
CLAUDE.md
.claude/rules/freeflow-core.md
.freeflow/config.json
```

In `CLAUDE.md`:

```md
## Freeflow

@.claude/rules/freeflow-core.md
```

Put the recommended core block in `.claude/rules/freeflow-core.md`.

Prefer this explicit import over assuming a `.claude/rules/` directory is automatically loaded. Anthropic documents `CLAUDE.md` memory files and `@path` imports as the stable mechanism.

## Do Not Split Yet

Do not create four rule files initially.

Rejected initial split:

```text
freeflow-mode-contract.md
freeflow-interview-gate.md
freeflow.md
freeflow-capture-decisions.md
```

Reason: splitting increases drift and makes setup heavier before evals prove the need.

Start with:

```text
freeflow-core.md
```

Split later only if evals show a specific invariant is repeatedly missed.

Possible future split:

```text
freeflow-mode-contract.md
freeflow-interview-gate.md
freeflow-source-truth.md
freeflow-capture-memory.md
```

`freeflow-source-truth.md` is worth naming separately if splitting happens. Source-truth conflict failures have shown high behavioral risk in Freeflow evals.

## Skill Boundary

Always-on memory should not contain the full workflow spine, artifact formats, or review procedure.

Keep these in skills:

- `mode-contract`: mode inference and mode switching
- `workflow`: forward workflow, backward edge, artifact rule, source-truth conflicts
- `interview-gate`: user-owned decisions and ambiguity
- `capture-decisions`: durable memory destination rules
- `write-spec`, `write-plan`, `review-artifact`: artifact workflows
- `verify-work`, `review-work`, `handoff`: closeout workflows

The core block should make the agent safer before skill selection. It should not become a second copy of the skills.

## Setup Implication

`setup-freeflow` should eventually support host-specific setup:

- Codex target: update `AGENTS.md`.
- Claude target: update `CLAUDE.md` and optionally create `.claude/rules/freeflow-core.md` imported by `CLAUDE.md`.
- Multi-agent target: update both, while warning about drift.

Hard stops still apply:

- ambiguous host target
- existing repo rules conflict with asking before user-owned decisions
- existing repo rules conflict with verification before completion claims
- creating imported rule files would introduce a new convention the user did not approve

## Evals Needed

Add setup/runtime evals before changing the setup skill:

1. Codex setup strengthens `AGENTS.md` with the compact source-truth/interview/verification core.
2. Claude setup creates `CLAUDE.md` import plus `.claude/rules/freeflow-core.md` only when Claude is the clear target.
3. Both files exist and target is ambiguous: setup asks before editing.
4. User asks for four rule files: setup recommends one `freeflow-core.md` unless user confirms split.
5. Source-truth conflict after setup: agent stops and asks instead of rewriting docs/tests.

## Evidence Pointers

- `docs/freeflow-runtime-and-lifecycle.md`
- `skills/setup-freeflow/SKILL.md`
- `skills/mode-contract/SKILL.md`
- `skills/workflow/SKILL.md`
- `skills/interview-gate/SKILL.md`
- `skills/capture-decisions/SKILL.md`
- OpenAI Codex docs: `AGENTS.md`, skills, rules, memories
- Anthropic Claude Code docs: memory files and `CLAUDE.md` imports
