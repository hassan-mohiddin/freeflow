import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVault,
  discoverEryxPythonSandboxAdaptersFromEnv,
  freeflowDerive,
  readOutputText,
  SCRIPT_SANDBOX_REQUIRED_PROOFS,
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

const HAS_JSPI = process.execArgv.includes("--experimental-wasm-jspi") || (process.env.NODE_OPTIONS ?? "").split(/\s+/).includes("--experimental-wasm-jspi");
const ERYX_INTEGRATION_SKIP_REASON = process.env.FREEFLOW_ERYX_ROOT
  ? (HAS_JSPI ? false : "FREEFLOW_ERYX_ROOT is set but Node was not started with --experimental-wasm-jspi")
  : "FREEFLOW_ERYX_ROOT is not set";

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

test("validateDeriveInput accepts group, dedupe, and topN operations", () => {
  const group = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "groupByRegex", pattern: "^([^:]+):", group: 1, maxGroups: 10, maxLinesPerGroup: 3 },
  });

  assert.equal(group.ok, true);

  const dedupe = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "dedupe", trim: true, caseSensitive: false, maxLines: 50 },
  });

  assert.equal(dedupe.ok, true);

  const topN = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "topN", pattern: "duration=(\\d+)", group: 1, sort: "numeric", order: "desc", limit: 2 },
  });

  assert.equal(topN.ok, true);

  const invalid = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "topN", group: 0, sort: "date", order: "sideways", limit: 0 },
  });

  assert.equal(invalid.ok, false);
  const paths = invalid.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.operation\.group/);
  assert.match(paths, /\$\.operation\.sort/);
  assert.match(paths, /\$\.operation\.order/);
  assert.match(paths, /\$\.operation\.limit/);
});

test("validateDeriveInput accepts URL, citation, and stats operations", () => {
  const urls = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "extractUrls", dedupe: true, maxMatches: 25 },
  });

  assert.equal(urls.ok, true);

  const citations = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "extractCitations", maxMatches: 10 },
  });

  assert.equal(citations.ok, true);

  assert.equal(validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "lineStats" },
  }).ok, true);

  assert.equal(validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "sizeStats" },
  }).ok, true);

  const invalid = validateDeriveInput({
    source: { kind: "vault", outputId: "ffout_source", stream: "stdout" },
    operation: { kind: "extractUrls", dedupe: "yes", maxMatches: 0, pattern: "https" },
  });

  assert.equal(invalid.ok, false);
  const paths = invalid.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.operation\.dedupe/);
  assert.match(paths, /\$\.operation\.maxMatches/);
  assert.match(paths, /\$\.operation\.pattern/);
});

test("validateDeriveInput accepts script operation shape and rejects unsafe script inputs", () => {
  const valid = validateDeriveInput({
    sources: [{ kind: "vault", outputId: "ffout_source", stream: "combined", alias: "test_log" }],
    operation: { kind: "script", language: "python", code: "write_json({'ok': True})", label: "count failures" },
    limits: { timeoutMs: 1000, maxInputBytes: 2048, maxOutputBytes: 4096 },
    preserve: "important",
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.value.operation.kind, "script");
  assert.deepEqual(valid.value.sources, [{ kind: "vault", outputId: "ffout_source", stream: "combined", alias: "test_log" }]);

  const invalid = validateDeriveInput({
    sources: [
      { kind: "vault", outputId: "", alias: "1bad" },
      { kind: "vault", outputId: "ffout_source", alias: "1bad" },
    ],
    operation: { kind: "script", language: "ruby", code: "", pattern: "not allowed" },
    limits: { timeoutMs: 0, maxInputBytes: 99_999_999, maxOutputBytes: "huge" },
  });

  assert.equal(invalid.ok, false);
  const issues = invalid.issues.map((issue) => `${issue.path} ${issue.message}`).join("\n");
  assert.match(issues, /\$\.sources\[0\]\.outputId/);
  assert.match(issues, /\$\.sources\[0\]\.alias/);
  assert.match(issues, /\$\.operation\.language/);
  assert.match(issues, /\$\.operation\.code/);
  assert.match(issues, /\$\.limits\.timeoutMs/);
  assert.match(issues, /\$\.limits\.maxInputBytes/);
  assert.match(issues, /\$\.limits\.maxOutputBytes/);
});

test("freeflowDerive script operation is disabled by default and does not persist raw code", async () => {
  await withTempVault(async (vault) => {
    const result = await freeflowDerive({
      sessionId: "script-disabled-session",
      vaultRoot: vault.root,
      sources: [{ kind: "vault", outputId: "ffout_missing", alias: "missing" }],
      operation: { kind: "script", language: "python", code: "print('RAW_SCRIPT_SENTINEL')" },
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.failure.kind, "script_derive_disabled");
    assert.equal(result.deriveExecution.status, "unavailable");
    assert.equal(result.persistence.recoverability, "none");
    assert.equal(result.outputId, undefined);
    assert.equal(result.lineage.operation, "script:python");
    assert.match(result.lineage.operationHash, /^sha256_[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_SCRIPT_SENTINEL/);
  });
});

test("freeflowDerive script operation resolves sources but returns adapter unavailable without executing code", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "script-adapter-session",
      command: "printf log",
      stdout: "SCRIPT_SOURCE_TARGET",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:00:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "script-adapter-session",
      vaultRoot: vault.root,
      scriptDerive: {
        enabled: true,
        sandbox: "auto",
        languages: ["python"],
        network: "off",
        limits: { timeoutMs: 1000, maxInputBytes: 1024, maxOutputBytes: 4096 },
        rawScriptPersistence: "disabled",
      },
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "python", code: "print('RAW_SCRIPT_SENTINEL')" },
      limits: { maxInputBytes: 1024 },
    });

    assert.equal(result.failure.kind, "adapter_unavailable");
    assert.equal(result.deriveExecution.status, "unavailable");
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    assert.deepEqual(result.lineage.sourceRecordIds, [source.recordId]);
    assert.equal(result.lineage.operation, "script:python");
    assert.doesNotMatch(JSON.stringify(result), /RAW_SCRIPT_SENTINEL/);
  });
});

test("freeflowDerive script operation executes through a registered proof-backed adapter", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "script-execute-session",
      command: "printf log",
      stdout: "SCRIPT_SOURCE_TARGET",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    const adapter = {
      id: "fake-js-executor",
      version: "test",
      languages: ["javascript"],
      async probe() {
        return {
          status: "available",
          reason: "fake adapter passed every required proof",
          passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          failedProofs: [],
          runtime: { name: "fake-js", version: "test" },
        };
      },
      async execute(request) {
        assert.equal(request.language, "javascript");
        assert.equal(request.network, "off");
        assert.equal(request.sources.length, 1);
        assert.equal(request.sources[0].alias, "log");
        const sourceText = await readFile(request.sources[0].path, "utf8");
        return {
          status: "success",
          stdout: `DERIVED:${sourceText}`,
          stderr: "",
          outputFiles: [],
          exitCode: 0,
          durationMs: 1,
        };
      },
    };

    const result = await freeflowDerive({
      sessionId: "script-execute-session",
      vaultRoot: vault.root,
      scriptDerive: {
        enabled: true,
        sandbox: "auto",
        languages: ["javascript"],
        network: "off",
        limits: { timeoutMs: 1000, maxInputBytes: 1024, maxOutputBytes: 4096 },
        rawScriptPersistence: "disabled",
      },
      scriptSandboxAdapters: [adapter],
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "javascript", code: "writeText(readText('log')); // RAW_SCRIPT_SENTINEL" },
      limits: { maxInputBytes: 1024, maxOutputBytes: 4096 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.outputId.startsWith("ffout_"), true);
    assert.equal(result.operation.kind, "script");
    assert.equal(result.operation.language, "javascript");
    assert.match(result.operation.codeSha256, /^sha256_[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_SCRIPT_SENTINEL/);
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    assert.deepEqual(result.lineage.sourceRecordIds, [source.recordId]);
    const derived = await readOutputText(vault, "script-execute-session", result.outputId, "raw");
    assert.equal(derived, "DERIVED:SCRIPT_SOURCE_TARGET");
    validateRoutedResult(result);
  });
});

test("freeflowDerive script operation executes jq through a registered proof-backed adapter", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "script-jq-execute-session",
      command: "printf log",
      stdout: "SCRIPT_SOURCE_TARGET",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    const adapter = {
      id: "fake-jq-executor",
      version: "test",
      languages: ["jq"],
      async probe() {
        return {
          status: "available",
          reason: "fake jq adapter passed every required proof",
          passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          failedProofs: [],
          runtime: { name: "fake-jq", version: "test" },
        };
      },
      async execute(request) {
        assert.equal(request.language, "jq");
        assert.equal(request.network, "off");
        assert.equal(request.sources.length, 1);
        assert.equal(request.sources[0].alias, "log");
        assert.match(request.code, /RAW_JQ_SCRIPT_SENTINEL/);
        const sourceText = await readFile(request.sources[0].path, "utf8");
        return {
          status: "success",
          stdout: `JQ:${sourceText}`,
          stderr: "",
          outputFiles: [],
          exitCode: 0,
          durationMs: 1,
        };
      },
    };

    const result = await freeflowDerive({
      sessionId: "script-jq-execute-session",
      vaultRoot: vault.root,
      scriptDerive: {
        enabled: true,
        sandbox: "auto",
        languages: ["jq"],
        network: "off",
        limits: { timeoutMs: 1000, maxInputBytes: 1024, maxOutputBytes: 4096 },
        rawScriptPersistence: "disabled",
      },
      scriptSandboxAdapters: [adapter],
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "jq", code: '.log # RAW_JQ_SCRIPT_SENTINEL' },
      limits: { maxInputBytes: 1024, maxOutputBytes: 4096 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.outputId.startsWith("ffout_"), true);
    assert.equal(result.operation.kind, "script");
    assert.equal(result.operation.language, "jq");
    assert.match(result.operation.codeSha256, /^sha256_[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_JQ_SCRIPT_SENTINEL/);
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    assert.deepEqual(result.lineage.sourceRecordIds, [source.recordId]);
    const derived = await readOutputText(vault, "script-jq-execute-session", result.outputId, "raw");
    assert.equal(derived, "JQ:SCRIPT_SOURCE_TARGET");
    validateRoutedResult(result);
  });
});

test("freeflowDerive script operation executes Python through discovered Eryx adapter when configured", { skip: ERYX_INTEGRATION_SKIP_REASON }, async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "script-eryx-execute-session",
      command: "printf log",
      stdout: "alpha",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    const adapters = await discoverEryxPythonSandboxAdaptersFromEnv({ FREEFLOW_ERYX_ROOT: process.env.FREEFLOW_ERYX_ROOT });

    const result = await freeflowDerive({
      sessionId: "script-eryx-execute-session",
      vaultRoot: vault.root,
      scriptDerive: {
        enabled: true,
        sandbox: "auto",
        languages: ["python"],
        network: "off",
        limits: { timeoutMs: 1000, maxInputBytes: 1024, maxOutputBytes: 4096 },
        rawScriptPersistence: "disabled",
      },
      scriptSandboxAdapters: adapters,
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "python", code: "write_text(read_text('log').upper())\n# RAW_PYTHON_SCRIPT_SENTINEL" },
      limits: { timeoutMs: 1000, maxInputBytes: 1024, maxOutputBytes: 4096 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.operation.kind, "script");
    assert.equal(result.operation.language, "python");
    assert.match(result.operation.codeSha256, /^sha256_[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(result), /RAW_PYTHON_SCRIPT_SENTINEL/);
    const derived = await readOutputText(vault, "script-eryx-execute-session", result.outputId, "raw");
    assert.equal(derived, "ALPHA");
    validateRoutedResult(result);
  });
});

test("freeflowDerive script operation returns structured failure for adapter execution failures", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "script-failure-session",
      command: "printf log",
      stdout: "SCRIPT_SOURCE_TARGET",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    const adapter = {
      id: "fake-js-timeout",
      version: "test",
      languages: ["javascript"],
      async probe() {
        return {
          status: "available",
          reason: "fake adapter passed every required proof",
          passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          failedProofs: [],
        };
      },
      async execute() {
        return {
          status: "timed_out",
          stdout: "partial output",
          stderr: "",
          outputFiles: [],
          exitCode: null,
          durationMs: 1000,
          reason: "test timeout",
        };
      },
    };

    const result = await freeflowDerive({
      sessionId: "script-failure-session",
      vaultRoot: vault.root,
      scriptDerive: {
        enabled: true,
        sandbox: "auto",
        languages: ["javascript"],
        network: "off",
        limits: { timeoutMs: 1000, maxInputBytes: 1024, maxOutputBytes: 4096 },
        rawScriptPersistence: "disabled",
      },
      scriptSandboxAdapters: [adapter],
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "javascript", code: "while (true) {}" },
    });

    assert.equal(result.failure.kind, "derive_execution_failure");
    assert.equal(result.deriveExecution.status, "failed");
    assert.equal(result.persistence.recoverability, "none");
    assert.equal(result.outputId, undefined);
    assert.match(result.failure.message, /timed_out/);
    validateRoutedResult(result);
  });
});

test("freeflowDerive script operation does not persist output-limit failures as exact results", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "script-output-cap-session",
      command: "printf log",
      stdout: "SCRIPT_SOURCE_TARGET",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    const adapter = {
      id: "fake-js-output-cap",
      version: "test",
      languages: ["javascript"],
      async probe() {
        return {
          status: "available",
          reason: "fake adapter passed every required proof",
          passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
          failedProofs: [],
        };
      },
      async execute() {
        return {
          status: "failed",
          stdout: "xxxxxxxxxx",
          stderr: "",
          outputFiles: [],
          exitCode: null,
          durationMs: 1,
          reason: "QuickJS execution exceeded maxOutputBytes.",
        };
      },
    };

    const result = await freeflowDerive({
      sessionId: "script-output-cap-session",
      vaultRoot: vault.root,
      scriptDerive: {
        enabled: true,
        sandbox: "auto",
        languages: ["javascript"],
        network: "off",
        limits: { timeoutMs: 1000, maxInputBytes: 1024, maxOutputBytes: 10 },
        rawScriptPersistence: "disabled",
      },
      scriptSandboxAdapters: [adapter],
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "javascript", code: "writeText('x'.repeat(100))" },
      limits: { maxOutputBytes: 10 },
    });

    assert.equal(result.failure.kind, "derive_execution_failure");
    assert.equal(result.deriveExecution.status, "failed");
    assert.equal(result.persistence.recoverability, "none");
    assert.equal(result.outputId, undefined);
    assert.match(result.failure.message, /exceeded maxOutputBytes/);
    validateRoutedResult(result);
  });
});

test("freeflowDerive script source resolver fails clearly for missing sources and input caps", async () => {
  await withTempVault(async (vault) => {
    const config = {
      enabled: true,
      sandbox: "auto",
      languages: ["python"],
      network: "off",
      limits: { timeoutMs: 1000, maxInputBytes: 5, maxOutputBytes: 4096 },
      rawScriptPersistence: "disabled",
    };

    const missing = await freeflowDerive({
      sessionId: "script-source-session",
      vaultRoot: vault.root,
      scriptDerive: config,
      sources: [{ kind: "vault", outputId: "ffout_missing", alias: "missing" }],
      operation: { kind: "script", language: "python", code: "write_text('ok')" },
    });
    assert.equal(missing.failure.kind, "derive_source_unavailable");
    assert.match(missing.failure.message, /ffout_missing/);

    const source = await storeCommandOutput(vault, {
      sessionId: "script-source-session",
      command: "printf log",
      stdout: "too large for cap",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:01:00.000Z",
    });
    const overCap = await freeflowDerive({
      sessionId: "script-source-session",
      vaultRoot: vault.root,
      scriptDerive: config,
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "python", code: "write_text('ok')" },
    });
    assert.equal(overCap.failure.kind, "derive_validation_failure");
    assert.match(overCap.failure.message, /exceed maxInputBytes/);

    const loosenedByCall = await freeflowDerive({
      sessionId: "script-source-session",
      vaultRoot: vault.root,
      scriptDerive: config,
      sources: [{ kind: "vault", outputId: source.outputId, stream: "stdout", alias: "log" }],
      operation: { kind: "script", language: "python", code: "write_text('ok')" },
      limits: { maxInputBytes: 1024 },
    });
    assert.equal(loosenedByCall.failure.kind, "derive_validation_failure");
    assert.match(loosenedByCall.failure.message, /exceed maxInputBytes/);
  });
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

test("freeflowDerive groupByRegex groups matching lines by capture", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-group-session",
      command: "node report.js",
      stdout: ["api: FAIL first", "ui: FAIL second", "api: FAIL third", "db: PASS fourth"].join("\n"),
      stderr: "",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-22T00:06:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-group-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "groupByRegex", pattern: "^([^:]+):", group: 1, maxGroups: 10, maxLinesPerGroup: 5 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.producer.name, "groupByRegex");
    assert.equal(result.summary, "Derived groupByRegex from vaulted stdout output: 3 group(s), 4 matched line(s)." );
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    const raw = await readOutputText(vault, "derive-group-session", result.outputId, "raw");
    assert.match(raw, /# freeflow_derive groupByRegex/);
    assert.match(raw, /groups: 3/);
    assert.match(raw, /matchedLines: 4/);
    assert.match(raw, /## group: api\ncount: 2/);
    assert.match(raw, /1\| api: FAIL first/);
    assert.match(raw, /3\| api: FAIL third/);
    assert.match(raw, /## group: ui\ncount: 1/);
  });
});

test("freeflowDerive dedupe returns first-seen unique lines", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-dedupe-session",
      command: "node report.js",
      stdout: ["alpha", "beta", "alpha", " Beta ", "beta", "gamma"].join("\n"),
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-22T00:07:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-dedupe-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "dedupe", trim: true, caseSensitive: false },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.summary, "Derived dedupe from vaulted stdout output: 3 unique line(s), 3 duplicate line(s) removed.");
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    const raw = await readOutputText(vault, "derive-dedupe-session", result.outputId, "raw");
    assert.match(raw, /# freeflow_derive dedupe/);
    assert.match(raw, /inputLines: 6/);
    assert.match(raw, /uniqueLines: 3/);
    assert.match(raw, /duplicatesRemoved: 3/);
    assert.match(raw, /1\| alpha/);
    assert.match(raw, /2\| beta/);
    assert.match(raw, /6\| gamma/);
    assert.doesNotMatch(raw, /4\|/);
  });
});

test("freeflowDerive topN sorts regex-matched lines by captured score", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-top-session",
      command: "node perf.js",
      stdout: ["duration=12 fast", "duration=200 slow-a", "duration=200 slow-b", "duration=50 medium"].join("\n"),
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-22T00:08:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-top-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "topN", pattern: "duration=(\\d+)", group: 1, sort: "numeric", order: "desc", limit: 2 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.summary, "Derived topN from vaulted stdout output: returned 2 of 4 matched line(s).");
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    const raw = await readOutputText(vault, "derive-top-session", result.outputId, "raw");
    assert.match(raw, /# freeflow_derive topN/);
    assert.match(raw, /matchedLines: 4/);
    assert.match(raw, /returnedLines: 2/);
    assert.match(raw, /2\| score=200 \| duration=200 slow-a/);
    assert.match(raw, /3\| score=200 \| duration=200 slow-b/);
    assert.doesNotMatch(raw, /1\| score=12/);
    assert.doesNotMatch(raw, /4\| score=50/);
    assert.ok(raw.indexOf("2| score=200") < raw.indexOf("3| score=200"));
  });
});

test("freeflowDerive extractUrls returns bounded URL evidence", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-urls-session",
      command: "node links.js",
      stdout: [
        "Docs: https://example.com/docs and https://example.com/api.",
        "Duplicate docs https://example.com/docs",
        "Issue: http://tracker.local/ABC-123?view=full",
      ].join("\n"),
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-22T00:09:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-urls-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "extractUrls", dedupe: true, maxMatches: 10 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.producer.name, "extractUrls");
    assert.equal(result.summary, "Derived extractUrls from vaulted stdout output: 3 URL(s) returned from 4 match(es).");
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    const raw = await readOutputText(vault, "derive-urls-session", result.outputId, "raw");
    assert.match(raw, /# freeflow_derive extractUrls/);
    assert.match(raw, /matches: 4/);
    assert.match(raw, /returnedUrls: 3/);
    assert.match(raw, /1\| https:\/\/example\.com\/docs/);
    assert.match(raw, /1\| https:\/\/example\.com\/api/);
    assert.match(raw, /3\| http:\/\/tracker\.local\/ABC-123\?view=full/);
    assert.equal((raw.match(/https:\/\/example\.com\/docs/g) ?? []).length, 1);
  });
});

test("freeflowDerive extractCitations returns markdown citation targets", async () => {
  await withTempVault(async (vault) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-citations-session",
      command: "node citations.js",
      stdout: [
        "See [Freeflow docs](https://example.com/freeflow) and [@smith2024].",
        "[^note]: https://example.com/note evidence",
        "[release]: https://example.com/release-notes",
      ].join("\n"),
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-22T00:10:00.000Z",
    });

    const result = await freeflowDerive({
      sessionId: "derive-citations-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "extractCitations", maxMatches: 10 },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.summary, "Derived extractCitations from vaulted stdout output: 4 citation(s) returned.");
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    const raw = await readOutputText(vault, "derive-citations-session", result.outputId, "raw");
    assert.match(raw, /# freeflow_derive extractCitations/);
    assert.match(raw, /1\| markdown-link \| Freeflow docs \| https:\/\/example\.com\/freeflow/);
    assert.match(raw, /1\| citekey \| smith2024/);
    assert.match(raw, /2\| footnote \| note \| https:\/\/example\.com\/note evidence/);
    assert.match(raw, /3\| reference \| release \| https:\/\/example\.com\/release-notes/);
  });
});

test("freeflowDerive lineStats and sizeStats summarize vaulted text", async () => {
  await withTempVault(async (vault) => {
    const sourceText = ["alpha", "", "γamma"].join("\n");
    const source = await storeCommandOutput(vault, {
      sessionId: "derive-stats-session",
      command: "printf stats",
      stdout: sourceText,
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-22T00:11:00.000Z",
    });

    const lineStats = await freeflowDerive({
      sessionId: "derive-stats-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "lineStats" },
    });

    assert.equal(lineStats.toolStatus, "ok");
    assert.equal(lineStats.summary, "Derived lineStats from vaulted stdout output: 3 line(s), 2 non-empty, 1 blank.");
    const lineRaw = await readOutputText(vault, "derive-stats-session", lineStats.outputId, "raw");
    assert.match(lineRaw, /# freeflow_derive lineStats/);
    assert.match(lineRaw, /lines: 3/);
    assert.match(lineRaw, /nonEmptyLines: 2/);
    assert.match(lineRaw, /blankLines: 1/);
    assert.match(lineRaw, /maxLineBytes: 6/);
    assert.match(lineRaw, /maxLineNumber: 3/);

    const sizeStats = await freeflowDerive({
      sessionId: "derive-stats-session",
      vaultRoot: vault.root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "sizeStats" },
    });

    assert.equal(sizeStats.toolStatus, "ok");
    assert.equal(sizeStats.summary, "Derived sizeStats from vaulted stdout output: 13 byte(s), 12 code unit(s), 3 line(s).");
    assert.deepEqual(sizeStats.lineage.sourceOutputIds, [source.outputId]);
    const sizeRaw = await readOutputText(vault, "derive-stats-session", sizeStats.outputId, "raw");
    assert.match(sizeRaw, /# freeflow_derive sizeStats/);
    assert.match(sizeRaw, /bytes: 13/);
    assert.match(sizeRaw, /utf16CodeUnits: 12/);
    assert.match(sizeRaw, /codePoints: 12/);
    assert.match(sizeRaw, /sha256: [0-9a-f]{64}/);
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
