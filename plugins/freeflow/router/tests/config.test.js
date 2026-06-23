import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CAPTURE_CONFIG,
  DEFAULT_PROVIDERS_CONFIG,
  DEFAULT_ROUTER_THRESHOLDS,
  DEFAULT_VAULT_RETENTION,
  DEFAULT_VAULT_ROOT,
  normalizeFreeflowConfig,
  normalizeRouterConfig,
} from "../dist/index.js";

test("normalizeFreeflowConfig keeps minimal setup config valid without dumping optional defaults", () => {
  const result = normalizeFreeflowConfig({ defaultMode: "workflow" });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.outputRouter.enabled, true);
  assert.equal(result.config.outputRouter.profile, "standard");
  assert.deepEqual(result.config.capture, DEFAULT_CAPTURE_CONFIG);
  assert.deepEqual(result.config.providers, DEFAULT_PROVIDERS_CONFIG);
});

test("normalizeFreeflowConfig accepts high-level capture and provider decisions", () => {
  const result = normalizeFreeflowConfig({
    defaultMode: "workflow",
    outputRouter: { enabled: true, profile: "standard", postToolRouting: "off" },
    capture: { freeflowMediated: "raw", directHostTools: "off" },
    providers: {
      enabled: [
        { id: "serena", mode: "discovery", categories: ["symbols", "references", "diagnostics"] },
        "custom-search",
      ],
    },
  });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.outputRouter.enabled, true);
  assert.equal(result.config.outputRouter.profile, "standard");
  assert.equal(result.config.capture.freeflowMediated, "raw");
  assert.equal(result.config.capture.directHostTools, "off");
  assert.deepEqual(result.config.providers.enabled, [
    { id: "serena", mode: "discovery", categories: ["symbols", "references", "diagnostics"] },
    { id: "custom-search", mode: "discovery" },
  ]);
});

test("normalizeFreeflowConfig rejects invalid capture and provider values", () => {
  const result = normalizeFreeflowConfig({
    outputRouter: { enabled: "yes", profile: "maximum" },
    capture: { freeflowMediated: "metadata-only", directHostTools: "raw" },
    providers: {
      enabled: [
        { id: "serena", mode: "write" },
        { id: "github", mode: "read-only", categories: ["issues", "symbols"] },
        "",
      ],
    },
  });

  assert.equal(result.config.outputRouter.enabled, true);
  assert.equal(result.config.outputRouter.profile, "standard");
  assert.deepEqual(result.config.capture, DEFAULT_CAPTURE_CONFIG);
  assert.deepEqual(result.config.providers.enabled, []);
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.enabled")));
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.profile")));
  assert.ok(result.warnings.some((warning) => warning.includes("capture.freeflowMediated")));
  assert.ok(result.warnings.some((warning) => warning.includes("capture.directHostTools")));
  assert.ok(result.warnings.some((warning) => warning.includes("providers.enabled[0].mode")));
  assert.ok(result.warnings.some((warning) => warning.includes("providers.enabled[1].categories")));
  assert.ok(result.warnings.some((warning) => warning.includes("providers.enabled[2]")));
});

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
