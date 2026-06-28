# Context Mode Normalized Benchmark Report - Iteration 1

Date: 2026-06-28

## Scope

This benchmark compares Freeflow-owned tools against a normalized Context Mode-style proxy over representative command, docs, logs, JSON/table, repo-search, and batch fixture classes.

The proxy is not the external Context Mode runtime. It stores exact raw fixture payloads behind synthetic handles and returns bounded relevant snippets. Treat results as directionally useful fixture evidence, not a public superiority claim.

## Command

```sh
npm run bench:router:context-mode-normalized
```

The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

## Summary

- Fixtures: 6
- Freeflow passed: 6/6
- Context Mode proxy passed: 6/6
- Freeflow answer-accurate visible output: 4/6
- Freeflow exact facts preserved: 6/6
- Freeflow recovery available: 6/6
- Freeflow lower model-visible bytes: 0/6
- Freeflow lower tool-call count: 1/6
- Freeflow model-visible reduction: 97.96% (175808 raw bytes to 3595 visible bytes)
- Context Mode proxy model-visible reduction: 98.67% (175808 raw bytes to 2338 visible bytes)
- Public superiority claims allowed: no

## Results

| fixture | category | mode | pass | answer | facts | recovery | tool calls | raw/visible bytes | reduction | storage bytes | latency p50/p95 ms | notes |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| command-test-build-output | command | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 394/561 | -42.39% | 394 | 0.48/0.48 | normalized proxy, not actual Context Mode runtime |
| command-test-build-output | command | freeflow-owned-tools | pass | no | yes | yes | 1 | 394/643 | -63.20% | 6277 | 6.66/6.66 | Command failed or did not complete (executionStatus=failed exitCode=1); selected failure evidence was returned and raw output was vaulted before routing (parser=test-runner confidence=0.92 fidelity=exact). |
| docs-markdown-query | docs | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 352/306 | 13.07% | 352 | 0.15/0.15 | normalized proxy, not actual Context Mode runtime |
| docs-markdown-query | docs | freeflow-owned-tools | pass | yes | yes | yes | 1 | 352/536 | -52.27% | 0 | 3.51/3.51 | Deterministic repo retrieval selected 1 candidate(s); top result plugin-docs/output-router.md:5-9 (BM25-style scored section chunk with 12/12 query-token coverage). |
| large-log-search | logs | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 10169/359 | 96.47% | 10169 | 0.17/0.17 | normalized proxy, not actual Context Mode runtime |
| large-log-search | logs | freeflow-owned-tools | pass | yes | yes | yes | 1 | 10169/556 | 94.53% | 41826 | 5.14/5.14 | Command output was vaulted before declarative filters were applied (executionStatus=success exitCode=0; filters: stream=stdout include="RATE_LIMIT"\|"req_critical_42" maxLines=5 selected=1/203 lines; parser=generic confidence=0.35 fidelity=exact). |
| json-table-output | json-csv | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 5904/260 | 95.60% | 5904 | 0.20/0.20 | normalized proxy, not actual Context Mode runtime |
| json-table-output | json-csv | freeflow-owned-tools | pass | yes | yes | yes | 1 | 5904/533 | 90.97% | 36288 | 4.62/4.62 | Command output was vaulted before declarative filters were applied (executionStatus=success exitCode=0; filters: stream=stdout include="JSON_TABLE_NEEDLE"\|"12345" maxLines=8 selected=2/407 lines; parser=generic confidence=0.35 fidelity=exact). |
| repo-text-search-generated-decoy | repo-search | context-mode-normalized-proxy | pass | yes | yes | yes | 1 | 148238/326 | 99.78% | 212 | 0.11/0.11 | normalized proxy, not actual Context Mode runtime |
| repo-text-search-generated-decoy | repo-search | freeflow-owned-tools | pass | yes | yes | yes | 1 | 148238/451 | 99.70% | 0 | 3.35/3.35 | Deterministic repo retrieval selected 1 candidate(s); top result src/sandbox.ts:3-5 (BM25-style scored window chunk with 8/8 query-token coverage). |
| batch-multi-command-query | batch | context-mode-normalized-proxy | pass | no | yes | yes | 3 | 10751/526 | 95.11% | 10751 | 0.19/0.19 | normalized proxy, not actual Context Mode runtime |
| batch-multi-command-query | batch | freeflow-owned-tools | pass | no | yes | yes | 1 | 10751/876 | 91.85% | 10053 | 6.13/6.13 | Ran 3 independent Freeflow-owned step(s) with concurrency=3; 1 step(s) failed and 2 step(s) completed. Child results are available in details.result.steps. |

## Decision

No public Context Mode superiority claim is made from this benchmark. It is a normalized fixture comparison used to catch token/recovery regressions before any public naming or docs migration.
