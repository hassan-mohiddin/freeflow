import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  renderVaultIndexStorageBenchmarkReport,
  runVaultIndexStorageBenchmark,
  writeVaultIndexStorageBenchmarkReports,
} from "../dist/vault-index-benchmarks.js";

test("vault index storage benchmark selects local sidecar without adopting SQLite", async () => {
  const report = await runVaultIndexStorageBenchmark({ iterations: 1, generatedAt: "2026-06-24T00:00:00.000Z" });

  assert.equal(report.summary.selectedEngine, "local-json-sidecar");
  assert.equal(report.summary.localSidecarPassed, true);
  assert.equal(report.summary.scannerBaselinePassed, true);
  assert.equal(report.summary.sqliteFtsStatus, "not-run");
  assert.ok(report.summary.localAppendMs.p50 >= 0);
  assert.ok(report.summary.localQueryMs.p50 >= 0);
  assert.ok(report.summary.scanQueryMs.p50 >= 0);
  assert.equal(typeof report.summary.localQueryReductionPercent, "number");
  assert.ok(Number.isFinite(report.summary.localQueryReductionPercent));

  const local = report.candidates.find((candidate) => candidate.candidate === "local-json-sidecar");
  assert.ok(local);
  assert.equal(local.adopted, true);
  assert.equal(local.status, "pass");
  assert.ok(local.checks.includes("each persisted append is queryable immediately"));

  const sqlite = report.candidates.find((candidate) => candidate.candidate === "sqlite-fts");
  assert.ok(sqlite);
  assert.equal(sqlite.status, "not-run");
  assert.equal(sqlite.adopted, false);

  const rendered = renderVaultIndexStorageBenchmarkReport(report);
  assert.match(rendered, /Vault Index Storage Spike Report/);
  assert.match(rendered, /Selected engine: local-json-sidecar/);
  assert.match(rendered, /SQLite FTS status: not-run/);
  assert.match(rendered, /incrementally/);
});

test("vault index storage benchmark writer emits markdown and optional JSON", async () => {
  const report = await runVaultIndexStorageBenchmark({ iterations: 1, generatedAt: "2026-06-24T00:00:00.000Z" });
  const root = await mkdtemp(join(tmpdir(), "freeflow-vault-index-benchmark-report-"));
  try {
    const written = await writeVaultIndexStorageBenchmarkReports(report, join(root, "report.md"), {
      jsonReportPath: join(root, "runs/report.json"),
    });
    const markdown = await readFile(written.markdown, "utf8");
    assert.ok(written.json);
    const json = JSON.parse(await readFile(written.json, "utf8"));

    assert.match(markdown, /deterministic local JSON sidecar/);
    assert.equal(json.summary.selectedEngine, "local-json-sidecar");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
