import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createVault, freeflowCapture, readOutputText, validateCaptureInput } from "../../dist/index.js";

const SERENA_SYMBOL_PRODUCER = { kind: "mcp", server: "serena", tool: "find_symbol" };

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-capture-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function fixtureAdapter({ text = "symbol Calculator\nfile src/calculator.ts", partial = false, readOnly = true, available = true } = {}) {
  return {
    producer: SERENA_SYMBOL_PRODUCER,
    readOnly,
    async isAvailable() {
      return available;
    },
    async capture(context) {
      assert.deepEqual(context.producer, SERENA_SYMBOL_PRODUCER);
      assert.deepEqual(context.args, { name_path_pattern: "Calculator" });
      return { text, partial };
    },
  };
}

test("validateCaptureInput accepts producer object and args", () => {
  const valid = validateCaptureInput({
    producer: SERENA_SYMBOL_PRODUCER,
    args: { name_path_pattern: "Calculator" },
    preserve: "important",
  });

  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value.producer, SERENA_SYMBOL_PRODUCER);
  assert.deepEqual(valid.value.args, { name_path_pattern: "Calculator" });

  const invalid = validateCaptureInput({ producer: { kind: "mcp", server: 42 }, preserve: "forever" });
  assert.equal(invalid.ok, false);
  const paths = invalid.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.producer\.server/);
  assert.match(paths, /\$\.preserve/);
});

test("freeflowCapture routes read-only fixture output with exact recovery", async () => {
  await withTempVault(async (vault) => {
    const result = await freeflowCapture({
      sessionId: "capture-session",
      vaultRoot: vault.root,
      producer: SERENA_SYMBOL_PRODUCER,
      args: { name_path_pattern: "Calculator" },
      adapters: [fixtureAdapter()],
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "capture");
    assert.equal(result.routing.status, "routed");
    assert.ok(result.outputId.startsWith("ffout_"));
    assert.ok(result.recordId.startsWith("ffrec_"));
    assert.deepEqual(result.producer, SERENA_SYMBOL_PRODUCER);
    assert.equal(result.persistence.recoverability, "exact");
    assert.equal(result.persistence.recoveryOutputId, result.outputId);
    assert.equal(result.recovery.outputId, result.outputId);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].source.stream, "raw");
    assert.match(result.evidence[0].excerpt, /Calculator/);
    assert.equal(await readOutputText(vault, "capture-session", result.outputId, "raw"), "symbol Calculator\nfile src/calculator.ts");
  });
});

test("freeflowCapture routes large fixture output without dumping raw content", async () => {
  await withTempVault(async (vault) => {
    const text = Array.from({ length: 20 }, (_, index) => `symbol line ${index + 1}`).join("\n");
    const result = await freeflowCapture({
      sessionId: "capture-large-session",
      vaultRoot: vault.root,
      producer: SERENA_SYMBOL_PRODUCER,
      args: { name_path_pattern: "Calculator" },
      adapters: [fixtureAdapter({ text })],
      thresholds: { largeOutputLines: 5, largeOutputBytes: 200 },
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.persistence.recoverability, "exact");
    assert.ok(result.evidence[0].excerpt.includes("symbol line 1"));
    assert.ok(!result.evidence[0].excerpt.includes("symbol line 20"));
    assert.match(result.routing.reason, /bounded evidence/);
    assert.equal(await readOutputText(vault, "capture-large-session", result.outputId, "raw"), text);
  });
});

test("freeflowCapture returns structured failures for unsupported, mutating, and unavailable producers", async () => {
  const unsupported = await freeflowCapture({
    sessionId: "capture-unsupported-session",
    producer: { kind: "mcp", server: "unknown", tool: "find_symbol" },
    args: { name_path_pattern: "Calculator" },
    adapters: [fixtureAdapter()],
  });
  assert.equal(unsupported.toolStatus, "ok");
  assert.equal(unsupported.routing.route, "capture");
  assert.equal(unsupported.failure.kind, "unsupported_producer");
  assert.equal(unsupported.producerExecution.status, "unsupported");
  assert.equal(unsupported.persistence.recoverability, "none");

  const mutating = await freeflowCapture({
    sessionId: "capture-mutating-session",
    producer: SERENA_SYMBOL_PRODUCER,
    args: { name_path_pattern: "Calculator" },
    adapters: [fixtureAdapter({ readOnly: false })],
  });
  assert.equal(mutating.failure.kind, "mutating_producer_rejected");
  assert.equal(mutating.producerExecution.status, "rejected");
  assert.match(mutating.recovery.how, /Recovery is unavailable/i);

  const unavailable = await freeflowCapture({
    sessionId: "capture-unavailable-session",
    producer: SERENA_SYMBOL_PRODUCER,
    args: { name_path_pattern: "Calculator" },
    adapters: [fixtureAdapter({ available: false })],
  });
  assert.equal(unavailable.failure.kind, "adapter_unavailable");
  assert.equal(unavailable.producerExecution.status, "unavailable");
  assert.match(unavailable.recovery.how, /Recovery is unavailable/i);
});

test("freeflowCapture turns partial fixture output into a recoverable partial-capture failure", async () => {
  await withTempVault(async (vault) => {
    const result = await freeflowCapture({
      sessionId: "capture-partial-session",
      vaultRoot: vault.root,
      producer: SERENA_SYMBOL_PRODUCER,
      args: { name_path_pattern: "Calculator" },
      adapters: [fixtureAdapter({ text: "partial symbol evidence", partial: true })],
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.failure.kind, "partial_capture");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.producerExecution.status, "partial");
    assert.equal(result.persistence.recoverability, "exact");
    assert.equal(result.recovery.outputId, result.outputId);
    assert.equal(await readOutputText(vault, "capture-partial-session", result.outputId, "raw"), "partial symbol evidence");
  });
});
