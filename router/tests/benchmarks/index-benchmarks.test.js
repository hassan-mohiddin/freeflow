import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildOrLoadExperimentalRepoIndex,
  defaultExperimentalIndexCacheRoot,
  queryExperimentalRepoIndex,
} from "../../dist/experiments/local-index.js";
import {
  renderIndexBenchmarkReport,
  runIndexBenchmarks,
  writeIndexBenchmarkReports,
} from "../../dist/benchmarks/index-benchmarks.js";

async function withTempRepo(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-index-fixture-"));
  const cacheRoot = await mkdtemp(join(tmpdir(), "freeflow-router-index-cache-"));
  try {
    await fn(root, cacheRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

test("experimental local index stays outside repo, skips generated decoys, and refreshes stale files", async () => {
  await withTempRepo(async (root, cacheRoot) => {
    await writeFile(
      join(root, "target.md"),
      ["# Target", "", "ExactIndexNeedle original source truth."].join("\n"),
      "utf8",
    );
    await mkdir(join(root, "graphify-out"), { recursive: true });
    await writeFile(join(root, "graphify-out", "graph.html"), "ExactIndexNeedle ".repeat(5000), "utf8");
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "diagram.png"), "ExactIndexMediaOnly ".repeat(5000), "utf8");
    await mkdir(join(root, "custom-generated"), { recursive: true });
    await writeFile(join(root, "custom-generated", "decoy.md"), "ExactIndexGeneratedHintOnly ".repeat(5000), "utf8");
    await symlink(join(root, "missing.md"), join(root, "broken-link.md"));
    await writeFile(join(root, "package-lock.json"), "ExactIndexNeedle lockfile should stay searchable", "utf8");

    const cold = await buildOrLoadExperimentalRepoIndex({ root, cacheRoot, generatedPathGlobs: ["custom-generated/**"] });
    assert.equal(cold.mode, "cold-built");
    assert.ok(!cold.cachePath.startsWith(root), "cache path should be outside repo root");
    assert.ok(defaultExperimentalIndexCacheRoot().includes("freeflow-router"));
    assert.equal(cold.index.files["assets/diagram.png"], undefined);
    assert.equal(cold.index.files["custom-generated/decoy.md"], undefined);
    assert.equal(queryExperimentalRepoIndex(cold.index, "ExactIndexMediaOnly", { topK: 1 }).length, 0);
    assert.equal(queryExperimentalRepoIndex(cold.index, "ExactIndexGeneratedHintOnly", { topK: 1 }).length, 0);

    const exact = queryExperimentalRepoIndex(cold.index, "ExactIndexNeedle original source truth", { topK: 1 });
    assert.equal(exact[0]?.path, "target.md");
    assert.equal(exact[0]?.lines, "1-3");
    assert.match(exact[0]?.excerpt ?? "", /ExactIndexNeedle original/);

    const lockfile = queryExperimentalRepoIndex(cold.index, "ExactIndexNeedle lockfile searchable", { topK: 1 });
    assert.equal(lockfile[0]?.path, "package-lock.json");

    await writeFile(
      join(root, "target.md"),
      ["# Target", "", "ExactIndexNeedle refreshed source truth."].join("\n"),
      "utf8",
    );
    const refreshed = await buildOrLoadExperimentalRepoIndex({ root, cacheRoot, generatedPathGlobs: ["custom-generated/**"] });
    assert.equal(refreshed.mode, "stale-refreshed");
    assert.notEqual(refreshed.index.files["target.md"].hashSha256, cold.index.files["target.md"].hashSha256);
    const updated = queryExperimentalRepoIndex(refreshed.index, "ExactIndexNeedle refreshed source truth", { topK: 1 });
    assert.equal(updated[0]?.path, "target.md");
    assert.match(updated[0]?.excerpt ?? "", /refreshed source truth/);

    const warm = await buildOrLoadExperimentalRepoIndex({ root, cacheRoot, generatedPathGlobs: ["custom-generated/**"] });
    assert.equal(warm.mode, "warm-loaded");
  });
});

test("experimental local index bounds non-finite topK", () => {
  const chunks = Array.from({ length: 12 }, (_, index) => ({
    id: index,
    path: `file-${index}.md`,
    startLine: 1,
    endLine: 1,
    kind: "window",
    text: "needle token",
    tokens: ["needle", "token"],
    tokenCounts: { needle: 1, token: 1 },
  }));
  const files = Object.fromEntries(
    chunks.map((chunk) => [
      chunk.path,
      {
        path: chunk.path,
        hashSha256: `hash-${chunk.id}`,
        sizeBytes: 12,
        lineCount: 1,
        chunkIds: [chunk.id],
      },
    ]),
  );
  const index = {
    version: 1,
    root: "/tmp/root",
    builtAt: "2026-06-16T00:00:00.000Z",
    files,
    chunks,
    tokenDocumentFrequency: { needle: 12, token: 12 },
    averageChunkTokens: 2,
    cachePath: "/tmp/cache.json",
  };

  const results = queryExperimentalRepoIndex(index, "needle", { topK: Number.NaN });

  assert.equal(results.length, 1);
});

test("index benchmark reports cold, warm, stale, and scanner comparison without adopting index", async () => {
  const report = await runIndexBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });

  assert.equal(report.summary.scannerDefault, true);
  assert.equal(report.summary.indexAdopted, false);
  assert.equal(report.summary.index.failed, 0);
  assert.equal(report.summary.index.passed, report.fixtures.length);
  assert.equal(report.summary.hybrid.failed, 0);
  assert.equal(report.summary.hybrid.passed, report.fixtures.length);
  assert.equal(report.summary.scanner.recallAtK, report.fixtures.length);
  assert.equal(report.summary.index.recallAtK, report.fixtures.length);
  assert.equal(report.summary.hybrid.recallAtK, report.fixtures.length);
  if (report.summary.ftsCandidate.available) {
    assert.equal(report.summary.fts.failed, 0);
    assert.equal(report.summary.fts.passed, report.fixtures.length);
    assert.equal(report.summary.fts.recallAtK, report.fixtures.length);
  } else {
    assert.equal(report.summary.fts.skipped, report.fixtures.length);
  }
  assert.equal(report.summary.generatedFalsePositiveCount, 0);
  assert.ok(report.summary.coldBuildMs.p50 >= 0);
  assert.ok(report.summary.warmQueryMs.p50 >= 0);
  assert.ok(report.summary.staleRefreshMs.p50 >= 0);

  const sandbox = report.fixtures.find((fixture) => fixture.id === "index-generated-artifact-decoy");
  assert.ok(sandbox);
  const indexResult = sandbox.results.find((result) => result.mode === "index-warm");
  assert.equal(indexResult.correctness.passed, true);
  assert.equal(indexResult.actualPath, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
  assert.equal(indexResult.correctness.generatedFalsePositive, false);

  const stale = report.fixtures.find((fixture) => fixture.id === "index-stale-refresh");
  assert.ok(stale);
  const staleResult = stale.results.find((result) => result.mode === "index-stale-refresh");
  assert.equal(staleResult.correctness.passed, true);
  assert.equal(staleResult.indexMode, "stale-refreshed");

  const fts = report.fixtures.find((fixture) => fixture.id === "index-generated-artifact-decoy")?.results.find((result) => result.mode === "fts5-bm25-trigram");
  assert.ok(fts);
  if (report.summary.ftsCandidate.available) {
    assert.equal(fts.correctness.passed, true);
    assert.equal(fts.actualPath, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
    assert.equal(fts.correctness.recallAtK, true);
  } else {
    assert.equal(fts.skipped, true);
  }

  const hybrid = report.fixtures.find((fixture) => fixture.id === "index-generated-artifact-decoy")?.results.find((result) => result.mode === "hybrid-warm");
  assert.ok(hybrid);
  assert.equal(hybrid.correctness.passed, true);
  assert.equal(hybrid.actualPath, "docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md");
  assert.equal(hybrid.correctness.recallAtK, true);

  const rendered = renderIndexBenchmarkReport(report);
  assert.match(rendered, /Output Router Index Benchmark Report/);
  assert.match(rendered, /Scanner remains default: yes/);
  assert.match(rendered, /FTS5\/BM25\/trigram pass:/);
  assert.match(rendered, /Hybrid warm pass:/);
  assert.match(rendered, /FTS5\/BM25\/trigram candidate: (available|unavailable)/);
  assert.match(rendered, /Index adopted by default: no/);
});

test("index benchmark writer emits markdown and machine-readable JSON", async () => {
  const report = await runIndexBenchmarks({ iterations: 1, generatedAt: "2026-06-16T00:00:00.000Z" });
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-index-benchmark-report-"));
  try {
    const reports = await writeIndexBenchmarkReports(report, join(root, "report.md"), {
      jsonReportPath: join(root, "runs/output-router/report.json"),
    });
    const markdown = await readFile(reports.markdown, "utf8");
    assert.ok(reports.json);
    const json = JSON.parse(await readFile(reports.json, "utf8"));

    assert.match(markdown, /Repo Search Backend Benchmark/);
    assert.match(markdown, /machine-readable JSON/);
    assert.equal(json.summary.index.passed, report.fixtures.length);
    if (json.summary.ftsCandidate.available) {
      assert.equal(json.summary.fts.passed, report.fixtures.length);
    }
    assert.equal(json.summary.hybrid.passed, report.fixtures.length);
    assert.equal(json.fixtures.length, report.fixtures.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
