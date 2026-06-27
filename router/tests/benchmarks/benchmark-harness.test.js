import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  approximateTokens,
  averagePercent,
  defaultJsonRunReportPath,
  escapeMarkdownTableCell,
  formatPercent,
  latencySummary,
  medianPercent,
  normalizeIterations,
  parseBenchmarkCliArgs,
  reductionPercent,
  writeBenchmarkReportPair,
} from "../../dist/benchmarks/benchmark-harness.js";

test("benchmark harness normalizes iterations and latency summaries", () => {
  assert.equal(normalizeIterations(4.8, 3), 4);
  assert.equal(normalizeIterations(0, 3), 3);
  assert.equal(normalizeIterations(-1, 3), 3);
  assert.equal(normalizeIterations(Number.NaN, 3), 3);
  assert.equal(normalizeIterations(Number.POSITIVE_INFINITY, 3), 3);
  assert.equal(normalizeIterations("5", 3), 3);

  assert.deepEqual(latencySummary([]), { p50: 0, p95: 0 });
  assert.deepEqual(latencySummary([40, 10, 30, 20]), { p50: 20, p95: 40 });
  assert.deepEqual(latencySummary([9, 1, 5]), { p50: 5, p95: 9 });
});

test("benchmark harness preserves current byte, token, percent, and table helpers", () => {
  assert.equal(approximateTokens(0), 0);
  assert.equal(approximateTokens(1), 1);
  assert.equal(approximateTokens(5), 2);
  assert.equal(reductionPercent(1000, 123), 87.7);
  assert.equal(reductionPercent(0, 123), 0);
  assert.equal(averagePercent([1.111, 2.225]), 1.67);
  assert.equal(medianPercent([9, 1, 5]), 5);
  assert.equal(formatPercent(87.7), "87.70%");
  assert.equal(escapeMarkdownTableCell("a|b\nc"), "a\\|b c");
});

test("benchmark harness derives generated JSON paths and parses shared CLI args", () => {
  const defaultReportPath = resolve(process.cwd(), "tmp/default-report.md");
  assert.equal(
    defaultJsonRunReportPath(resolve(process.cwd(), "evals/reports/runtime/output-router-benchmark-1-report.md")),
    resolve(process.cwd(), "evals/runs/output-router/output-router-benchmark-1-report.json"),
  );
  assert.equal(
    defaultJsonRunReportPath(resolve(process.cwd(), "evals/reports/runtime/custom")),
    resolve(process.cwd(), "evals/runs/output-router/custom.json"),
  );

  assert.deepEqual(parseBenchmarkCliArgs(["--iterations=3.5"], { reportPath: defaultReportPath }), {
    iterations: 3.5,
    reportPath: defaultReportPath,
  });
  assert.deepEqual(parseBenchmarkCliArgs(["--iterations=0"], { reportPath: defaultReportPath }), {
    reportPath: defaultReportPath,
  });
  assert.deepEqual(parseBenchmarkCliArgs(["--report=reports/out.md", "--json-report=off"], { reportPath: defaultReportPath }), {
    reportPath: resolve(process.cwd(), "reports/out.md"),
    jsonReportPath: false,
  });
  assert.deepEqual(parseBenchmarkCliArgs(["--json-report=runs/out.json"], { reportPath: defaultReportPath }), {
    reportPath: defaultReportPath,
    jsonReportPath: resolve(process.cwd(), "runs/out.json"),
  });
});

test("benchmark harness writes markdown and optional JSON report pairs", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-benchmark-harness-"));
  try {
    const report = { summary: { passed: 1 }, fixtures: [{ id: "a" }] };
    const reports = await writeBenchmarkReportPair({
      report,
      markdownReportPath: join(root, "report.md"),
      jsonReportPath: join(root, "runs/report.json"),
      renderMarkdown: (value) => `report ${value.summary.passed}\n`,
    });

    assert.equal(await readFile(reports.markdown, "utf8"), "report 1\n");
    assert.ok(reports.json);
    assert.deepEqual(JSON.parse(await readFile(reports.json, "utf8")), report);

    const markdownOnly = await writeBenchmarkReportPair({
      report,
      markdownReportPath: join(root, "markdown-only.md"),
      jsonReportPath: false,
      renderMarkdown: () => "markdown only\n",
    });
    assert.deepEqual(markdownOnly, { markdown: join(root, "markdown-only.md") });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
