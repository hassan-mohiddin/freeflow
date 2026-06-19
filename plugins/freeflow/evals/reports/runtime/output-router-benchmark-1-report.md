# Output Router Benchmark Report - Iteration 1

Date: 2026-06-19

## Scope

Deterministic, CI-friendly tool benchmark for Freeflow Router retrieval behavior. The runner compares a native text-search proxy, a pre-hardening Freeflow-style proxy, and the improved Freeflow Router implementation. Optional external comparators are recorded as skipped rather than failed.

Reduction percentages compare routed/context bytes and approximate tokens against the raw source or direct output for that mode. Negative reduction means structured routing overhead is larger than the tiny raw output; native exact-search proxies can still be smaller than the router for simple lookups.

## Baseline Caveat

The pre-hardening Freeflow mode is a deterministic proxy for the old line-scoring behavior, not a checkout of an older runtime. It is useful for stable regression pressure, not historical performance archaeology.

## Command

```sh
npm run bench:router
```

The CLI writes machine-readable JSON under `plugins/freeflow/evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

## Summary

- Iterations per mode: 3
- Fixtures: 7
- Improved Freeflow Router gated pass: 7/7
- Native baseline proxy pass: 3/7
- Pre-hardening Freeflow proxy pass: 2/7
- Generated false positives observed: 4/21 mode results
- Improved generated false positives: 0/7
- Improved weighted byte/token reduction: 98.54% / 98.54% (511618/127907 raw to 7473/1870 routed)
- Improved average byte/token reduction: -235.00% / -231.39%
- Improved median byte/token reduction: -105.94% / -105.77%
- Improved path/span/excerpt checks: 7/7 path, 7/7 span, 7/7 excerpt
- Sandbox failure fixed: yes

## Results

| fixture | mode | correctness | checks | path | lines | raw bytes/tokens | routed bytes/tokens | byte/token reduction | latency p50/p95 ms | recovery | notes |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| exact-copied-text-block | native-baseline-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 138/35 | 78/20 | 43.48%/42.86% | 0.28/5.15 | not-applicable | score=28.00 |
| exact-copied-text-block | pre-hardening-freeflow-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 138/35 | 78/20 | 43.48%/42.86% | 0.24/0.26 | failed | score=28.00 |
| exact-copied-text-block | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 138/35 | 903/226 | -554.35%/-545.71% | 0.80/2.55 | passed | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk).; recovery=passed: Verified repo retrieve target.md:1-3. |
| markdown-heading-nearby-body | native-baseline-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 169/43 | 44/11 | 73.96%/74.42% | 0.18/0.22 | not-applicable | score=20.00 |
| markdown-heading-nearby-body | pre-hardening-freeflow-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 169/43 | 44/11 | 73.96%/74.42% | 0.17/0.27 | failed | score=20.00 |
| markdown-heading-nearby-body | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 3-6 | 169/43 | 954/239 | -464.50%/-455.81% | 0.67/0.68 | passed | Deterministic repo retrieval selected 1 candidate(s); top result target.md:3-6 (BM25-style scored section chunk with 6/6 query-token coverage).; recovery=passed: Verified repo retrieve target.md:3-6. |
| generated-artifact-decoy | native-baseline-proxy | fail | path ✗ span ✓ excerpt ✓ gen-fp ✗ | graphify-out/graph.html | 1-3 | 310220/77555 | 310058/77515 | 0.05%/0.05% | 1.42/1.57 | not-applicable | score=140000.00 |
| generated-artifact-decoy | pre-hardening-freeflow-proxy | fail | path ✗ span ✓ excerpt ✓ gen-fp ✗ | graphify-out/graph.html | 1-3 | 310220/77555 | 310058/77515 | 0.05%/0.05% | 1.37/1.43 | failed | score=140000.00 |
| generated-artifact-decoy | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-9 | 310220/77555 | 1396/349 | 99.55%/99.55% | 1.09/1.24 | passed | Deterministic repo retrieval selected 1 candidate(s); top result docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-9 (BM25-style scored section chunk with 7/7 query-token coverage).; recovery=passed: Verified repo retrieve docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-9. |
| huge-single-line-decoy | native-baseline-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✗ | debug.log | 1-1 | 192091/48023 | 192013/48004 | 0.04%/0.04% | 0.41/0.46 | not-applicable | score=24000.00 |
| huge-single-line-decoy | pre-hardening-freeflow-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✗ | debug.log | 1-1 | 192091/48023 | 192013/48004 | 0.04%/0.04% | 0.43/0.57 | failed | score=24000.00 |
| huge-single-line-decoy | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/router.md | 1-3 | 192091/48023 | 946/237 | 99.51%/99.51% | 0.73/0.81 | passed | Deterministic repo retrieval selected 1 candidate(s); top result docs/router.md:1-3 (BM25-style scored section chunk with 6/6 query-token coverage).; recovery=passed: Verified repo retrieve docs/router.md:1-3. |
| ambiguous-multi-file-query | native-baseline-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 8262/2066 | 8100/2025 | 1.96%/1.98% | 0.26/0.28 | not-applicable | score=3600.00 |
| ambiguous-multi-file-query | pre-hardening-freeflow-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 8262/2066 | 8100/2025 | 1.96%/1.98% | 0.26/0.30 | failed | score=3600.00 |
| ambiguous-multi-file-query | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 8262/2066 | 947/237 | 88.54%/88.53% | 1.03/1.05 | passed | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (BM25-style scored section chunk with 6/6 query-token coverage).; recovery=passed: Verified repo retrieve target.md:1-3. |
| vaulted-output-query | native-baseline-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 115/29 | 0.00%/0.00% | 0.01/0.07 | not-applicable | score=12.00 |
| vaulted-output-query | pre-hardening-freeflow-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 115/29 | 0.00%/0.00% | 0.00/0.01 | failed | score=12.00 |
| vaulted-output-query | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 1044/261 | -807.83%/-800.00% | 0.39/0.64 | passed | Deterministic lexical retrieval selected vaulted outputId=ffout_91e882b51880dd5b9bbbc3ac stream=stderr lines=1-3.; recovery=passed: Verified vault retrieve ffout_91e882b51880dd5b9bbbc3ac:stderr:1-3. |
| expand-narrow-evidence | native-baseline-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-24 | 623/156 | 623/156 | 0.00%/0.00% | 0.06/0.08 | not-applicable |  |
| expand-narrow-evidence | pre-hardening-freeflow-proxy | fail | path ✗ span ✓ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 3824/956 | 3200/800 | 16.32%/16.32% | 0.17/0.18 | failed | score=800.00 |
| expand-narrow-evidence | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-24 | 623/156 | 1283/321 | -105.94%/-105.77% | 0.87/0.93 | passed | Expanded repo evidence ev_0ba9afec918a3334 to target.md:1-24.; recovery=passed: Verified repo retrieve target.md:1-24. |

## Not Yet Measured

- recall@3 / alternate candidates: not measured in this first deterministic runner.
- explanation quality: not measured beyond route reason capture.
- command-output parser benchmarks: deferred to the command benchmark track.

## Skipped External Comparators

- Graphify: Optional external comparator is not required for CI-friendly router benchmarks.
- Claude Context: Optional semantic/hybrid search comparator is skipped unless configured separately.
- RTK: Command-output comparator belongs to the later command benchmark track.
- Squeez: Session-efficiency comparator belongs to the later command/session benchmark track.

## Regression Status

Improved Freeflow Router passed all gated benchmark fixtures.

The generated-artifact decoy benchmark preserves the original Sandbox Permissions false-positive shape and records it as fixed when the improved router selects the docs target instead of `graphify-out/graph.html`.
