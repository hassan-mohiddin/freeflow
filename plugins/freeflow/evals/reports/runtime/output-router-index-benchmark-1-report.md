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
- Cold build p50/p95: 0.52/0.55 ms
- Warm query p50/p95: 0.04/0.05 ms
- Stale refresh p50/p95: 0.59/0.66 ms
- Index warm context reduction: 99.65% (310411 raw bytes to 1094 context bytes)

## Results

| fixture | mode | correctness | checks | path | lines | raw/context bytes | context reduction | latency p50/p95 ms | build/query ms | index mode | notes |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| index-exact-copied-text | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/884 | -526.95% | 1.59/9.00 | 0.00/0.69 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-exact-copied-text | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/331 | -134.75% | 1.54/2.60 | 0.52/0.05 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-78JsdJ/60df3ea5bcbf9aac5ab3d8c8.json |
| index-exact-copied-text | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/331 | -134.75% | 1.92/2.00 | 0.39/0.04 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-oKvlnG/5eaee11c0580ef65578b9edf.json |
| index-exact-copied-text | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 162/331 | -104.32% | 2.14/2.17 | 0.59/0.04 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-t4Sd6m/dc190a329308bbb1a7eef79d.json; refresh=1 added |
| index-generated-artifact-decoy | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-9 | 310220/1396 | 99.55% | 1.69/1.88 | 0.00/0.42 | - | Deterministic repo retrieval selected 1 candidate(s); top result docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-9 (BM25-style scored section chunk with 7/7 query-token coverage). |
| index-generated-artifact-decoy | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/441 | 99.86% | 1.95/1.98 | 0.55/0.07 | cold-built | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-OgZWrX/240794126daa417fbd927cad.json |
| index-generated-artifact-decoy | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/441 | 99.86% | 2.28/2.46 | 0.41/0.05 | warm-loaded | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-pk3PFo/b7449764598f064ce3611baa.json |
| index-generated-artifact-decoy | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310241/441 | 99.86% | 2.70/2.75 | 0.66/0.06 | stale-refreshed | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-2Mudd9/496b044a52c1f3a65e5e777d.json; refresh=1 added |
| index-stale-refresh | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/875 | -1650.00% | 0.75/0.92 | 0.00/0.25 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-stale-refresh | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 0.85/0.87 | 0.31/0.02 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-VJE4CK/193babc11b4bd78a0dfb0a9f.json |
| index-stale-refresh | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 1.06/1.13 | 0.23/0.02 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-ReLeRp/0a7b8e5eeb2986fdd270f3d6.json |
| index-stale-refresh | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 1.30/1.40 | 0.41/0.01 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-myr4Jb/bab0da929967f77665901e54.json; refresh=1 changed |

## Adoption Decision

Index adopted by default: no. This slice only adds an experiment and benchmark evidence; scanner behavior remains the default until a later adoption checkpoint explicitly approves otherwise.

## Regression Status

Warm experimental index passed all gated fixtures without generated-artifact false positives.
