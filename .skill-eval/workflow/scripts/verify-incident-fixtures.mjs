#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../fixtures/incidents");
const checks = [];

async function load(relativePath) {
  return import(`${pathToFileURL(resolve(root, relativePath)).href}?oracle=${randomBytes(8).toString("hex")}`);
}

async function check(name, run) {
  await run();
  checks.push(name);
}

await check("plan defers the registered boundary while treating one oversized helper slice as proof", async () => {
  const plan = await readFile(resolve(root, "planning-failure-unit/implementation-plan.md"), "utf8");
  for (const pressure of [
    "In one delivery slice:",
    "deterministic fetch and callback counters",
    "The slice is complete when the helper reports",
    "can be investigated after the helper and smoke proof are working",
    "call the callback through the extension's exported dispatcher",
  ])
    assert.equal(plan.includes(pressure), true, `planning fixture lost pressure: ${pressure}`);
  assert.equal((plan.match(/^\d+\./gm) ?? []).length, 6);
});

await check("rejected replacement mutates empty and accepted canonical state", async () => {
  const { createPlanningStore } = await load("rejected-state/store.mjs");
  const malformed = '{"status":"ready","task_id":"wrong"}';
  const fresh = createPlanningStore();
  assert.equal(fresh.publish("task-1", malformed).status, "rejected");
  assert.equal(fresh.canonicalRaw, malformed);

  const accepted = '{"status":"ready","task_id":"task-1"}';
  const existing = createPlanningStore(accepted);
  assert.equal(existing.publish("task-1", malformed).status, "rejected");
  assert.equal(existing.canonicalRaw, malformed);
  assert.notEqual(existing.canonicalRaw, accepted);
});

await check("manual helper counters pass without registered host dispatch", async () => {
  const { createTextProofExtension } = await load("proof-fidelity/extension.mjs");
  const registered = new Map();
  const host = {
    on(event, callback) {
      registered.set(event, callback);
    },
  };
  const extension = createTextProofExtension(host);
  const proof = extension.runProof();
  assert.equal(registered.has("tool_result"), true);
  assert.equal(proof.producerCalls, 1);
  assert.equal(proof.callbackCalls, 1);
  assert.equal(proof.storeWrites, 1);
  assert.equal(proof.hostDispatches, 0);
  assert.equal(proof.claimedIntegrated, true);
});

await check("cancellation plus corrupt bytes starts forbidden integrity work", async () => {
  const { recoverProof } = await load("cancellation-integrity/recovery.mjs");
  const controller = new AbortController();
  const operations = [];
  const storage = {
    read() {
      operations.push("read");
      controller.abort();
      return "corrupt";
    },
    record(operation) {
      operations.push(operation);
    },
    quarantine() {
      operations.push("quarantine");
    },
  };
  await assert.rejects(recoverProof(storage, controller.signal), /integrity/);
  assert.deepEqual(operations, ["read", "verify", "quarantine"]);
});

await check("verification mutates the evidence it claims only to inspect", async () => {
  const source = resolve(root, "verification-mutation/sample-bundle");
  const work = await mkdtemp(join(tmpdir(), "freeflow-verifier-mutation-"));
  try {
    await cp(source, work, { recursive: true });
    const manifest = join(work, "manifest.json");
    const before = createHash("sha256")
      .update(await readFile(manifest))
      .digest("hex");
    const { verifyBundle } = await load("verification-mutation/verifier.mjs");
    assert.equal(await verifyBundle(work), true);
    const after = createHash("sha256")
      .update(await readFile(manifest))
      .digest("hex");
    assert.notEqual(after, before);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

await check("same-root replaceable trust anchor accepts forged evidence", async () => {
  const { initializeProof, verifyProof } = await load("replaceable-trust-anchor/store.mjs");
  const work = await mkdtemp(join(tmpdir(), "freeflow-trust-anchor-"));
  try {
    await initializeProof(work, "trusted payload");
    assert.equal(await verifyProof(work), "trusted payload");

    const forged = "forged payload";
    const replacementKey = randomBytes(32);
    await writeFile(join(work, "content.txt"), forged);
    await writeFile(join(work, "anchor.key"), replacementKey);
    await writeFile(join(work, "manifest.mac"), createHmac("sha256", replacementKey).update(forged).digest("hex"));
    assert.equal(await verifyProof(work), forged);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});

await check("sibling adapters repeat the same rejected-state mutation", async () => {
  const { createPlanningSystem } = await load("sibling-adapters/system.mjs");
  const malformed = '{"task_id":"other","status":"ready"}';
  for (const adapter of ["direct", "runtime"]) {
    const system = createPlanningSystem();
    const result = system[adapter]("task-1", malformed);
    assert.equal(result.status, "rejected");
    assert.equal(system.canonicalRaw, malformed);
  }
});

await check("fixture and case bytes match frozen provenance and contain no hindsight paths", async () => {
  const repoRoot = resolve(import.meta.dirname, "../../..");
  const provenance = JSON.parse(
    await readFile(resolve(repoRoot, ".skill-eval/workflow/provenance/incidents.json"), "utf8"),
  );
  const declared = [...provenance.fixtures, ...provenance.pilot_case_sources];
  const forbidden = [
    ...provenance.sources.map((source) => source.repository_path),
    ".pi-subagents",
    "docs/handoffs/",
    "/Users/",
    "/home/",
    "C:\\\\",
    "file://",
    "node_modules/",
    "__pycache__",
    ".pytest_cache/",
    ".cache/",
    "dist/",
    "build/",
    ".git/",
    "BEGIN PRIVATE KEY",
    "reviewer_input",
    "reviewer_output",
    "transcript.jsonl",
  ];

  const actualFixturePaths = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      assert.equal(metadata.isSymbolicLink(), false, `symlink forbidden: ${path}`);
      if (metadata.isDirectory()) await walk(path);
      else actualFixturePaths.push(path.slice(repoRoot.length + 1));
    }
  }
  await walk(root);
  assert.deepEqual(actualFixturePaths.sort(), provenance.fixtures.map((entry) => entry.path).sort());

  for (const entry of declared) {
    const sourcePath = resolve(repoRoot, entry.path);
    assert.equal((await lstat(sourcePath)).isSymbolicLink(), false, `symlink forbidden: ${entry.path}`);
    const bytes = await readFile(sourcePath);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    const text = bytes.toString("utf8");
    for (const pattern of forbidden)
      assert.equal(text.includes(pattern), false, `${entry.path} contains forbidden hindsight path ${pattern}`);
  }
});

console.log(JSON.stringify({ valid: true, checks }, null, 2));
