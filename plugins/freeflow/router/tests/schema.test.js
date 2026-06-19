import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VAULT_RETENTION,
  DEFAULT_VAULT_ROOT,
  OUTPUT_ROUTER_SKILL_PATH,
  createDefaultRouterConfig,
  validateCommandOutputRecord,
  validateRouterConfig,
  validateRoutedResult,
} from "../dist/index.js";

test("default router config uses seven-day TTL and validates", () => {
  const config = createDefaultRouterConfig();

  assert.equal(config.postToolRouting, "off");
  assert.equal(config.vault.root, DEFAULT_VAULT_ROOT);
  assert.deepEqual(config.vault.retention, DEFAULT_VAULT_RETENTION);
  assert.equal(OUTPUT_ROUTER_SKILL_PATH, "plugins/freeflow/skills/output-router/SKILL.md");
  assert.deepEqual(validateRouterConfig(config), { ok: true, value: config });
});

test("router config validation rejects zero thresholds and malformed normalized hints", () => {
  const config = createDefaultRouterConfig();
  const result = validateRouterConfig({
    ...config,
    thresholds: { largeOutputBytes: 0, largeOutputLines: 0 },
    hints: { generatedPathGlobs: ["dist/**", 1], noisyCommandPatterns: "test" },
  });

  assert.equal(result.ok, false);
  const paths = result.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.thresholds\.largeOutputBytes/);
  assert.match(paths, /\$\.thresholds\.largeOutputLines/);
  assert.match(paths, /\$\.hints\.generatedPathGlobs\[1\]/);
  assert.match(paths, /\$\.hints\.noisyCommandPatterns/);
});

test("routed command result keeps tool, execution, and routing status separate", () => {
  const result = {
    toolStatus: "ok",
    decisionId: "ffdec_123",
    outputId: "ffout_123",
    preserve: "important",
    execution: { status: "failed", exitCode: 1 },
    routing: {
      status: "routed",
      route: "run",
      reason: "Deterministic failure extraction returned exact error lines.",
    },
    recovery: {
      how: "Use freeflow_retrieve with source.kind=vault and outputId=ffout_123.",
    },
    parser: {
      name: "test-runner",
      confidence: 0.92,
      fidelity: "exact",
      compressed: true,
      counts: { testsFailed: 1 },
      references: [{ path: "tests/example.test.ts", line: 12, column: 5, severity: "error", message: "failed" }],
    },
  };

  assert.deepEqual(validateRoutedResult(result), { ok: true, value: result });
});

test("routed command important lines validate stream range and excerpt", () => {
  const valid = {
    toolStatus: "ok",
    decisionId: "ffdec_123",
    outputId: "ffout_123",
    preserve: "important",
    execution: { status: "success", exitCode: 0 },
    routing: { status: "routed", route: "run", reason: "example" },
    importantLines: [{ stream: "stdout", lines: "1-2", excerpt: "done\n" }],
  };

  assert.deepEqual(validateRoutedResult(valid), { ok: true, value: valid });

  const invalid = validateRoutedResult({
    ...valid,
    importantLines: [{ stream: "raw", lines: "3-1", excerpt: 42 }],
  });

  assert.equal(invalid.ok, false);
  const paths = invalid.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.importantLines\[0\]\.stream/);
  assert.match(paths, /\$\.importantLines\[0\]\.lines/);
  assert.match(paths, /\$\.importantLines\[0\]\.excerpt/);
});

test("routed command parser metadata validates confidence and fidelity", () => {
  const result = validateRoutedResult({
    toolStatus: "ok",
    decisionId: "ffdec_123",
    outputId: "ffout_123",
    preserve: "important",
    execution: { status: "failed", exitCode: 1 },
    routing: { status: "routed", route: "run", reason: "example" },
    parser: { name: "test-runner", confidence: 1.5, fidelity: "maybe", compressed: "yes" },
  });

  assert.equal(result.ok, false);
  const paths = result.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.parser\.confidence/);
  assert.match(paths, /\$\.parser\.fidelity/);
  assert.match(paths, /\$\.parser\.compressed/);
});

test("routed command parser reference entries validate required fields", () => {
  const result = validateRoutedResult({
    toolStatus: "ok",
    decisionId: "ffdec_123",
    outputId: "ffout_123",
    preserve: "important",
    execution: { status: "failed", exitCode: 1 },
    routing: { status: "routed", route: "run", reason: "example" },
    parser: {
      name: "typescript-lint",
      confidence: 0.88,
      fidelity: "exact",
      compressed: true,
      references: [null, { path: "", line: 0, column: "bad", severity: "urgent" }],
    },
  });

  assert.equal(result.ok, false);
  const paths = result.issues.map((issue) => issue.path).join("\n");
  assert.match(paths, /\$\.parser\.references\[0\]/);
  assert.match(paths, /\$\.parser\.references\[1\]\.path/);
  assert.match(paths, /\$\.parser\.references\[1\]\.message/);
  assert.match(paths, /\$\.parser\.references\[1\]\.line/);
  assert.match(paths, /\$\.parser\.references\[1\]\.column/);
  assert.match(paths, /\$\.parser\.references\[1\]\.severity/);
});

test("routed result rejects ambiguous top-level status", () => {
  const result = validateRoutedResult({
    status: "failed",
    decisionId: "ffdec_123",
    preserve: "important",
    routing: { status: "routed", route: "run", reason: "example" },
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.map((issue) => issue.path).join("\n"), /\$\.status/);
});

test("command output record uses executionStatus instead of status", () => {
  const record = {
    kind: "command",
    outputId: "ffout_123",
    objectId: "sha256_123",
    command: "npm test",
    createdAt: "2026-06-16T00:00:00.000Z",
    executionStatus: "failed",
    exitCode: 1,
    paths: {
      meta: "meta.json",
      stdout: "stdout.txt",
      stderr: "stderr.txt",
      combined: "combined.txt",
    },
    lineCounts: { stdout: 1, stderr: 2, combined: 3 },
    byteCounts: { stdout: 10, stderr: 20, combined: 30 },
    hashes: {},
    decisionIds: ["ffdec_123"],
    contentHashSha256: "123",
  };

  assert.deepEqual(validateCommandOutputRecord(record), { ok: true, value: record });

  const invalid = validateCommandOutputRecord({ ...record, status: "failed" });
  assert.equal(invalid.ok, false);
  assert.match(invalid.issues.map((issue) => issue.path).join("\n"), /\$\.status/);
});
