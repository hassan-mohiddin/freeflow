# Deep Freeflow vs real Context Mode benchmark

Generated: 2026-06-28T06:15:58.721Z
Implementation: context-mode-real-deep-benchmark-v1
Context Mode status: available
Context Mode: v1.0.167 a338a0d26d674b889d9ab231e04302686566ddb9
Freeflow: f1eb38711b53c1f3703627a1f27bf085a816381d
Artifacts root: /var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-context-mode-deep-YuRZD2
Public superiority claims allowed: no

## Methodology

- Context Mode is run as the real MCP stdio server from server.bundle.mjs through @modelcontextprotocol/sdk when available.
- Freeflow is run through committed router modules against the same local fixture project and an adapter host shell runner.
- freeflow:run-cat-default measures current Freeflow-owned command capture/routing without bespoke transforms.
- freeflow:run-computed-script measures what Freeflow can do when the agent writes external summarizer code; it is compact but not a Freeflow-owned sandboxed transform.
- Correctness checks use fixture ground-truth facts, not only byte reduction.
- No public superiority claim should be made from this local benchmark alone.

## Expected limitation checks

Expected Freeflow limitations detected: yes
- The expected limitation set tracks Freeflow behavior that should remain visible rather than silently reclassified as a pass.
- A missing expected limitation means behavior changed, the benchmark changed, or fixture facts need review before making comparison claims.

## Summary by mode

| mode | scenarios | correct | facts | raw bytes | visible bytes | reduction | avg latency | exact recovery | metadata-only |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| context-mode:ctx_execute_file | 10 | 10/10 | 37/37 | 298691 | 8349 | 97.2% | 37.3ms | 0 | 0 |
| freeflow:run-cat-default | 9 | 9/9 | 36/36 | 298623 | 12314 | 95.88% | 14.3ms | 9 | 0 |
| freeflow:process-test-output-reducer | 1 | 1/1 | 4/4 | 6185 | 289 | 95.33% | 4ms | 1 | 0 |
| freeflow:run-computed-script | 9 | 9/9 | 36/36 | 298623 | 7093 | 97.62% | 49.4ms | 3 | 6 |
| context-mode:upstream-benchmark-script | 1 | 0/1 | 1/4 | 6185 | 682 | 88.97% | 40ms | 0 | 0 |
| freeflow:process-diagnostics-reducer | 1 | 1/1 | 4/4 | 5023 | 240 | 95.22% | 3ms | 1 | 0 |
| freeflow:process-build-output-reducer | 1 | 1/1 | 4/4 | 6594 | 229 | 96.53% | 4ms | 1 | 0 |
| freeflow:process-access-log-reducer | 1 | 1/1 | 4/4 | 46216 | 272 | 99.41% | 5ms | 1 | 0 |
| freeflow:process-table-reducer | 1 | 1/1 | 4/4 | 87517 | 186 | 99.79% | 7ms | 1 | 0 |
| freeflow:process-mcp-tools-reducer | 1 | 1/1 | 4/4 | 17362 | 786 | 95.47% | 7ms | 1 | 0 |
| freeflow:process-browser-snapshot-reducer | 1 | 1/1 | 4/4 | 57521 | 368 | 99.36% | 8ms | 1 | 0 |
| freeflow:process-git-log-reducer | 1 | 1/1 | 4/4 | 11895 | 590 | 95.04% | 7ms | 1 | 0 |
| freeflow:transform-countMatches | 1 | 1/1 | 1/1 | 87517 | 660 | 99.25% | 5ms | 1 | 0 |
| context-mode:ctx_index+ctx_search | 4 | 4/4 | 12/12 | 17710 | 6300 | 64.43% | 1.3ms | 0 | 0 |
| freeflow:repo-query | 4 | 4/4 | 12/12 | 17710 | 10234 | 42.21% | 21.3ms | 0 | 0 |
| context-mode:ctx_search-after-mutation | 1 | 1/1 | 1/1 | 66 | 414 | -527.27% | 1ms | 0 | 0 |
| freeflow:repo-query-live-file | 1 | 1/1 | 1/1 | 66 | 2246 | -3303.03% | 25ms | 0 | 0 |
| context-mode:ctx_batch_execute | 1 | 1/1 | 3/3 | 58476 | 12757 | 78.18% | 20ms | 0 | 0 |
| freeflow:batch | 1 | 1/1 | 3/3 | 58476 | 5408 | 90.75% | 66ms | 0 | 0 |
| freeflow:run-cat-host-shell | 1 | 0/1 | 1/1 | 68 | 593 | -772.06% | 10ms | 0 | 1 |
| freeflow:small-success-default-storage | 1 | 1/1 | 1/1 | 20 | 545 | -2625% | 8ms | 0 | 1 |
| freeflow:small-success-preserve-full | 1 | 1/1 | 1/1 | 20 | 370 | -1750% | 8ms | 1 | 0 |

## Failure clusters

### Freeflow incorrect rows

- outside-file-boundary / freeflow:run-cat-host-shell: facts 1/1, visible 593B. Freeflow_run is a host command runner/capture layer, not a sandbox; it captured outside file content.

### Context Mode incorrect rows

- vitest-summary-upstream-script / context-mode:upstream-benchmark-script: facts 1/4, visible 682B. Runs Context Mode upstream benchmark summarizer; checks against fixture ground truth.

### Freeflow verbose rows (<50% reduction)

- react-code-search / freeflow:repo-query: 6075B raw -> 3506B visible (42.29%).
- tailwind-responsive-search / freeflow:repo-query: 4102B raw -> 3102B visible (24.38%).
- repo-generated-decoy / freeflow:repo-query: 284B raw -> 477B visible (-67.96%).
- stale-index-after-file-change / freeflow:repo-query-live-file: 66B raw -> 2246B visible (-3303.03%).
- outside-file-boundary / freeflow:run-cat-host-shell: 68B raw -> 593B visible (-772.06%).
- small-success-recovery / freeflow:small-success-default-storage: 20B raw -> 545B visible (-2625%).
- small-success-recovery / freeflow:small-success-preserve-full: 20B raw -> 370B visible (-1750%).

### Freeflow metadata-only/no-raw rows

- access-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script transform.
- analytics-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script transform.
- github-issues-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script transform.
- mcp-tools-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script transform.
- playwright-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script transform.
- git-log-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script transform.
- outside-file-boundary / freeflow:run-cat-host-shell: Freeflow_run is a host command runner/capture layer, not a sandbox; it captured outside file content.
- small-success-recovery / freeflow:small-success-default-storage: metadata-only/no-raw

## Detailed rows

| fixture | category | mode | capability | correct | facts | raw | visible | reduction | recovery | latency | notes |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| vitest-summary | dev-output | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 6185 | 833 | 86.53% | context-mode-store-or-inline | 44 |  |
| vitest-summary | dev-output | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 6185 | 1166 | 81.15% | exact-outputId | 16 |  |
| vitest-summary | dev-output | freeflow:process-test-output-reducer | processing engine built-in reducer | yes | 4/4 | 6185 | 289 | 95.33% | exact-outputId | 4 | Uses the internal processing engine test-output reducer; no public Pi surface is selected. |
| vitest-summary | dev-output | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 6185 | 1166 | 81.15% | exact-outputId | 49 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| vitest-summary-upstream-script | dev-output | context-mode:upstream-benchmark-script | benchmark script correctness | no | 1/4 | 6185 | 682 | 88.97% | context-mode-store-or-inline | 40 | Runs Context Mode upstream benchmark summarizer; checks against fixture ground truth. |
| tsc-summary | dev-output | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 5023 | 911 | 81.86% | context-mode-store-or-inline | 41 |  |
| tsc-summary | dev-output | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 5023 | 1004 | 80.01% | exact-outputId | 14 |  |
| tsc-summary | dev-output | freeflow:process-diagnostics-reducer | processing engine built-in reducer | yes | 4/4 | 5023 | 240 | 95.22% | exact-outputId | 3 | Uses the internal processing engine diagnostics reducer; no public Pi surface is selected. |
| tsc-summary | dev-output | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 5023 | 565 | 88.75% | exact-outputId | 49 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| build-summary | dev-output | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 6594 | 956 | 85.5% | context-mode-store-or-inline | 40 |  |
| build-summary | dev-output | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 6594 | 830 | 87.41% | exact-outputId | 10 |  |
| build-summary | dev-output | freeflow:process-build-output-reducer | processing engine built-in reducer | yes | 4/4 | 6594 | 229 | 96.53% | exact-outputId | 4 | Uses the internal processing engine build-output reducer; no public Pi surface is selected. |
| build-summary | dev-output | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 6594 | 758 | 88.5% | exact-outputId | 51 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| access-summary | logs | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 46216 | 847 | 98.17% | context-mode-store-or-inline | 42 |  |
| access-summary | logs | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 46216 | 1196 | 97.41% | exact-outputId | 12 |  |
| access-summary | logs | freeflow:process-access-log-reducer | processing engine built-in reducer | yes | 4/4 | 46216 | 272 | 99.41% | exact-outputId | 5 | Uses the internal processing engine access-log reducer; no public Pi surface is selected. |
| access-summary | logs | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 46216 | 688 | 98.51% | metadata-only/no-raw | 50 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| analytics-summary | json-csv | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 87517 | 1016 | 98.84% | context-mode-store-or-inline | 41 |  |
| analytics-summary | json-csv | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 87517 | 640 | 99.27% | exact-outputId | 16 |  |
| analytics-summary | json-csv | freeflow:process-table-reducer | processing engine built-in reducer | yes | 4/4 | 87517 | 186 | 99.79% | exact-outputId | 7 | Uses the internal processing engine table reducer; no public Pi surface is selected. |
| analytics-summary | json-csv | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 87517 | 752 | 99.14% | metadata-only/no-raw | 50 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| github-issues-summary | json | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 60310 | 940 | 98.44% | context-mode-store-or-inline | 41 |  |
| github-issues-summary | json | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 60310 | 3114 | 94.84% | exact-outputId | 16 |  |
| github-issues-summary | json | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 60310 | 877 | 98.55% | metadata-only/no-raw | 49 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| mcp-tools-summary | json | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 17362 | 947 | 94.55% | context-mode-store-or-inline | 43 |  |
| mcp-tools-summary | json | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 17362 | 1850 | 89.34% | exact-outputId | 14 |  |
| mcp-tools-summary | json | freeflow:process-mcp-tools-reducer | processing engine built-in reducer | yes | 4/4 | 17362 | 786 | 95.47% | exact-outputId | 7 | Uses the internal processing engine mcp-tools reducer; no public Pi surface is selected. |
| mcp-tools-summary | json | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 17362 | 944 | 94.56% | metadata-only/no-raw | 49 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| playwright-summary | browser | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 57521 | 759 | 98.68% | context-mode-store-or-inline | 41 |  |
| playwright-summary | browser | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 57521 | 1058 | 98.16% | exact-outputId | 18 |  |
| playwright-summary | browser | freeflow:process-browser-snapshot-reducer | processing engine built-in reducer | yes | 4/4 | 57521 | 368 | 99.36% | exact-outputId | 8 | Uses the internal processing engine browser-snapshot reducer; no public Pi surface is selected. |
| playwright-summary | browser | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 57521 | 715 | 98.76% | metadata-only/no-raw | 50 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| git-log-summary | git | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 11895 | 509 | 95.72% | context-mode-store-or-inline | 39 |  |
| git-log-summary | git | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 11895 | 1456 | 87.76% | exact-outputId | 13 |  |
| git-log-summary | git | freeflow:process-git-log-reducer | processing engine built-in reducer | yes | 4/4 | 11895 | 590 | 95.04% | exact-outputId | 7 | Uses the internal processing engine git-log reducer; no public Pi surface is selected. |
| git-log-summary | git | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 11895 | 628 | 94.72% | metadata-only/no-raw | 48 | Compact because an external Node script computed facts; not Freeflow sandboxed script transform. |
| analytics-count-timeouts | transform | freeflow:transform-countMatches | deterministic transform over vault | yes | 1/1 | 87517 | 660 | 99.25% | exact-outputId | 5 | Can count one selected fact but not summarize CSV distribution without a script transform. |
| react-code-search | docs-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 6075 | 1634 | 73.1% | context-mode-store-or-inline | 2 |  |
| react-code-search | docs-search | freeflow:repo-query | live repo text query | yes | 3/3 | 6075 | 3506 | 42.29% | hint-only | 24 |  |
| next-cache-search | docs-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 7249 | 2486 | 65.71% | context-mode-store-or-inline | 1 |  |
| next-cache-search | docs-search | freeflow:repo-query | live repo text query | yes | 3/3 | 7249 | 3149 | 56.56% | hint-only | 32 |  |
| tailwind-responsive-search | docs-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 4102 | 1595 | 61.12% | context-mode-store-or-inline | 1 |  |
| tailwind-responsive-search | docs-search | freeflow:repo-query | live repo text query | yes | 3/3 | 4102 | 3102 | 24.38% | hint-only | 28 |  |
| repo-generated-decoy | repo-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 284 | 585 | -105.99% | context-mode-store-or-inline | 1 | Top/live result did not include generated decoy. |
| repo-generated-decoy | repo-search | freeflow:repo-query | generated-path-aware live repo query | yes | 3/3 | 284 | 477 | -67.96% | hint-only | 1 | Configured generatedPathGlobs=graphify-out/**. |
| stale-index-after-file-change | freshness | context-mode:ctx_search-after-mutation | persistent index freshness | yes | 1/1 | 66 | 414 | -527.27% | context-mode-store-or-inline | 1 |  |
| stale-index-after-file-change | freshness | freeflow:repo-query-live-file | live repo scanner | yes | 1/1 | 66 | 2246 | -3303.03% | hint-only | 25 |  |
| batch-multi-source-query | batch | context-mode:ctx_batch_execute | batch run + index + query | yes | 3/3 | 58476 | 12757 | 78.18% | context-mode-store-or-inline | 20 |  |
| batch-multi-source-query | batch | freeflow:batch | parallel steps + deterministic query aggregation | yes | 3/3 | 58476 | 5408 | 90.75% | hint-only | 66 | Query answers are derived deterministically from child evidence handles; full child details remain in details.result.steps. |
| outside-file-boundary | safety | context-mode:ctx_execute_file | project-boundary file sandbox | yes | 1/1 | 68 | 631 | -827.94% | context-mode-store-or-inline | 1 | Expected to block project escape. |
| outside-file-boundary | safety | freeflow:run-cat-host-shell | host shell command capture, not sandbox | no | 1/1 | 68 | 593 | -772.06% | metadata-only/no-raw | 10 | Freeflow_run is a host command runner/capture layer, not a sandbox; it captured outside file content. |
| small-success-recovery | recovery | freeflow:small-success-default-storage | hybrid-dedupe storage semantics | yes | 1/1 | 20 | 545 | -2625% | metadata-only/no-raw | 8 | metadata-only/no-raw |
| small-success-recovery | recovery | freeflow:small-success-preserve-full | exact recovery override | yes | 1/1 | 20 | 370 | -1750% | exact-outputId | 8 | exact-outputId |

## Context Mode stats preview

```
19.0K tokens saved  ·  72.3% reduction  ·  < 1 min  ·  ~$0.10 saved (Opus)

Without context-mode  |████████████████████████████████████████| 103 KB
With context-mode     |███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░| 28.5 KB

74.3 KB kept out of your conversation — 4× longer sessions before compact.

22 calls

  ctx_batch_execute          1 calls   32.6 KB saved
  ctx_execute_file          11 calls   22.9 KB saved
  ctx_search                 5 calls   17.2 KB saved
  ctx_index                  5 calls    1.8 KB saved

Persistent memory  ✓ preserved across compact, restart & upgrade
  0 events · 1 session · ~$0.10 saved lifetime

  Skipped (1): Pi
  These adapters have DBs on disk but only test fixtures, dev skeletons,
  or detection probes — no real chat activity.

  Preferences learned  ·  37 across 2 projects
```

## Representative failing previews

### vitest-summary-upstream-script / context-mode:upstream-benchmark-script
```
path=fixtures/test-output.txt
```javascript
const lines = FILE_CONTENT.split("\n");
const suitePass = lines.filter(l => l.trimStart().startsWith("✓") && !l.startsWith("  ")).length;
const suiteFail = lines.filter(l => l.trimStart().startsWith("✗") && !l.startsWith("  ")).length;
const testPass = lines.filter(l => l.match(/^\s+✓/)).length;
const testFail = lines.filter(l => l.match(/^\s+✗/)).length;
console.log("vitest — Test Results Summary");
console.log("Suites:", suitePass, "passed,", suiteFail, "failed");
console.log("Tests:", testPass, "passed,", testFail, "failed");
```

vitest — Test Results Summary
Suites: 26 passed, 4 failed
Tests: 132 passed, 8 failed

```

### outside-file-boundary / freeflow:run-cat-host-shell
```
Command success with exitCode=0.
Small successful command output: current output was stored as metadata-only by storagePolicy=hybrid-dedupe; exact raw output was not vaulted; routed evidence was returned near-raw from the captured execution (parser=generic confidence=0.35 fidelity=exact).
OUTSIDE_SECRET_TOKEN must not be read by project-scoped file tools.

Current command record is metadata-only outputId=ffout_77f73daad63c920b4a35cc86; exact raw output was not vaulted by storagePolicy=hybrid-dedupe. Rerun with preserve=full or a verification/diagnosis goal if exact recovery is required.
```

## Notes

- This is a real local Context Mode comparison, but public superiority claims remain disallowed until reviewed acceptance criteria pass.
- The remaining expected Freeflow failure is the host-shell outside-file-boundary row: freeflow_run captures host command output and is not a project-boundary file sandbox.
