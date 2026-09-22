import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { fixture } from "../fixtures/routing-native.js";

const lines = Array.from(
  { length: 800 },
  (_, index) =>
    `ROW-${String(index + 1).padStart(4, "0")} ${index === 400 ? "EXACT_MIDDLE_SENTINEL" : "ordinary diagnostic content"} αβ`,
);
const body = lines.join("\n");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const plain = (message) =>
  (message?.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
const resultFor = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .at(-1);
const descriptors = (manager) =>
  manager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "freeflow-tool-capture-v1");
const command = (name, args) => [{ name, args }];
const config = {
  toolExecution: {
    enabled: true,
    capture: { enabled: true, maxInlineBytes: 1800, maxStoredBytes: 4 * 1024 * 1024 },
  },
};
const setup = async ({ cwd }) => writeFile(join(cwd, "observation.txt"), body);
const middleOffset = Buffer.byteLength(body.slice(0, body.indexOf("EXACT_MIDDLE_SENTINEL")), "utf8");

function artifactPath(manager, descriptor) {
  return join(
    dirname(manager.getSessionFile()),
    "freeflow-results",
    "v1",
    digest(descriptor.originSessionId),
    descriptor.storageKey,
  );
}

test("native Bash capture publishes immutable bytes, bounded history, and exact reader continuation", async () => {
  let captured;
  const output = await fixture(
    (request, wire, manager) => {
      if (request === 1) return command("bash", { command: "cat observation.txt" });
      if (request === 2) {
        const native = resultFor(manager, "bash").message;
        assert.equal(native.isError, false);
        assert.ok(Buffer.byteLength(plain(native), "utf8") <= 1800);
        assert.equal(plain(native).includes("EXACT_MIDDLE_SENTINEL"), false);
        assert.equal(descriptors(manager).length, 1);
        captured = descriptors(manager)[0].data;
        assert.ok(plain(native).includes(captured.id));
        assert.equal(JSON.stringify(wire).includes("EXACT_MIDDLE_SENTINEL"), false);
        return command("freeflow_result", { id: captured.id, offsetBytes: middleOffset, maxBytes: 1024 });
      }
      if (request === 3) {
        const read = resultFor(manager, "freeflow_result").message;
        assert.equal(read.isError, false);
        assert.match(plain(read), /EXACT_MIDDLE_SENTINEL/);
        assert.equal(read.details.capturedResult.range.startBytes, middleOffset);
        assert.ok(read.details.capturedResult.range.endBytes > middleOffset);
        assert.ok(read.details.capturedResult.nextOffsetBytes > middleOffset);
        assert.ok(JSON.stringify(wire).includes("EXACT_MIDDLE_SENTINEL"));
        assert.equal(descriptors(manager).length, 1, "reader is never captured recursively");
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ manager }) => {
      assert.ok(captured);
      assert.equal(await readFile(artifactPath(manager, captured), "utf8"), body);
      assert.equal(captured.capture.sha256, digest(body));
      const persisted = await readFile(manager.getSessionFile(), "utf8");
      assert.equal(
        persisted.includes("EXACT_MIDDLE_SENTINEL"),
        true,
        "reader occurrence persists exact requested bytes",
      );
      assert.equal(persisted.includes(body), false, "full captured body is not duplicated into native history");
    },
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: config, beforePrompt: setup },
  );
  assert.equal(output.requests.length, 3);
});

test("an extension-owned Bash override remains native and is not qualified by its name", async () => {
  let executions = 0;
  const override = (pi) =>
    pi.registerTool({
      name: "bash",
      label: "Fixture override",
      description: "Controlled extension Bash override.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { command: { type: "string" } },
        required: ["command"],
      },
      async execute() {
        executions += 1;
        return { content: [{ type: "text", text: body }], details: { override: true } };
      },
    });
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return command("bash", { command: "fixture" });
      if (request === 2) {
        const native = resultFor(manager, "bash").message;
        assert.equal(native.details.override, true);
        assert.ok(plain(native).includes("EXACT_MIDDLE_SENTINEL"));
        assert.equal(descriptors(manager).length, 0);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: config, extensions: [override] },
  );
  assert.equal(executions, 1);
});

test("an earlier result hook is captured but a later content change makes the capture unreadable", async () => {
  const early = (pi) =>
    pi.on("tool_result", (event) =>
      event.toolName === "bash"
        ? { content: [{ type: "text", text: `EARLY_HOOK\n${plain(event)}` }], details: event.details }
        : undefined,
    );
  const late = (pi) =>
    pi.on("tool_result", (event) =>
      event.toolName === "bash"
        ? { content: [{ type: "text", text: `${plain(event)}\nLATE_HOOK` }], details: event.details }
        : undefined,
    );
  let id;
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return command("bash", { command: "cat observation.txt" });
      if (request === 2) {
        const descriptor = descriptors(manager)[0]?.data;
        assert.ok(descriptor);
        id = descriptor.id;
        assert.equal(descriptor.capture.sha256, digest(`EARLY_HOOK\n${body}`));
        assert.match(plain(resultFor(manager, "bash").message), /LATE_HOOK/);
        return command("freeflow_result", { id, offsetBytes: 0, maxBytes: 1024 });
      }
      if (request === 3) {
        const denied = resultFor(manager, "freeflow_result").message;
        assert.equal(denied.isError, true);
        assert.match(plain(denied), /Final native result differs from the captured emission/);
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
      beforeExtensions: [early],
      extensions: [late],
      beforePrompt: setup,
    },
  );
});

test("parallel native completions retain distinct call, descriptor, and artifact identities", async () => {
  const bodyA = body.replace("EXACT_MIDDLE_SENTINEL", "PARALLEL_SENTINEL_A");
  const bodyB = body.replace("EXACT_MIDDLE_SENTINEL", "PARALLEL_SENTINEL_B");
  const offsetA = Buffer.byteLength(bodyA.slice(0, bodyA.indexOf("PARALLEL_SENTINEL_A")));
  const offsetB = Buffer.byteLength(bodyB.slice(0, bodyB.indexOf("PARALLEL_SENTINEL_B")));
  await fixture(
    (request, _wire, manager) => {
      if (request === 1)
        return [
          { name: "bash", args: { command: "cat observation-a.txt" } },
          { name: "bash", args: { command: "cat observation-b.txt" } },
        ];
      if (request === 2) {
        const captures = descriptors(manager).map((entry) => entry.data);
        assert.equal(captures.length, 2);
        assert.equal(new Set(captures.map((capture) => capture.id)).size, 2);
        assert.equal(new Set(captures.map((capture) => capture.toolCallId)).size, 2);
        assert.equal(new Set(captures.map((capture) => capture.storageKey)).size, 2);
        const byHash = new Map(captures.map((capture) => [capture.capture.sha256, capture]));
        return [
          {
            name: "freeflow_result",
            args: { id: byHash.get(digest(bodyA)).id, offsetBytes: offsetA, maxBytes: 1024 },
          },
          {
            name: "freeflow_result",
            args: { id: byHash.get(digest(bodyB)).id, offsetBytes: offsetB, maxBytes: 1024 },
          },
        ];
      }
      if (request === 3) {
        const reads = manager
          .getBranch()
          .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "freeflow_result")
          .slice(-2)
          .map((entry) => plain(entry.message))
          .join("\n");
        assert.match(reads, /PARALLEL_SENTINEL_A/);
        assert.match(reads, /PARALLEL_SENTINEL_B/);
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
      beforePrompt: async ({ cwd }) => {
        await writeFile(join(cwd, "observation-a.txt"), bodyA);
        await writeFile(join(cwd, "observation-b.txt"), bodyB);
      },
    },
  );
});

test("reader rejects interior UTF-8 offsets and non-advancing budgets while EOF is explicit", async () => {
  let captured;
  const alphaOffset = Buffer.byteLength(body.slice(0, body.indexOf("αβ")), "utf8");
  const totalBytes = Buffer.byteLength(body, "utf8");
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return command("bash", { command: "cat observation.txt" });
      if (request === 2) {
        captured = descriptors(manager)[0]?.data;
        assert.ok(captured);
        return command("freeflow_result", { id: captured.id, offsetBytes: alphaOffset + 1, maxBytes: 1024 });
      }
      if (request === 3) {
        const interior = resultFor(manager, "freeflow_result").message;
        assert.equal(interior.isError, true);
        assert.match(plain(interior), /inside a UTF-8 code point/);
        return command("freeflow_result", { id: captured.id, offsetBytes: totalBytes, maxBytes: 1024 });
      }
      if (request === 4) {
        const eof = resultFor(manager, "freeflow_result").message;
        assert.equal(eof.isError, false);
        assert.deepEqual(eof.details.capturedResult.range, { startBytes: totalBytes, endBytes: totalBytes });
        assert.equal(eof.details.capturedResult.nextOffsetBytes, undefined);
        assert.match(plain(eof), /End of captured result/);
        return command("freeflow_result", { id: captured.id, offsetBytes: 0, maxBytes: 1 });
      }
      if (request === 5) {
        const tiny = resultFor(manager, "freeflow_result").message;
        assert.equal(tiny.isError, true);
        assert.match(plain(tiny), /cannot fit reader metadata/);
        return [];
      }
      assert.fail(`unexpected request ${request}`);
    },
    false,
    undefined,
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: config, beforePrompt: setup },
  );
});

test("attached recovery admits only the frozen captured-result grant and keeps path recovery separate", async () => {
  const profiles = Object.fromEntries(
    ["coordinator", "helper", "executor"].map((profile) => [
      profile,
      { provider: "openai", model: "gpt-6-astra", thinking: profile === "coordinator" ? "high" : "low" },
    ]),
  );
  let captured;
  await fixture(
    (request, wire, manager) => {
      if (request === 1)
        return command("freeflow_delegate", {
          operation: "assign",
          worker: "helper",
          contract: "Capture command output, then return its bounded native preview.",
        });
      if (request === 2) return command("bash", { command: "cat observation.txt" });
      if (request === 3) {
        captured = descriptors(manager)[0]?.data;
        assert.ok(captured);
        return [
          { name: "freeflow_project", args: { operation: "add", refs: [`ctx:${resultFor(manager, "bash").id}`] } },
          {
            name: "freeflow_return",
            args: { operation: "submit", outcome: "completed", report: "Bounded preview captured." },
          },
        ];
      }
      if (request === 4)
        return command("freeflow_unit", {
          operation: "recover",
          request: "Read the exact captured middle without live execution.",
          results: [captured.id],
        });
      if (request === 5) {
        const recovery = manager
          .getBranch()
          .findLast(
            (entry) =>
              entry.customType === "freeflow-routing-v2" && entry.data?.data?.type === "recovery-request-accepted",
          )?.data?.data?.recovery;
        assert.deepEqual(recovery.results, [{ id: captured.id, sha256: captured.capture.sha256 }]);
        return command("freeflow_result", { id: "result:not-granted", offsetBytes: 0, maxBytes: 1024 });
      }
      if (request === 6) {
        const denied = resultFor(manager, "freeflow_result").message;
        assert.equal(denied.isError, true);
        assert.match(plain(denied), /worker_task_phase_ended/);
        return command("freeflow_result", { id: captured.id, offsetBytes: middleOffset, maxBytes: 1024 });
      }
      if (request === 7) {
        const read = resultFor(manager, "freeflow_result").message;
        assert.equal(read.isError, false);
        assert.match(plain(read), /EXACT_MIDDLE_SENTINEL/);
        return [
          {
            name: "freeflow_project",
            args: { operation: "add", refs: [`ctx:${resultFor(manager, "freeflow_result").id}`] },
          },
          {
            name: "freeflow_return",
            args: { operation: "supplement", outcome: "completed", report: "Exact captured middle recovered." },
          },
        ];
      }
      if (request === 8) {
        assert.ok(JSON.stringify(wire).includes("EXACT_MIDDLE_SENTINEL"));
        return command("freeflow_unit", {
          operation: "close",
          outcome: "accepted",
          assessment: "Exact granted captured result received.",
        });
      }
      if (request === 9) return [];
      assert.fail(`unexpected request ${request}`);
    },
    true,
    undefined,
    false,
    {
      cognitiveRouting: { enabled: true, projection: true, delegation: "both", profiles },
      freeflowConfig: config,
      beforePrompt: setup,
    },
  );
});

test("same-session reload retains verified reads after new capture is disabled without rerunning Bash", async () => {
  let captured;
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return command("bash", { command: "printf x >> executions.txt; cat observation.txt" });
      if (request === 2) {
        captured = descriptors(manager)[0]?.data;
        assert.ok(captured);
        return [];
      }
      if (request === 3)
        return command("freeflow_result", { id: captured.id, offsetBytes: middleOffset, maxBytes: 1024 });
      if (request === 4) return [];
      assert.fail(`unexpected request ${request}`);
    },
    false,
    async ({ session, manager, cwd }) => {
      await writeFile(
        join(cwd, ".freeflow/config.json"),
        JSON.stringify({
          cognitiveRouting: { enabled: false },
          toolExecution: { enabled: true, capture: { enabled: false } },
        }),
      );
      await session.reload();
      await session.prompt("Read the existing captured middle after reload.");
      await session.waitForIdle();
      const read = resultFor(manager, "freeflow_result").message;
      assert.equal(read.isError, false);
      assert.match(plain(read), /EXACT_MIDDLE_SENTINEL/);
      assert.equal(await readFile(join(cwd, "executions.txt"), "utf8"), "x");
    },
    false,
    { cognitiveRouting: { enabled: false }, freeflowConfig: config, beforePrompt: setup },
  );
});

test("storage capacity and an insufficient presentation budget fall back to the original result", async () => {
  for (const scenario of ["capacity", "presentation"]) {
    const freeflowConfig = {
      toolExecution: {
        enabled: true,
        capture: {
          enabled: true,
          maxInlineBytes: scenario === "presentation" ? 256 : 1800,
          maxStoredBytes: 4 * 1024 * 1024,
        },
      },
    };
    await fixture(
      (request, wire, manager) => {
        if (request === 1) return command("bash", { command: "cat observation.txt" });
        if (request === 2) {
          const native = resultFor(manager, "bash").message;
          if (scenario === "capacity") assert.ok(JSON.stringify(wire).includes("last capture issue storage_budget"));
          assert.equal(native.isError, false);
          assert.ok(plain(native).includes("EXACT_MIDDLE_SENTINEL"));
          assert.equal(descriptors(manager).length, 0);
          return [];
        }
        assert.fail(`unexpected request ${request}`);
      },
      false,
      undefined,
      false,
      {
        cognitiveRouting: { enabled: false },
        freeflowConfig,
        beforePrompt: async (state) => {
          await setup(state);
          if (scenario === "capacity") {
            const namespace = join(
              dirname(state.manager.getSessionFile()),
              "freeflow-results",
              "v1",
              digest(state.manager.getSessionId()),
            );
            await mkdir(namespace, { recursive: true });
            await writeFile(join(namespace, `${"a".repeat(64)}.txt`), Buffer.alloc(4 * 1024 * 1024));
          }
        },
      },
    );
  }
});

test("upstream Bash truncation remains explicit and producer output paths are never adopted", async () => {
  const large = `BEGIN_RAW_ONLY\n${Array.from({ length: 2500 }, (_, index) => `long-line-${index} ${"x".repeat(45)}`).join("\n")}`;
  await fixture(
    (request, _wire, manager) => {
      if (request === 1) return command("bash", { command: "cat observation.txt" });
      if (request === 2) {
        const descriptor = descriptors(manager)[0]?.data;
        const native = resultFor(manager, "bash").message;
        assert.ok(descriptor);
        assert.equal(descriptor.capture.externalCoverage, "limited");
        assert.equal(descriptor.capture.bytes < Buffer.byteLength(large), true);
        assert.equal(plain(native).includes("BEGIN_RAW_ONLY"), false);
        assert.match(plain(native), /Upstream coverage: limited/);
        assert.ok(native.details.fullOutputPath, "native retrieval metadata remains available");
        assert.equal(JSON.stringify(descriptor).includes(native.details.fullOutputPath), false);
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
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "observation.txt"), large),
    },
  );
});

test("disabled capture and failed Bash preserve their complete native outcomes without descriptors", async () => {
  for (const scenario of [
    {
      name: "disabled",
      freeflowConfig: { toolExecution: { enabled: true, capture: { enabled: false } } },
      command: "cat observation.txt",
      error: false,
    },
    { name: "failed", freeflowConfig: config, command: "cat observation.txt; exit 7", error: true },
  ]) {
    await fixture(
      (request, _wire, manager) => {
        if (request === 1) return command("bash", { command: scenario.command });
        if (request === 2) {
          const native = resultFor(manager, "bash").message;
          assert.equal(native.isError, scenario.error, scenario.name);
          assert.ok(plain(native).includes("EXACT_MIDDLE_SENTINEL"), scenario.name);
          assert.equal(descriptors(manager).length, 0, scenario.name);
          return [];
        }
        assert.fail(`unexpected request ${request}`);
      },
      false,
      undefined,
      false,
      { cognitiveRouting: { enabled: false }, freeflowConfig: scenario.freeflowConfig, beforePrompt: setup },
    );
  }
});
