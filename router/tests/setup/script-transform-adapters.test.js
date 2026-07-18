import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { enableScriptTransformConfig } from "../../dist/setup/script-transform-adapters.js";

test("script transform adapter setup writes nested outputRouter config", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-script-transform-config-"));
  try {
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    const configPath = join(cwd, ".freeflow/config.json");
    await writeFile(
      configPath,
      JSON.stringify(
        {
          defaultMode: "workflow",
          outputRouter: { hints: { generatedPathGlobs: ["graphify-out/**"] } },
          scriptTransform: { limits: { timeoutMs: 1000 } },
        },
        null,
        2,
      ),
      "utf8",
    );

    await enableScriptTransformConfig(configPath, ["javascript", "jq"]);

    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(parsed.defaultMode, "workflow");
    assert.equal(parsed.scriptTransform, undefined);
    assert.equal(parsed.outputRouter.enabled, true);
    assert.deepEqual(parsed.outputRouter.hints.generatedPathGlobs, ["graphify-out/**"]);
    assert.deepEqual(parsed.outputRouter.scriptTransform, {
      limits: { timeoutMs: 1000 },
      enabled: true,
      languages: ["javascript", "jq"],
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
