import assert from "node:assert/strict";
import test from "node:test";

import { ContextControlRuntime } from "../../dist/context-control/core/runtime.js";
import { createContextControlExtension } from "../../dist/context-control/adapters/extension.js";
import { MemoryContextControlJournal } from "../../dist/context-control/persistence/journal.js";

function createSession() {
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-1",
      timestamp: "2026-08-28T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "user-1",
      parentId: null,
      timestamp: "2026-08-28T00:00:01.000Z",
      message: { role: "user", content: "Inspect the file." },
    },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      timestamp: "2026-08-28T00:00:02.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-1",
            name: "read",
            arguments: { path: "src/a.ts" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-1",
      parentId: "assistant-1",
      timestamp: "2026-08-28T00:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [{ type: "text", text: "export const VALUE = 1;" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "user-2",
      parentId: "tool-1",
      timestamp: "2026-08-28T00:00:04.000Z",
      message: { role: "user", content: "Continue." },
    },
    {
      type: "message",
      id: "assistant-2",
      parentId: "user-2",
      timestamp: "2026-08-28T00:00:05.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-2",
            name: "read",
            arguments: { path: "src/a.ts" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-2",
      parentId: "assistant-2",
      timestamp: "2026-08-28T00:00:06.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-2",
        toolName: "read",
        content: [{ type: "text", text: "export const VALUE = 1;" }],
        isError: false,
      },
    },
  ];

  return {
    entries,
    ctx: {
      cwd: "/repo",
      sessionManager: {
        getSessionId: () => "session-1",
        getLeafId: () => entries.at(-1)?.id ?? null,
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
      },
    },
  };
}

function createHiddenSession() {
  const session = createSession();
  session.ctx.sessionManager.buildContextEntries = () =>
    session.entries.filter((entry) => entry.id !== "tool-1" && entry.id !== "tool-2");
  return session;
}

function createMultiSourceSession(comparison = false) {
  const firstText = comparison ? "export const VALUE = 1;" : "export const FIRST = 1;";
  const secondText = comparison ? "export const VALUE = 2;" : "export const SECOND = 2;";
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-multi",
      timestamp: "2026-08-28T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "multi-user",
      parentId: null,
      timestamp: "2026-08-28T00:00:01.000Z",
      message: { role: "user", content: "Inspect both files." },
    },
    {
      type: "message",
      id: "multi-assistant-first",
      parentId: "multi-user",
      timestamp: "2026-08-28T00:00:02.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-first", name: "read", arguments: { path: "src/a.ts" } }],
      },
    },
    {
      type: "message",
      id: "multi-tool-first",
      parentId: "multi-assistant-first",
      timestamp: "2026-08-28T00:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-first",
        toolName: "read",
        content: [{ type: "text", text: firstText }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "multi-assistant-second",
      parentId: "multi-tool-first",
      timestamp: "2026-08-28T00:00:04.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-second",
            name: "read",
            arguments: { path: comparison ? "src/a.ts" : "src/b.ts" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "multi-tool-second",
      parentId: "multi-assistant-second",
      timestamp: "2026-08-28T00:00:05.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-second",
        toolName: "read",
        content: [{ type: "text", text: secondText }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "multi-followup",
      parentId: "multi-tool-second",
      timestamp: "2026-08-28T00:00:06.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "I processed both results." }] },
    },
  ];
  return {
    entries,
    ctx: {
      cwd: "/repo",
      sessionManager: {
        getSessionId: () => "session-multi",
        getLeafId: () => "multi-followup",
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () =>
          entries.filter((entry) => !["multi-tool-first", "multi-tool-second"].includes(entry.id)),
      },
    },
  };
}

function toolMessage(callId, text = "export const VALUE = 1;") {
  return {
    role: "toolResult",
    toolCallId: callId,
    toolName: "read",
    content: [{ type: "text", text }],
    isError: false,
  };
}

function failedSession() {
  const session = createSession();
  session.entries.splice(4);
  session.entries.push(
    {
      type: "message",
      id: "assistant-fail",
      parentId: "user-1",
      timestamp: "2026-08-28T00:00:04.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-fail",
            name: "bash",
            arguments: { command: "npm test" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-fail",
      parentId: "assistant-fail",
      timestamp: "2026-08-28T00:00:05.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-fail",
        toolName: "bash",
        content: [{ type: "text", text: "FAIL test suite" }],
        isError: true,
        details: { exitCode: 1 },
      },
    },
  );
  return session;
}

test("keeps leases across ordinary descendant leaves on one logical branch", async () => {
  const session = createSession();
  let leafId = "tool-2";
  session.ctx.sessionManager.getLeafId = () => leafId;
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const initialBranchId = runtime.status().branchId;

  const unavailable = await runtime.recover({
    text: "an exact source that does not exist",
    exactRequired: true,
  });
  assert.equal(unavailable.status, "unavailable");
  assert.match(unavailable.abstentionHandle, /^cc-h-use-/);

  session.entries.push({
    type: "message",
    id: "user-3",
    parentId: "tool-2",
    timestamp: "2026-08-28T00:00:07.000Z",
    message: { role: "user", content: "Continue on the same branch." },
  });
  leafId = "user-3";
  await runtime.project([]);
  runtime.settled();

  assert.equal(runtime.status().branchId, initialBranchId);
  const abstained = await runtime.useEvidence({
    handle: unavailable.abstentionHandle,
    status: "abstained",
    reason: "No source was found.",
  });
  assert.equal(abstained.status, "ok");
  assert.equal(abstained.abstained, true);
});

test("changes logical branch identity after a true fork", async () => {
  const session = createSession();
  let leafId = "tool-2";
  let activeEntries = session.entries;
  session.ctx.sessionManager.getLeafId = () => leafId;
  session.ctx.sessionManager.getBranch = () => activeEntries;
  session.ctx.sessionManager.buildContextEntries = () => activeEntries;
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const initialBranchId = runtime.status().branchId;

  const forkUser = {
    type: "message",
    id: "fork-user",
    parentId: "tool-1",
    timestamp: "2026-08-28T00:00:07.000Z",
    message: { role: "user", content: "Continue from the fork point." },
  };
  session.entries.push(forkUser);
  activeEntries = [...session.entries.slice(0, 4), forkUser];
  leafId = "fork-user";
  await runtime.project([]);

  assert.notEqual(runtime.status().branchId, initialBranchId);
  assert.equal(runtime.status().branchId, "branch:fork-user");
});

test("keeps exact-use leases across ordinary descendant leaves", async () => {
  const session = createSession();
  let leafId = "tool-2";
  session.ctx.sessionManager.getLeafId = () => leafId;
  session.ctx.sessionManager.buildContextEntries = () =>
    session.entries.filter((entry) => !["tool-1", "tool-2"].includes(entry.id));
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const recovered = await runtime.recover({
    text: "exact source content from src/a.ts",
    exactRequired: true,
  });
  assert.equal(recovered.status, "recovered");
  assert.match(recovered.lease.handle, /^cc-h-use-/);

  session.entries.push({
    type: "message",
    id: "user-3",
    parentId: "tool-2",
    timestamp: "2026-08-28T00:00:07.000Z",
    message: { role: "user", content: "Continue on the same branch." },
  });
  leafId = "user-3";
  await runtime.project([]);
  runtime.settled();

  const acknowledged = await runtime.useEvidence({
    handle: recovered.lease.handle,
    status: "used",
    excerpt: recovered.envelope.content,
  });
  assert.equal(acknowledged.status, "ok");
  assert.equal(acknowledged.handle, recovered.lease.handle);
});

test("keeps approval proposals across ordinary descendant leaves", async () => {
  const session = createSession();
  let leafId = "tool-2";
  session.ctx.sessionManager.getLeafId = () => leafId;
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  runtime.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const initial = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(initial.proposal?.kind, "cleanup");

  session.entries.push({
    type: "message",
    id: "user-3",
    parentId: "tool-2",
    timestamp: "2026-08-28T00:00:07.000Z",
    message: { role: "user", content: "Continue on the same branch." },
  });
  leafId = "user-3";
  await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.settled();
  runtime.turnEnd();

  const rejected = await runtime.decideProposal({ proposalId: initial.proposal.id, action: "reject" });
  assert.equal(rejected.status, "ok");
  assert.equal(rejected.operation, "reject");
});

test("list exposes direct sources and separates control-plane automation", async () => {
  const session = createSession();
  session.entries.push(
    {
      type: "message",
      id: "assistant-context-control",
      parentId: "tool-2",
      timestamp: "2026-08-28T00:00:07.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-context-control",
            name: "context_control",
            arguments: { operation: "status" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-context-control",
      parentId: "assistant-context-control",
      timestamp: "2026-08-28T00:00:08.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-context-control",
        toolName: "context_control",
        content: [{ type: "text", text: "Context Control: status" }],
        isError: false,
      },
    },
  );
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const listed = runtime.list();
  assert.equal(listed.operation, "list");
  assert.equal(listed.excludedCount, 2);
  const controlResult = listed.sources.find((source) => source.ref === "ctx:tool-context-control");
  assert.equal(controlResult.kind, "toolResult");
  assert.equal(controlResult.directEligible, true);
  assert.equal(controlResult.automationEligible, false);
  assert.equal(controlResult.automationProtected, true);
  assert.ok(listed.sources.some((source) => source.ref === "ctx:tool-1"));
  assert.equal(runtime.status().catalogSourceCount, listed.sourceCount);
});

test("list and explain separate direct generic eligibility from harness protection", async () => {
  const { ctx } = createSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const listed = runtime.list();
  const userSource = listed.sources.find((source) => source.ref === "ctx:user-1");
  assert.equal(userSource.directEligible, true);
  assert.equal(userSource.automationEligible, false);
  assert.equal(userSource.automationProtected, true);
  const unconsumedTool = listed.sources.find((source) => source.ref === "ctx:tool-2");
  assert.equal(unconsumedTool.automationEligible, false);
  assert.equal(unconsumedTool.automationProtected, true);

  const explained = runtime.explain("ctx:user-1");
  assert.equal(explained.directEligible, true);
  assert.equal(explained.automationEligible, false);
  assert.equal(explained.automationProtected, true);
});

test("cleanup proposals remain limited to ordinary consumed tool results", async () => {
  const session = createSession();
  session.entries.push(
    {
      type: "message",
      id: "assistant-s016-control",
      parentId: "tool-2",
      timestamp: "2026-08-28T00:00:07.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-s016-control",
            name: "context_control",
            arguments: { operation: "status" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-s016-control",
      parentId: "assistant-s016-control",
      timestamp: "2026-08-28T00:00:08.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-s016-control",
        toolName: "context_control",
        content: [{ type: "text", text: "control output" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "assistant-s016-thinking",
      parentId: "tool-s016-control",
      timestamp: "2026-08-28T00:00:09.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-s016-thinking",
            name: "thinking",
            arguments: {},
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-s016-thinking",
      parentId: "assistant-s016-thinking",
      timestamp: "2026-08-28T00:00:10.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-s016-thinking",
        toolName: "thinking",
        content: [{ type: "text", text: "sensitive output" }],
        isError: false,
      },
    },
  );
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  runtime.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();

  const result = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(result.proposal?.kind, "cleanup");
  assert.ok(result.proposal.refs.length > 0);
  assert.ok(result.proposal.refs.every((ref) => /^ctx:tool-\d+$/u.test(ref)));
  assert.doesNotMatch(result.proposal.refs.join(" "), /control|thinking|user|assistant|summary/iu);
  assert.doesNotMatch(JSON.stringify(result.proposal), /control output|sensitive output/iu);
});

test("cleanup proposals become stale when lifecycle precedence changes", async () => {
  const session = createSession();
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  runtime.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const proposalResult = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(proposalResult.proposal?.kind, "cleanup");

  session.entries.push(
    {
      type: "message",
      id: "assistant-s016-later-read",
      parentId: "tool-2",
      timestamp: "2026-08-28T00:00:07.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "call-s016-later-read",
            name: "read",
            arguments: { path: "src/a.ts" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "tool-s016-later-read",
      parentId: "assistant-s016-later-read",
      timestamp: "2026-08-28T00:00:08.000Z",
      message: {
        role: "toolResult",
        toolCallId: "call-s016-later-read",
        toolName: "read",
        content: [{ type: "text", text: "export const VALUE = 2;" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "assistant-s016-later-followup",
      parentId: "tool-s016-later-read",
      timestamp: "2026-08-28T00:00:09.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The later read was consumed." }] },
    },
  );

  const result = await runtime.decideProposal({
    proposalId: proposalResult.proposal.id,
    action: "approve",
  });
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "proposal-stale");
  assert.deepEqual(runtime.status().residency, {});
});

test("disabled runtime leaves projection unchanged and does not create journal state", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({ ctx, mode: "disabled", journal });
  await runtime.start();

  const message = toolMessage("call-1");
  const result = await runtime.project([message]);

  assert.equal(result.changed, false);
  assert.deepEqual(result.messages, [message]);
  assert.deepEqual(journal.read("session-1"), []);
  assert.equal(runtime.status().mode, "disabled");
});

test("automatic runtime reduces only a consumed safe duplicate and preserves the input", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  await runtime.start();

  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();

  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  const original = structuredClone([first, second]);
  runtime.observeContext([first, second]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const result = await runtime.project([first, second]);

  assert.equal(result.changed, true);
  assert.deepEqual([first, second], original);
  assert.match(result.messages[0].content[0].text, /context archived|context reference/i);
  assert.match(result.messages[0].content[0].text, /ctx:/);
  assert.equal(result.messages[1].content[0].text, "export const VALUE = 1;");
  assert.deepEqual(runtime.status().automaticRefs, ["ctx:tool-1"]);
  assert.equal(journal.read("session-1").length, 1);
});

test("unresolved failures remain Full", async () => {
  const session = failedSession();
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  runtime.observeContext([
    {
      role: "toolResult",
      toolCallId: "call-fail",
      toolName: "bash",
      content: [{ type: "text", text: "FAIL test suite" }],
      isError: true,
    },
  ]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();

  const message = {
    role: "toolResult",
    toolCallId: "call-fail",
    toolName: "bash",
    content: [{ type: "text", text: "FAIL test suite" }],
    isError: true,
  };
  const result = await runtime.project([message]);

  assert.equal(result.changed, false);
  assert.deepEqual(runtime.status().automaticRefs, []);
  assert.match(runtime.status().protectedRefs.join(" "), /ctx:tool-fail/);
});

test("direct cleanup can reduce an unresolved failure despite the harness Keep Full lane", async () => {
  const session = failedSession();
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([
    {
      role: "toolResult",
      toolCallId: "call-fail",
      toolName: "bash",
      content: [{ type: "text", text: "FAIL test suite" }],
      isError: true,
    },
  ]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();

  const result = await runtime.cleanup([{ ref: "ctx:tool-fail" }]);

  assert.equal(result.status, "ok");
  assert.deepEqual(result.changed, ["ctx:tool-fail"]);
  assert.equal(runtime.status().residency["ctx:tool-fail"], "reference");
});

test("direct cleanup can reduce all visible generic source kinds independently of automation lanes", async () => {
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-generic-direct",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "direct-user",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: [{ type: "text", text: "Inspect the project." }] },
    },
    {
      type: "message",
      id: "direct-assistant",
      parentId: "direct-user",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The project is ready." }] },
    },
    {
      type: "message",
      id: "direct-tool",
      parentId: "direct-assistant",
      timestamp: "2026-09-02T00:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "direct-call",
        toolName: "bash",
        content: [{ type: "text", text: "FAIL but model may clean this output" }],
        isError: true,
      },
    },
    {
      type: "message",
      id: "direct-control-assistant",
      parentId: "direct-tool",
      timestamp: "2026-09-02T00:00:04.000Z",
      message: {
        role: "assistant",
        content: [
          { type: "toolCall", id: "direct-control-call", name: "context_control", arguments: { operation: "status" } },
        ],
      },
    },
    {
      type: "message",
      id: "direct-control-result",
      parentId: "direct-control-assistant",
      timestamp: "2026-09-02T00:00:05.000Z",
      message: {
        role: "toolResult",
        toolCallId: "direct-control-call",
        toolName: "context_control",
        content: [{ type: "text", text: "Context Control status result" }],
        isError: false,
      },
    },
    {
      type: "branch_summary",
      id: "direct-summary",
      parentId: "direct-control-result",
      timestamp: "2026-09-02T00:00:06.000Z",
      summary: "The project is ready for the next task.",
    },
  ];
  const originalEntries = structuredClone(entries);
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-generic-direct",
      getLeafId: () => "direct-summary",
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => entries,
    },
  };
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const messages = [
    { role: "user", content: [{ type: "text", text: "Inspect the project." }] },
    { role: "assistant", content: [{ type: "text", text: "The project is ready." }] },
    {
      role: "toolResult",
      toolCallId: "direct-call",
      toolName: "bash",
      content: [{ type: "text", text: "FAIL but model may clean this output" }],
      isError: true,
    },
    {
      role: "toolResult",
      toolCallId: "direct-control-call",
      toolName: "context_control",
      content: [{ type: "text", text: "Context Control status result" }],
      isError: false,
    },
    { summary: "The project is ready for the next task." },
  ];
  await runtime.project(messages);
  const listed = runtime.list();
  assert.equal(listed.sources.find((source) => source.ref === "ctx:direct-user").kind, "user");
  assert.equal(listed.sources.find((source) => source.ref === "ctx:direct-assistant").kind, "assistant");
  assert.equal(listed.sources.find((source) => source.ref === "ctx:direct-summary").kind, "summary");
  assert.equal(listed.sources.find((source) => source.ref === "ctx:direct-control-result").kind, "toolResult");

  const cleaned = await runtime.cleanup([
    { ref: "ctx:direct-user", retained: "The user asked for project inspection." },
    { ref: "ctx:direct-assistant" },
    { ref: "ctx:direct-tool" },
    { ref: "ctx:direct-control-result" },
    { ref: "ctx:direct-summary" },
  ]);
  assert.equal(cleaned.status, "ok");
  assert.deepEqual(cleaned.changed, [
    "ctx:direct-user",
    "ctx:direct-assistant",
    "ctx:direct-tool",
    "ctx:direct-control-result",
    "ctx:direct-summary",
  ]);

  const projected = await runtime.project(messages);
  assert.match(projected.messages[0].content[0].text, /context archived/);
  assert.match(projected.messages[1].content[0].text, /context archived/);
  assert.match(projected.messages[2].content[0].text, /context archived/);
  assert.match(projected.messages[3].content[0].text, /context archived/);
  assert.match(projected.messages[4].summary, /context archived/);
  assert.deepEqual(entries, originalEntries);
});

test("user restore returns a reduced source to Full without an evidence lease", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();

  const reduced = await runtime.cleanup([{ ref: "ctx:tool-1" }]);
  assert.equal(reduced.status, "ok");
  assert.equal(runtime.status().residency["ctx:tool-1"], "reference");

  const invalid = await runtime.restore(["ctx:tool-1", "ctx:missing"]);
  assert.equal(invalid.status, "rejected");
  assert.equal(runtime.status().residency["ctx:tool-1"], "reference");

  const restored = await runtime.restore(["ctx:tool-1"]);
  assert.equal(restored.status, "ok");
  assert.deepEqual(restored.changed, ["ctx:tool-1"]);
  assert.equal(runtime.status().residency["ctx:tool-1"], "full");
  assert.equal(runtime.status().activeLeaseCount, 0);
  assert.equal(journal.read("session-1").at(-1).changes[0].to, "full");
});

test("generic direct pins protect cleanup and survive replay", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();
  await runtime.project([
    { role: "user", content: [{ type: "text", text: "Inspect the file." }] },
    toolMessage("call-1"),
    toolMessage("call-2"),
  ]);

  const pinned = await runtime.pin(["ctx:user-1"]);
  assert.equal(pinned.status, "ok");
  assert.deepEqual(runtime.status().pinnedRefs, ["ctx:user-1"]);
  const blocked = await runtime.cleanup([{ ref: "ctx:user-1" }]);
  assert.equal(blocked.status, "rejected");
  assert.match(blocked.reason, /pinned/);

  const restarted = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  assert.equal((await restarted.start()).status, "ready");
  assert.deepEqual(restarted.status().pinnedRefs, ["ctx:user-1"]);
});

test("generic residency cleanup replays without copying canonical content", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();
  const userMessage = { role: "user", content: [{ type: "text", text: "Inspect the file." }] };
  await runtime.project([userMessage, toolMessage("call-1")]);
  const cleaned = await runtime.cleanup([{ ref: "ctx:user-1", retained: "The user requested inspection." }]);
  assert.equal(cleaned.status, "ok");

  const restarted = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  assert.equal((await restarted.start()).status, "ready");
  const projected = await restarted.project([userMessage, toolMessage("call-1")]);
  assert.match(projected.messages[0].content[0].text, /context archived/);
  assert.match(projected.messages[0].content[0].text, /The user requested inspection/);
  assert.equal(restarted.status().canonicalPayloadsInJournal, 0);
});

test("pinning a reduced source restores Full and releasing it permits reevaluation", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  runtime.observeContext([first, second]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  await runtime.project([first, second]);
  assert.equal(runtime.status().residency["ctx:tool-1"], "reference");

  const pinned = await runtime.pin(["ctx:tool-1"]);
  assert.equal(pinned.status, "ok");
  assert.equal(runtime.status().residency["ctx:tool-1"], "full");
  const whilePinned = await runtime.project([first, second]);
  assert.equal(whilePinned.messages[0].content[0].text, "export const VALUE = 1;");

  const unpinned = await runtime.unpin(["ctx:tool-1"]);
  assert.equal(unpinned.status, "ok");
  assert.equal(runtime.status().pinnedRefs.length, 0);
  const afterRelease = await runtime.project([first, second]);
  assert.match(afterRelease.messages[0].content[0].text, /context archived/);
  assert.equal(runtime.status().residency["ctx:tool-1"], "reference");
});

test("exact recovery refuses a weak lexical-only match", async () => {
  const session = createSession();
  session.ctx.sessionManager.buildContextEntries = () =>
    session.entries.filter((entry) => !["tool-1", "tool-2"].includes(entry.id));
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.recover({
    text: "an exact historical source that does not exist in this disposable session",
    exactRequired: true,
    expectedEvidence: "exact source evidence",
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "no-eligible-match");
  assert.match(result.abstentionHandle, /^cc-h-use-/);
});

test("recovery returns canonical exact evidence and re-enters Full", async () => {
  const { ctx } = createSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  runtime.observeContext([first, second]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  await runtime.project([first, second]);

  const result = await runtime.recover({ text: "exact source content from src/a.ts", exactRequired: true });

  assert.equal(result.status, "recovered");
  assert.equal(result.materialization.mode, "restore");
  assert.equal(result.envelope.content, "export const VALUE = 1;");
  assert.equal(runtime.status().residency["ctx:tool-1"], "full");
});

test("already-visible full evidence reports no recovery materialization", async () => {
  const { ctx } = createSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const recovered = await runtime.recover({
    text: "the source content from one read",
    identifiers: ["call-1"],
    exactRequired: true,
  });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.materialization.mode, "none");
  assert.equal(recovered.envelope.content, "export const VALUE = 1;");
});

test("set recovery preserves request-owned coverage and provenance", async () => {
  const { ctx } = createMultiSourceSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([
    toolMessage("call-first", "export const FIRST = 1;"),
    toolMessage("call-second", "export const SECOND = 2;"),
  ]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  await runtime.project([]);

  const recovered = await runtime.recover({
    text: "the requested source files",
    identifiers: ["src/a.ts", "src/b.ts"],
    cardinality: { kind: "set", maxSources: 2 },
  });
  assert.equal(recovered.status, "recovered-set");
  assert.deepEqual(
    recovered.envelopes.map((envelope) => envelope.content),
    ["export const FIRST = 1;", "export const SECOND = 2;"],
  );
  assert.deepEqual(
    recovered.coverage.map((item) => item.key),
    ["src/a.ts", "src/b.ts"],
  );
  assert.equal(recovered.leases.length, 2);
});

test("comparison recovery keeps before and after evidence distinct", async () => {
  const { ctx } = createMultiSourceSession(true);
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([
    toolMessage("call-first", "export const VALUE = 1;"),
    toolMessage("call-second", "export const VALUE = 2;"),
  ]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  await runtime.project([]);

  const recovered = await runtime.recover({
    text: "compare the historical and current source",
    identifiers: ["src/a.ts"],
    cardinality: { kind: "comparison", maxSources: 2 },
  });
  assert.equal(recovered.status, "recovered-set");
  assert.deepEqual(
    recovered.coverage.map((item) => item.key),
    ["before", "after"],
  );
  assert.deepEqual(
    recovered.envelopes.map((envelope) => envelope.content),
    ["export const VALUE = 1;", "export const VALUE = 2;"],
  );
});

test("active exact-use leases protect a recovered source from cleanup until finalization", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  runtime.observeContext([first, second]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  await runtime.project([first, second]);

  const recovered = await runtime.recover({ text: "exact source content from src/a.ts", exactRequired: true });
  assert.equal(recovered.status, "recovered");
  assert.ok(recovered.lease?.handle);
  const cleanup = await runtime.cleanup([{ ref: "ctx:tool-1" }]);
  assert.equal(cleanup.status, "rejected");
  assert.match(cleanup.reason, /lease|protected/i);

  const acknowledged = await runtime.useEvidence({
    handle: recovered.lease.handle,
    status: "used",
    excerpt: recovered.envelope.content,
  });
  assert.equal(acknowledged.status, "ok");
  const finalized = await runtime.messageEnd({
    role: "assistant",
    content: [{ type: "text", text: "A short answer." }],
  });
  assert.match(finalized.message.content.at(-1).text, /Verified exact evidence/);
  assert.equal(runtime.status().activeLeaseCount, 0);
});

test("recovered working evidence can be acknowledged and unavailable recovery accepts abstention", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  runtime.observeContext([first, second]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  await runtime.project([first, second]);

  const working = await runtime.recover({ text: "source content from src/a.ts" });
  assert.equal(working.status, "recovered");
  assert.ok(working.lease?.handle);
  const used = await runtime.useEvidence({
    handle: working.lease.handle,
    status: "used",
    excerpt: "VALUE = 1",
  });
  assert.equal(used.status, "ok");
  assert.equal(runtime.status().activeLeaseCount, 0);

  const unavailable = await runtime.recover({ text: "historical source that does not exist" });
  assert.equal(unavailable.status, "unavailable");
  assert.match(unavailable.abstentionHandle, /^cc-h-use-/);
  const abstained = await runtime.useEvidence({
    handle: unavailable.abstentionHandle,
    status: "abstained",
    reason: "No verified source matched the request.",
  });
  assert.equal(abstained.status, "ok");
});

test("proactive recovery does not use generic or excluded sources", async () => {
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-recovery-isolation",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "recovery-isolation-user",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: "Generic user evidence must stay direct-only." },
    },
    {
      type: "message",
      id: "recovery-isolation-assistant",
      parentId: "recovery-isolation-user",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "Generic assistant context." }] },
    },
    {
      type: "branch_summary",
      id: "recovery-isolation-summary",
      parentId: "recovery-isolation-assistant",
      timestamp: "2026-09-02T00:00:03.000Z",
      summary: "Generic summary context.",
    },
    {
      type: "message",
      id: "recovery-isolation-control-call",
      parentId: "recovery-isolation-summary",
      timestamp: "2026-09-02T00:00:04.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "recovery-isolation-control",
            name: "context_control",
            arguments: { operation: "status" },
          },
        ],
      },
    },
    {
      type: "message",
      id: "recovery-isolation-control-result",
      parentId: "recovery-isolation-control-call",
      timestamp: "2026-09-02T00:00:05.000Z",
      message: {
        role: "toolResult",
        toolCallId: "recovery-isolation-control",
        toolName: "context_control",
        content: [{ type: "text", text: "control output" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "recovery-isolation-thinking-call",
      parentId: "recovery-isolation-control-result",
      timestamp: "2026-09-02T00:00:06.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "recovery-isolation-thinking", name: "thinking", arguments: {} }],
      },
    },
    {
      type: "message",
      id: "recovery-isolation-thinking-result",
      parentId: "recovery-isolation-thinking-call",
      timestamp: "2026-09-02T00:00:07.000Z",
      message: {
        role: "toolResult",
        toolCallId: "recovery-isolation-thinking",
        toolName: "thinking",
        content: [{ type: "text", text: "sensitive output" }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "recovery-isolation-incomplete-call",
      parentId: "recovery-isolation-thinking-result",
      timestamp: "2026-09-02T00:00:08.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "recovery-isolation-incomplete", name: "read", arguments: {} }],
      },
    },
    {
      type: "message",
      id: "recovery-isolation-incomplete-result",
      parentId: "recovery-isolation-incomplete-call",
      timestamp: "2026-09-02T00:00:09.000Z",
      message: {
        role: "toolResult",
        toolCallId: "recovery-isolation-incomplete",
        toolName: "read",
        content: [{ type: "text", text: "partial output" }],
        isError: false,
        details: { truncated: true },
      },
    },
    {
      type: "message",
      id: "recovery-isolation-unconsumed-call",
      parentId: "recovery-isolation-incomplete-result",
      timestamp: "2026-09-02T00:00:10.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "recovery-isolation-unconsumed", name: "read", arguments: {} }],
      },
    },
    {
      type: "message",
      id: "recovery-isolation-unconsumed-result",
      parentId: "recovery-isolation-unconsumed-call",
      timestamp: "2026-09-02T00:00:11.000Z",
      message: {
        role: "toolResult",
        toolCallId: "recovery-isolation-unconsumed",
        toolName: "read",
        content: [{ type: "text", text: "unconsumed output" }],
        isError: false,
      },
    },
  ];
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-recovery-isolation",
      getLeafId: () => "recovery-isolation-unconsumed-result",
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
    },
  };
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "automatic",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.setPrompt("Please recover the exact historical source declaration in src/a.ts.");

  const result = await runtime.project([]);
  assert.deepEqual(result.messages, []);
  assert.equal(result.proposal, undefined);
  assert.equal(
    runtime.audit().some((event) => event.type === "recovery"),
    false,
  );
});

test("proactive recovery can use a consumed ordinary tool result from a sibling branch", async () => {
  const header = {
    type: "session",
    version: 3,
    id: "session-recovery-sibling",
    timestamp: "2026-09-02T00:00:00.000Z",
    cwd: "/repo",
  };
  const rootUser = {
    type: "message",
    id: "recovery-sibling-root",
    parentId: null,
    timestamp: "2026-09-02T00:00:01.000Z",
    message: { role: "user", content: "Start the sibling branch." },
  };
  const activeAssistant = {
    type: "message",
    id: "recovery-sibling-active",
    parentId: "recovery-sibling-root",
    timestamp: "2026-09-02T00:00:02.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Waiting on the active branch." }] },
  };
  const siblingUser = {
    type: "message",
    id: "recovery-sibling-user",
    parentId: "recovery-sibling-root",
    timestamp: "2026-09-02T00:00:03.000Z",
    message: { role: "user", content: "Inspect the sibling source." },
  };
  const siblingAssistant = {
    type: "message",
    id: "recovery-sibling-assistant",
    parentId: "recovery-sibling-user",
    timestamp: "2026-09-02T00:00:04.000Z",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "recovery-sibling-call",
          name: "read",
          arguments: { path: "src/sibling.ts" },
        },
      ],
    },
  };
  const siblingTool = {
    type: "message",
    id: "recovery-sibling-tool",
    parentId: "recovery-sibling-assistant",
    timestamp: "2026-09-02T00:00:05.000Z",
    message: {
      role: "toolResult",
      toolCallId: "recovery-sibling-call",
      toolName: "read",
      content: [{ type: "text", text: "sibling tool output marker from src/sibling.ts" }],
      isError: false,
    },
  };
  const siblingFollowup = {
    type: "message",
    id: "recovery-sibling-followup",
    parentId: "recovery-sibling-tool",
    timestamp: "2026-09-02T00:00:06.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "The sibling result was consumed." }] },
  };
  const entries = [header, rootUser, activeAssistant, siblingUser, siblingAssistant, siblingTool, siblingFollowup];
  const activeEntries = [header, rootUser, activeAssistant];
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-recovery-sibling",
      getLeafId: () => "recovery-sibling-active",
      getBranch: () => activeEntries,
      getEntries: () => entries,
      buildContextEntries: () => activeEntries,
    },
  };
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "automatic",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.setPrompt("Please recover the exact historical declaration in src/sibling.ts.");

  const result = await runtime.project([]);
  const recovery = result.messages.find((message) => message.customType === "context-control-recovery");
  assert.ok(recovery);
  assert.match(recovery.content, /sibling tool output marker/);
  assert.equal(result.proposal, undefined);
});

test("automatic recovery detects a hidden exact historical source at the checkpoint", async () => {
  const { ctx } = createHiddenSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "automatic",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  runtime.setPrompt("Please recover the exact historical source declaration in src/a.ts.");

  const projection = await runtime.project([]);
  assert.equal(projection.changed, true);
  assert.match(projection.messages[0].customType, /context-control-recovery/);
  assert.match(projection.messages[0].content, /export const VALUE = 1/);
  assert.match(projection.messages[0].details.leaseHandle, /^cc-h-use-/);
});

test("approval recovery proposals expose bounded candidate handles and accept preview", async () => {
  const { ctx } = createHiddenSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-approval",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  runtime.setPrompt("Please recover the exact historical source declaration in src/a.ts.");

  const projection = await runtime.project([]);
  assert.equal(projection.proposal?.kind, "recovery");
  assert.match(projection.proposal.sourceIndexVersion, /^[a-f0-9]{64}$/);
  assert.ok(projection.proposal.selectedHandles?.length >= 1);
  assert.ok(projection.proposal.candidates?.every((candidate) => candidate.handle.startsWith("cc-h-")));
  runtime.settled();
  runtime.turnEnd();
  const preview = await runtime.decideProposal({
    proposalId: projection.proposal.id,
    action: "preview",
    handles: projection.proposal.selectedHandles,
    maxCharactersPerCandidate: 128,
  });
  assert.equal(preview.status, "ok");
  assert.equal(preview.operation, "preview");

  const widened = await runtime.decideProposal({
    proposalId: projection.proposal.id,
    action: "modify",
    presentation: "full",
    need: {
      text: "the same source in src/a.ts",
      scope: { maxTier: "cross-session" },
    },
  });
  assert.equal(widened.status, "rejected");
  assert.equal(widened.reason, "scope-widening");

  const approved = await runtime.decideProposal({
    proposalId: projection.proposal.id,
    action: "approve",
    handles: projection.proposal.selectedHandles,
    presentation: "full",
  });
  assert.equal(approved.status, "recovered");
  assert.equal(approved.materialization.mode, "retrieve");
  assert.match(approved.lease.handle, /^cc-h-use-/);
});

test("approval recovery rejects a candidate whose canonical content changes after proposal creation", async () => {
  const session = createHiddenSession();
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-approval",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  runtime.setPrompt("Please recover the exact historical source declaration in src/a.ts.");
  const projection = await runtime.project([]);
  assert.ok(projection.proposal);

  const source = session.entries.find((entry) => entry.id === "tool-1");
  source.message.content = [{ type: "text", text: "export const VALUE = 2;" }];
  const result = await runtime.decideProposal({
    proposalId: projection.proposal.id,
    action: "approve",
    handles: projection.proposal.selectedHandles,
    presentation: "full",
  });
  assert.equal(result.status, "rejected");
  assert.match(result.reason, /stale|changed|source/i);
});

test("journal replay restores the derived projection without copying canonical content", async () => {
  const firstSession = createSession();
  const journal = new MemoryContextControlJournal();
  const first = new ContextControlRuntime({
    ctx: firstSession.ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  await first.start();
  first.observeContext([toolMessage("call-1")]);
  first.beforeProviderRequest();
  first.turnEnd();
  first.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  first.beforeProviderRequest();
  first.turnEnd();
  await first.project([toolMessage("call-1"), toolMessage("call-2")]);

  const secondSession = createSession();
  const second = new ContextControlRuntime({
    ctx: secondSession.ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  const replay = await second.start();
  const projected = await second.project([toolMessage("call-1"), toolMessage("call-2")]);

  assert.equal(replay.status, "ready");
  assert.match(projected.messages[0].content[0].text, /context archived|context reference/i);
  assert.equal(projected.messages[1].content[0].text, "export const VALUE = 1;");
  assert.equal(second.status().canonicalPayloadsInJournal, 0);
});

test("restart preserves historical consumption for archived recovery", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const first = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  await first.start();
  first.observeContext([toolMessage("call-1")]);
  first.beforeProviderRequest();
  first.turnEnd();
  const firstMessage = toolMessage("call-1");
  const secondMessage = toolMessage("call-2");
  first.observeContext([firstMessage, secondMessage]);
  first.beforeProviderRequest();
  first.turnEnd();
  await first.project([firstMessage, secondMessage]);

  const restarted = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "automatic",
    journal,
  });
  assert.equal((await restarted.start()).status, "ready");
  const recovered = await restarted.recover({ text: "the exact source content in src/a.ts", exactRequired: true });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.envelope.content, "export const VALUE = 1;");
});

test("extension binds the runtime only when explicitly enabled", async () => {
  const handlers = new Map();
  const pi = {
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
  const { ctx } = createSession();
  const state = createContextControlExtension(pi, { mode: "disabled" });

  await handlers.get("session_start")({}, ctx);
  const projection = await handlers.get("context")({ messages: [toolMessage("call-1")] }, ctx);

  assert.equal(state.mode, "disabled");
  assert.equal(projection, undefined);
});

test("extension reloads Context Control configuration without retaining the old runtime", async () => {
  let enabled = true;
  const journal = new MemoryContextControlJournal();
  const { ctx } = createSession();
  const pi = {};
  const state = createContextControlExtension(pi, {
    journal,
    registerLifecycle: false,
    resolveConfig: async () => ({
      enabled,
      cleanupMode: "automatic",
      recoveryMode: "model-only",
      recoveryScope: "active-branch",
    }),
  });

  await state.start(ctx);
  assert.equal(state.enabled, true);
  assert.equal(state.runtime.status().state, "ready");
  enabled = false;
  await state.reload(ctx);
  assert.equal(state.enabled, false);
  assert.equal(state.mode, "disabled");
  assert.equal(state.runtime, undefined);
  const purged = await state.purge(ctx);
  assert.equal(purged.status, "ok");
  enabled = true;
  await state.reload(ctx);
  assert.equal(state.enabled, true);
  assert.equal(state.runtime.status().state, "ready");
  await state.shutdown("test");
});

test("shadow mode analyzes candidates without applying projection state", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({ ctx, mode: "shadow", journal });
  await runtime.start();

  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  runtime.observeContext([first, second]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const result = await runtime.project([first, second]);

  assert.equal(result.changed, false);
  assert.deepEqual(journal.read("session-1"), []);
  assert.deepEqual(runtime.status().residency, {});
});

test("shadow mode rejects direct mutation and recovery operations", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({ ctx, mode: "shadow", journal });
  await runtime.start();
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();

  const cleanup = await runtime.cleanup([{ ref: "ctx:tool-1" }]);
  const pin = await runtime.pin(["ctx:tool-1"]);
  const reset = await runtime.reset();
  const recovery = await runtime.recover({ text: "exact source in src/a.ts", exactRequired: true });

  assert.equal(cleanup.status, "unavailable");
  assert.equal(pin.status, "unavailable");
  assert.equal(reset.status, "unavailable");
  assert.equal(recovery.status, "unavailable");
  assert.deepEqual(journal.read("session-1"), []);
  assert.deepEqual(runtime.status().residency, {});
});

test("failed persistence preserves the prior projection and disables mutation", async () => {
  const { ctx } = createSession();
  const journal = {
    read: () => [],
    async append() {
      throw new Error("disk unavailable");
    },
  };
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  await runtime.start();

  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  runtime.observeContext([first, second]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  const result = await runtime.project([first, second]);

  assert.equal(result.changed, false);
  assert.equal(runtime.status().state, "uncertain");
  assert.deepEqual(runtime.status().residency, {});
});

test("active extension applies cleanup only after provider visibility and model progress", async () => {
  const handlers = new Map();
  const pi = {
    on(event, handler) {
      handlers.set(event, handler);
    },
  };
  const { ctx } = createSession();
  const state = createContextControlExtension(pi, {
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal: new MemoryContextControlJournal(),
  });

  await handlers.get("session_start")({}, ctx);
  const first = toolMessage("call-1");
  const second = toolMessage("call-2");
  assert.equal(await handlers.get("context")({ messages: [first] }, ctx), undefined);
  await handlers.get("before_provider_request")({}, ctx);
  await handlers.get("turn_end")({}, ctx);

  assert.equal(await handlers.get("context")({ messages: [first, second] }, ctx), undefined);
  await handlers.get("before_provider_request")({}, ctx);
  await handlers.get("turn_end")({}, ctx);
  const projection = await handlers.get("context")({ messages: [first, second] }, ctx);

  assert.equal(state.runtime.status().state, "ready");
  assert.equal(projection.messages[0].content[0].text.includes("context archived"), true);
  assert.equal(projection.messages[1].content[0].text, "export const VALUE = 1;");
});
