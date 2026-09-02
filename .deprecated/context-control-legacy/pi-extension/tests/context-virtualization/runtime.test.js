import assert from "node:assert/strict";
import test from "node:test";

import { ContextSourceResolver } from "../../dist/freeflow-context/resolver.js";
import { ContextVirtualizationRuntime } from "../../dist/context-virtualization/runtime.js";
import { CONTEXT_PROJECTION_ENTRY } from "../../dist/context-virtualization/types.js";
import { contextRefForEntry } from "../../dist/freeflow-context/types.js";

function createFixture() {
  const entries = [
    {
      type: "message",
      id: "user-1",
      parentId: null,
      message: { role: "user", content: "Inspect the file." },
    },
    {
      type: "message",
      id: "tool-1",
      parentId: "user-1",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "secret raw output" }],
        isError: false,
      },
    },
  ];
  let nextId = 1;
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => entries.at(-1)?.id ?? null,
      getBranch: () => entries,
      buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
    },
  };
  const pi = {
    appendEntryDurable(customType, data) {
      entries.push({
        type: "custom",
        id: `journal-${nextId++}`,
        parentId: entries.at(-1)?.id ?? null,
        customType,
        data,
      });
    },
  };
  return { entries, ctx, pi, runtime: new ContextVirtualizationRuntime(pi, ctx) };
}

function toolMessage(text = "secret raw output") {
  return {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
  };
}

test("generic resolver resolves current-session source identity without changing V1 tool-result validation", () => {
  const { ctx } = createFixture();
  const resolver = new ContextSourceResolver(ctx);
  assert.equal(resolver.resolveCurrent("ctx:tool-1").kind, "toolResult");
  assert.equal(resolver.resolveCurrent("ctx:user-1").kind, "user");
  assert.equal(resolver.resolveCurrent("ctx:missing"), undefined);
});

test("runtime refreshes its resolver when lifecycle recovery switches contexts", async () => {
  const first = createFixture();
  const second = createFixture();
  second.ctx.sessionManager.getSessionId = () => "session-2";
  second.entries[1].id = "tool-2";
  second.entries[1].message.toolCallId = "call-2";

  await first.runtime.recover(second.ctx);
  const projected = await first.runtime.project(
    [
      {
        role: "toolResult",
        toolCallId: "call-2",
        toolName: "read",
        content: [{ type: "text", text: "second context" }],
        isError: false,
      },
    ],
    true,
  );
  assert.match(projected.messages[0].content.at(-1).text, /ctx:tool-2/);
});

test("projection recovery failure fails open for Conversation History visibility", async () => {
  const { runtime, ctx } = createFixture();
  await runtime.project([toolMessage()], true);
  await runtime.archive([{ ref: contextRefForEntry("tool-1") }]);

  ctx.sessionManager.getBranch = () => {
    throw new Error("projection recovery failed");
  };
  assert.equal(await runtime.recover(ctx), false);
  assert.equal(runtime.isSourceFullyProjected("tool-1"), true);
});

test("runtime projects full results, archives them, and restores them without mutating source content", async () => {
  const { entries, runtime } = createFixture();
  const original = structuredClone(entries[1].message);

  const full = await runtime.project([toolMessage()], true);
  assert.equal(full.changed, true);
  assert.match(full.messages[0].content.at(-1).text, /ctx:tool-1/);

  const archived = await runtime.archive([
    { ref: contextRefForEntry("tool-1"), retained: "The file contains the failing path." },
  ]);
  assert.equal(archived.status, "ok");
  assert.equal(entries[2].customType, CONTEXT_PROJECTION_ENTRY);

  const afterArchive = await runtime.project([toolMessage()], true);
  assert.deepEqual(afterArchive.messages[0].content, [
    {
      type: "text",
      text: "[context archived: ctx:tool-1]\n\n<retained-context>\nThe file contains the failing path.\n</retained-context>",
    },
  ]);
  assert.deepEqual(entries[1].message, original);

  const restored = await runtime.restore([contextRefForEntry("tool-1")]);
  assert.equal(restored.status, "ok");
  const afterRestore = await runtime.project([toolMessage()], true);
  assert.match(afterRestore.messages[0].content.at(-1).text, /ctx:tool-1/);
  assert.deepEqual(afterRestore.messages[0].content[0], original.content[0]);
});

test("archive batches validate atomically and reject unseen references", async () => {
  const { runtime } = createFixture();
  await runtime.project([toolMessage()], true);

  const result = await runtime.archive([{ ref: contextRefForEntry("tool-1") }, { ref: contextRefForEntry("missing") }]);
  assert.equal(result.status, "rejected");
  assert.match(result.message, /target_not_in_consumed_context/);

  const next = await runtime.project([toolMessage()], true);
  assert.match(next.messages[0].content.at(-1).text, /ctx:tool-1/);
});

test("archive rejects duplicate normalized references atomically", async () => {
  const { runtime } = createFixture();
  await runtime.project([toolMessage()], true);

  const result = await runtime.archive([
    { ref: contextRefForEntry("tool-1") },
    { ref: `${contextRefForEntry("tool-1")} ` },
  ]);
  assert.equal(result.status, "rejected");
  assert.match(result.message, /duplicate_reference:ctx:tool-1/);

  const next = await runtime.project([toolMessage()], true);
  assert.match(next.messages[0].content.at(-1).text, /ctx:tool-1/);
  assert.doesNotMatch(next.messages[0].content[0].text, /context archived/);
});

test("restore rejects duplicate normalized references atomically", async () => {
  const { runtime } = createFixture();
  await runtime.project([toolMessage()], true);
  assert.equal((await runtime.archive([{ ref: contextRefForEntry("tool-1") }])).status, "ok");

  const result = await runtime.restore([contextRefForEntry("tool-1"), `${contextRefForEntry("tool-1")} `]);
  assert.equal(result.status, "rejected");
  assert.match(result.message, /duplicate_reference:ctx:tool-1/);

  const next = await runtime.project([toolMessage()], true);
  assert.match(next.messages[0].content[0].text, /context archived: ctx:tool-1/);
});

test("restore after compaction records full state but reports history-only availability", async () => {
  const { ctx, runtime } = createFixture();
  await runtime.project([toolMessage()], true);
  assert.equal((await runtime.archive([{ ref: contextRefForEntry("tool-1") }])).status, "ok");

  ctx.sessionManager.buildContextEntries = () => [
    {
      type: "message",
      id: "summary-1",
      parentId: "tool-1",
      message: { role: "user", content: "The earlier context was compacted." },
    },
  ];
  await runtime.recover(ctx);
  const restored = await runtime.restore([contextRefForEntry("tool-1")], "user");
  assert.equal(restored.status, "ok");
  assert.equal(restored.availability[contextRefForEntry("tool-1")], "history-only");
});

test("mutation persistence failure returns an error without publishing projection state", async () => {
  const { pi, runtime } = createFixture();
  await runtime.project([toolMessage()], true);
  pi.appendEntryDurable = () => {
    throw new Error("disk unavailable");
  };

  const result = await runtime.archive([{ ref: contextRefForEntry("tool-1") }]);
  assert.equal(result.status, "rejected");
  assert.match(result.message, /persistence_failed:disk unavailable/);
  const next = await runtime.project([toolMessage()], true);
  assert.match(next.messages[0].content.at(-1).text, /ctx:tool-1/);
});

test("disabled projection bypasses stored state and adds no marker", async () => {
  const { runtime } = createFixture();
  const result = await runtime.project([toolMessage()], false);
  assert.equal(result.changed, false);
  assert.deepEqual(result.messages[0].content, [{ type: "text", text: "secret raw output" }]);
});
