import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVault,
  readOutputText,
  readVaultRecord,
  routeObservedToolOutput,
} from "../../dist/index.js";

async function withVault(name, run) {
  const root = await mkdtemp(join(tmpdir(), name));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const githubProducer = { kind: "mcp", server: "github", tool: "search_issues" };

const baseOptions = {
  sessionId: "observed-session",
  host: { name: "pi", toolName: "mcp" },
  producer: githubProducer,
};

test("routeObservedToolOutput stores exact observed text with recovery", async () => {
  await withVault("freeflow-observed-exact-", async (vaultRoot) => {
    const rawResult = "issue #123\nurl https://github.com/example/repo/issues/123\nstatus open";
    const result = await routeObservedToolOutput({
      ...baseOptions,
      rawResult,
      persistence: "exact",
      vaultRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.route, "observed");
    assert.equal(result.persistence.status, "vaulted");
    assert.equal(result.persistence.recoverability, "exact");
    assert.ok(result.outputId);
    assert.equal(result.recovery.outputId, result.outputId);
    assert.equal(result.evidence[0].source.kind, "vault");

    const vault = createVault({ root: vaultRoot });
    assert.equal(await readOutputText(vault, baseOptions.sessionId, result.outputId, "raw"), rawResult);
  });
});

test("routeObservedToolOutput persists metadata-only records without raw recovery", async () => {
  await withVault("freeflow-observed-metadata-", async (vaultRoot) => {
    const rawResult = "gmail subject: private customer secret\nbody: do not persist raw content";
    const result = await routeObservedToolOutput({
      ...baseOptions,
      producer: { kind: "mcp", server: "gmail", tool: "search" },
      rawResult,
      persistence: "metadata-only",
      vaultRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.persistence.status, "metadata_only");
    assert.equal(result.persistence.recoverability, "metadata_only");
    assert.ok(result.outputId);
    assert.match(result.recovery.how, /Only metadata was persisted/);

    const vault = createVault({ root: vaultRoot });
    const record = await readVaultRecord(vault, baseOptions.sessionId, result.outputId);
    assert.equal(record.kind, "metadata");
    assert.equal(record.byteCounts.raw, Buffer.byteLength(rawResult, "utf8"));
    await assert.rejects(() => readOutputText(vault, baseOptions.sessionId, result.outputId, "raw"), /metadata only/i);
  });
});

test("routeObservedToolOutput supports no-persist routing without recovery claims", async () => {
  await withVault("freeflow-observed-none-", async (vaultRoot) => {
    const result = await routeObservedToolOutput({
      ...baseOptions,
      rawResult: "temporary web output",
      persistence: "none",
      vaultRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.persistence.recoverability, "none");
    assert.equal(result.outputId, undefined);
    assert.match(result.recovery.how, /No content or metadata was persisted/);
    assert.equal(result.evidence[0].source.kind, "native");
  });
});

test("routeObservedToolOutput normalizes Pi-style content blocks and structured JSON", async () => {
  await withVault("freeflow-observed-normalize-", async (vaultRoot) => {
    const result = await routeObservedToolOutput({
      ...baseOptions,
      rawResult: {
        content: [
          { type: "text", text: "Alpha heading" },
          { type: "json", json: { id: 7, url: "https://example.test/item/7" } },
        ],
      },
      persistence: "exact",
      vaultRoot,
    });

    const vault = createVault({ root: vaultRoot });
    const stored = await readOutputText(vault, baseOptions.sessionId, result.outputId, "raw");
    assert.match(stored, /Alpha heading/);
    assert.match(stored, /"id": 7/);
    assert.match(stored, /https:\/\/example\.test\/item\/7/);
    assert.equal(result.normalized.shape, "content_blocks");
  });
});

test("routeObservedToolOutput fails open without dropping original output", async () => {
  await withVault("freeflow-observed-fail-open-", async (tmpRoot) => {
    const fileRoot = join(tmpRoot, "vault-file");
    await writeFile(fileRoot, "not a directory", "utf8");

    const result = await routeObservedToolOutput({
      ...baseOptions,
      rawResult: "original output survives storage failure",
      persistence: "exact",
      vaultRoot: fileRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.passthrough.text, "original output survives storage failure");
    assert.match(result.failure.message, /could not be persisted/i);
    assert.match(result.recovery.how, /No content was persisted/);
  });
});

test("routeObservedToolOutput fails open for BigInt structured output normalization", async () => {
  await withVault("freeflow-observed-bigint-fail-open-", async (vaultRoot) => {
    const result = await routeObservedToolOutput({
      ...baseOptions,
      rawResult: { id: 1n, title: "cannot JSON stringify BigInt" },
      persistence: "exact",
      vaultRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.failure.kind, "observed_routing_failure");
    assert.match(result.failure.message, /could not be normalized/i);
    assert.match(result.passthrough.text, /"id": "1n"/);
    assert.match(result.recovery.how, /No content was persisted/);
  });
});

test("routeObservedToolOutput fails open for circular structured output normalization", async () => {
  await withVault("freeflow-observed-circular-fail-open-", async (vaultRoot) => {
    const circular = { id: "cycle" };
    circular.self = circular;

    const result = await routeObservedToolOutput({
      ...baseOptions,
      rawResult: circular,
      persistence: "exact",
      vaultRoot,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "failed");
    assert.equal(result.persistence.status, "not_persisted");
    assert.equal(result.failure.kind, "observed_routing_failure");
    assert.match(result.failure.message, /could not be normalized/i);
    assert.match(result.passthrough.text, /"self": "\[Circular\]"/);
    assert.match(result.recovery.how, /No content was persisted/);
  });
});
