# Domain Skill Composition

Use Freeflow to choose the route and domain guidance to perform specialized engineering.

## Ownership

Freeflow owns:

- effective mode and Workflow route;
- user-owned decisions and source conflicts;
- discussion, Specs, Plans, slices, and feedback-driven route changes;
- review calibration, verification honesty, commits, and handoffs.

Domain skills may own techniques for frontend, accessibility, browser tools, security, performance, databases, APIs, CI/CD, observability, cloud platforms, migration, release, and deployment.

Domain guidance never overrides accepted behavior, repository policy, owner decisions, failure contracts, or evidence requirements.

## Compose One Active Route

For one current slice:

1. Choose one owning Freeflow skill or route.
2. Load Design for Depth early and retain it when the work is already design-bearing or evidence establishes structural pressure.
3. Use no more than one primary implementation or diagnostic method at a time, such as TDD, Simplify Code, or Diagnose Failure. Change methods when evidence routes elsewhere without automatically changing the current slice.
4. Load only the domain guidance needed for the concrete technology or risk.
5. Add specialist independent review only when its risk lens materially protects the selected boundary.

Do not load a handbook because one keyword appears. Prefer repository policy and current primary sources over generic examples.

## Resolve Conflicts

When domain guidance conflicts with live code, tests, Specs, policy, ADRs, supported versions, or an owner decision:

- inspect whether the guidance is stale, generic, or inapplicable;
- do not rewrite source truth or silently follow the domain skill;
- use Decision Gate when resolution changes behavior or material risk.

## Common Shapes

```text
UI change:
Workflow -> frontend/accessibility guidance -> TDD when useful -> browser verification

Security- or integrity-sensitive work:
Decision Gate when policy is unsettled -> Design for Depth -> security guidance
-> TDD at the real boundary -> failure-path verification -> selected security review

Performance regression:
Diagnose Failure -> profiler/query/domain guidance -> bounded correction
-> representative performance verification

CI/CD change:
Workflow or Plan -> provider/repository pipeline guidance -> pipeline verification
-> Launch Work only for separately authorized production rollout

Migration:
Migration Work -> storage/API guidance -> verify each unit
-> Launch Work for separately authorized production cutover
```

If no suitable domain skill exists, inspect current primary sources and repository conventions. State expertise or environment limits rather than inventing a universal checklist.
