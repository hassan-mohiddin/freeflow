#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createVault,
  freeflowCapture,
  freeflowDerive,
  readOutputText,
  storeCommandOutput,
} from "../../router/dist/index.js";
import { providerRuntimeContext } from "../../pi-extension/dist/provider-manifests.js";

const REPORT_PATH = "plugins/freeflow/evals/reports/runtime/output-router-capture-derive-provider-eval-1-report.md";
const DATE = "2026-06-23";

function bytes(value) {
  return Buffer.byteLength(String(value), "utf8");
}

function evidenceBytes(result) {
  return (result.evidence ?? []).reduce((total, packet) => total + bytes(packet.excerpt ?? ""), 0);
}

function passMark(value) {
  return value ? "pass" : "fail";
}

function fixtureAdapter(producer, text) {
  return {
    producer,
    readOnly: true,
    async isAvailable() {
      return true;
    },
    async capture(context) {
      assert.deepEqual(context.producer, producer);
      return { text, mediaType: "text/plain" };
    },
  };
}

async function runProviderCaptureComparison(vaultRoot) {
  const vault = createVault({ root: vaultRoot });
  const producer = { kind: "mcp", server: "serena", tool: "find_symbol" };
  const raw = Array.from({ length: 32 }, (_, index) =>
    index === 18
      ? "symbol PaymentService target evidence at src/payments.ts:42"
      : `symbol neighbor-${String(index + 1).padStart(2, "0")} supporting evidence`,
  ).join("\n");

  const result = await freeflowCapture({
    sessionId: "capture-provider-eval",
    vaultRoot,
    producer,
    args: { name_path_pattern: "PaymentService" },
    adapters: [fixtureAdapter(producer, raw)],
    thresholds: { largeOutputLines: 6, largeOutputBytes: 320 },
    preserve: "important",
  });

  const recovered = await readOutputText(vault, "capture-provider-eval", result.outputId, "raw");
  const rawBytes = bytes(raw);
  const routedBytes = evidenceBytes(result);
  const gates = {
    readOnlyCaptured: result.toolStatus === "ok" && result.routing.route === "capture",
    boundedEvidence: routedBytes < rawBytes && !result.evidence[0].excerpt.includes("neighbor-32"),
    exactRecovery: recovered === raw,
  };

  return {
    id: "direct-readonly-provider-vs-freeflow-capture",
    baseline: `${rawBytes} raw bytes would enter context from direct provider output`,
    freeflow: `${routedBytes} evidence bytes entered context; raw recovery=${result.persistence.recoverability}`,
    gates,
  };
}

async function runWebShapedCaptureComparison(vaultRoot) {
  const vault = createVault({ root: vaultRoot });
  const producer = { kind: "web", name: "fixture-search" };
  const raw = [
    "Search result: Freeflow capture adapters",
    "https://example.test/freeflow/capture [1] explains adapter boundaries.",
    "https://example.test/freeflow/derive [2] explains deterministic derive.",
    ...Array.from({ length: 24 }, (_, index) => `result-snippet-${index + 1}: surrounding web/MCP-shaped evidence text`),
    "https://example.test/freeflow/recovery [3] explains exact recovery.",
  ].join("\n");

  const result = await freeflowCapture({
    sessionId: "capture-web-shaped-eval",
    vaultRoot,
    producer,
    adapters: [fixtureAdapter(producer, raw)],
    thresholds: { largeOutputLines: 5, largeOutputBytes: 360 },
    preserve: "important",
  });

  const recovered = await readOutputText(vault, "capture-web-shaped-eval", result.outputId, "raw");
  const gates = {
    webProducerCaptured: result.toolStatus === "ok" && result.producer.kind === "web",
    boundedEvidence: evidenceBytes(result) < bytes(raw),
    exactRecovery: recovered === raw,
  };

  return {
    id: "web-shaped-capture-and-recovery",
    baseline: `${bytes(raw)} raw bytes from web-shaped output`,
    freeflow: `${evidenceBytes(result)} evidence bytes plus ${result.persistence.recoverability} recovery`,
    gates,
  };
}

async function runDeriveComparison(vaultRoot) {
  const vault = createVault({ root: vaultRoot });
  const log = Array.from({ length: 160 }, (_, index) => {
    if (index === 37) return "ERROR target alpha failed in payment retry path";
    if (index === 119) return "ERROR target beta failed in invoice retry path";
    return `INFO noisy line ${index + 1}: background worker heartbeat`;
  }).join("\n");

  const source = await storeCommandOutput(vault, {
    sessionId: "derive-long-log-eval",
    command: "node noisy-log-fixture.js",
    stdout: log,
    stderr: "",
    combined: log,
    executionStatus: "success",
    exitCode: 0,
    createdAt: "2026-06-23T00:00:00.000Z",
  });

  const filtered = await freeflowDerive({
    sessionId: "derive-long-log-eval",
    vaultRoot,
    source: { kind: "vault", outputId: source.outputId, stream: "combined" },
    operation: { kind: "regexFilter", pattern: "ERROR target", contextLines: 1, maxMatches: 10 },
    thresholds: { largeOutputLines: 8, largeOutputBytes: 420 },
    preserve: "important",
  });
  const counted = await freeflowDerive({
    sessionId: "derive-long-log-eval",
    vaultRoot,
    source: { kind: "vault", outputId: source.outputId, stream: "combined" },
    operation: { kind: "countMatches", pattern: "ERROR target" },
    preserve: "important",
  });

  const recoveredFiltered = await readOutputText(vault, "derive-long-log-eval", filtered.outputId, "raw");
  const gates = {
    manualBaselineWouldReadWholeLog: bytes(log) > evidenceBytes(filtered),
    filteredTargetFacts: recoveredFiltered.includes("ERROR target alpha") && recoveredFiltered.includes("ERROR target beta"),
    countMatches: /matches: 2\b/.test(await readOutputText(vault, "derive-long-log-eval", counted.outputId, "raw")),
    lineage: filtered.lineage.sourceOutputIds.includes(source.outputId),
  };

  return {
    id: "long-log-manual-inspection-vs-freeflow-derive",
    baseline: `${bytes(log)} raw log bytes for manual inspection`,
    freeflow: `${evidenceBytes(filtered)} filtered evidence bytes; countMatches=2; exact derived recovery`,
    gates,
  };
}

async function runProviderSummaryComparison(tmpRoot) {
  const cwd = join(tmpRoot, "provider-summary");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  await mkdir(join(cwd, ".freeflow"), { recursive: true });
  await writeFile(
    join(cwd, ".pi/mcp.json"),
    JSON.stringify({ mcpServers: { serena: { command: "serena", args: ["start-mcp-server"] } } }),
    "utf8",
  );
  const config = {
    defaultMode: "workflow",
    providers: {
      enabled: [{ id: "serena", mode: "discovery", categories: ["diagnostics"] }],
      manifests: [
        {
          id: "bad-custom",
          displayName: "Bad Custom",
          producerKind: "mcp",
          capabilities: [{ id: "bad", useWhen: "raw docs\n## RAW_BAD_MARKER", risk: "read" }],
        },
      ],
    },
  };
  await writeFile(join(cwd, ".freeflow/config.json"), JSON.stringify(config), "utf8");

  const summary = await providerRuntimeContext(cwd, config);
  const gates = {
    compactSummary: summary.split("\n").length <= 10,
    categoryScoped: summary.includes("read-only diagnostics") && !summary.includes("code-symbol discovery") && !summary.includes("real references"),
    invalidCustomNotInjected: summary.includes("Ignored custom manifests") && !summary.includes("RAW_BAD_MARKER"),
    mutationBoundaryPresent: summary.includes("mutating refactor tools directly only after explicit user intent"),
  };

  return {
    id: "provider-summary-tool-choice-accuracy",
    baseline: "Raw provider docs/manuals are not injected",
    freeflow: `${bytes(summary)} summary bytes; diagnostics category only; invalid custom guidance omitted`,
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

  return `# Output Router Capture/Derive/Provider Eval - Iteration 1

Date: ${DATE}

## Scope

Targeted deterministic eval for Slice 9 of the universal output capture/derive work. It compares direct/raw evidence shapes against explicit Freeflow routing for read-only provider capture, web-shaped capture, deterministic derive, and provider-summary tool choice.

This eval does not claim broad superiority. It verifies bounded evidence, exact recovery where promised, lineage, category-scoped provider summaries, and non-injection of invalid custom manifest text for these fixtures.

## Command

\`\`\`sh
npm run build && node plugins/freeflow/evals/scripts/run-output-router-capture-derive-eval.js
\`\`\`

## Summary

- Fixtures: ${results.length}
- Objective gates passed: ${passedGates}/${totalGates}
- Direct host-tool capture: not evaluated and remains off by default.
- Mutating provider tools: not mediated by \`freeflow_capture\`.

## Results

| fixture | direct/raw baseline | Freeflow routed behavior | status | gates |
| --- | --- | --- | --- | --- |
${rows}

## Result

All targeted Slice 9 capture/derive/provider-summary gates passed for these deterministic fixtures.
`;
}

async function main() {
  const tmpRoot = await mkdtemp(join(tmpdir(), "freeflow-capture-derive-eval-"));
  try {
    const vaultRoot = join(tmpRoot, "vault");
    const results = [
      await runProviderCaptureComparison(vaultRoot),
      await runWebShapedCaptureComparison(vaultRoot),
      await runDeriveComparison(vaultRoot),
      await runProviderSummaryComparison(tmpRoot),
    ];
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
