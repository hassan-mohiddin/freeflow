# Output Router Index Benchmark Report - Iteration 1

Date: 2026-06-18

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
- Cold build p50/p95: 0.62/1.40 ms
- Warm query p50/p95: 0.10/0.10 ms
- Stale refresh p50/p95: 0.69/0.73 ms
- Index warm context reduction: 99.65% (310411 raw bytes to 1094 context bytes)

## Results

| fixture | mode | correctness | checks | path | lines | raw/context bytes | context reduction | latency p50/p95 ms | build/query ms | index mode | notes |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| index-exact-copied-text | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/884 | -526.95% | 7.67/7.67 | 0.00/1.39 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-exact-copied-text | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/331 | -134.75% | 2.85/2.85 | 1.40/0.25 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-PrbnSU/9d1b77604926eaa62a5c146e.json |
| index-exact-copied-text | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 141/331 | -134.75% | 2.27/2.27 | 0.59/0.10 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-cN94bv/99d4959a5543c0bedc79aeb1.json |
| index-exact-copied-text | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 162/331 | -104.32% | 2.65/2.65 | 0.69/0.07 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-lts1X9/ee0dd36c5303a660986ebc36.json; refresh=1 added |
| index-generated-artifact-decoy | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/1343 | 99.57% | 2.11/2.11 | 0.00/0.61 | - | Deterministic repo retrieval selected 1 candidate(s); top result docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:3-7 (BM25-style scored window chunk with 5/5 query-token coverage). |
| index-generated-artifact-decoy | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/441 | 99.86% | 2.04/2.04 | 0.62/0.08 | cold-built | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-slUMoN/81e0732e4dbab01357946e13.json |
| index-generated-artifact-decoy | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310220/441 | 99.86% | 2.62/2.62 | 0.49/0.10 | warm-loaded | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-iU3LDG/f18b4cef53057d362b54b891.json |
| index-generated-artifact-decoy | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md | 3-7 | 310241/441 | 99.86% | 3.04/3.04 | 0.73/0.06 | stale-refreshed | BM25-style indexed window chunk with 5/5 query-token coverage; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-tdXoM6/6d53ea350375f9b954623adf.json; refresh=1 added |
| index-stale-refresh | scanner-default | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/875 | -1650.00% | 0.84/0.84 | 0.00/0.29 | - | Deterministic repo retrieval selected 1 candidate(s); top result target.md:1-3 (matched exact normalized query phrase in section chunk). |
| index-stale-refresh | index-cold | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 0.97/0.97 | 0.38/0.02 | cold-built | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-Fl0d2H/0b10cfa6a43c76e2ef53c68f.json |
| index-stale-refresh | index-warm | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 1.23/1.23 | 0.27/0.02 | warm-loaded | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-309jVg/13bb391b295f36db57e3e48d.json |
| index-stale-refresh | index-stale-refresh | pass | path ✓ span ✓ excerpt ✓ gen-fp ✓ | target.md | 1-3 | 50/322 | -544.00% | 1.49/1.49 | 0.38/0.03 | stale-refreshed | matched exact normalized query phrase in indexed section chunk; cachePath=/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-router-index-benchmark-cache-NPaNjT/d18dd2404415867f478b7c82.json; refresh=1 changed |

## Adoption Decision

Index adopted by default: no. This slice only adds an experiment and benchmark evidence; scanner behavior remains the default until a later adoption checkpoint explicitly approves otherwise.

## Regression Status

Warm experimental index passed all gated fixtures without generated-artifact false positives.
