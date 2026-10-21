# Performance Evidence

Read this before selecting or running evidence when verifying latency, throughput, memory, CPU, bundle, query, rendering, capacity, or resource-regression claims.

This reference is judgment, with one Rule: access production traces or metrics only through authorized, privacy-safe channels, and never copy secrets, unrestricted personal data, or production payloads into prompts or artifacts.

A faster synthetic operation does not prove the reported path improved. Preserve correctness while measuring representative work.

Minimize and sanitize captured evidence. When safe access is unavailable, use representative non-production evidence and downgrade the claim.

## Define The Claim

Record:

- user/system path and workload;
- input, dataset, concurrency, cache, environment, and dependency state;
- metric and aggregation: duration, rate, allocation, memory, CPU, query count, percentile, or resource limit;
- baseline and accepted target or regression boundary;
- warm-up, sample count, variance, and noise controls when relevant;
- correctness checks that must remain true.

Before measuring, write the sentence you expect to report, such as "p95 search latency at 50 users drops below 200 ms". The checks below test that sentence; one rewritten to fit the numbers is a new claim.

Use project SLOs, budgets, historical baselines, or explicit requirements. Do not invent universal thresholds.

## Evidence Strength

Prefer, in order appropriate to the claim:

- authorized, appropriately sanitized production trace or a representative non-production trace;
- old-versus-new run under matched conditions;
- profiler, flamegraph, query plan, allocation profile, or browser performance trace;
- benchmark that exercises the real dominant work;
- operational metrics over a comparable observation window.

A microbenchmark is diagnostic when it isolates a hypothesis; it becomes acceptance evidence only when the isolated work materially determines the real path.

## Compare Honestly

- Keep behavior-relevant configuration matched, with each side tuned as production runs it (release build, flags, pools, batching, indexes); against a side left on defaults, name no winner.
- Report the median and range of repeated runs, not one favorable run. When comparing, alternate the sides, at least five runs each, so warm-up and drift favor neither.
- Count failed and non-success results, and confirm the timed work happened: fast rejections, early timeouts, unawaited promises and lazy results nobody reads measure work that never ran.
- For how cost grows with input size, run the same operation on the input and on double it.
- Include cold/warm cache distinctions when they affect users.
- Separate elapsed-time improvement from increased cost, memory, load, or downstream work.
- Check normal and failure behavior after optimization.
- Preserve saved regressions; do not rerun until an unfavorable sample disappears.
- Bound the claim by the share of the run that changed: if the changed step took 20% of the time, removing it entirely saves at most 20%. A larger measured gain means the measurement or its attribution is wrong; find out which before reporting it.
- Name the resource that bounds the number, such as CPU, disk or network I/O, a lock, memory, a rate limit or a queue, and the observation that shows it. Without it, you cannot say whether a change could move the number.

Parallelism may reduce elapsed time while increasing total resources. Caching may improve repeats while weakening freshness or memory bounds. State the tradeoff.

## Stop Conditions

Stop or downgrade the claim when:

- the benchmark does not represent the reported path;
- environments or inputs differ materially;
- profiler evidence contradicts the targeted optimization;
- variance is larger than the claimed improvement;
- errors went uncounted, the timed work may not have run, or a compared side ran untuned;
- correctness, freshness, security, or resource behavior regresses;
- only a nearby operation improved;
- required production evidence is unavailable.

Read [Diagnose Failure](../../../skills/diagnose-failure/SKILL.md) for unexplained regressions. Read [Agree Work](../../../skills/agree-work/SKILL.md) when the next step depends on a product, SLO, cost, or resource tradeoff owned by the user.
