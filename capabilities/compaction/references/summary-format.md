# Compaction Summary Format

Read this before writing a compaction summary. The [compaction skill](../SKILL.md) owns what is worth keeping; this reference owns the exact shape of the summary passed to `freeflow_compact`, and is binding as written.

## Two shapes

The shape depends on one fact: whether the work has a Working Record.

| Work has a Working Record | Shape | Why |
| --- | --- | --- |
| Yes | **Record-backed**: `Task`, `Now`, `In flight`, `Next steps` | The record already holds the task. The summary holds only what sits below the record's granularity. |
| No | **Record-shaped**: the record's headings | The summary is the only task memory for the next cycle, so it uses the record's structure. |

Compaction never creates a record. Whether a task needs one is decided at its start or when facts change its scope.

## Field syntax

- Each heading is a level-two heading (`## Now`), in the order given, every heading present.
- Write `(none)` under a heading with nothing to say.
- Bullets, one fact per bullet. Keep a bullet short unless removing detail could change the next action.
- Exact values go in backticks: paths, identifiers, commands, error text, numbers.
- Quote the user's words in quotation marks when wording matters.
- Mark status inline when it is not settled: `(tentative)`, `(unverified)`, `(superseded by …)`.
- No narrative: write what is true now, not the order things happened in.
- About 8,000 tokens at most. Most summaries need far less.

Before calling `freeflow_compact`, check the summary as a whole: would a fresh context reading only it (and, when there is one, the record) choose the same next step you would? If not, add what it would need.

## Record-backed shape

The summary must let a fresh context continue the **current step** correctly on its own; the record lets it continue the **task**. Write the summary right after updating the record (Track Work, "Prepare For A Context Boundary"), so the two agree. If they ever disagree, the record and live state win.

```markdown
## Task
- Record: `<path to record.md>` — recover it first
- Goal: <one line>
- Slice: <S-NNN> "<title>", <state>
- Governing now: <only the decisions, constraints, and authority the next steps depend on>

## Now
- <the step in progress and exactly how far it got: done, half-done, and where the half-done part is>

## In flight
- Observed: <result> — <exact evidence>
- Hypothesis: <what is being tested> (unverified)
- Dropped: <approach> — <why it failed>
- Pending: <what is running or waiting> — <what it waits on>

## Next steps
1. <the immediate concrete, checkable step>
2. <...>
```

| Section | Holds | Leaves out | Check |
| --- | --- | --- | --- |
| Task | `Record:` the Working Record's path, which Freeflow does not state; `Goal:` in one line; `Slice:` with ID, title, and state; `Governing now:` only the decisions, constraints, and authority the next steps depend on, quoting the user where wording matters. | Settled facts, decisions, and boundaries the next steps do not touch; they stay in the record. | Could the next steps break a rule that is not listed here? |
| Now | The step in progress and exactly how far it got. | The history of earlier steps. | Could someone point to the exact spot to resume? |
| In flight | Typed bullets: `Observed:` a result with its exact evidence; `Hypothesis:` what is being tested, marked unverified; `Dropped:` an approach and why it failed; `Pending:` what is running or waiting, and on what. | Anything the record or Freeflow's own lines already hold. | Would losing this bullet make the next context repeat work or a mistake? |
| Next steps | Ordered, concrete, checkable steps: the immediate ones. | The task's longer route; that is the record's Future Work. | Can a fresh context do step 1 right now? |

## Record-shaped shape

Each heading means exactly what it means in the Working Record format ([Working Record Format](../../../skills/track-work/references/working-record-format.md)). `Current work` stands in for the Current Slice: in-progress work, partial or uncommitted effects, unverified results, running commands, and obligations with their trigger, using the same `Observed:`, `Dropped:`, and `Pending:` labels where they fit.

```markdown
## Goal
- <the outcome the user wants>

## What defines this task
- <pointer to a spec, plan, issue, or brief, and what it establishes>

## Settled
- <fact or accepted understanding>
- <decision the user made> — <reason>

## Tentative
- <hypothesis or provisional approach>

## Open
- <unresolved question, including questions waiting on the user>

## Boundaries
- <what the user authorized>; <what still needs asking>; <scope limits and stop conditions>

## Current direction
- <the remaining approach and why>

## Current work
- <in progress; partial or uncommitted effects; unverified results; running commands>
- <obligation> — when <trigger>

## Recovery sources
- <pointer> — <what it establishes, why to re-read it>

## Next useful action
- <one action a fresh context can take>
```

## What the next cycle sees

Freeflow builds the new cycle from four pieces. The agent writes only the first part of the first piece.

1. **The summary**, wrapped by Pi as a user message: `The conversation history before this point was compacted into the following summary: <summary>…</summary>`. Inside: the agent's summary, then `## Freeflow state at compaction`, which Freeflow writes.
2. **The carried context:** the user's latest messages verbatim, then the carried files (read at compaction) and tool results.
3. **The recovery message.**
4. **Freeflow's Runtime State**, as on every request.

## Example: record-backed

The task has a record at `.freeflow/tasks/task-014-http-retry/record.md`. Its Current Slice is "Add retry with backoff to the HTTP client", and its Next useful action is "Make the 429 test pass, then run the client suite".

What the agent passes as `summary`:

```markdown
## Task
- Record: `.freeflow/tasks/task-014-http-retry/record.md` — recover it first
- Goal: the HTTP client retries failed requests with backoff and respects `Retry-After`.
- Slice: S-003 "Add retry with backoff to the HTTP client", in progress
- Governing now: retry 429 and 5xx only; `Retry-After` overrides the computed delay (the user: "the API team says they ban clients that don't"); no commits without asking.

## Now
- Mid-way through `retryWithBackoff` in `src/http/client.ts`: the retry loop and 503 path are done and passing; the 429 path ignores `Retry-After` and retries immediately.

## In flight
- Observed: `npm test -- client.retry` → 7 passed, 1 failed: `retries 429 after Retry-After` expected ≥1000 ms, got 104 ms.
- Hypothesis: `sleep()` must use the fake clock in `test/helpers/clock.ts` (it advances only on `tick()`), or the test cannot observe the delay. (unverified)
- Dropped: calling `setTimeout` directly; the test hung on real time.

## Next steps
1. Parse `Retry-After` (seconds or HTTP date) and use it before the backoff delay.
2. Rerun `npm test -- client.retry`, then the full suite.
```

What the next cycle's first request contains, in order:

````text
The conversation history before this point was compacted into the following summary:
<summary>
## Task
- Record: `.freeflow/tasks/task-014-http-retry/record.md` — recover it first
- Goal: the HTTP client retries failed requests with backoff and respects `Retry-After`.
…
## Next steps
…

## Freeflow state at compaction

This compaction starts cycle 3. It completes the compaction Freeflow's context notice asked for.

Files read and modified in this session:

<read-files>
test/client.retry.test.ts
test/helpers/clock.ts
</read-files>

<modified-files>
src/http/client.ts
</modified-files>
</summary>

# Carried context

[Freeflow notice, not from the user] Freeflow carried this into cycle 3 at compaction. Only the latest user messages are the user's words, and they take precedence over older instructions in the summary or a Working Record; the rest is copied content.

## Latest user messages

### Message 1

retries should respect Retry-After, the API team says they ban clients that don't

## Files, read at compaction

### src/http/client.ts (lines 40-118)

```ts
…
```

## Tool results

### r31 bash: npm test -- client.retry

```
…  1 failed  …
```

[Freeflow notice, not from the user] Compaction finished; cycle 3 starts here. Recover before you continue: if the summary names a Working Record for this work, recover it as Track Work says; otherwise the summary is your record for this cycle, so re-read its Recovery sources. Reconcile with the live state your next step depends on, and verify work the summary calls done instead of redoing it. The carried context is above. Then continue the work the compaction interrupted. This compaction completes the request for it: do not call freeflow_compact again in this cycle. If compacting was all you were asked to do, report that it is done (a worker returns its assignment with freeflow_return).
````

## Example: record-shaped

The same work without a record.

```markdown
## Goal
- The HTTP client retries failed requests with backoff and respects `Retry-After`.

## What defines this task
- (none)

## Settled
- Retry on 429 and 5xx only; never on other 4xx — the user: "a 400 is our bug, retrying hides it".
- At most 4 attempts, base delay 250 ms, doubling, capped at 4 s — the user accepted this proposal.
- `Retry-After` overrides the computed delay — the user: "the API team says they ban clients that don't".

## Tentative
- The fake clock in `test/helpers/clock.ts` must drive `sleep()` for the delay tests to observe time. (unverified)

## Open
- Should a `Retry-After` longer than 4 s be honored or capped? Asked the user; no answer yet.

## Boundaries
- Authorized: edit `src/http/**` and `test/**`; run tests.
- Not authorized: commit, push, or change the public `HttpClient` options.
- Stop and ask if the fix needs a new dependency.

## Current direction
- Finish the 429 path in `retryWithBackoff`, then run the full client suite.

## Current work
- `src/http/client.ts`: retry loop and 5xx path done and passing; 429 path in progress, uncommitted.
- Observed: `npm test -- client.retry` → 7 passed, 1 failed: `retries 429 after Retry-After` expected ≥1000 ms, got 104 ms.
- Dropped: calling `setTimeout` directly; the test hung on real time.
- Run `npm test` (full suite) — when the retry tests pass.

## Recovery sources
- `src/http/client.ts` lines 40–118 — the retry loop being changed.
- `test/client.retry.test.ts` — the expected delays per status.
- `test/helpers/clock.ts` — how the fake clock advances.

## Next useful action
- Parse `Retry-After` (seconds or HTTP date) and use it before the backoff delay; rerun `npm test -- client.retry`.
```

The next cycle receives it the same way, with the same recovery message. The summary names no record, so the summary is the record for this cycle.
