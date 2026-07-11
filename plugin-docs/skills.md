# Skills

Freeflow ships a small workflow skill pack. Natural language is the preferred interface. In Codex/Claude, slash-style phrases work as model-routed skill hints; in Pi, the extension registers the direct calls declared in `command-surface.json` and exposes model skills only after `/setup-freeflow` creates `.freeflow/config.json` and skills are enabled. Cross-cutting skills such as `decision-gate`, `design-for-depth`, and `tdd` remain model-routed unless explicitly listed as direct calls.

## Core

| Skill | Use When |
| --- | --- |
| `workflow` | Choosing the next workflow entry point or explaining the full flow. |
| `mode-contract` | Inferring or switching `conversation`, `workflow`, or `strict-workflow`. |
| `decision-gate` | A user-owned decision, source conflict, or material path substitution would change the next action. |
| `output-router` | Choosing routed tools for large/noisy output, vault recovery, or output-router configuration. |
| `delegation-harness` | Coordinating separate agent contexts when delegation improves context locality or independent judgment. |
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
| `execute-plan` | An approved rolling-plan horizon should be implemented one verified slice at a time with a route check after each slice. |
| `tdd` | An accepted behavior or bug fix should use one observable RED/GREEN/REFACTOR loop. |
| `simplify-code` | Working code needs behavior-preserving reduction of accidental complexity. |
| `deprecation-and-migration` | Consumers, traffic, configuration, or data must move before an old path can be removed. |
| `diagnose-failure` | Behavior is broken, failing, flaky, slow, or unclear. |
| `review-work` | Independent judgment or incoming feedback needs calibrated review, adjudication, and a bounded follow-up loop. |
| `verify-work` | A slice or completion claim needs fresh evidence and a route check. |
| `commit-work` | A coherent verified rollback checkpoint is useful and authorized. |
| `handoff` | Pausing, compacting, or transferring evidence and route state to a fresh context. |
| `finish-branch` | A completed branch needs a safe merge, PR, keep, discard, or cleanup decision. |
| `release-work` | A versioned artifact must be prepared, published, and verified for consumers. |
| `shipping-and-launch` | A production deployment or user rollout needs readiness, observability, and recovery gates. |

The current adaptive-workflow revisions are Unverified pending behavioral evaluation. Optional candidate skills are `deprecation-and-migration`, `finish-branch`, `release-work`, `shipping-and-launch`, and `simplify-code`; `tdd` is an optional execution method.

## Contributor Skills

| Skill | Use When |
| --- | --- |
| `setup-freeflow` | Creating config-only repo activation and verifying host runtime-kernel delivery. |
| `write-skill` | Creating or revising concise behavior-shaping skills. |
| `evaluate-skill` | Turning failures into baseline-vs-with-skill evals and revising from evidence. |

These contributor skills are shipped because teams may use Freeflow to install or adapt workflow behavior, but they are not normal workflow states for ordinary feature work.
