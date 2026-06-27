import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVault,
  freeflowDerive,
  readOutputText,
  storeCommandOutput,
} from "../../dist/index.js";
import { freeflowTransform, TRANSFORM_ENGINE_IMPLEMENTATION } from "../../dist/transform/engine.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-transform-"));
  try {
    return await fn(createVault({ root }), root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("freeflowTransform preserves freeflow_derive deterministic behavior and recovery", async () => {
  await withTempVault(async (vault, root) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "transform-deterministic",
      command: "fixture",
      stdout: "alpha\nbeta target\ngamma target\n",
      stderr: "",
      combined: "alpha\nbeta target\ngamma target\n",
      executionStatus: "success",
      exitCode: 0,
    });

    const result = await freeflowTransform({
      sessionId: "transform-deterministic",
      vaultRoot: root,
      source: { kind: "vault", outputId: source.outputId, stream: "stdout" },
      operation: { kind: "regexFilter", pattern: "target" },
      preserve: "important",
    });

    assert.equal(TRANSFORM_ENGINE_IMPLEMENTATION, "shared-transform-engine-v1");
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "derive");
    assert.equal(result.operation.kind, "regexFilter");
    assert.deepEqual(result.lineage.sourceOutputIds, [source.outputId]);
    assert.ok(result.outputId.startsWith("ffout_"));
    assert.match(result.recovery.how, new RegExp(result.outputId));

    const derivedText = await readOutputText(vault, "transform-deterministic", result.outputId, "raw");
    assert.match(derivedText, /# freeflow_derive regexFilter/);
    assert.match(derivedText, /beta target/);
    assert.match(derivedText, /gamma target/);
  });
});

test("freeflowDerive remains a compatibility facade over the transform engine", async () => {
  await withTempVault(async (vault, root) => {
    const source = await storeCommandOutput(vault, {
      sessionId: "transform-compat",
      command: "fixture",
      stdout: "one\ntwo\ntwo\n",
      stderr: "",
      combined: "one\ntwo\ntwo\n",
      executionStatus: "success",
      exitCode: 0,
    });

    const result = await freeflowDerive({
      sessionId: "transform-compat",
      vaultRoot: root,
      source: { kind: "vault", outputId: source.outputId, stream: "combined" },
      operation: { kind: "countMatches", pattern: "two" },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.operation.kind, "countMatches");
    assert.equal(result.lineage.operation, "countMatches");
    assert.match(result.summary, /2 match\(es\)/);
  });
});

test("run script filters call the shared transform engine, not the derive facade", async () => {
  const runSource = await readFile("router/src/tools/run.ts", "utf8");
  assert.match(runSource, /from "\.\.\/transform\/engine\.js"/);
  assert.match(runSource, /freeflowTransform\(transformOptions\)/);
  assert.doesNotMatch(runSource, /freeflowDerive\(/);
});
