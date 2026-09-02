import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import freeflowExtension from "../../dist/index.js";
import explicitContextControlExtension from "../../context-control/index.js";
import { ContextControlRuntime } from "../../dist/context-control/core/runtime.js";
import { registerContextControlTools } from "../../dist/context-control/interfaces/tool.js";
import {
  FileContextControlJournal,
  MemoryContextControlJournal,
} from "../../dist/context-control/persistence/journal.js";
import { readCapabilityState } from "../../dist/runtime/runtime-context.js";

function createSession() {
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-1",
      timestamp: "2026-08-29T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "user-1",
      parentId: null,
      timestamp: "2026-08-29T00:00:01.000Z",
      message: { role: "user", content: "Inspect the file." },
    },
    {
      type: "message",
      id: "assistant-1",
      parentId: "user-1",
      timestamp: "2026-08-29T00:00:02.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/a.ts" } }],
      },
    },
    {
      type: "message",
      id: "tool-1",
      parentId: "assistant-1",
      timestamp: "2026-08-29T00:00:03.000Z",
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
      timestamp: "2026-08-29T00:00:04.000Z",
      message: { role: "user", content: "Continue." },
    },
    {
      type: "message",
      id: "assistant-2",
      parentId: "user-2",
      timestamp: "2026-08-29T00:00:05.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call-2", name: "read", arguments: { path: "src/a.ts" } }],
      },
    },
    {
      type: "message",
      id: "tool-2",
      parentId: "assistant-2",
      timestamp: "2026-08-29T00:00:06.000Z",
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
        getLeafId: () => "leaf-1",
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
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

async function filesUnder(root) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit(root);
  return files;
}

async function consumeTwo(runtime) {
  runtime.observeContext([toolMessage("call-1")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
  runtime.observeContext([toolMessage("call-1"), toolMessage("call-2")]);
  runtime.beforeProviderRequest();
  runtime.turnEnd();
}

test("automatic cleanup, recovery, exact-use enforcement, and pinning compose", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    recoveryScope: "active-branch",
    journal,
  });
  assert.equal((await runtime.start()).status, "ready");
  await consumeTwo(runtime);

  const projected = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(projected.changed, true);
  assert.match(projected.messages[0].content[0].text, /context archived/);
  assert.equal(projected.messages[1].content[0].text, "export const VALUE = 1;");
  assert.equal(journal.read("session-1").length, 1);

  const recovered = await runtime.recover({ text: "the exact source in src/a.ts", exactRequired: true });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.materialization.mode, "restore");
  assert.equal(recovered.envelope.content, "export const VALUE = 1;");
  assert.ok(recovered.lease?.handle);
  const unacknowledged = await runtime.messageEnd({
    role: "assistant",
    content: [{ type: "text", text: "The value is one." }],
  });
  assert.match(unacknowledged.message.content.at(-1).text, /Verified exact evidence/);
  assert.equal(runtime.status().activeLeaseCount, 1);

  const incompleteUse = await runtime.useEvidence({
    handle: recovered.lease.handle,
    status: "used",
    excerpt: "export",
  });
  assert.equal(incompleteUse.status, "rejected");
  assert.equal(runtime.status().activeLeaseCount, 1);
  const acceptedUse = await runtime.useEvidence({
    handle: recovered.lease.handle,
    status: "used",
    excerpt: recovered.lease.excerpt,
  });
  assert.equal(acceptedUse.status, "ok");
  const finalized = await runtime.messageEnd({
    role: "assistant",
    content: [{ type: "text", text: `The value is one.\n${recovered.lease.excerpt}` }],
  });
  assert.equal(finalized, undefined);
  assert.equal(runtime.status().activeLeaseCount, 0);

  const pinned = await runtime.pin(["ctx:tool-2"]);
  assert.deepEqual(pinned.changed, ["ctx:tool-2"]);
  assert.deepEqual(runtime.status().pinnedRefs, ["ctx:tool-2"]);
  const blockedCleanup = await runtime.cleanup([{ ref: "ctx:tool-2" }]);
  assert.equal(blockedCleanup.status, "rejected");
  assert.match(blockedCleanup.reason, /pinned/);
  await runtime.unpin(["ctx:tool-2"]);
  assert.deepEqual(runtime.status().pinnedRefs, []);

  const reset = await runtime.reset();
  assert.equal(reset.status, "ok");
  assert.deepEqual(runtime.status().residency, {});
});

test("retained cleanup creates source-grounded carry-forward and replay restores it", async () => {
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
  await consumeTwo(runtime);

  const result = await runtime.cleanup([{ ref: "ctx:tool-1", retained: "Remember that VALUE is one." }]);
  assert.equal(result.status, "ok");
  assert.equal(runtime.status().residency["ctx:tool-1"], "retained");
  assert.equal(runtime.status().activeCarryForwardCount, 1);
  const entry = journal.read("session-1")[0];
  assert.deepEqual(entry.changes[0].carryForward.scope, "source");
  assert.deepEqual(entry.changes[0].carryForward.owner, "model");
  assert.doesNotMatch(JSON.stringify(entry), /export const VALUE/);

  const restarted = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  assert.equal((await restarted.start()).status, "ready");
  assert.equal(restarted.status().activeCarryForwardCount, 1);
  assert.equal(
    restarted.list().sources.find((source) => source.ref === "ctx:tool-1").retainedMeaning,
    "Remember that VALUE is one.",
  );
  await restarted.reset();
  assert.equal(restarted.status().activeCarryForwardCount, 0);
});

test("user-only purge removes Context Control sidecar state without touching canonical session entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "context-control-purge-"));
  try {
    const path = join(root, "session", "journal.jsonl");
    const { ctx, entries } = createSession();
    const canonicalBefore = structuredClone(entries);
    const journal = new FileContextControlJournal(path);
    const runtime = new ContextControlRuntime({
      ctx,
      mode: "active",
      cleanupMode: "automatic",
      recoveryMode: "model-only",
      journal,
    });
    await runtime.start();
    await consumeTwo(runtime);
    await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);

    const purged = await runtime.purge();
    assert.equal(purged.status, "ok");
    assert.deepEqual(journal.read("session-1"), []);
    assert.deepEqual(entries, canonicalBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Automatic policy detects an explicit historical gap and injects evidence before the provider", async () => {
  const { ctx } = createSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    recoveryScope: "active-branch",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  await consumeTwo(runtime);
  await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);

  runtime.setPrompt("What exact value did we find earlier in src/a.ts?");
  const result = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  const recovery = result.messages.find((message) => message.customType === "context-control-recovery");
  assert.ok(recovery);
  assert.match(recovery.content, /export const VALUE = 1/);
  assert.equal(runtime.status().activeLeaseCount, 1);
  const recoveryHandle = recovery.details.leaseHandle;
  const acceptedUse = await runtime.useEvidence({
    handle: recoveryHandle,
    status: "used",
    excerpt: "export const VALUE = 1;",
  });
  assert.equal(acceptedUse.status, "ok");
  const final = await runtime.messageEnd({
    role: "assistant",
    content: [{ type: "text", text: "The value is one." }],
  });
  assert.match(final.message.content.at(-1).text, /Verified exact evidence/);
  assert.equal(runtime.status().activeLeaseCount, 0);
});

test("Approval policy proposes proactive recovery without materializing until approval", async () => {
  const { ctx } = createSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-approval",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  await consumeTwo(runtime);
  assert.equal((await runtime.cleanup([{ ref: "ctx:tool-1" }])).status, "ok");
  runtime.setPrompt("What exact value did we find earlier in src/a.ts?");
  const proposalResult = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(proposalResult.proposal.kind, "recovery");
  assert.equal(proposalResult.proposal.refs[0], "ctx:tool-1");
  assert.doesNotMatch(proposalResult.messages.at(-1).content, /export const VALUE/);
  assert.equal(runtime.status().activeLeaseCount, 0);

  const recovered = await runtime.decideProposal({
    proposalId: proposalResult.proposal.id,
    action: "approve",
    handles: proposalResult.proposal.selectedHandles,
    presentation: "full",
  });
  assert.equal(recovered.status, "recovered");
  assert.equal(recovered.envelope.content, "export const VALUE = 1;");
  assert.equal(runtime.status().residency["ctx:tool-1"], "full");
});

test("rejected cleanup proposals stay suppressed without new source state", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();
  await consumeTwo(runtime);

  const proposalResult = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(proposalResult.proposal?.kind, "cleanup");
  const rejected = await runtime.decideProposal({ proposalId: proposalResult.proposal.id, action: "reject" });
  assert.equal(rejected.status, "ok");

  const afterReject = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(afterReject.proposal, undefined);
  assert.equal(runtime.status().pendingProposal, false);
  assert.equal(runtime.status().suppressedProposalCount, 1);
  assert.equal(journal.read("session-1").filter((entry) => entry.kind === "disposition").length, 1);

  const restarted = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal,
  });
  await restarted.start();
  assert.equal(restarted.status().suppressedProposalCount, 1);
  assert.equal((await restarted.project([toolMessage("call-1"), toolMessage("call-2")])).proposal, undefined);

  await runtime.reset();
  const afterReset = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(afterReset.proposal?.kind, "cleanup");
});

test("previewing a cleanup proposal leaves it actionable", async () => {
  const { ctx } = createSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  await consumeTwo(runtime);

  const proposalResult = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  const preview = await runtime.decideProposal({ proposalId: proposalResult.proposal.id, action: "preview" });
  assert.equal(preview.status, "ok");
  const afterPreview = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(afterPreview.proposal?.id, proposalResult.proposal.id);
  assert.equal(runtime.status().suppressedProposalCount, 0);
});

test("approval creates a metadata-only proposal and applies only an explicit decision", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-approval",
    recoveryScope: "current-session",
    journal,
  });
  await runtime.start();
  await consumeTwo(runtime);
  const first = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(first.proposal.refs.length, 1);
  assert.equal(first.proposal.refs[0], "ctx:tool-1");
  assert.equal(journal.read("session-1").length, 0);
  assert.equal(first.messages.at(-1).customType, "context-control-proposal");
  assert.match(first.messages.at(-1).content, /bounded projection proposal/);

  const preview = await runtime.decideProposal({ proposalId: first.proposal.id, action: "preview" });
  assert.equal(preview.status, "ok");
  assert.equal(journal.read("session-1").length, 0);
  const approved = await runtime.decideProposal({ proposalId: first.proposal.id, action: "approve" });
  assert.equal(approved.status, "ok");
  assert.equal(journal.read("session-1").length, 1);
  const final = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.match(final.messages[0].content[0].text, /context archived/);
  assert.equal(runtime.status().pendingProposal, false);
});

test("cleanup proposal modifications resolve only ephemeral candidate handles", async () => {
  const { ctx } = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();
  await consumeTwo(runtime);
  const proposalResult = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(proposalResult.proposal?.kind, "cleanup");
  const handle = proposalResult.proposal.candidates[0].handle;
  assert.match(handle, /^cc-h-/);

  const invalidRef = await runtime.decideProposal({
    proposalId: proposalResult.proposal.id,
    action: "modify",
    changes: [{ ref: "ctx:tool-1", state: "retained", retainedMeaning: "invalid ref path" }],
  });
  assert.equal(invalidRef.status, "rejected");
  assert.equal(invalidRef.reason, "decision_out_of_scope");

  const modified = await runtime.decideProposal({
    proposalId: proposalResult.proposal.id,
    action: "modify",
    changes: [{ handle, state: "retained", retainedMeaning: "Keep the validated result." }],
  });
  assert.equal(modified.status, "ok");
  assert.equal(runtime.status().residency["ctx:tool-1"], "retained");
});

test("approval cleanup rejects a source that changes after proposal creation", async () => {
  const session = createSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-approval",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();
  await consumeTwo(runtime);
  const proposalResult = await runtime.project([toolMessage("call-1"), toolMessage("call-2")]);
  assert.equal(proposalResult.proposal?.kind, "cleanup");
  const source = session.entries.find((entry) => entry.id === "tool-1");
  source.message.content = [{ type: "text", text: "export const VALUE = 2;" }];

  const result = await runtime.decideProposal({
    proposalId: proposalResult.proposal.id,
    action: "approve",
  });
  assert.equal(result.status, "rejected");
  assert.equal(result.reason, "proposal-stale");
  assert.deepEqual(runtime.status().residency, {});
});

test("journal replay restores pinned and reduced projection state without canonical payload", async () => {
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
  await consumeTwo(first);
  await first.project([toolMessage("call-1"), toolMessage("call-2")]);
  await first.pin(["ctx:tool-2"]);

  const second = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  assert.equal((await second.start()).status, "ready");
  assert.equal(second.status().residency["ctx:tool-1"], "reference");
  assert.deepEqual(second.status().pinnedRefs, ["ctx:tool-2"]);
  assert.equal(second.status().canonicalPayloadsInJournal, 0);
});

test("journal replay survives descendant leaf changes without reviving a divergent branch", async () => {
  const { entries } = createSession();
  let leafId = "tool-1";
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-1",
      getLeafId: () => leafId,
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
    },
  };
  const journal = new MemoryContextControlJournal();
  const first = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  await first.start();
  await consumeTwo(first);
  await first.project([toolMessage("call-1"), toolMessage("call-2")]);

  leafId = "tool-2";
  const descendant = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  assert.equal((await descendant.start()).status, "ready");
  assert.equal(descendant.status().residency["ctx:tool-1"], "reference");

  leafId = "divergent-tool";
  const divergentEntries = [
    entries[0],
    {
      type: "message",
      id: "divergent-user",
      parentId: null,
      timestamp: "2026-08-29T00:01:00.000Z",
      message: { role: "user", content: "Other branch" },
    },
    {
      type: "message",
      id: "divergent-assistant",
      parentId: "divergent-user",
      timestamp: "2026-08-29T00:01:01.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "divergent-call", name: "read", arguments: { path: "src/other.ts" } }],
      },
    },
    {
      type: "message",
      id: "divergent-tool",
      parentId: "divergent-assistant",
      timestamp: "2026-08-29T00:01:02.000Z",
      message: {
        role: "toolResult",
        toolCallId: "divergent-call",
        toolName: "read",
        content: [{ type: "text", text: "other branch" }],
        isError: false,
      },
    },
  ];
  const divergentCtx = {
    ...ctx,
    sessionManager: {
      ...ctx.sessionManager,
      getLeafId: () => leafId,
      getBranch: () => divergentEntries,
      getEntries: () => divergentEntries,
      buildContextEntries: () => divergentEntries,
    },
  };
  const divergent = new ContextControlRuntime({
    ctx: divergentCtx,
    mode: "active",
    cleanupMode: "automatic",
    recoveryMode: "automatic",
    journal,
  });
  assert.equal((await divergent.start()).status, "ready");
  assert.deepEqual(divergent.status().residency, {});
});

test("Context Control tools expose strict operations and execute against the bound runtime", async () => {
  const tools = [];
  registerContextControlTools({ registerTool: (tool) => tools.push(tool) }, () => undefined);
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["context_control", "context_control_use_evidence", "context_control_decide"],
  );
  assert.deepEqual(
    tools[0].parameters.oneOf.map((variant) => variant.properties.operation.const),
    ["status", "list", "search", "retrieve", "explain", "cleanup", "recover", "pin", "unpin", "reset"],
  );
  assert.ok(tools[0].parameters.oneOf.every((variant) => variant.additionalProperties === false));
  const evidenceUseTool = tools.find((tool) => tool.name === "context_control_use_evidence");
  const decisionTool = tools.find((tool) => tool.name === "context_control_decide");
  assert.equal(evidenceUseTool.parameters.additionalProperties, false);
  assert.deepEqual(evidenceUseTool.parameters.required, ["handle", "status"]);
  assert.equal(decisionTool.parameters.additionalProperties, false);
  assert.deepEqual(decisionTool.parameters.required, ["proposalId", "action"]);
});

test("unavailable recovery exposes its safe abstention handle in model-visible tool output", async () => {
  const { ctx } = createSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const tools = [];
  registerContextControlTools({ registerTool: (tool) => tools.push(tool) }, () => runtime);
  const contextTool = tools.find((tool) => tool.name === "context_control");
  const result = await contextTool.execute("missing-evidence", {
    operation: "recover",
    need: { text: "historical evidence from a missing source" },
  });
  assert.match(result.content[0].text, /Safe abstention handle: cc-h-use-/);
});

test("packaged Context Control entrypoint loads the configured runtime for manual use", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-entrypoint-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        contextControl: {
          enabled: true,
          cleanupMode: "automatic",
          recoveryMode: "automatic",
          recoveryScope: "active-branch",
        },
      }),
      "utf8",
    );
    const { entries, ctx: base } = createSession();
    const ctx = { ...base, cwd, ui: { notify: () => undefined, setStatus: () => undefined } };
    const handlers = new Map();
    const tools = [];
    const pi = {
      registerTool: (tool) => tools.push(tool),
      on: (event, handler) => handlers.set(event, handler),
    };
    const state = explicitContextControlExtension(pi);
    await handlers.get("session_start")({}, ctx);
    assert.equal(state.enabled, true);
    assert.equal(state.mode, "active");
    assert.equal(state.cleanupMode, "automatic");
    assert.equal(state.recoveryMode, "automatic");
    assert.equal(state.recoveryScope, "active-branch");
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["context_control", "context_control_use_evidence", "context_control_decide"],
    );
    assert.equal(state.runtime.status().cleanupMode, "automatic");
    assert.equal(state.runtime.status().recoveryMode, "automatic");
    await handlers.get("session_shutdown")({ reason: "test" }, ctx);
    assert.equal(state.runtime, undefined);
    assert.equal(entries.length > 0, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("main Pi extension exposes the approval decision tool only for approval policy", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-approval-surface-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        contextControl: {
          enabled: true,
          cleanupMode: "model-approval",
          recoveryMode: "model-approval",
          recoveryScope: "current-project",
        },
      }),
      "utf8",
    );
    const handlers = new Map();
    const tools = [];
    let activeTools = [];
    const ctx = {
      cwd,
      ui: { notify: () => undefined, setStatus: () => undefined },
      sessionManager: {
        getSessionId: () => "approval-session",
        getLeafId: () => "approval-leaf",
        getBranch: () => [],
        getEntries: () => [],
        buildContextEntries: () => [],
      },
    };
    const pi = {
      registerTool: (tool) => tools.push(tool),
      registerCommand: () => undefined,
      registerShortcut: () => undefined,
      on: (event, handler) => handlers.set(event, handler),
      getAllTools: () => tools.map((tool) => ({ name: tool.name })),
      getActiveTools: () => activeTools,
      setActiveTools: (names) => {
        activeTools = [...names];
      },
    };
    freeflowExtension(pi);
    await handlers.get("session_start")({}, ctx);
    assert.ok(activeTools.includes("context_control"));
    assert.ok(activeTools.includes("context_control_use_evidence"));
    assert.ok(activeTools.includes("context_control_decide"));
    assert.ok(!activeTools.includes("freeflow_context"));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("main Pi extension exposes user-only Context Control sidecar purge", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-purge-command-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        contextControl: {
          enabled: true,
          cleanupMode: "automatic",
          recoveryMode: "model-only",
          recoveryScope: "active-branch",
        },
      }),
      "utf8",
    );
    const { entries, ctx: base } = createSession();
    const notifications = [];
    const commands = new Map();
    const ctx = {
      ...base,
      cwd,
      isIdle: () => true,
      ui: {
        notify: (message, level) => notifications.push({ message, level }),
        setStatus: () => undefined,
      },
    };
    const tools = [];
    let activeTools = [];
    const pi = {
      registerTool: (tool) => tools.push(tool),
      registerCommand: (name, definition) => commands.set(name, definition),
      registerShortcut: () => undefined,
      on: (event, handler) => commands.set(`event:${event}`, handler),
      getAllTools: () => tools.map((tool) => ({ name: tool.name })),
      getActiveTools: () => activeTools,
      setActiveTools: (names) => {
        activeTools = [...names];
      },
    };
    freeflowExtension(pi);
    await commands.get("event:session_start")({}, ctx);
    await commands.get("freeflow").handler("context-control status", ctx);
    assert.match(notifications.at(-1).message, /Context Control status/);
    await commands.get("freeflow").handler("context-control list", ctx);
    assert.match(notifications.at(-1).message, /Context Control list/);
    const restoreResult = await commands.get("freeflow").handler("context-control restore ctx:tool-1", ctx);
    assert.equal(restoreResult.changed, false);
    assert.match(notifications.at(-1).message, /Context Control restore: ok/);
    await commands.get("freeflow").handler("context-control reset all", ctx);
    assert.match(notifications.at(-1).message, /Context Control reset: ok/);
    const before = structuredClone(entries);
    await commands.get("freeflow").handler("context-control purge", ctx);
    assert.match(notifications.at(-1).message, /sidecar metadata purged/);
    assert.deepEqual(entries, before);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("main Pi extension activates Context Control from exactly four config settings", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-main-extension-"));
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        contextControl: {
          enabled: true,
          cleanupMode: "automatic",
          recoveryMode: "automatic",
          recoveryScope: "current-session",
        },
      }),
      "utf8",
    );
    const { entries, ctx: base } = createSession();
    const notifications = [];
    const statuses = [];
    const ctx = {
      ...base,
      cwd,
      ui: {
        notify: (message, level) => notifications.push({ message, level }),
        setStatus: (_name, value) => statuses.push(value),
      },
      sessionManager: {
        ...base.sessionManager,
        getSessionId: () => "session-1",
        getLeafId: () => "leaf-1",
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () => entries.filter((entry) => entry.type === "message"),
      },
    };
    const handlers = new Map();
    const tools = [];
    let activeTools = [];
    const pi = {
      registerTool: (tool) => tools.push(tool),
      registerCommand: () => undefined,
      registerShortcut: () => undefined,
      on: (event, handler) => handlers.set(event, handler),
      getAllTools: () => tools.map((tool) => ({ name: tool.name })),
      getActiveTools: () => activeTools,
      setActiveTools: (names) => {
        activeTools = [...names];
      },
    };
    freeflowExtension(pi);
    await handlers.get("session_start")({}, ctx);
    assert.ok(activeTools.includes("context_control"));
    assert.ok(activeTools.includes("context_control_use_evidence"));
    assert.ok(!activeTools.includes("context_control_decide"));
    assert.ok(!activeTools.includes("freeflow_context"));

    const first = toolMessage("call-1");
    const second = toolMessage("call-2");
    await handlers.get("context")({ messages: [first] }, ctx);
    await handlers.get("before_provider_request")({}, ctx);
    await handlers.get("turn_end")({}, ctx);
    await handlers.get("context")({ messages: [first, second] }, ctx);
    await handlers.get("before_provider_request")({}, ctx);
    await handlers.get("turn_end")({}, ctx);
    const final = await handlers.get("context")({ messages: [first, second] }, ctx);
    assert.match(final.messages[0].content[0].text, /context archived/);
    const contextTool = tools.find((tool) => tool.name === "context_control");
    const status = await contextTool.execute("call", { operation: "status" }, undefined, undefined, ctx);
    assert.match(status.content[0].text, /cleanup=automatic/);
    assert.match(status.content[0].text, /recovery=automatic/);
    assert.match(status.content[0].text, /scope=current-session/);
    assert.equal(notifications.length, 0);
    assert.ok(statuses.length > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("main Pi extension proves replacement-only Context Control activation without legacy configuration", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-replacement-only-"));
  const previousHome = process.env.HOME;
  const handlers = new Map();
  const commands = new Map();
  const tools = [];
  let activeTools = [];
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          contextControl: {
            enabled: true,
            cleanupMode: "model-only",
            recoveryMode: "model-only",
            recoveryScope: "active-branch",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    const { entries, ctx: base } = createSession();
    process.env.HOME = cwd;
    execFileSync("git", ["-C", cwd, "init", "-q"]);
    const canonicalEntries = structuredClone(entries);
    const activeUser = entries.find((entry) => entry.id === "user-2");
    const ctx = {
      ...base,
      cwd,
      isIdle: () => true,
      ui: {
        notifications: [],
        statuses: [],
        notify(message, level) {
          this.notifications.push({ message, level });
        },
        setStatus(_name, value) {
          this.statuses.push(value);
        },
      },
      sessionManager: {
        ...base.sessionManager,
        getSessionId: () => "session-1",
        getLeafId: () => "user-2",
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () => (activeUser ? [activeUser] : []),
      },
    };
    const pi = {
      registerTool(tool) {
        const index = tools.findIndex((existing) => existing.name === tool.name);
        if (index >= 0) tools[index] = tool;
        else tools.push(tool);
      },
      registerCommand(name, definition) {
        commands.set(name, definition);
      },
      registerShortcut() {},
      on(event, handler) {
        handlers.set(event, handler);
      },
      getAllTools() {
        return tools.map((tool) => ({ name: tool.name }));
      },
      getActiveTools() {
        return activeTools;
      },
      setActiveTools(names) {
        activeTools = [...names];
      },
    };

    freeflowExtension(pi);
    await handlers.get("session_start")({}, ctx);
    assert.ok(activeTools.includes("context_control"));
    assert.ok(activeTools.includes("context_control_use_evidence"));
    assert.ok(!activeTools.includes("context_control_decide"));
    assert.ok(!activeTools.includes("freeflow_context"));

    const before = await handlers.get("before_agent_start")({ systemPrompt: "base prompt" }, ctx);
    assert.match(before.systemPrompt, /## Context Control Cue/);
    assert.doesNotMatch(before.systemPrompt, /## Context Virtualization Cue|## Conversation History Cue/);

    const provider = await handlers.get("context")({ messages: activeUser ? [activeUser.message] : [] }, ctx);
    const runtimeState = provider.messages.findLast((message) => message.customType === "freeflow-runtime-state");
    assert.match(runtimeState.content, /Context Control: active/);
    assert.doesNotMatch(runtimeState.content, /Context Virtualization|Conversation History|Freeflow Context/);

    const resources = await handlers.get("resources_discover")({ cwd }, ctx);
    assert.ok(resources.skillPaths.some((path) => path.endsWith("/capabilities/context-control/SKILL.md")));
    assert.ok(!resources.skillPaths.some((path) => /context-virtualization|conversation-history/.test(path)));

    await commands.get("freeflow").handler("status", ctx);
    const statusMessage = ctx.ui.notifications.at(-1).message;
    assert.match(statusMessage, /context control:/i);
    assert.doesNotMatch(statusMessage, /context: .*virtualization|history/i);

    const contextTool = tools.find((tool) => tool.name === "context_control");
    const search = await contextTool.execute("search", {
      operation: "search",
      query: "Inspect the file.",
      kinds: ["user"],
      includeVisible: true,
    });
    assert.equal(search.details.result.status, "ok");
    assert.equal(search.details.result.hits[0].kind, "user");

    const retrieved = await contextTool.execute("retrieve", {
      operation: "retrieve",
      handles: [search.details.result.hits[0].handle],
    });
    assert.equal(retrieved.details.result.status, "ok");
    assert.equal(retrieved.details.result.items[0].kind, "user");
    assert.match(retrieved.details.result.items[0].content, /Inspect the file/);

    const cleaned = await contextTool.execute("cleanup", {
      operation: "cleanup",
      targets: [{ ref: "ctx:user-2", retained: "The user continued the task." }],
    });
    assert.equal(cleaned.details.result.status, "ok");
    assert.deepEqual(cleaned.details.result.changed, ["ctx:user-2"]);

    const recovered = await contextTool.execute("recover", {
      operation: "recover",
      need: { text: "Continue.", exactRequired: true, scope: { kinds: ["user"] } },
    });
    assert.equal(recovered.details.result.status, "recovered");
    assert.equal(recovered.details.result.envelope.kind, "user");

    await handlers.get("session_shutdown")({ reason: "test" });
    assert.deepEqual(entries, canonicalEntries);
    const sidecarFiles = await filesUnder(join(cwd, ".freeflow", "context-control"));
    assert.ok(sidecarFiles.some((path) => path.endsWith("journal.jsonl")));
    assert.ok(sidecarFiles.some((path) => path.endsWith("audit.jsonl")));
    const persisted = (await Promise.all(sidecarFiles.map((path) => readFile(path, "utf8")))).join("\n");
    assert.doesNotMatch(persisted, /export const VALUE = 1;/);
    assert.doesNotMatch(persisted, /src\/a\.ts/);
  } finally {
    const shutdown = handlers.get("session_shutdown");
    if (shutdown) await shutdown({ reason: "test" });
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("main Pi extension leaves legacy context state inert and canonical", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-legacy-state-"));
  const previousHome = process.env.HOME;
  const handlers = new Map();
  const tools = [];
  let activeTools = [];
  let currentBranch;
  try {
    await mkdir(join(cwd, ".freeflow"));
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify(
        {
          contextControl: {
            enabled: true,
            cleanupMode: "model-only",
            recoveryMode: "model-only",
            recoveryScope: "active-branch",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    process.env.HOME = cwd;
    execFileSync("git", ["-C", cwd, "init", "-q"]);

    const { entries: baseEntries } = createSession();
    const legacyProjection = {
      type: "custom",
      id: "legacy-projection",
      parentId: "tool-2",
      customType: "freeflow-context-projection",
      data: {
        version: 1,
        actor: "model",
        changes: [
          {
            source: { sessionId: "session-1", entryId: "tool-1", toolCallId: "call-1", toolName: "read" },
            projection: {
              mode: "archived",
              retained: "LEGACY_CANONICAL_PAYLOAD_SHOULD_NOT_BE_COPIED",
            },
          },
        ],
      },
    };
    const legacyReset = {
      type: "custom",
      id: "legacy-reset",
      parentId: "legacy-projection",
      customType: "freeflow-context-projection",
      data: { version: 1, actor: "user", reset: "all" },
    };
    const legacyOverrides = {
      type: "custom",
      id: "legacy-overrides",
      parentId: "legacy-reset",
      customType: "freeflow-session-overrides",
      data: { overrides: { contextVirtualization: true, conversationHistory: true } },
    };
    const legacyCompaction = {
      type: "compaction",
      id: "legacy-compaction",
      parentId: "legacy-overrides",
      summary: "LEGACY_COMPACTION_PAYLOAD_SHOULD_NOT_BE_COPIED",
      timestamp: "2026-09-02T00:01:00.000Z",
    };
    const activeBranch = [...baseEntries, legacyProjection, legacyReset, legacyOverrides, legacyCompaction];
    const siblingBranch = [
      baseEntries[0],
      {
        type: "message",
        id: "legacy-sibling-user",
        parentId: null,
        timestamp: "2026-09-02T00:02:00.000Z",
        message: { role: "user", content: "The divergent branch remains historical." },
      },
      {
        type: "branch_summary",
        id: "legacy-sibling-summary",
        parentId: "legacy-sibling-user",
        timestamp: "2026-09-02T00:02:01.000Z",
        summary: "LEGACY_BRANCH_SUMMARY_PAYLOAD_SHOULD_NOT_BE_COPIED",
      },
    ];
    const allEntries = [...activeBranch, ...siblingBranch.slice(1)];
    const canonicalEntries = structuredClone(allEntries);
    currentBranch = activeBranch;
    const ctx = {
      cwd,
      ui: { notify() {}, setStatus() {} },
      sessionManager: {
        getSessionId: () => "session-1",
        getLeafId: () => currentBranch.at(-1)?.id ?? null,
        getBranch: () => currentBranch,
        getEntries: () => allEntries,
        buildContextEntries: () => currentBranch.filter((entry) => entry.type === "message"),
      },
    };
    const pi = {
      registerTool(tool) {
        const index = tools.findIndex((existing) => existing.name === tool.name);
        if (index >= 0) tools[index] = tool;
        else tools.push(tool);
      },
      registerCommand() {},
      registerShortcut() {},
      on(event, handler) {
        handlers.set(event, handler);
      },
      getAllTools: () => tools.map((tool) => ({ name: tool.name })),
      getActiveTools: () => activeTools,
      setActiveTools: (names) => {
        activeTools = [...names];
      },
    };

    freeflowExtension(pi);
    await handlers.get("session_start")({}, ctx);
    const capabilityState = await readCapabilityState(cwd);
    assert.equal("contextVirtualization" in capabilityState, false);
    assert.equal("conversationHistory" in capabilityState, false);
    assert.equal(capabilityState.contextControl.effective, true);
    assert.ok(activeTools.includes("context_control"));
    assert.ok(!activeTools.includes("freeflow_context"));

    const contextTool = tools.find((tool) => tool.name === "context_control");
    const originalUser = activeBranch.find((entry) => entry.id === "user-2").message;
    const originalTool = activeBranch.find((entry) => entry.id === "tool-1").message;
    const firstContext = await handlers.get("context")({ messages: [originalUser, originalTool] }, ctx);
    assert.deepEqual(firstContext.messages.slice(0, 2), [originalUser, originalTool]);
    const initialStatus = await contextTool.execute("status", { operation: "status" });
    assert.deepEqual(initialStatus.details.result.residency, {});

    const cleaned = await contextTool.execute("cleanup", {
      operation: "cleanup",
      targets: [{ ref: "ctx:user-2", retained: "The current user continuation." }],
    });
    assert.equal(cleaned.details.result.status, "ok");

    currentBranch = siblingBranch;
    await handlers.get("session_tree")({}, ctx);
    await handlers.get("session_compact")({}, ctx);
    const siblingContext = await handlers.get("context")({ messages: [siblingBranch[1].message] }, ctx);
    assert.deepEqual(siblingContext.messages[0], siblingBranch[1].message);
    await handlers.get("session_shutdown")({ reason: "test" }, ctx);

    assert.deepEqual(allEntries, canonicalEntries);
    const sidecarFiles = await filesUnder(join(cwd, ".freeflow", "context-control"));
    assert.ok(sidecarFiles.some((path) => path.endsWith("journal.jsonl")));
    assert.ok(sidecarFiles.some((path) => path.endsWith("audit.jsonl")));
    const persisted = (await Promise.all(sidecarFiles.map((path) => readFile(path, "utf8")))).join("\n");
    assert.doesNotMatch(persisted, /LEGACY_CANONICAL_PAYLOAD_SHOULD_NOT_BE_COPIED/);
    assert.doesNotMatch(persisted, /LEGACY_COMPACTION_PAYLOAD_SHOULD_NOT_BE_COPIED/);
    assert.doesNotMatch(persisted, /LEGACY_BRANCH_SUMMARY_PAYLOAD_SHOULD_NOT_BE_COPIED/);
  } finally {
    const shutdown = handlers.get("session_shutdown");
    if (shutdown) await shutdown({ reason: "test" });
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    await rm(cwd, { recursive: true, force: true });
  }
});
