import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CAPTURE_CONFIG,
  DEFAULT_OBSERVED_ROUTING_CONFIG,
  DEFAULT_PROVIDERS_CONFIG,
  DEFAULT_ROUTER_THRESHOLDS,
  DEFAULT_SCRIPT_DERIVE_CONFIG,
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
  assert.equal(result.config.outputRouter.storagePolicy, "hybrid-dedupe");
  assert.deepEqual(result.config.capture, DEFAULT_CAPTURE_CONFIG);
  assert.deepEqual(result.config.providers, DEFAULT_PROVIDERS_CONFIG);
  assert.deepEqual(result.config.observedRouting, DEFAULT_OBSERVED_ROUTING_CONFIG);
  assert.deepEqual(result.config.scriptDerive, DEFAULT_SCRIPT_DERIVE_CONFIG);
});

test("normalizeFreeflowConfig accepts high-level capture and provider decisions", () => {
  const result = normalizeFreeflowConfig({
    defaultMode: "workflow",
    outputRouter: { enabled: true, profile: "standard", postToolRouting: "off", storagePolicy: "store-everything" },
    capture: { freeflowMediated: "raw", directHostTools: "off" },
    providers: {
      enabled: [
        { id: "serena", mode: "discovery", categories: ["symbols", "references", "diagnostics"] },
        "custom-search",
      ],
    },
    scriptDerive: {
      enabled: true,
      sandbox: "auto",
      languages: ["python", "javascript", "python"],
      network: "off",
      limits: { timeoutMs: 1000, maxInputBytes: 2048, maxOutputBytes: 4096 },
      rawScriptPersistence: "disabled",
    },
    observedRouting: {
      enabled: true,
      onRoutingFailure: "fail-open",
      mcp: {
        servers: {
          github: { enabled: true, persistence: "exact" },
          gmail: { enabled: true, persistence: "metadata-only" },
          vercel: { enabled: false },
        },
      },
      web: { enabled: true, persistence: "exact" },
      fetch: { enabled: true, persistence: "none" },
      codeSearch: { enabled: false },
    },
  });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.outputRouter.enabled, true);
  assert.equal(result.config.outputRouter.profile, "standard");
  assert.equal(result.config.outputRouter.storagePolicy, "store-everything");
  assert.equal(result.config.capture.freeflowMediated, "raw");
  assert.equal(result.config.capture.directHostTools, "off");
  assert.deepEqual(result.config.providers.enabled, [
    { id: "serena", mode: "discovery", categories: ["symbols", "references", "diagnostics"] },
    { id: "custom-search", mode: "discovery" },
  ]);
  assert.deepEqual(result.config.scriptDerive, {
    enabled: true,
    sandbox: "auto",
    languages: ["python", "javascript"],
    network: "off",
    limits: { timeoutMs: 1000, maxInputBytes: 2048, maxOutputBytes: 4096 },
    rawScriptPersistence: "disabled",
  });
  assert.deepEqual(result.config.observedRouting, {
    enabled: true,
    onRoutingFailure: "fail-open",
    mcp: {
      servers: {
        github: { enabled: true, persistence: "exact" },
        gmail: { enabled: true, persistence: "metadata-only" },
        vercel: { enabled: false, persistence: "none" },
      },
    },
    web: { enabled: true, persistence: "exact" },
    fetch: { enabled: true, persistence: "none" },
    codeSearch: { enabled: false, persistence: "none" },
  });
});

test("normalizeFreeflowConfig rejects invalid capture and provider values", () => {
  const result = normalizeFreeflowConfig({
    outputRouter: { enabled: "yes", profile: "maximum", storagePolicy: "metadata-only" },
    capture: { freeflowMediated: "metadata-only", directHostTools: "raw" },
    providers: {
      enabled: [
        { id: "serena", mode: "write" },
        { id: "github", mode: "read-only", categories: ["issues", "symbols"] },
        "",
      ],
    },
    scriptDerive: {
      enabled: "yes",
      sandbox: "none",
      languages: ["ruby", 1],
      network: "on",
      limits: { timeoutMs: 0, maxInputBytes: 99_999_999, maxOutputBytes: "huge" },
      rawScriptPersistence: "exact",
    },
    observedRouting: {
      enabled: "yes",
      onRoutingFailure: "fail-closed",
      mcp: {
        servers: {
          github: { enabled: true, persistence: "redacted" },
          "": { enabled: true, persistence: "exact" },
          gmail: { enabled: true, persistence: "secret" },
        },
      },
      web: { enabled: true },
      fetch: "yes",
      codeSearch: { enabled: true, persistence: "redacted" },
    },
  });

  assert.equal(result.config.outputRouter.enabled, true);
  assert.equal(result.config.outputRouter.profile, "standard");
  assert.equal(result.config.outputRouter.storagePolicy, "hybrid-dedupe");
  assert.deepEqual(result.config.capture, DEFAULT_CAPTURE_CONFIG);
  assert.deepEqual(result.config.providers.enabled, []);
  assert.equal(result.config.observedRouting.enabled, false);
  assert.deepEqual(result.config.scriptDerive, DEFAULT_SCRIPT_DERIVE_CONFIG);
  assert.equal(result.config.observedRouting.mcp.servers.github.persistence, "metadata-only");
  assert.equal(result.config.observedRouting.mcp.servers.gmail.persistence, "metadata-only");
  assert.equal(result.config.observedRouting.web.persistence, "metadata-only");
  assert.equal(result.config.observedRouting.fetch.enabled, false);
  assert.equal(result.config.observedRouting.codeSearch.persistence, "metadata-only");
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.enabled")));
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.profile")));
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.storagePolicy")));
  assert.ok(result.warnings.some((warning) => warning.includes("capture.freeflowMediated")));
  assert.ok(result.warnings.some((warning) => warning.includes("capture.directHostTools")));
  assert.ok(result.warnings.some((warning) => warning.includes("providers.enabled[0].mode")));
  assert.ok(result.warnings.some((warning) => warning.includes("providers.enabled[1].categories")));
  assert.ok(result.warnings.some((warning) => warning.includes("providers.enabled[2]")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.enabled")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.sandbox")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.languages")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.network")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.limits.timeoutMs")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.limits.maxInputBytes")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.limits.maxOutputBytes")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptDerive.rawScriptPersistence")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.enabled")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.onRoutingFailure")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.mcp.servers.github.persistence") && warning.includes("redacted")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.mcp.servers") && warning.includes("server id")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.mcp.servers.gmail.persistence")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.web.persistence")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.fetch")));
  assert.ok(result.warnings.some((warning) => warning.includes("observedRouting.codeSearch.persistence") && warning.includes("redacted")));
});

test("normalizeRouterConfig uses defaults when outputRouter is missing", () => {
  const result = normalizeRouterConfig(undefined);

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.postToolRouting, "off");
  assert.equal(result.config.storagePolicy, "hybrid-dedupe");
  assert.deepEqual(result.config.thresholds, DEFAULT_ROUTER_THRESHOLDS);
  assert.equal(result.config.vault.root, DEFAULT_VAULT_ROOT);
  assert.deepEqual(result.config.vault.retention, DEFAULT_VAULT_RETENTION);
});

test("normalizeRouterConfig maps repo outputRouter candidate fields", () => {
  const result = normalizeRouterConfig({
    postToolRouting: "safety-net",
    storagePolicy: "store-everything",
    largeOutputBytes: 1234,
    largeOutputLines: 42,
    vaultRoot: "~/custom-freeflow-vault",
    vaultRetentionDays: 3,
    generatedPaths: ["dist/**"],
    noisyCommandHints: ["test"],
  });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.postToolRouting, "safety-net");
  assert.equal(result.config.storagePolicy, "store-everything");
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
    storagePolicy: "metadata-only",
    largeOutputBytes: -1,
    largeOutputLines: "many",
    vaultRetentionDays: 0,
    generatedPaths: ["dist/**", 123],
    noisyCommandHints: "test",
  });

  assert.equal(result.config.postToolRouting, "off");
  assert.equal(result.config.storagePolicy, "hybrid-dedupe");
  assert.equal(result.config.thresholds.largeOutputBytes, DEFAULT_ROUTER_THRESHOLDS.largeOutputBytes);
  assert.equal(result.config.thresholds.largeOutputLines, DEFAULT_ROUTER_THRESHOLDS.largeOutputLines);
  assert.deepEqual(result.config.vault.retention, DEFAULT_VAULT_RETENTION);
  assert.ok(result.warnings.length >= 5);
  assert.ok(result.warnings.some((warning) => warning.includes("postToolRouting")));
  assert.ok(result.warnings.some((warning) => warning.includes("storagePolicy")));
  assert.ok(result.warnings.some((warning) => warning.includes("largeOutputBytes")));
  assert.ok(result.warnings.some((warning) => warning.includes("largeOutputLines")));
  assert.ok(result.warnings.some((warning) => warning.includes("vaultRetentionDays")));
});
