import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { CAPTURE_POLICY_REVISION } from "../../dist/tool-runtime/results/contracts.js";
import { sha256 } from "../../dist/tool-runtime/results/presentation.js";
import { ResultRuntime } from "../../dist/tool-runtime/results/runtime.js";
import { CaptureStore } from "../../dist/tool-runtime/results/store.js";

const capability = resolveToolExecutionConfig({ toolExecution: { enabled: true } }, {}, true);
const execFileAsync = promisify(execFile);

function assistantMessage() {
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "fixture" } }],
    provider: "fixture",
    model: "fixture",
    api: "fixture",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {} },
    stopReason: "toolUse",
    timestamp: 1,
  };
}

async function preparedManager(root) {
  const manager = SessionManager.create(root, join(root, "sessions"));
  const userId = manager.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
  const assistantEntryId = manager.appendMessage(assistantMessage());
  const body = "exact persisted captured body αβ";
  const emission = "bounded excerpt";
  const id = "result:lifecycle";
  const value = {
    version: 1,
    id,
    originSessionId: manager.getSessionId(),
    assistantEntryId,
    toolCallId: "call-1",
    toolName: "bash",
    producer: { profile: "helper", control: "automatic", assignmentId: "assignment-1" },
    policyRevision: CAPTURE_POLICY_REVISION,
    capture: {
      encoding: "utf-8",
      scope: "tool-result-hook",
      externalCoverage: "unspecified",
      bytes: Buffer.byteLength(body),
      sha256: sha256(body),
    },
    emission: { bytes: Buffer.byteLength(emission), sha256: sha256(emission), representation: "excerpt" },
    storageKey: `${sha256(id)}.txt`,
  };
  const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
  await new CaptureStore(pi).publish({ sessionManager: manager }, value, body, 4 * 1024 * 1024);
  manager.appendMessage({
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "bash",
    content: [{ type: "text", text: emission }],
    details: {},
    isError: false,
    timestamp: 2,
  });
  return { manager, userId, value, body };
}

function runtime(pi = {}) {
  return new ResultRuntime(
    pi,
    () => capability,
    () => ({ profile: "solo", control: "inactive" }),
  );
}

async function assertReadable(manager, value, body) {
  const result = await runtime().read({ id: value.id, offsetBytes: 0, maxBytes: 1024 }, undefined, {
    sessionManager: manager,
  });
  assert.ok(result.content[0].text.includes(body));
  assert.equal(result.details.capturedResult.totalBytes, Buffer.byteLength(body));
}

test("fresh runtime, compaction, reopened session, new process, and native fork resolve the same immutable capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-results-lifecycle-"));
  try {
    const { manager, value, body } = await preparedManager(root);
    await assertReadable(manager, value, body);

    manager.appendCompaction(
      "Older work compacted; captured result remains an explicit artifact.",
      manager.getLeafId(),
      100,
    );
    await assertReadable(manager, value, body);

    const reopened = SessionManager.open(manager.getSessionFile());
    await assertReadable(reopened, value, body);

    const runtimeUrl = pathToFileURL(resolve("pi-extension/dist/tool-runtime/results/runtime.js")).href;
    const configUrl = pathToFileURL(resolve("pi-extension/dist/tool-runtime/config.js")).href;
    const child = await execFileAsync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { SessionManager } from "@earendil-works/pi-coding-agent";
         import { ResultRuntime } from ${JSON.stringify(runtimeUrl)};
         import { resolveToolExecutionConfig } from ${JSON.stringify(configUrl)};
         const manager = SessionManager.open(process.env.FF_SESSION_FILE);
         const capability = resolveToolExecutionConfig({ toolExecution: { enabled: true } }, {}, true);
         const runtime = new ResultRuntime({}, () => capability, () => ({ profile: "solo", control: "inactive" }));
         const result = await runtime.read({ id: process.env.FF_RESULT_ID, offsetBytes: 0, maxBytes: 1024 }, undefined, { sessionManager: manager });
         if (!result.content[0].text.includes(process.env.FF_EXPECTED)) throw new Error("fresh process did not recover exact capture");
         process.stdout.write(JSON.stringify(result.details.capturedResult));`,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FF_SESSION_FILE: manager.getSessionFile(),
          FF_RESULT_ID: value.id,
          FF_EXPECTED: body,
        },
      },
    );
    assert.equal(JSON.parse(child.stdout).totalBytes, Buffer.byteLength(body));

    const forkFile = manager.createBranchedSession(manager.getLeafId());
    assert.ok(forkFile);
    const forked = SessionManager.open(forkFile);
    await assertReadable(forked, value, body);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native navigation outside descriptor ancestry makes the capture unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-results-navigation-"));
  try {
    const { manager, userId, value } = await preparedManager(root);
    manager.branch(userId);
    await assert.rejects(
      () => runtime().read({ id: value.id, offsetBytes: 0, maxBytes: 1024 }, undefined, { sessionManager: manager }),
      /Captured result is unavailable/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
