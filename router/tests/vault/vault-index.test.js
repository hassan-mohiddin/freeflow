import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createLocalVaultIndex,
  createVault,
  recordVaultIndexFailure,
  storeCommandOutput,
  storeMetadataOutput,
  storeTextOutput,
} from "../../dist/index.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-vault-index-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("vault index starts empty and grows record-by-record after persisted appends", async () => {
  await withTempVault(async (vault) => {
    const index = createLocalVaultIndex(vault);

    assert.equal((await index.status()).entryCount, 0);
    assert.equal((await index.queryVault("alpha target")).matches.length, 0);

    const first = await storeCommandOutput(vault, {
      sessionId: "fresh-session",
      command: "first",
      stdout: "alpha target from first persisted output",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    const firstResult = await index.indexRecord(first, "alpha target from first persisted output", {
      sessionId: "fresh-session",
      stream: "stdout",
      hostToolName: "freeflow_run",
    });

    assert.equal(firstResult.indexed, true);
    assert.equal(firstResult.entriesWritten, 1);
    let query = await index.queryVault("alpha target", { sessionId: "fresh-session" });
    assert.equal(query.matches.length, 1);
    assert.equal(query.matches[0].outputId, first.outputId);
    assert.match(query.matches[0].excerpt, /alpha target/);

    const second = await storeTextOutput(vault, {
      sessionId: "fresh-session",
      sourceKind: "mcp",
      raw: "beta target from observed MCP output",
      createdAt: "2026-06-24T00:00:01.000Z",
      producer: { kind: "mcp", server: "github", tool: "search_issues" },
    });
    await index.indexRecord(second, "beta target from observed MCP output", {
      sessionId: "fresh-session",
      stream: "raw",
      hostToolName: "mcp",
    });

    query = await index.queryVault("target", { sessionId: "fresh-session" });
    assert.equal(query.matches.length, 2);
    assert.deepEqual(new Set(query.matches.map((match) => match.outputId)), new Set([first.outputId, second.outputId]));
    assert.equal((await index.status()).outputCount, 2);
  });
});

test("vault index stores metadata-only records without indexing raw content", async () => {
  await withTempVault(async (vault) => {
    const index = createLocalVaultIndex(vault);
    const metadataOnly = await storeMetadataOutput(vault, {
      sessionId: "sensitive-session",
      sourceKind: "mcp",
      rawLineCount: 4,
      rawByteCount: 2048,
      rawSha256: "a".repeat(64),
      metadata: { host: "pi", producer: { kind: "mcp", server: "gmail", tool: "search" } },
      producer: { kind: "mcp", server: "gmail", tool: "search" },
      createdAt: "2026-06-24T00:00:00.000Z",
    });

    await index.indexRecord(metadataOnly, "CUSTOMER_SECRET_TOKEN should never be indexed", {
      sessionId: "sensitive-session",
      hostToolName: "mcp",
      summary: "sensitive gmail search metadata only",
    });

    const secret = await index.queryVault("CUSTOMER_SECRET_TOKEN", { sessionId: "sensitive-session" });
    assert.equal(secret.matches.length, 0);

    const metadataQuery = await index.queryVault("gmail search", { sessionId: "sensitive-session" });
    assert.equal(metadataQuery.matches.length, 1);
    assert.equal(metadataQuery.matches[0].metadataOnly, true);
    assert.doesNotMatch(metadataQuery.matches[0].excerpt, /CUSTOMER_SECRET_TOKEN/);
    assert.equal((await index.status()).metadataOnlyEntryCount, 1);
  });
});

test("vault index skips records with no persistence", async () => {
  await withTempVault(async (vault) => {
    const index = createLocalVaultIndex(vault);
    const record = await storeTextOutput(vault, {
      sessionId: "none-session",
      sourceKind: "native",
      raw: "raw text exists only for fixture setup",
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    const noPersistRecord = {
      ...record,
      persistence: { status: "not_persisted", recoverability: "none" },
    };

    const result = await index.indexRecord(noPersistRecord, "NO_PERSIST_SECRET", { sessionId: "none-session" });

    assert.equal(result.indexed, false);
    assert.equal(result.entriesWritten, 0);
    assert.equal((await index.queryVault("NO_PERSIST_SECRET", { sessionId: "none-session" })).matches.length, 0);
    assert.equal((await index.status()).entryCount, 0);
  });
});

test("vault index status reports readable recorded failures as degraded and stale", async () => {
  await withTempVault(async (vault) => {
    const index = createLocalVaultIndex(vault);
    await storeTextOutput(vault, {
      sessionId: "failure-status-session",
      sourceKind: "native",
      raw: "indexed before failure",
      createdAt: "2026-06-24T00:00:00.000Z",
    });

    await recordVaultIndexFailure(vault, new Error("simulated index append failure"));
    const status = await index.status();
    assert.equal(status.available, true);
    assert.equal(status.degraded, true);
    assert.equal(status.stale, true);
    assert.equal(status.rebuildRecommended, true);
    assert.equal(status.lastError, "simulated index append failure");
  });
});

test("vault index filters and deletes expired entries", async () => {
  await withTempVault(async (vault) => {
    const index = createLocalVaultIndex(vault);
    const expired = await storeTextOutput(vault, {
      sessionId: "expiry-session",
      sourceKind: "native",
      raw: "expired target evidence",
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    const fresh = await storeTextOutput(vault, {
      sessionId: "expiry-session",
      sourceKind: "native",
      raw: "fresh target evidence",
      createdAt: "2026-06-24T00:00:00.000Z",
    });

    await index.indexRecord(expired, "expired target evidence", { sessionId: "expiry-session", stream: "raw" });
    await index.indexRecord(fresh, "fresh target evidence", { sessionId: "expiry-session", stream: "raw" });

    assert.equal((await index.queryVault("target", { sessionId: "expiry-session" })).matches.length, 2);
    const deleted = await index.deleteExpired({ now: "2026-06-20T00:00:00.000Z", sessionId: "expiry-session" });

    assert.equal(deleted.removedEntries, 1);
    const query = await index.queryVault("target", { sessionId: "expiry-session" });
    assert.equal(query.matches.length, 1);
    assert.equal(query.matches[0].outputId, fresh.outputId);
  });
});
