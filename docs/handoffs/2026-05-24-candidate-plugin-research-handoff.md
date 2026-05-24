# Handoff: Candidate Workflow Plugin Research

> Date: 2026-05-24
> Next session goal: start actual skill development for the candidate agent-workflow plugin.
> Working repo: `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research`
> Prior implementation repo: `/Users/mohammedhassanmohiddin/Documents/Antigravity/orchestra`

## Context

This conversation was forked from the main/original conversation to do deeper research before building the actual skills.

The plugin should not be called `orchestra` yet. It is a research-grade candidate. It earns the `orchestra` name only after evals prove it substantially improves agent behavior.

Hassan wants Matt Pocock-style skill writing: short, crisp, precise, high-leverage wording. Avoid AI slop, long procedural manuals, fixed bureaucracy, and verbose skill bodies.

## Existing Artifacts

This handoff is decision memory, not the full spec. Use it to orient the next session, then read only the docs needed for the immediate build step.

Read first:

- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/handoffs/2026-05-24-candidate-plugin-research-handoff.md`
- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/research/orchestra-current-v2-audit.md`
- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/plugin-contract.md`

Read next if needed:

- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/agent-workflow-plugin-context.md`
- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/skill-inventory-and-plugin-plan.md`
- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/workflow-behavior-evals.md`
- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/handoffs/2026-05-23-agent-workflow-plugin-development.md`

The older file below is superseded and should not be used as the main audit:

- `/Users/mohammedhassanmohiddin/Documents/Antigravity/Research/docs/research/orchestra-v1-repo-analysis.md`

Scope boundary:

- Do not restart broad research.
- Do not copy old `orchestra` files.
- Do not write long procedural skill files.
- Start with candidate plugin structure, first skills, and behavior eval skeleton.

## Decisions From This Fork

1. Do not reuse the `orchestra` name yet.

Use a temporary candidate name until evals show the plugin works.

2. Do not copy old repo files.

Use the old repo as failure evidence and prior art. Recreate only ideas that still hold up.

3. Use handoff as the first trusted memory artifact.

Matt Pocock-style handoff is the current best baseline. Other artifacts need separate design.

4. Do not persist review artifacts by default yet.

Review pipeline is unresolved. Persist reviews only when high-risk, useful as future memory, or explicitly requested.

5. Do not build `/teach` or `/violation` first.

Measure whether the basic plugin forgets/skips/drifts. Add correction capture only after evidence.

6. Do not build hooks first.

Evaluate normal plugin behavior first. Later compare hook-assisted behavior as an external intervention.

7. Prioritize portability and generalizability.

Core behavior should be agent-agnostic. Claude/Codex-specific mechanics should be adapters, not assumptions.

8. Migration to old repo is undecided.

Likely path: build fresh in `Research`, prove with evals, then copy into old published repo as a clean major replacement with migration note.

9. Avoid dogfooding paradox.

Do not use unfinished workflow as proof of itself. Use evals, manual decisions, and existing proven skills while building.

## Core Failure Lesson

The old plugin did not fail because the ideas were bad. It failed because the implementation became a process operating system.

Main failure pattern:

- deep grilling produced useful context
- converting context into a fixed-format spec introduced errors
- spec-review reliability was uncalibrated
- v1 reviewer passed too easily
- v2 adversarial/multi-judge reviewer almost never passed
- review loops created more broken docs, broken reviews, and broken fixes
- each failure added more gates, schemas, hooks, and files
- token/time cost grew while execution quality did not reliably improve

Key conclusion:

Better artifacts reduce review dependence. The first artifact from grilling/interview must be high quality. Review should be a feedback gate, not a bureaucracy factory.

## Design Principles

- Skills should be short enough to load and obey.
- Prefer behavioral pressure over exhaustive procedure.
- Use crisp verbs and strong trigger words.
- Ask the user before silent decisions.
- Keep workflow proportional to task risk.
- Allow backward re-entry when new information invalidates current state.
- Save artifacts only at durable boundaries.
- Verify before claiming success.
- Review must be allowed to pass.
- If review finds foundational gaps, return to interview/research instead of patch-looping.

## Initial Skill Set

Build these first:

1. `mode-contract`

Defines three modes:

- conversation
- workflow
- strict-workflow

User controls mode. Agent may recommend switching mode when risk/context requires it.

2. `interview-gate`

Fires anywhere when:

- context is low
- scope is ambiguous
- agent would make a user-owned decision
- implementation reveals unknowns
- review finds foundational gaps
- agent is about to silently choose between tradeoffs

3. `workflow`

Ordered forward flow:

- clarify/research
- decision/spec
- plan
- execute
- review
- verify
- handoff

Legal backward edge: return to clarify/research from any state.

4. `handoff-memory`

Compact memory artifact for context transfer. Use Matt Pocock handoff style as baseline.

5. Behavior evals

Evals should compare baseline agent vs plugin-guided agent.

## Evals To Write Early

Use behavior-first evals before hooks or CLI enforcement.

Scenarios:

- ambiguous request triggers interview gate
- small request stays conversation mode
- consequential task enters workflow mode or recommends it
- user can manually override mode
- implementation surprise routes back to clarification
- review findings do not cause endless patch loops
- review can pass
- no unnecessary docs are created
- handoff preserves enough context for a fresh session
- outputs stay crisp and non-sloppy

## What To Avoid

- copying old `orchestra` skills/docs
- hard "no code without design doc"
- full doc taxonomy
- controlled vocabulary canon
- transition logs for every state
- persistent review YAML by default
- multi-judge review as default
- hooks as first-line memory reinforcement
- `/teach` and `/violation` before evidence
- shipping old command compatibility before new behavior works
- long procedural skill files

## Suggested Skills

Use these in the next session:

- `mattpocock-skills:write-a-skill` or `write-a-skill` when drafting skill files.
- `skill-creator:skill-creator` when evaluating/improving skill behavior and trigger descriptions.
- `mattpocock-skills:grill-me` if design decisions need deeper interrogation.
- `mattpocock-skills:handoff` for future context transfer.
- `superpowers:writing-plans` only after the skill design is clear enough for an implementation plan.

Avoid using heavy workflow skills prematurely. The plugin under construction should not validate itself.

## Immediate Next Step

Return to the original conversation. Read this handoff and the referenced audit. Then start development with the smallest viable candidate:

1. create candidate plugin structure
2. draft `mode-contract`
3. draft `interview-gate`
4. draft `workflow`
5. write behavior eval cases before adding enforcement

Keep every `SKILL.md` short, sharp, and testable.
