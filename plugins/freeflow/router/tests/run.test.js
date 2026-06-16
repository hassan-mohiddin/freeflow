import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createVault, freeflowRun, readOutputText } from "../dist/index.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-run-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("freeflowRun uses an adapter runner and stores small successful output", async () => {
  await withTempVault(async (vault) => {
    const calls = [];
    const runner = {
      async run(request) {
        calls.push(request);
        return {
          stdout: "done\n",
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
          durationMs: 12,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "echo done",
        cwd: "/repo",
        timeoutMs: 1_000,
        sessionId: "run-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.deepEqual(calls, [{ command: "echo done", cwd: "/repo", timeoutMs: 1_000 }]);
    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.execution.exitCode, 0);
    assert.ok(result.outputId.startsWith("ffout_"));
    assert.equal(result.routing.status, "routed");
    assert.match(result.summary, /success/);
    assert.equal(result.importantLines?.[0].stream, "combined");
    assert.equal(result.importantLines?.[0].excerpt, "done");
    assert.equal(result.recovery?.outputId, result.outputId);

    assert.equal(await readOutputText(vault, "run-session", result.outputId, "stdout"), "done\n");
  });
});

test("large successful command returns deterministic important lines plus output id", async () => {
  await withTempVault(async (vault) => {
    const output = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n");
    const runner = {
      async run() {
        return {
          stdout: output,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "generate noisy output",
        sessionId: "large-session",
        vaultRoot: vault.root,
        thresholds: { largeOutputLines: 10, largeOutputBytes: 10_000 },
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "success");
    assert.equal(result.routing.status, "partial");
    assert.match(result.summary, /30 output lines/);
    assert.equal(result.importantLines?.[0].stream, "combined");
    assert.match(result.importantLines?.[0].excerpt, /line 1/);
    assert.ok(!result.importantLines?.[0].excerpt.includes("line 30"));
    assert.equal(await readOutputText(vault, "large-session", result.outputId, "stdout"), output);
  });
});

test("verification goal preserves exact pass/fail summary lines", async () => {
  await withTempVault(async (vault) => {
    const stdout = [
      ...Array.from({ length: 12 }, (_, index) => `setup line ${index + 1}`),
      "Tests: 3 failed, 214 passed, 217 total",
      "Time: 8.23s",
    ].join("\n");
    const runner = {
      async run() {
        return {
          stdout,
          stderr: "",
          executionStatus: "failed",
          exitCode: 1,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm test",
        sessionId: "verification-session",
        vaultRoot: vault.root,
        goal: "verification",
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.importantLines?.[0].stream, "combined");
    assert.equal(result.importantLines?.[0].excerpt, "Tests: 3 failed, 214 passed, 217 total");
    assert.equal(await readOutputText(vault, "verification-session", result.outputId, "stdout"), stdout);
  });
});

test("failed command returns exact stderr evidence and raw output id", async () => {
  await withTempVault(async (vault) => {
    const runner = {
      async run() {
        return {
          stdout: "214 passing\n",
          stderr: "FAIL target test\nexpected true to equal false\nstack line\n",
          executionStatus: "failed",
          exitCode: 1,
          durationMs: 20,
        };
      },
    };

    const result = await freeflowRun(
      {
        command: "npm test",
        sessionId: "failed-session",
        vaultRoot: vault.root,
        preserve: "important",
      },
      runner,
    );

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.execution.status, "failed");
    assert.equal(result.execution.exitCode, 1);
    assert.equal(result.routing.status, "routed");
    assert.match(result.summary, /failed/);
    assert.equal(result.importantLines?.[0].stream, "stderr");
    assert.equal(
      result.importantLines?.[0].excerpt,
      "FAIL target test\nexpected true to equal false\nstack line",
    );
    assert.equal(result.recovery?.outputId, result.outputId);
    assert.equal(
      await readOutputText(vault, "failed-session", result.outputId, "stderr"),
      "FAIL target test\nexpected true to equal false\nstack line\n",
    );
  });
});
