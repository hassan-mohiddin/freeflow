import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { CAPTURE_POLICY_REVISION } from "../../dist/tool-runtime/results/contracts.js";
import { sha256 } from "../../dist/tool-runtime/results/presentation.js";
import { CaptureStore } from "../../dist/tool-runtime/results/store.js";

function fixture() {
  return mkdtemp(join(tmpdir(), "freeflow-results-store-"));
}

function descriptor(manager, body, id = "result:fixture") {
  const assistant = manager.appendMessage({
    role: "assistant",
    content: [{ type: "toolCall", id: "call-1", name: "bash", arguments: { command: "fixture" } }],
    provider: "fixture",
    model: "fixture",
    api: "fixture",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: {} },
    stopReason: "toolUse",
    timestamp: 1,
  });
  return {
    version: 1,
    id,
    originSessionId: manager.getSessionId(),
    assistantEntryId: assistant,
    toolCallId: "call-1",
    toolName: "bash",
    producer: { profile: "solo", control: "inactive" },
    policyRevision: CAPTURE_POLICY_REVISION,
    capture: {
      encoding: "utf-8",
      scope: "tool-result-hook",
      externalCoverage: "unspecified",
      bytes: Buffer.byteLength(body),
      sha256: sha256(body),
    },
    emission: { bytes: 7, sha256: sha256("excerpt"), representation: "excerpt" },
    storageKey: `${sha256(id)}.txt`,
  };
}

function artifactPath(manager, value) {
  return join(
    dirname(manager.getSessionFile()),
    "freeflow-results",
    "v1",
    createHash("sha256").update(value.originSessionId).digest("hex"),
    value.storageKey,
  );
}

for (const afterMutation of [false, true]) {
  test(`descriptor append ${afterMutation ? "after mutation" : "before mutation"} failure never reports publication`, async () => {
    const root = await fixture();
    try {
      const manager = SessionManager.create(root, join(root, "sessions"));
      manager.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
      const body = "captured body";
      const value = descriptor(manager, body, `result:append-${afterMutation}`);
      const pi = {
        appendEntry(type, data) {
          if (afterMutation) manager.appendCustomEntry(type, data);
          throw new Error("injected append failure");
        },
      };
      const store = new CaptureStore(pi);
      await assert.rejects(
        () => store.publish({ sessionManager: manager }, value, body, 4 * 1024 * 1024),
        /append failure/,
      );
      assert.equal(
        await readFile(artifactPath(manager, value), "utf8"),
        body,
        "orphan is retained for explicit cleanup",
      );
      assert.equal(
        manager.getBranch().filter((entry) => entry.customType === "freeflow-tool-capture-v1").length,
        afterMutation ? 1 : 0,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("an existing reservation fails closed without deleting another process's lock", async () => {
  const root = await fixture();
  try {
    const manager = SessionManager.create(root, join(root, "sessions"));
    manager.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
    const body = "captured body";
    const value = descriptor(manager, body, "result:busy");
    const namespace = dirname(artifactPath(manager, value));
    await mkdir(namespace, { recursive: true });
    const lock = join(namespace, ".capture-reservation");
    await writeFile(lock, "other process");
    const store = new CaptureStore({ appendEntry: (type, data) => manager.appendCustomEntry(type, data) });
    await assert.rejects(
      () => store.publish({ sessionManager: manager }, value, body, 4 * 1024 * 1024),
      /storage_busy/,
    );
    assert.equal(await readFile(lock, "utf8"), "other process");
    assert.equal(
      manager.getBranch().some((entry) => entry.customType === "freeflow-tool-capture-v1"),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a lifecycle fence invalidated during publication leaves only an unavailable orphan", async () => {
  const root = await fixture();
  try {
    const manager = SessionManager.create(root, join(root, "sessions"));
    manager.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
    const body = "captured body";
    const value = descriptor(manager, body, "result:fence");
    const store = new CaptureStore({ appendEntry: (type, data) => manager.appendCustomEntry(type, data) });
    let checks = 0;
    await assert.rejects(
      () => store.publish({ sessionManager: manager }, value, body, 4 * 1024 * 1024, () => checks++ === 0),
      /session_changed/,
    );
    assert.equal(await readFile(artifactPath(manager, value), "utf8"), body);
    assert.equal(
      manager.getBranch().some((entry) => entry.customType === "freeflow-tool-capture-v1"),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publication rejects a symlinked sidecar namespace before writing outside the session store", async () => {
  const root = await fixture();
  try {
    const manager = SessionManager.create(root, join(root, "sessions"));
    manager.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
    const body = "captured body";
    const value = descriptor(manager, body, "result:namespace-symlink");
    const target = join(root, "outside");
    await mkdir(target);
    await symlink(target, join(dirname(manager.getSessionFile()), "freeflow-results"));
    const store = new CaptureStore({ appendEntry: (type, data) => manager.appendCustomEntry(type, data) });
    await assert.rejects(
      () => store.publish({ sessionManager: manager }, value, body, 4 * 1024 * 1024),
      /namespace is not a real directory/,
    );
    await assert.rejects(() => readFile(join(target, "v1", value.storageKey)), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verified reads reject missing, changed, and symlink artifacts", async () => {
  const root = await fixture();
  try {
    const manager = SessionManager.create(root, join(root, "sessions"));
    manager.appendMessage({ role: "user", content: "fixture", timestamp: 0 });
    const body = "captured body";
    const value = descriptor(manager, body, "result:integrity");
    const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
    const store = new CaptureStore(pi);
    await store.publish({ sessionManager: manager }, value, body, 4 * 1024 * 1024);
    const path = artifactPath(manager, value);

    await writeFile(path, "x".repeat(Buffer.byteLength(body)));
    await assert.rejects(() => store.read({ sessionManager: manager }, value), /integrity check failed/);

    await unlink(path);
    await assert.rejects(() => store.read({ sessionManager: manager }, value), /missing/);

    const target = join(root, "target.txt");
    await writeFile(target, body);
    await mkdir(dirname(path), { recursive: true });
    await symlink(target, path);
    await assert.rejects(() => store.read({ sessionManager: manager }, value), /not a regular file/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
