import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// What a Freeflow compaction copies besides the agent's own picks: the newest results of the work in progress fill
// the rest of the carry budget, and the others are listed by ref. Four cases: routing off or on, context reuse on or
// off. The fixture's gpt-4o has a 128,000-token window, so the carry budget is 15% of it: 19,200 tokens.
const compact = (args = { summary: "S" }) => ({ name: "freeflow_compact", args });
const read = (path) => ({ name: "read", args: { path } });
const delegate = { name: "freeflow_delegate", args: { operation: "assign", contract: "Read the three parts." } };
// Three parts of about 8,000 tokens each: the two newest fit the budget, the oldest does not.
const parts = ["part1.txt", "part2.txt", "part3.txt"];
const writeParts = async (cwd) => {
  for (const [index, path] of parts.entries())
    await writeFile(join(cwd, path), `PART${index + 1} ${"x".repeat(32_000)}`);
};
const compactNow = async ({ session, requests }) => {
  const before = requests.length;
  await session.prompt("/freeflow compact");
  for (let i = 0; i < 200 && requests.length === before; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  await session.waitForIdle();
};
const carried = (manager) =>
  String(manager.getBranch().find((entry) => entry.customType === "freeflow-carried-context")?.content ?? "");
const compaction = (manager) => manager.getBranch().find((entry) => entry.type === "compaction");

test(
  "routing off, context reuse on: the cycle's newest results fill the budget and the rest are listed",
  { timeout: 30000 },
  async () => {
    await fixture(
      async (n) => [[read("part1.txt")], [read("part2.txt")], [read("part3.txt")], [compact()]][n - 1] ?? [],
      false,
      async ({ manager }) => {
        const text = carried(manager);
        assert.match(text, /PART3 /, "the newest result is copied");
        assert.match(text, /PART2 /);
        assert.doesNotMatch(text, /PART1 /, "the oldest does not fit the budget");
        assert.match(text, /## Other results of this cycle[\s\S]*- r1 {2}read {2}part1\.txt {2}~8\d{3} tokens/);
        const automatic = compaction(manager).details.freeflow.carried.filter((item) => item.automatic);
        assert.equal(automatic.length, 2);
      },
      true,
      {
        cognitiveRouting: { enabled: false },
        freeflowConfig: { toolExecution: { enabled: true } },
        beforePrompt: async (run) => {
          await writeParts(run.cwd);
          await compactNow(run);
        },
      },
    );
  },
);

test("routing off, context reuse off: nothing is copied and nothing is listed", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => [[read("part1.txt")], [compact()]][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const text = carried(manager);
      assert.doesNotMatch(text, /PART1 |Other results/);
      assert.deepEqual(compaction(manager).details.freeflow.carried, []);
    },
    true,
    {
      cognitiveRouting: { enabled: false },
      freeflowConfig: { toolExecution: { enabled: true }, compaction: { carry: false } },
      beforePrompt: async (run) => {
        await writeParts(run.cwd);
        await compactNow(run);
      },
    },
  );
});

for (const carry of [true, false])
  test(
    `routing on, context reuse ${carry ? "on" : "off"}: the assignment's results are ${carry ? "copied newest first and the rest listed" : "listed by ref, not copied"}`,
    { timeout: 30000 },
    async () => {
      await fixture(
        async (n) =>
          [[delegate], [read("part1.txt")], [read("part2.txt")], [read("part3.txt")], [compact()]][n - 1] ?? [],
        true,
        async ({ manager }) => {
          const text = carried(manager);
          assert.match(text, /## Other results of this assignment/);
          assert.match(text, /select one as evidence by its ref/);
          if (carry) {
            assert.match(text, /PART3 /);
            assert.doesNotMatch(text, /PART1 /);
            assert.match(text, /- ctx:\S+ {2}read {2}part1\.txt/, "the oldest is listed by its routing ref");
          } else {
            assert.doesNotMatch(text, /PART\d /, "context reuse off copies nothing");
            for (const path of parts)
              assert.match(text, new RegExp(`- ctx:\\S+ {2}read {2}${path.replace(".", "\\.")}`));
          }
        },
        true,
        {
          freeflowConfig: { toolExecution: { enabled: true }, ...(carry ? {} : { compaction: { carry: false } }) },
          beforePrompt: async (run) => {
            await writeParts(run.cwd);
            await compactNow(run);
          },
        },
      );
    },
  );
