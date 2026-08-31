import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  FileContextControlJournal,
  MemoryContextControlJournal,
} from "../../dist/context-control/persistence/journal.js";
import { ContextControlRuntime } from "../../dist/context-control/core/runtime.js";
import { sha256Text } from "../../dist/context-control/core/stable-json.js";

const identity = {
  sessionId: "session-1",
  entryId: "tool-1",
  toolCallId: "call-1",
  toolName: "read",
};
const sourceRef = "ctx:tool-1";
const sourceContent = "export const VALUE = 1;";

function change(from = "full", to = "reference") {
  return {
    sourceRef,
    identity,
    from,
    to,
    sourceHash: sha256Text(sourceContent),
    generation: 1,
    checkpointId: "checkpoint-1",
    rule: "test-transition",
  };
}

function draft(kind = "batch", changes = [change()]) {
  return {
    version: 1,
    kind,
    sessionId: "session-1",
    branchId: "branch-1",
    checkpointId: "checkpoint-1",
    policy: "automatic",
    changes,
  };
}

test("file journal appends, acknowledges, and rereads metadata without canonical payload", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-journal-"));
  const path = join(root, "state", "journal.jsonl");
  try {
    const journal = new FileContextControlJournal(path);
    const entry = await journal.append(draft());
    const reread = journal.read("session-1");
    const raw = await readFile(path, "utf8");

    assert.equal(entry.sequence, 1);
    assert.deepEqual(reread, [entry]);
    assert.doesNotMatch(raw, /export const VALUE/);
    assert.match(raw, /ctx:tool-1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file journal persists metadata-only proposal dispositions", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-journal-disposition-"));
  const path = join(root, "journal.jsonl");
  try {
    const journal = new FileContextControlJournal(path);
    const fingerprint = "a".repeat(64);
    const entry = await journal.append({
      ...draft("disposition", []),
      policy: "approval",
      proposalDisposition: { fingerprint, disposition: "rejected" },
      transactionId: "disposition-test",
    });
    const reread = journal.read("session-1");
    const raw = await readFile(path, "utf8");

    assert.equal(entry.kind, "disposition");
    assert.deepEqual(reread[0].proposalDisposition, { fingerprint, disposition: "rejected" });
    assert.doesNotMatch(raw, /export const VALUE/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file journal appends a hash chain and serializes concurrent writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-journal-chain-"));
  const path = join(root, "journal.jsonl");
  try {
    const journal = new FileContextControlJournal(path);
    const entries = await Promise.all([
      journal.append({ ...draft(), transactionId: "tx-one" }),
      journal.append({ ...draft(), transactionId: "tx-two" }),
    ]);
    const reread = journal.read("session-1");
    assert.equal(entries.length, 2);
    assert.deepEqual(
      reread.map((entry) => entry.sequence),
      [1, 2],
    );
    assert.equal(reread[1].previousHash, reread[0].recordHash);
    assert.match(reread[0].recordHash, /^[a-f0-9]{64}$/);
    assert.match(reread[1].recordHash, /^[a-f0-9]{64}$/);
    await journal.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file journal purges only its sidecar file and releases the lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-journal-purge-"));
  const path = join(root, "journal.jsonl");
  try {
    const journal = new FileContextControlJournal(path);
    await journal.append(draft());
    await journal.purge();
    assert.deepEqual(journal.read("session-1"), []);
    await journal.acquire();
    await journal.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file journal rejects a second writer until the first writer releases", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-journal-lock-"));
  const path = join(root, "journal.jsonl");
  try {
    const first = new FileContextControlJournal(path);
    const second = new FileContextControlJournal(path);
    await first.acquire();
    await assert.rejects(second.acquire(), /sidecar-lock-unavailable/);
    await first.release();
    await second.acquire();
    await second.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file journal rejects malformed persisted truth", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-journal-invalid-"));
  const path = join(root, "journal.jsonl");
  try {
    await writeFile(path, "{malformed\n", "utf8");
    const journal = new FileContextControlJournal(path);
    assert.throws(() => journal.read("session-1"), /malformed JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file journal rejects a tampered hash chain", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-journal-tamper-"));
  const path = join(root, "journal.jsonl");
  try {
    const journal = new FileContextControlJournal(path);
    await journal.append(draft());
    const raw = await readFile(path, "utf8");
    const tampered = raw.replace(
      /"recordHash":"([a-f0-9])/,
      (_match, first) => `"recordHash":"${first === "0" ? "1" : "0"}`,
    );
    await writeFile(path, tampered, "utf8");
    assert.throws(() => journal.read("session-1"), /chained entry/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reset journal entries clear derived state during replay", async () => {
  const journal = new MemoryContextControlJournal();
  await journal.append(draft());
  await journal.append(draft("reset", []));
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => "tool-1",
      getBranch: () => [
        { type: "session", id: "session-1", cwd: "/repo" },
        {
          type: "message",
          id: "assistant-1",
          parentId: null,
          timestamp: "2026-08-28T00:00:01.000Z",
          message: {
            role: "assistant",
            content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/a.ts" } }],
          },
        },
        {
          type: "message",
          id: "tool-1",
          parentId: "assistant-1",
          timestamp: "2026-08-28T00:00:02.000Z",
          message: {
            role: "toolResult",
            toolCallId: "call-1",
            toolName: "read",
            content: [{ type: "text", text: sourceContent }],
            isError: false,
          },
        },
      ],
      buildContextEntries: () => [],
    },
  };
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  const result = await runtime.start();

  assert.equal(result.status, "ready");
  assert.deepEqual(runtime.status().residency, {});
});

test("shadow mode never projects a state restored from a journal", async () => {
  const journal = new MemoryContextControlJournal();
  await journal.append(draft());
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => "tool-1",
      getBranch: () => [
        { type: "session", id: "session-1", cwd: "/repo" },
        {
          type: "message",
          id: "assistant-1",
          parentId: null,
          timestamp: "2026-08-28T00:00:01.000Z",
          message: {
            role: "assistant",
            content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/a.ts" } }],
          },
        },
        {
          type: "message",
          id: "tool-1",
          parentId: "assistant-1",
          timestamp: "2026-08-28T00:00:02.000Z",
          message: {
            role: "toolResult",
            toolCallId: "call-1",
            toolName: "read",
            content: [{ type: "text", text: sourceContent }],
            isError: false,
          },
        },
      ],
      buildContextEntries: () => [],
    },
  };
  const runtime = new ContextControlRuntime({ ctx, mode: "shadow", journal });
  await runtime.start();
  const message = {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [{ type: "text", text: sourceContent }],
    isError: false,
  };

  const result = await runtime.project([message]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.messages, [message]);
});
