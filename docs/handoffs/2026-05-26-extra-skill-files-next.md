# Freeflow Extra Skill Files Handoff

Date: 2026-05-26

## Purpose

Continue Freeflow work by deciding whether selected broad skills need extra files such as references, scripts, assets, or examples.

Do not start with the v0.1 acceptance suite yet. Hassan wants to do that later after a few more implementation/update ideas.

## Current State

The repo is ready for Hassan's local dogfooding in other repos.

Current evidence:

- Plugin draft lives under `plugins/freeflow/`.
- There are 19 skills under `plugins/freeflow/skills/`.
- Every `SKILL.md` is under the 100-line project budget.
- Command-surface coverage is complete for the current registry:
  - 3 mode commands
  - 13 direct skill calls
  - 2 developer skill calls
- Native slash handlers remain disabled. Commands are model-routed.
- Live Claude evals are deferred because local Claude auth/model access is unavailable.
- v0.1 acceptance suite is deferred by user choice.

Use these current evidence files first:

- `plugins/freeflow/evals/command-surface-matrix.md`
- `plugins/freeflow/evals/command-surface-15-report.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `docs/skill-inventory-and-plugin-plan.md`

## Next Focus

Assess extra files for these five skills, in priority order:

1. `setup-freeflow`
2. `evaluate-skill`
3. `commit-work`
4. `write-spec`
5. `write-plan`

The goal is not to add files because the skills are broad. Add files only when they:

- keep the active `SKILL.md` short
- reduce repeated deterministic work
- prevent a measured behavior failure
- make host/setup/eval details easier to load only when needed

## Initial Recommendation

Start with `setup-freeflow`.

Reason: it has exact Codex/Claude activation blocks, host-target rules, config shape, and verification rules. It is close to the 100-line budget and has stable reusable content.

Likely useful additions:

- `references/host-setup.md` for Codex vs Claude setup rules, drift risk, and verification.
- Possibly an activation block reference or asset if it keeps `SKILL.md` cleaner.

Do not add scripts yet unless a deterministic validation script clearly beats direct shell checks.

Second candidate: `evaluate-skill`.

Likely useful addition:

- `references/eval-patterns.md` for fixture evals, transcript evals, baseline vs with-skill grading, and local-only Codex evaluation patterns.

Do not copy Anthropic's skill creator docs into Freeflow. Keep the dependency/reference explicit.

Third candidate: `commit-work`.

Likely useful addition only if needed:

- `references/staging-decisions.md` for commit inclusion/exclusion examples.

Do not add scripts for ordinary git commands. The skill already tells agents to run `git status`, `git diff`, `git diff --cached`, and untracked-file checks directly.

Fourth and fifth candidates: `write-spec` and `write-plan`.

Only add references/templates if real dogfooding shows repeated vague or bloated artifacts. Avoid adding generic spec/plan templates that make every repo look the same.

## Suggested Skills

Use:

- `write-skill` when adding or reshaping skill files.
- `evaluate-skill` if a real failure should become an eval before changing wording.
- `review-artifact` for reviewing new reference files before committing.
- `commit-work` when closing out the change.

## Stop Conditions

Stop before editing if the next agent is tempted to:

- add references to all five skills at once
- add scripts for commands agents can already run directly
- move stable rules out of `SKILL.md` when they must be active immediately
- copy large chunks of Anthropic, Matt, Obra, or Orchestra docs into Freeflow
- exceed the 100-line budget for any `SKILL.md`

## Deferred Work

After this extra-file pass, the next larger work is still:

1. Define and run a local-only v0.1 acceptance suite.
2. Run Claude smoke evals only when local Claude auth/model access is available.
