import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
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
    assert.match(record.recordId, /^ffrec_/);
    assert.equal(record.producer.kind, "command");
    assert.deepEqual(record.persistence, {
      status: "vaulted",
      recoverability: "exact",
      recoveryOutputId: record.outputId,
      outputId: record.outputId,
    });
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

test("command records and session index include reuse fingerprints", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "fingerprint-session",
      command: "npm test",
      cwd: "/repo",
      stdout: "PASS one\n",
      stderr: "",
      combined: "PASS one\n",
      executionStatus: "success",
      exitCode: 0,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    assert.match(record.fingerprints.exactSha256, /^[a-f0-9]{64}$/);
    assert.match(record.fingerprints.normalizedSha256, /^[a-f0-9]{64}$/);
    assert.match(record.fingerprints.commandFingerprintSha256, /^[a-f0-9]{64}$/);

    const index = await readSessionIndex(vault, "fingerprint-session");
    assert.equal(index.records[record.outputId].recordId, record.recordId);
    assert.deepEqual(index.records[record.outputId].producer, record.producer);
    assert.deepEqual(index.records[record.outputId].persistence, record.persistence);
    assert.deepEqual(index.records[record.outputId].fingerprints, record.fingerprints);
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

test("session index keeps concurrent command output records", async () => {
  await withTempVault(async (vault) => {
    const records = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        storeCommandOutput(vault, {
          sessionId: "concurrent-session",
          command: `cmd-${index}`,
          stdout: `out-${index}\n`,
          stderr: "",
          executionStatus: "success",
          exitCode: 0,
          createdAt: `2026-06-16T00:00:${String(index).padStart(2, "0")}.000Z`,
        }),
      ),
    );

    const index = await readSessionIndex(vault, "concurrent-session");
    assert.equal(index.outputs.length, records.length);
    assert.equal(Object.keys(index.records).length, records.length);
    for (const record of records) {
      assert.ok(index.outputs.includes(record.outputId));
      assert.equal(index.records[record.outputId].executionStatus, "success");
    }
  });
});

test("session index keeps cross-process command output records", async () => {
  await withTempVault(async (vault) => {
    const releasePath = join(vault.root, "cross-process-release");
    const distIndexUrl = new URL("../dist/index.js", import.meta.url).href;
    const childCode = `
      import { access } from "node:fs/promises";
      import { createVault, storeCommandOutput } from ${JSON.stringify(distIndexUrl)};
      const [root, releasePath, index] = process.argv.slice(1);
      while (true) {
        try {
          await access(releasePath);
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
      const vault = createVault({ root });
      await storeCommandOutput(vault, {
        sessionId: "cross-process-session",
        command: ` + "`cmd-${index}`" + `,
        stdout: ` + "`out-${index}\\n`" + `,
        stderr: "",
        executionStatus: "success",
        exitCode: 0,
        createdAt: ` + "`2026-06-16T00:01:${String(index).padStart(2, \"0\")}.000Z`" + `,
      });
    `;

    const childCount = 12;
    const children = Array.from({ length: childCount }, (_, index) => runNodeModuleSnippet(childCode, [vault.root, releasePath, String(index)]));
    await writeFile(releasePath, "go", "utf8");
    await Promise.all(children);

    const index = await readSessionIndex(vault, "cross-process-session");
    assert.equal(index.outputs.length, childCount);
    assert.equal(Object.keys(index.records).length, childCount);
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
    assert.match(record.recordId, /^ffrec_/);
    assert.equal(record.producer.kind, "native");
    assert.equal(record.persistence.recoverability, "exact");
    assert.equal(record.persistence.recoveryOutputId, record.outputId);
    assert.equal(await readOutputLines(vault, {
      sessionId: "session-text",
      outputId: record.outputId,
      stream: "raw",
      startLine: 2,
      endLine: 2,
    }), "beta");
  });
});

async function runNodeModuleSnippet(code, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`child exited ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

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
    assert.match(record.recordId, /^ffrec_/);
    assert.equal(record.producer.kind, "repo");
    assert.deepEqual(record.persistence, { status: "metadata_only", recoverability: "metadata_only" });
    assert.equal(record.path, "docs/specs/freeflow-output-router-design.md");
    const objectFiles = await readdir(join(vault.root, "objects", record.objectId));
    assert.deepEqual(objectFiles, ["meta.json"]);
  });
});
