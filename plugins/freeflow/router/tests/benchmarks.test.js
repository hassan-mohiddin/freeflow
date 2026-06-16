import assert from "node:assert/strict";
import test from "node:test";

import { renderRouterBenchmarkReport, runRouterBenchmarks } from "../dist/benchmarks.js";

test("router benchmark harness compares internal modes and gates improved retrieval", async () => {
  const report = await runRouterBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });

  assert.equal(report.fixtures.length, 7);
  assert.equal(report.summary.improved.failed, 0);
  assert.equal(report.summary.improved.passed, report.fixtures.length);
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
    assert.ok(improved.latencyMs.p50 >= 0, `${fixture.id} latency recorded`);
  }

  const sandbox = report.fixtures.find((fixture) => fixture.id === "generated-artifact-decoy");
  assert.ok(sandbox);
  const sandboxImproved = sandbox.results.find((result) => result.mode === "improved-freeflow-router");
  assert.equal(sandboxImproved.actualPath, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
  assert.equal(sandboxImproved.correctness.generatedFalsePositive, false);
  assert.ok(sandbox.results.some((result) => result.mode !== "improved-freeflow-router" && result.correctness.generatedFalsePositive));

  const rendered = renderRouterBenchmarkReport(report);
  assert.match(rendered, /Sandbox failure fixed: yes/);
  assert.match(rendered, /Skipped External Comparators/);
});
