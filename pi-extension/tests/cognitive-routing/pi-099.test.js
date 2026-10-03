import assert from "node:assert/strict";
import test from "node:test";
import { createCodemodeExtension } from "@earendil-works/pi-coding-agent";
import { fixture, response } from "../fixtures/routing-native.js";

// Cognitive Routing on Pi 0.99: runs started by extension messages, real codemode, retries, virtual models, holds
// before the session file exists, and tools other extensions add. Coordinator is gpt-4o, Executor gpt-4.1-mini.
const COORDINATOR = "gpt-4o";
const EXECUTOR = "gpt-4.1-mini";
const toolExecution = { freeflowConfig: { toolExecution: { enabled: true } } };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hasNotice = (body) => JSON.stringify(body).includes("Background command bg");
const results = (manager) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult")
    .map((entry) => entry.message);
const delegate = { name: "freeflow_delegate", args: { operation: "assign", contract: "Do the fixture work." } };
const submit = { name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } };
const close = { name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } };

test("an exit notice after the unit closed starts a Coordinator turn", { timeout: 30000 }, async () => {
  await fixture(
    async (n) =>
      [[delegate], [{ name: "bash_background", args: { command: "sleep 0.8; echo done" } }], [submit], [close]][
        n - 1
      ] ?? [],
    false,
    async ({ session, requests }) => {
      // The Coordinator's closing request is the fifth; the notice starts the sixth.
      for (let i = 0; i < 100 && requests.length < 6; i++) await wait(50);
      await session.waitForIdle();
      assert.equal(requests.length, 6);
      assert.ok(!hasNotice(requests[4]));
      assert.equal(requests[5].model, COORDINATOR);
      assert.ok(hasNotice(requests[5]));
    },
    true,
    toolExecution,
  );
});

test("an exit notice while the worker runs reaches the worker's next request", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => {
      if (n === 1) return [delegate];
      if (n === 2) return [{ name: "bash_background", args: { command: "sleep 0.2; echo done" } }];
      if (n === 3) {
        await wait(700);
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      return [[submit], [close]][n - 4] ?? [];
    },
    false,
    async ({ requests }) => {
      assert.deepEqual(
        requests.map((body) => [body.model, hasNotice(body)]),
        [
          [COORDINATOR, false],
          [EXECUTOR, false],
          [EXECUTOR, false],
          [EXECUTOR, true],
          [COORDINATOR, true],
          [COORDINATOR, true],
        ],
      );
    },
    true,
    toolExecution,
  );
});

test("a notice after a worker's run ended wakes Coordinator, not the worker", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => [[delegate], [{ name: "bash_background", args: { command: "sleep 0.8; echo done" } }]][n - 1] ?? [],
    false,
    async ({ session, requests }) => {
      assert.deepEqual(
        requests.map((body) => body.model),
        [COORDINATOR, EXECUTOR, EXECUTOR],
      );
      for (let i = 0; i < 100 && requests.length < 4; i++) await wait(50);
      await session.waitForIdle();
      assert.equal(requests.length, 4);
      assert.ok(hasNotice(requests[3]));
      assert.equal(requests[3].model, COORDINATOR);
    },
    true,
    toolExecution,
  );
});

test("a retry during a worker turn stays on the worker", { timeout: 30000 }, async () => {
  let failed = false;
  await fixture(
    async (n) => [[delegate], [{ name: "read", args: { path: "evidence.txt" } }]][n - 1] ?? [],
    false,
    async ({ requests, manager }) => {
      assert.deepEqual(
        requests.map((body) => body.model),
        [COORDINATOR, EXECUTOR, EXECUTOR, EXECUTOR],
      );
      assert.equal(results(manager).at(-1).content[0].text, "EXACT_EVIDENCE_BODY_81");
    },
    true,
    {
      ...toolExecution,
      settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 1 } },
      response: (n, calls) => {
        if (n !== 3 || failed) return response(n, calls);
        failed = true;
        return new Response(JSON.stringify({ error: { message: "overloaded", type: "server_error" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      },
    },
  );
});

test("a manual hold set before the first user message applies to it", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => assert.equal(requests[0].model, EXECUTOR),
    true,
    { ...toolExecution, onSession: (session) => session.prompt("/freeflow profile executor") },
  );
});

test("selecting a virtual model turns routing off for the session and says so", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ session, manager, requests, notices }) => {
      await session.setModel(session.modelRuntime.getModel("probe", "auto"));
      await session.prompt("Next.");
      await session.waitForIdle();
      assert.equal(requests[1].model, EXECUTOR, "the virtual model's route dispatches");
      assert.match(JSON.stringify(requests[1]), /Cognitive Routing: inactive/);
      assert.ok(
        notices.some(([text]) =>
          /^Cognitive Routing is off for this session: the model or effort was changed outside routing \(now auto\/\w+\)\. Turn it back on with \/freeflow profile auto, Ctrl\+Shift\+A, or \/freeflow settings\./.test(
            text,
          ),
        ),
        JSON.stringify(notices),
      );
      // Off through the Session switch, so /freeflow settings and the footer show it.
      const overrides = manager
        .getBranch()
        .filter((e) => e.type === "custom" && e.customType === "freeflow-session-overrides")
        .at(-1)?.data?.overrides;
      assert.equal(overrides?.["cognitiveRouting.enabled"], false);
    },
    true,
    {
      ...toolExecution,
      extensions: [
        (pi) =>
          pi.registerVirtualModel({
            provider: "probe",
            id: "auto",
            name: "Auto",
            route: (_request, ctx) => ({ model: ctx.modelRegistry.find("openai", EXECUTOR), thinkingLevel: "off" }),
          }),
      ],
    },
  );
});

test("after an outside model change, /freeflow profile auto turns routing back on", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ session, manager, requests }) => {
      await session.setModel(session.modelRuntime.getModel("openai", EXECUTOR));
      await session.prompt("Next.");
      await session.waitForIdle();
      assert.match(JSON.stringify(requests.at(-1)), /Cognitive Routing: inactive/);
      await session.prompt("/freeflow profile auto");
      await session.prompt("Again.");
      await session.waitForIdle();
      assert.equal(requests.at(-1).model, COORDINATOR, "the automatic Coordinator runs again");
      assert.match(JSON.stringify(requests.at(-1)), /Cognitive Routing: active/);
      const overrides = manager
        .getBranch()
        .filter((e) => e.type === "custom" && e.customType === "freeflow-session-overrides")
        .at(-1)?.data?.overrides;
      assert.ok(!overrides || overrides["cognitiveRouting.enabled"] !== false, "the session switch is no longer off");
    },
    true,
    toolExecution,
  );
});

test(
  "a worker's codemode script runs nested tools; routing tools stay out of scripts",
  { timeout: 60000 },
  async () => {
    const script =
      "const r = await tools.read({ path: 'evidence.txt' }); const b = await tools.bash({ command: 'echo nested' }); return r + '|' + b.output;";
    await fixture(
      async (n) =>
        [
          [delegate],
          [{ name: "codemode", args: { code: script } }],
          [{ name: "codemode", args: { code: "return 'freeflow_return' in tools;" } }],
          [submit],
          [close],
        ][n - 1] ?? [],
      false,
      async ({ manager }) => {
        const [, first, second] = results(manager);
        assert.equal(first.isError, false);
        assert.match(JSON.stringify(first.content), /EXACT_EVIDENCE_BODY_81\|nested\\n/);
        assert.deepEqual(
          first.nestedCalls.calls.map((call) => [call.name, call.status]),
          [
            ["read", "ok"],
            ["bash", "ok"],
          ],
        );
        // Pi 1.0 throws on a missing tool member, so scripts test presence with `in`.
        assert.equal(second.isError, false);
        assert.match(JSON.stringify(second.content), /\bfalse\b/);
      },
      true,
      {
        ...toolExecution,
        extensions: [createCodemodeExtension({ mode: "on" })],
        settings: { defaultTools: ["+codemode"] },
      },
    );
  },
);

test("routing keeps the active-list place of tools another extension activates", { timeout: 30000 }, async () => {
  let api;
  await fixture(
    async () => [],
    false,
    async ({ session, requests }) => {
      api.setActiveTools([...api.getActiveTools(), "probe_loaded"]);
      await session.prompt("Next.");
      await session.waitForIdle();
      // Pi declares tools to the model in the order they were added, so a reorder never reached a request; the
      // active list itself now stays as the other extension left it.
      assert.equal(api.getActiveTools().at(-1), "probe_loaded");
      assert.equal(requests[1].tools.at(-1).name, "probe_loaded");
    },
    true,
    {
      extensions: [
        (pi) => {
          api = pi;
          pi.registerTool({
            name: "probe_loaded",
            label: "probe_loaded",
            description: "probe",
            parameters: { type: "object", properties: {} },
            defaultActive: false,
            async execute() {
              return { content: [{ type: "text", text: "ok" }] };
            },
          });
        },
      ],
    },
  );
});
