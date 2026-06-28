import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  renderContextModeRealDeepBenchmarkReport,
  runContextModeRealDeepBenchmark,
  writeContextModeRealDeepBenchmarkReports,
} from "../../dist/benchmarks/context-mode-real-deep-benchmark.js";

const baselineMarkdownPath = "evals/reports/runtime/context-mode-real-deep-baseline-1-report.md";

test("real Context Mode deep benchmark degrades without making claims when Context Mode is unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-context-mode-real-deep-unavailable-"));
  try {
    const report = await runContextModeRealDeepBenchmark({
      contextModeRepo: join(root, "missing-context-mode"),
      generatedAt: "2026-06-27T00:00:00.000Z",
    });

    assert.equal(report.contextMode.status, "unavailable");
    assert.equal(report.publicClaimsAllowed, false);
    assert.equal(report.rows.length, 0);
    assert.equal(report.summaries.length, 0);
    assert.equal(report.baselineChecks.expectedCurrentFailuresDetected, false);
    assert.match(report.contextMode.unavailableReason, /Missing Context Mode path/);

    const rendered = renderContextModeRealDeepBenchmarkReport(report);
    assert.match(rendered, /Context Mode status: unavailable/);
    assert.match(rendered, /Public superiority claims allowed: no/);
    assert.match(rendered, /No benchmark claims are allowed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real Context Mode deep benchmark writer emits unavailable markdown and JSON", async () => {
  const unavailableRoot = await mkdtemp(join(tmpdir(), "freeflow-context-mode-real-deep-writer-unavailable-"));
  const reportRoot = await mkdtemp(join(tmpdir(), "freeflow-context-mode-real-deep-report-"));
  try {
    const report = await runContextModeRealDeepBenchmark({
      contextModeRepo: join(unavailableRoot, "missing-context-mode"),
      generatedAt: "2026-06-27T00:00:00.000Z",
    });
    const reports = await writeContextModeRealDeepBenchmarkReports(report, join(reportRoot, "report.md"), {
      jsonReportPath: join(reportRoot, "runs/output-router/report.json"),
    });

    const markdown = await readFile(reports.markdown, "utf8");
    assert.ok(reports.json);
    const json = JSON.parse(await readFile(reports.json, "utf8"));

    assert.match(markdown, /Context Mode unavailable/);
    assert.equal(json.contextMode.status, "unavailable");
    assert.equal(json.publicClaimsAllowed, false);
  } finally {
    await rm(unavailableRoot, { recursive: true, force: true });
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test("committed real Context Mode baseline markdown preserves current failure classes", async () => {
  const markdown = await readFile(baselineMarkdownPath, "utf8");

  assert.match(markdown, /Context Mode status: available/);
  assert.match(markdown, /Public superiority claims allowed: no/);
  assert.match(markdown, /freeflow:run-cat-default/);
  assert.match(markdown, /access-summary \/ freeflow:run-cat-default/);
  assert.match(markdown, /batch-multi-source-query \/ freeflow:batch/);
  assert.match(markdown, /vitest-summary-upstream-script \/ context-mode:upstream-benchmark-script/);
});

test("committed runtime reports stay markdown-only", async () => {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir("evals/reports/runtime");
  assert.deepEqual(entries.filter((entry) => entry.endsWith(".json")), []);
});
