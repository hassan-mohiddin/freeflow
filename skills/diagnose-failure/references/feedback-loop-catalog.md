# Feedback Loop Catalog

Pick the smallest loop that proves the user's failure. Prefer loops the agent can run repeatedly.

## Common Loops

- Failing test: best when an existing seam reaches the bug.
- Repro command: CLI, script, package task, or one exact command with fixture input.
- HTTP script: one request or short request sequence against a local service.
- Browser script: UI flow with DOM, console, and network assertions.
- Captured trace: HAR, log slice, event payload, seed, screenshot timestamp, core dump, or production sample replayed locally.
- Throwaway harness: minimal script around the real module when no test framework exists.
- Differential loop: same input through old versus new code, config, dataset, or dependency version.
- Instrumented run: targeted logs or counters at boundaries that distinguish hypotheses.

## Loop Quality

Improve the loop before fixing:

- Faster: remove unrelated startup and setup.
- Sharper: assert the exact symptom, not generic success.
- More deterministic: pin time, seed randomness, isolate network and filesystem.
- More representative: use the reported input shape and environment boundary.

If none is possible, stop and ask for the smallest missing artifact: command, logs, trace, failing input, screenshot with timestamp, environment access, or permission for temporary instrumentation.
