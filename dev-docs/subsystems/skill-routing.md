# Skill Routing And Dependencies

This contributor map describes current ownership and explicit links in active skill bodies. It is not a mandatory sequence, authorization source, or replacement for the skills themselves.

- **Owner:** the job the skill controls.
- **Routes / composition:** sibling skills directly Markdown-linked for a changed condition or composed method.
- **References:** agent-facing references or scripts directly linked for reading or execution at the condition named by the active body.

Workflow chooses the current owner. A linked skill does not run automatically, and a reference link does not imply a route.

## Core, Discussion, And Memory

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`action-selection`](../../skills/action-selection/SKILL.md) | Select, bound, execute, and learn from one uncertain or broad environment interaction | `diagnose-failure`, `execute-work`, `workflow` | [`trajectory-stalls`](../../skills/action-selection/references/trajectory-stalls.md) |
| [`workflow`](../../skills/workflow/SKILL.md) | Work agreement, readiness, Interaction Lifecycle, Feedback Loop, narrow re-entry, selected checkpoints, Supported Exit | `action-selection`, `agree-work`, `bypass`, `commit-work`, `design-for-depth`, `diagnose-failure`, `discuss`, `execute-work`, `finish-branch`, `handoff`, `launch-work`, `migration-work`, `release-work`, `review-work`, `simplify-code`, `track-work`, `verify-work`, `write-docs`, `write-plan`, `write-spec` | [`domain-skill-composition`](../../skills/workflow/references/domain-skill-composition.md) |
| [`agree-work`](../../skills/agree-work/SKILL.md) | The agreement and decision list before building, user-owned choices and source conflicts during the work, and the list at self-review and hand-over | `bypass`, `discuss`, `finish-branch`, `review-work`, `track-work`, `workflow` | [`Interaction Contract`](../../runtime/prompts/interaction-contract.md) |
| [`discuss`](../../skills/discuss/SKILL.md) | Collaborative outcome/approach understanding and bounded learning assessment | `action-selection`, `agree-work`, `design-for-depth`, `diagnose-failure`, `execute-work`, `track-work`, `workflow`, `write-plan`, `write-spec` | [`discussion-continuity`](../../skills/discuss/references/discussion-continuity.md) |
| [`track-work`](../../skills/track-work/SKILL.md) | Durable task memory, state reconstruction, Current Slice lifecycle, decisions, checkpoints, proposals, Slice-local evidence, and reconciliation | `agree-work`, `discuss`, `execute-work`, `handoff`, `workflow`, `write-docs`, `write-plan`, `write-spec` | [`projects`](../../skills/track-work/references/projects.md), [`working-record-format`](../../skills/track-work/references/working-record-format.md), [`working-record`](../../skills/track-work/scripts/working-record.mjs) |
| [`bypass`](../../skills/bypass/SKILL.md) | Scoped reduction of optional pressure inside accepted work | `agree-work`, `track-work`, `workflow` | None |
| [`design-for-depth`](../../skills/design-for-depth/SKILL.md) | Compositional design lens for boundaries, interfaces, ownership, state, and failure | `agree-work`, `diagnose-failure`, `simplify-code`, `workflow` | [`design-pressure-signals`](../../skills/design-for-depth/references/design-pressure-signals.md), [`implementation-decisions`](../../skills/design-for-depth/references/implementation-decisions.md), [`interface-design-loop`](../../skills/design-for-depth/references/interface-design-loop.md), [`module-and-dependency-design`](../../skills/design-for-depth/references/module-and-dependency-design.md), [`state-and-failure-boundaries`](../../skills/design-for-depth/references/state-and-failure-boundaries.md) |

## Artifacts, Review, And Evidence

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`write-spec`](../../skills/write-spec/SKILL.md) | Stable accepted durable content | `agree-work`, `design-for-depth`, `discuss`, `review-work`, `track-work` | [`artifact-standards`](../../skills/write-spec/references/artifact-standards.md), [`decision-records`](../../skills/write-spec/references/decision-records.md), [`spec-shapes`](../../skills/write-spec/references/spec-shapes.md) |
| [`write-plan`](../../skills/write-plan/SKILL.md) | Stable ordered execution strategy | `agree-work`, `commit-work`, `diagnose-failure`, `discuss`, `review-work`, `track-work` | [`plan-shapes`](../../skills/write-plan/references/plan-shapes.md) |
| [`write-docs`](../../skills/write-docs/SKILL.md) | Documentation of how existing software works and why, kept current with the code | `write-plan`, `write-spec` | [`documentation-shapes`](../../skills/write-docs/references/documentation-shapes.md), [`decision-records`](../../skills/write-spec/references/decision-records.md), [`docs-check`](../../skills/write-docs/scripts/docs-check.mjs) |
| [`review-work`](../../skills/review-work/SKILL.md) | Self-review or selected independent judgment of work, a guiding artifact, a report or record of work done, or an eval definition; the review gate at a hand-over; adjudication of a returned review; the judge contract for any model verdict used as evidence | `agree-work`, `diagnose-failure`, `discuss`, `execute-work`, `verify-work`, `workflow` | [`adjudication`](../../skills/review-work/references/adjudication.md), [`artifact`](../../skills/review-work/references/artifact.md), [`eval-definition`](../../skills/review-work/references/eval-definition.md), [`judge-contract`](../../skills/review-work/references/judge-contract.md), [`report-and-record`](../../skills/review-work/references/report-and-record.md), [`review-gate`](../../skills/review-work/references/review-gate.md), [`reviewer-contract`](../../skills/review-work/references/reviewer-contract.md), [`work`](../../skills/review-work/references/work.md) |
| [`verify-work`](../../skills/verify-work/SKILL.md) | Active-agent factual claim verification | `action-selection`, `agree-work`, `diagnose-failure`, `workflow` | [`browser-runtime-evidence`](../../skills/verify-work/references/browser-runtime-evidence.md), [`integration-evidence`](../../skills/verify-work/references/integration-evidence.md), [`performance-evidence`](../../skills/verify-work/references/performance-evidence.md), [`project-recipe`](../../skills/verify-work/references/project-recipe.md), [`test-design`](../../skills/verify-work/references/test-design.md), [`work`](../../skills/review-work/references/work.md), [`test-changes`](../../skills/verify-work/scripts/test-changes.mjs) |
| [`map-features`](../../skills/map-features/SKILL.md) | Set up and recheck a project's live-verification recipe: feature map, shared guide, and helper | `verify-work`, `write-docs` | [`documentation-shapes`](../../skills/write-docs/references/documentation-shapes.md), [`driving-surfaces`](../../skills/map-features/references/driving-surfaces.md) |

## Execution And Delivery

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`execute-work`](../../skills/execute-work/SKILL.md) | Bounded preparation, implementation or learning execution, evidence, and in-Slice continuation | `action-selection`, `agree-work`, `design-for-depth`, `diagnose-failure`, `discuss`, `review-work`, `simplify-code`, `track-work`, `verify-work`, `workflow`, `write-docs` | [`code-practices`](../../skills/execute-work/references/code-practices.md), [`execute-work-edges`](../../skills/execute-work/references/execute-work-edges.md), [`domain-skill-composition`](../../skills/workflow/references/domain-skill-composition.md), [`test-design`](../../skills/verify-work/references/test-design.md) |
| [`simplify-code`](../../skills/simplify-code/SKILL.md) | Behavior-preserving simplification | `design-for-depth`, `diagnose-failure`, `migration-work`, `verify-work`, `workflow` | [`code-practices`](../../skills/execute-work/references/code-practices.md), [`simplification-patterns`](../../skills/simplify-code/references/simplification-patterns.md), [`test-design`](../../skills/verify-work/references/test-design.md) |
| [`migration-work`](../../skills/migration-work/SKILL.md) | Consumer, state, configuration, or traffic movement and removal proof | `agree-work`, `design-for-depth`, `discuss`, `launch-work`, `release-work`, `verify-work`, `workflow`, `write-spec` | [`migration-lifecycle`](../../skills/migration-work/references/migration-lifecycle.md) |
| [`diagnose-failure`](../../skills/diagnose-failure/SKILL.md) | Supported cause for unexplained, repeated, flaky, or performance failure | `action-selection`, `agree-work`, `design-for-depth`, `execute-work`, `simplify-code`, `track-work`, `verify-work`, `workflow` | [`diagnostic-loop-catalog`](../../skills/diagnose-failure/references/diagnostic-loop-catalog.md), [`flaky-and-performance-diagnosis`](../../skills/diagnose-failure/references/flaky-and-performance-diagnosis.md) |
| [`commit-work`](../../skills/commit-work/SKILL.md) | Authorized coherent commit or simple push | `finish-branch`, `track-work`, `workflow` | [`git-state-edges`](../../skills/commit-work/references/git-state-edges.md), [`simple-push`](../../skills/commit-work/references/simple-push.md), [`staging-decisions`](../../skills/commit-work/references/staging-decisions.md) |
| [`handoff`](../../skills/handoff/SKILL.md) | Point-in-time continuation transfer | `agree-work`, `track-work`, `workflow` | [`handoff-templates`](../../skills/handoff/references/handoff-templates.md) |
| [`finish-branch`](../../skills/finish-branch/SKILL.md) | Inspect integration readiness and execute only an owner-selected merge, PR, keep, or discard route | `agree-work`, `commit-work`, `diagnose-failure`, `handoff`, `launch-work`, `release-work`, `verify-work`, `workflow` | [`integration-options`](../../skills/finish-branch/references/integration-options.md) |
| [`release-work`](../../skills/release-work/SKILL.md) | Versioned artifact preparation and publication | `agree-work`, `launch-work`, `migration-work`, `verify-work`, `workflow` | [`release-evidence`](../../skills/release-work/references/release-evidence.md) |
| [`launch-work`](../../skills/launch-work/SKILL.md) | Production deployment, exposure, observation, and recovery | `agree-work`, `diagnose-failure`, `migration-work`, `release-work`, `verify-work`, `workflow` | [`launch-readiness`](../../skills/launch-work/references/launch-readiness.md) |

## Contributor Skills

| Skill | Owner | Routes / composition | References / scripts |
| --- | --- | --- | --- |
| [`setup-freeflow`](../../skills/setup-freeflow/SKILL.md) | Layered activation, repair, same-turn context, and delivery reporting | `agree-work`, `workflow` | [`Interaction Contract`](../../runtime/prompts/interaction-contract.md), [`activation-contract`](../../skills/setup-freeflow/references/activation-contract.md), [`host-setup`](../../skills/setup-freeflow/references/host-setup.md) |
| [`write-skill`](../../skills/write-skill/SKILL.md) | Agent-first creation and revision of skill packages and other agent instruction text | `evaluate-behavior` | [`activation-boundaries`](../../skills/write-skill/references/activation-boundaries.md), [`agent-first-instructions`](../../skills/write-skill/references/agent-first-instructions.md), [`guidance-placement`](../../skills/write-skill/references/guidance-placement.md), [`progressive-disclosure`](../../skills/write-skill/references/progressive-disclosure.md), [`skill-dependency-graphs`](../../skills/write-skill/references/skill-dependency-graphs.md), [`skill-author entrypoint`](../../skills/write-skill/scripts/skill-author.mjs) |
| [`evaluate-behavior`](../../skills/evaluate-behavior/SKILL.md) | Controlled behavioral evidence for any declared setup: arms compared against a reference, judged and command-graded tasks | `write-skill` | [`evaluation-definition-schema`](../../skills/evaluate-behavior/references/evaluation-definition-schema.md), [`evaluation-design`](../../skills/evaluate-behavior/references/evaluation-design.md), [`eval-modes`](../../skills/evaluate-behavior/references/eval-modes.md), [`execution-and-evidence`](../../skills/evaluate-behavior/references/execution-and-evidence.md), [`measurement`](../../skills/evaluate-behavior/references/measurement.md), [`defect-suites`](../../skills/evaluate-behavior/references/defect-suites.md), [`review-and-revision`](../../skills/evaluate-behavior/references/review-and-revision.md), [`judge-contract`](../../skills/review-work/references/judge-contract.md), [`skill-eval entrypoint`](../../skills/evaluate-behavior/scripts/skill-eval.mjs) |

## Optional Capability And Retired Archive

| Package or archive | Role | Delivery |
| --- | --- | --- |
| [`cognitive-routing`](../../capabilities/cognitive-routing/SKILL.md) | Mode-aware Coordinator/Helper/Executor work placement, saved returns, worker evidence projection and bounded recovery; manual unsplit control | Discoverable only when Cognitive Routing is effective; its conditional cue requires the current body before another Freeflow skill or task/evidence work without changing prompt order. |
| [Legacy context archive](../../.deprecated/legacy-context/README.md) | Historical source, guidance, tests, and evaluation definitions for removed context features | Non-live reference only; not a discoverable skill or runtime capability. |
| [`delegation-harness`](../../.deprecated/delegation-harness/README.md) | Retired implementation and historical evidence | Excluded from the live package, Setup, commands, runtime context, and active model-skill discovery. |

## Reading The Graph

The table is an adjacency map of direct Markdown links, not a call graph. Plain-text return destinations express control flow without creating package dependencies or table edges. Add a sibling link only when the target skill must be read or declared composition requires it.

Runtime behavior still depends on:

1. the Interaction Contract and Workflow establishing the agreement and readiness;
2. Workflow selecting the narrowest owner without requiring a fixed phase or artifact sequence;
3. the strongest cumulative effect and any controlled boundary being covered by the current authority envelope;
4. the selected skill deciding whether a linked route or reference applies;
5. evidence returning to Workflow for the next route or Supported Exit.

`npm run check` runs `node scripts/validation/check-skill-routing-doc.mjs` (`npm run check:skill-routing`); run it directly after changing skill dependencies. It counts a sibling link as a route whether it is written `../name/SKILL.md` or `../../skills/name/SKILL.md`. It compares every shared cross-host row (one per skill in the catalog's canonical list) with declared sibling routes and direct resource links. Gated capability packages are listed separately and are not counted as always-active rows. Update this map only when ownership, a declared route, or a reference boundary changes—not after ordinary implementation progress.
