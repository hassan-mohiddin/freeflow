# Context Mode Real Deep Final Slice 11 Review

Generated: 2026-06-28

## Source Reports

- Baseline: `evals/reports/runtime/context-mode-real-deep-baseline-1-report.md`
- Final run: `evals/reports/runtime/context-mode-real-deep-final-slice-11-report.md`

## Headline

Freeflow improved substantially over the committed baseline and is competitive with real Context Mode, but it is not a blanket replacement for Context Mode.

- Freeflow aggregate improved from **17/28 correct** and **76/92 facts** to **35/36 correct** and **124/124 facts**.
- Freeflow aggregate visible output dropped from **180,434 bytes** to **42,423 bytes**.
- Freeflow aggregate weighted reduction improved from **76.28%** to **95.76%**.
- Real Context Mode comparable rows in the final run were **16/16 correct**, **53/53 facts**, and **92.58%** weighted reduction.

Public superiority claims remain disallowed because the benchmark still shows different strengths by task class.

## Baseline vs Final Freeflow

| Area | Baseline | Final | Result |
| --- | ---: | ---: | --- |
| All Freeflow rows | 17/28 correct, 76/92 facts, 180,434 visible bytes, 76.28% reduction | 35/36 correct, 124/124 facts, 42,423 visible bytes, 95.76% reduction | Large improvement |
| `freeflow:run-cat-default` | 3/9 correct, 25/36 facts, 158,978 visible bytes, 46.76% reduction | 9/9 correct, 36/36 facts, 12,314 visible bytes, 95.88% reduction | Fixed correctness and verbosity |
| `freeflow:repo-query` | 1/4 correct, 8/12 facts, 7,570 visible bytes, 55.78% reduction | 4/4 correct, 12/12 facts, 10,234 visible bytes, 42.21% reduction | Fixed correctness, but context savings worsened |
| `freeflow:batch` | 0/1 correct, 2/3 facts, 2,764 visible bytes, 95.27% reduction | 1/1 correct, 3/3 facts, 5,408 visible bytes, 90.75% reduction | Fixed answer aggregation, still compact |
| Transform/count example | not present as final transform row | 1/1 correct, 1/1 facts, 660 visible bytes, 99.25% reduction | Added deterministic transform evidence |

## Final Freeflow vs Real Context Mode

| Capability | Context Mode | Freeflow | Assessment |
| --- | ---: | ---: | --- |
| File/output summarization | `ctx_execute_file`: 10/10 correct, 37/37 facts, 8,349 visible bytes, 97.20% reduction, 37.3ms avg | `freeflow:run-cat-default`: 9/9 correct, 36/36 facts, 12,314 visible bytes, 95.88% reduction, 14.3ms avg | Freeflow is correct and faster with exact recovery, but Context Mode is smaller |
| Built-in processing reducers | n/a direct aggregate | 8/8 correct, 32/32 facts, 2,960 visible bytes, 98.76% reduction, 5.6ms avg | Freeflow reducers beat the Context Mode file-transform aggregate on context size for covered shapes |
| Repo/docs search | Context search rows: 5/5 correct, 13/13 facts, 6,714 visible bytes, 62.23% reduction, 1.2ms avg | Freeflow search rows: 5/5 correct, 13/13 facts, 12,480 visible bytes, 29.79% reduction, 22ms avg | Context Mode is better for indexed search compactness and latency |
| Batch | `ctx_batch_execute`: 1/1 correct, 3/3 facts, 12,757 visible bytes, 78.18% reduction, 20ms | `freeflow:batch`: 1/1 correct, 3/3 facts, 5,408 visible bytes, 90.75% reduction, 66ms | Freeflow is more compact; Context Mode is faster |

## Remaining Gaps

- `freeflow_run` is a host command runner/capture layer, not a project-boundary file sandbox. The outside-file-boundary benchmark row remains an expected visible limitation.
- Freeflow repo/docs search is now correct, but still more verbose and slower than Context Mode indexed search.
- Small metadata-only success rows intentionally preserve storage-policy semantics, but they are verbose relative to tiny raw output.
- Public superiority claims should wait until acceptance criteria define which task classes matter and whether search/indexing compactness must match Context Mode.

## Conclusion

Freeflow is now clearly better than its baseline and beats Context Mode for several Freeflow-owned processing paths, especially deterministic reducers and batch query aggregation. Context Mode still wins on indexed repo/docs search compactness and latency. The honest claim is:

> Freeflow now achieves Context Mode-class context savings for routed command/output processing and beats it for covered reducers and batch aggregation, while preserving exact recovery. It does not yet beat Context Mode’s indexed search path.
