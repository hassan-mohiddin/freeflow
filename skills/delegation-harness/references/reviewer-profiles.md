# Reviewer Profiles

Use profiles to select a review perspective, not to grant authority or prescribe a model. The harness chooses the available agent, fresh context, transport, and tools.

Reviewer profiles receive the applicable Freeflow reviewer contract, source truth, work product, direct evidence, pass history, and residual risk. The independent verifier receives the verifier contract and finalized evidence package instead; it is not a reviewer profile. Domain prestige does not replace evidence.

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

## Independent Verifier

The verifier is a distinct fresh context from implementer and reviewer. It runs the finalized allowed checks once against the unchanged final state and reports:

- exact state and environment identity;
- commands, exit status, and evidence pointers;
- whether checks exercised the claimed seam;
- proved, unproved, reduced-fidelity, failed, or unavailable claims;
- unexpected mutations or side effects.

It does not inspect broad design quality, decide product behavior, edit, or fix. It may run in parallel with a distinct reviewer against the same frozen state without sharing outputs. If another independent run is needed, the parent must obtain user authorization.

A test-quality reviewer is different: it may judge whether tests are representative or over-mocked, but its judgment does not count as independent verification.

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

Use one reviewer with the fewest material lenses that cover the boundary. Multiple independent reviewers are additional review dispatches and require scoped user authorization; do not parallelize reviewers merely to increase confidence or finding count.

Do not count votes. The parent adjudicates findings against source truth. One narrow confirmation requires scoped authorization and accepted blockers; a third pass is exceptional, owner-selected, and terminal.
