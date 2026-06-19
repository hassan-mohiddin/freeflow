# Output Router Index Benchmark Report - Iteration 1

Date: 2026-06-19

## Scope

Optional Local Index Experiment for `freeflow_retrieve`. The scanner remains the product default; this benchmark measures an isolated no-dependency local index for cold build, warm query, stale refresh, accuracy, and bounded context bytes.

The index cache is keyed by repo root and stores outside the repo by default. No external service, vector DB, or native dependency is required.

## Command

```sh
npm run bench:router:index
```

The CLI writes machine-readable JSON under `plugins/freeflow/evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

## Summary

- Fixtures: 3
- Scanner remains default: yes
- Index adopted by default: no
- Scanner pass: 3/3
- Index warm pass: 3/3
- Generated false positives: 0/12
- Cold build p50/p95: 0.54/0.60 ms
- Warm query p50/p95: 0.05/0.05 ms
- Stale refresh p50/p95: 0.63/0.64 ms
- Index warm context reduction: 99.65% (310411 raw bytes to 1094 context bytes)

## Results

| fixture | mode | correctness | checks | path | lines | raw/context bytes | context reduction | latency p50/p95 ms | build/query ms | index mode | notes |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| index-exact-copied-text | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/884 | -526.95% | 1.82/8.91 | 0.00/0.60 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-exact-copied-text | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/331 | -134.75% | 1.49/2.75 | 0.54/0.05 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-r7upKR/f04b8407b77fa9f717dd9564.json |
| index-exact-copied-text | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/331 | -134.75% | 1.77/1.78 | 0.40/0.05 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-kc93Ll/cd3f91873cbfd481a0aabd11.json |
| index-exact-copied-text | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 162/331 | -104.32% | 2.16/2.24 | 0.64/0.04 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-dkvPKs/081e2c5b305ef20222dd1abb.json; refresh=1 added |
| index-generated-artifact-decoy | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-9 | 310220/1396 | 99.55% | 1.79/1.91 | 0.00/0.48 | - | Deterministic repo retrieval selected 1 candidate(s); top result docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-9 (BM25-style scored section chunk with 7/7 query-token coverage). |
| index-generated-artifact-decoy | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/441 | 99.86% | 2.01/2.13 | 0.60/0.07 | cold-built | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-3Bfr2Z/98be4feff1f05091b433908e.json |
| index-generated-artifact-decoy | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/441 | 99.86% | 2.47/2.57 | 0.40/0.05 | warm-loaded | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-FbJHJ8/f4cfef86a204285ffc467fe5.json |
| index-generated-artifact-decoy | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310241/441 | 99.86% | 2.75/2.76 | 0.63/0.05 | stale-refreshed | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-qADDtj/50363bd015a0b00d1b8a6def.json; refresh=1 added |
| index-stale-refresh | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/875 | -1650.00% | 0.79/0.79 | 0.00/0.29 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-stale-refresh | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 0.92/1.00 | 0.32/0.02 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-oJDEF5/1f73f887e1e218f51117259b.json |
| index-stale-refresh | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 1.08/1.09 | 0.23/0.01 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-WtoraQ/48c8cc02340495c0cf983246.json |
| index-stale-refresh | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 1.39/1.50 | 0.36/0.02 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-C1Zne9/c83bcc59de19854e1076ff1e.json; refresh=1 changed |

## Adoption Decision

Index adopted by default: no. This slice only adds an experiment and benchmark evidence; scanner behavior remains the default until a later adoption checkpoint explicitly approves otherwise.

## Regression Status

Warm experimental index passed all gated fixtures without generated-artifact false positives.
