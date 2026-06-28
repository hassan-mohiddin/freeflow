import assert from "node:assert/strict";
import test from "node:test";

import {
  scriptTransformDisabledFailure,
  storageFailure,
  transformAdapterUnavailableFailure,
  transformExecutionFailure,
  transformSourceUnavailableFailure,
  transformValidationFailure,
  validateRoutedResult,
} from "../../dist/index.js";

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

test("transform failure helpers return structured no-recovery results", () => {
  const cases = [
    [
      scriptTransformDisabledFailure({
        message: "Script transform is disabled.",
        lineage: { sourceOutputIds: ["ffout_script"], operation: "script" },
      }),
      "script_transform_disabled",
      "unavailable",
    ],
    [
      transformAdapterUnavailableFailure({
        message: "No proof-backed adapter is available.",
        lineage: { sourceOutputIds: ["ffout_script"], operation: "script" },
      }),
      "adapter_unavailable",
      "unavailable",
    ],
    [
      transformSourceUnavailableFailure({
        message: "Source output was not found in the vault.",
        lineage: { sourceOutputIds: ["ffout_missing"], operation: "regexFilter" },
      }),
      "transform_source_unavailable",
      "unavailable",
    ],
    [
      transformValidationFailure({
        message: "JSON pointer operation requires valid JSON input.",
        lineage: { sourceOutputIds: ["ffout_json"], operation: "jsonPointer" },
      }),
      "transform_validation_failure",
      "rejected",
    ],
    [
      transformExecutionFailure({
        message: "Regex filter exceeded deterministic match cap.",
        lineage: { sourceOutputIds: ["ffout_log"], operation: "regexFilter" },
      }),
      "transform_execution_failure",
      "failed",
    ],
  ];

  for (const [result, failureKind, executionStatus] of cases) {
    assertValidFailureResult(result);
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "transform");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.failure.kind, failureKind);
    assert.equal(result.transformExecution.status, executionStatus);
    assert.equal(result.transformExecution.failureKind, failureKind);
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.persistence.recoverability, "none");
    assert.match(result.recovery.how, /Recovery is unavailable/i);
  }
});

test("transform failure helper downgrades exact recovery when no recovery id exists", () => {
  const result = transformExecutionFailure({
    message: "Transformed output existed but was not persisted.",
    persistence: { status: "vaulted", recoverability: "exact" },
  });

  assertValidFailureResult(result);
  assert.equal(result.persistence.status, "not_persisted");
  assert.equal(result.persistence.recoverability, "none");
  assert.equal(result.recovery.outputId, undefined);
  assert.match(result.recovery.how, /Recovery is unavailable/i);
});

test("storage failure separates tool status from transform execution", () => {
  const result = storageFailure({
    message: "Vault write failed after transform produced output.",
    lineage: { sourceOutputIds: ["ffout_source"], operation: "regexFilter" },
  });

  assertValidFailureResult(result);
  assert.equal(result.toolStatus, "error");
  assert.equal(result.routing.route, "transform");
  assert.equal(result.routing.status, "failed");
  assert.equal(result.persistence.status, "not_persisted");
  assert.equal(result.persistence.recoverability, "none");
  assert.equal(result.transformExecution.status, "failed");
  assert.match(result.recovery.how, /Recovery is unavailable/i);
});
