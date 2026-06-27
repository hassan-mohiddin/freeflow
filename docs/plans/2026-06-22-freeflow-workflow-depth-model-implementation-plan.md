> **Doc ID:** PLAN-2026-06-22-freeflow-workflow-depth-model
> **Date:** 2026-06-22
> **Owner:** Hassan Mohiddin
> **Type:** Plan
> **Status:** In progress
> **Source:** `docs/designs/freeflow-workflow-depth-model.md`

# Freeflow Workflow Depth Model Implementation Plan

## Goal

Implement the workflow-depth direction as an actual Freeflow surface change, not a thin alias:

1. make `discover` the active discovery skill and `/discover` the direct command;
2. remove the old `research` skill directory from the runtime surface;
3. expand `design-for-depth` with real software design philosophy coverage;
4. revisit phase skills so they use the richer lens correctly;
5. add/update eval artifacts before claiming the behavior is proven.

## Source Authority

Primary design note:

- `docs/designs/freeflow-workflow-depth-model.md`

Source context:

- `CONTEXT.md`
- `docs/freeflow-runtime-and-lifecycle.md`
- `docs/README.md`
- `plugin-docs/workflow.md`
- `plugin-docs/architecture.md`
- `plugin-docs/skills.md`
- `command-surface.json`
- `pi-extension/index.js`
- `skills/discover/SKILL.md`
- `skills/design-for-depth/SKILL.md`
- `skills/workflow/SKILL.md`
- `skills/write-spec/SKILL.md`
- `skills/write-plan/SKILL.md`
- `skills/review-artifact/SKILL.md`
- `skills/execute-plan/SKILL.md`
- `skills/review-work/SKILL.md`
- `skills/diagnose-failure/SKILL.md`
- `evals/README.md`
- `evals/registries/fixture-evals.json`
- `evals/registries/skill-evidence.json`

Research inputs, not authority:

- Matt Pocock `improve-codebase-architecture` skill language.
- Ousterhout/Parnas/Feathers/ports-adapters software design ideas summarized in the design note.
- `docs/handoffs/2026-06-21-agent-skills-comparison-handoff.md`.

## Non-Goals

Do not:

- keep `research` as a normal active skill name;
- make `design-for-depth` always-loaded runtime context;
- add enforcement hooks;
- add fixed artifact destinations such as `SPEC.md` or `tasks/plan.md`;
- rewrite Freeflow into a broad engineering playbook;
- copy large text from source books or other skill packs;
- claim the new behavior is proven until evals/reviews support it.

## Working Rules

- `discover` owns evidence gathering, codebase exploration, external-source checking, brainstorming, targeted questions, decision ledgers, and checkpoints.
- `design-for-depth` owns module/interface/seam/depth/locality/leverage guidance.
- Phase skills should use short trigger/local application wording, not duplicate the full design lens.
- `design-for-depth` may exceed the normal 100-line target because this is intentionally a deeper skill.
- Preserve source-truth, user-owned-decision, artifact, review-loop, and verification gates.
- Keep Pi direct command registration and command-surface metadata in sync.

## Slices

### Slice 1: Discover Migration

- Move runtime skill files from `skills/research/` to `skills/discover/`.
- Remove the old compatibility `LANGUAGE.md`; design language now belongs to `design-for-depth`.
- Update `discover/SKILL.md`, `CHECKPOINTS.md`, and `ARTIFACT-DESTINATIONS.md` to use discovery language.
- Update command surface and Pi command registration so `/discover` routes to `discover`.
- Do not keep `/research` in the current command surface unless a later compatibility decision restores it.

### Slice 2: Design-For-Depth Expansion

- Expand `design-for-depth/SKILL.md` with Freeflow-native coverage of:
  - Ousterhout: complexity, deep modules, strategic programming;
  - Parnas: information hiding and likely-changing decisions;
  - Feathers: seams and enabling points;
  - ports/adapters: core behavior protected from infrastructure variation;
  - refactoring pressure: shotgun surgery, god modules, leaky interfaces, pass-through wrappers, scattered policy.
- Keep the skill operational: trigger, tests, design moves, anti-patterns, workflow use, routes, and non-goals.
- Do not turn it into mandatory upfront architecture ceremony.

### Slice 3: Cross-Skill Revisit

Update phase skills against the richer lens:

- `workflow`: discover as the backward edge and phase name.
- `write-spec`: specs preserve open decisions and avoid polished design guesses.
- `write-plan`: unclear seams/interfaces/locality route to design-for-depth before executable steps.
- `review-artifact`: artifact review includes design depth where artifacts encode module/interface decisions.
- `execute-plan`: complexity spread during slices routes backward before patching forward.
- `review-work`: repeated findings and edge-case churn are design pressure.
- `diagnose-failure`: repeated workflow-loop failure diagnoses shallow discovery, bad slices, and shallow modules.

### Slice 4: Evals And Metadata

- Update command-surface eval metadata so `CMD-012` covers `/discover`.
- Rename discovery skill evidence from `research` to `discover`.
- Add `DFD-001` for scattered notification policy / design pressure.
- Update command-surface audit so registry/Pi drift is caught.
- Run focused metadata/audit checks.

### Slice 5: Docs

- Update plugin docs, release ADRs, runtime lifecycle docs, and project language so active behavior says `discover`.
- Leave only true historical paths or deprecated command names with old wording.

## Stop Conditions

Stop before:

- changing native slash-handler policy or `nativeSlashHandlers`;
- adding runtime hooks or always-loading `design-for-depth`;
- adding broad domain skills beyond this lens;
- changing mode behavior;
- weakening source-truth/user-owned decision rules;
- making `design-for-depth` mandatory for all tasks;
- rewriting eval harness conventions.

## Verification

Run after implementation:

- `git diff --check`
- `evals/scripts/audit-command-surface.sh`
- JSON parsing for eval registries
- focused review of skill changes

Report remaining unverified eval behavior separately from completed metadata checks.
