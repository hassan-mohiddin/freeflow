---
name: write-skill
description: Create or revise agent skills. Use when defining a skill's trigger description, active instructions, stop conditions, structure, examples, references, scripts, or readiness status.
---

# Write Skill

> Status: Unverified v2 candidate

Write the smallest agent-first skill that changes the target behavior.

## Before Writing

- Name the behavior, trigger, pressure, and failure the skill must handle.
- Inspect live repo conventions and existing evidence before inventing structure.
- Treat an explicit draft request as a draft. Do not force evaluation.
- Treat production-ready as an evidence claim. If behavior is unevaluated, label it Draft or Unverified.
- Follow user constraints. Permission to skip work is not pressure to ignore; a prohibition is a prohibition.
- For a new skill, the first deliverable is one `SKILL.md`. "Add references, examples, or scripts if useful" is permission, not evidence that they are needed.

## Authoring Rules

1. Start with one `SKILL.md`. Add another file only when a live repo rule requires it or a measured failure cannot be fixed clearly in the active file. Hypothetical usefulness, completeness, polish, or examples do not qualify.
2. Make the description state what the skill does and when it should activate.
3. Write for the agent that will execute the skill, not for a human reading a manual.
4. Put user authority, source truth, hard stops, and safety before normal workflow.
5. Use direct rules that prevent a named failure. Remove explanation that does not route, constrain, stop, or guide behavior.
6. Add references only for conditional depth. Add scripts only for repeated deterministic work that is risky or wasteful to retype.
7. Link every resource directly from `SKILL.md` and state when to read or run it.

Do not add README files, changelogs, examples, references, or scripts merely because the user asks for something "complete" or says extras may materially improve it. Name the exact rule or measured failure that makes each resource necessary; otherwise keep one file.

## Activation Boundaries

Descriptions are routing contracts:

- include the job and concrete trigger situations;
- exclude generic helper language and quality claims;
- cover true requests without hijacking nearby work;
- test a positive trigger and a near-miss non-trigger before claiming production readiness.

Read [activation boundaries](references/activation-boundaries.md) when the skill under-triggers, over-triggers, or overlaps another skill.

## Revision Loop

- Preserve the failing situation or reuse an adequate existing eval unchanged.
- Change one measured pressure point: description, wording, placement, stop condition, structure, or resource.
- Re-run the failed candidate side first.
- Keep unrelated text stable.
- Report the evidence and remaining gaps; do not promote status from prose quality alone.

Read [agent-first instructions](references/agent-first-instructions.md) when wording or placement is the failure. Read [progressive disclosure](references/progressive-disclosure.md) before adding resources. Read [the development loop](references/development-loop.md) when moving from Draft to Production-Ready.

## Bundled Tool

Use `node scripts/skill-author.mjs init|validate|inspect` for deterministic structure work. `validate` proves structural facts. `inspect` reports advisory signals only; neither proves behavior.

## Stop

Stop and ask when the requested public behavior, activation boundary, safety rule, or compatibility choice is owner-owned and unclear. If required production evidence is forbidden or unavailable, ask which claim should change.
