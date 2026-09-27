import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { fixture as nativeFixture } from "../fixtures/routing-native.js";
import { GuidanceRuntime } from "../../dist/guidance/runtime.js";
import { SessionStoreRuntime } from "../../dist/session-store/store.js";

const skillPath = join(process.cwd(), "capabilities", "tool-execution", "SKILL.md");
const skillBody = await readFile(skillPath, "utf8");
const limits = {
  perArtifactBytes: 65536,
  perRunBytes: 262144,
  perSessionBytes: 524288,
  totalBytes: 1048576,
  maxReadBytes: 32768,
};
const openStores = new Set();
let activate;
let guidance;
let activeStore;

function isolatedGuidance(pi) {
  let binding;
  guidance = new GuidanceRuntime(skillPath, () => binding);
  pi.on("resources_discover", () => ({ skillPaths: [skillPath] }));
  pi.on("tool_result", (event, ctx) => guidance.observeRead(event, ctx));
  pi.on("turn_end", (event, ctx) => guidance.turnEnd(event, ctx));
  // Last before_provider_request observer in this controlled fixture. This is a local
  // assembled-request observation, not an assertion about a live provider or other extensions.
  pi.on("before_provider_request", (event, ctx) => guidance.observePrepared(event.payload, ctx, true));
  activate = async (manager) => {
    const sessionId = manager.getSessionId();
    const root = join(
      dirname(manager.getSessionFile()),
      "freeflow-session-store",
      "v2",
      createHash("sha256").update(sessionId).digest("hex"),
    );
    const store = new SessionStoreRuntime(
      root,
      {
        schemaVersion: 2,
        storeId: `store:${randomUUID()}`,
        originSessionId: sessionId,
        host: { id: "pi", contract: "0.87.x" },
        createdBy: { package: "fixture", version: "1" },
        domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
      },
      limits,
    );
    const fence = await store.open();
    activeStore = store;
    binding = { store, fence };
    openStores.add(binding);
    await guidance.refresh({ sessionManager: manager });
  };
}

async function fixture(...args) {
  try {
    return await nativeFixture(...args);
  } finally {
    for (const { store, fence } of openStores) await store.close(fence).catch(() => store.abandon());
    openStores.clear();
  }
}

test("scripted Pi read introduces exact packaged skill; a unique completed request observes delivery, not discovery", async () => {
  const observed = await fixture(
    (request, wire, manager) => {
      if (request === 1) {
        assert.deepEqual(guidance.status({ sessionManager: manager }), { state: "absent" });
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      if (request === 2) {
        assert.deepEqual(guidance.status({ sessionManager: manager }), { state: "absent" });
        return [{ name: "read", args: { path: skillPath } }];
      }
      if (request === 3) {
        const result = manager
          .getBranch()
          .findLast(
            (entry) =>
              entry.message?.role === "toolResult" &&
              entry.message.toolName === "read" &&
              entry.message.content[0].text === skillBody,
          );
        assert.ok(result?.id);
        assert.equal(guidance.status({ sessionManager: manager }).state, "introduced");
        const output = wire.input.find(
          (item) => item.type === "function_call_output" && item.call_id === result.message.toolCallId.split("|")[0],
        );
        assert.equal(output?.output, skillBody);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ manager }) => {
      const status = guidance.status({ sessionManager: manager });
      assert.equal(status.state, "delivered");
      assert.equal(status.boundary, "completed-local-request-observation");
      const branch = manager.getBranch();
      const events = await activeStore.replay("guidance", {
        sessionId: manager.getSessionId(),
        branchAnchor: "root",
        nativeEntryIds: branch.map((entry) => entry.id),
      });
      assert.deepEqual(
        events.map((event) => event.kind),
        ["skill-introduced", "skill-delivered"],
      );
      assert.ok(branch.some((entry) => entry.id === events[0].nativeEntryId && entry.message?.role === "toolResult"));
      assert.ok(branch.some((entry) => entry.id === events[1].nativeEntryId && entry.message?.role === "assistant"));
      assert.equal(events[1].payload.occurrenceId, events[0].payload.occurrenceId);
    },
    false,
    {
      skipFreeflow: true,
      cognitiveRouting: { enabled: false },
      extensions: [isolatedGuidance],
      beforePrompt: ({ manager }) => activate(manager),
      maxRequests: 3,
    },
  );
  assert.equal(observed.requests.length, 3);
});

test("a later native result hook changing the skill body prevents Guidance introduction and delivery", async () => {
  const laterHook = (pi) =>
    pi.on("tool_result", (event) =>
      event.toolName === "read" && event.input?.path === skillPath
        ? { content: [{ type: "text", text: "ALTERED_SKILL_BODY" }] }
        : undefined,
    );
  await fixture(
    (request, wire, manager) => {
      if (request === 1) return [{ name: "read", args: { path: skillPath } }];
      if (request === 2) {
        assert.deepEqual(guidance.status({ sessionManager: manager }), { state: "absent" });
        const output = wire.input.find((item) => item.type === "function_call_output");
        assert.equal(output?.output, "ALTERED_SKILL_BODY");
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ manager }) => {
      assert.deepEqual(guidance.status({ sessionManager: manager }), { state: "absent" });
      const events = await activeStore.replay("guidance", {
        sessionId: manager.getSessionId(),
        branchAnchor: "root",
        nativeEntryIds: manager.getBranch().map((entry) => entry.id),
      });
      assert.deepEqual(events, []);
    },
    false,
    {
      skipFreeflow: true,
      cognitiveRouting: { enabled: false },
      extensions: [isolatedGuidance, laterHook],
      beforePrompt: ({ manager }) => activate(manager),
      maxRequests: 2,
    },
  );
});
