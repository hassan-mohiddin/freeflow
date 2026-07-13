# Skills

Freeflow ships a small workflow skill pack. Natural language is the preferred interface. Kernel/Workflow provide one sequential self-check after meaningful slices: self-verification first, then self-review only when evidence supports the outcome. Reading review or verify skills may enhance those inline methods without creating independence. `/review-artifact` and `/review-work` default to formal independent review unless the user explicitly requests inline self-review; `/verify-work` defaults to enhanced self-verification and never dispatches by itself. In Codex/Claude, slash-style phrases work as model-routed skill hints; in Pi, the extension registers the direct calls declared in `command-surface.json` and exposes model skills only after `/setup-freeflow` creates `.freeflow/config.json` and skills are enabled. The full `workflow` skill loads once on the first turn; later reads remain available through progressive disclosure. Cross-cutting skills such as `mode-contract`, `decision-gate`, `design-for-depth`, and `tdd` remain model-routed unless explicitly listed as direct calls.

## Core

| Skill | Use When |
| --- | --- |
| `workflow` | Loaded on the first turn to establish routing; read again later when deeper workflow detail is useful. |
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
| `review-artifact` | Enhance artifact self-review inline, or run the standing/authorized independent artifact review in a separate context. |
| `write-plan` | An approved spec or explicit task context needs executable slices. |

## Execution And Closeout

| Skill | Use When |
| --- | --- |
| `execute-plan` | Implement an approved horizon through self-verification, bounded self-review, diagnosis before redesign, and parallel distinct final verifier/reviewer contexts after the sequential self-check. |
| `tdd` | An accepted behavior or bug fix should use one observable RED/GREEN/REFACTOR loop. |
| `simplify-code` | Working code needs behavior-preserving reduction of accidental complexity. |
| `migration-work` | Consumers, traffic, configuration, or data must move before an old path can be removed. |
| `diagnose-failure` | Behavior is broken, failing, flaky, slow, repeated, unexplained, or a workflow loop keeps failing. |
| `review-work` | Enhance self-review inline, or run standing/authorized independent judgment in a separate reviewer context. |
| `verify-work` | Enhance self-verification after any slice or package the separately selected final/authorized verifier; reading it never implies independence. |
| `commit-work` | A coherent verified rollback checkpoint is useful and authorized. |
| `handoff` | Pausing, compacting, or transferring evidence and route state to a fresh context. |
| `finish-branch` | A completed branch needs a safe merge, PR, keep, discard, or cleanup decision. |
| `release-work` | A versioned artifact must be prepared, published, and verified for consumers. |
| `launch-work` | A production deployment or user rollout needs readiness, observability, and recovery gates. |

The current adaptive-workflow revisions are Unverified pending behavioral evaluation. Optional candidate skills are `migration-work`, `finish-branch`, `release-work`, `launch-work`, and `simplify-code`; `tdd` is an optional execution method.

## Contributor Skills

| Skill | Use When |
| --- | --- |
| `setup-freeflow` | Creating config-only repo activation and verifying kernel, Workflow-bootstrap, and capability delivery. |
| `write-skill` | Creating or revising concise behavior-shaping skills. |
| `evaluate-skill` | Turning failures into baseline-vs-with-skill evals and revising from evidence. |

These contributor skills are shipped because teams may use Freeflow to install or adapt workflow behavior, but they are not normal workflow states for ordinary feature work.
