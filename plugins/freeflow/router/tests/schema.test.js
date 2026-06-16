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
  };

  assert.deepEqual(validateRoutedResult(result), { ok: true, value: result });
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
