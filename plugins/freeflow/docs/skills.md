# Skills

Freeflow ships a small workflow skill pack. Natural language is the preferred interface. In Codex/Claude, slash-style phrases work as model-routed skill hints; in Pi, the extension registers direct Freeflow commands.

## Core

| Skill | Use When |
| --- | --- |
| `workflow` | Choosing the next workflow entry point or explaining the full flow. |
| `mode-contract` | Inferring or switching `conversation`, `workflow`, or `strict-workflow`. |
| `interview-gate` | Ambiguity or a user-owned decision would change the next action. |
| `output-router` | Choosing routed tools for large/noisy output, vault recovery, or output-router configuration. |
| `bypass` | Skipping unnecessary ceremony without skipping judgment. |
| `design-for-depth` | Module/interface/seam choices affect complexity, locality, testability, future change, or repeated edge-case churn. |

## Discovery And Artifacts

| Skill | Use When |
| --- | --- |
| `discover` | An idea, feature, architecture direction, vague task, or consequential question needs evidence, brainstorming, targeted questions, and a checkpoint before spec, plan, build, or durable memory. |
| `write-spec` | Agreed requirements or decisions need a durable spec. |
| `review-artifact` | A spec, plan, handoff, discovery checkpoint, or decision note must guide future work. |
| `write-plan` | An approved spec or explicit task context needs executable slices. |

## Execution And Closeout

| Skill | Use When |
| --- | --- |
| `execute-plan` | An approved plan exists and should be implemented in checked slices, especially multi-slice/TDD work with verification, review, commit, or handoff checkpoints. |
| `diagnose-failure` | Behavior is broken, failing, flaky, slow, or unclear. |
| `review-work` | A completed diff or review feedback needs bug/risk-focused review or adjudication before fixes. |
| `verify-work` | Fresh evidence is needed before claiming completion. |
| `commit-work` | Reviewed, verified, intended work is ready to commit. |
| `handoff` | Pausing, compacting, transferring context, or preserving continuation memory. |

## Contributor Skills

| Skill | Use When |
| --- | --- |
| `setup-freeflow` | Installing the compact always-on Freeflow contract into a repo. |
| `write-skill` | Creating or revising concise behavior-shaping skills. |
| `evaluate-skill` | Turning failures into baseline-vs-with-skill evals and revising from evidence. |

These contributor skills are shipped because teams may use Freeflow to install or adapt workflow behavior, but they are not normal workflow states for ordinary feature work.
