# Skill Routing And Dependencies

This contributor map describes current ownership and explicit links in active skill bodies. It is not a mandatory sequence, authorization source, or replacement for the skills themselves.

- **Owner:** the job the skill controls.
- **Routes / composition:** sibling skills directly Markdown-linked for a changed condition or composed method.
- **References:** agent-facing references or scripts directly linked for reading or execution at the condition named by the active body.

Core's cycle (agree, build and verify, review and hand over) and each skill's description choose the current owner; no skill orchestrates the others. A linked skill does not run automatically, and a reference link does not imply a route.

## Core, Discussion, And Memory

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`discuss-work`](../../skills/discuss-work/SKILL.md) | Exploring what to do and how while that is open, a learning action, the agreement and decision list before building, user-owned choices and source conflicts during the work, and the list at self-review and hand-over | `deliver-work`, `execute-work`, `review-work`, `track-work`, `write-docs` | [`Interaction Contract`](../../runtime/prompts/interaction-contract.md), [`learning-action`](../../skills/discuss-work/references/learning-action.md), [`discussion-continuity`](../../skills/discuss-work/references/discussion-continuity.md), [`design`](../../skills/execute-work/references/design.md), [`diagnose`](../../skills/execute-work/references/diagnose.md) |
| [`track-work`](../../skills/track-work/SKILL.md) | Durable task memory, state reconstruction, Current Slice lifecycle, decisions, checkpoints, proposals, Slice-local evidence, reconciliation, and point-in-time handoffs | `discuss-work`, `execute-work`, `write-docs` | [`handoff`](../../skills/track-work/references/handoff.md), [`projects`](../../skills/track-work/references/projects.md), [`working-record-format`](../../skills/track-work/references/working-record-format.md), [`working-record`](../../skills/track-work/scripts/working-record.mjs) |

## Artifacts, Review, And Evidence

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`write-docs`](../../skills/write-docs/SKILL.md) | Documents a reader acts on: Specs and Plans that decide work (task artifacts, with one header, status vocabulary and source trail), decision records, and documentation of how existing software works and why, kept current with the code | `discuss-work`, `review-work`, `track-work` | [`spec-and-plan-shapes`](../../skills/write-docs/references/spec-and-plan-shapes.md), [`decision-records`](../../skills/write-docs/references/decision-records.md), [`documentation-shapes`](../../skills/write-docs/references/documentation-shapes.md), [`design`](../../skills/execute-work/references/design.md), [`diagnose`](../../skills/execute-work/references/diagnose.md), [`docs-check`](../../skills/write-docs/scripts/docs-check.mjs) |
| [`review-work`](../../skills/review-work/SKILL.md) | Self-review or selected independent judgment of work, a guiding artifact, a report or record of work done, or an eval definition; the review gate at a hand-over; adjudication of a returned review; the judge contract for any model verdict used as evidence | `deliver-work`, `discuss-work`, `execute-work`, `track-work`, `verify-work` | [`work`](../../skills/review-work/references/work.md), [`artifact`](../../skills/review-work/references/artifact.md), [`adjudication`](../../skills/review-work/references/adjudication.md), [`evals-and-judges`](../../skills/review-work/references/evals-and-judges.md), [`diagnose`](../../skills/execute-work/references/diagnose.md), [`working-record-format`](../../skills/track-work/references/working-record-format.md), [`check-brief`](../../skills/review-work/scripts/check-brief.mjs) |
| [`verify-work`](../../skills/verify-work/SKILL.md) | Active-agent factual claim verification | `discuss-work` | [`test-design`](../../skills/verify-work/references/test-design.md), [`runtime-evidence`](../../skills/verify-work/references/runtime-evidence.md), [`work`](../../skills/review-work/references/work.md), [`adjudication`](../../skills/review-work/references/adjudication.md), [`diagnose`](../../skills/execute-work/references/diagnose.md), [`test-changes`](../../skills/verify-work/scripts/test-changes.mjs) |
| [`map-features`](../../skills/map-features/SKILL.md) | Set up and recheck a project's live-verification recipe: feature map, shared guide, and helper | `verify-work`, `write-docs` | [`documentation-shapes`](../../skills/write-docs/references/documentation-shapes.md), [`driving-surfaces`](../../skills/map-features/references/driving-surfaces.md) |

## Execution And Delivery

| Skill | Owner | Routes / composition | References |
| --- | --- | --- | --- |
| [`execute-work`](../../skills/execute-work/SKILL.md) | Carrying out agreed change work: route preparation, one method at a time (implementation, design, simplification, diagnosis, migration, a bounded learning action), re-entry when the basis changes, checking and continuation | `deliver-work`, `discuss-work`, `review-work`, `track-work`, `verify-work`, `write-docs` | [`design`](../../skills/execute-work/references/design.md), [`design-state-and-failure`](../../skills/execute-work/references/design-state-and-failure.md), [`simplify`](../../skills/execute-work/references/simplify.md), [`diagnose`](../../skills/execute-work/references/diagnose.md), [`migration`](../../skills/execute-work/references/migration.md), [`code-practices`](../../skills/execute-work/references/code-practices.md), [`learning-action`](../../skills/discuss-work/references/learning-action.md), [`test-design`](../../skills/verify-work/references/test-design.md) |
| [`deliver-work`](../../skills/deliver-work/SKILL.md) | Commit, push, branch closeout (merge, pull request, keep, discard), versioned release, and production launch, each within its own approval; one shared stop list and report | `discuss-work`, `review-work`, `track-work`, `verify-work` | [`commit`](../../skills/deliver-work/references/commit.md), [`push`](../../skills/deliver-work/references/push.md), [`branch-closeout`](../../skills/deliver-work/references/branch-closeout.md), [`release`](../../skills/deliver-work/references/release.md), [`launch`](../../skills/deliver-work/references/launch.md), [`diagnose`](../../skills/execute-work/references/diagnose.md) |

## Contributor Skills

| Skill | Owner | Routes / composition | References / scripts |
| --- | --- | --- | --- |
| [`setup-freeflow`](../../skills/setup-freeflow/SKILL.md) | Layered activation, repair, same-turn context, and delivery reporting | `discuss-work` | [`Interaction Contract`](../../runtime/prompts/interaction-contract.md), [`core`](../../runtime/prompts/core.md), [`Working Method`](../../runtime/prompts/working-method.md), [`activation-contract`](../../skills/setup-freeflow/references/activation-contract.md), [`host-setup`](../../skills/setup-freeflow/references/host-setup.md) |
| [`write-skill`](../../skills/write-skill/SKILL.md) | Agent-first creation and revision of skill packages and other agent instruction text | `evaluate-behavior` | [`activation-boundaries`](../../skills/write-skill/references/activation-boundaries.md), [`agent-first-instructions`](../../skills/write-skill/references/agent-first-instructions.md), [`guidance-placement`](../../skills/write-skill/references/guidance-placement.md), [`progressive-disclosure`](../../skills/write-skill/references/progressive-disclosure.md), [`skill-dependency-graphs`](../../skills/write-skill/references/skill-dependency-graphs.md), [`skill-author entrypoint`](../../skills/write-skill/scripts/skill-author.mjs) |
| [`evaluate-behavior`](../../skills/evaluate-behavior/SKILL.md) | Controlled behavioral evidence for any declared setup: arms compared against a reference, judged and command-graded tasks | `write-skill` | [`design-and-measurement`](../../skills/evaluate-behavior/references/design-and-measurement.md), [`authoring`](../../skills/evaluate-behavior/references/authoring.md), [`coding-tasks`](../../skills/evaluate-behavior/references/coding-tasks.md), [`conversations-pipelines-judges`](../../skills/evaluate-behavior/references/conversations-pipelines-judges.md), [`running-and-evidence`](../../skills/evaluate-behavior/references/running-and-evidence.md), [`evals-and-judges`](../../skills/review-work/references/evals-and-judges.md), [`skill-eval entrypoint`](../../skills/evaluate-behavior/scripts/skill-eval.mjs) |

## Optional Capability And Retired Archive

| Package or archive | Role | Delivery |
| --- | --- | --- |
| [`cognitive-routing`](../../capabilities/cognitive-routing/SKILL.md) | Mode-aware Coordinator/Helper/Executor work placement, saved returns, worker evidence projection and bounded recovery; manual unsplit control | Discoverable only when Cognitive Routing is effective; its conditional cue requires the current body before another Freeflow skill or task/evidence work without changing prompt order. |
| [Legacy context archive](../../.deprecated/legacy-context/README.md) | Historical source, guidance, tests, and evaluation definitions for removed context features | Non-live reference only; not a discoverable skill or runtime capability. |
| [`delegation-harness`](../../.deprecated/delegation-harness/README.md) | Retired implementation and historical evidence | Excluded from the live package, Setup, commands, runtime context, and active model-skill discovery. |

## Reading The Graph

The table is an adjacency map of direct Markdown links, not a call graph. Plain-text return destinations express control flow without creating package dependencies or table edges. Skill descriptions route in plain text too: each says when its skill applies, names the neighbour that takes over only where two skills could fit the same request, and names the usual next skill only where that is not obvious (Execute Work to Discuss Work for open scope); these cues are not table edges. Add a sibling link only when the target skill must be read or declared composition requires it.

Runtime behavior still depends on:

1. core's cycle and the Interaction Contract, with Discuss Work establishing the agreement before the first edit on a task that builds or changes behavior;
2. skill descriptions selecting the narrowest owner without requiring a fixed phase or artifact sequence;
3. the strongest cumulative effect and any controlled boundary being covered by the current authority envelope;
4. the selected skill deciding whether a linked route or reference applies;
5. evidence going back only to the step it affects (Execute Work's re-entry list), and the hand-over as the Working Method's report describes.

`npm run check` runs `node scripts/validation/check-skill-routing-doc.mjs` (`npm run check:skill-routing`); run it directly after changing skill dependencies. It counts a sibling link as a route whether it is written `../name/SKILL.md` or `../../skills/name/SKILL.md`. It compares every shared cross-host row (one per skill in the catalog's canonical list) with declared sibling routes and direct resource links. Gated capability packages are listed separately and are not counted as always-active rows. Update this map only when ownership, a declared route, or a reference boundary changes—not after ordinary implementation progress.
