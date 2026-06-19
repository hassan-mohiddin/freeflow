# Output Router Command Benchmark Report - Iteration 1

Date: 2026-06-19

## Scope

Deterministic, CI-friendly command-output benchmark for `freeflow_run`. The runner compares native direct output against the improved Freeflow command router and records optional RTK/Squeez comparators as skipped unless a caller supplies configured comparator hooks.

Reduction percentages compare routed/context bytes and approximate tokens against raw command output bytes for each fixture. Correctness is gated on execution status, exit code, exact key fact preservation, and Freeflow raw vault recovery.

## Command

```sh
npm run bench:router:commands
```

The CLI writes machine-readable JSON under `plugins/freeflow/evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

## Summary

- Iterations per mode: 3
- Fixtures: 8
- Improved Freeflow run gated pass: 8/8
- Native baseline proxy pass: 8/8
- Improved exact fact preservation: 8/8
- Improved recovery pass: 8/8
- Improved weighted byte/token reduction: 85.03% / 85.02% (71893/17977 raw to 10760/2693 routed)
- Improved average byte/token reduction: -291.55% / -288.41%
- Improved median byte/token reduction: -451.81% / -444.90%
- Failed command facts preserved: yes

## Command Output Fixtures

| fixture | mode | correctness | checks | status/code | parser | raw bytes/tokens | routed bytes/tokens | byte/token reduction | latency p50/p95 ms | recovery | outputId | notes |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| noisy-success | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 2439/610 | 2439/610 | 0.00%/0.00% | 0.00/0.03 | not-applicable | - |  |
| noisy-success | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | generic 0.35 exact | 2439/610 | 1095/274 | 55.10%/55.08% | 1.54/4.94 | passed | ffout_f58ada0390543f194f800cf9 | Large successful command output (2439 bytes, 81 lines) was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_f58ada0390543f194f800cf9. |
| failed-stack-trace | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | - | 120/30 | 120/30 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| failed-stack-trace | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | generic 0.35 exact | 120/30 | 956/239 | -696.67%/-696.67% | 1.19/1.51 | passed | ffout_690cda214d51610ab682f067 | Command failed or did not complete (executionStatus=failed exitCode=1); selected failure evidence was returned and raw output was vaulted before routing (parser=generic confidence=0.35 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_690cda214d51610ab682f067. |
| test-summary | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | - | 127/32 | 127/32 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| test-summary | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | test-runner 0.92 exact | 127/32 | 1110/278 | -774.02%/-768.75% | 1.26/2.13 | passed | ffout_57a7f06e42e3a7678f14e467 | Command failed or did not complete (executionStatus=failed exitCode=1); selected failure evidence was returned and raw output was vaulted before routing (parser=test-runner confidence=0.92 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_57a7f06e42e3a7678f14e467. |
| diagnostics | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/2 | - | 169/43 | 169/43 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| diagnostics | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/2 | typescript-lint 0.88 exact | 169/43 | 1366/342 | -708.28%/-695.35% | 1.05/1.11 | passed | ffout_bc696ec17836960c4815a90d | Command failed or did not complete (executionStatus=failed exitCode=2); selected failure evidence was returned and raw output was vaulted before routing (parser=typescript-lint confidence=0.88 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_bc696ec17836960c4815a90d. |
| git-output | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 193/49 | 193/49 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| git-output | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | git-status-diffstat 0.76 exact | 193/49 | 1065/267 | -451.81%/-444.90% | 1.01/1.29 | passed | ffout_41c7df257bf6d964c374e50c | Large successful command output (193 bytes, 4 lines) was vaulted; bounded important lines were returned instead of full output (parser=git-status-diffstat confidence=0.76 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_41c7df257bf6d964c374e50c. |
| repetitive-log | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 4365/1092 | 4365/1092 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| repetitive-log | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | generic 0.35 exact | 4365/1092 | 1144/286 | 73.79%/73.81% | 1.09/1.17 | passed | ffout_3998cecd9cb7f2423f05e6b0 | Large successful command output (4365 bytes, 121 lines) was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_3998cecd9cb7f2423f05e6b0. |
| huge-json-table | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 60090/15023 | 60090/15023 | 0.00%/0.00% | 0.00/0.01 | not-applicable | - |  |
| huge-json-table | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | generic 0.35 lossy | 60090/15023 | 2897/725 | 95.18%/95.17% | 1.65/1.75 | passed | ffout_79c8cb23f8c783b65a123ed6 | Large successful command output (60090 bytes, 1 lines) was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=lossy).; recovery=passed: Verified exact combined output recovery for ffout_79c8cb23f8c783b65a123ed6. |
| repeated-command-output | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 4390/1098 | 4390/1098 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - | Exact duplicate detection returns a compact note while current and prior raw outputs remain recoverable. |
| repeated-command-output | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | duplicate-output 1.00 exact | 4390/1098 | 1127/282 | 74.33%/74.32% | 2.12/2.16 | passed | ffout_4a4cf16f55d08abfec0daacb | Exact duplicate command output matched previous outputId=ffout_3eff79cf38aea13a6de43a07 by exact output hash and command/cwd/status fingerprint (executionStatus=success exitCode=0); returning a compact duplicate note instead of re-injecting repeated output. Current raw output was vaulted as outputId=ffout_4a4cf16f55d08abfec0daacb.; Exact duplicate detection returns a compact note while current and prior raw outputs remain recoverable.; repeatedRuns=2; outputIds=ffout_667b6cfb5f27181b2acdfbd9,ffout_4a4cf16f55d08abfec0daacb; recovery=passed: Verified exact combined output recovery for ffout_4a4cf16f55d08abfec0daacb. |

## Skipped Optional Command Compressors

- RTK: Optional command compressor comparator is skipped unless a caller supplies a configured comparator hook.
- Squeez: Optional session/output compressor comparator is skipped unless a caller supplies a configured comparator hook.

## Regression Status

Improved Freeflow command routing passed all gated command-output benchmark fixtures.

Failed command facts preserved: yes.
