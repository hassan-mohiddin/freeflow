import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVault,
  freeflowBatch,
  readOutputText,
  storeCommandOutput,
  validateRoutedResult,
} from "../../dist/index.js";

async function withTempDir(prefix, fn) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("freeflowBatch runs multiple run steps with bounded parallelism", async () => {
  await withTempDir("freeflow-router-batch-run-", async (root) => {
    let active = 0;
    let maxActive = 0;
    const runner = {
      async run(request) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(15);
        active -= 1;
        return {
          stdout: `done ${request.command}\n`,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowBatch({
      sessionId: "batch-run",
      vaultRoot: root,
      concurrency: 2,
      steps: [
        { kind: "run", input: { command: "one" } },
        { kind: "run", input: { command: "two" } },
        { kind: "run", input: { command: "three" } },
      ],
    }, runner);

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "batch");
    assert.equal(result.stepCount, 3);
    assert.equal(result.okCount, 3);
    assert.equal(result.failedCount, 0);
    assert.equal(maxActive, 2);
    assert.equal(validateRoutedResult(result).ok, true);
    assert.ok(result.steps.every((step) => step.result?.outputId?.startsWith("ffout_")));
  });
});

test("freeflowBatch runs multiple retrieve/search-compatible steps", async () => {
  await withTempDir("freeflow-router-batch-search-", async (root) => {
    await writeFile(join(root, "alpha.md"), "ALPHA_BATCH_TARGET source truth\n", "utf8");
    await writeFile(join(root, "beta.md"), "BETA_BATCH_TARGET source truth\n", "utf8");

    const result = await freeflowBatch({
      sessionId: "batch-search",
      vaultRoot: join(root, "vault"),
      steps: [
        {
          id: "alpha",
          kind: "retrieve",
          input: { action: "query", source: { kind: "repo", root }, query: "ALPHA_BATCH_TARGET" },
        },
        {
          id: "beta",
          kind: "search",
          input: { action: "query", source: { kind: "repo", root }, query: "BETA_BATCH_TARGET" },
        },
      ],
    }, { async run() { throw new Error("runner should not be used"); } });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.okCount, 2);
    assert.equal(result.steps[0].result.evidence[0].path, "alpha.md");
    assert.equal(result.steps[1].result.evidence[0].path, "beta.md");
  });
});

test("freeflowBatch supports mixed run, search, and transform steps", async () => {
  await withTempDir("freeflow-router-batch-mixed-", async (root) => {
    const repoRoot = join(root, "repo");
    const vaultRoot = join(root, "vault");
    await mkdir(repoRoot);
    await writeFile(join(repoRoot, "notes.md"), "MIXED_BATCH_REPO_TARGET\n", "utf8");
    const vault = createVault({ root: vaultRoot });
    const source = await storeCommandOutput(vault, {
      sessionId: "batch-mixed",
      command: "fixture",
      stdout: "keep this line\ndrop this line\n",
      stderr: "",
      combined: "keep this line\ndrop this line\n",
      executionStatus: "success",
      exitCode: 0,
    });

    const result = await freeflowBatch({
      sessionId: "batch-mixed",
      vaultRoot,
      steps: [
        { kind: "run", input: { command: "echo batch" } },
        { kind: "search", input: { action: "query", source: { kind: "repo", root: repoRoot }, query: "MIXED_BATCH_REPO_TARGET" } },
        { kind: "transform", input: { source: { kind: "vault", outputId: source.outputId, stream: "stdout" }, operation: { kind: "regexFilter", pattern: "keep" } } },
      ],
    }, {
      async run() {
        return { stdout: "batch run output\n", stderr: "", executionStatus: "success", exitCode: 0 };
      },
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.steps.map((step) => step.kind).join(","), "run,search,transform");
    assert.equal(result.steps[1].result.evidence[0].path, "notes.md");
    const derivedOutputId = result.steps[2].result.outputId;
    assert.ok(derivedOutputId.startsWith("ffout_"));
    const derivedText = await readOutputText(vault, "batch-mixed", derivedOutputId, "raw");
    assert.match(derivedText, /keep this line/);
  });
});

test("freeflowBatch reports a failing step without hiding other child results", async () => {
  await withTempDir("freeflow-router-batch-failure-", async (root) => {
    const result = await freeflowBatch({
      sessionId: "batch-failure",
      vaultRoot: root,
      concurrency: 2,
      steps: [
        { id: "throws", kind: "run", input: { command: "throw" } },
        { id: "ok", kind: "run", input: { command: "ok" } },
      ],
    }, {
      async run(request) {
        if (request.command === "throw") {
          throw new Error("runner boom");
        }
        return { stdout: "ok output\n", stderr: "", executionStatus: "success", exitCode: 0 };
      },
    });

    assert.equal(result.toolStatus, "error");
    assert.equal(result.routing.status, "partial");
    assert.equal(result.okCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.steps[0].status, "failed");
    assert.match(result.steps[0].result.routing.reason, /runner boom/);
    assert.equal(result.steps[1].status, "ok");
    assert.ok(result.steps[1].result.outputId.startsWith("ffout_"));
    assert.equal(validateRoutedResult(result).ok, true);
  });
});
