import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  renderStoragePolicyBenchmarkReport,
  runStoragePolicyBenchmarks,
  writeStoragePolicyBenchmarkReports,
} from "../../dist/index.js";

test("storage policy benchmark compares candidates without changing defaults", async () => {
  const report = await runStoragePolicyBenchmarks({ iterations: 1, generatedAt: "2026-06-26T00:00:00.000Z" });

  assert.equal(report.summary.fixtures, 9);
  assert.equal(report.summary.policies, 5);
  assert.equal(report.summary.defaultUnchanged, true);
  assert.ok(report.summary.safeCandidateIds.includes("store-everything"));
  assert.ok(report.summary.safeCandidateIds.includes("metadata-small-exact-large-hybrid"));
  assert.ok(report.summary.safeCandidateIds.includes("duplicate-output-dedupe"));
  assert.ok(report.summary.safeCandidateIds.includes("hybrid-dedupe"));
  assert.ok(report.summary.disqualifiedCandidateIds.includes("threshold-exact"));

  const threshold = report.policies.find((policy) => policy.policyId === "threshold-exact");
  assert.equal(threshold.safety.exactnessSensitiveRecoveryPassed, false);
  assert.match(threshold.notes.join("\n"), /threshold-only policy is unsafe/);

  const hybrid = report.policies.find((policy) => policy.policyId === "metadata-small-exact-large-hybrid");
  assert.equal(hybrid.safety.exactnessSensitiveRecoveryPassed, true);
  assert.ok(hybrid.totals.metadataOnlyRecords > 0);
  assert.ok(hybrid.totals.exactStoredCombinedBytes < report.policies.find((policy) => policy.policyId === "store-everything").totals.exactStoredCombinedBytes);

  const dedupe = report.policies.find((policy) => policy.policyId === "duplicate-output-dedupe");
  assert.equal(dedupe.safety.repeatedOutputsDeduped, true);
  assert.ok(dedupe.totals.duplicateMetadataRecords > 0);

  const hybridDedupe = report.policies.find((policy) => policy.policyId === "hybrid-dedupe");
  assert.equal(hybridDedupe.safety.exactnessSensitiveRecoveryPassed, true);
  assert.equal(hybridDedupe.safety.repeatedOutputsDeduped, true);
  assert.ok(hybridDedupe.totals.metadataOnlyRecords > hybrid.totals.metadataOnlyRecords);
  assert.ok(hybridDedupe.totals.exactStoredCombinedBytes < dedupe.totals.exactStoredCombinedBytes);
  assert.match(hybridDedupe.notes.join("\n"), /hybrid\+dedupe preserved exact-sensitive recovery/);
});

test("storage policy benchmark report writer emits markdown and JSON", async () => {
  const temp = await mkdtemp(join(tmpdir(), "freeflow-storage-policy-report-"));
  try {
    const report = await runStoragePolicyBenchmarks({ iterations: 1, generatedAt: "2026-06-26T00:00:00.000Z" });
    const markdown = join(temp, "storage-policy.md");
    const json = join(temp, "storage-policy.json");
    const written = await writeStoragePolicyBenchmarkReports(report, markdown, { jsonReportPath: json });

    assert.equal(written.markdown, markdown);
    assert.equal(written.json, json);
    const markdownText = await readFile(markdown, "utf8");
    assert.match(markdownText, /Storage Policy Benchmark Report/);
    assert.match(markdownText, /Runtime default changed: no/);
    assert.match(markdownText, /threshold-only policy is unsafe/);
    assert.match(markdownText, /Hybrid exactness \+ duplicate dedupe/);

    const jsonReport = JSON.parse(await readFile(json, "utf8"));
    assert.deepEqual(jsonReport.summary.safeCandidateIds, report.summary.safeCandidateIds);
    assert.match(renderStoragePolicyBenchmarkReport(report), /Decision Boundary/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
