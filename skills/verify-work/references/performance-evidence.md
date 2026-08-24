# Performance Evidence

Read this before selecting or running evidence when verifying latency, throughput, memory, CPU, bundle, query, rendering, capacity, or resource-regression claims.

A faster synthetic operation does not prove the reported path improved. Preserve correctness while measuring representative work.

Access production traces or metrics only through authorized, privacy-safe channels. Minimize and sanitize captured evidence; do not copy secrets, unrestricted personal data, or production payloads into prompts or artifacts. When safe access is unavailable, use representative non-production evidence and downgrade the claim.

## Define The Claim

Record:

- user/system path and workload;
- input, dataset, concurrency, cache, environment, and dependency state;
- metric and aggregation: duration, rate, allocation, memory, CPU, query count, percentile, or resource limit;
- baseline and accepted target or regression boundary;
- warm-up, sample count, variance, and noise controls when relevant;
- correctness checks that must remain true.

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

- Keep behavior-relevant configuration matched.
- Report median/percentiles or variance rather than one favorable run.
- Include cold/warm cache distinctions when they affect users.
- Separate elapsed-time improvement from increased cost, memory, load, or downstream work.
- Check normal and failure behavior after optimization.
- Preserve saved regressions; do not rerun until an unfavorable sample disappears.

Parallelism may reduce elapsed time while increasing total resources. Caching may improve repeats while weakening freshness or memory bounds. State the tradeoff.

## Stop Conditions

Stop or downgrade the claim when:

- the benchmark does not represent the reported path;
- environments or inputs differ materially;
- profiler evidence contradicts the targeted optimization;
- variance is larger than the claimed improvement;
- correctness, freshness, security, or resource behavior regresses;
- only a nearby operation improved;
- required production evidence is unavailable.

Read [Diagnose Failure](../../diagnose-failure/SKILL.md) for unexplained regressions. Read [Decision Gate](../../decision-gate/SKILL.md) when the next step depends on a product, SLO, cost, or resource tradeoff owned by the user.
