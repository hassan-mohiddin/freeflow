# Output Router Benchmark Report - Iteration 1

Date: 2026-06-16

## Scope

Deterministic, CI-friendly tool benchmark for Freeflow Router retrieval behavior. The runner compares a native text-search proxy, a pre-hardening Freeflow-style proxy, and the improved Freeflow Router implementation. Optional external comparators are recorded as skipped rather than failed.

Reduction percentages compare routed/context bytes and approximate tokens against the raw source or direct output for that mode. Negative reduction means structured routing overhead is larger than the tiny raw output; native exact-search proxies can still be smaller than the router for simple lookups.

## Baseline Caveat

The pre-hardening Freeflow mode is a deterministic proxy for the old line-scoring behavior, not a checkout of an older runtime. It is useful for stable regression pressure, not historical performance archaeology.

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
- Generated false positives observed: 4/21 mode results
- Improved generated false positives: 0/7
- Improved weighted byte/token reduction: 98.61% / 98.61% (511618/127907 raw to 7110/1780 routed)
- Improved average byte/token reduction: -223.23% / -219.84%
- Improved median byte/token reduction: -105.94% / -105.77%
- Improved path/span/excerpt checks: 7/7 path, 7/7 span, 7/7 excerpt
- Sandbox failure fixed: yes

## Results

| fixture | mode | correctness | checks | path | lines | raw bytes/tokens | routed bytes/tokens | byte/token reduction | latency p50/p95 ms | recovery | notes |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| exact-copied-text-block | native-baseline-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 138/35 | 78/20 | 43.48%/42.86% | 0.27/4.59 | not-applicable | score=28.00 |
| exact-copied-text-block | pre-hardening-freeflow-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 138/35 | 78/20 | 43.48%/42.86% | 0.25/0.25 | failed | score=28.00 |
| exact-copied-text-block | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 138/35 | 841/211 | -509.42%/-502.86% | 0.84/1.25 | passed | Deterministic repo retrieval selected target.md:1-3 (matched exact normalized query phrase in section chunk).; recovery=passed: Verified repo retrieve target.md:1-3. |
| markdown-heading-nearby-body | native-baseline-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 169/43 | 44/11 | 73.96%/74.42% | 0.18/0.21 | not-applicable | score=20.00 |
| markdown-heading-nearby-body | pre-hardening-freeflow-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 169/43 | 44/11 | 73.96%/74.42% | 0.16/0.17 | failed | score=20.00 |
| markdown-heading-nearby-body | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 3-6 | 169/43 | 892/223 | -427.81%/-418.60% | 0.57/0.60 | passed | Deterministic repo retrieval selected target.md:3-6 (BM25-style scored section chunk with 6/6 query-token coverage).; recovery=passed: Verified repo retrieve target.md:3-6. |
| generated-artifact-decoy | native-baseline-proxy | fail | path ✗ span ✓ excerpt ✓ gen-fp ✗ | graphify-out/graph.html | 1-3 | 310220/77555 | 310058/77515 | 0.05%/0.05% | 1.42/1.52 | not-applicable | score=140000.00 |
| generated-artifact-decoy | pre-hardening-freeflow-proxy | fail | path ✗ span ✓ excerpt ✓ gen-fp ✗ | graphify-out/graph.html | 1-3 | 310220/77555 | 310058/77515 | 0.05%/0.05% | 1.33/1.33 | failed | score=140000.00 |
| generated-artifact-decoy | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/77555 | 1281/321 | 99.59%/99.59% | 0.83/0.92 | passed | Deterministic repo retrieval selected docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-7 (BM25-style scored window chunk with 5/5 query-token coverage).; recovery=passed: Verified repo retrieve docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-7. |
| huge-single-line-decoy | native-baseline-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✗ | debug.log | 1-1 | 192091/48023 | 192013/48004 | 0.04%/0.04% | 0.43/0.65 | not-applicable | score=24000.00 |
| huge-single-line-decoy | pre-hardening-freeflow-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✗ | debug.log | 1-1 | 192091/48023 | 192013/48004 | 0.04%/0.04% | 0.45/0.47 | failed | score=24000.00 |
| huge-single-line-decoy | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/router.md | 1-3 | 192091/48023 | 884/221 | 99.54%/99.54% | 0.61/0.75 | passed | Deterministic repo retrieval selected docs/router.md:1-3 (BM25-style scored section chunk with 4/4 query-token coverage).; recovery=passed: Verified repo retrieve docs/router.md:1-3. |
| ambiguous-multi-file-query | native-baseline-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 8262/2066 | 8100/2025 | 1.96%/1.98% | 0.27/0.27 | not-applicable | score=3600.00 |
| ambiguous-multi-file-query | pre-hardening-freeflow-proxy | fail | path ✗ span ✗ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 8262/2066 | 8100/2025 | 1.96%/1.98% | 0.24/0.25 | failed | score=3600.00 |
| ambiguous-multi-file-query | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 8262/2066 | 885/222 | 89.29%/89.25% | 0.82/0.83 | passed | Deterministic repo retrieval selected target.md:1-3 (BM25-style scored section chunk with 6/6 query-token coverage).; recovery=passed: Verified repo retrieve target.md:1-3. |
| vaulted-output-query | native-baseline-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 115/29 | 0.00%/0.00% | 0.00/0.05 | not-applicable | score=12.00 |
| vaulted-output-query | pre-hardening-freeflow-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 115/29 | 0.00%/0.00% | 0.00/0.02 | failed | score=12.00 |
| vaulted-output-query | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | ffout_91e882b51880dd5b9bbbc3ac:stderr | 1-3 | 115/29 | 1044/261 | -807.83%/-800.00% | 0.38/0.59 | passed | Deterministic lexical retrieval selected vaulted outputId=ffout_91e882b51880dd5b9bbbc3ac stream=stderr lines=1-3.; recovery=passed: Verified vault retrieve ffout_91e882b51880dd5b9bbbc3ac:stderr:1-3. |
| expand-narrow-evidence | native-baseline-proxy | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-24 | 623/156 | 623/156 | 0.00%/0.00% | 0.05/0.08 | not-applicable |  |
| expand-narrow-evidence | pre-hardening-freeflow-proxy | fail | path ✗ span ✓ excerpt ✗ gen-fp ✓ | decoy.md | 1-1 | 3824/956 | 3200/800 | 16.32%/16.32% | 0.17/0.19 | failed | score=800.00 |
| expand-narrow-evidence | improved-freeflow-router | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-24 | 623/156 | 1283/321 | -105.94%/-105.77% | 0.56/0.77 | passed | Expanded repo evidence ev_abbf2a42502f2e46 to target.md:1-24.; recovery=passed: Verified repo retrieve target.md:1-24. |

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
