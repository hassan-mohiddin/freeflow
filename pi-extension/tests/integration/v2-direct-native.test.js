import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { fixture as nativeFixture } from "../fixtures/routing-native.js";
import { resolveToolExecutionConfig } from "../../dist/tool-runtime/config.js";
import { registerDirectToolRuntimeTools, setDirectToolVisibility } from "../../dist/tool-runtime/direct-tools.js";
import { EffectRuntime } from "../../dist/tool-runtime/effects.js";
import { V2ExecutionRecorder } from "../../dist/tool-runtime/execution-record.js";
import { ToolRuntime } from "../../dist/tool-runtime/index.js";
import { registerToolRuntimeTools } from "../../dist/tool-runtime/tools.js";
import { resolveRgBackend } from "../../dist/tool-runtime/adapters/rg-backend.js";
import { SessionStoreRuntime } from "../../dist/tool-runtime/session-store/store.js";
import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "../../dist/host/read-only-session.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const limits = {
  perArtifactBytes: 65536,
  perRunBytes: 262144,
  perSessionBytes: 524288,
  totalBytes: 1048576,
  maxReadBytes: 32768,
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

let activate;
function isolatedDirect(pi) {
  const state = resolveToolExecutionConfig(
    {
      toolExecution: {
        enabled: true,
        discovery: { enabled: true },
        workspace: { enabled: true, write: true },
      },
    },
    {},
    true,
  );
  const effects = new EffectRuntime(pi);
  let store, fence;
  let sequence = 0;
  const recorder = new V2ExecutionRecorder(
    () => ({ store, fence, occurrenceId: () => `occurrence:native-direct-${++sequence}` }),
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
        throw new Error("unused legacy result");
      },
    },
    effects,
    undefined,
    recorder,
    { maxBytes: 1024 },
  );
  // This pre-P5 fixture uses a fixed root store fence; it does not qualify native ancestry refresh after effect entries.
  const operationContext = (ctx) => ({
    ...ctx,
    sessionManager: {
      getSessionId: () => ctx.sessionManager.getSessionId(),
      getBranch: () => ctx.sessionManager.getBranch(),
    },
  });
  const direct = {
    registry: tools.registry,
    invokeDirect: (name, id, input, signal, ctx, progress) =>
      tools.invokeDirect(name, id, input, signal, operationContext(ctx), progress),
  };
  registerToolRuntimeTools(pi, () => state, {
    invokeTools: (id, input, signal, ctx, progress) =>
      tools.invokeTools(id, input, signal, operationContext(ctx), progress),
  });
  registerDirectToolRuntimeTools(pi, () => state, direct);
  pi.on("session_start", async (_event, ctx) => {
    setDirectToolVisibility(pi, () => state, false);
    await effects.recover(ctx);
  });
  pi.on("tool_result", (event) => tools.patchResult(event));
  activate = async (manager) => {
    const sessionId = manager.getSessionId();
    const root = join(dirname(manager.getSessionFile()), "freeflow-session-store", "v2", hash(sessionId));
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
    const binding = { store, fence: () => fence };
    openStores.add(binding);
    setDirectToolVisibility(pi, () => state, true);
  };
}

const marker = "PRIVATE_DIRECT_CANONICAL_BODY_".repeat(110);
const before = `NEEDLE\nold\n${marker}\n`;
const patch = "*** Begin Patch\n*** Update File: source.txt\n@@\n NEEDLE\n-old\n+new\n*** End Patch\n";
const expectedRevisions = [{ path: "source.txt", sha256: hash(Buffer.from(before)) }];
const result = (manager, name) =>
  manager.getBranch().findLast((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    ?.message;
const qualified = await resolveRgBackend().then(
  () => true,
  () => false,
);

if (qualified) {
  test("scripted Pi sees six stable Freeflow definitions and bounded direct read/search/patch results", async () => {
    let cwdPath;
    const observed = await fixture(
      async (request, wire, manager) => {
        const names = wire.tools.map((tool) => tool.name);
        for (const name of [
          "freeflow_tools",
          "freeflow_run",
          "freeflow_result",
          "freeflow_read",
          "freeflow_search",
          "freeflow_patch",
        ])
          assert.ok(names.includes(name), `missing ${name}`);
        if (request === 1)
          return [
            {
              name: "freeflow_read",
              args: {
                files: [{ path: "source.txt", ranges: [{ startLine: 1, endLine: 3 }] }],
                maxBytes: 8192,
              },
            },
          ];
        const output = wire.input.filter((item) => item.type === "function_call_output").at(-1);
        assert.ok(output);
        assert.equal(JSON.stringify(output).includes(marker), false);
        if (request === 2) {
          const read = result(manager, "freeflow_read");
          assert.equal(read.details.outcome.status, "succeeded");
          assert.equal("value" in read.details.outcome, false);
          assert.ok(Buffer.byteLength(read.content[0].text) <= 1024);
          assert.equal(JSON.stringify(read.details).includes(marker), false);
          return [{ name: "freeflow_search", args: { kind: "paths", query: "source.txt", paths: ["source.txt"] } }];
        }
        if (request === 3) {
          assert.equal(result(manager, "freeflow_search").details.outcome.status, "succeeded");
          return [
            { name: "freeflow_search", args: { kind: "text", query: "NEEDLE", mode: "count", paths: ["source.txt"] } },
          ];
        }
        if (request === 4) {
          assert.match(result(manager, "freeflow_search").content[0].text, /count: 1 reported match/);
          return [{ name: "freeflow_patch", args: { patch, expectedRevisions, dryRun: true } }];
        }
        if (request === 5) {
          assert.equal(result(manager, "freeflow_patch").details.outcome.status, "succeeded");
          assert.equal((await readFile(join(cwdPath, "source.txt"))).toString(), before);
          return [{ name: "freeflow_patch", args: { patch, expectedRevisions } }];
        }
        if (request === 6) {
          const applied = result(manager, "freeflow_patch");
          assert.equal(applied.details.outcome.status, "succeeded");
          assert.equal(applied.details.outcome.effectState, "completed");
          assert.equal(applied.details.freeflowV2.persistence.state, "sidecar-acknowledged");
          assert.equal((await readFile(join(cwdPath, "source.txt"))).toString(), before.replace("\nold\n", "\nnew\n"));
          const persisted = activeReadOnlySessionBranch(
            await readOnlySessionSnapshot(manager.getSessionFile()),
            manager.getLeafId(),
          );
          const directResults = persisted.filter(
            (entry) =>
              entry.message?.role === "toolResult" &&
              ["freeflow_read", "freeflow_search", "freeflow_patch"].includes(entry.message.toolName),
          );
          assert.equal(directResults.length, 5);
          assert.ok(directResults.every((entry) => JSON.stringify(entry.message.details).includes(marker) === false));
          return [];
        }
        assert.fail(`unexpected request ${request}`);
      },
      false,
      undefined,
      false,
      {
        skipFreeflow: true,
        extensions: [isolatedDirect],
        beforePrompt: async ({ cwd, manager }) => {
          cwdPath = cwd;
          await writeFile(join(cwd, "source.txt"), before);
          await activate(manager);
        },
        maxRequests: 6,
      },
    );
    assert.equal(observed.requests.length, 6);
    const progress = observed.toolUpdates.map((event) => ({
      name: event.toolName,
      snapshot: event.partialResult?.details?.freeflowProgress,
    }));
    assert.ok(progress.some(({ name, snapshot }) => name === "freeflow_read" && snapshot?.phase === "preparing"));
    assert.ok(progress.some(({ name, snapshot }) => name === "freeflow_search" && snapshot?.phase === "settling"));
    assert.ok(
      progress.some(
        ({ name, snapshot }) =>
          name === "freeflow_patch" && snapshot?.phase === "settling" && snapshot.current?.effectState === "completed",
      ),
    );
  });
} else {
  test("native direct fixture does not claim unqualified search availability", async () => {
    await assert.rejects(
      () => resolveRgBackend(),
      (error) => error.code === "backend_unavailable",
    );
  });
}
