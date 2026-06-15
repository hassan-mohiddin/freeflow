# Skills

Freeflow ships a small workflow skill pack. Natural language is the preferred interface. In Codex/Claude, slash-style phrases work as model-routed skill hints in v0.1; in Pi, the extension registers direct Freeflow commands.

## Core

| Skill | Use When |
| --- | --- |
| `workflow` | Choosing the next workflow entry point or explaining the full flow. |
| `mode-contract` | Inferring or switching `conversation`, `workflow`, or `strict-workflow`. |
| `interview-gate` | Ambiguity or a user-owned decision would change the next action. |
| `bypass` | Skipping unnecessary ceremony without skipping judgment. |

## Discovery And Artifacts

| Skill | Use When |
| --- | --- |
| `research-brief` | Repo, domain, evidence, or current facts are unknown. |
| `grill-context` | Direction is vague and a decision tree needs clarification. |
| `write-spec` | Agreed requirements or decisions need a durable spec. |
| `review-artifact` | A spec, plan, handoff, research brief, or decision note must guide future work. |
| `write-plan` | An approved spec or explicit task context needs executable slices. |

## Execution And Closeout

| Skill | Use When |
| --- | --- |
| `execute-plan` | An approved plan exists and should be implemented in checked slices. |
| `diagnose-failure` | Behavior is broken, failing, flaky, slow, or unclear. |
| `review-work` | A completed diff or review feedback needs bug/risk-focused review. |
| `verify-work` | Fresh evidence is needed before claiming completion. |
| `commit-work` | Reviewed, verified, intended work is ready to commit. |
| `handoff` | Pausing, compacting, transferring context, or preserving continuation memory. |
| `capture-decisions` | Stable decisions, glossary terms, rejected approaches, or ADR-worthy tradeoffs should be recorded. |

## Contributor Skills

| Skill | Use When |
| --- | --- |
| `setup-freeflow` | Installing the compact always-on Freeflow contract into a repo. |
| `write-skill` | Creating or revising concise behavior-shaping skills. |
| `evaluate-skill` | Turning failures into baseline-vs-with-skill evals and revising from evidence. |

These contributor skills are shipped because teams may use Freeflow to install or adapt workflow behavior, but they are not normal workflow states for ordinary feature work.
