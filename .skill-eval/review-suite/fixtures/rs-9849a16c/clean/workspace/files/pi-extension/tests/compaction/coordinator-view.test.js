import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fixture, response } from "../fixtures/routing-native.js";

// The Coordinator's projected view after a worker compacts mid-assignment, selects a result as evidence, and returns.
// The carried context names the worker's copies instead of repeating them, so the selected result appears once; and
// evidence the Coordinator received stays after the unit closes, so each Coordinator request extends the previous one.
// The fixture's gpt-4o has a 128,000-token window and Pi's reserve is 1 token, so usage of 100,000 is past compact now.
const BIG = `BIG_EVIDENCE ${"B".repeat(40_000)}`;
const occurrences = (body, text) => JSON.stringify(body.input).split(text).length - 1;
const extendsPrevious = (earlier, later) =>
  earlier.input.every((item, i) => JSON.stringify(item) === JSON.stringify(later.input[i]));

test(
  "after a worker compacts, the Coordinator sees selected evidence once, in a stable prefix",
  { timeout: 30000 },
  async () => {
    const usage = [5_000, 50_000, 100_000, 100_000];
    const bigRef = (manager) => {
      const entry = [...manager.getBranch()]
        .reverse()
        .find(
          (e) =>
            e.type === "message" &&
            e.message.role === "toolResult" &&
            JSON.stringify(e.message.content).includes("BIG_EVIDENCE"),
        );
      return `ctx:${entry.id.slice(0, 8)}`;
    };
    await fixture(
      async (n, body, manager) =>
        [
          () => [
            {
              name: "freeflow_delegate",
              args: { operation: "assign", contract: "Read big.txt and return it as evidence." },
            },
          ],
          () => [{ name: "read", args: { path: "big.txt" } }],
          () => [{ name: "read", args: { path: "evidence.txt" } }],
          () => [{ name: "freeflow_compact", args: { summary: "WORKER_SUMMARY" } }],
          () => [{ name: "freeflow_project", args: { operation: "add", refs: [bigRef(manager)] } }],
          () => [{ name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } }],
          () => [{ name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } }],
        ][n - 1]?.() ?? [],
      true,
      async ({ requests, manager }) => {
        const compaction = manager.getBranch().find((entry) => entry.type === "compaction");
        assert.equal(compaction.details.freeflow.profile, "executor", "the worker compacted");
        // The worker's next cycle carries its copy of the read in full.
        const workerAfter = requests.find((body, i) => i > 3 && body.model === "gpt-4.1-mini");
        assert.match(JSON.stringify(workerAfter.input), /## Tool results[\s\S]*BIG_EVIDENCE/);

        const coordinator = requests.filter((body) => body.model === "gpt-4o");
        const [, assessing, closing] = coordinator;
        assert.ok(assessing && closing, "the Coordinator assesses, then answers after closing the unit");
        // The carried context names the copy for the Coordinator; the selected original is its only occurrence.
        assert.match(JSON.stringify(assessing.input), /## Carried for the worker/);
        assert.doesNotMatch(JSON.stringify(assessing.input), /## Tool results/);
        assert.equal(occurrences(assessing, "BIG_EVIDENCE"), 1, "the selected result appears once");
        // The evidence stays after the unit closes: the closing request extends the assessing one.
        assert.ok(extendsPrevious(assessing, closing), "the Coordinator's prefix is unchanged after the unit closes");
        assert.equal(occurrences(closing, "BIG_EVIDENCE"), 1);
      },
      true,
      {
        freeflowConfig: { toolExecution: { enabled: true } },
        beforePrompt: async ({ cwd }) => writeFile(join(cwd, "big.txt"), BIG),
        response: (n, calls) =>
          response(n, calls, "fixture response", {
            input_tokens: usage[n - 1] ?? 2_000,
            output_tokens: 10,
            total_tokens: (usage[n - 1] ?? 2_000) + 10,
          }),
      },
    );
  },
);

// An evidence recovery after the compaction: the Coordinator suspends its assessment by asking for recovery and makes
// no requests until the supplement, so the evidence it had already received keeps its place when it resumes.
test("after a worker compacts, a recovery round keeps the Coordinator's prefix", { timeout: 30000 }, async () => {
  const usage = [5_000, 50_000, 100_000, 100_000];
  const refOf = (manager, marker) => {
    const entry = [...manager.getBranch()]
      .reverse()
      .find(
        (e) =>
          e.type === "message" && e.message.role === "toolResult" && JSON.stringify(e.message.content).includes(marker),
      );
    return `ctx:${entry.id.slice(0, 8)}`;
  };
  await fixture(
    async (n, body, manager) =>
      [
        () => [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read big.txt and return it as evidence." },
          },
        ],
        () => [{ name: "read", args: { path: "big.txt" } }],
        () => [{ name: "read", args: { path: "evidence.txt" } }],
        () => [{ name: "freeflow_compact", args: { summary: "WORKER_SUMMARY" } }],
        () => [{ name: "freeflow_project", args: { operation: "add", refs: [refOf(manager, "BIG_EVIDENCE")] } }],
        () => [{ name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } }],
        () => [
          {
            name: "freeflow_unit",
            args: { operation: "recover", request: "Read the recovery file.", paths: ["recovery.txt"] },
          },
        ],
        () => [{ name: "read", args: { path: "recovery.txt" } }],
        () => [{ name: "freeflow_project", args: { operation: "add", refs: [refOf(manager, "FRESH_RECOVERY")] } }],
        () => [
          { name: "freeflow_return", args: { operation: "supplement", report: "Recovered.", outcome: "completed" } },
        ],
        () => [{ name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } }],
      ][n - 1]?.() ?? [],
    true,
    async ({ requests }) => {
      const [, assessing, resumed, closing] = requests.filter((body) => body.model === "gpt-4o");
      assert.ok(assessing && resumed && closing, "assess, resume after the supplement, answer after closing");
      assert.match(JSON.stringify(resumed.input), /FRESH_RECOVERY/, "the supplement's evidence reaches it");
      assert.ok(extendsPrevious(assessing, resumed), "the resumed view extends the assessing one");
      assert.ok(extendsPrevious(resumed, closing), "the view after closing extends the resumed one");
      assert.equal(occurrences(closing, "BIG_EVIDENCE"), 1);
    },
    true,
    {
      freeflowConfig: { toolExecution: { enabled: true } },
      maxRequests: 20,
      beforePrompt: async ({ cwd }) => writeFile(join(cwd, "big.txt"), BIG),
      response: (n, calls) =>
        response(n, calls, "fixture response", {
          input_tokens: usage[n - 1] ?? 2_000,
          output_tokens: 10,
          total_tokens: (usage[n - 1] ?? 2_000) + 10,
        }),
    },
  );
});
