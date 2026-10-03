import assert from "node:assert/strict";
import test from "node:test";
import { CompactionController } from "../../dist/compaction/controller.js";
import { thresholds } from "../../dist/compaction/thresholds.js";
import { fixture } from "../fixtures/routing-native.js";

// Context reuse: what the agent may carry, how it names tool results, and when Freeflow lists them.
const compactNow = async ({ session, requests }) => {
  const before = requests.length;
  await session.prompt("/freeflow compact");
  for (let i = 0; i < 200 && requests.length === before; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  await session.waitForIdle();
};
const LIST = "Results you can carry by id";
const results = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .map((entry) => entry.message.content.map((part) => part.text ?? "").join(""));

test(
  "under routing no list is inserted and a worker carries a result by its routing ref",
  { timeout: 30000 },
  async () => {
    const delegate = { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt." } };
    const submit = { name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } };
    const close = { name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } };
    let ref;
    await fixture(
      async (n, body) => {
        if (n === 1) return [delegate];
        if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
        if (n === 3) {
          // Routing names the read in the worker's own context.
          ref = JSON.stringify(body.input).match(/(ctx:[0-9a-f]+) \| producer: executor \| toolResult \| read/)?.[1];
          return [{ name: "freeflow_compact", args: { summary: "S", carry: [{ result: ref }] } }];
        }
        return [[submit], [close]][n - 4] ?? [];
      },
      true,
      async ({ requests, manager }) => {
        assert.ok(ref, "the worker's context names the read by a routing ref");
        assert.ok(!JSON.stringify(requests[0].input).includes(LIST), "/freeflow compact inserts no list under routing");
        assert.match(
          JSON.stringify(requests[3].input),
          new RegExp(`### ${ref} read\\\\n\\\\n\`+\\\\nEXACT_EVIDENCE_BODY_81`),
        );
        const entry = manager.getBranch().find((each) => each.type === "compaction");
        assert.deepEqual(
          entry.details.freeflow.carried.map(({ kind, ref: id, tool }) => [kind, id, tool]),
          [["result", ref, "read"]],
        );
      },
      true,
      { freeflowConfig: { toolExecution: { enabled: true } }, beforePrompt: compactNow },
    );
  },
);

test("with context reuse off there is no list and carry items are refused", { timeout: 30000 }, async () => {
  await fixture(
    async (n) =>
      [
        [{ name: "freeflow_compact", args: { summary: "S", carry: [{ file: "evidence.txt" }] } }],
        [{ name: "freeflow_compact", args: { summary: "S" } }],
      ][n - 1] ?? [],
    false,
    async ({ requests, manager }) => {
      assert.ok(!JSON.stringify(requests[0].input).includes(LIST));
      const [refused, accepted] = results(manager, "freeflow_compact");
      assert.match(refused, /Context reuse is off: call freeflow_compact without carry/);
      assert.match(accepted, /Compaction will happen at the end of this turn/);
      assert.equal(manager.getBranch().filter((entry) => entry.type === "compaction").length, 1);
    },
    true,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: { toolExecution: { enabled: true }, compaction: { carry: false } },
      beforePrompt: compactNow,
    },
  );
});

test("a list inserted with the warning moves the warning point earlier by the list's size", () => {
  const limits = thresholds(128_000, 16_384);
  const big = "x".repeat(4_000);
  const branch = [
    {
      type: "message",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "c1", name: "read", arguments: { path: "a.txt" } }],
      },
    },
    { type: "message", message: { role: "toolResult", toolCallId: "c1", content: [{ type: "text", text: big }] } },
  ];
  const controller = (nativeRefs) =>
    new CompactionController({
      effective: () => true,
      routingProfile: () => undefined,
      routingAssignment: () => undefined,
      background: () => [],
      noticePrefix: "[notice]",
      coordinatorUnderProjection: () => false,
      carryEnabled: () => true,
      nativeRefs: () => nativeRefs,
      resolveRef: () => undefined,
      summarize: async () => undefined,
      measure: () => ({ tokens: limits.warning - 5, thresholds: limits }),
    });
  const ctx = { sessionManager: { getBranch: () => branch } };
  assert.equal(controller(false).observe(ctx)?.level, "warning", "the list's size pushes it over");
  assert.equal(controller(true).observe(ctx), undefined, "with routing refs there is no list and no shift");
});
