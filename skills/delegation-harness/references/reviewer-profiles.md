# Reviewer Profiles

Use profiles to select a review perspective, not to grant authority or prescribe a model. The harness chooses the available agent, fresh context, transport, and tools.

Every profile receives the applicable Freeflow reviewer contract, source truth, work product, verification evidence, pass history, and residual risk. Domain prestige does not replace evidence.

## Requirements Reviewer

Focus:

- accepted outcome, scope, and non-goals;
- missing, extra, or misunderstood behavior;
- public and failure contracts;
- source-truth conflicts and hidden owner decisions.

Use for specs, plans, task completion, and integration boundaries.

## Code-Quality Reviewer

Focus:

- correctness and regression risk;
- readability and unnecessary complexity;
- module depth, locality, and contract surface;
- test quality and maintainability;
- performance/security concerns only where the diff creates a concrete path.

Do not use “would a staff engineer approve” as evidence. Cite the requirement and consequence.

## Verifier / Test Reviewer

Focus:

- whether checks exercise the claimed seam;
- RED/GREEN and original-path evidence where TDD is claimed;
- failure, recovery, integration, and environment gaps;
- flaky or over-mocked tests;
- claims broader than the evidence.

A verifier runs allowed checks; a test reviewer may inspect test design. Neither decides product behavior.

## Security Reviewer

Use when trust boundaries or sensitive behavior change. Load `../../review-work/references/security-risk-lens.md` and applicable repo/domain policy.

Focus on concrete assets, actors, paths, controls, failure behavior, and evidence. Escalate specialized cryptography, identity, sandbox, or infrastructure questions rather than guessing.

## Performance Reviewer

Use when requirements or evidence include latency, throughput, memory, capacity, client responsiveness, or regression risk.

Focus on representative baseline, measurement method, profiler/query-plan/trace evidence, variance, correctness tradeoffs, and whether the claimed improvement survives the real path. Avoid universal budgets.

## Accessibility Reviewer

Use for affected user-interface paths when accessibility requirements apply.

Use the repo/design-system authority and available domain tooling. Focus on keyboard/focus, semantics, names/roles/states, assistive-technology behavior, visual constraints, and loading/error/degraded states relevant to the change.

## Release / Operations Reviewer

Use for releases, migrations, production launch, rollback, or operational readiness.

Focus on artifact/config identity, compatibility, data safety, observability, advance/abort criteria, rollback or forward recovery, temporary machinery, and consumer/operator evidence.

## Composition

Use the fewest profiles that cover the material risk. Several profiles may review in parallel when their questions are genuinely independent.

Do not count votes. The parent adjudicates findings against source truth. A fresh profile continues the same review-pass history and three-pass cap.
