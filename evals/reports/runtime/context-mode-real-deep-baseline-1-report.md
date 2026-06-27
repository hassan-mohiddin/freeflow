# Deep Freeflow vs real Context Mode benchmark

Generated: 2026-06-27T06:41:33.484Z
Implementation: context-mode-real-deep-benchmark-v1
Context Mode status: available
Context Mode: v1.0.167 a338a0d26d674b889d9ab231e04302686566ddb9
Freeflow: bbaabedfb40d88ba4528f077fcf34ffd44aa9ca9
Artifacts root: /var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-context-mode-deep-JjgNMZ
Public superiority claims allowed: no

## Methodology

- Context Mode is run as the real MCP stdio server from server.bundle.mjs through @modelcontextprotocol/sdk when available.
- Freeflow is run through committed router modules against the same local fixture project and an adapter host shell runner.
- freeflow:run-cat-default measures current Freeflow-owned command capture/routing without bespoke transforms.
- freeflow:run-computed-script measures what Freeflow can do when the agent writes external summarizer code; it is compact but not a Freeflow-owned sandboxed transform.
- Correctness checks use fixture ground-truth facts, not only byte reduction.
- No public superiority claim should be made from this local benchmark alone.

## Baseline checks

Expected current Freeflow failures detected: yes
- Slice 0 expects current Freeflow failure classes to be present so later reducer/search/batch work has a durable baseline.
- A missing expected failure means the benchmark changed, behavior improved, or fixture facts need review before using this baseline.

## Summary by mode

| mode | scenarios | correct | facts | raw bytes | visible bytes | reduction | avg latency | exact recovery | metadata-only |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| context-mode:ctx_execute_file | 10 | 10/10 | 37/37 | 298691 | 8177 | 97.26% | 36.7ms | 0 | 0 |
| freeflow:run-cat-default | 9 | 3/9 | 25/36 | 298623 | 158978 | 46.76% | 9.1ms | 5 | 4 |
| freeflow:run-computed-script | 9 | 9/9 | 36/36 | 298623 | 6719 | 97.75% | 47.3ms | 3 | 6 |
| context-mode:upstream-benchmark-script | 1 | 0/1 | 1/4 | 6185 | 682 | 88.97% | 39ms | 0 | 0 |
| freeflow:derive-countMatches | 1 | 1/1 | 1/1 | 87517 | 645 | 99.26% | 3ms | 1 | 0 |
| context-mode:ctx_index+ctx_search | 4 | 4/4 | 12/12 | 17119 | 7030 | 58.93% | 1.3ms | 0 | 0 |
| freeflow:repo-query | 4 | 1/4 | 8/12 | 17119 | 7570 | 55.78% | 20.8ms | 0 | 0 |
| context-mode:ctx_search-after-mutation | 1 | 1/1 | 1/1 | 66 | 414 | -527.27% | 1ms | 0 | 0 |
| freeflow:repo-query-live-file | 1 | 1/1 | 1/1 | 66 | 2248 | -3306.06% | 25ms | 0 | 0 |
| context-mode:ctx_batch_execute | 1 | 1/1 | 3/3 | 58476 | 12843 | 78.04% | 20ms | 0 | 0 |
| freeflow:batch | 1 | 0/1 | 2/3 | 58476 | 2764 | 95.27% | 55ms | 0 | 0 |
| freeflow:run-cat-host-shell | 1 | 0/1 | 1/1 | 68 | 593 | -772.06% | 8ms | 0 | 1 |
| freeflow:small-success-default-storage | 1 | 1/1 | 1/1 | 20 | 545 | -2625% | 7ms | 0 | 1 |
| freeflow:small-success-preserve-full | 1 | 1/1 | 1/1 | 20 | 372 | -1760% | 6ms | 1 | 0 |

## Failure clusters

### Freeflow incorrect rows

- tsc-summary / freeflow:run-cat-default: facts 3/4, visible 5395B.
- access-summary / freeflow:run-cat-default: facts 2/4, visible 46741B.
- analytics-summary / freeflow:run-cat-default: facts 0/4, visible 1666B.
- mcp-tools-summary / freeflow:run-cat-default: facts 3/4, visible 17887B.
- playwright-summary / freeflow:run-cat-default: facts 2/4, visible 601B.
- git-log-summary / freeflow:run-cat-default: facts 3/4, visible 12420B.
- react-code-search / freeflow:repo-query: facts 2/3, visible 3041B.
- next-cache-search / freeflow:repo-query: facts 2/3, visible 2755B.
- tailwind-responsive-search / freeflow:repo-query: facts 1/3, visible 1295B.
- batch-multi-source-query / freeflow:batch: facts 2/3, visible 2764B. Child details exist, but visible batch summary does not aggregate query answers reliably.
- outside-file-boundary / freeflow:run-cat-host-shell: facts 1/1, visible 593B. Freeflow_run is a host command runner/capture layer, not a sandbox; it captured outside file content.

### Context Mode incorrect rows

- vitest-summary-upstream-script / context-mode:upstream-benchmark-script: facts 1/4, visible 682B. Runs Context Mode upstream benchmark summarizer; checks against fixture ground truth.

### Freeflow verbose rows (<50% reduction)

- vitest-summary / freeflow:run-cat-default: 6185B raw -> 6512B visible (-5.29%).
- tsc-summary / freeflow:run-cat-default: 5023B raw -> 5395B visible (-7.41%).
- build-summary / freeflow:run-cat-default: 6594B raw -> 6921B visible (-4.96%).
- access-summary / freeflow:run-cat-default: 46216B raw -> 46741B visible (-1.14%).
- github-issues-summary / freeflow:run-cat-default: 60310B raw -> 60835B visible (-0.87%).
- mcp-tools-summary / freeflow:run-cat-default: 17362B raw -> 17887B visible (-3.02%).
- git-log-summary / freeflow:run-cat-default: 11895B raw -> 12420B visible (-4.41%).
- react-code-search / freeflow:repo-query: 6075B raw -> 3041B visible (49.94%).
- repo-generated-decoy / freeflow:repo-query: 284B raw -> 479B visible (-68.66%).
- stale-index-after-file-change / freeflow:repo-query-live-file: 66B raw -> 2248B visible (-3306.06%).
- outside-file-boundary / freeflow:run-cat-host-shell: 68B raw -> 593B visible (-772.06%).
- small-success-recovery / freeflow:small-success-default-storage: 20B raw -> 545B visible (-2625%).
- small-success-recovery / freeflow:small-success-preserve-full: 20B raw -> 372B visible (-1760%).

### Freeflow metadata-only/no-raw rows

- access-summary / freeflow:run-cat-default:
- access-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script derive.
- analytics-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script derive.
- github-issues-summary / freeflow:run-cat-default:
- github-issues-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script derive.
- mcp-tools-summary / freeflow:run-cat-default:
- mcp-tools-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script derive.
- playwright-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script derive.
- git-log-summary / freeflow:run-cat-default:
- git-log-summary / freeflow:run-computed-script: Compact because an external Node script computed facts; not Freeflow sandboxed script derive.
- outside-file-boundary / freeflow:run-cat-host-shell: Freeflow_run is a host command runner/capture layer, not a sandbox; it captured outside file content.
- small-success-recovery / freeflow:small-success-default-storage: metadata-only/no-raw

## Detailed rows

| fixture | category | mode | capability | correct | facts | raw | visible | reduction | recovery | latency | notes |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| vitest-summary | dev-output | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 6185 | 833 | 86.53% | context-mode-store-or-inline | 43 |  |
| vitest-summary | dev-output | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 6185 | 6512 | -5.29% | exact-outputId | 11 |  |
| vitest-summary | dev-output | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 6185 | 766 | 87.62% | exact-outputId | 47 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| vitest-summary-upstream-script | dev-output | context-mode:upstream-benchmark-script | benchmark script correctness | no | 1/4 | 6185 | 682 | 88.97% | context-mode-store-or-inline | 39 | Runs Context Mode upstream benchmark summarizer; checks against fixture ground truth. |
| tsc-summary | dev-output | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 5023 | 911 | 81.86% | context-mode-store-or-inline | 42 |  |
| tsc-summary | dev-output | freeflow:run-cat-default | command capture/routing | no | 3/4 | 5023 | 5395 | -7.41% | exact-outputId | 8 |  |
| tsc-summary | dev-output | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 5023 | 567 | 88.71% | exact-outputId | 47 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| build-summary | dev-output | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 6594 | 956 | 85.5% | context-mode-store-or-inline | 41 |  |
| build-summary | dev-output | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 6594 | 6921 | -4.96% | exact-outputId | 8 |  |
| build-summary | dev-output | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 6594 | 782 | 88.14% | exact-outputId | 48 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| access-summary | logs | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 46216 | 847 | 98.17% | context-mode-store-or-inline | 40 |  |
| access-summary | logs | freeflow:run-cat-default | command capture/routing | no | 2/4 | 46216 | 46741 | -1.14% | metadata-only/no-raw | 8 |  |
| access-summary | logs | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 46216 | 688 | 98.51% | metadata-only/no-raw | 47 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| analytics-summary | json-csv | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 87517 | 930 | 98.94% | context-mode-store-or-inline | 40 |  |
| analytics-summary | json-csv | freeflow:run-cat-default | command capture/routing | no | 0/4 | 87517 | 1666 | 98.1% | exact-outputId | 10 |  |
| analytics-summary | json-csv | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 87517 | 752 | 99.14% | metadata-only/no-raw | 47 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| github-issues-summary | json | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 60310 | 854 | 98.58% | context-mode-store-or-inline | 39 |  |
| github-issues-summary | json | freeflow:run-cat-default | command capture/routing | yes | 4/4 | 60310 | 60835 | -0.87% | metadata-only/no-raw | 9 |  |
| github-issues-summary | json | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 60310 | 877 | 98.55% | metadata-only/no-raw | 48 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| mcp-tools-summary | json | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 17362 | 861 | 95.04% | context-mode-store-or-inline | 41 |  |
| mcp-tools-summary | json | freeflow:run-cat-default | command capture/routing | no | 3/4 | 17362 | 17887 | -3.02% | metadata-only/no-raw | 8 |  |
| mcp-tools-summary | json | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 17362 | 944 | 94.56% | metadata-only/no-raw | 47 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| playwright-summary | browser | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 57521 | 759 | 98.68% | context-mode-store-or-inline | 40 |  |
| playwright-summary | browser | freeflow:run-cat-default | command capture/routing | no | 2/4 | 57521 | 601 | 98.96% | exact-outputId | 12 |  |
| playwright-summary | browser | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 57521 | 715 | 98.76% | metadata-only/no-raw | 48 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| git-log-summary | git | context-mode:ctx_execute_file | sandboxed file transform | yes | 4/4 | 11895 | 509 | 95.72% | context-mode-store-or-inline | 40 |  |
| git-log-summary | git | freeflow:run-cat-default | command capture/routing | no | 3/4 | 11895 | 12420 | -4.41% | metadata-only/no-raw | 8 |  |
| git-log-summary | git | freeflow:run-computed-script | host-shell transform via freeflow_run | yes | 4/4 | 11895 | 628 | 94.72% | metadata-only/no-raw | 47 | Compact because an external Node script computed facts; not Freeflow sandboxed script derive. |
| analytics-count-timeouts | derive | freeflow:derive-countMatches | deterministic derive over vault | yes | 1/1 | 87517 | 645 | 99.26% | exact-outputId | 3 | Can count one selected fact but not summarize CSV distribution without a script transform. |
| react-code-search | docs-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 6075 | 1634 | 73.1% | context-mode-store-or-inline | 2 |  |
| react-code-search | docs-search | freeflow:repo-query | live repo text query | no | 2/3 | 6075 | 3041 | 49.94% | hint-only | 25 |  |
| next-cache-search | docs-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 6658 | 3216 | 51.7% | context-mode-store-or-inline | 1 |  |
| next-cache-search | docs-search | freeflow:repo-query | live repo text query | no | 2/3 | 6658 | 2755 | 58.62% | hint-only | 31 |  |
| tailwind-responsive-search | docs-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 4102 | 1595 | 61.12% | context-mode-store-or-inline | 1 |  |
| tailwind-responsive-search | docs-search | freeflow:repo-query | live repo text query | no | 1/3 | 4102 | 1295 | 68.43% | hint-only | 26 |  |
| repo-generated-decoy | repo-search | context-mode:ctx_index+ctx_search | FTS index/search | yes | 3/3 | 284 | 585 | -105.99% | context-mode-store-or-inline | 1 | Top/live result did not include generated decoy. |
| repo-generated-decoy | repo-search | freeflow:repo-query | generated-path-aware live repo query | yes | 3/3 | 284 | 479 | -68.66% | hint-only | 1 | Configured generatedPathGlobs=graphify-out/**. |
| stale-index-after-file-change | freshness | context-mode:ctx_search-after-mutation | persistent index freshness | yes | 1/1 | 66 | 414 | -527.27% | context-mode-store-or-inline | 1 |  |
| stale-index-after-file-change | freshness | freeflow:repo-query-live-file | live repo scanner | yes | 1/1 | 66 | 2248 | -3306.06% | hint-only | 25 |  |
| batch-multi-source-query | batch | context-mode:ctx_batch_execute | batch run + index + query | yes | 3/3 | 58476 | 12843 | 78.04% | context-mode-store-or-inline | 20 |  |
| batch-multi-source-query | batch | freeflow:batch | parallel steps; no query aggregation | no | 2/3 | 58476 | 2764 | 95.27% | hint-only | 55 | Child details exist, but visible batch summary does not aggregate query answers reliably. |
| outside-file-boundary | safety | context-mode:ctx_execute_file | project-boundary file sandbox | yes | 1/1 | 68 | 717 | -954.41% | context-mode-store-or-inline | 1 | Expected to block project escape. |
| outside-file-boundary | safety | freeflow:run-cat-host-shell | host shell command capture, not sandbox | no | 1/1 | 68 | 593 | -772.06% | metadata-only/no-raw | 8 | Freeflow_run is a host command runner/capture layer, not a sandbox; it captured outside file content. |
| small-success-recovery | recovery | freeflow:small-success-default-storage | hybrid-dedupe storage semantics | yes | 1/1 | 20 | 545 | -2625% | metadata-only/no-raw | 7 | metadata-only/no-raw |
| small-success-recovery | recovery | freeflow:small-success-preserve-full | exact recovery override | yes | 1/1 | 20 | 372 | -1760% | exact-outputId | 6 | exact-outputId |

## Context Mode stats preview

```
⚠️ context-mode v1.0.167 outdated → v1.0.168 available. Upgrade: npm run build

18.9K tokens saved  ·  71.7% reduction  ·  < 1 min  ·  ~$0.09 saved (Opus)

Without context-mode  |████████████████████████████████████████| 103 KB
With context-mode     |███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░| 29.2 KB

73.7 KB kept out of your conversation — 4× longer sessions before compact.

22 calls

  ctx_batch_execute          1 calls   31.6 KB saved
  ctx_execute_file          11 calls   22.0 KB saved
  ctx_search                 5 calls   18.5 KB saved
  ctx_index                  5 calls    1.8 KB saved

Persistent memory  ✓ preserved across compact, restart & upgrade
  0 events · 1 session · ~$0.09 saved lifetime

  Skipped (1): Pi
  These adapters have DBs on disk but only test fixtures, dev skeletons,
  or detection probes — no real chat activity.
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

### tsc-summary / freeflow:run-cat-default
```
Detected 50 error(s) and 0 warning(s) in TypeScript/lint diagnostics.
Small successful command output: raw output was vaulted; routed evidence was returned near-raw from the captured execution (parser=typescript-lint confidence=0.88 fidelity=exact).
src/components/UserList.tsx(23,15): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/components/UserList.tsx(45,8): error TS2339: Property 'fullName' does not exist on type 'User'.
src/components/UserList.tsx(67,22): error TS2532: Object is possibly 'undefined'.
src/components/UserList.tsx(89,3): error TS2741: Property 'email' is missing in type '{ name: string; }' but required in type 'User'.
src/components/UserList.tsx(102,18): error TS2769: No overload matches this call.
src/components/UserList.tsx(118,11): error TS7006: Parameter 'user' implicitly has an 'any' type.
src/components/UserList.tsx(134,27): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/components/Dashboard.tsx(15,5): error TS2322: Type 'null' is not assignable to type 'ReactElement'.
src/components/Dashboard.tsx(34,19): error TS2339: Property 'metrics' does not exist on type 'DashboardData'.
src/components/Dashboard.tsx(51,8): error TS2554: Expected 2 arguments, but got 1.
src/components/Dashboard.tsx(72,14): error TS2532: Object is possibly 'undefined'.
src/components/Dashboard.tsx(88,22): error TS2345: Argument of type '{ startDate: string; }' is not assignable to parameter of type 'DateRange'.
src/components/Dashboard.tsx(103,9): error TS18046: 'data' is of type 'unknown'.
src/components/Dashboard.tsx(119,31): error TS2769: No overload matches this call.
src/api/trpc/routers/user.ts(12,5): error TS2322: Type 'null' is not assignable to type 'string'.
src/api/trpc/routers/user.ts(28,17): error TS2345: Argument of type 'string' is not assignable to parameter of type 'UserRole'.
```

### access-summary / freeflow:run-cat-default
```
Command success with exitCode=0.
Small successful command output: current output was stored as metadata-only by storagePolicy=hybrid-dedupe; exact raw output was not vaulted; routed evidence was returned near-raw from the captured execution (parser=generic confidence=0.35 fidelity=exact).
192.168.1.100 - - [23/Feb/2026:10:00:01 +0000] "GET /api/users HTTP/1.1" 200 892 209ms
10.0.0.55 - - [23/Feb/2026:10:00:03 +0000] "GET /api/users/42 HTTP/1.1" 200 1234 138ms
172.16.0.23 - - [23/Feb/2026:10:00:05 +0000] "GET /api/users/999 HTTP/1.1" 404 56 1ms
192.168.1.45 - - [23/Feb/2026:10:00:07 +0000] "POST /api/auth/login HTTP/1.1" 200 3456 452ms
10.0.1.12 - - [23/Feb/2026:10:00:09 +0000] "POST /api/auth/login HTTP/1.1" 401 123 92ms
192.168.2.78 - - [23/Feb/2026:10:00:11 +0000] "POST /api/auth/register HTTP/1.1" 201 1234 533ms
10.0.0.99 - - [23/Feb/2026:10:00:13 +0000] "POST /api/auth/register HTTP/1.1" 400 234 51ms
172.16.1.34 - - [23/Feb/2026:10:00:15 +0000] "POST /api/auth/logout HTTP/1.1" 200 7890 69ms
192.168.1.200 - - [23/Feb/2026:10:00:17 +0000] "GET /api/projects HTTP/1.1" 200 8901 293ms
10.0.2.67 - - [23/Feb/2026:10:00:19 +0000] "GET /api/projects/7 HTTP/1.1" 200 456 177ms
192.168.3.15 - - [23/Feb/2026:10:00:21 +0000] "POST /api/projects HTTP/1.1" 201 2345 562ms
10.0.0.42 - - [23/Feb/2026:10:00:23 +0000] "PUT /api/projects/7 HTTP/1.1" 200 12045 347ms
172.16.2.89 - - [23/Feb/2026:10:00:25 +0000] "DELETE /api/projects/15 HTTP/1.1" 204 0 132ms
192.168.1.33 - - [23/Feb/2026:10:00:27 +0000] "GET /api/dashboard/stats HTTP/1.1" 200 892 805ms
10.0.1.56 - - [23/Feb/2026:10:00:29 +0000] "GET /api/dashboard/analytics HTTP/1.1" 200 1234 1257ms
192.168.4.101 - - [23/Feb/2026:10:00:31 +0000] "GET /api/dashboard/analytics HTTP/1.1" 500 234 25ms
```

### analytics-summary / freeflow:run-cat-default
```
Command succeeded with 502 output lines and 87517 bytes.
Large successful command output (87517 bytes, 502 lines): raw output was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=exact).
id,timestamp,user_id,action,resource,duration_ms,status,ip,user_agent
1,2026-02-23T08:00:00Z,user_1,view,document,33,success,10.0.1.100,Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
2,2026-02-23T08:03:07Z,user_2,create,project,266,success,10.0.1.101,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
3,2026-02-23T08:06:14Z,user_3,update,task,219,success,10.0.2.50,Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15
4,2026-02-23T08:09:21Z,user_4,delete,comment,102,success,10.0.2.51,Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0
5,2026-02-23T08:12:28Z,user_5,search,document,415,success,10.0.3.200,Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
6,2026-02-23T08:15:35Z,user_6,export,project,1178,success,10.0.3.201,Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
7,2026-02-23T08:18:42Z,user_7,view,task,111,success,10.0.4.10,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
Use freeflow_retrieve with source.kind=vault and outputId=ffout_4facf46a7e4080d1d775c9c9 to recover exact command output.
```

### mcp-tools-summary / freeflow:run-cat-default
```
Command success with exitCode=0.
Small successful command output: current output was stored as metadata-only by storagePolicy=hybrid-dedupe; exact raw output was not vaulted; routed evidence was returned near-raw from the captured execution (parser=generic confidence=0.35 fidelity=exact).
[
  {
    "name": "search_codebase",
    "description": "Search for code patterns across the codebase using ripgrep",
    "inputSchema": {
      "type": "object",
      "properties": {
        "pattern": { "type": "string", "description": "Regex pattern to search for" },
        "path": { "type": "string", "description": "Directory to search in" },
        "fileType": { "type": "string", "description": "File extension filter (e.g. ts, tsx, json)" }
      },
      "required": ["pattern"]
    }
  },
  {
    "name": "read_file",
```

### playwright-summary / freeflow:run-cat-default
```
Command succeeded with 1044 output lines and 57521 bytes.
Large successful command output (57521 bytes, 1044 lines): raw output was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=exact).
### Page
- Page URL: https://news.ycombinator.com/
- Page Title: Hacker News
### Snapshot
```yaml
- table [ref=e3]:
  - rowgroup [ref=e4]:
    - row "Hacker Newsnew | past | comments | ask | show | jobs | submit login" [ref=e5]:
Use freeflow_retrieve with source.kind=vault and outputId=ffout_8cbd255b6a532c074bc644a8 to recover exact command output.
```

### git-log-summary / freeflow:run-cat-default
```
Command success with exitCode=0.
Small successful command output: current output was stored as metadata-only by storagePolicy=hybrid-dedupe; exact raw output was not vaulted; routed evidence was returned near-raw from the captured execution (parser=generic confidence=0.35 fidelity=exact).
f8a3b1c 2026-02-23 Mert Koseoglu feat: add user role management with audit logging
d7e2a0b 2026-02-23 Mert Koseoglu refactor: improve UserList component with skeleton loading
c6d1f9a 2026-02-23 Mert Koseoglu feat: add email magic link authentication
b5c0e8f 2026-02-22 Alice Johnson fix: resolve null updatedAt in user role mutation
a4b9d7e 2026-02-22 Alice Johnson test: add comprehensive billing router tests
93a8c6d 2026-02-22 Mert Koseoglu feat: add middleware route protection
82f7b5c 2026-02-22 Bob Martinez refactor: extract database transaction helper
71e6a4b 2026-02-22 Bob Martinez chore: update prisma schema with user tracking fields
60d5f3a 2026-02-21 Mert Koseoglu feat: implement stripe webhook handling
5fc4e29 2026-02-21 Charlie Kim fix: handle race condition in concurrent user updates
4eb3d18 2026-02-21 Charlie Kim perf: add database connection pooling configuration
3da2c07 2026-02-21 Alice Johnson docs: update API documentation for user endpoints
2c91b06 2026-02-21 Diana Chen feat: add file upload with uploadthing integration
1b80a05 2026-02-20 Mert Koseoglu refactor: migrate to Next.js 15 app router patterns
0a7f904 2026-02-20 Bob Martinez fix: correct CORS middleware origin validation
f96e803 2026-02-20 Alice Johnson test: add rate limiting middleware tests
```

### react-code-search / freeflow:repo-query
```
Deterministic repo retrieval selected 3 candidate(s); top result fixtures/context7-react-docs.md:124-130 (BM25-style scored section chunk with 6/6 query-token coverage).
fixtures/context7-react-docs.md:124-130
### Fetch Data with Cleanup Function in React useEffect

Source: https://react.dev/learn/synchronizing-with-effects

Demonstrates a React useEffect hook that fetches data asynchronously while using a cleanup function to ignore stale responses when dependencies change. The `ignore` flag prevents state updates from outdated requests, ensuring that if the userId changes, previous responses are discarded even if they arrive later.

```javascript
docs/stale.md:1-4
# Cache Policy

OLD_CACHE_POLICY_TOKEN says cache for 5 seconds.

fixtures/github-issues.json:1-2
[{"author":{"id":"MDQ6VXNlcjI0NDAwODk=","is_bot":false,"login":"rickhanlonii","name":"Ricky"},"body":"Noticed this while writing docs:\n\n```js\n<ViewTransition\n  onEnter={(instance) => {\n    const anim = instance.new.animate(/* ... */);\n    return () => {\n      anim.cancel();\n    };\n  }}\n  onExit={(instance) => {\n    const anim = instance.new.animate(/* ... */);\n    return () => {\n      anim.cancel();\n    };\n  }}\n>\n  {/* ... */}    \n</ViewTransition>\n```\n\nIf you have a pending`onEnter` animation and the tree is unmounted, the `onEnter` cleanup is called immediately.\n\nBut if you have a pending `onExit` and the tree is unmounted, the `onExit` cleanup isn't called until the animation completes.\n\nThis means you can't cancel the animation:\n\nhttps://github.com/user-attachments/assets/f522f746-5ed3-432f-acbf-d610ab4260d2\n\nSandbox: https://codesandbox.io/p/sandbox/naughty-wu-pfkh2m\n\n\n","createdAt":"2026-02-21T16:18:35Z","labels":[{"id":"MDU6TGFiZWwxNTU5ODQxNjA=","name":"Status: Unconfirmed","description":"A potential issue that we haven't yet confirmed as a bug","color":"d4c5f9"}],"number":35855,"title":"Bug: ViewTransition onExit cleanup not called on unmount"},{"author":{"id":"MDQ6VXNlcjUyNjM0OQ==","is_bot":false,"login":"jugglingcats","name":""},"body":"### What kind of issue is this?\n\n- [x] React Compiler core (the JS output is incorrect, or your app works incorrectly after optimization)\n- [ ] babel-plugin-react-compiler (build issue installing or using the Babel plugin)\n- [ ] eslint-plugin-react-hooks (build issue installing or using the eslint plugin)\n- [ ] react-compiler-healthcheck (build issue installing or using the healthcheck script)\n\n### Link to repro\n\nhttps://playground.react.dev/#N4Igzg9grgTgxgUxALhASwLYAcIwC4AEASggIZx4A0BwBUYCJAZtfQgMp6l4IEC+BJjAgYCAchhkKYgDoA7eUyhyKaCHIIZSAawQB9GKTkATEQAoAlDXkFbBSXlgaAstwAWAOkMnzF+X3l5BAAPHHwCYwQmUigAG0IlFTw1FwBPAEEsLEtrDTsAenyCMEwsWN4wLh4CPAgCOBiGewQAWkkTBBgbOzh1SoIAbUruB … [truncated; expand or retrieve exact lines for recovery]

Use freeflow_retrieve action=expand with evidenceId=ev_fd86748f4eef18fe for more surrounding context, action=locate for candidate paths, or action=retrieve with path=fixtures/context7-react-docs.md for an explicit span.
```

### next-cache-search / freeflow:repo-query
```
Deterministic repo retrieval selected 3 candidate(s); top result docs/stale.md:1-4 (BM25-style scored section chunk with 1/9 query-token coverage).
docs/stale.md:1-4
# Cache Policy

OLD_CACHE_POLICY_TOKEN says cache for 5 seconds.

fixtures/context7-nextjs-docs.md:113-116
  const dynamicData = await fetch(`https://...`, { cache: 'no-store' })

  // This request should be cached with a lifetime of 10 seconds.
  // Similar to `getStaticProps` with the `revalidate` option.
fixtures/github-prs.json:1-2
[{"additions":59,"author":{"id":"U_kgDOD1JpZw","is_bot":false,"login":"youngsyre26","name":""},"body":"## Description\n\nAdds a new getting started guide for Next.js Middleware, covering:\n- Basic middleware setup\n- Overview of middleware capabilities\n- Links to existing documentation\n\n## Related\n\n- https://nextjs.org/docs/app/building-your-application/routing/middleware","changedFiles":1,"deletions":0,"labels":[{"id":"LA_kwDOBC3Cis7ZQfu6","name":"Documentation","description":"Related to Next.js' official documentation.","color":"C2E0C6"}],"number":90342,"title":"docs: add middleware overview guide"},{"additions":0,"author":{"id":"U_kgDODOWLjA","is_bot":false,"login":"poria-lang","name":"Poria"},"body":"1. **Async Request API Alignment**: Refactored `ClientPageRoot` and `ClientSegmentRoot` to receive and handle `params` and `searchParams` as Promises from the server. This aligns with Next.js 15+ patterns and reduces synchronous data handling in client-side root components.\r\n2. **Bug Fix in Rendering Logic**: Fixed `createErrorBoundaryClientSegmentRoot` in `create-component-tree.tsx` which was incorrectly passing a `params` prop instead of `serverProvidedParams` to `ClientSegmentRoot`.\r\n3. **DX Improvement for CSRF Errors**: Updated the generic \"Invalid Server Actions request\" error in `action-handler.ts` to include specific details about origin and host mismatches, aiding developers in debugging proxy configurations.\r\n4. **Codemod Enhancements**:\r\n    - `next-lint-to-eslint-cli`: Added support for `as const` assertions and `defineConfig` wrapper functions in flat ESLint configs.\r\n    - `metadata-to-viewport-export`: Improved the property key matching to support literal keys and relaxed the search for the `metadata` object to handle varied export styles by looking at variable declarations.","changedFiles":0,"deletions":0,"labels":[],"number":90322,"title":"Identify actionable bugs and technical debt in core packages"},{"additions":20,"a … [truncated; expand or retrieve exact lines for recovery]

Use freeflow_retrieve action=expand with evidenceId=ev_cb2c0eb913415c7c for more surrounding context, action=locate for candidate paths, or action=retrieve with path=docs/stale.md for an explicit span.
```

### tailwind-responsive-search / freeflow:repo-query
```
Deterministic repo retrieval selected 3 candidate(s); top result docs/stale.md:1-4 (BM25-style scored section chunk with 0/6 query-token coverage).
docs/stale.md:1-4
# Cache Policy

OLD_CACHE_POLICY_TOKEN says cache for 5 seconds.

fixtures/context7-nextjs-docs.md:12-12
  const res = await fetch('https://...')
fixtures/context7-react-docs.md:112-134
    const connection = createConnection(serverUrl, roomId);
    connection.connect();
    return () => {
      connection.disconnect();
    };
  }, [serverUrl, roomId]);
  // ...
}
```
```

### batch-multi-source-query / freeflow:batch
```
Batch completed 3/3 step(s) successfully in 55ms with concurrency=3.
Ran 3 independent Freeflow-owned step(s) with concurrency=3; child results are available in details.result.steps.
test-summary ok: Command success with exitCode=0.
Small successful command output: raw output was vaulted; routed evidence was returned near-raw from the captured execution (parser=generic confidence=0.35 fidelity=exact).
vitest summary
Test Files  4 failed | 26 passed (30)
Tests       4 failed | 108 passed (112)
failures:
✗ src/components/UserList.test.tsx (4 tests) 234ms
✗ handles empty state 156ms
✗ src/components/DataGrid.test.tsx (5 tests) 345ms
✗ filters with complex queries 198ms
✗ src/api/trpc/routers/user.test.ts (5 tests) 456ms
✗ updates user role 234ms
✗ src/lib/email.test.ts (4 tests) 567ms
✗ sends password reset email 312ms

Use freeflow_retrieve with source.kind=vault and outputId=ffout_8c0e55375a08e64191b70820 to recover exact command output.
```

### outside-file-boundary / freeflow:run-cat-host-shell
```
Command success with exitCode=0.
Small successful command output: current output was stored as metadata-only by storagePolicy=hybrid-dedupe; exact raw output was not vaulted; routed evidence was returned near-raw from the captured execution (parser=generic confidence=0.35 fidelity=exact).
OUTSIDE_SECRET_TOKEN must not be read by project-scoped file tools.

Current command record is metadata-only outputId=ffout_3e35651d2dc5653c9dc930d9; exact raw output was not vaulted by storagePolicy=hybrid-dedupe. Rerun with preserve=full or a verification/diagnosis goal if exact recovery is required.
```

## Notes

- This is a real local Context Mode comparison, but public superiority claims remain disallowed until reviewed acceptance criteria pass.
- Freeflow baseline failures are expected in Slice 0; this benchmark exists to keep those failures durable before behavior changes.
