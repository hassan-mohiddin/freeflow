import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { fixture } from "../fixtures/routing-native.js";

const call = (name, args) => [{ name, args }];
const toolResult = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .at(-1)?.message;
const details = (manager, name) => toolResult(manager, name)?.details;

const enabled = {
  toolExecution: {
    enabled: true,
    discovery: { enabled: true },
    workspace: { enabled: true },
    capture: { enabled: true, maxInlineBytes: 512, maxStoredBytes: 4 * 1024 * 1024 },
  },
};

test("native stable facade performs search, describe, and exact direct workspace read", async () => {
  await fixture(
    (request, wire, manager) => {
      if (request === 1) return call("freeflow_tools", { operation: "search", query: "workspace text", limit: 5 });
      if (request === 2) {
        assert.ok(details(manager, "freeflow_tools").hits.some((hit) => hit.key.id === "project.readText"));
        return call("freeflow_tools", {
          operation: "describe",
          operations: [{ id: "project.readText", revision: "1" }],
        });
      }
      if (request === 3) {
        const descriptor = details(manager, "freeflow_tools").operations[0];
        assert.equal(descriptor.available, true);
        assert.equal(descriptor.inputSchema.additionalProperties, false);
        assert.ok(wire.tools.some((tool) => tool.name === "freeflow_tools"));
        return call("freeflow_tools", {
          operation: "call",
          operationKey: { id: "project.readText", revision: "1" },
          input: { path: "workspace.txt", offsetBytes: 0, maxBytes: 32 },
        });
      }
      if (request === 4) {
        const outcome = details(manager, "freeflow_tools").outcome;
        assert.equal(outcome.status, "succeeded");
        assert.equal(outcome.value.text, "DIRECT_NATIVE_WORKSPACE_BODY");
        assert.equal(JSON.stringify(wire).includes("DIRECT_NATIVE_WORKSPACE_BODY"), true);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: enabled,
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "workspace.txt"), "DIRECT_NATIVE_WORKSPACE_BODY"),
    },
  );
});

test("native direct mutation failure preserves effect facts and receives error status", async () => {
  const writable = {
    toolExecution: {
      enabled: true,
      discovery: { enabled: true },
      workspace: { enabled: true, write: true },
    },
  };
  await fixture(
    (request, _wire, manager) => {
      if (request === 1)
        return call("freeflow_tools", {
          operation: "call",
          operationKey: { id: "project.replaceExact", revision: "1" },
          input: {
            path: "guarded.txt",
            expectedSha256: "0".repeat(64),
            oldText: "before",
            replacement: "after",
          },
        });
      if (request === 2) {
        const message = toolResult(manager, "freeflow_tools");
        assert.equal(message.isError, true);
        assert.equal(message.details.outcome.status, "failed");
        assert.equal(message.details.outcome.effect, "mutation");
        assert.equal(message.details.outcome.effectState, "none");
        return call("bash", { command: "cat guarded.txt" });
      }
      if (request === 3) {
        assert.equal(toolResult(manager, "bash").content[0].text, "before\n");
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: writable,
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "guarded.txt"), "before\n"),
    },
  );
});

test("native facade uses the accepted capture reader through result.read@1", async () => {
  const body = `BEGIN\n${"x".repeat(4000)}\nDIRECT_CAPTURE_SENTINEL\nEND`;
  let captureId;
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return call("bash", { command: "cat captured.txt" });
      if (request === 2) {
        captureId = manager.getBranch().find((entry) => entry.customType === "freeflow-tool-capture-v1")?.data?.id;
        assert.ok(captureId);
        return call("freeflow_tools", {
          operation: "call",
          operationKey: { id: "result.read", revision: "1" },
          input: { id: captureId, offsetBytes: 0, maxBytes: 8192 },
        });
      }
      if (request === 3) {
        const outcome = details(manager, "freeflow_tools").outcome;
        assert.equal(outcome.status, "succeeded");
        assert.match(outcome.value.text, /DIRECT_CAPTURE_SENTINEL/);
        assert.equal(outcome.value.id, captureId);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: enabled,
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "captured.txt"), body),
    },
  );
});
