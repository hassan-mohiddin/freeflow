# Skill Routing And Dependencies

This contributor map describes current ownership and explicit links in active skill bodies. It is not a mandatory sequence, authorization source, or replacement for the skills themselves.

- **Owner:** the job the skill controls.
- **Routes / composition:** sibling skills explicitly named for a changed condition or composed method.
- **References:** local depth read or run at the condition named by the active body.

Workflow chooses the current owner. A linked skill does not run automatically, and a reference link does not imply a route.

## Core, Discussion, And Memory

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`workflow`](../skills/workflow/SKILL.md) | Interaction Lifecycle, Feedback Loop, routing, selected review, Supported Exit | `discuss`, `decision-gate`, `bypass`, `track-work`, `write-spec`, `write-plan`, `review-artifact`, `execute-work`, `migration-work`, `diagnose-failure`, `verify-work`, `review-work`, `commit-work`, `handoff`, `finish-branch`, `release-work`, `launch-work`, `design-for-depth` | [`workflow-loop`](../skills/workflow/references/workflow-loop.md), [`domain-skill-composition`](../skills/workflow/references/domain-skill-composition.md) |
| [`mode-contract`](../skills/mode-contract/SKILL.md) | Active/dormant mode and session/personal/repository mode changes | `setup-freeflow`, `workflow`, `decision-gate` | None |
| [`decision-gate`](../skills/decision-gate/SKILL.md) | One blocking user-owned decision, source conflict, or material path change | `discuss` | [`Interaction Contract`](../runtime/interaction-contract.md) |
| [`discuss`](../skills/discuss/SKILL.md) | Collaborative exploration and direction revision | `workflow`, `decision-gate`, `diagnose-failure`, `design-for-depth`, `track-work`, `execute-work`, `write-spec`, `write-plan` | [`checkpoints`](../skills/discuss/references/checkpoints.md) |
| [`track-work`](../skills/track-work/SKILL.md) | Working Record selection, living state, and transitions | `workflow`, `discuss`, `execute-work`, `handoff` | [`working-record-schema`](../skills/track-work/references/working-record-schema.md) — required before record mutation or resume |
| [`bypass`](../skills/bypass/SKILL.md) | Scoped reduction of optional pressure inside accepted work | `workflow`, `mode-contract`, `decision-gate`, `track-work` | None |
| [`design-for-depth`](../skills/design-for-depth/SKILL.md) | Compositional design lens for boundaries, interfaces, ownership, state, and failure | `diagnose-failure`, `decision-gate`, `workflow` | [`software-design-philosophy`](../skills/design-for-depth/references/software-design-philosophy.md), [`design-pressure-signals`](../skills/design-for-depth/references/design-pressure-signals.md), [`interface-design-loop`](../skills/design-for-depth/references/interface-design-loop.md) |

## Artifacts, Review, And Evidence

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`write-spec`](../skills/write-spec/SKILL.md) | Stable accepted durable content | `discuss`, `decision-gate`, `track-work`, `review-artifact` | [`spec-shapes`](../skills/write-spec/references/spec-shapes.md), [`artifact-standards`](../skills/write-spec/references/artifact-standards.md), [`decision-records`](../skills/write-spec/references/decision-records.md) |
| [`write-plan`](../skills/write-plan/SKILL.md) | Stable ordered execution strategy | `discuss`, `decision-gate`, `diagnose-failure`, `track-work`, `commit-work`, `review-artifact` | [`plan-shapes`](../skills/write-plan/references/plan-shapes.md) |
| [`review-artifact`](../skills/review-artifact/SKILL.md) | Artifact self-review or selected independent artifact judgment | `workflow`, `track-work` | [`reviewer-prompt`](../skills/review-artifact/references/reviewer-prompt.md) for independent review |
| [`review-work`](../skills/review-work/SKILL.md) | Work self-review or selected independent work judgment | `verify-work`, `workflow`, `execute-work`, `track-work` | [`reviewer-prompt`](../skills/review-work/references/reviewer-prompt.md), [`security-risk-lens`](../skills/review-work/references/security-risk-lens.md) |
| [`verify-work`](../skills/verify-work/SKILL.md) | Active-agent factual claim verification | `diagnose-failure`, `decision-gate`, `workflow` | [`integration-evidence`](../skills/verify-work/references/integration-evidence.md), [`browser-runtime-evidence`](../skills/verify-work/references/browser-runtime-evidence.md), [`performance-evidence`](../skills/verify-work/references/performance-evidence.md) |

## Execution And Delivery

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`execute-work`](../skills/execute-work/SKILL.md) | Bounded concrete changes and execution feedback | `workflow`, `track-work`, `tdd`, `diagnose-failure`, `verify-work`, `review-work` | [`execution-loop`](../skills/execute-work/references/execution-loop.md), [`code-practices`](../skills/execute-work/references/code-practices.md) |
| [`tdd`](../skills/tdd/SKILL.md) | One accepted behavior through RED/GREEN/REFACTOR | `execute-work`, `workflow`, `design-for-depth`, `diagnose-failure` | [`test-design`](../skills/tdd/references/test-design.md), [`code-practices`](../skills/execute-work/references/code-practices.md) |
| [`simplify-code`](../skills/simplify-code/SKILL.md) | Behavior-preserving simplification | `workflow`, `design-for-depth`, `tdd`, `diagnose-failure`, `migration-work` | [`simplification-patterns`](../skills/simplify-code/references/simplification-patterns.md), [`code-practices`](../skills/execute-work/references/code-practices.md) |
| [`migration-work`](../skills/migration-work/SKILL.md) | Consumer, state, configuration, or traffic movement and removal proof | `decision-gate`, `workflow`, `discuss`, `design-for-depth`, `write-spec`, `verify-work`, `release-work`, `launch-work` | [`migration-lifecycle`](../skills/migration-work/references/migration-lifecycle.md) |
| [`diagnose-failure`](../skills/diagnose-failure/SKILL.md) | Supported cause for unexplained, repeated, flaky, or performance failure | `workflow`, `decision-gate`, `design-for-depth`, `execute-work`, `tdd`, `verify-work` | [`diagnostic-loop-catalog`](../skills/diagnose-failure/references/diagnostic-loop-catalog.md), [`flaky-and-performance`](../skills/diagnose-failure/references/flaky-and-performance.md) |
| [`commit-work`](../skills/commit-work/SKILL.md) | Authorized coherent commit or simple push | `workflow`, `decision-gate`, `track-work`, `finish-branch`, `release-work`, `launch-work` | [`staging-decisions`](../skills/commit-work/references/staging-decisions.md) |
| [`handoff`](../skills/handoff/SKILL.md) | Point-in-time continuation transfer | `track-work`, `decision-gate`, `workflow` | [`templates`](../skills/handoff/references/templates.md) |
| [`finish-branch`](../skills/finish-branch/SKILL.md) | Branch integration, preservation, sharing, discard, and cleanup | `commit-work`, `release-work`, `launch-work`, `verify-work`, `handoff`, `workflow`, `diagnose-failure` | [`integration-options`](../skills/finish-branch/references/integration-options.md), [`staging-decisions`](../skills/commit-work/references/staging-decisions.md) |
| [`release-work`](../skills/release-work/SKILL.md) | Versioned artifact preparation and publication | `decision-gate`, `migration-work`, `workflow`, `verify-work`, `launch-work` | [`release-evidence`](../skills/release-work/references/release-evidence.md) |
| [`launch-work`](../skills/launch-work/SKILL.md) | Production deployment, exposure, observation, and recovery | `decision-gate`, `release-work`, `migration-work`, `verify-work`, `workflow`, `diagnose-failure` | [`launch-readiness`](../skills/launch-work/references/launch-readiness.md) |

## Contributor Skills

| Skill | Owner | Routes / composition | References / scripts |
| --- | --- | --- | --- |
| [`setup-freeflow`](../skills/setup-freeflow/SKILL.md) | Layered activation, repair, same-turn context, and delivery reporting | `output-router` when explicitly requested, `decision-gate`, `workflow`, `mode-contract` | [`activation-contract`](../skills/setup-freeflow/references/activation-contract.md), [`host-setup`](../skills/setup-freeflow/references/host-setup.md), [`output-router-setup`](../skills/setup-freeflow/references/output-router-setup.md), [`Interaction Contract`](../runtime/interaction-contract.md) |
| [`write-skill`](../skills/write-skill/SKILL.md) | Agent-first skill creation and revision | `evaluate-skill` | [`activation-boundaries`](../skills/write-skill/references/activation-boundaries.md), [`agent-first-instructions`](../skills/write-skill/references/agent-first-instructions.md), [`progressive-disclosure`](../skills/write-skill/references/progressive-disclosure.md), [`development-loop`](../skills/write-skill/references/development-loop.md), [`skill-author`](../skills/write-skill/scripts/skill-author.mjs) |
| [`evaluate-skill`](../skills/evaluate-skill/SKILL.md) | Behavioral evidence and external readiness claims | `write-skill` | [`evaluation-architecture`](../skills/evaluate-skill/references/evaluation-architecture.md), [`eval-patterns`](../skills/evaluate-skill/references/eval-patterns.md), [`grading-priority`](../skills/evaluate-skill/references/grading-priority.md), [`grading-and-revision`](../skills/evaluate-skill/references/grading-and-revision.md), [`portable-execution`](../skills/evaluate-skill/references/portable-execution.md), [`token-efficient-execution`](../skills/evaluate-skill/references/token-efficient-execution.md), [`skill-eval`](../skills/evaluate-skill/scripts/skill-eval.mjs) |

## Optional Capability And Retired Archive

| Package or archive | Role | Delivery |
| --- | --- | --- |
| [`output-router`](../skills/output-router/SKILL.md) | Optional routed-evidence capability | Disabled by default; loaded only when repository config and top-level Freeflow make it effective. Setup touches it only after an explicit request. |
| [`delegation-harness`](../deprecated/delegation-harness/README.md) | Retired implementation and historical evidence | Excluded from the live package, Setup, commands, runtime context, and active model-skill discovery. |

## Reading The Graph

The table is an adjacency map, not a call graph. Runtime behavior still depends on:

1. the Interaction Contract and effective mode;
2. Workflow selecting the narrowest owner;
3. explicit authority for mutation and controlled boundaries;
4. the selected skill deciding whether a linked route or reference applies;
5. evidence returning to Workflow for the next route or Supported Exit.

Run `node scripts/validation/check-skill-routing-doc.mjs` after changing skill dependencies. It compares all 25 active rows with declared sibling routes and direct resource links and confirms the separately classified Output Router capability. Update this map only when ownership, a declared route, or a reference boundary changes—not after ordinary implementation progress.
