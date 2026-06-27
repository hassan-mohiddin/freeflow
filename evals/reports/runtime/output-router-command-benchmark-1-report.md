# Output Router Command Benchmark Report - Iteration 1

Date: 2026-06-19

## Scope

Deterministic, CI-friendly command-output benchmark for `freeflow_run`. The runner compares native direct output against the improved Freeflow command router and records optional RTK/Squeez comparators as skipped unless a caller supplies configured comparator hooks.

Reduction percentages compare routed/context bytes and approximate tokens against raw command output bytes for each fixture. Correctness is gated on execution status, exit code, exact key fact preservation, and Freeflow raw vault recovery.

## Command

```sh
npm run bench:router:commands
```

The CLI writes machine-readable JSON under `evals/runs/output-router/` by default. That JSON is generated run data; this Markdown file is the durable runtime report.

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
| noisy-success | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | generic 0.35 exact | 2439/610 | 1095/274 | 55.10%/55.08% | 1.60/5.45 | passed | ffout_e3bdc8fdb3c6bda34cfdb163 | Large successful command output (2439 bytes, 81 lines) was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_e3bdc8fdb3c6bda34cfdb163. |
| failed-stack-trace | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | - | 120/30 | 120/30 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| failed-stack-trace | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | generic 0.35 exact | 120/30 | 956/239 | -696.67%/-696.67% | 1.29/1.69 | passed | ffout_7070abadf7eb9e9d6671c150 | Command failed or did not complete (executionStatus=failed exitCode=1); selected failure evidence was returned and raw output was vaulted before routing (parser=generic confidence=0.35 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_7070abadf7eb9e9d6671c150. |
| test-summary | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | - | 127/32 | 127/32 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| test-summary | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/1 | test-runner 0.92 exact | 127/32 | 1110/278 | -774.02%/-768.75% | 1.27/1.91 | passed | ffout_78debcd7489ddf0ac2d17210 | Command failed or did not complete (executionStatus=failed exitCode=1); selected failure evidence was returned and raw output was vaulted before routing (parser=test-runner confidence=0.92 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_78debcd7489ddf0ac2d17210. |
| diagnostics | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/2 | - | 169/43 | 169/43 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| diagnostics | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | failed/2 | typescript-lint 0.88 exact | 169/43 | 1366/342 | -708.28%/-695.35% | 1.12/1.13 | passed | ffout_694685d2e031abd0deca0b5c | Command failed or did not complete (executionStatus=failed exitCode=2); selected failure evidence was returned and raw output was vaulted before routing (parser=typescript-lint confidence=0.88 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_694685d2e031abd0deca0b5c. |
| git-output | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 193/49 | 193/49 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| git-output | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | git-status-diffstat 0.76 exact | 193/49 | 1065/267 | -451.81%/-444.90% | 1.04/1.34 | passed | ffout_b3241210e6a212f818865c01 | Large successful command output (193 bytes, 4 lines) was vaulted; bounded important lines were returned instead of full output (parser=git-status-diffstat confidence=0.76 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_b3241210e6a212f818865c01. |
| repetitive-log | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 4365/1092 | 4365/1092 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - |  |
| repetitive-log | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | generic 0.35 exact | 4365/1092 | 1144/286 | 73.79%/73.81% | 1.23/1.24 | passed | ffout_a68393c538a09a60bb271f44 | Large successful command output (4365 bytes, 121 lines) was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=exact).; recovery=passed: Verified exact combined output recovery for ffout_a68393c538a09a60bb271f44. |
| huge-json-table | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 60090/15023 | 60090/15023 | 0.00%/0.00% | 0.00/0.01 | not-applicable | - |  |
| huge-json-table | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | generic 0.35 lossy | 60090/15023 | 2897/725 | 95.18%/95.17% | 1.62/1.80 | passed | ffout_264e9a7aceed6ad38635bc21 | Large successful command output (60090 bytes, 1 lines) was vaulted; bounded important lines were returned instead of full output (parser=generic confidence=0.35 fidelity=lossy).; recovery=passed: Verified exact combined output recovery for ffout_264e9a7aceed6ad38635bc21. |
| repeated-command-output | native-baseline-proxy | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | - | 4390/1098 | 4390/1098 | 0.00%/0.00% | 0.00/0.00 | not-applicable | - | Exact duplicate detection returns a compact note while current and prior raw outputs remain recoverable. |
| repeated-command-output | improved-freeflow-run | pass | status ✓ exit ✓ facts ✓ failed-exact ✓ | success/0 | duplicate-output 1.00 exact | 4390/1098 | 1127/282 | 74.33%/74.32% | 2.21/2.31 | passed | ffout_3142c5e358f7098c9be2225c | Exact duplicate command output matched previous outputId=ffout_857f56abd6351518d5393719 by exact output hash and command/cwd/status fingerprint (executionStatus=success exitCode=0); returning a compact duplicate note instead of re-injecting repeated output. Current raw output was vaulted as outputId=ffout_3142c5e358f7098c9be2225c.; Exact duplicate detection returns a compact note while current and prior raw outputs remain recoverable.; repeatedRuns=2; outputIds=ffout_ddd734b516d927ca72811bb3,ffout_3142c5e358f7098c9be2225c; recovery=passed: Verified exact combined output recovery for ffout_3142c5e358f7098c9be2225c. |

## Skipped Optional Command Compressors

- RTK: Optional command compressor comparator is skipped unless a caller supplies a configured comparator hook.
- Squeez: Optional session/output compressor comparator is skipped unless a caller supplies a configured comparator hook.

## Regression Status

Improved Freeflow command routing passed all gated command-output benchmark fixtures.

Failed command facts preserved: yes.
