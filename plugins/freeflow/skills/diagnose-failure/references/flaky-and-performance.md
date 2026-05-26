# Flaky And Performance Diagnosis

## Flaky Failures

The goal is not one lucky repro. Raise the reproduction rate until the failure is debuggable.

Use:

- Repeated runs: loop the exact failing command 50-200 times.
- Stress: parallelism, CPU throttling, network delay, fake timers, clock boundaries.
- Seeds: capture random seed, time, timezone, locale, viewport, browser, dependency version.
- Traces: console, network, screenshots/video, scheduler/timer logs, event order.
- Differential runs: old versus new commit, local versus CI config, headed versus headless.

Do not stabilize flakes with arbitrary sleeps, retries, wider timeouts, or swallowed errors until evidence shows they address the root cause.

## Performance Regressions

Measure first. Optimize second.

Useful evidence:

- Baseline timing for the reported path.
- Slow input shape or captured production trace.
- Profiler output, flamegraph, query plan, or allocation profile.
- Old-versus-new comparison across commit, dependency, config, or dataset.
- A benchmark that reflects the real path and can verify the fix.

A benchmark is not root-cause evidence if it is invented around the user's suspected fix. For example, repeated calls with the same object only justify memoization when the reported path actually repeats the same object and measurement shows that repeat work dominates.

Do not claim a performance fix until the representative baseline improves and normal behavior remains correct.
