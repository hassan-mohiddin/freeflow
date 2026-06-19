import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  renderCommandBenchmarkReport,
  runCommandBenchmarks,
  writeCommandBenchmarkReports,
} from "../dist/command-benchmarks.js";

test("command benchmark harness measures freeflow_run fixtures and recovery", async () => {
  const report = await runCommandBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });

  assert.equal(report.fixtures.length, 8);
  assert.equal(report.summary.improved.failed, 0);
  assert.equal(report.summary.improved.passed, report.fixtures.length);
  assert.equal(report.summary.improved.recoveryPassed, report.fixtures.length);
  assert.equal(report.summary.improved.exactFactsPreserved, report.fixtures.length);
  assert.ok(report.summary.improved.totalRawBytes > 0);
  assert.ok(report.summary.improved.totalRoutedBytes > 0);
  assert.ok(report.skippedExternalTools.some((tool) => tool.name === "RTK"));
  assert.ok(report.skippedExternalTools.some((tool) => tool.name === "Squeez"));

  for (const fixture of report.fixtures) {
    assert.deepEqual(
      fixture.results.map((result) => result.mode),
      ["native-baseline-proxy", "improved-freeflow-run"],
    );
    const improved = fixture.results.find((result) => result.mode === "improved-freeflow-run");
    assert.equal(improved.correctness.passed, true, `${fixture.id} improved correctness`);
    assert.equal(improved.correctness.exactFactsPreserved, true, `${fixture.id} exact facts preserved`);
    assert.equal(improved.recovery.status, "passed", `${fixture.id} recovery`);
    assert.ok(improved.outputId?.startsWith("ffout_"), `${fixture.id} outputId recorded`);
    assert.ok(improved.routedBytes > 0, `${fixture.id} routed bytes recorded`);
    assert.equal(Number.isFinite(improved.byteReductionPercent), true, `${fixture.id} byte reduction recorded`);
    assert.ok(improved.latencyMs.p50 >= 0, `${fixture.id} latency recorded`);
  }

  const failed = report.fixtures.find((fixture) => fixture.id === "failed-stack-trace");
  assert.ok(failed);
  const failedImproved = failed.results.find((result) => result.mode === "improved-freeflow-run");
  assert.equal(failedImproved.executionStatus, "failed");
  assert.equal(failedImproved.parser?.name, "generic");
  assert.match(failedImproved.routedExcerpt, /Error: ROUTER_BENCH_FAILED/);
  assert.match(failedImproved.routedExcerpt, /at main/);

  const testSummary = report.fixtures.find((fixture) => fixture.id === "test-summary");
  assert.ok(testSummary);
  const testImproved = testSummary.results.find((result) => result.mode === "improved-freeflow-run");
  assert.equal(testImproved.parser?.name, "test-runner");
  assert.equal(testImproved.parser?.counts?.testsFailed, 1);

  const rendered = renderCommandBenchmarkReport(report);
  assert.match(rendered, /Output Router Command Benchmark Report/);
  assert.match(rendered, /Failed command facts preserved: yes/);
  assert.match(rendered, /Skipped Optional Command Compressors/);
  assert.match(rendered, /RTK/);
  assert.match(rendered, /Squeez/);
});

test("command benchmark default iterations do not let duplicates mask parser evidence", async () => {
  const report = await runCommandBenchmarks({ generatedAt: "2026-06-16T00:00:00.000Z" });

  const failed = report.fixtures.find((fixture) => fixture.id === "failed-stack-trace");
  assert.ok(failed);
  const failedImproved = failed.results.find((result) => result.mode === "improved-freeflow-run");
  assert.equal(failedImproved.parser?.name, "generic");
  assert.match(failedImproved.routedExcerpt, /Error: ROUTER_BENCH_FAILED/);
  assert.match(failedImproved.routedExcerpt, /at main/);

  const testSummary = report.fixtures.find((fixture) => fixture.id === "test-summary");
  assert.ok(testSummary);
  const testImproved = testSummary.results.find((result) => result.mode === "improved-freeflow-run");
  assert.equal(testImproved.parser?.name, "test-runner");
  assert.equal(testImproved.correctness.exactFactsPreserved, true);

  const repeated = report.fixtures.find((fixture) => fixture.id === "repeated-command-output");
  assert.ok(repeated);
  const repeatedImproved = repeated.results.find((result) => result.mode === "improved-freeflow-run");
  assert.equal(repeatedImproved.parser?.name, "duplicate-output");
  assert.equal(repeatedImproved.recovery.status, "passed");
});

test("command benchmark writer emits markdown and machine-readable JSON", async () => {
  const report = await runCommandBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-command-benchmark-report-"));
  try {
    const reports = await writeCommandBenchmarkReports(report, join(root, "report.md"), {
      jsonReportPath: join(root, "runs/output-router/report.json"),
    });
    const markdown = await readFile(reports.markdown, "utf8");
    assert.ok(reports.json);
    const json = JSON.parse(await readFile(reports.json, "utf8"));

    assert.match(markdown, /Command Output Fixtures/);
    assert.match(markdown, /machine-readable JSON/);
    assert.equal(json.summary.improved.passed, report.fixtures.length);
    assert.equal(json.fixtures.length, report.fixtures.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
