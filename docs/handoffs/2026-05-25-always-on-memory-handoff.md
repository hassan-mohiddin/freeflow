# Handoff: Pilot Always-On Memory

Date: 2026-05-25

## Purpose

Continue implementation planning for Pilot Workflow host setup: how to keep Pilot's core behavior active across new conversations, cold starts, and compaction without turning skills into always-loaded manuals.

## Read First

- `docs/research/pilot-workflow-always-on-memory.md`
- `docs/pilot-workflow-runtime-and-lifecycle.md`
- `plugins/pilot-workflow/skills/setup-pilot-workflow/SKILL.md`
- `plugins/pilot-workflow/skills/workflow/SKILL.md`
- `plugins/pilot-workflow/skills/interview-gate/SKILL.md`
- `plugins/pilot-workflow/skills/mode-contract/SKILL.md`
- `plugins/pilot-workflow/skills/capture-decisions/SKILL.md`
- latest setup eval report: `plugins/pilot-workflow/evals/setup-pilot-workflow-1-report.md`

## Current Decision

Use a thin always-on runtime contract plus progressive skills.

Do not use Codex `.codex/rules/*.rules` for behavior. Those are shell approval/security policy, not model memory.

Do not create four always-loaded rule files yet. Start with one compact core block/file. Split only if evals show a repeated missed invariant.

## Recommended Shape

Codex:

```text
AGENTS.md
.pilot-workflow/config.json
```

Claude:

```text
CLAUDE.md
.claude/rules/pilot-core.md
.pilot-workflow/config.json
```

Claude `CLAUDE.md` should explicitly import:

```md
@.claude/rules/pilot-core.md
```

## Core Invariants

The always-on block should cover only:

- use Pilot for consequential work
- default mode comes from `.pilot-workflow/config.json`
- move forward when context is sufficient
- re-enter clarification when ambiguity changes the next action
- ask before user-owned decisions
- treat live docs/tests/repo evidence as source truth
- verify before completion claims
- capture stable decisions only

Full workflow behavior stays in skills.

## Suggested Skills

- `skill-creator`: when editing `setup-pilot-workflow` or adding evals.
- `write-a-skill`: for Matt-style compression of setup wording.
- `review-artifact`: after drafting setup changes or eval design.
- `verify-work`: before claiming implementation is done.

## Next Steps

1. Draft eval cases for host-specific setup behavior.
2. Update `setup-pilot-workflow` only after eval intent is clear.
3. Add Codex setup behavior first.
4. Add Claude import behavior second.
5. Rerun setup evals and add at least one source-truth conflict check.

## Guardrails

- Do not make `.codex/rules` carry behavioral instructions.
- Do not duplicate full skill bodies into `AGENTS.md` or `CLAUDE.md`.
- Do not create `.claude/rules/` files unless Claude is the target or the user asks for multi-agent setup.
- Do not update both `AGENTS.md` and `CLAUDE.md` silently.
- Keep the activation text short enough to survive real repos with existing rules.
