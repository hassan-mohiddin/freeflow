# Domain Skill Composition

Use Freeflow to decide the route and a domain skill to perform specialized engineering.

## Ownership Boundary

Freeflow owns:

- mode and workflow route;
- user-owned decisions and source conflicts;
- discovery, specs, plans, slices, and backward edges;
- review calibration, verification honesty, commits, and handoffs.

Domain skills may own techniques for frontend, accessibility, browser tools, security, performance, databases, APIs, CI/CD, observability, cloud platforms, migrations, releases, and deployment.

A domain skill does not override accepted behavior, repo policy, owner decisions, failure contracts, or evidence requirements.

## Selection Rule

For one active slice:

1. choose one owning Freeflow phase;
2. add at most one primary method or lens, such as TDD, design-for-depth, or diagnosis;
3. load only the domain guidance needed for the concrete technology or risk;
4. use extra specialist reviewers only when independent risk lenses justify them.

Do not load an entire handbook because one keyword appears. Prefer repo-local policy and current official sources over generic examples.

## Conflict Rule

When domain guidance conflicts with live code, tests, specs, policy, ADRs, supported versions, or an explicit owner decision:

- inspect whether the guidance is stale, generic, or inapplicable;
- do not rewrite source truth or silently follow the domain skill;
- use the Decision Gate when resolving the conflict changes behavior or risk.

## Common Composition

```text
UI change:
workflow -> domain frontend/accessibility guidance -> TDD when useful -> browser/runtime verification

Security-sensitive endpoint:
Decision Gate when policy is unsettled -> domain security guidance -> implementation -> security-focused review -> failure-path verification

Performance regression:
diagnose-failure -> platform profiler/query/domain guidance -> bounded fix -> representative benchmark verification

CI/CD change:
workflow/plan -> provider/repo pipeline guidance -> verify pipeline behavior -> shipping skill only for production rollout

Migration:
migration-work -> storage/API domain guidance -> verify each cohort -> launch-work for production cutover
```

If no suitable domain skill exists, inspect current primary sources and repo conventions. State the expertise or environment limitation rather than inventing a universal checklist.
