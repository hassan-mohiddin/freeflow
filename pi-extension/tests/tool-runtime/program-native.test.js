import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { fixture } from "../fixtures/routing-native.js";

const call = (name, args) => [{ name, args }];
const resultFor = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .at(-1)?.message;
const config = {
  toolExecution: {
    enabled: true,
    capture: { enabled: true, maxInlineBytes: 512, maxStoredBytes: 4 * 1024 * 1024 },
    programs: { mode: "reduction", timeoutMs: 1000, maxParallelReads: 4 },
  },
};

test("native freeflow_run streams bounded progress without exposing hidden values", async () => {
  const observed = await fixture(
    (request, wire, manager) => {
      if (request === 1)
        return call("freeflow_run", {
          code: `const hidden = { secret: "HIDDEN_INTERMEDIATE" }; emit({ answer: input.value * 2 }); return hidden;`,
          description: "double one input",
          operations: [],
          input: { value: 7 },
          timeoutMs: 1000,
        });
      if (request === 2) {
        const message = resultFor(manager, "freeflow_run");
        assert.equal(message.isError, false);
        assert.equal(message.details.freeflowRun.programStatus, "completed");
        assert.deepEqual(message.details.freeflowRun.emitted, [{ answer: 14 }]);
        assert.equal(
          JSON.stringify(wire).includes("HIDDEN_INTERMEDIATE"),
          true,
          "program source remains in its native call arguments",
        );
        assert.equal(
          JSON.stringify(message).includes('"secret":"HIDDEN_INTERMEDIATE"'),
          false,
          "returned intermediates are not emitted",
        );
        assert.ok(manager.getBranch().some((entry) => entry.customType === "freeflow-tool-run-v1"));
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: config },
  );
  const updates = observed.toolUpdates.filter((event) => event.toolName === "freeflow_run");
  assert.ok(updates.length >= 2);
  assert.equal(
    updates.every((event) => event.partialResult.details.freeflowProgress.version === 1),
    true,
  );
  assert.equal(
    updates.some((event) => event.partialResult.details.freeflowProgress.phase === "preparing"),
    true,
  );
  assert.equal(
    updates.some((event) => event.partialResult.details.freeflowProgress.phase === "settling"),
    true,
  );
  assert.equal(JSON.stringify(updates.map((event) => event.partialResult)).includes("HIDDEN_INTERMEDIATE"), false);
});

test("native program reads only an explicitly granted capture and emits an exact selected range", async () => {
  const body = `BEGIN\n${"x".repeat(3000)}\nPROGRAM_CAPTURE_SENTINEL\nEND`;
  const offset = Buffer.byteLength(body.slice(0, body.indexOf("PROGRAM_CAPTURE_SENTINEL")), "utf8");
  let id;
  await fixture(
    (request, wire, manager) => {
      if (request === 1) return call("bash", { command: "cat captured.txt" });
      if (request === 2) {
        id = manager.getBranch().find((entry) => entry.customType === "freeflow-tool-capture-v1")?.data?.id;
        assert.ok(id);
        return call("freeflow_run", {
          code: `const range = await results.read(input.id, { offsetBytes: input.offset, maxBytes: 128 }); emit({ text: range.text, range: range.range });`,
          description: "read one captured range",
          operations: [],
          captures: [id],
          input: { id, offset },
          timeoutMs: 1000,
        });
      }
      if (request === 3) {
        const message = resultFor(manager, "freeflow_run");
        assert.equal(message.isError, false);
        assert.match(message.details.freeflowRun.emitted[0].text, /PROGRAM_CAPTURE_SENTINEL/);
        assert.equal(message.details.freeflowRun.calls.succeeded, 1);
        assert.equal(JSON.stringify(wire).includes("PROGRAM_CAPTURE_SENTINEL"), true);
        assert.equal(JSON.stringify(wire).includes("BEGIN\n" + "x".repeat(1000)), false);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: config,
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "captured.txt"), body),
    },
  );
});

test("native adapter-mode program streams mutation success only after effect settlement", async () => {
  const body = "NATIVE_P4_TARGET\n";
  const expectedSha256 = createHash("sha256").update(body).digest("hex");
  const adapterConfig = {
    toolExecution: {
      enabled: true,
      programs: { mode: "adapters", timeoutMs: 1000, maxParallelReads: 4 },
      workspace: { enabled: true, write: true },
    },
  };
  const observed = await fixture(
    (request, _wire, manager) => {
      if (request === 1)
        return call("freeflow_run", {
          code: `const found = await tools.invoke("project.searchText", { query: "NATIVE_P4_TARGET", paths: ["workspace-p4.txt"] }); const changed = await tools.invoke("project.replaceExact", { path: "workspace-p4.txt", expectedSha256: input.expectedSha256, oldText: "NATIVE_P4_TARGET", replacement: "NATIVE_P4_DONE" }); emit({ matches: found.matches.length, after: changed.afterSha256 });`,
          description: "search and replace a guarded local file",
          operations: [
            { id: "project.searchText", revision: "1" },
            { id: "project.replaceExact", revision: "1" },
          ],
          input: { expectedSha256 },
          timeoutMs: 1000,
        });
      if (request === 2) {
        const message = resultFor(manager, "freeflow_run");
        assert.equal(message.isError, false);
        assert.equal(message.details.freeflowRun.programStatus, "completed");
        assert.equal(message.details.freeflowRun.calls.succeeded, 2);
        assert.equal(message.details.freeflowRun.emitted[0].matches, 1);
        assert.equal(manager.getBranch().filter((entry) => entry.customType === "freeflow-tool-effect-v1").length, 2);
        return call("bash", { command: "cat workspace-p4.txt" });
      }
      if (request === 3) {
        assert.equal(resultFor(manager, "bash").content[0].text, "NATIVE_P4_DONE\n");
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: adapterConfig,
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "workspace-p4.txt"), body),
    },
  );
  const progress = observed.toolUpdates
    .filter((event) => event.toolName === "freeflow_run")
    .map((event) => event.partialResult.details.freeflowProgress);
  const mutationUpdates = progress.filter((update) => update.current?.operation?.id === "project.replaceExact");
  assert.equal(
    mutationUpdates.some(
      (update) => update.current.status === "succeeded" && update.current.effectState === "completed",
    ),
    true,
  );
  assert.equal(
    mutationUpdates.some(
      (update) => update.current.status === "succeeded" && update.current.effectState !== "completed",
    ),
    false,
  );
});

test("native failed program preserves a structured envelope and error status", async () => {
  await fixture(
    (request, _wire, manager) => {
      if (request === 1)
        return call("freeflow_run", {
          code: `throw new Error("PROGRAM_FIXTURE_FAILURE")`,
          description: "fail explicitly",
          operations: [],
          timeoutMs: 1000,
        });
      if (request === 2) {
        const message = resultFor(manager, "freeflow_run");
        assert.equal(message.isError, true);
        assert.equal(message.details.freeflowRun.programStatus, "failed");
        assert.match(message.details.freeflowRun.error.message, /PROGRAM_FIXTURE_FAILURE/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: config },
  );
});
