import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { fixture as nativeFixture } from "../fixtures/routing-native.js";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { registerToolRuntimeTools } from "../../dist/tool-runtime/tools.js";
import { resolveRgBackend } from "../../dist/tool-runtime/adapters/rg-backend.js";
import { SessionStoreRuntime } from "../../dist/tool-runtime/session-store/store.js";
import { readOnlySessionSnapshot, activeReadOnlySessionBranch } from "../../dist/host/read-only-session.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const limits = {
  perArtifactBytes: 128 * 1024,
  perRunBytes: 256 * 1024,
  perSessionBytes: 512 * 1024,
  totalBytes: 1024 * 1024,
  maxReadBytes: 32 * 1024,
};
const openStores = new Set();
async function fixture(...args) {
  try {
    return await nativeFixture(...args);
  } finally {
    for (const binding of openStores) await binding.store.close(binding.fence()).catch(() => binding.store.abandon());
    openStores.clear();
  }
}

function isolatedSearch(pi) {
  const state = resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        workspace: { enabled: true, write: false, denyPaths: [".git", "private"] },
        discovery: { enabled: true },
      },
    },
    {},
    true,
  );
  let store;
  let fence;
  let binding;
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:search-${++sequence}` }),
    128,
  );
  const tools = new ToolRuntime(
    () => state,
    {
      scope: () => ({}),
      responsibility: () => ({ profile: "solo", control: "inactive" }),
      admit: () => ({ kind: "allowed" }),
    },
    {
      read: async () => {
        throw new Error("unused legacy reader");
      },
    },
    undefined,
    undefined,
    recorder,
    { maxBytes: 1024 },
  );
  registerToolRuntimeTools(pi, () => state, {
    invokeTools: async (callId, input, signal, ctx, progress) => {
      if (!store) {
        const sessionId = ctx.sessionManager.getSessionId();
        const root = join(
          dirname(ctx.sessionManager.getSessionFile()),
          "freeflow-session-store",
          "v2",
          hash(sessionId),
        );
        store = new SessionStoreRuntime(
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
        fence = await store.open();
        binding = { store, fence: () => fence };
        openStores.add(binding);
      }
      const leaf = ctx.sessionManager.getLeafId() ?? "root";
      if (fence.branchAnchor !== leaf) fence = await store.refreshBranch(fence, leaf);
      return tools.invokeTools(callId, input, signal, ctx, progress);
    },
  });
  pi.on("session_shutdown", async () => {
    if (store) await store.close(fence).catch(() => store.abandon());
    if (binding) openStores.delete(binding);
  });
}

const qualified = await resolveRgBackend().then(
  () => true,
  () => false,
);
if (!qualified) {
  test("search-native fixture requires the explicitly qualified local PATH backend", async () => {
    await assert.rejects(
      () => resolveRgBackend(),
      (error) => error.code === "backend_unavailable",
    );
  });
} else {
  test("scripted Pi result/provider history uses bounded v2 search views without changing native tools", async () => {
    const marker = "PRIVATE_UNMATCHED_SEARCH_BODY_".repeat(160);
    const observed = await fixture(
      async (request, wire, manager) => {
        if (request === 1)
          return [
            {
              name: "freeflow_tools",
              args: {
                operation: "call",
                operationKey: { id: "project.searchText", revision: "2" },
                input: { query: "NEEDLE", mode: "count", paths: ["source.txt"] },
              },
            },
          ];
        if (request === 2) {
          const output = wire.input.find((item) => item.type === "function_call_output");
          const result = manager
            .getBranch()
            .findLast(
              (entry) => entry.message?.role === "toolResult" && entry.message.toolName === "freeflow_tools",
            )?.message;
          assert.ok(result);
          assert.equal(result.details.outcome.status, "succeeded");
          assert.equal(result.details.outcome.effectState, "completed");
          assert.equal(result.details.freeflowV2.persistence.state, "sidecar-acknowledged");
          assert.match(JSON.stringify(output), /count: 1 reported match/);
          assert.equal(JSON.stringify(output).includes(marker), false);
          assert.equal(JSON.stringify(result.details).includes(marker), false);
          assert.equal("value" in result.details.outcome, false);
          return [
            {
              name: "freeflow_tools",
              args: {
                operation: "call",
                operationKey: { id: "project.findPaths", revision: "1" },
                input: { query: "source.txt", paths: ["."] },
              },
            },
          ];
        }
        if (request === 3) {
          const output = wire.input.filter((item) => item.type === "function_call_output").at(-1);
          assert.match(JSON.stringify(output), /source\.txt/);
          assert.equal(JSON.stringify(output).includes(marker), false);
          const persisted = activeReadOnlySessionBranch(
            await readOnlySessionSnapshot(manager.getSessionFile()),
            manager.getLeafId(),
          );
          const results = persisted.filter(
            (entry) => entry.message?.role === "toolResult" && entry.message.toolName === "freeflow_tools",
          );
          assert.equal(results.length, 2);
          assert.equal(
            results.every((entry) => JSON.stringify(entry.message.details).includes(marker) === false),
            true,
          );
          return [];
        }
        assert.fail(`unexpected request ${request}`);
      },
      false,
      undefined,
      false,
      {
        skipFreeflow: true,
        extensions: [isolatedSearch],
        beforePrompt: ({ cwd }) => writeFile(join(cwd, "source.txt"), `NEEDLE\n${marker}\n`),
        maxRequests: 3,
      },
    );
    assert.equal(observed.requests.length, 3);
  });
}
