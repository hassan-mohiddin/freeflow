# Code Practices

Read this before adding edge-case handling or a comment that explains why. The repository's own conventions come first.

This reference is judgment: adapt it to the work. Its binding statements restate [Execute Work](../SKILL.md) Rules.

## Handle Edge Cases By Evidence

Before adding behavior for an edge case, ask:

1. Is it required by accepted behavior or a settled failure contract?
2. Has it been observed or shown reachable at the supported boundary?
3. Could ignoring it cause material safety, data, security, compatibility, or user harm?
4. Is the expected result defined and inside the agreed work?

Then act proportionately:

- **Required or observed, with defined behavior:** implement the smallest complete behavior and test the relevant boundary.
- **Material but undefined:** stop and settle the missing behavior through [Discuss Work](../../discuss-work/SKILL.md).
- **Plausible but unsupported:** gather evidence; do not add speculative handling.
- **Useful but optional:** report or defer it as separate work.
- **Purely hypothetical:** leave it alone.

```text
API contract permits a missing value and defines the result
-> implement and test it

"What if this is null?" with no requirement or reachable path
-> do not add a null branch; classify the concern first
```

Prefer an explicit invariant or a clear failure over invented retry, fallback, recovery, or compatibility behavior. Handling an edge case creates a contract and a future maintenance cost.

## Comment Non-Obvious Why

Comment when a future reader could reasonably make a harmful change without knowing:

- an invariant, ordering, concurrency, precision, security, or compatibility constraint;
- why an apparently simpler approach is wrong;
- an external limitation or deliberate workaround;
- why an obvious alternative was rejected;
- why temporary behavior exists and what permits its removal.

Do not narrate clear statements or control flow, keep comments that no longer match the code, record architecture history inline, or write `TODO: fix later` without a real reason or exit condition. For temporary behavior, name the actual constraint and removal condition, and link an existing issue when there is one; do not invent tracking metadata.

Put task status and future work in the Working Record or issue tracker, how the code works and why in the developer docs ([Write Docs](../../write-docs/SKILL.md)), and a hard-to-reverse choice in a decision record. Leave in the code only the local explanation needed to change it safely.

```ts
// Bad: repeats the code.
count += 1; // Increment count

// Good: explains a non-obvious constraint.
// Keep two passes: pass 2 consumes offsets frozen by pass 1.
runFirstPass();
runSecondPass();
```
