# Output Router Benchmark Report - Iteration 1

Date: 2026-06-16

## Scope

Deterministic, CI-friendly tool benchmark for Freeflow Router retrieval behavior. The runner compares a native text-search proxy, a pre-hardening Freeflow-style proxy, and the improved Freeflow Router implementation. Optional external comparators are recorded as skipped rather than failed.

## Command

```sh
npm run bench:router
```

## Summary

- Iterations per mode: 3
- Fixtures: 7
- Improved Freeflow Router gated pass: 7/7
- Native baseline proxy pass: 3/7
- Pre-hardening Freeflow proxy pass: 2/7
- Generated false positives observed: 4
- Sandbox failure fixed: yes

## Results

| fixture | mode | correctness | path | lines | raw bytes/tokens | routed bytes/tokens | latency p50/p95 ms | recovery | notes |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| exact-copied-text-block | native-baseline-proxy | pass | target.md | 1-3 | 138/35 | 78/20 | 0.30/4.82 | not-applicable | score=28.00 |
| exact-copied-text-block | pre-hardening-freeflow-proxy | pass | target.md | 1-3 | 138/35 | 78/20 | 0.26/0.26 | failed | score=28.00 |
| exact-copied-text-block | improved-freeflow-router | pass | target.md | 1-3 | 138/35 | 841/211 | 0.72/1.00 | passed | Deterministic repo retrieval selected target.md:1-3 (matched exact normalized query phrase in section chunk). |
| markdown-heading-nearby-body | native-baseline-proxy | fail | decoy.md | 1-1 | 169/43 | 44/11 | 0.18/0.23 | not-applicable | score=20.00 |
| markdown-heading-nearby-body | pre-hardening-freeflow-proxy | fail | decoy.md | 1-1 | 169/43 | 44/11 | 0.21/0.22 | failed | score=20.00 |
| markdown-heading-nearby-body | improved-freeflow-router | pass | target.md | 3-6 | 169/43 | 892/223 | 0.47/0.47 | passed | Deterministic repo retrieval selected target.md:3-6 (BM25-style scored section chunk with 6/6 query-token coverage). |
| generated-artifact-decoy | native-baseline-proxy | fail | graphify-out/graph.html | 1-3 | 310220/77555 | 310058/77515 | 1.45/1.52 | not-applicable | score=140000.00 |
| generated-artifact-decoy | pre-hardening-freeflow-proxy | fail | graphify-out/graph.html | 1-3 | 310220/77555 | 310058/77515 | 1.35/1.37 | failed | score=140000.00 |
| generated-artifact-decoy | improved-freeflow-router | pass | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/77555 | 1281/321 | 0.75/0.95 | passed | Deterministic repo retrieval selected docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-7 (BM25-style scored window chunk with 5/5 query-token coverage). |
| huge-single-line-decoy | native-baseline-proxy | fail | debug.log | 1-1 | 192091/48023 | 192013/48004 | 0.46/0.55 | not-applicable | score=24000.00 |
| huge-single-line-decoy | pre-hardening-freeflow-proxy | fail | debug.log | 1-1 | 192091/48023 | 192013/48004 | 0.39/0.43 | failed | score=24000.00 |
| huge-single-line-decoy | improved-freeflow-router | pass | docs/router.md | 1-3 | 192091/48023 | 884/221 | 0.53/0.64 | passed | Deterministic repo retrieval selected docs/router.md:1-3 (BM25-style scored section chunk with 4/4 query-token coverage). |
| ambiguous-multi-file-query | native-baseline-proxy | fail | decoy.md | 1-1 | 8262/2066 | 8100/2025 | 0.25/0.28 | not-applicable | score=3600.00 |
| ambiguous-multi-file-query | pre-hardening-freeflow-proxy | fail | decoy.md | 1-1 | 8262/2066 | 8100/2025 | 0.25/0.27 | failed | score=3600.00 |
| ambiguous-multi-file-query | improved-freeflow-router | pass | target.md | 1-3 | 8262/2066 | 885/222 | 0.83/0.87 | passed | Deterministic repo retrieval selected target.md:1-3 (BM25-style scored section chunk with 6/6 query-token coverage). |
| vaulted-output-query | native-baseline-proxy | pass | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 115/29 | 0.00/0.08 | not-applicable | score=12.00 |
| vaulted-output-query | pre-hardening-freeflow-proxy | pass | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 115/29 | 0.00/0.01 | failed | score=12.00 |
| vaulted-output-query | improved-freeflow-router | pass | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 1044/261 | 0.20/0.33 | passed | Deterministic lexical retrieval selected vaulted outputId=ffout_91e882b51880dd5b9bbbc3ac stream=stderr lines=1-3. |
| expand-narrow-evidence | native-baseline-proxy | pass | target.md | 1-24 | 623/156 | 623/156 | 0.05/0.09 | not-applicable |  |
| expand-narrow-evidence | pre-hardening-freeflow-proxy | fail | decoy.md | 1-1 | 3824/956 | 3200/800 | 0.18/0.20 | failed | score=800.00 |
| expand-narrow-evidence | improved-freeflow-router | pass | target.md | 1-24 | 623/156 | 1283/321 | 0.54/0.70 | passed | Expanded repo evidence ev_abbf2a42502f2e46 to target.md:1-24. |

## Skipped External Comparators

- Graphify: Optional external comparator is not required for CI-friendly router benchmarks.
- Claude Context: Optional semantic/hybrid search comparator is skipped unless configured separately.
- RTK: Command-output comparator belongs to the later command benchmark track.
- Squeez: Session-efficiency comparator belongs to the later command/session benchmark track.

## Regression Status

Improved Freeflow Router passed all gated benchmark fixtures.

The generated-artifact decoy benchmark preserves the original Sandbox Permissions false-positive shape and records it as fixed when the improved router selects the docs target instead of `graphify-out/graph.html`.
