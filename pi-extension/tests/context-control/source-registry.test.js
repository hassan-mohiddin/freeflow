import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  ContextControlSourceRegistry,
  repositoryIdentityForCwd,
} from "../../dist/context-control/core/source-registry.js";
import { buildRuntimeScopeCatalog } from "../../dist/context-control/adapters/catalog-adapter.js";
import { ContextControlRuntime } from "../../dist/context-control/core/runtime.js";
import { MemoryContextControlJournal } from "../../dist/context-control/persistence/journal.js";

const execFileAsync = promisify(execFile);

function sessionEntries(sessionId, cwd, toolCallId, entryId, text) {
  return [
    { type: "session", version: 3, id: sessionId, timestamp: "2026-08-29T00:00:00.000Z", cwd },
    {
      type: "message",
      id: `${entryId}-assistant-call`,
      parentId: null,
      timestamp: "2026-08-29T00:00:01.000Z",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: toolCallId, name: "read", arguments: { path: `src/${entryId}.ts` } }],
      },
    },
    {
      type: "message",
      id: entryId,
      parentId: `${entryId}-assistant-call`,
      timestamp: "2026-08-29T00:00:02.000Z",
      message: { role: "toolResult", toolCallId, toolName: "read", content: [{ type: "text", text }], isError: false },
    },
    {
      type: "message",
      id: `${entryId}-assistant-followup`,
      parentId: entryId,
      timestamp: "2026-08-29T00:00:03.000Z",
      message: { role: "assistant", content: [{ type: "text", text: "I processed the result." }] },
    },
  ];
}

test("same-session recovery includes inactive branches without changing active projection scope", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-scope-"));
  try {
    await execFileAsync("git", ["init", "-q", cwd]);
    const active = sessionEntries("session-1", cwd, "call-active", "tool-active", "active branch result");
    const alternate = sessionEntries("session-1", cwd, "call-alt", "tool-alt", "alternate branch result");
    const allEntries = [active[0], ...active.slice(1), ...alternate.slice(1)];
    const ctx = {
      cwd,
      sessionManager: {
        getSessionId: () => "session-1",
        getLeafId: () => "active-leaf",
        getBranch: () => active,
        getEntries: () => allEntries,
        buildContextEntries: () => active,
      },
    };
    const registry = new ContextControlSourceRegistry(ctx);
    const catalog = registry.recoveryCatalog("current-session", new Set(), 1);

    assert.equal(repositoryIdentityForCwd(cwd), catalog.repositoryId);
    assert.deepEqual(
      catalog.sources.map((source) => source.identity.entryId),
      ["tool-active", "tool-alt"],
    );
    assert.equal(catalog.sources.find((source) => source.identity.entryId === "tool-active").activeContext, true);
    assert.equal(catalog.sources.find((source) => source.identity.entryId === "tool-alt").activeContext, false);
    const snapshot = registry.snapshot(new Set(), 1);
    const runtimeCatalog = buildRuntimeScopeCatalog(
      snapshot,
      catalog,
      "current-session",
      new Map(),
      undefined,
      catalog.repositoryId,
    );
    assert.equal(runtimeCatalog.catalog.excluded.find((source) => source.ref === "ctx:tool-active").reason, "visible");
    assert.equal(
      runtimeCatalog.catalog.sources.find((source) => source.identity.entryId === "tool-alt").tier,
      "current-session",
    );
    assert.equal(
      runtimeCatalog.catalog.sources.find((source) => source.identity.entryId === "tool-alt").relation,
      "sibling-branch",
    );
    assert.equal(catalog.sessions.length, 1);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("cross-session recovery accepts matching repository sessions and rejects other repositories", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "context-control-cross-repo-"));
  const otherCwd = await mkdtemp(join(tmpdir(), "context-control-other-repo-"));
  try {
    await execFileAsync("git", ["init", "-q", cwd]);
    await execFileAsync("git", ["init", "-q", otherCwd]);
    const current = sessionEntries("session-1", cwd, "call-current", "tool-current", "current result");
    const currentFile = join(cwd, "current.jsonl");
    const matchingFile = join(cwd, "matching.jsonl");
    const otherFile = join(cwd, "other.jsonl");
    await writeFile(currentFile, `${current.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
    await writeFile(
      matchingFile,
      `${sessionEntries("session-2", cwd, "call-matching", "tool-matching", "matching repository result")
        .map((entry) => JSON.stringify(entry))
        .join("\n")}\n`,
      "utf8",
    );
    await writeFile(
      otherFile,
      `${sessionEntries("session-3", otherCwd, "call-other", "tool-other", "other repository result")
        .map((entry) => JSON.stringify(entry))
        .join("\n")}\n`,
      "utf8",
    );
    const ctx = {
      cwd,
      sessionManager: {
        getSessionId: () => "session-1",
        getLeafId: () => "current-leaf",
        getSessionFile: () => currentFile,
        getSessionDir: () => cwd,
        getBranch: () => current,
        getEntries: () => current,
        buildContextEntries: () => current,
      },
    };
    const registry = new ContextControlSourceRegistry(ctx);
    const catalog = registry.recoveryCatalog("current-project", new Set(), 1);

    assert.equal(catalog.sessions.filter((session) => !session.current).length, 1);
    assert.ok(catalog.sources.some((source) => source.identity.sessionId === "session-2"));
    assert.ok(!catalog.sources.some((source) => source.identity.sessionId === "session-3"));
    assert.ok(catalog.skippedSessions >= 1);
    assert.ok(catalog.sources.every((source) => source.identity.sessionId !== "session-3"));

    const runtime = new ContextControlRuntime({
      ctx,
      mode: "active",
      cleanupMode: "automatic",
      recoveryMode: "automatic",
      recoveryScope: "current-project",
      journal: new MemoryContextControlJournal(),
    });
    assert.equal((await runtime.start()).status, "ready");
    const recovered = await runtime.recover({ text: "matching repository result", exactRequired: true });
    assert.equal(recovered.status, "recovered");
    assert.equal(recovered.resolution.source.sessionId, "session-2");
    assert.equal(recovered.envelope.content, "matching repository result");
    assert.equal(recovered.materialization.mode, "retrieve");
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(otherCwd, { recursive: true, force: true });
  }
});
