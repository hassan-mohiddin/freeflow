import assert from "node:assert/strict";
import test from "node:test";

import {
  isNativeSafetyNetEnabled,
  isValidPostToolRoutingMode,
  validateNormalizedRouterHints,
  validatePositiveIntegerThreshold,
  validateVaultRetentionPolicy,
} from "../dist/router-contract.js";

test("router contract recognizes current post-tool routing modes", () => {
  assert.equal(isValidPostToolRoutingMode("off"), true);
  assert.equal(isValidPostToolRoutingMode("safety-net"), true);
  assert.equal(isValidPostToolRoutingMode("strict"), true);
  assert.equal(isValidPostToolRoutingMode("always"), false);
  assert.equal(isValidPostToolRoutingMode(undefined), false);
});

test("router contract preserves native safety-net enabled predicate", () => {
  assert.equal(isNativeSafetyNetEnabled("off"), false);
  assert.equal(isNativeSafetyNetEnabled("safety-net"), true);
  assert.equal(isNativeSafetyNetEnabled("strict"), true);
  assert.equal(isNativeSafetyNetEnabled("always"), false);
});

test("router contract threshold validator requires positive integers", () => {
  assert.deepEqual(validatePositiveIntegerThreshold(1, "$.thresholds.largeOutputBytes"), []);
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
    const issues = validatePositiveIntegerThreshold(value, "$.thresholds.largeOutputBytes");
    assert.equal(issues.length, 1, `expected one issue for ${String(value)}`);
    assert.equal(issues[0].path, "$.thresholds.largeOutputBytes");
    assert.match(issues[0].message, /positive integer/);
  }
});

test("router contract validates vault retention policies", () => {
  assert.deepEqual(validateVaultRetentionPolicy({ strategy: "manual" }, "$.vault.retention"), []);
  assert.deepEqual(validateVaultRetentionPolicy({ strategy: "ttl", ttlDays: 7 }, "$.vault.retention"), []);

  for (const value of [null, { strategy: "ttl", ttlDays: 0 }, { strategy: "ttl", ttlDays: 1.5 }, { strategy: "forever" }]) {
    const issues = validateVaultRetentionPolicy(value, "$.vault.retention");
    assert.ok(issues.length > 0, `expected issue for ${JSON.stringify(value)}`);
  }
});

test("router contract validates normalized hints shape", () => {
  assert.deepEqual(validateNormalizedRouterHints(undefined, "$.hints"), []);
  assert.deepEqual(validateNormalizedRouterHints({ generatedPathGlobs: ["dist/**"], noisyCommandPatterns: ["test"] }, "$.hints"), []);

  for (const value of [null, [], { generatedPathGlobs: "dist/**" }, { generatedPathGlobs: ["dist/**", 1] }, { noisyCommandPatterns: [""] }]) {
    const issues = validateNormalizedRouterHints(value, "$.hints");
    assert.ok(issues.length > 0, `expected issue for ${JSON.stringify(value)}`);
  }
});
