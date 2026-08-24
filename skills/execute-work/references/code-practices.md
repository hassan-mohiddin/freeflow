# Code Practices

Read this before an Execute Work slice writes or changes code. Follow the repository's language, style, testing, and documentation conventions before generic advice.

## Make Intent Legible

- Use names that express domain meaning rather than implementation trivia.
- Keep behavior, state, and policy near the code that owns them.
- Prefer the smallest coherent change over speculative abstraction or broad cleanup.
- Make important invariants and failure behavior explicit in code, types, tests, or narrow comments.
- Add a dependency, fallback, flag, state, or extension point only for accepted behavior or observed pressure.

Clear code explains what happens. Comments preserve important context the code cannot express safely.

## Comment Non-Obvious Why

Comment when a future reader could reasonably make a harmful change without knowing:

- an invariant, ordering, concurrency, precision, security, or compatibility constraint;
- why an apparently simpler approach is wrong;
- an external limitation or deliberate workaround;
- why an obvious alternative was rejected;
- why temporary behavior exists and what permits its removal.

Do not:

- narrate clear statements or control flow;
- preserve comments that no longer match the code;
- record broad architecture history inline;
- write `TODO: fix later` without a real reason or exit condition.

Put task status and future work in the Working Record or issue tracker. Put broad durable rationale in a Spec, decision record, or ADR. Leave only the local explanation needed to change the code safely.

```ts
// Bad: repeats the code.
count += 1; // Increment count

// Good: explains a non-obvious constraint.
// Keep two passes: pass 2 consumes offsets frozen by pass 1.
runFirstPass();
runSecondPass();
```

For temporary behavior, name the actual constraint and removal condition. Link an existing issue when one exists; do not invent tracking metadata.

## Handle Edge Cases By Evidence

Before adding behavior for an edge case, ask:

1. Is it required by accepted behavior or a settled failure contract?
2. Has it been observed or shown reachable at the supported boundary?
3. Could ignoring it cause material safety, data, security, compatibility, or user harm?
4. Is the expected result defined and inside the accepted work?

Then act proportionately:

- **Required or observed, with defined behavior:** implement the smallest complete behavior and test the relevant boundary.
- **Material but undefined:** stop and return the missing behavior decision to Workflow.
- **Plausible but unsupported:** gather evidence; do not add speculative handling.
- **Useful but optional:** report or defer it as separate work.
- **Purely hypothetical:** leave it alone.

```text
API contract permits a missing value and defines the result
-> implement and test it

"What if this is null?" with no requirement or reachable path
-> do not add a null branch; classify the concern first

Each correction reveals another related state or flag
-> stop patching; diagnose the shared contract, cause, or ownership
```

Prefer an explicit invariant or clear failure over invented retry, fallback, recovery, or compatibility behavior. Handling an edge case creates a contract and future maintenance cost.

## Stop When The Slice Is Supported

Once the accepted result is supported, comments are accurate, and no material self-review issue remains, stop. Possible polish, unrelated cleanup, and imagined resilience are not unfinished work. They require new evidence or another selected slice.
