# Pi Observed Routing Eval - Iteration 1

Date: 2026-06-24

## Scope

Targeted deterministic eval for the Pi-only observed output routing slice. It exercises Pi's `tool_result` path for configured MCP, web, fetch, and code-search producers after direct host execution.

This eval compares raw direct tool-output fixtures against the routed result returned to the agent. It verifies bounded output, exact critical fact preservation, persistence/recovery claims, metadata-only no-raw-recovery behavior, mutating MCP routing as metadata (not a gate), and Pi status capability reporting.

It does not claim Context Mode or cross-host superiority. Claude and Codex observed-routing adapters remain out of scope.

## Command

```sh
npm run build && node evals/scripts/run-pi-observed-routing-eval.js
```

## Summary

- Fixtures: 7
- Objective gates passed: 28/28
- Host: Pi only.
- Direct execution/permissions: owned by Pi; Freeflow routes only completed tool output.
- Persistence modes covered: exact and metadata-only.
- Overall byte reduction, excluding status-only fixtures: 82.2%.

## Results

Raw and routed columns are `bytes / lines / items-or-evidence-packets`. Reduction is calculated from raw bytes to routed-result bytes.

| fixture | producer | raw direct output | routed output | byte reduction | recoverability | status | gates |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| mcp-github-search-exact | mcp:github:search_issues | 8589 / 36 / 4 | 1201 / 40 / 1 | 86.0% | exact | pass | routedByPiHook ✓; boundedOutput ✓; criticalFactsPreserved ✓; recoverabilityAccurate ✓ |
| mcp-github-create-mutating | mcp:github:create_issue | 2492 / 8 / 1 | 889 / 29 / 1 | 64.3% | exact | pass | routedByPiHook ✓; boundedOutput ✓; criticalFactsPreserved ✓; recoverabilityAccurate ✓ |
| mcp-gmail-search-metadata-only | mcp:gmail:search | 12097 / 4 / 1 | 832 / 13 / 1 | 93.1% | metadata_only | pass | routedByPiHook ✓; boundedOutput ✓; criticalFactsPreserved ✓; recoverabilityAccurate ✓ |
| pi-web-search-exact | web:web_search | 1752 / 29 / 4 | 1184 / 34 / 1 | 32.4% | exact | pass | routedByPiHook ✓; boundedOutput ✓; criticalFactsPreserved ✓; recoverabilityAccurate ✓ |
| pi-fetch-content-exact | fetch:fetch_content | 2631 / 6 / 1 | 853 / 25 / 1 | 67.6% | exact | pass | routedByPiHook ✓; boundedOutput ✓; criticalFactsPreserved ✓; recoverabilityAccurate ✓ |
| pi-code-search-exact | code_search:code_search | 8712 / 26 / 3 | 1490 / 36 / 1 | 82.9% | exact | pass | routedByPiHook ✓; boundedOutput ✓; criticalFactsPreserved ✓; recoverabilityAccurate ✓ |
| pi-capability-status | status | 0 / 0 / 0 | 4970 / 190 / 0 | n/a | n/a | pass | hostCapabilityReported ✓; persistenceModesReported ✓; unsupportedRedactedReported ✓; configuredProducerReported ✓ |

## Result

All targeted Pi observed-routing gates passed for these deterministic fixtures. Pi observed routing materially reduced large/noisy fixture output while preserving critical facts and truthful recovery behavior.
