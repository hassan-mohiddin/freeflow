import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  renderCodexQaBenchmarkReport,
  runCodexQaBenchmarks,
  writeCodexQaBenchmarkReports,
} from "../../dist/benchmarks/codex-qa-benchmarks.js";

test("Codex Q&A macro benchmark catches generated Sandbox Permissions decoy", async () => {
  const report = await runCodexQaBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });

  assert.equal(report.fixtures.length, 1);
  assert.equal(report.summary.fixtures, 1);
  assert.equal(report.summary.improved.passed, 1);
  assert.equal(report.summary.nativeBaseline.failed, 1);
  assert.equal(report.summary.sandboxFailureFixed, true);
  assert.ok(report.skippedExternalTools.some((tool) => tool.name === "Graphify"));
  assert.ok(report.skippedExternalTools.some((tool) => tool.name === "Claude Context"));

  const fixture = report.fixtures[0];
  assert.equal(fixture.id, "sandbox-permissions-structured-qa");
  const improved = fixture.results.find((result) => result.mode === "improved-freeflow-router");
  const native = fixture.results.find((result) => result.mode === "native-broad-search-proxy");

  assert.ok(improved);
  assert.equal(improved.correctness.passed, true);
  assert.equal(improved.correctness.answerCorrect, true);
  assert.equal(improved.correctness.citationCorrect, true);
  assert.equal(improved.correctness.evidenceCorrect, true);
  assert.equal(improved.correctness.generatedFalsePositive, false);
  assert.equal(improved.actualPath, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
  assert.match(improved.answer, /UseDefault: run with the turn's normal sandbox/);
  assert.match(improved.answer, /RequireEscalated: request unsandboxed execution/);
  assert.match(improved.answer, /WithAdditionalPermissions: stay sandboxed but widen permissions/);
  assert.ok(improved.contextBytes > 0);
  assert.ok(improved.latencyMs.p50 >= 0);
  assert.equal(improved.proxyCalls, 2);

  assert.ok(native);
  assert.equal(native.correctness.generatedFalsePositive, true);
  assert.equal(native.actualPath, "graphify-out/graph.html");
  assert.equal(native.correctness.passed, false);
});

test("Codex Q&A benchmark writer emits markdown and machine-readable JSON", async () => {
  const report = await runCodexQaBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-codex-qa-report-"));
  try {
    const reports = await writeCodexQaBenchmarkReports(report, join(root, "report.md"), {
      jsonReportPath: join(root, "runs/output-router/report.json"),
    });
    const markdown = await readFile(reports.markdown, "utf8");
    assert.ok(reports.json);
    const json = JSON.parse(await readFile(reports.json, "utf8"));

    assert.match(markdown, /Codex Structured Q&A Macro Benchmark Report/);
    assert.match(markdown, /Sandbox failure fixed: yes/);
    assert.match(markdown, /answer\/citation\/evidence/);
    assert.match(markdown, /Skipped External Comparators/);
    assert.equal(json.summary.improved.passed, 1);
    assert.equal(json.fixtures.length, 1);

    const rendered = renderCodexQaBenchmarkReport(report);
    assert.match(rendered, /docs\/codex-cli-agent-harness\/2026-06-12-pass-3-sandboxing-and-permissions.md/);
    assert.match(rendered, /Graphify/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
