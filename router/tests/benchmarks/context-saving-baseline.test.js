import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  renderContextSavingBaselineReport,
  runContextSavingBaseline,
  writeContextSavingBaselineReport,
} from "../../dist/benchmarks/context-saving-baseline.js";

test("context-saving baseline measures current model-visible sizes and guardrails", async () => {
  const report = await runContextSavingBaseline({ generatedAt: "2026-06-25T00:00:00.000Z" });

  assert.equal(report.observations.length, 5);
  assert.equal(report.summary.fixtures, 5);
  assert.equal(report.summary.factsPreserved, report.summary.fixtures);
  assert.equal(report.summary.recoveryAvailable, report.summary.fixtures);
  assert.ok(report.summary.totalRawBytes > 0);
  assert.ok(report.summary.totalModelVisibleBytes > 0);
  assert.ok(report.summary.totalDetailsPayloadBytes > report.summary.totalModelVisibleBytes);

  const runObservation = report.observations.find((observation) => observation.id === "run-failed-test-output");
  assert.ok(runObservation);
  assert.equal(runObservation.tool, "freeflow_run");
  assert.match(runObservation.outputId ?? "", /^ffout_/);
  assert.equal(runObservation.factsPreserved, true);
  assert.equal(runObservation.recoveryAvailable, true);

  const exactRetrieve = report.observations.find((observation) => observation.id === "retrieve-repo-exact-range");
  assert.ok(exactRetrieve);
  assert.equal(exactRetrieve.recoveryAvailable, true);
  assert.ok(exactRetrieve.evidenceLocations.some((location) => location.includes("plugin-docs/output-router.md")));

  assert.ok(report.guardrails.some((guardrail) => guardrail.path === "router/tests/retrieve.test.js"));
  assert.ok(report.guardrails.some((guardrail) => guardrail.path === "router/tests/pi-extension-derive.test.js"));

  const rendered = renderContextSavingBaselineReport(report);
  assert.match(rendered, /Context-Saving Native Tools Baseline Report/);
  assert.match(rendered, /Model-visible bytes/);
  assert.match(rendered, /Guardrail Inventory/);
  assert.match(rendered, /router\/tests\/retrieve.test.js/);
});

test("context-saving baseline writer emits markdown and machine-readable JSON", async () => {
  const report = await runContextSavingBaseline({ generatedAt: "2026-06-25T00:00:00.000Z" });
  const root = await mkdtemp(join(tmpdir(), "freeflow-context-saving-baseline-report-"));
  try {
    const reports = await writeContextSavingBaselineReport(report, join(root, "report.md"), {
      jsonReportPath: join(root, "runs/output-router/report.json"),
    });
    const markdown = await readFile(reports.markdown, "utf8");
    assert.ok(reports.json);
    const json = JSON.parse(await readFile(reports.json, "utf8"));

    assert.match(markdown, /Measurements/);
    assert.equal(json.summary.fixtures, report.summary.fixtures);
    assert.equal(json.observations.length, report.observations.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
