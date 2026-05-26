# Approach Framing

Use this when brainstorming or grilling needs options before the next question can be useful.

Do not use this to avoid asking. Use it to make the next decision sharper.

## Frame The Decision

Start with:

- Goal: what outcome the user is trying to reach.
- Constraint: what limits the solution space.
- Risk: what would be expensive to get wrong.
- Unknown: what must be inspected or decided before action.
- Owner: who owns the next user-owned decision.

If the answer is discoverable in repo evidence, inspect before asking.

## Offer Approaches

Offer 2-3 approaches only when they are meaningfully different.

For each approach, keep it short:

```text
Approach: ...
Best when: ...
Tradeoff: ...
```

Then recommend one approach and ask the next decision-changing question.

## Useful Approach Types

- Lightweight patch: best for small reversible work with clear source truth.
- Spec-first: best when requirements, scope, or acceptance criteria need durable agreement.
- Research-first: best when repo behavior, external facts, or evidence are unknown.
- Diagnostic-first: best when the request is a bug, regression, failed check, flaky behavior, or performance issue.
- Strict-workflow: best for security, privacy, billing, data loss, public API, compatibility, migrations, permissions, or hard-to-reverse architecture.

## Question Shape

Prefer:

```text
I found ...
The decision tree is ...
Recommendation: ...
Question: ...
```

Ask one question. Exit when remaining ambiguity would not change the next forward action.
