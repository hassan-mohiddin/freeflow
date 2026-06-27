import assert from "node:assert/strict";
import test from "node:test";

import {
  adapterUnavailableFailure,
  deriveExecutionFailure,
  deriveSourceUnavailableFailure,
  deriveValidationFailure,
  mutatingProducerRejectedFailure,
  partialCaptureFailure,
  producerExecutionFailure,
  redactionFailure,
  storageFailure,
  unsupportedProducerFailure,
  validateRoutedResult,
} from "../../dist/index.js";

const SERENA_READ_PRODUCER = { kind: "mcp", server: "serena", tool: "find_symbol" };

function assertValidFailureResult(result) {
  const validation = validateRoutedResult(result);
  assert.equal(validation.ok, true, validation.ok ? "" : JSON.stringify(validation.issues, null, 2));
  assert.ok(!Object.hasOwn(result, "status"));
  assert.ok(result.failure?.kind);
  assert.ok(result.failure?.message);
  assert.ok(result.persistence?.status);
  assert.ok(result.persistence?.recoverability);
  assert.ok(result.routing?.status);
  assert.ok(result.toolStatus === "ok" || result.toolStatus === "error");
}

test("capture failure helpers return structured no-recovery results", () => {
  const cases = [
    [
      adapterUnavailableFailure({
        message: "MCP bridge is unavailable.",
        producer: SERENA_READ_PRODUCER,
      }),
      "adapter_unavailable",
      "unavailable",
    ],
    [
      unsupportedProducerFailure({
        message: "Producer kind is not supported by this host adapter.",
        producer: { kind: "provider", name: "unknown" },
      }),
      "unsupported_producer",
      "unsupported",
    ],
    [
      mutatingProducerRejectedFailure({
        message: "rename_symbol is mutating and must not go through freeflow_capture.",
        producer: { kind: "mcp", server: "serena", tool: "rename_symbol" },
      }),
      "mutating_producer_rejected",
      "rejected",
    ],
    [
      producerExecutionFailure({
        message: "Serena read-only symbol query failed.",
        producer: SERENA_READ_PRODUCER,
      }),
      "producer_execution_failure",
      "failed",
    ],
  ];

  for (const [result, failureKind, executionStatus] of cases) {
    assertValidFailureResult(result);
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "capture");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.failure.kind, failureKind);
    assert.equal(result.producerExecution.status, executionStatus);
    assert.equal(result.producerExecution.failureKind, failureKind);
    assert.equal(result.deriveExecution, undefined);
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.persistence.recoverability, "none");
    assert.match(result.recovery.how, /Recovery is unavailable/i);
  }
});

test("partial capture failure preserves bounded evidence and exact recovery when persisted", () => {
  const result = partialCaptureFailure({
    message: "Provider returned a partial page before timing out.",
    producer: SERENA_READ_PRODUCER,
    recordId: "ffrec_partial",
    outputId: "ffout_partial",
    persistence: {
      status: "vaulted",
      recoverability: "exact",
      recoveryOutputId: "ffout_partial",
      outputId: "ffout_partial",
    },
    evidence: [
      {
        id: "ev_partial",
        source: { kind: "vault", outputId: "ffout_partial", stream: "raw" },
        path: "ffout_partial:raw",
        lines: "1-2",
        excerpt: "partial evidence",
        why: "Partial capture was persisted before timeout.",
        window: "small",
        expandable: true,
      },
    ],
  });

  assertValidFailureResult(result);
  assert.equal(result.toolStatus, "ok");
  assert.equal(result.routing.route, "capture");
  assert.equal(result.routing.status, "partial");
  assert.equal(result.failure.kind, "partial_capture");
  assert.equal(result.producerExecution.status, "partial");
  assert.equal(result.recordId, "ffrec_partial");
  assert.equal(result.outputId, "ffout_partial");
  assert.equal(result.persistence.recoverability, "exact");
  assert.equal(result.recovery.outputId, "ffout_partial");
  assert.match(result.recovery.how, /recover exact captured content/);
  assert.equal(result.evidence[0].id, "ev_partial");
});

test("failure helper downgrades exact recovery when no recovery id exists", () => {
  const result = partialCaptureFailure({
    message: "Partial output existed but was not persisted.",
    producer: SERENA_READ_PRODUCER,
    persistence: { status: "vaulted", recoverability: "exact" },
  });

  assertValidFailureResult(result);
  assert.equal(result.persistence.status, "not_persisted");
  assert.equal(result.persistence.recoverability, "none");
  assert.equal(result.recovery.outputId, undefined);
  assert.match(result.recovery.how, /Recovery is unavailable/i);
});

test("storage and redaction failures separate tool status from producer execution", () => {
  const stored = storageFailure({
    message: "Vault write failed after producer returned output.",
    operation: "capture",
    producer: SERENA_READ_PRODUCER,
  });
  const redacted = redactionFailure({
    message: "Redaction policy failed closed before persistence.",
    operation: "derive",
    lineage: { sourceOutputIds: ["ffout_source"], operation: "regexFilter" },
  });

  for (const result of [stored, redacted]) {
    assertValidFailureResult(result);
    assert.equal(result.toolStatus, "error");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.persistence.recoverability, "none");
    assert.match(result.recovery.how, /Recovery is unavailable/i);
  }

  assert.equal(stored.routing.route, "capture");
  assert.equal(stored.producerExecution.status, "failed");
  assert.equal(stored.deriveExecution, undefined);
  assert.equal(redacted.routing.route, "derive");
  assert.equal(redacted.deriveExecution.status, "failed");
  assert.equal(redacted.producerExecution, undefined);
});

test("derive failure helpers return structured no-recovery results", () => {
  const cases = [
    [
      deriveSourceUnavailableFailure({
        message: "Source output was not found in the vault.",
        lineage: { sourceOutputIds: ["ffout_missing"], operation: "regexFilter" },
      }),
      "derive_source_unavailable",
      "unavailable",
    ],
    [
      deriveValidationFailure({
        message: "JSON pointer operation requires valid JSON input.",
        lineage: { sourceOutputIds: ["ffout_json"], operation: "jsonPointer" },
      }),
      "derive_validation_failure",
      "rejected",
    ],
    [
      deriveExecutionFailure({
        message: "Regex filter exceeded deterministic match cap.",
        lineage: { sourceOutputIds: ["ffout_log"], operation: "regexFilter" },
      }),
      "derive_execution_failure",
      "failed",
    ],
  ];

  for (const [result, failureKind, executionStatus] of cases) {
    assertValidFailureResult(result);
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "derive");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.failure.kind, failureKind);
    assert.equal(result.deriveExecution.status, executionStatus);
    assert.equal(result.deriveExecution.failureKind, failureKind);
    assert.equal(result.producerExecution, undefined);
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.persistence.recoverability, "none");
    assert.match(result.recovery.how, /Recovery is unavailable/i);
  }
});
