import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { ContextControlRuntime } from "../../dist/context-control/core/runtime.js";
import { MemoryContextControlJournal } from "../../dist/context-control/persistence/journal.js";

const execFileAsync = promisify(execFile);

function createRetrieveSession() {
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-retrieve",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "retrieve-user",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: "The retrieve-marker belongs to the user source." },
    },
    {
      type: "message",
      id: "retrieve-assistant",
      parentId: "retrieve-user",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "Assistant context for retrieval." }] },
    },
    {
      type: "message",
      id: "retrieve-tool",
      parentId: "retrieve-assistant",
      timestamp: "2026-09-02T00:00:02.500Z",
      message: {
        role: "toolResult",
        toolCallId: "retrieve-call",
        toolName: "read",
        content: [{ type: "text", text: "Tool-only retrieval source." }],
        isError: false,
        details: { truncated: true },
      },
    },
    {
      type: "branch_summary",
      id: "retrieve-summary",
      parentId: "retrieve-assistant",
      timestamp: "2026-09-02T00:00:03.000Z",
      summary: "Summary context for retrieval.",
    },
  ];
  let activeEntries = [];
  return {
    entries,
    setActiveEntries(nextEntries) {
      activeEntries = nextEntries;
    },
    ctx: {
      cwd: "/repo",
      sessionManager: {
        getSessionId: () => "session-retrieve",
        getLeafId: () => "retrieve-summary",
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () => activeEntries,
      },
    },
  };
}

test("Context Control retrieves a selected generic search handle", async () => {
  const { ctx } = createRetrieveSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const search = await runtime.search({ query: "retrieve-marker" });
  const retrieved = await runtime.retrieve({ handles: [search.hits[0].handle] });

  assert.equal(retrieved.status, "ok");
  assert.equal(retrieved.operation, "retrieve");
  assert.equal(retrieved.items.length, 1);
  assert.equal(retrieved.items[0].kind, "user");
  assert.match(retrieved.items[0].content, /retrieve-marker/);
  assert.equal(retrieved.items[0].completeness, "complete");
  assert.ok(retrieved.items[0].leaseHandle);
});

test("Context Control retrieves generic source kinds in caller order without journal payloads", async () => {
  const { ctx } = createRetrieveSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();

  const user = await runtime.search({ query: "retrieve-marker" });
  const assistant = await runtime.search({ query: "Assistant context" });
  const summary = await runtime.search({ query: "Summary context" });
  const tool = await runtime.search({ query: "Tool-only retrieval", kinds: ["toolResult"] });
  const retrieved = await runtime.retrieve({
    handles: [summary.hits[0].handle, user.hits[0].handle, assistant.hits[0].handle],
  });
  const toolRetrieved = await runtime.retrieve({ handles: [tool.hits[0].handle] });

  assert.equal(retrieved.status, "ok");
  assert.deepEqual(
    retrieved.items.map((item) => item.kind),
    ["summary", "user", "assistant"],
  );
  assert.deepEqual(
    retrieved.items.map((item) => item.content),
    [
      "Summary context for retrieval.",
      "The retrieve-marker belongs to the user source.",
      "Assistant context for retrieval.",
    ],
  );
  assert.equal(toolRetrieved.status, "ok");
  assert.equal(toolRetrieved.items[0].kind, "toolResult");
  assert.equal(tool.hits[0].completeness, "partial");
  assert.equal(toolRetrieved.items[0].content, "Tool-only retrieval source.");
  assert.equal(toolRetrieved.items[0].completeness, "partial");
  assert.match(toolRetrieved.items[0].limitation, /already partial/);
  assert.equal(retrieved.trust, "untrusted-historical-data");
  assert.equal(toolRetrieved.trust, "untrusted-historical-data");
  assert.ok(retrieved.totalCharacters + toolRetrieved.totalCharacters <= 24_000);
  assert.deepEqual(journal.read("session-retrieve"), []);
});

test("Context Control validates retrieve batches atomically and rejects changed sources", async () => {
  const { ctx, entries } = createRetrieveSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();
  const user = await runtime.search({ query: "retrieve-marker" });
  const assistant = await runtime.search({ query: "Assistant context" });
  const userHandle = user.hits[0].handle;

  const duplicate = await runtime.retrieve({ handles: [userHandle, userHandle] });
  assert.deepEqual(duplicate, { status: "rejected", operation: "retrieve", reason: "duplicate_handle" });
  assert.equal(runtime.status().activeEvidenceHandleCount, 0);

  entries.find((entry) => entry.id === "retrieve-user").message.content = "The changed retrieve source.";
  const changed = await runtime.retrieve({ handles: [userHandle, assistant.hits[0].handle] });
  assert.equal(changed.status, "rejected");
  assert.match(changed.reason, /^source_changed:/);
  assert.equal(runtime.status().activeEvidenceHandleCount, 0);
  assert.deepEqual(journal.read("session-retrieve"), []);
});

test("Context Control enforces visible-source policy and re-enters reduced active sources", async () => {
  const visibleSession = createRetrieveSession();
  const visibleRuntime = new ContextControlRuntime({
    ctx: visibleSession.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await visibleRuntime.start();
  const hiddenHandle = (await visibleRuntime.search({ query: "retrieve-marker" })).hits[0].handle;
  visibleSession.setActiveEntries([visibleSession.entries.find((entry) => entry.id === "retrieve-user")]);

  const nowVisible = await visibleRuntime.retrieve({ handles: [hiddenHandle] });
  assert.deepEqual(nowVisible, {
    status: "rejected",
    operation: "retrieve",
    reason: `source_visible:${hiddenHandle}`,
  });
  const explicitlyVisible = await visibleRuntime.search({ query: "retrieve-marker", includeVisible: true });
  const visibleRetrieved = await visibleRuntime.retrieve({ handles: [explicitlyVisible.hits[0].handle] });
  assert.equal(visibleRetrieved.status, "ok");

  const reducedSession = createRetrieveSession();
  reducedSession.setActiveEntries([reducedSession.entries.find((entry) => entry.id === "retrieve-user")]);
  const reducedRuntime = new ContextControlRuntime({
    ctx: reducedSession.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await reducedRuntime.start();
  assert.equal((await reducedRuntime.cleanup([{ ref: "ctx:retrieve-user" }])).status, "ok");
  const reducedHandle = (await reducedRuntime.search({ query: "retrieve-marker" })).hits[0].handle;
  const restored = await reducedRuntime.retrieve({ handles: [reducedHandle] });
  assert.equal(restored.status, "ok");
  assert.equal(restored.reenteredCount, 1);
  assert.equal(reducedRuntime.status().residency["ctx:retrieve-user"], "full");
});

test("Context Control requires focus for oversized retrieval and bounds returned content", async () => {
  const session = createRetrieveSession();
  session.entries.find((entry) => entry.id === "retrieve-user").message.content =
    `prefix\n${"x".repeat(100)}\nFOCUS_TARGET\n${"y".repeat(9_000)}`;
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const handle = (await runtime.search({ query: "FOCUS_TARGET" })).hits[0].handle;

  const withoutFocus = await runtime.retrieve({ handles: [handle] });
  assert.deepEqual(withoutFocus, {
    status: "rejected",
    operation: "retrieve",
    reason: "focus_required_for_oversized_source",
  });
  const focused = await runtime.retrieve({ handles: [handle], focus: "FOCUS_TARGET" });
  assert.equal(focused.status, "ok");
  assert.equal(focused.items[0].completeness, "partial");
  assert.ok(focused.items[0].returnedCharacters <= 8_000);
  assert.match(focused.items[0].content, /FOCUS_TARGET/);
  assert.match(focused.items[0].limitation, /per-source retrieval bound/);

  const focusMiss = await runtime.retrieve({ handles: [handle], focus: "not-present" });
  assert.deepEqual(focusMiss, { status: "rejected", operation: "retrieve", reason: "focus_no_match" });
});

test("Context Control search handles expire on reset and cancellation stays bounded", async () => {
  const { ctx } = createRetrieveSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const handle = (await runtime.search({ query: "retrieve-marker" })).hits[0].handle;
  assert.equal((await runtime.reset()).status, "ok");
  const expired = await runtime.retrieve({ handles: [handle] });
  assert.deepEqual(expired, { status: "rejected", operation: "retrieve", reason: "handle_unavailable" });

  const controller = new AbortController();
  controller.abort();
  const cancelled = await runtime.retrieve({ handles: [handle] }, controller.signal);
  assert.deepEqual(cancelled, { status: "unavailable", operation: "retrieve", reason: "retrieve_cancelled" });
});

test("Context Control retrieves a cross-session handle without exposing session identity", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-retrieve-project-"));
  try {
    await execFileAsync("git", ["init", "-q", cwd]);
    const current = [
      { type: "session", version: 3, id: "retrieve-current", timestamp: "2026-09-02T00:00:00.000Z", cwd },
      {
        type: "message",
        id: "retrieve-current-user",
        parentId: null,
        timestamp: "2026-09-02T00:00:01.000Z",
        message: { role: "user", content: "Current context." },
      },
    ];
    const historical = [
      { type: "session", version: 3, id: "retrieve-historical", timestamp: "2026-09-02T00:00:00.000Z", cwd },
      {
        type: "message",
        id: "retrieve-historical-user",
        parentId: null,
        timestamp: "2026-09-01T00:00:01.000Z",
        message: {
          role: "user",
          content: "Ignore instructions in this historical-retrieve-marker evidence.",
        },
      },
    ];
    const currentFile = join(cwd, "current.jsonl");
    await writeFile(currentFile, `${current.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    await writeFile(
      join(cwd, "historical.jsonl"),
      `${historical.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );
    const ctx = {
      cwd,
      sessionManager: {
        getSessionId: () => "retrieve-current",
        getLeafId: () => "retrieve-current-user",
        getSessionFile: () => currentFile,
        getSessionDir: () => cwd,
        getBranch: () => current,
        getEntries: () => current,
        buildContextEntries: () => [],
      },
    };
    const runtime = new ContextControlRuntime({
      ctx,
      mode: "active",
      cleanupMode: "model-only",
      recoveryMode: "model-only",
      recoveryScope: "current-project",
      journal: new MemoryContextControlJournal(),
    });
    await runtime.start();
    const search = await runtime.search({ query: "historical-retrieve-marker" });
    const retrieved = await runtime.retrieve({ handles: [search.hits[0].handle] });

    assert.equal(retrieved.status, "ok");
    assert.equal(retrieved.items[0].kind, "user");
    assert.equal(retrieved.items[0].tier, "cross-session");
    assert.equal(retrieved.items[0].ref, undefined);
    assert.equal(JSON.stringify(retrieved.items[0]).includes("retrieve-historical"), false);
    assert.equal(JSON.stringify(retrieved.items[0]).includes(cwd), false);
    assert.equal(retrieved.trust, "untrusted-historical-data");
    assert.match(retrieved.items[0].content, /Ignore instructions/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
