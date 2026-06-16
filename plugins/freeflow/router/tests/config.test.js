import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ROUTER_THRESHOLDS,
  DEFAULT_VAULT_RETENTION,
  DEFAULT_VAULT_ROOT,
  normalizeRouterConfig,
} from "../dist/index.js";

test("normalizeRouterConfig uses defaults when outputRouter is missing", () => {
  const result = normalizeRouterConfig(undefined);

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.postToolRouting, "off");
  assert.deepEqual(result.config.thresholds, DEFAULT_ROUTER_THRESHOLDS);
  assert.equal(result.config.vault.root, DEFAULT_VAULT_ROOT);
  assert.deepEqual(result.config.vault.retention, DEFAULT_VAULT_RETENTION);
});

test("normalizeRouterConfig maps repo outputRouter candidate fields", () => {
  const result = normalizeRouterConfig({
    postToolRouting: "safety-net",
    largeOutputBytes: 1234,
    largeOutputLines: 42,
    vaultRoot: "~/custom-freeflow-vault",
    vaultRetentionDays: 3,
    generatedPaths: ["dist/**"],
    noisyCommandHints: ["test"],
  });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.postToolRouting, "safety-net");
  assert.equal(result.config.thresholds.largeOutputBytes, 1234);
  assert.equal(result.config.thresholds.largeOutputLines, 42);
  assert.equal(result.config.vault.root, "~/custom-freeflow-vault");
  assert.deepEqual(result.config.vault.retention, { strategy: "ttl", ttlDays: 3 });
  assert.deepEqual(result.config.hints?.generatedPathGlobs, ["dist/**"]);
  assert.deepEqual(result.config.hints?.noisyCommandPatterns, ["test"]);
});

test("normalizeRouterConfig falls back safely and reports invalid values", () => {
  const result = normalizeRouterConfig({
    postToolRouting: "always",
    largeOutputBytes: -1,
    largeOutputLines: "many",
    vaultRetentionDays: 0,
    generatedPaths: ["dist/**", 123],
    noisyCommandHints: "test",
  });

  assert.equal(result.config.postToolRouting, "off");
  assert.equal(result.config.thresholds.largeOutputBytes, DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes);
  assert.equal(result.config.thresholds.largeOutputLines, DEFAULT_ROUTER_THRESHOLDS.largeOutputLines);
  assert.deepEqual(result.config.vault.retention, DEFAULT_VAULT_RETENTION);
  assert.ok(result.warnings.length >= 5);
  assert.ok(result.warnings.some((warning) => warning.includes("postToolRouting")));
  assert.ok(result.warnings.some((warning) => warning.includes("largeOutputBytes")));
  assert.ok(result.warnings.some((warning) => warning.includes("largeOutputLines")));
  assert.ok(result.warnings.some((warning) => warning.includes("vaultRetentionDays")));
});
