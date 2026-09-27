import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, open, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";
import { syntheticNativeAncestry } from "../fixtures/v2-sidecar.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const key = { id: "project.readRanges", revision: "1" };
const manifest = {
  schemaVersion: 2,
  storeId: "store:ranges",
  originSessionId: "session:ranges",
  host: { id: "pi", contract: "0.87.x" },
  createdBy: { package: "fixture", version: "1" },
  domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
};
const limits = {
  perArtifactBytes: 256 * 1024,
  perRunBytes: 512 * 1024,
  perSessionBytes: 512 * 1024,
  totalBytes: 1024 * 1024,
  maxReadBytes: 32 * 1024,
};

async function fixture(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-ranges-"));
  const state = resolveToolExecutionConfig(
    { toolExecution: { enabled: true, workspace: { enabled: true, write: false, root, denyPaths: ["private"] } } },
    {},
    true,
  );
  const routing = {
    scope: () => ({}),
    responsibility: () => ({ profile: "solo", control: "inactive" }),
    admit: () => ({ kind: "allowed" }),
  };
  const reader = {
    read: async () => {
      throw new Error("legacy result read unavailable");
    },
  };
  const store = new SessionStoreRuntime(join(root, "store"), manifest, limits);
  const fence = await store.open();
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:range-${++sequence}` }),
    256,
  );
  const runtime = new ToolRuntime(() => state, routing, reader, undefined, undefined, recorder, {
    maxBytes: options.modelBytes ?? 2048,
  });
  const manager = { getSessionId: () => "session:ranges", getLeafId: () => null };
  const ctx = { cwd: root, sessionManager: manager };
  const direct = (input) =>
    runtime.invokeTools("direct:ranges", { operation: "call", operationKey: key, input }, undefined, ctx);
  const canonical = async (outcome) => {
    const events = await store.replay("execution", syntheticNativeAncestry(store, "session:ranges"));
    const event = events.find(
      (entry) => entry.kind === "operation-outcome" && entry.payload.occurrenceId === outcome.occurrenceId,
    );
    assert.ok(event);
    if (event.payload.value) return event.payload.value;
    const id = event.artifactRefs[0];
    assert.ok(id);
    const descriptor = events.find((entry) => entry.kind === "artifact-published" && entry.payload.id === id).payload;
    const range = await store.readArtifact(
      id,
      { startBytes: 0, endBytes: descriptor.bytes },
      {
        originSessionId: "session:ranges",
        ancestry: syntheticNativeAncestry(store, "session:ranges"),
        grantedArtifactIds: [id],
      },
    );
    return JSON.parse(Buffer.from(range.bytes).toString("utf8"));
  };
  try {
    await run({ root, runtime, ctx, direct, canonical, store, state, routing, reader });
  } finally {
    await store.close(fence).catch(() => store.abandon());
    await rm(root, { recursive: true, force: true });
  }
}

test("one snapshot supplies overlapping requested ranges with raw BOM/CRLF and revision identity", async () => {
  await fixture(async ({ root, runtime, ctx, direct, canonical }) => {
    const body = Buffer.from("\uFEFFalpha\r\nβeta\nthird\rfourth\r\n", "utf8");
    await writeFile(join(root, "mixed.txt"), body);
    await symlink(join(root, "mixed.txt"), join(root, "alias.txt"));
    const input = {
      files: [
        {
          path: "mixed.txt",
          ranges: [
            { startLine: 1, endLine: 2 },
            { startLine: 2, endLine: 3 },
            { startLine: 9, endLine: 10 },
          ],
        },
        { path: "alias.txt", ranges: [{ startLine: 4, endLine: 4 }] },
      ],
    };
    const directResult = await direct(input);
    assert.equal(directResult.details.outcome.status, "succeeded");
    assert.equal(directResult.details.outcome.effectState, "completed");
    assert.ok(Buffer.byteLength(directResult.content[0].text) <= 2048);
    assert.equal(JSON.stringify(directResult.details).includes("\uFEFFalpha"), false);
    const value = await canonical({ occurrenceId: directResult.details.freeflowV2.occurrenceId });
    assert.equal(value.files[0].revision, hash(body));
    assert.equal(value.files[0].totalBytes, body.length);
    assert.equal(value.files[0].totalLines, 4);
    assert.equal(value.acquisitionBytes, body.length);
    assert.equal(value.files[1].path, "alias.txt");
    assert.equal(value.files[1].revision, hash(body));
    assert.equal(value.files[1].coverage, "complete-at-boundary");
    assert.equal(value.files[0].coverage, "limited");
    assert.equal(value.files[1].served[0].text, "fourth\r\n");
    assert.equal(value.files[0].served[0].text, "\uFEFFalpha\r\nβeta\n");
    assert.equal(value.files[0].served[1].text, "βeta\nthird\r");
    assert.equal(value.files[0].served[0].range.startBytes, 0);
    assert.equal(value.files[0].served[0].range.endBytes, Buffer.byteLength("\uFEFFalpha\r\nβeta\n"));
    assert.deepEqual(
      value.files[0].unserved.map((entry) => [entry.requestIndex, entry.reason, entry.range]),
      [[2, "out_of_range", { startLine: 9, endLine: 10 }]],
    );
    assert.equal(value.coverage, "limited");
    assert.match(directResult.content[0].text, /unserved \(out_of_range\)/);
    const scope = runtime.createProgramScope("program:ranges", ctx);
    const program = await runtime.kernel.execute(key, input, scope, "programmatic");
    assert.equal(program.status, "succeeded");
    assert.deepEqual(program.value, value);
    assert.notEqual(program.occurrenceId, directResult.details.freeflowV2.occurrenceId);
  });
});

test("revision mismatch and total response budget preserve each unserved request identity", async () => {
  await fixture(async ({ root, direct, canonical }) => {
    const body = `first ${"x".repeat(500)}\nsecond\nthird\n`;
    await writeFile(join(root, "budget.txt"), body);
    const request = {
      files: [
        {
          path: "budget.txt",
          ranges: [
            { startLine: 1, endLine: 3 },
            { startLine: 3, endLine: 3 },
          ],
        },
      ],
      maxBytes: 512,
    };
    const result = await direct(request);
    const value = await canonical({ occurrenceId: result.details.freeflowV2.occurrenceId });
    assert.equal(value.files[0].revision, hash(body));
    assert.equal(value.files[0].served[0].text, `first ${"x".repeat(500)}\n`);
    assert.deepEqual(
      value.files[0].unserved.map((entry) => [entry.requestIndex, entry.range, entry.reason]),
      [
        [0, { startLine: 2, endLine: 3 }, "response_budget"],
        [1, { startLine: 3, endLine: 3 }, "response_budget"],
      ],
    );
    assert.equal(value.selectedBytes, Buffer.byteLength(`first ${"x".repeat(500)}\n`));
    assert.equal(result.details.freeflowV2.presentationFailure, undefined, JSON.stringify(result));
    assert.equal(result.details.freeflowV2.modelCoverage.kind, "limited");
    assert.ok(Buffer.byteLength(result.content[0].text) <= 512);
    assert.match(result.content[0].text, /2 unserved segments/);
    const stale = await direct({
      files: [{ path: "budget.txt", expectedRevision: hash("old"), ranges: [{ startLine: 1, endLine: 2 }] }],
    });
    const mismatch = await canonical({ occurrenceId: stale.details.freeflowV2.occurrenceId });
    assert.equal(mismatch.files[0].served.length, 0);
    assert.equal(mismatch.files[0].unserved[0].reason, "revision_mismatch");
    assert.equal(mismatch.files[0].revision, hash(body));
  });
});

test("the bounded model view cannot advertise unanchored sidecar bytes as recoverable", async () => {
  await fixture(
    async ({ root, direct, canonical }) => {
      const marker = "RANGE_CANONICAL_ONLY_SENTINEL";
      await writeFile(join(root, "large.txt"), `line ${"x".repeat(600)} ${marker}\n`);
      const result = await direct({ files: [{ path: "large.txt", ranges: [{ startLine: 1, endLine: 1 }] }] });
      const value = await canonical({ occurrenceId: result.details.freeflowV2.occurrenceId });
      assert.match(value.files[0].served[0].text, /RANGE_CANONICAL_ONLY_SENTINEL/);
      assert.equal(result.content[0].text.includes(marker), false);
      assert.match(result.content[0].text, /exact model recovery is not yet established/);
      assert.ok(Buffer.byteLength(result.content[0].text) <= 512);
      assert.equal(result.details.freeflowV2.modelCoverage.kind, "limited");
      assert.equal(JSON.stringify(result.details).includes(marker), false);
    },
    { modelBytes: 512 },
  );
});

test("aggregate acquisition is bounded and unread files remain explicitly unavailable", async () => {
  await fixture(async ({ root, direct, canonical }) => {
    await writeFile(join(root, "a.txt"), Buffer.alloc(4 * 1024 * 1024, 65));
    await writeFile(join(root, "b.txt"), Buffer.alloc(4 * 1024 * 1024, 66));
    await writeFile(join(root, "c.txt"), "small\n");
    const result = await direct({
      files: ["a.txt", "b.txt", "c.txt"].map((path) => ({ path, ranges: [{ startLine: 1, endLine: 1 }] })),
    });
    assert.equal(result.details.outcome.status, "succeeded");
    const value = await canonical({ occurrenceId: result.details.freeflowV2.occurrenceId });
    assert.equal(value.acquisitionBytes, 8 * 1024 * 1024);
    assert.equal(value.files[2].revision, undefined);
    assert.equal(value.files[2].coverage, "limited");
    assert.deepEqual(
      value.files[2].unserved.map((item) => item.reason),
      ["acquisition_budget"],
    );
    assert.equal(value.coverage, "limited");
  });
});

test("empty and final-terminator files expose no invented trailing line; malformed UTF-8 fails", async () => {
  await fixture(async ({ root, direct, canonical }) => {
    await writeFile(join(root, "empty.txt"), "");
    await writeFile(join(root, "final.txt"), "one\r\n");
    const result = await direct({
      files: [
        { path: "empty.txt", ranges: [{ startLine: 1, endLine: 1 }] },
        { path: "final.txt", ranges: [{ startLine: 1, endLine: 2 }] },
      ],
    });
    const value = await canonical({ occurrenceId: result.details.freeflowV2.occurrenceId });
    assert.equal(value.files[0].totalLines, 0);
    assert.equal(value.files[0].unserved[0].reason, "out_of_range");
    assert.equal(value.files[1].totalLines, 1);
    assert.equal(value.files[1].served[0].text, "one\r\n");
    assert.deepEqual(value.files[1].unserved[0].range, { startLine: 2, endLine: 2 });
    await writeFile(join(root, "invalid.txt"), Buffer.from([0xff]));
    const invalid = await direct({ files: [{ path: "invalid.txt", ranges: [{ startLine: 1, endLine: 1 }] }] });
    assert.equal(invalid.details.outcome.status, "failed");
    assert.match(invalid.content[0].text, /failed/);
    assert.equal(JSON.stringify(invalid).includes("�"), false);
  });
});

test("a file changed after its bytes are read cannot return a successful stale revision", async () => {
  await fixture(async ({ root, direct, store }) => {
    const path = join(root, "changing.txt");
    const originalBody = "source before mutation\n";
    await writeFile(path, originalBody);
    const identity = await stat(path);
    const probe = await open(path, "r");
    const prototype = Object.getPrototypeOf(probe);
    const originalRead = prototype.read;
    const owned = Object.hasOwn(prototype, "read");
    await probe.close();
    let changed = false;
    prototype.read = async function (...args) {
      const result = await originalRead.apply(this, args);
      if (!changed && args[3] === 0 && args[0]?.length === Buffer.byteLength(originalBody)) {
        const current = await this.stat();
        if (current.dev === identity.dev && current.ino === identity.ino) {
          changed = true;
          await writeFile(path, "replacement with a different length\n");
        }
      }
      return result;
    };
    try {
      const result = await direct({ files: [{ path: "changing.txt", ranges: [{ startLine: 1, endLine: 1 }] }] });
      assert.equal(changed, true, "the observer changed the source inside snapshot acquisition");
      assert.equal(result.details.outcome.status, "failed");
      assert.equal(result.details.outcome.effectState, "none");
      assert.equal(JSON.stringify(result).includes("source before mutation"), false);
      const events = await store.replay("execution", syntheticNativeAncestry(store, "session:ranges"));
      const failure = events.find(
        (entry) =>
          entry.kind === "operation-outcome" && entry.payload.occurrenceId === result.details.freeflowV2.occurrenceId,
      );
      assert.match(failure.payload.error.message, /source_changed/);
      assert.equal(failure.payload.value, undefined);
    } finally {
      if (owned) prototype.read = originalRead;
      else delete prototype.read;
    }
  });
});

test("path and input policy deny before body; normal registry and v1 read remain untouched", async () => {
  await fixture(async ({ root, runtime, direct, state, routing, reader }) => {
    assert.equal(runtime.registry.describe(key).contractVersion, 2);
    const legacy = new ToolRuntime(() => state, routing, reader);
    assert.equal(legacy.registry.describe(key), undefined);
    assert.equal(legacy.registry.describe({ id: "project.readText", revision: "1" }).key.revision, "1");
    await mkdir(join(root, "private"));
    await writeFile(join(root, "private", "secret.txt"), "PRIVATE_MARKER\n");
    const outside = await mkdtemp(join(tmpdir(), "freeflow-v2-range-outside-"));
    try {
      await writeFile(join(outside, "secret.txt"), "OUTSIDE_MARKER\n");
      await symlink(join(outside, "secret.txt"), join(root, "escape.txt"));
      await symlink(outside, join(root, "outside-directory"));
      for (const path of ["private/secret.txt", "escape.txt", "outside-directory/secret.txt", "../secret.txt"]) {
        const denied = await direct({ files: [{ path, ranges: [{ startLine: 1, endLine: 1 }] }] });
        assert.equal(denied.details.outcome.status, "denied");
        assert.equal(denied.details.outcome.bodyStarted, false);
        assert.equal(JSON.stringify(denied).includes("MARKER"), false);
      }
      const invalid = await direct({ files: [{ path: "private/secret.txt", ranges: [{ startLine: 3, endLine: 1 }] }] });
      assert.equal(invalid.details.outcome.status, "denied");
      assert.equal(invalid.details.outcome.error.code, "invalid_range");
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
