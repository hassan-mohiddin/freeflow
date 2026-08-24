# Flaky And Performance Diagnosis

Read this before choosing or running a diagnostic observation when timing, randomness, environment variance, or resource behavior shapes the failure.

## Flaky Failures

The goal is not one lucky rerun. Raise the reproduction rate or capture the distinguishing event until the failure can be explained.

Use, when safe and representative:

- bounded repetition of the exact failing path;
- captured seeds, time, timezone, locale, viewport, browser, runtime, and dependency versions;
- controlled scheduling, fake clocks, CPU pressure, network delay, or concurrency;
- console, network, event-order, scheduler, screenshot, or video traces;
- old-versus-new, local-versus-CI, or headed-versus-headless differential runs.

Choose the repetition count from runtime, cost, side effects, and the failure rate. Preserve every unfavorable result. Do not loop mutating production behavior merely to improve reproduction.

Do not stabilize a flake with arbitrary sleeps, retries, wider timeouts, swallowed errors, or disabled checks unless evidence shows that mechanism addresses the causal timing or availability contract. Suppressing observation is not correction.

## Performance Problems

Measure the reported path before optimizing it.

Useful causal evidence includes:

- baseline timing or resource use for the representative workload;
- slow input, dataset, concurrency, cache, and dependency state;
- profiler, flamegraph, query plan, allocation profile, or browser trace;
- old-versus-new comparison under matched conditions;
- a benchmark that exercises the dominant work identified by evidence.

A microbenchmark can test a hypothesis but does not explain the reported slowdown unless the isolated operation materially determines the real path. Repeated calls with one object justify memoization only when the reported workload repeats that object and measurement shows the repeated work dominates.

Sanitize production traces and payloads. When safe production evidence is unavailable, use representative non-production evidence and downgrade the claim.

## Boundary Examples

- Twenty green reruns after widening a timeout → the failure was suppressed or became rarer; its cause is still unresolved.
- A parser microbenchmark improves while the representative trace is dominated by database waiting → the benchmark does not explain the reported slowdown.
- Median latency improves while tail latency or memory crosses the accepted boundary → the performance claim remains contradicted or incomplete.

After an authorized correction, verify that the representative baseline improves and required behavior remains correct. Report variance and relevant resource tradeoffs rather than one favorable run.
