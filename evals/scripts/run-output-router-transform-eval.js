#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createVault,
  freeflowTransform,
  readOutputText,
  storeCommandOutput,
} from "../../router/dist/index.js";

const REPORT_PATH = "evals/reports/runtime/output-router-transform-eval-1-report.md";
const DATE = "2026-06-28";

function bytes(value) {
  return Buffer.byteLength(String(value), "utf8");
}

function evidenceBytes(result) {
  return (result.evidence ?? []).reduce((total, packet) => total + bytes(packet.excerpt ?? ""), 0);
}

function passMark(value) {
  return value ? "pass" : "fail";
}

async function runTransformComparison(vaultRoot) {
  const vault = createVault({ root: vaultRoot });
  const log = Array.from({ length: 160 }, (_, index) => {
    if (index === 37) return "ERROR target alpha failed in payment retry path";
    if (index === 119) return "ERROR target beta failed in invoice retry path";
    return `INFO noisy line ${index + 1}: background worker heartbeat`;
  }).join("\n");

  const source = await storeCommandOutput(vault, {
    sessionId: "transform-long-log-eval",
    command: "node noisy-log-fixture.js",
    stdout: log,
    stderr: "",
    combined: log,
    executionStatus: "success",
    exitCode: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
  });

  const filtered = await freeflowTransform({
    sessionId: "transform-long-log-eval",
    vaultRoot,
    source: { kind: "vault", outputId: source.outputId, stream: "combined" },
    operation: { kind: "regexFilter", pattern: "ERROR target", contextLines: 1, maxMatches: 10 },
    thresholds: { largeOutputLines: 8, largeOutputBytes: 420 },
    preserve: "important",
  });
  const counted = await freeflowTransform({
    sessionId: "transform-long-log-eval",
    vaultRoot,
    source: { kind: "vault", outputId: source.outputId, stream: "combined" },
    operation: { kind: "countMatches", pattern: "ERROR target" },
    preserve: "important",
  });

  const recoveredFiltered = await readOutputText(vault, "transform-long-log-eval", filtered.outputId, "raw");
  const gates = {
    manualBaselineWouldReadWholeLog: bytes(log) > evidenceBytes(filtered),
    filteredTargetFacts: recoveredFiltered.includes("ERROR target alpha") && recoveredFiltered.includes("ERROR target beta"),
    countMatches: /matches: 2\b/.test(await readOutputText(vault, "transform-long-log-eval", counted.outputId, "raw")),
    lineage: filtered.lineage.sourceOutputIds.includes(source.outputId),
  };

  return {
    id: "long-log-manual-inspection-vs-freeflow-transform",
    baseline: `${bytes(log)} raw log bytes for manual inspection`,
    freeflow: `${evidenceBytes(filtered)} filtered evidence bytes; countMatches=2; exact transformed recovery`,
    gates,
  };
}

function assertAllPassed(results) {
  for (const result of results) {
    for (const [name, passed] of Object.entries(result.gates)) {
      assert.equal(passed, true, `${result.id} gate failed: ${name}`);
    }
  }
}

function renderReport(results) {
  const totalGates = results.reduce((count, result) => count + Object.keys(result.gates).length, 0);
  const passedGates = results.reduce((count, result) => count + Object.values(result.gates).filter(Boolean).length, 0);
  const rows = results.map((result) => {
    const gates = Object.entries(result.gates).map(([name, passed]) => `${name} ${passed ? "✓" : "✗"}`).join("; ");
    return `| ${result.id} | ${result.baseline} | ${result.freeflow} | ${passMark(Object.values(result.gates).every(Boolean))} | ${gates} |`;
  }).join("\n");

  return `# Output Router Transform Eval - Iteration 1\n\nDate: ${DATE}\n\n## Scope\n\nTargeted deterministic eval for transformed-output routing. It compares direct/manual long-log inspection against explicit Freeflow transform operations.\n\n## Command\n\n\`\`\`sh\nnpm run build && node evals/scripts/run-output-router-transform-eval.js\n\`\`\`\n\n## Summary\n\n- Fixtures: ${results.length}\n- Objective gates passed: ${passedGates}/${totalGates}\n\n## Results\n\n| fixture | direct/raw baseline | Freeflow routed behavior | status | gates |\n| --- | --- | --- | --- | --- |\n${rows}\n\n## Result\n\nAll targeted transform gates passed for these deterministic fixtures.\n`;
}

async function main() {
  const tmpRoot = await mkdtemp(join(tmpdir(), "freeflow-transform-eval-"));
  try {
    const vaultRoot = join(tmpRoot, "vault");
    const results = [await runTransformComparison(vaultRoot)];
    assertAllPassed(results);
    await writeFile(REPORT_PATH, renderReport(results), "utf8");
    console.log(`Wrote ${REPORT_PATH}`);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
