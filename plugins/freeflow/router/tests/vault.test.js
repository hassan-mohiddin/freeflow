import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  DEFAULT_VAULT_RETENTION,
  createVault,
  readOutputLines,
  readOutputText,
  readSessionIndex,
  readVaultRecord,
  storeCommandOutput,
  storeRepoFileReference,
  storeTextOutput,
} from "../dist/index.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-vault-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("vault default retention is seven-day TTL", async () => {
  await withTempVault(async (vault) => {
    assert.deepEqual(vault.retention, DEFAULT_VAULT_RETENTION);
  });
});

test("writes and reads command output records with exact streams", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "session/one",
      command: ["npm", "test"],
      cwd: "/repo",
      stdout: "pass one\npass two",
      stderr: "fail one\nfail two",
      combined: "pass one\npass two\nfail one\nfail two",
      executionStatus: "failed",
      exitCode: 1,
      durationMs: 25,
      decisionIds: ["ffdec_1"],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    assert.equal(record.kind, "command");
    assert.equal(record.executionStatus, "failed");
    assert.equal(record.lineCounts.stderr, 2);
    assert.equal(record.byteCounts.stdout, Buffer.byteLength("pass one\npass two", "utf8"));
    assert.equal(record.expiresAt, "2026-06-23T00:00:00.000Z");
    await stat(record.paths.stdout);
    await stat(record.paths.stderr);
    await stat(record.paths.combined);
    await stat(record.paths.meta);

    const stored = await readVaultRecord(vault, "session/one", record.outputId);
    assert.deepEqual(stored, record);

    assert.equal(await readOutputText(vault, "session/one", record.outputId, "stderr"), "fail one\nfail two");
    assert.equal(
      await readOutputLines(vault, {
        sessionId: "session/one",
        outputId: record.outputId,
        stream: "combined",
        startLine: 2,
        endLine: 3,
      }),
      "pass two\nfail one",
    );
  });
});

test("session index groups command records by execution status", async () => {
  await withTempVault(async (vault) => {
    const success = await storeCommandOutput(vault, {
      sessionId: "session-two",
      command: "true",
      stdout: "ok",
      stderr: "",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-16T00:00:00.000Z",
    });
    const failed = await storeCommandOutput(vault, {
      sessionId: "session-two",
      command: "false",
      stdout: "",
      stderr: "bad",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-16T00:00:01.000Z",
    });

    const index = await readSessionIndex(vault, "session-two");
    assert.deepEqual(index.successful, [success.outputId]);
    assert.deepEqual(index.failed, [failed.outputId]);
    assert.deepEqual(index.outputs, [success.outputId, failed.outputId]);
    assert.equal(index.records[success.outputId].executionStatus, "success");
    assert.equal(index.records[failed.outputId].executionStatus, "failed");
  });
});

test("text output records store exact raw text", async () => {
  await withTempVault(async (vault) => {
    const record = await storeTextOutput(vault, {
      sessionId: "session-text",
      sourceKind: "native",
      raw: "alpha\nbeta\ngamma",
      decisionIds: ["ffdec_text"],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    assert.equal(record.kind, "text");
    assert.equal(await readOutputLines(vault, {
      sessionId: "session-text",
      outputId: record.outputId,
      stream: "raw",
      startLine: 2,
      endLine: 2,
    }), "beta");
  });
});

test("repo file references write metadata only by default", async () => {
  await withTempVault(async (vault) => {
    const record = await storeRepoFileReference(vault, {
      sessionId: "session-repo",
      path: "docs/specs/freeflow-output-router-design.md",
      hashSha256: "abc123",
      decisionIds: ["ffdec_repo"],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    assert.equal(record.kind, "repo-file");
    assert.equal(record.path, "docs/specs/freeflow-output-router-design.md");
    const objectFiles = await readdir(join(vault.root, "objects", record.objectId));
    assert.deepEqual(objectFiles, ["meta.json"]);
  });
});
