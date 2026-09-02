import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { ContextControlRuntime } from "../../dist/context-control/core/runtime.js";
import { registerContextControlTools } from "../../dist/context-control/interfaces/tool.js";
import { MemoryContextControlJournal } from "../../dist/context-control/persistence/journal.js";

const execFileAsync = promisify(execFile);

function createRecoverSession() {
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-recover",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "recover-user",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: "The generic-recover-marker is canonical user evidence." },
    },
    {
      type: "message",
      id: "recover-assistant",
      parentId: "recover-user",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The assistant context is ordinary." }] },
    },
    {
      type: "message",
      id: "recover-tool",
      parentId: "recover-assistant",
      timestamp: "2026-09-02T00:00:02.500Z",
      message: {
        role: "toolResult",
        toolCallId: "recover-call",
        toolName: "read",
        content: [{ type: "text", text: "The explicit tool evidence is recoverable." }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "recover-partial-tool",
      parentId: "recover-tool",
      timestamp: "2026-09-02T00:00:02.750Z",
      message: {
        role: "toolResult",
        toolCallId: "recover-partial-call",
        toolName: "read",
        content: [{ type: "text", text: "The partial tool evidence is truncated." }],
        isError: false,
        details: { truncated: true },
      },
    },
    {
      type: "branch_summary",
      id: "recover-summary",
      parentId: "recover-assistant",
      timestamp: "2026-09-02T00:00:03.000Z",
      summary: "The summary context is ordinary.",
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
        getSessionId: () => "session-recover",
        getLeafId: () => "recover-summary",
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () => activeEntries,
      },
    },
  };
}

test("Context Control recovers generic user evidence through the public tool", async () => {
  const { ctx, entries, setActiveEntries } = createRecoverSession();
  setActiveEntries([entries.find((entry) => entry.id === "recover-user")]);
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const tools = [];
  registerContextControlTools({ registerTool: (tool) => tools.push(tool) }, () => runtime);
  const contextTool = tools.find((tool) => tool.name === "context_control");

  const result = await contextTool.execute("recover", {
    operation: "recover",
    need: { text: "generic-recover-marker", exactRequired: true },
  });

  assert.equal(result.details.result.status, "recovered");
  assert.equal(result.details.result.envelope.kind, "user");
  assert.match(result.details.result.envelope.content, /generic-recover-marker/);
  assert.equal(result.details.result.materialization.mode, "none");
  assert.ok(result.details.result.lease?.handle);
});

test("Context Control excludes tool results by default and recovers explicit partial tool evidence safely", async () => {
  const { ctx } = createRecoverSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const tools = [];
  registerContextControlTools({ registerTool: (tool) => tools.push(tool) }, () => runtime);
  const contextTool = tools.find((tool) => tool.name === "context_control");

  const excluded = await contextTool.execute("recover", {
    operation: "recover",
    need: { text: "recoverable tool marker", exactRequired: true },
  });
  assert.equal(excluded.details.result.status, "unavailable");

  const explicit = await contextTool.execute("recover", {
    operation: "recover",
    need: {
      text: "recoverable",
      exactRequired: true,
      scope: { kinds: ["toolResult"] },
    },
  });
  assert.equal(explicit.details.result.status, "recovered");
  assert.equal(explicit.details.result.envelope.kind, "toolResult");

  const partial = await contextTool.execute("recover", {
    operation: "recover",
    need: {
      text: "truncated",
      exactRequired: true,
      scope: { kinds: ["toolResult"] },
    },
  });
  assert.equal(partial.details.result.status, "unavailable");
  assert.equal(partial.details.result.reason, "partial-exact-evidence");
});

test("Context Control distinguishes visible no-op, hidden retrieve, and reduced restore modes", async () => {
  const visible = createRecoverSession();
  visible.setActiveEntries([visible.entries.find((entry) => entry.id === "recover-user")]);
  const visibleRuntime = new ContextControlRuntime({
    ctx: visible.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await visibleRuntime.start();
  const visibleResult = await visibleRuntime.recoverDirect({ text: "generic-recover-marker", exactRequired: true });
  assert.equal(visibleResult.status, "recovered");
  assert.equal(visibleResult.materialization.mode, "none");

  const hidden = createRecoverSession();
  const hiddenRuntime = new ContextControlRuntime({
    ctx: hidden.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await hiddenRuntime.start();
  const hiddenResult = await hiddenRuntime.recoverDirect({ text: "generic-recover-marker", exactRequired: true });
  assert.equal(hiddenResult.status, "recovered");
  assert.equal(hiddenResult.materialization.mode, "retrieve");

  const reduced = createRecoverSession();
  reduced.setActiveEntries([reduced.entries.find((entry) => entry.id === "recover-user")]);
  const reducedRuntime = new ContextControlRuntime({
    ctx: reduced.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await reducedRuntime.start();
  assert.equal((await reducedRuntime.cleanup([{ ref: "ctx:recover-user" }])).status, "ok");
  const restored = await reducedRuntime.recoverDirect({ text: "generic-recover-marker", exactRequired: true });
  assert.equal(restored.status, "recovered");
  assert.equal(restored.materialization.mode, "restore");
  assert.equal(reducedRuntime.status().residency["ctx:recover-user"], "full");
});

test("Context Control recovers a generic source set by requested identifiers", async () => {
  const session = createRecoverSession();
  session.entries.find((entry) => entry.id === "recover-user").message.content = "set-user-marker canonical source";
  session.entries.find((entry) => entry.id === "recover-summary").summary = "set-summary-marker canonical summary";
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.recoverDirect({
    text: "set evidence",
    identifiers: ["set-user-marker", "set-summary-marker"],
    cardinality: { kind: "set", maxSources: 2 },
  });

  assert.equal(result.status, "recovered-set");
  assert.deepEqual(result.envelopes.map((envelope) => envelope.kind).sort(), ["summary", "user"]);
  assert.deepEqual(
    result.coverage.map((item) => item.key),
    ["set-user-marker", "set-summary-marker"],
  );
  assert.equal(result.leases.length, 2);
});

function createComparisonSession() {
  const header = {
    type: "session",
    version: 3,
    id: "session-comparison",
    timestamp: "2026-09-02T00:00:00.000Z",
    cwd: "/repo",
  };
  const current = {
    type: "message",
    id: "comparison-current",
    parentId: null,
    timestamp: "2026-09-02T00:00:02.000Z",
    message: { role: "user", content: "comparison-marker current evidence" },
  };
  const historical = {
    type: "message",
    id: "comparison-historical",
    parentId: null,
    timestamp: "2026-09-01T00:00:02.000Z",
    message: { role: "user", content: "comparison-marker historical evidence" },
  };
  const active = [header, current];
  const entries = [header, current, historical];
  return {
    entries,
    ctx: {
      cwd: "/repo",
      sessionManager: {
        getSessionId: () => "session-comparison",
        getLeafId: () => "comparison-current",
        getBranch: () => active,
        getEntries: () => entries,
        buildContextEntries: () => [current],
      },
    },
  };
}

test("Context Control keeps before and after generic recovery evidence distinct", async () => {
  const { ctx } = createComparisonSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.recoverDirect({
    text: "comparison-marker",
    cardinality: { kind: "comparison", maxSources: 2 },
  });

  assert.equal(result.status, "recovered-set");
  assert.deepEqual(
    result.coverage.map((item) => item.key),
    ["before", "after"],
  );
  assert.deepEqual(
    result.envelopes.map((envelope) => envelope.content),
    ["comparison-marker historical evidence", "comparison-marker current evidence"],
  );
  assert.equal(result.materialization.mode, "retrieve");
});

test("Context Control leaves conflicting generic recovery ambiguous without materializing evidence", async () => {
  const session = createRecoverSession();
  session.entries.push({
    type: "message",
    id: "recover-ambiguous-user",
    parentId: null,
    timestamp: "2026-09-02T00:00:04.000Z",
    message: { role: "user", content: "ambiguous-recover-marker same source" },
  });
  session.entries.find((entry) => entry.id === "recover-user").message.content = "ambiguous-recover-marker same source";
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "active-branch",
    journal,
  });
  await runtime.start();

  const result = await runtime.recoverDirect({ text: "ambiguous-recover-marker" });

  assert.equal(result.status, "ambiguous");
  assert.ok(result.candidates.length >= 2);
  assert.ok(result.abstentionHandle);
  assert.equal(result.lease, undefined);
  assert.equal(runtime.status().residency["ctx:recover-user"], undefined);
  assert.equal(runtime.status().activeEvidenceHandleCount, 1);
  assert.deepEqual(journal.read("session-recover"), []);
});

test("Context Control rejects generic recovery when the aggregate budget is exceeded", async () => {
  const header = {
    type: "session",
    version: 3,
    id: "session-budget",
    timestamp: "2026-09-02T00:00:00.000Z",
    cwd: "/repo",
  };
  const entries = [header];
  for (let index = 0; index < 3; index += 1) {
    entries.push({
      type: "message",
      id: `budget-user-${index}`,
      parentId: null,
      timestamp: `2026-09-02T00:00:0${index + 1}.000Z`,
      message: { role: "user", content: `budget-marker ${"x".repeat(9_000)}` },
    });
  }
  const ctx = {
    cwd: "/repo",
    sessionManager: {
      getSessionId: () => "session-budget",
      getLeafId: () => "budget-user-2",
      getBranch: () => entries,
      getEntries: () => entries,
      buildContextEntries: () => [],
    },
  };
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "active-branch",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.recoverDirect({
    text: "budget-marker",
    cardinality: { kind: "set", maxSources: 3 },
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "recovery-budget-exceeded");
});

test("Context Control abstains on a lone weak generic match", async () => {
  const { ctx } = createRecoverSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "active-branch",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.recoverDirect({ text: "generic-recover-marker absent-needle" });

  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "weak-match-unavailable");
  assert.ok(result.abstentionHandle);
});

test("Context Control accepts a complete strong-structured match for exact use", async () => {
  const { ctx } = createRecoverSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "active-branch",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.recoverDirect({
    text: "unrelated request wording",
    identifiers: ["recover-user"],
    exactRequired: true,
  });

  assert.equal(result.status, "recovered");
  assert.equal(result.envelope.source.entryId, "recover-user");
  assert.equal(result.lease.exactRequired, true);
});

test("Context Control leaves tied comparison candidates ambiguous", async () => {
  const session = createComparisonSession();
  session.entries.push({
    type: "message",
    id: "comparison-historical-two",
    parentId: null,
    timestamp: "2026-09-01T00:00:03.000Z",
    message: { role: "user", content: "comparison-tie-marker historical evidence" },
  });
  session.entries.find((entry) => entry.id === "comparison-current").message.content =
    "comparison-tie-marker current evidence";
  session.entries.find((entry) => entry.id === "comparison-historical").message.content =
    "comparison-tie-marker historical evidence";
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.recoverDirect({
    text: "comparison-tie-marker",
    cardinality: { kind: "comparison", maxSources: 2 },
  });

  assert.equal(result.status, "ambiguous");
  assert.ok(result.abstentionHandle);
});

test("Context Control redacts cross-session refs from generic recovery and audit", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-recover-project-"));
  try {
    await execFileAsync("git", ["init", "-q", cwd]);
    const current = [
      { type: "session", version: 3, id: "recover-current-project", timestamp: "2026-09-02T00:00:00.000Z", cwd },
      {
        type: "message",
        id: "recover-current-project-user",
        parentId: null,
        timestamp: "2026-09-02T00:00:01.000Z",
        message: { role: "user", content: "local evidence" },
      },
    ];
    const historical = [
      { type: "session", version: 3, id: "recover-external-session", timestamp: "2026-09-01T00:00:00.000Z", cwd },
      {
        type: "message",
        id: "external-user-a",
        parentId: null,
        timestamp: "2026-09-01T00:00:01.000Z",
        message: { role: "user", content: "external evidence alpha" },
      },
      {
        type: "message",
        id: "external-user-b",
        parentId: null,
        timestamp: "2026-09-01T00:00:02.000Z",
        message: { role: "user", content: "external evidence beta" },
      },
    ];
    const currentFile = join(cwd, "current.jsonl");
    await writeFile(currentFile, `${current.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    await writeFile(
      join(cwd, "historical.jsonl"),
      `${historical.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );
    const auditEvents = [];
    const ctx = {
      cwd,
      sessionManager: {
        getSessionId: () => "recover-current-project",
        getLeafId: () => "recover-current-project-user",
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
      audit: { record: async (event) => auditEvents.push(event) },
    });
    await runtime.start();

    const result = await runtime.recoverDirect({
      text: "external evidence",
      identifiers: ["external-user-a", "external-user-b"],
      cardinality: { kind: "set", maxSources: 2 },
    });

    assert.equal(result.status, "recovered-set");
    assert.ok(result.coverage.every((item) => item.handle && item.sourceRef === undefined));
    assert.doesNotMatch(JSON.stringify(result), /recover-external-session|external\.jsonl/);
    assert.doesNotMatch(JSON.stringify(auditEvents), /recover-external-session|external\.jsonl/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
