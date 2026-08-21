# Domain Skill Composition

Read this when specialized engineering guidance must operate inside a Freeflow route.

Freeflow chooses **what owns the current action**. Domain guidance supplies **how to perform the specialized engineering safely**. Do not turn a domain skill into a second workflow.

## Keep Ownership Clear

Freeflow owns:

- effective mode, the current authority envelope, and route;
- user decisions and source conflicts;
- discussion, durable artifacts, slices, and route changes;
- verification honesty, review calibration, checkpoints, and exits.

Domain guidance may own techniques for frontend, accessibility, browser tools, security, performance, databases, APIs, CI/CD, observability, cloud platforms, migration, release, or deployment.

Domain guidance never widens the authority envelope or overrides accepted behavior, repository policy, owner decisions, failure contracts, or evidence requirements. When it conflicts with live source truth, inspect the conflict and use [Decision Gate](../../decision-gate/SKILL.md) if resolution changes behavior or material risk.

## Compose One Route

For one current action:

1. Keep one owning Freeflow skill.
2. Use [Design for Depth](../../design-for-depth/SKILL.md) as a lens only when the direction is already design-bearing or evidence establishes structural pressure.
3. Use one primary implementation or diagnostic method at a time, such as [TDD](../../tdd/SKILL.md), [Simplify Code](../../simplify-code/SKILL.md), or [Diagnose Failure](../../diagnose-failure/SKILL.md).
4. Load only the domain guidance needed for the concrete technology or risk.
5. Add specialist independent review only when its lens materially protects the selected boundary.

Changing method from evidence does not automatically change the current Track Work slice. Do not load a handbook because one keyword appears. Prefer repository policy and current primary sources over generic examples.

## Common Shapes

```text
UI change:
Workflow -> frontend/accessibility guidance -> TDD when useful
-> browser verification

Security- or integrity-sensitive work:
Decision Gate when policy is unsettled -> Design for Depth -> security guidance
-> TDD at the real boundary -> failure-path verification
-> selected security review

Performance regression:
Diagnose Failure -> profiler/query guidance -> bounded correction
-> representative performance verification

CI/CD change:
Workflow or Plan -> provider/repository guidance -> pipeline verification
-> Launch Work only for separately authorized production rollout

Migration:
Migration Work -> storage/API guidance -> verify each unit
-> Launch Work for separately authorized production cutover
```

If no suitable domain skill exists, inspect current primary sources and repository conventions. State expertise or environment limits rather than inventing a universal checklist.
