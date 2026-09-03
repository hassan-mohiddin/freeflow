# Skill Routing And Dependencies

This contributor map describes current ownership and explicit links in active skill bodies. It is not a mandatory sequence, authorization source, or replacement for the skills themselves.

- **Owner:** the job the skill controls.
- **Routes / composition:** sibling skills directly Markdown-linked for a changed condition or composed method.
- **References:** agent-facing references or scripts directly linked for reading or execution at the condition named by the active body.

Workflow chooses the current owner. A linked skill does not run automatically, and a reference link does not imply a route.

## Core, Discussion, And Memory

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`action-selection`](../skills/action-selection/SKILL.md) | Select, bound, execute, and learn from one uncertain or broad environment interaction | `diagnose-failure`, `workflow` | [`trajectory-stalls`](../skills/action-selection/references/trajectory-stalls.md) |
| [`workflow`](../skills/workflow/SKILL.md) | Interaction Lifecycle, authority interpretation, Feedback Loop, routing, selected review, Supported Exit | `action-selection`, `bypass`, `commit-work`, `decision-gate`, `design-for-depth`, `diagnose-failure`, `discuss`, `execute-work`, `finish-branch`, `handoff`, `launch-work`, `migration-work`, `release-work`, `review-artifact`, `review-work`, `simplify-code`, `tdd`, `track-work`, `verify-work`, `write-plan`, `write-spec` | [`domain-skill-composition`](../skills/workflow/references/domain-skill-composition.md) |
| [`decision-gate`](../skills/decision-gate/SKILL.md) | One blocking user-owned decision, source conflict, or material path change | `discuss`, `track-work`, `workflow` | [`Interaction Contract`](../runtime/prompts/interaction-contract.md) |
| [`discuss`](../skills/discuss/SKILL.md) | Collaborative exploration and direction revision | `action-selection`, `decision-gate`, `design-for-depth`, `diagnose-failure`, `execute-work`, `track-work`, `workflow`, `write-plan`, `write-spec` | [`discussion-continuity`](../skills/discuss/references/discussion-continuity.md) |
| [`track-work`](../skills/track-work/SKILL.md) | Durable task memory, state reconstruction, Current Slice lifecycle, decisions, checkpoints, proposals, Slice-local evidence, and reconciliation | `discuss`, `execute-work`, `handoff`, `workflow`, `write-plan`, `write-spec` | [`working-record-format`](../skills/track-work/references/working-record-format.md), [`working-record`](../skills/track-work/scripts/working-record.mjs) |
| [`bypass`](../skills/bypass/SKILL.md) | Scoped reduction of optional pressure inside accepted work | `decision-gate`, `track-work`, `workflow` | None |
| [`design-for-depth`](../skills/design-for-depth/SKILL.md) | Compositional design lens for boundaries, interfaces, ownership, state, and failure | `decision-gate`, `diagnose-failure`, `simplify-code`, `workflow` | [`design-pressure-signals`](../skills/design-for-depth/references/design-pressure-signals.md), [`interface-design-loop`](../skills/design-for-depth/references/interface-design-loop.md), [`module-and-dependency-design`](../skills/design-for-depth/references/module-and-dependency-design.md), [`software-design-philosophy`](../skills/design-for-depth/references/software-design-philosophy.md), [`state-and-failure-boundaries`](../skills/design-for-depth/references/state-and-failure-boundaries.md) |

## Artifacts, Review, And Evidence

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`write-spec`](../skills/write-spec/SKILL.md) | Stable accepted durable content | `decision-gate`, `discuss`, `review-artifact`, `track-work` | [`artifact-standards`](../skills/write-spec/references/artifact-standards.md), [`decision-records`](../skills/write-spec/references/decision-records.md), [`spec-shapes`](../skills/write-spec/references/spec-shapes.md) |
| [`write-plan`](../skills/write-plan/SKILL.md) | Stable ordered execution strategy | `commit-work`, `decision-gate`, `diagnose-failure`, `discuss`, `review-artifact`, `track-work` | [`plan-shapes`](../skills/write-plan/references/plan-shapes.md) |
| [`review-artifact`](../skills/review-artifact/SKILL.md) | Artifact self-review or selected independent artifact judgment | — | [`adjudicate-artifact-review`](../skills/review-artifact/references/adjudicate-artifact-review.md), [`independent-artifact-reviewer-contract`](../skills/review-artifact/references/independent-artifact-reviewer-contract.md) |
| [`review-work`](../skills/review-work/SKILL.md) | Work self-review or selected independent work judgment | — | [`adjudicate-work-review`](../skills/review-work/references/adjudicate-work-review.md), [`independent-work-reviewer-contract`](../skills/review-work/references/independent-work-reviewer-contract.md), [`security-risk-lens`](../skills/review-work/references/security-risk-lens.md) |
| [`verify-work`](../skills/verify-work/SKILL.md) | Active-agent factual claim verification | — | [`browser-runtime-evidence`](../skills/verify-work/references/browser-runtime-evidence.md), [`integration-evidence`](../skills/verify-work/references/integration-evidence.md), [`performance-evidence`](../skills/verify-work/references/performance-evidence.md) |

## Execution And Delivery

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`execute-work`](../skills/execute-work/SKILL.md) | Bounded concrete changes and execution feedback | `action-selection`, `decision-gate`, `design-for-depth`, `diagnose-failure`, `discuss`, `review-work`, `simplify-code`, `tdd`, `track-work`, `verify-work`, `workflow` | [`code-practices`](../skills/execute-work/references/code-practices.md), [`execute-work-edges`](../skills/execute-work/references/execute-work-edges.md), [`domain-skill-composition`](../skills/workflow/references/domain-skill-composition.md) |
| [`tdd`](../skills/tdd/SKILL.md) | One accepted behavior through RED/GREEN/REFACTOR | `design-for-depth`, `diagnose-failure`, `simplify-code`, `workflow` | [`code-practices`](../skills/execute-work/references/code-practices.md), [`test-design`](../skills/tdd/references/test-design.md) |
| [`simplify-code`](../skills/simplify-code/SKILL.md) | Behavior-preserving simplification | `design-for-depth`, `diagnose-failure`, `migration-work`, `tdd`, `workflow` | [`code-practices`](../skills/execute-work/references/code-practices.md), [`simplification-patterns`](../skills/simplify-code/references/simplification-patterns.md) |
| [`migration-work`](../skills/migration-work/SKILL.md) | Consumer, state, configuration, or traffic movement and removal proof | `decision-gate`, `design-for-depth`, `discuss`, `launch-work`, `release-work`, `verify-work`, `workflow`, `write-spec` | [`migration-lifecycle`](../skills/migration-work/references/migration-lifecycle.md) |
| [`diagnose-failure`](../skills/diagnose-failure/SKILL.md) | Supported cause for unexplained, repeated, flaky, or performance failure | — | [`diagnostic-loop-catalog`](../skills/diagnose-failure/references/diagnostic-loop-catalog.md), [`flaky-and-performance-diagnosis`](../skills/diagnose-failure/references/flaky-and-performance-diagnosis.md) |
| [`commit-work`](../skills/commit-work/SKILL.md) | Authorized coherent commit or simple push | `finish-branch`, `track-work`, `workflow` | [`git-state-edges`](../skills/commit-work/references/git-state-edges.md), [`simple-push`](../skills/commit-work/references/simple-push.md), [`staging-decisions`](../skills/commit-work/references/staging-decisions.md) |
| [`handoff`](../skills/handoff/SKILL.md) | Point-in-time continuation transfer | `decision-gate`, `track-work`, `workflow` | [`handoff-templates`](../skills/handoff/references/handoff-templates.md) |
| [`finish-branch`](../skills/finish-branch/SKILL.md) | Inspect integration readiness and execute only an owner-selected merge, PR, keep, or discard route | `commit-work`, `diagnose-failure`, `handoff`, `launch-work`, `release-work`, `verify-work`, `workflow` | [`integration-options`](../skills/finish-branch/references/integration-options.md) |
| [`release-work`](../skills/release-work/SKILL.md) | Versioned artifact preparation and publication | `decision-gate`, `launch-work`, `migration-work`, `verify-work`, `workflow` | [`release-evidence`](../skills/release-work/references/release-evidence.md) |
| [`launch-work`](../skills/launch-work/SKILL.md) | Production deployment, exposure, observation, and recovery | `decision-gate`, `diagnose-failure`, `migration-work`, `release-work`, `verify-work`, `workflow` | [`launch-readiness`](../skills/launch-work/references/launch-readiness.md) |

## Contributor Skills

| Skill | Owner | Routes / composition | References / scripts |
| --- | --- | --- | --- |
| [`setup-freeflow`](../skills/setup-freeflow/SKILL.md) | Layered activation, repair, same-turn context, and delivery reporting | `decision-gate`, `workflow` | [`Interaction Contract`](../runtime/prompts/interaction-contract.md), [`activation-contract`](../skills/setup-freeflow/references/activation-contract.md), [`host-setup`](../skills/setup-freeflow/references/host-setup.md) |
| [`write-skill`](../skills/write-skill/SKILL.md) | Agent-first skill package creation and revision | `evaluate-skill` | [`activation-boundaries`](../skills/write-skill/references/activation-boundaries.md), [`agent-first-instructions`](../skills/write-skill/references/agent-first-instructions.md), [`progressive-disclosure`](../skills/write-skill/references/progressive-disclosure.md), [`skill-dependency-graphs`](../skills/write-skill/references/skill-dependency-graphs.md), [`skill-author entrypoint`](../skills/write-skill/scripts/skill-author.mjs) |
| [`evaluate-skill`](../skills/evaluate-skill/SKILL.md) | Baseline-versus-candidate behavioral evidence | `write-skill` | [`evaluation-definition-schema`](../skills/evaluate-skill/references/evaluation-definition-schema.md), [`evaluation-design`](../skills/evaluate-skill/references/evaluation-design.md), [`execution-and-evidence`](../skills/evaluate-skill/references/execution-and-evidence.md), [`review-and-revision`](../skills/evaluate-skill/references/review-and-revision.md), [`skill-eval entrypoint`](../skills/evaluate-skill/scripts/skill-eval.mjs) |

## Optional Capability And Retired Archive

| Package or archive | Role | Delivery |
| --- | --- | --- |
| [`cognitive-routing`](../capabilities/cognitive-routing/SKILL.md) | Automatic Reasoning entry with Yield, Delegate, and Act Bounded routes; manual unsplit profile control | Discoverable only when Cognitive Routing is effective; its conditional cue requires the current body before another Freeflow skill or task/evidence work without changing prompt order. |
| [`conversation-history`](../capabilities/conversation-history/SKILL.md) | Bounded search or retrieval of exact missing prior-conversation evidence | Discoverable only when Conversation History is effective; its conditional cue owns activation. |
| [`context-virtualization`](../capabilities/context-virtualization/SKILL.md) | Continued residency of consumed tool evidence | Discoverable only when Context Virtualization is effective; its conditional cue owns activation. |
| [`delegation-harness`](../.deprecated/delegation-harness/README.md) | Retired implementation and historical evidence | Excluded from the live package, Setup, commands, runtime context, and active model-skill discovery. |

## Reading The Graph

The table is an adjacency map of direct Markdown links, not a call graph. Plain-text return destinations express control flow without creating package dependencies or table edges. Add a sibling link only when the target skill must be read or declared composition requires it.

Runtime behavior still depends on:

1. the Interaction Contract and Workflow;
2. Workflow selecting the narrowest owner;
3. the strongest cumulative effect and any controlled boundary being covered by the current authority envelope;
4. the selected skill deciding whether a linked route or reference applies;
5. evidence returning to Workflow for the next route or Supported Exit.

Run `node scripts/validation/check-skill-routing-doc.mjs` after changing skill dependencies. It compares all 25 shared cross-host rows with declared sibling routes and direct resource links. Gated capability packages are listed separately and are not counted as always-active rows. Update this map only when ownership, a declared route, or a reference boundary changes—not after ordinary implementation progress.
