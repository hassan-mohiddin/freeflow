import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildFreeflowStatusReport } from "../../dist/output-router/status.js";

function createContext(cwd, explicitModel = false) {
  return {
    cwd,
    modelStateProvenance: { explicitModel },
    modelRegistry: {
      find(provider, id) {
        if (provider !== "faux" || !["standard", "reasoning"].includes(id)) return undefined;
        return { provider, id };
      },
      async getApiKeyAndHeaders() {
        return { ok: true };
      },
      clampThinkingLevel(_model, level) {
        return level;
      },
    },
    sessionManager: {
      getEntries() {
        return [];
      },
      getBranch() {
        return [];
      },
    },
  };
}

async function withConfiguredCognitiveRouting(run) {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-cognitive-routing-status-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow", "config.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          profiles: {
            standard: { provider: "faux", model: "standard", thinkingLevel: "high" },
            reasoning: { provider: "faux", model: "reasoning", thinkingLevel: "max" },
          },
        },
      }),
    );
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("status distinguishes preflight eligibility from an inactive runtime", async () => {
  await withConfiguredCognitiveRouting(async (cwd) => {
    const report = await buildFreeflowStatusReport({}, createContext(cwd));
    const cognitiveRouting = report.effectiveConfig.cognitiveRouting;

    assert.equal(cognitiveRouting.preflightEffective, true);
    assert.equal(cognitiveRouting.effective, false);
    assert.equal(cognitiveRouting.runtimeStatus, "inactive");
    assert.equal(cognitiveRouting.blockingReason.code, "runtime_inactive");
  });
});

test("status reports an active lease without a stale disabled blocking reason", async () => {
  await withConfiguredCognitiveRouting(async (cwd) => {
    const report = await buildFreeflowStatusReport({}, createContext(cwd), {
      effective: true,
      controlMode: "automatic",
      activeProfile: "standard",
      epoch: "epoch-1",
    });
    const cognitiveRouting = report.effectiveConfig.cognitiveRouting;

    assert.equal(cognitiveRouting.preflightEffective, true);
    assert.equal(cognitiveRouting.effective, true);
    assert.equal(cognitiveRouting.runtimeStatus, "active");
    assert.equal(cognitiveRouting.blockingReason, null);
  });
});

test("status identifies startup suppression as inactive runtime state", async () => {
  await withConfiguredCognitiveRouting(async (cwd) => {
    const report = await buildFreeflowStatusReport({}, createContext(cwd, true));
    const cognitiveRouting = report.effectiveConfig.cognitiveRouting;

    assert.equal(cognitiveRouting.effective, false);
    assert.equal(cognitiveRouting.runtimeStatus, "suppressed");
    assert.equal(cognitiveRouting.runtime.reason, "startup_suppressed");
  });
});

test("status identifies pending recovery separately from inactive preflight", async () => {
  await withConfiguredCognitiveRouting(async (cwd) => {
    const report = await buildFreeflowStatusReport({}, createContext(cwd), {
      effective: false,
      controlMode: "automatic",
      epoch: "epoch-1",
    });
    const cognitiveRouting = report.effectiveConfig.cognitiveRouting;

    assert.equal(cognitiveRouting.preflightEffective, true);
    assert.equal(cognitiveRouting.effective, false);
    assert.equal(cognitiveRouting.runtimeStatus, "pending");
    assert.equal(cognitiveRouting.runtime.effective, false);
  });
});
