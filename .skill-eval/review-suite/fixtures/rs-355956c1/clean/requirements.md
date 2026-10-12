# Requirements: settled Pi process outcomes

`process-outcome.mjs` runs one Pi process and returns a settled outcome. The outcome is complete and carries the value that grading produced, or incomplete and carries the primary failure. Once the process has settled, its execution record (exit code, signal, timeout and output-limit flags, parse errors, runtime counters and usage) stays attached, even when the outcome is incomplete.

1. On success, `runPiProcessOutcome` calls `run()`, then `persistSettled(result)`, then `finish(result)`, then `cleanup()`, and returns after cleanup. `cleanup()` runs on every path.
2. A process that is not a clean run is failed, and `finish` is not called for it. A clean run exits with code 0 and is not ended by a signal. A run also fails when it times out, exceeds its output limit, reaches the hard turn limit, or has parse errors. The primary failure names the exit code or the unusable evidence.
3. Evidence persistence still runs for a failed process, so its usage and execution record are kept.
4. A failure in `persistSettled` is the primary failure when the process itself was clean. When the process had already failed, the persistence error is recorded as a secondary failure.
5. A failure in finish becomes the primary failure, and runPiProcessOutcome returns incompleteOperation without passing a value.
6. A failure in `cleanup` becomes the primary failure when nothing else failed, and a secondary failure otherwise. It never replaces an existing primary failure.
7. A failure in run() before the process settles becomes the primary failure, and runPiProcessOutcome passes execution: null to incompleteOperation.
8. A complete outcome passes the value from finish and the execution record to completeOperation.
