import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";

import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fixture as nativeFixture } from "../../fixtures/routing-native.js";
import { resolveToolExecutionConfig } from "../../../dist/tool-runtime/config.js";
import { ResultRuntime } from "../../../dist/tool-runtime/results/runtime.js";
import {
  V2ArtifactReader,
  V2_ARTIFACT_ENTRY,
  isV2ArtifactAnchor,
  openLocalOrigin,
} from "../../../dist/tool-runtime/results/v2.js";
import { V2CapturePublisher } from "../../../dist/tool-runtime/results/v2-capture.js";
import { registerToolRuntimeTools } from "../../../dist/tool-runtime/tools.js";
import { SessionStoreRuntime } from "../../../dist/tool-runtime/session-store/store.js";

const openStores = new Set();
async function fixture(...args) {
  try {
    return await nativeFixture(...args);
  } finally {
    for (const binding of openStores) await binding.store.close(binding.fence()).catch(() => binding.store.abandon());
    openStores.clear();
  }
}

const hash = (value) => createHash("sha256").update(value).digest("hex");
const lines = Array.from(
  { length: 500 },
  (_, index) => `ROW-${index} ${index === 250 ? "V2_EXACT_MIDDLE_SENTINEL" : "ordinary fixture data"} αβ`,
);
const body = lines.join("\n");
const middleOffset = Buffer.byteLength(body.slice(0, body.indexOf("V2_EXACT_MIDDLE_SENTINEL")));
const config = {
  toolExecution: { enabled: true, capture: { enabled: true, maxInlineBytes: 1800, maxStoredBytes: 4 * 1024 * 1024 } },
};
const limits = {
  perArtifactBytes: 4 * 1024 * 1024,
  perRunBytes: 8 * 1024 * 1024,
  perSessionBytes: 16 * 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
  maxReadBytes: 32_768,
};
const text = (message) =>
  (message?.content ?? [])
    .filter((block) => block?.type === "text")
    .map((block) => block.text)
    .join("");
const resultFor = (manager, name) =>
  manager.getBranch().findLast((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    ?.message;
const anchors = (manager) =>
  manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === V2_ARTIFACT_ENTRY);

function isolatedCapture(options = {}) {
  return (pi) => {
    const state = resolveToolExecutionConfig(config, {}, true);
    let store;
    let fence;
    let manifest;
    let results;
    let owned;
    const reader = new V2ArtifactReader((anchor, ctx) => openLocalOrigin(anchor, ctx, limits));
    const nativeAppend = options.failAnchorAfterAppend
      ? {
          appendEntry(type, data) {
            pi.appendEntry(type, data);
            throw new Error("injected after-native-append failure");
          },
        }
      : pi;
    const publisher = new V2CapturePublisher(nativeAppend, async (ctx, observation) => {
      if (options.failBinding) throw new Error("injected store failure");
      if (!store) {
        const sessionFile = ctx.sessionManager.getSessionFile();
        const sessionId = observation.sessionId;
        const root = join(dirname(sessionFile), "freeflow-session-store", "v2", hash(sessionId));
        manifest = {
          schemaVersion: 2,
          storeId: `store:${randomUUID()}`,
          originSessionId: sessionId,
          host: { id: "pi", contract: "0.87.x" },
          createdBy: { package: "fixture", version: "1" },
          domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
        };
        store = new SessionStoreRuntime(root, manifest, limits);
        fence = await store.open();
        owned = { store, fence: () => fence };
        openStores.add(owned);
        if (options.failCaptureEvent) {
          const append = store.appendEvent.bind(store);
          store.appendEvent = async (event, eventFence) => {
            if (event.kind === "native-capture") throw new Error("injected capture event failure");
            return append(event, eventFence);
          };
        }
        if (options.invalidateAfterArtifact) {
          const publish = store.publishArtifact.bind(store);
          store.publishArtifact = async (...args) => {
            const published = await publish(...args);
            results.reset();
            return published;
          };
        }
      }
      const leaf = ctx.sessionManager.getLeafId() ?? "root";
      if (fence.branchAnchor !== leaf) fence = await store.refreshBranch(fence, leaf);
      return { store, fence, manifest };
    });
    results = new ResultRuntime(
      pi,
      () => state,
      () => ({ profile: "solo", control: "inactive" }),
      () => ({ recovery: false }),
      reader,
      publisher,
    );
    registerToolRuntimeTools(pi, () => state, { readResult: (input, signal, ctx) => results.read(input, signal, ctx) });
    pi.on("tool_call", (event, ctx) => results.toolCall(event, ctx));
    pi.on("tool_result", (event, ctx) => results.capture(event, ctx));
    pi.on("turn_end", (event) => results.turnEnd(event));
    pi.on("session_shutdown", async () => {
      if (store) await store.close(fence).catch(() => store.abandon());
      if (owned) openStores.delete(owned);
    });
  };
}

const setup = ({ cwd }) => writeFile(join(cwd, "observation.txt"), body);

test("qualified built-in Bash text publishes v2 artifact/event/native anchor and exact bounded recovery", async () => {
  let id;
  await fixture(
    (request, wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "cat observation.txt" } }];
      if (request === 2) {
        const native = resultFor(manager, "bash");
        assert.equal(native.isError, false);
        assert.ok(Buffer.byteLength(text(native), "utf8") <= 1800);
        assert.equal(text(native).includes("V2_EXACT_MIDDLE_SENTINEL"), false);
        assert.equal(anchors(manager).length, 1);
        const anchor = anchors(manager)[0].data;
        assert.equal(isV2ArtifactAnchor(anchor), true);
        assert.equal(
          isV2ArtifactAnchor({
            ...anchor,
            native: { ...anchor.native, emissionSha256: { toString: () => anchor.native.emissionSha256 } },
          }),
          false,
        );
        id = anchor.id;
        assert.match(text(native), new RegExp(id));
        assert.equal(JSON.stringify(wire).includes("V2_EXACT_MIDDLE_SENTINEL"), false);
        return [{ name: "freeflow_result", args: { id, offsetBytes: middleOffset, maxBytes: 1024 } }];
      }
      if (request === 3) {
        const read = resultFor(manager, "freeflow_result");
        assert.equal(read.isError, false);
        assert.match(text(read), /V2_EXACT_MIDDLE_SENTINEL/);
        assert.equal(read.details.capturedArtifact.id, id);
        assert.equal(JSON.stringify(wire).includes("V2_EXACT_MIDDLE_SENTINEL"), true);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ manager }) => {
      assert.ok(id);
      manager.appendCompaction("Earlier output compacted; source remains exact.", manager.getLeafId(), 100);
      const reader = new V2ArtifactReader((anchor, ctx) => openLocalOrigin(anchor, ctx, limits));
      const read = (native) =>
        reader.readValue(
          { id, offsetBytes: middleOffset, maxBytes: Buffer.byteLength("V2_EXACT_MIDDLE_SENTINEL") },
          undefined,
          { sessionManager: native },
          { recovery: false },
        );
      assert.match((await read(manager)).data, /V2_EXACT_MIDDLE_SENTINEL/);
      const forkFile = manager.createBranchedSession(manager.getLeafId());
      const fork = SessionManager.open(forkFile);
      assert.match((await read(fork)).data, /V2_EXACT_MIDDLE_SENTINEL/);
    },
    false,
    { skipFreeflow: true, extensions: [isolatedCapture()], beforePrompt: setup, maxRequests: 3 },
  );
});

test("later result-hook mutation makes the earlier v2 capture unavailable", async () => {
  const late = (pi) =>
    pi.on("tool_result", (event) =>
      event.toolName === "bash"
        ? { content: [{ type: "text", text: `${text(event)}\nLATE_HOOK` }], details: event.details }
        : undefined,
    );
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "cat observation.txt" } }];
      if (request === 2) {
        assert.equal(anchors(manager).length, 1);
        assert.match(text(resultFor(manager, "bash")), /LATE_HOOK/);
        return [{ name: "freeflow_result", args: { id: anchors(manager)[0].data.id, offsetBytes: 0, maxBytes: 1024 } }];
      }
      if (request === 3) {
        const denied = resultFor(manager, "freeflow_result");
        assert.equal(denied.isError, true);
        assert.match(text(denied), /Final native result differs from the captured emission/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { skipFreeflow: true, extensions: [isolatedCapture(), late], beforePrompt: setup, maxRequests: 3 },
  );
});

test("native append uncertainty leaves original output and cannot expose the earlier v2 body", async () => {
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "cat observation.txt" } }];
      if (request === 2) {
        assert.equal(anchors(manager).length, 1, "append advanced native state before reporting failure");
        assert.match(text(resultFor(manager, "bash")), /V2_EXACT_MIDDLE_SENTINEL/);
        return [{ name: "freeflow_result", args: { id: anchors(manager)[0].data.id, offsetBytes: 0, maxBytes: 1024 } }];
      }
      if (request === 3) {
        const denied = resultFor(manager, "freeflow_result");
        assert.equal(denied.isError, true);
        assert.match(text(denied), /Final native result differs from the captured emission/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      skipFreeflow: true,
      extensions: [isolatedCapture({ failAnchorAfterAppend: true })],
      beforePrompt: setup,
      maxRequests: 3,
    },
  );
});

test("an extension-owned Bash override is never captured as a qualified native producer", async () => {
  const override = (pi) =>
    pi.registerTool({
      name: "bash",
      label: "Override",
      description: "Fixture Bash override",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { command: { type: "string" } },
        required: ["command"],
      },
      async execute() {
        return { content: [{ type: "text", text: body }], details: { override: true } };
      },
    });
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "fixture" } }];
      if (request === 2) {
        assert.equal(anchors(manager).length, 0);
        assert.equal(resultFor(manager, "bash").details.override, true);
        assert.match(text(resultFor(manager, "bash")), /V2_EXACT_MIDDLE_SENTINEL/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { skipFreeflow: true, extensions: [override, isolatedCapture()], maxRequests: 2 },
  );
});

test("upstream-truncated Bash output retains limited coverage and native retrieval metadata", async () => {
  const large = `BEGIN_RAW_ONLY\n${Array.from({ length: 2500 }, (_, index) => `long-line-${index} ${"x".repeat(45)}`).join("\n")}`;
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "cat observation.txt" } }];
      if (request === 2) {
        const anchor = anchors(manager)[0]?.data;
        const native = resultFor(manager, "bash");
        assert.ok(anchor);
        assert.equal(anchor.native.externalCoverage, "limited");
        assert.ok(anchor.bytes < Buffer.byteLength(large));
        assert.match(text(native), /Upstream coverage: limited/);
        assert.ok(native.details.fullOutputPath);
        assert.equal(JSON.stringify(anchor).includes(native.details.fullOutputPath), false);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      skipFreeflow: true,
      extensions: [isolatedCapture()],
      beforePrompt: ({ cwd }) => writeFile(join(cwd, "observation.txt"), large),
      maxRequests: 2,
    },
  );
});

test("parallel native completions retain distinct v2 artifact, call, and exact read identities", async () => {
  const a = body.replace("V2_EXACT_MIDDLE_SENTINEL", "V2_PARALLEL_A");
  const b = body.replace("V2_EXACT_MIDDLE_SENTINEL", "V2_PARALLEL_B");
  const offsetA = Buffer.byteLength(a.slice(0, a.indexOf("V2_PARALLEL_A")));
  const offsetB = Buffer.byteLength(b.slice(0, b.indexOf("V2_PARALLEL_B")));
  await fixture(
    (request, _wire, manager) => {
      if (request === 1)
        return [
          { name: "bash", args: { command: "cat observation-a.txt" } },
          { name: "bash", args: { command: "cat observation-b.txt" } },
        ];
      if (request === 2) {
        const found = anchors(manager).map((entry) => entry.data);
        assert.equal(found.length, 2);
        assert.equal(new Set(found.map((anchor) => anchor.id)).size, 2);
        assert.equal(new Set(found.map((anchor) => anchor.native.toolCallId)).size, 2);
        const byHash = new Map(found.map((anchor) => [anchor.artifactSha256, anchor]));
        return [
          { name: "freeflow_result", args: { id: byHash.get(hash(a)).id, offsetBytes: offsetA, maxBytes: 1024 } },
          { name: "freeflow_result", args: { id: byHash.get(hash(b)).id, offsetBytes: offsetB, maxBytes: 1024 } },
        ];
      }
      if (request === 3) {
        const reads = manager
          .getBranch()
          .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "freeflow_result")
          .slice(-2)
          .map((entry) => text(entry.message))
          .join("\n");
        assert.match(reads, /V2_PARALLEL_A/);
        assert.match(reads, /V2_PARALLEL_B/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      skipFreeflow: true,
      extensions: [isolatedCapture()],
      beforePrompt: async ({ cwd }) => {
        await writeFile(join(cwd, "observation-a.txt"), a);
        await writeFile(join(cwd, "observation-b.txt"), b);
      },
      maxRequests: 3,
    },
  );
});

test("capture event failure after artifact publication leaves native output and no anchor", async () => {
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "cat observation.txt" } }];
      if (request === 2) {
        assert.equal(anchors(manager).length, 0);
        assert.match(text(resultFor(manager, "bash")), /V2_EXACT_MIDDLE_SENTINEL/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      skipFreeflow: true,
      extensions: [isolatedCapture({ failCaptureEvent: true })],
      beforePrompt: setup,
      maxRequests: 2,
    },
  );
});

test("session generation change after artifact publication retains native output and publishes no anchor", async () => {
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "cat observation.txt" } }];
      if (request === 2) {
        assert.equal(anchors(manager).length, 0);
        assert.match(text(resultFor(manager, "bash")), /V2_EXACT_MIDDLE_SENTINEL/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      skipFreeflow: true,
      extensions: [isolatedCapture({ invalidateAfterArtifact: true })],
      beforePrompt: setup,
      maxRequests: 2,
    },
  );
});

test("a branch change after artifact publication cannot acknowledge a capture event or native anchor", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-branch-fence-"));
  const manifest = {
    schemaVersion: 2,
    storeId: "store:fixture",
    originSessionId: "session:fixture",
    host: { id: "pi", contract: "0.87.x" },
    createdBy: { package: "fixture", version: "1" },
    domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
  };
  const store = new SessionStoreRuntime(join(root, "store"), manifest, limits);
  const fence = await store.open();
  let leaf = "root";
  let nativeAppends = 0;
  const publish = store.publishArtifact.bind(store);
  store.publishArtifact = async (...args) => {
    const artifact = await publish(...args);
    leaf = "entry:other";
    return artifact;
  };
  const publisher = new V2CapturePublisher(
    {
      appendEntry() {
        nativeAppends += 1;
      },
    },
    async () => ({ store, fence, manifest }),
  );
  try {
    await assert.rejects(
      () =>
        publisher.publish(
          {
            sessionId: "session:fixture",
            assistantEntryId: "entry:assistant",
            toolCallId: "call:one",
            producer: { profile: "solo", control: "inactive" },
            body: "A".repeat(2000),
            externalCoverage: "unspecified",
            maxInlineBytes: 512,
          },
          { sessionManager: { getLeafId: () => leaf, getSessionId: () => "session:fixture" } },
          () => true,
        ),
      /session_changed/,
    );
    assert.equal(nativeAppends, 0);
    assert.deepEqual(
      await store.replay("execution", { sessionId: "session:fixture", branchAnchor: "root", nativeEntryIds: [] }),
      [],
      "without a native owner, the artifact is not branch-effective",
    );
    assert.deepEqual(
      store.events.entries().map((entry) => entry.event.kind),
      ["artifact-published"],
      "the acknowledged artifact publication still exists for diagnosis; no effect is erased",
    );
  } finally {
    await store.close(fence);
    await rm(root, { recursive: true, force: true });
  }
});

test("v2 storage failure retains the original native Bash result without false recovery", async () => {
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return [{ name: "bash", args: { command: "cat observation.txt" } }];
      if (request === 2) {
        const native = resultFor(manager, "bash");
        assert.equal(native.isError, false);
        assert.match(text(native), /V2_EXACT_MIDDLE_SENTINEL/);
        assert.equal(anchors(manager).length, 0);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { skipFreeflow: true, extensions: [isolatedCapture({ failBinding: true })], beforePrompt: setup, maxRequests: 2 },
  );
});
