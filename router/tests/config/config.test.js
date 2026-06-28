import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_OBSERVED_ROUTING_CONFIG,
  DEFAULT_ROUTER_THRESHOLDS,
  DEFAULT_SCRIPT_TRANSFORM_CONFIG,
  DEFAULT_VAULT_RETENTION,
  DEFAULT_VAULT_ROOT,
  normalizeFreeflowConfig,
  normalizeRouterConfig,
} from "../../dist/index.js";

test("normalizeFreeflowConfig keeps minimal setup config valid without dumping optional defaults", () => {
  const result = normalizeFreeflowConfig({ defaultMode: "workflow" });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.config.outputRouter.enabled, true);
  assert.equal(result.config.outputRouter.profile, "standard");
  assert.equal(result.config.outputRouter.storagePolicy, "hybrid-dedupe");
  assert.equal("capture" in result.config, false);
  assert.equal("providers" in result.config, false);
  assert.deepEqual(result.config.observedRouting, DEFAULT_OBSERVED_ROUTING_CONFIG);
  assert.deepEqual(result.config.scriptTransform, DEFAULT_SCRIPT_TRANSFORM_CONFIG);
});

test("normalizeFreeflowConfig accepts output router, observed routing, and script transform decisions", () => {
  const result = normalizeFreeflowConfig({
    defaultMode: "workflow",
    outputRouter: { enabled: true, profile: "standard", postToolRouting: "off", storagePolicy: "store-everything" },
    scriptTransform: {
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
  assert.deepEqual(result.config.scriptTransform, {
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

test("normalizeFreeflowConfig ignores removed capture/provider config and rejects invalid active values", () => {
  const result = normalizeFreeflowConfig({
    outputRouter: { enabled: "yes", profile: "maximum", storagePolicy: "metadata-only" },
    capture: { freeflowMediated: "metadata-only", directHostTools: "raw" },
    providers: { enabled: [{ id: "serena", mode: "write" }] },
    scriptTransform: {
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
  assert.equal("capture" in result.config, false);
  assert.equal("providers" in result.config, false);
  assert.equal(result.config.observedRouting.enabled, false);
  assert.deepEqual(result.config.scriptTransform, DEFAULT_SCRIPT_TRANSFORM_CONFIG);
  assert.equal(result.config.observedRouting.mcp.servers.github.persistence, "metadata-only");
  assert.equal(result.config.observedRouting.mcp.servers.gmail.persistence, "metadata-only");
  assert.equal(result.config.observedRouting.web.persistence, "metadata-only");
  assert.equal(result.config.observedRouting.fetch.enabled, false);
  assert.equal(result.config.observedRouting.codeSearch.persistence, "metadata-only");
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.enabled")));
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.profile")));
  assert.ok(result.warnings.some((warning) => warning.includes("outputRouter.storagePolicy")));
  assert.ok(!result.warnings.some((warning) => warning.includes("capture.")));
  assert.ok(!result.warnings.some((warning) => warning.includes("providers.")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.enabled")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.sandbox")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.languages")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.network")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.limits.timeoutMs")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.limits.maxInputBytes")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.limits.maxOutputBytes")));
  assert.ok(result.warnings.some((warning) => warning.includes("scriptTransform.rawScriptPersistence")));
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

test("normalizeRouterConfig parses repo-specific hints", () => {
  const result = normalizeRouterConfig({
    generatedPaths: ["graphify-out/**", "dist/**"],
    noisyCommandHints: ["npm test", "pnpm lint"],
  });

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.config.hints, {
    generatedPathGlobs: ["graphify-out/**", "dist/**"],
    noisyCommandPatterns: ["npm test", "pnpm lint"],
  });
});

test("normalizeRouterConfig warns for invalid hint arrays", () => {
  const result = normalizeRouterConfig({ generatedPaths: "graphify-out/**", noisyCommandHints: ["npm test", 42] });

  assert.deepEqual(result.config.hints, undefined);
  assert.equal(result.warnings.length, 2);
  assert.ok(result.warnings.every((warning) => warning.includes("outputRouter.")));
});
