import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFreeflowConfig, normalizeLocalFreeflowConfig } from "../../dist/index.js";

test("local Freeflow config enables unsafe processing only from local config", () => {
  const local = normalizeLocalFreeflowConfig({
    processing: { unsafeUnsandboxed: { enabled: true } },
  });

  assert.equal(local.config.processing.unsafeUnsandboxed.enabled, true);
  assert.deepEqual(local.warnings, []);

  const shared = normalizeFreeflowConfig({
    defaultMode: "workflow",
    processing: { unsafeUnsandboxed: { enabled: true } },
  });

  assert.ok(shared.warnings.some((warning) => warning.includes(".freeflow/config.json processing config is ignored")));
});

test("invalid local unsafe processing config falls back disabled with warnings", () => {
  const normalized = normalizeLocalFreeflowConfig({
    processing: { unsafeUnsandboxed: { enabled: "yes" } },
  });

  assert.equal(normalized.config.processing.unsafeUnsandboxed.enabled, false);
  assert.ok(normalized.warnings.some((warning) => warning.includes("processing.unsafeUnsandboxed.enabled")));
});
