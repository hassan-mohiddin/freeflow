import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { fixture } from "../fixtures/routing-native.js";

const command = (name, args) => [{ name, args }];
const resultFor = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .at(-1)?.message;

const body = "before ROUTING_TARGET after\n";
const expectedSha256 = createHash("sha256").update(body).digest("hex");

const config = {
  toolExecution: {
    enabled: true,
    programs: { mode: "adapters", timeoutMs: 1000, maxParallelReads: 4 },
    workspace: { enabled: true, write: true },
  },
  cognitiveRouting: {
    enabled: true,
    projection: false,
    delegation: "helper",
    profiles: {
      coordinator: { provider: "openai", model: "gpt-4o", thinking: "off" },
      helper: { provider: "openai", model: "gpt-4.1-mini", thinking: "off" },
    },
  },
};

test("unresolved live effect permits partial return but blocks completed return and accepted closure", async () => {
  let target;
  let originalAppend;
  await fixture(
    async (request, wire, manager) => {
      if (request === 1)
        return command("freeflow_delegate", {
          operation: "assign",
          contract: "Perform the guarded local replacement and report its exact effect state.",
        });
      if (request === 2) {
        originalAppend = manager.appendCustomEntry.bind(manager);
        manager.appendCustomEntry = (type, data) => {
          if (type === "freeflow-tool-effect-v1" && data?.event === "settled")
            throw new Error("fixture settlement persistence unavailable");
          return originalAppend(type, data);
        };
        return command("freeflow_run", {
          code: `await tools.invoke("project.replaceExact", { path: "routing-effect.txt", expectedSha256: input.expectedSha256, oldText: "ROUTING_TARGET", replacement: "ROUTING_DONE" });`,
          description: "guarded routed replacement",
          operations: [{ id: "project.replaceExact", revision: "1" }],
          input: { expectedSha256 },
          timeoutMs: 1000,
        });
      }
      if (request === 3) {
        const run = resultFor(manager, "freeflow_run");
        assert.equal(run.isError, true);
        assert.equal(run.details.freeflowRun.programStatus, "interrupted");
        assert.equal(run.details.freeflowRun.effectsSettled, false);
        assert.equal(run.details.freeflowRun.calls.unknown, 1);
        assert.equal(await readFile(target, "utf8"), "before ROUTING_DONE after\n");
        assert.equal(JSON.stringify(wire).includes("live effects fenced (1)"), true);
        return command("freeflow_return", {
          operation: "submit",
          outcome: "completed",
          report: "Replacement completed cleanly.",
        });
      }
      if (request === 4) {
        const blocked = resultFor(manager, "freeflow_return").details;
        assert.equal(blocked.status, "blocked");
        assert.equal(blocked.code, "unresolved_effect");
        return command("freeflow_return", {
          operation: "submit",
          outcome: "partial",
          report: "The replacement bytes are visible, but settlement persistence is unresolved.",
          limitations: ["A live mutation remains fenced pending reconciliation."],
        });
      }
      if (request === 5) {
        assert.equal(resultFor(manager, "freeflow_return").details.status, "accepted");
        return command("freeflow_unit", {
          operation: "close",
          outcome: "accepted",
          assessment: "Accept the replacement as cleanly settled.",
        });
      }
      if (request === 6) {
        const blocked = resultFor(manager, "freeflow_unit").details;
        assert.equal(blocked.status, "blocked");
        assert.equal(blocked.code, "unresolved_effect");
        return command("freeflow_unit", {
          operation: "close",
          outcome: "deferred",
          assessment: "Defer acceptance while the mutation settlement remains unresolved.",
        });
      }
      if (request === 7) {
        assert.equal(resultFor(manager, "freeflow_unit").details.status, "closed");
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      freeflowConfig: { toolExecution: config.toolExecution },
      cognitiveRouting: config.cognitiveRouting,
      beforePrompt: async ({ cwd }) => {
        target = join(cwd, "routing-effect.txt");
        await writeFile(target, body);
      },
      maxRequests: 10,
    },
  );
});
