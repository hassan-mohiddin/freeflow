import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  renderContextModeNormalizedBenchmarkReport,
  runContextModeNormalizedBenchmarks,
  writeContextModeNormalizedBenchmarkReports,
} from "../dist/context-mode-normalized-benchmarks.js";

test("context mode normalized benchmark compares proxy and Freeflow fixture classes", async () => {
  const report = await runContextModeNormalizedBenchmarks({ iterations: 1, generatedAt: "2026-06-26T00:00:00.000Z" });

  assert.equal(report.summary.fixtures, 6);
  assert.equal(report.summary.freeflow.failed, 0);
  assert.equal(report.summary.contextModeProxy.failed, 0);
  assert.equal(report.summary.freeflow.exactFactsPreserved, report.summary.fixtures);
  assert.equal(report.summary.freeflow.recoveryAvailable, report.summary.fixtures);
  assert.equal(report.summary.publicClaimsAllowed, false);
  assert.ok(report.summary.freeflow.totalModelVisibleBytes > 0);
  assert.ok(report.summary.contextModeProxy.totalModelVisibleBytes > 0);

  const categories = new Set(report.fixtures.map((fixture) => fixture.category));
  assert.deepEqual(categories, new Set(["command", "docs", "logs", "json-csv", "repo-search", "batch"]));

  const batch = report.fixtures.find((fixture) => fixture.id === "batch-multi-command-query");
  assert.ok(batch);
  const freeflowBatch = batch.results.find((result) => result.mode === "freeflow-owned-tools");
  const proxyBatch = batch.results.find((result) => result.mode === "context-mode-normalized-proxy");
  assert.equal(freeflowBatch?.toolCalls, 1);
  assert.equal(proxyBatch?.toolCalls, 3);

  const rendered = renderContextModeNormalizedBenchmarkReport(report);
  assert.match(rendered, /Context Mode Normalized Benchmark Report/);
  assert.match(rendered, /not the external Context Mode runtime/);
  assert.match(rendered, /Public superiority claims allowed: no/);
});

test("context mode normalized benchmark writer emits markdown and JSON", async () => {
  const report = await runContextModeNormalizedBenchmarks({ iterations: 1, generatedAt: "2026-06-26T00:00:00.000Z" });
  const root = await mkdtemp(join(tmpdir(), "freeflow-context-mode-normalized-report-"));
  try {
    const reports = await writeContextModeNormalizedBenchmarkReports(report, join(root, "report.md"), {
      jsonReportPath: join(root, "runs/output-router/report.json"),
    });
    const markdown = await readFile(reports.markdown, "utf8");
    assert.ok(reports.json);
    const json = JSON.parse(await readFile(reports.json, "utf8"));

    assert.match(markdown, /command, docs, logs, JSON\/table, repo-search, and batch fixture classes/);
    assert.match(markdown, /machine-readable JSON/);
    assert.equal(json.summary.fixtures, report.summary.fixtures);
    assert.equal(json.summary.publicClaimsAllowed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
