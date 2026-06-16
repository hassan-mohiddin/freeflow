import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { renderRouterBenchmarkReport, runRouterBenchmarks, writeRouterBenchmarkReports } from "../dist/benchmarks.js";

test("router benchmark harness compares internal modes and gates improved retrieval", async () => {
  const report = await runRouterBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });

  assert.equal(report.fixtures.length, 7);
  assert.equal(report.summary.improved.failed, 0);
  assert.equal(report.summary.improved.passed, report.fixtures.length);
  assert.ok(report.summary.improved.weightedByteReductionPercent > 98);
  assert.ok(report.summary.improved.weightedTokenReductionPercent > 98);
  assert.ok(report.skippedExternalTools.some((tool) => tool.name === "Graphify"));

  for (const fixture of report.fixtures) {
    assert.deepEqual(
      fixture.results.map((result) => result.mode),
      ["native-baseline-proxy", "pre-hardening-freeflow-proxy", "improved-freeflow-router"],
    );
    const improved = fixture.results.find((result) => result.mode === "improved-freeflow-router");
    assert.equal(improved.correctness.passed, true, `${fixture.id} improved correctness`);
    assert.notEqual(improved.recovery.status, "failed", `${fixture.id} improved recovery`);
    assert.ok(improved.routedBytes > 0, `${fixture.id} routed bytes recorded`);
    assert.equal(Number.isFinite(improved.byteReductionPercent), true, `${fixture.id} byte reduction recorded`);
    assert.equal(Number.isFinite(improved.tokenReductionPercent), true, `${fixture.id} token reduction recorded`);
    assert.ok(improved.latencyMs.p50 >= 0, `${fixture.id} latency recorded`);
  }

  const sandbox = report.fixtures.find((fixture) => fixture.id === "generated-artifact-decoy");
  assert.ok(sandbox);
  const sandboxImproved = sandbox.results.find((result) => result.mode === "improved-freeflow-router");
  assert.equal(sandboxImproved.actualPath, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
  assert.equal(sandboxImproved.correctness.generatedFalsePositive, false);
  assert.ok(sandboxImproved.byteReductionPercent > 99);
  assert.match(sandboxImproved.recovery.detail, /Verified/);
  assert.ok(sandbox.results.some((result) => result.mode !== "improved-freeflow-router" && result.correctness.generatedFalsePositive));

  const rendered = renderRouterBenchmarkReport(report);
  assert.match(rendered, /byte\/token reduction/);
  assert.match(rendered, /Baseline Caveat/);
  assert.match(rendered, /Not Yet Measured/);
  assert.match(rendered, /Sandbox failure fixed: yes/);
  assert.match(rendered, /Skipped External Comparators/);
});

test("router benchmark writer emits markdown and machine-readable JSON", async () => {
  const report = await runRouterBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-benchmark-report-"));
  try {
    const reports = await writeRouterBenchmarkReports(report, join(root, "report.md"), {
      jsonReportPath: join(root, "runs/output-router/report.json"),
    });
    const markdown = await readFile(reports.markdown, "utf8");
    assert.ok(reports.json);
    const json = JSON.parse(await readFile(reports.json, "utf8"));

    assert.match(markdown, /Output Router Benchmark Report/);
    assert.match(markdown, /generated run data/);
    assert.equal(json.summary.improved.passed, report.fixtures.length);
    assert.equal(json.fixtures.length, report.fixtures.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
