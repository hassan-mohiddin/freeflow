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

function createSearchSession() {
  const entries = [
    {
      type: "session",
      version: 3,
      id: "session-search",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "search-user",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: "The shared marker belongs to the user request." },
    },
    {
      type: "message",
      id: "search-assistant",
      parentId: "search-user",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The shared marker is in assistant context." }] },
    },
    {
      type: "message",
      id: "search-tool",
      parentId: "search-assistant",
      timestamp: "2026-09-02T00:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: "search-call",
        toolName: "read",
        content: [{ type: "text", text: "The shared marker is in ordinary tool output." }],
        isError: false,
      },
    },
    {
      type: "message",
      id: "search-control",
      parentId: "search-tool",
      timestamp: "2026-09-02T00:00:04.000Z",
      message: {
        role: "toolResult",
        toolCallId: "control-call",
        toolName: "context_control",
        content: [{ type: "text", text: "The recursive control marker is in Context Control output." }],
        isError: false,
      },
    },
    {
      type: "branch_summary",
      id: "search-summary",
      parentId: "search-control",
      timestamp: "2026-09-02T00:00:05.000Z",
      summary: "The shared marker is in the compacted summary.",
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
        getSessionId: () => "session-search",
        getLeafId: () => "search-summary",
        getBranch: () => entries,
        getEntries: () => entries,
        buildContextEntries: () => activeEntries,
      },
    },
  };
}

function createTieredSearchSession() {
  const active = [
    {
      type: "session",
      version: 3,
      id: "session-tiered",
      timestamp: "2026-09-02T00:00:00.000Z",
      cwd: "/repo",
    },
    {
      type: "message",
      id: "tiered-active-user",
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: "The active branch has ordinary context." },
    },
    {
      type: "message",
      id: "tiered-active-assistant",
      parentId: "tiered-active-user",
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The active branch continues." }] },
    },
  ];
  const sibling = [
    {
      type: "message",
      id: "tiered-sibling-user",
      parentId: null,
      timestamp: "2026-09-02T00:01:00.000Z",
      message: { role: "user", content: "The sibling branch has a historical sibling-marker." },
    },
    {
      type: "message",
      id: "tiered-sibling-assistant",
      parentId: "tiered-sibling-user",
      timestamp: "2026-09-02T00:01:01.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "The sibling branch was reviewed." }] },
    },
  ];
  const entries = [...active, ...sibling];
  return {
    entries,
    ctx: {
      cwd: "/repo",
      sessionManager: {
        getSessionId: () => "session-tiered",
        getLeafId: () => "tiered-active-assistant",
        getBranch: () => active,
        getEntries: () => entries,
        buildContextEntries: () => active.filter((entry) => entry.type === "message"),
      },
    },
  };
}

test("Context Control direct search reaches a sibling current-session generic source", async () => {
  const { ctx } = createTieredSearchSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    recoveryScope: "current-session",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.search({ query: "sibling-marker" });

  assert.equal(result.status, "ok");
  assert.deepEqual(
    result.hits.map((hit) => hit.kind),
    ["user"],
  );
  assert.equal(result.hits[0].tier, "current-session");
  assert.equal(result.hits[0].relation, "sibling-branch");
  assert.match(result.hits[0].handle, /^cc-h-search-/);

  const historical = await runtime.search({
    query: "sibling-marker",
    scope: { temporal: "historical" },
  });
  assert.equal(historical.hits.length, 1);
  assert.equal(historical.hits[0].temporal[0], "historical");

  const currentOnly = await runtime.search({
    query: "sibling-marker",
    scope: { temporal: "current" },
  });
  assert.equal(currentOnly.returned, 0);

  const activeOnly = await runtime.search({ query: "sibling-marker", scope: { maxTier: "active-branch" } });
  assert.equal(activeOnly.status, "ok");
  assert.equal(activeOnly.returned, 0);

  const narrowedToActiveBranch = await runtime.search({
    query: "sibling-marker",
    scope: { branch: "active" },
  });
  assert.equal(narrowedToActiveBranch.returned, 0);

  const widened = await runtime.search({ query: "sibling-marker", scope: { maxTier: "cross-session" } });
  assert.deepEqual(widened, { status: "rejected", operation: "search", reason: "scope_outside_config" });
});

test("Context Control direct search defaults to hidden user, assistant, and summary sources", async () => {
  const { ctx } = createSearchSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.search({ query: "shared marker" });

  assert.equal(result.status, "ok");
  assert.equal(result.operation, "search");
  assert.equal(result.coverage, "complete");
  assert.deepEqual(new Set(result.hits.map((hit) => hit.kind)), new Set(["user", "assistant", "summary"]));
  assert.ok(result.hits.every((hit) => /^cc-h-search-[a-z0-9_-]+$/.test(hit.handle)));
  assert.ok(result.hits.every((hit) => hit.tier === "active-branch" && hit.relation === "active-branch"));
  assert.ok(result.hits.every((hit) => hit.snippet.includes("shared marker")));
  assert.ok(result.hits.every((hit) => hit.match.matchedTerms.includes("shared")));
  assert.equal(
    result.hits.some((hit) => hit.ref === "ctx:search-tool"),
    false,
  );
  assert.equal(
    result.hits.some((hit) => hit.ref === "ctx:search-control"),
    false,
  );
});

test("Context Control exposes direct search through the registered tool", async () => {
  const { ctx } = createSearchSession();
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

  const result = await contextTool.execute("search", { operation: "search", query: "shared marker" });

  assert.equal(result.details.result.operation, "search");
  assert.equal(result.details.result.status, "ok");
  assert.match(result.content[0].text, /Context Control: search/);
  assert.match(result.content[0].text, /cc-h-search-/);
});

test("Context Control direct search explicitly includes ordinary tool results but excludes its own results", async () => {
  const { ctx } = createSearchSession();
  const journal = new MemoryContextControlJournal();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal,
  });
  await runtime.start();

  const byKind = await runtime.search({ query: "ordinary tool output", kinds: ["toolResult"] });
  assert.deepEqual(
    byKind.hits.map((hit) => hit.ref),
    ["ctx:search-tool"],
  );
  assert.deepEqual(byKind.hits[0].toolNames, ["read"]);

  const byTool = await runtime.search({ query: "ordinary tool output", toolNames: ["read"] });
  assert.deepEqual(
    byTool.hits.map((hit) => hit.ref),
    ["ctx:search-tool"],
  );

  const control = await runtime.search({ query: "recursive", kinds: ["toolResult"] });
  assert.equal(control.returned, 0);
  assert.deepEqual(journal.read("session-search"), []);
});

test("Context Control direct search requires explicit visible inclusion and reports complete zero hits", async () => {
  const session = createSearchSession();
  session.setActiveEntries([session.entries.find((entry) => entry.id === "search-user")]);
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const hiddenOnly = await runtime.search({ query: "user request" });
  assert.equal(hiddenOnly.coverage, "complete");
  assert.equal(hiddenOnly.returned, 0);

  const exhaustive = await runtime.search({ query: "user request", includeVisible: true });
  assert.deepEqual(
    exhaustive.hits.map((hit) => hit.ref),
    ["ctx:search-user"],
  );
  assert.equal(exhaustive.includeVisible, true);

  const zero = await runtime.search({ query: "no source contains this phrase" });
  assert.equal(zero.status, "ok");
  assert.equal(zero.coverage, "complete");
  assert.equal(zero.returned, 0);
  assert.deepEqual(zero.hits, []);
});

test("Context Control direct search distinguishes partial coverage from complete zero hits", async () => {
  const session = createSearchSession();
  session.entries.push({
    type: "message",
    id: "search-invalid",
    parentId: "search-summary",
    timestamp: "2026-09-02T00:00:06.000Z",
    message: { role: "assistant", content: [{ type: "toolCall", id: "missing-name" }] },
  });
  const runtime = new ContextControlRuntime({
    ctx: session.ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const result = await runtime.search({ query: "unfindableterm" });

  assert.equal(result.status, "ok");
  assert.equal(result.coverage, "partial");
  assert.ok(result.skippedSources >= 1);
  assert.equal(result.returned, 0);
  assert.deepEqual(result.hits, []);
});

test("Context Control direct search rejects oversized query and result bounds", async () => {
  const { ctx } = createSearchSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();

  const tooManyTerms = await runtime.search({
    query: Array.from({ length: 33 }, (_, index) => `term${index}`).join(" "),
  });
  const tooManyHits = await runtime.search({ query: "shared", limit: 21 });

  assert.deepEqual(tooManyTerms, { status: "rejected", operation: "search", reason: "query_terms_too_many" });
  assert.deepEqual(tooManyHits, { status: "rejected", operation: "search", reason: "limit_invalid" });
});

test("Context Control direct search returns a bounded unavailable result when cancelled", async () => {
  const { ctx } = createSearchSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  const controller = new AbortController();
  controller.abort();

  const result = await runtime.search({ query: "shared marker" }, controller.signal);

  assert.deepEqual(result, { status: "unavailable", operation: "search", reason: "search_cancelled" });
});

function genericSessionEntries(sessionId, cwd, marker, includeToolResult = false) {
  const entries = [
    { type: "session", version: 3, id: sessionId, timestamp: "2026-09-02T00:00:00.000Z", cwd },
    {
      type: "message",
      id: `${sessionId}-user`,
      parentId: null,
      timestamp: "2026-09-02T00:00:01.000Z",
      message: { role: "user", content: `Historical ${marker} user context.` },
    },
    {
      type: "message",
      id: `${sessionId}-assistant`,
      parentId: `${sessionId}-user`,
      timestamp: "2026-09-02T00:00:02.000Z",
      message: { role: "assistant", content: [{ type: "text", text: `Historical ${marker} assistant context.` }] },
    },
  ];
  if (includeToolResult) {
    entries.push({
      type: "message",
      id: `${sessionId}-tool`,
      parentId: `${sessionId}-assistant`,
      timestamp: "2026-09-02T00:00:03.000Z",
      message: {
        role: "toolResult",
        toolCallId: `${sessionId}-call`,
        toolName: "read",
        content: [{ type: "text", text: `Historical ${marker} tool-only context.` }],
        isError: false,
      },
    });
  }
  return entries;
}

test("Context Control direct search spans verified current-project generic sessions without leaking session identity", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-search-project-"));
  const otherCwd = await mkdtemp(join(tmpdir(), "context-control-search-other-"));
  try {
    await execFileAsync("git", ["init", "-q", cwd]);
    await execFileAsync("git", ["init", "-q", otherCwd]);
    const current = genericSessionEntries("search-current", cwd, "tierprobe local", false);
    const matching = genericSessionEntries("search-remote", cwd, "tierprobe generic", true);
    matching[2].message.content = [{ type: "text", text: "Historical supporting assistant context." }];
    matching[3].message.content = [{ type: "text", text: "Historical unique-tool-evidence context." }];
    matching.push({
      type: "branch_summary",
      id: "search-remote-summary",
      parentId: "search-remote-assistant",
      timestamp: "2026-09-02T00:00:04.000Z",
      summary: "Historical tierprobe-summary-only context.",
    });
    matching.push({
      type: "message",
      id: "search-remote-sensitive",
      parentId: "search-remote-summary",
      timestamp: "2026-09-02T00:00:05.000Z",
      message: {
        role: "toolResult",
        toolCallId: "search-remote-sensitive-call",
        toolName: "thinking",
        content: [{ type: "text", text: "sensitive-only context." }],
        isError: false,
      },
    });
    const foreign = genericSessionEntries("search-foreign", otherCwd, "foreign-only", false);
    const currentFile = join(cwd, "current.jsonl");
    await writeFile(currentFile, `${current.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    await writeFile(
      join(cwd, "matching.jsonl"),
      `${matching.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );
    await writeFile(
      join(cwd, "foreign.jsonl"),
      `${foreign.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );

    const ctx = {
      cwd,
      sessionManager: {
        getSessionId: () => "search-current",
        getLeafId: () => "search-current-assistant",
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

    const generic = await runtime.search({ query: "tierprobe generic" });
    assert.equal(generic.status, "ok");
    assert.equal(generic.coverage, "partial");
    assert.ok(generic.skippedSessions >= 1);
    assert.ok(generic.hits.length >= 1);
    assert.equal(generic.hits[0].kind, "user");
    assert.equal(generic.hits[0].tier, "cross-session");
    assert.equal(generic.hits[0].relation, "cross-session");
    assert.equal(generic.hits[0].ref, undefined);
    assert.equal(JSON.stringify(generic.hits[0]).includes("search-remote"), false);
    assert.equal(JSON.stringify(generic.hits[0]).includes(cwd), false);

    const defaultTool = await runtime.search({ query: "unique-tool-evidence" });
    assert.equal(defaultTool.returned, 0);
    const explicitTool = await runtime.search({ query: "unique-tool-evidence", kinds: ["toolResult"] });
    assert.equal(explicitTool.hits.length, 1);
    assert.equal(explicitTool.hits[0].tier, "cross-session");
    assert.equal(explicitTool.hits[0].kind, "toolResult");
    assert.equal(JSON.stringify(explicitTool.hits[0]).includes("search-remote"), false);

    const summary = await runtime.search({ query: "tierprobe-summary-only" });
    assert.equal(summary.hits.length, 1);
    assert.equal(summary.hits[0].kind, "summary");
    assert.equal(summary.hits[0].tier, "cross-session");

    const sensitive = await runtime.search({ query: "sensitive-only", kinds: ["toolResult"] });
    assert.equal(sensitive.returned, 0);

    const foreignResult = await runtime.search({ query: "foreign-only" });
    assert.equal(foreignResult.returned, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(otherCwd, { recursive: true, force: true });
  }
});

test("Context Control direct search cancels between generic catalog observations", async () => {
  const { ctx } = createSearchSession();
  const runtime = new ContextControlRuntime({
    ctx,
    mode: "active",
    cleanupMode: "model-only",
    recoveryMode: "model-only",
    journal: new MemoryContextControlJournal(),
  });
  await runtime.start();
  let reads = 0;
  const signal = {
    get aborted() {
      reads += 1;
      return reads >= 5;
    },
  };

  const result = await runtime.search({ query: "shared marker" }, signal);

  assert.deepEqual(result, { status: "unavailable", operation: "search", reason: "search_cancelled" });
});
