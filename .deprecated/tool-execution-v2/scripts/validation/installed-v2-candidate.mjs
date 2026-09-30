#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = process.env.FREEFLOW_INSTALLED_PACKAGE_ROOT;
const installation = process.env.FREEFLOW_INSTALLED_INSTALLATION;
if (!packageRoot || !installation) throw new Error("An extracted installed candidate is required.");
const imported = (path) => import(pathToFileURL(join(packageRoot, "pi-extension/dist", path)).href);
const { resolveToolExecutionConfig } = await imported("tool-runtime/config.js");
const { ToolRuntime } = await imported("tool-runtime/index.js");
const { V2ExecutionRecorder } = await imported("tool-runtime/execution-record.js");
const { SessionStoreRuntime } = await imported("tool-runtime/session-store/store.js");
const { canonicalStoreJson } = await imported("tool-runtime/session-store/journal.js");
const { resolveRgBackend } = await imported("tool-runtime/adapters/rg-backend.js");

const sha = (body) => createHash("sha256").update(body).digest("hex");
const sessionId = "installed-candidate-session";
const source = "one\nNEEDLE\nsecond NEEDLE\n";
const workspace = join(installation, "installed workspace");
await mkdir(workspace, { recursive: true });
await writeFile(join(workspace, "source.txt"), source);
const packageInfo = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const manifest = {
  schemaVersion: 2,
  storeId: "store:installed-candidate",
  originSessionId: sessionId,
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: packageInfo.name, version: packageInfo.version },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
};
const limits = {
  perArtifactBytes: 4 * 1024 * 1024,
  perRunBytes: 4 * 1024 * 1024,
  perSessionBytes: 8 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
  maxReadBytes: 32768,
};
const root = join(installation, "installed v2 sidecar");
const store = new SessionStoreRuntime(root, manifest, limits);
const fence = await store.open();
const state = resolveToolExecutionConfig(
  {
    toolExecution: {
      enabled: true,
      workspace: { enabled: true, write: true, root: workspace },
      discovery: { enabled: true },
    },
  },
  {},
  true,
);
const recorder = new V2ExecutionRecorder(
  () => ({ store, fence, occurrenceId: () => `occurrence:${randomUUID()}` }),
  65536,
);
const runtime = new ToolRuntime(
  () => state,
  {
    scope: () => ({}),
    responsibility: () => ({ profile: "solo", control: "inactive" }),
    admit: () => ({ kind: "allowed" }),
  },
  {
    read: async () => {
      throw new Error("Legacy capture is not used by this fixture.");
    },
  },
  undefined,
  undefined,
  recorder,
  { maxBytes: 8192 },
);
const ctx = {
  cwd: workspace,
  sessionManager: { getSessionId: () => sessionId, getLeafId: () => null },
};
const direct = (name, input) => runtime.invokeDirect(name, `call:${name}`, input, undefined, ctx);

const read = await direct("freeflow_read", {
  files: [{ path: "source.txt", ranges: [{ startLine: 1, endLine: 2 }] }],
});
assert.equal(read.details.outcome.status, "succeeded");
assert.match(read.content[0].text, /NEEDLE/);

const backendReady = await resolveRgBackend().then(
  () => true,
  () => false,
);
const search = await direct("freeflow_search", {
  kind: "text",
  query: "NEEDLE",
  mode: "count",
  paths: ["source.txt"],
});
assert.equal(search.details.outcome.status, backendReady ? "succeeded" : "failed");
if (backendReady) assert.match(search.content[0].text, /count: 2 reported matches/);
else assert.match(search.content[0].text, /backend_unavailable|failed/);

const plan = await direct("freeflow_patch", {
  patch: "*** Begin Patch\n*** Update File: source.txt\n@@\n one\n-NEEDLE\n+CHANGED\n*** End Patch\n",
  expectedRevisions: [{ path: "source.txt", sha256: sha(Buffer.from(source)) }],
  dryRun: true,
});
assert.equal(plan.details.outcome.status, "succeeded");
assert.equal(await readFile(join(workspace, "source.txt"), "utf8"), source, "dry-run never writes the target");
const results = [read, search, plan];
assert.equal(store.events.entries().filter(({ event }) => event.kind === "operation-outcome").length, 3);
for (const result of results) {
  assert.match(result.details.freeflowV2.occurrenceId, /^occurrence:/);
  assert.equal(result.details.freeflowV2.persistence.state, "sidecar-acknowledged");
}

// Populate a checkpoint through the installed store, then recover its exact acknowledged order.
for (let number = 0; number < 125; number++) {
  const payload = { number };
  await store.appendEvent(
    {
      version: 1,
      id: `event:age-${number}`,
      domain: "execution",
      kind: "observation",
      operationId: "installed.fixture",
      recordedSessionId: sessionId,
      branchAnchor: "root",
      payload,
      artifactRefs: [],
      payloadHash: sha(canonicalStoreJson(payload)),
    },
    fence,
  );
}
const head = JSON.parse(await readFile(join(root, "head.json"), "utf8"));
assert.equal(head.version, 2);
assert.equal(head.checkpoint.sequence, 128);
await store.close(fence);
const reopened = new SessionStoreRuntime(root, manifest, limits);
const next = await reopened.open();
const recovered = reopened.events.entries();
assert.equal(recovered.length, 128);
const owner = "entry:installed-fixture-result";
const selected = await reopened.replay("execution", {
  sessionId,
  branchAnchor: "root",
  nativeEntryIds: [owner],
  nativeOccurrences: results.map(({ details }) => ({ occurrenceId: details.freeflowV2.occurrenceId, entryId: owner })),
});
assert.equal(selected.filter((event) => event.kind === "operation-outcome").length, 3);
await reopened.close(next);
console.log(
  JSON.stringify({
    status: "passed",
    recoveredEvents: recovered.length,
    checkpointVersion: head.version,
    search: backendReady ? "succeeded" : "qualified-unavailable",
    boundary: "extracted-package APIs with synthetic native owners",
  }),
);
