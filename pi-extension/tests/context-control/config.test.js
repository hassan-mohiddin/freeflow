import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_CONTROL_MODES,
  CONTEXT_CONTROL_RECOVERY_SCOPES,
  DEFAULT_CONTEXT_CONTROL_CONFIG,
  resolveContextControlConfig,
  validateContextControlConfig,
} from "../../dist/context-control/core/config.js";

test("Context Control has exactly four settings and safe defaults", () => {
  assert.deepEqual(CONTEXT_CONTROL_MODES, ["model-only", "model-approval", "automatic"]);
  assert.deepEqual(CONTEXT_CONTROL_RECOVERY_SCOPES, ["active-branch", "current-session", "current-project"]);
  assert.deepEqual(DEFAULT_CONTEXT_CONTROL_CONFIG, {
    enabled: false,
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "active-branch",
  });
  assert.equal(validateContextControlConfig(undefined), null);
});

test("Context Control layers cleanup, recovery, and scope independently", () => {
  const result = resolveContextControlConfig(
    {
      contextControl: {
        enabled: true,
        cleanupMode: "automatic",
        recoveryMode: "model-approval",
        recoveryScope: "current-project",
      },
    },
    { contextControl: { recoveryMode: "model-only" } },
  );

  assert.equal(result.configured, true);
  assert.deepEqual(result.config, {
    enabled: true,
    cleanupMode: "automatic",
    recoveryMode: "model-only",
    recoveryScope: "current-project",
  });
  assert.deepEqual(result.sources, {
    enabled: "repository",
    cleanupMode: "repository",
    recoveryMode: "local",
    recoveryScope: "repository",
  });
});

test("Context Control rejects old policy names, unknown keys, and invalid values", () => {
  assert.equal(validateContextControlConfig({ extra: true }), "unsupported contextControl config key: extra");
  assert.equal(validateContextControlConfig({ enabled: "yes" }), "contextControl.enabled must be a boolean");
  assert.equal(validateContextControlConfig({ policy: "automatic" }), "unsupported contextControl config key: policy");
  assert.equal(
    validateContextControlConfig({ recovery: "current-session" }),
    "unsupported contextControl config key: recovery",
  );
  assert.match(validateContextControlConfig({ cleanupMode: "shadow" }), /invalid contextControl\.cleanupMode/);
  assert.match(validateContextControlConfig({ recoveryMode: "shadow" }), /invalid contextControl\.recoveryMode/);
  assert.match(validateContextControlConfig({ recoveryScope: "all" }), /invalid contextControl\.recoveryScope/);
});
