import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVault,
  freeflowDerive,
  readOutputText,
  storeCommandOutput,
  validateDeriveInput,
  validateRoutedResult,
} from "../dist/index.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-derive-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("validateDeriveInput accepts vault regex filter and count operations", () => {
  const regexFilter = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stderr" },
    operation: { kind: "regexFilter", pattern: "FAIL|ERROR", flags: "i", contextLines: 2, maxMatches: 10 },
    preserve: "important",
  });

  assert.equal(regexFilter.ok, true);
  assert.deepEqual(regexFilter.value.operation, {
    kind: "regexFilter",
    pattern: "FAIL|ERROR",
    flags: "i",
    contextLines: 2,
    maxMatches: 10,
  });

  const countMatches = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source" },
    operation: { kind: "countMatches", pattern: "warning", flags: "im" },
  });

  assert.equal(countMatches.ok, true);

  const invalid = validateDeriveInput({
    source: { kind: "repo", path: "notes.md" },
    operation: { kind: "regexFilter", pattern: "", flags: "y", contextLines: -1, maxMatches: 0 },
    preserve: "forever",
  });

  assert.equal(invalid.ok, false);
  const paths = invalid.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.source\.kind/);
  assert.match(paths, /\$\.operation\.pattern/);
  assert.match(paths, /\$\.operation\.flags/);
  assert.match(paths, /\$\.operation\.contextLines/);
  assert.match(paths, /\$\.operation\.maxMatches/);
  assert.match(paths, /\$\.preserve/);
});

test("validateDeriveInput accepts JSON extract pointer and path operations", () => {
  const pointer = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "jsonExtract", pointer: "/suite/failures/0/message" },
  });

  assert.equal(pointer.ok, true);
  assert.deepEqual(pointer.value.operation, { kind: "jsonExtract", pointer: "/suite/failures/0/message" });

  const path = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "jsonExtract", path: "$.suite.stats.failed" },
  });

  assert.equal(path.ok, true);

  const invalid = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "jsonExtract", pointer: "suite", path: "suite.stats" },
  });

  assert.equal(invalid.ok, false);
  const paths = invalid.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.operation/);
  assert.match(paths, /\$\.operation\.pointer/);
  assert.match(paths, /\$\.operation\.path/);
});

test("freeflowDerive regexFilter routes vaulted derived output with source lineage", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-regex-session",
      command: "npm test",
      stdout: "214 passing",
      stderr: [
        "setup line",
        "FAIL first target test",
        "first stack line",
        "separator",
        "pre second failure",
        "ERROR second target test",
        "second stack line",
      ].join("\n"),
      executionStatus: "failed",
      exitCode: 1,
      decisionIds: ["ffdec_source"],
      createdAt: "2026-06-22T00:00:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-regex-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stderr" },
      operation: { kind: "regexFilter", pattern: "FAIL|ERROR", contextLines: 1, maxMatches: 10 },
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "derive");
    assert.equal(result.routing.status, "routed");
    assert.equal(result.producer.kind, "derive");
    assert.equal(result.producer.name, "regexFilter");
    assert.equal(result.source.outputId, source.outputId);
    assert.equal(result.persistence.recoverability, "exact");
    assert.equal(result.persistence.recoveryOutputId, result.outputId);
    assert.equal(result.recovery.outputId, result.outputId);
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    assert.deepEqual(result.lineage.sourceRecordIds, [source.recordId]);
    assert.equal(result.lineage.operation, "regexFilter");
    assert.match(result.lineage.operationHash, /^sha256_[0-9a-f]{64}$/);
    assert.equal(result.evidence[0].source.outputId, result.outputId);
    assert.equal(result.evidence[0].source.stream, "raw");
    assert.match(result.evidence[0].why, new RegExp(source.outputId));
    assert.deepEqual(validateRoutedResult(result), { ok: true, value: result });

    const raw = await readOutputText(vault, "derive-regex-session", result.outputId, "raw");
    assert.match(raw, /# freeflow_derive regexFilter/);
    assert.match(raw, /source: .*:stderr/);
    assert.match(raw, /matches: 2/);
    assert.match(raw, /matchedLines: 2/);
    assert.match(raw, /@@ source lines 1-3 @@/);
    assert.match(raw, /2\| FAIL first target test/);
    assert.match(raw, /@@ source lines 5-7 @@/);
    assert.match(raw, /6\| ERROR second target test/);
  });
});

test("freeflowDerive countMatches stores exact derived counts", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-count-session",
      command: "node lint.js",
      stdout: ["FAIL once", "ok", "FAIL twice FAIL third"].join("\n"),
      stderr: "",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-22T00:01:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-count-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "countMatches", pattern: "FAIL" },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.summary, "Derived countMatches from vaulted stdout output: 3 match(es) across 2 line(s).");
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    assert.equal(result.lineage.operation, "countMatches");

    const raw = await readOutputText(vault, "derive-count-session", result.outputId, "raw");
    assert.match(raw, /# freeflow_derive countMatches/);
    assert.match(raw, /matches: 3/);
    assert.match(raw, /matchedLines: 2/);
  });
});

test("freeflowDerive routes huge derived output with bounded evidence and exact recovery", async () => {
  await withTempVault(async (vault) => {
    const text = Array.from({ length: 40 }, (_, index) => `FAIL derived output line ${index + 1}`).join("\n");
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-large-session",
      command: "npm test",
      stdout: text,
      stderr: "",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-22T00:02:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-large-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "regexFilter", pattern: "FAIL", contextLines: 0, maxMatches: 40 },
      thresholds: { largeOutputLines: 8, largeOutputBytes: 240 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "partial");
    assert.match(result.routing.reason, /bounded evidence/);
    assert.equal(result.persistence.recoverability, "exact");
    assert.ok(Buffer.byteLength(result.evidence[0].excerpt, "utf8") <= 240);

    const raw = await readOutputText(vault, "derive-large-session", result.outputId, "raw");
    assert.match(raw, /FAIL derived output line 40/);
    assert.doesNotMatch(result.evidence[0].excerpt, /FAIL derived output line 40/);
  });
});

test("freeflowDerive jsonExtract supports JSON pointer and path selectors", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-json-session",
      command: "node report.js",
      stdout: JSON.stringify({
        suite: {
          failures: [{ message: "expected true to equal false", file: "tests/example.test.js" }],
          stats: { failed: 1, passed: 12 },
        },
      }),
      stderr: "",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-22T00:03:00.000Z",
    });

    const pointer = await freeflowDerive({
      sessionId: "derive-json-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "jsonExtract", pointer: "/suite/failures/0/message" },
    });

    assert.equal(pointer.toolStatus, "ok");
    assert.equal(pointer.producer.name, "jsonExtract");
    assert.equal(pointer.lineage.operation, "jsonExtract");
    assert.deepEqual(pointer.lineage.sourceOutputIds, [source.outputId]);
    assert.equal(pointer.persistence.recoverability, "exact");
    assert.deepEqual(validateRoutedResult(pointer), { ok: true, value: pointer });
    const pointerRaw = await readOutputText(vault, "derive-json-session", pointer.outputId, "raw");
    assert.match(pointerRaw, /# freeflow_derive jsonExtract/);
    assert.match(pointerRaw, /selectorKind: pointer/);
    assert.match(pointerRaw, /selector: \/suite\/failures\/0\/message/);
    assert.match(pointerRaw, /valueType: string/);
    assert.match(pointerRaw, /"expected true to equal false"/);

    const path = await freeflowDerive({
      sessionId: "derive-json-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "jsonExtract", path: "$.suite.stats.failed" },
    });

    assert.equal(path.toolStatus, "ok");
    assert.equal(path.summary, "Derived jsonExtract from vaulted stdout output using path $.suite.stats.failed.");
    const pathRaw = await readOutputText(vault, "derive-json-session", path.outputId, "raw");
    assert.match(pathRaw, /selectorKind: path/);
    assert.match(pathRaw, /valueType: number/);
    assert.match(pathRaw, /\n1\n/);
  });
});

test("freeflowDerive returns structured failures for invalid JSON and unresolved JSON selectors", async () => {
  await withTempVault(async (vault) => {
    const badJson = await storeCommandOutput(vault, {
      sessionId: "derive-json-failure-session",
      command: "node report.js",
      stdout: "{ not-json",
      stderr: "",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-22T00:04:00.000Z",
    });

    const parseFailure = await freeflowDerive({
      sessionId: "derive-json-failure-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: badJson.outputId, stream: "stdout" },
      operation: { kind: "jsonExtract", pointer: "/suite" },
    });

    assert.equal(parseFailure.failure.kind, "derive_execution_failure");
    assert.equal(parseFailure.deriveExecution.status, "failed");
    assert.match(parseFailure.failure.message, /Invalid JSON source/);
    assert.deepEqual(parseFailure.lineage.sourceOutputIds, [badJson.outputId]);

    const goodJson = await storeCommandOutput(vault, {
      sessionId: "derive-json-failure-session",
      command: "node report.js",
      stdout: JSON.stringify({ suite: { stats: { passed: 1 } } }),
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-22T00:05:00.000Z",
    });

    const pathFailure = await freeflowDerive({
      sessionId: "derive-json-failure-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: goodJson.outputId, stream: "stdout" },
      operation: { kind: "jsonExtract", path: "$.suite.stats.failed" },
    });

    assert.equal(pathFailure.failure.kind, "derive_execution_failure");
    assert.equal(pathFailure.deriveExecution.status, "failed");
    assert.match(pathFailure.failure.message, /did not resolve/);
    assert.deepEqual(pathFailure.lineage.sourceOutputIds, [goodJson.outputId]);

    const invalidPath = await freeflowDerive({
      sessionId: "derive-json-failure-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: goodJson.outputId, stream: "stdout" },
      operation: { kind: "jsonExtract", path: "suite.stats" },
    });

    assert.equal(invalidPath.failure.kind, "derive_validation_failure");
    assert.equal(invalidPath.deriveExecution.status, "rejected");
    assert.match(invalidPath.failure.message, /Invalid JSON path/);
  });
});

test("freeflowDerive returns structured failures for missing source and invalid regex", async () => {
  await withTempVault(async (vault) => {
    const missing = await freeflowDerive({
      sessionId: "derive-missing-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: "ffout_missing", stream: "combined" },
      operation: { kind: "regexFilter", pattern: "FAIL" },
    });

    assert.equal(missing.toolStatus, "ok");
    assert.equal(missing.routing.route, "derive");
    assert.equal(missing.failure.kind, "derive_source_unavailable");
    assert.equal(missing.deriveExecution.status, "unavailable");
    assert.deepEqual(missing.lineage.sourceOutputIds, ["ffout_missing"]);
    assert.equal(missing.persistence.recoverability, "none");

    const invalid = await freeflowDerive({
      sessionId: "derive-invalid-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: "ffout_missing", stream: "combined" },
      operation: { kind: "countMatches", pattern: "(" },
    });

    assert.equal(invalid.failure.kind, "derive_validation_failure");
    assert.equal(invalid.deriveExecution.status, "rejected");
    assert.match(invalid.failure.message, /Invalid regex pattern/);
  });
});
