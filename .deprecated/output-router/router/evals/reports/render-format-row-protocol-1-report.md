# Render Format Row Protocol Benchmark 1

Date: 2026-06-27

Purpose: decide whether Pi model-visible Freeflow output should move from compact prose to a deterministic row protocol before continuing later runtime slices.

Committed regression benchmark: `router/tests/benchmarks/render-format-benchmark.test.js` gates bytes, visible fact preservation, per-sample validity, row shape, and visible recovery rows for future renderer changes.

Scope:

- `freeflow_run`
- `freeflow_retrieve`
- `freeflow_derive`
- `freeflow_batch`

Gate:

- Use bytes, not tokenizer-specific counts.
- A candidate renderer is valid only when every sample preserves at least the current visible fact coverage.
- `details.result` JSON remains unchanged.
- TUI rendering remains human-readable.

Best valid candidate selected: `line:shortHeader`.

| renderer | bytes | visible facts | valid samples | byte change |
| --- | ---: | ---: | ---: | ---: |
| current compact prose | 14,049 | 41/50 | 14/14 | baseline |
| line:noRecovery | 8,331 | 41/50 | 14/14 | 40.70% saved |
| line:shortHeader | 10,600 | 41/50 | 14/14 | 24.55% saved |
| jsonMin | 67,456 | 50/50 | 14/14 | 380.15% larger |

Decision:

Use a readable row protocol with short recovery rows, not `noRecovery`, because Freeflow should keep recovery visible while reducing model-visible bytes.

Selected row shape examples:

```text
freeflow_run|success|exit=0|route=routed|parser=test-output|raw=ffout_...
s|test-output summary...
p|stdout:1-4
>|tests: 4 failed, 108 passed, (112)
rec|vault|ffout_...|stdout|1-4
details|details.result
```

```text
freeflow_batch|routed|steps=3|ok=3|failed=0|c=3
q|answered|failed test files and counts|...
step|1|tests|run|ok|...
details|details.result steps+queries
```

Notes:

- TSV was also viable, but line protocol was chosen for readability and easier visual inspection.
- Minified JSON preserves the most facts but is much larger, confirming JSON is unsuitable for model-visible output.
- The `line:noRecovery` variant saved more bytes, but was rejected because recovery visibility is part of Freeflow's product value.
