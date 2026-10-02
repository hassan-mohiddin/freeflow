import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fixture, response } from "../fixtures/routing-native.js";

// When Freeflow says compaction is due. The fixture's gpt-4o has a 128,000-token window and the fixture sets Pi's
// reserve to 1 token, so Pi's trigger is 127,999: the warning comes at 97,999 and "compact now" at 117,999.
const noRouting = { cognitiveRouting: { enabled: false }, freeflowConfig: { toolExecution: { enabled: true } } };
const withUsage = (tokens) => (n, calls) =>
  response(n, calls, "fixture response", {
    input_tokens: tokens(n),
    output_tokens: 10,
    total_tokens: tokens(n) + 10,
  });
const count = (body, text) => JSON.stringify(body.input).split(text).length - 1;
const WARNING = "Compaction is due:";
const COMPACT_NOW = "Compact now:";

test(
  "the warning arrives once mid-run, then compact now, and either makes compaction acceptable",
  { timeout: 30000 },
  async () => {
    const usage = [50_000, 100_000, 100_000, 120_000, 120_000, 1_000];
    await fixture(
      async (n) =>
        [
          [{ name: "read", args: { path: "big.txt" } }],
          [{ name: "read", args: { path: "evidence.txt" } }],
          [{ name: "read", args: { path: "evidence.txt" } }],
          [{ name: "read", args: { path: "evidence.txt" } }],
          [{ name: "freeflow_compact", args: { summary: "S", carry: [{ result: "r1" }] } }],
        ][n - 1] ?? [],
      false,
      async ({ requests }) => {
        assert.equal(count(requests[1], WARNING), 0, "below the warning point");
        assert.equal(count(requests[2], WARNING), 1, "the warning joins the next request of the run");
        assert.match(JSON.stringify(requests[2].input), /- r1  read  big\.txt  ~1000 tokens/);
        assert.equal(count(requests[3], WARNING), 1, "sent once per cycle");
        assert.equal(count(requests[4], COMPACT_NOW), 1);
        // Accepted without /freeflow compact: the notices made it due. The new cycle carries r1's body.
        assert.match(JSON.stringify(requests[5].input), /## Tool results\\n\\n### r1 read: big\.txt/);
        assert.equal(count(requests[5], WARNING), 0, "a new cycle starts with no notice");
      },
      true,
      {
        ...noRouting,
        response: withUsage((n) => usage[n - 1] ?? 1_000),
        beforePrompt: async ({ cwd }) => writeFile(join(cwd, "big.txt"), "x".repeat(4_000)),
      },
    );
  },
);

test(
  "a warning at the end of a run waits for the next prompt instead of starting work",
  { timeout: 30000 },
  async () => {
    await fixture(
      async () => [],
      false,
      async ({ requests }) => {
        assert.equal(requests.length, 2, "the first run ended without another request");
        assert.equal(count(requests[0], WARNING), 0);
        assert.equal(count(requests[1], WARNING), 1, "delivered with the next prompt");
      },
      true,
      {
        ...noRouting,
        response: withUsage(() => 100_000),
        beforePrompt: async ({ session }) => {
          await session.prompt("FIRST");
          await session.waitForIdle();
        },
      },
    );
  },
);

test(
  "under projection the Coordinator is warned by the full history, not its own small view",
  { timeout: 30000 },
  async () => {
    const delegate = { name: "freeflow_delegate", args: { operation: "assign", contract: "Read the part files." } };
    const submit = { name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } };
    const close = { name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } };
    // Pi's read returns at most about 50 KB per call, so the history grows through ten reads of ~9,200 tokens. The
    // worker measures about 92k (under the 97,999 warning); the full history with the system prompt is over it.
    const parts = Array.from({ length: 10 }, (_, i) => `part${i}.txt`);
    await fixture(
      async (n) =>
        [[delegate], parts.map((path) => ({ name: "read", args: { path } })), [submit], [close]][n - 1] ?? [],
      true,
      async ({ requests }) => {
        assert.deepEqual(
          requests.map((body) => body.model),
          ["gpt-4o", "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4o", "gpt-4o"],
        );
        assert.equal(count(requests[2], WARNING), 0, "the worker stays under the warning point");
        // The handoff turn makes the Coordinator active; the full history crosses the point and its first request
        // carries the warning.
        assert.equal(count(requests[3], WARNING), 1);
        assert.match(JSON.stringify(requests[3].input), /the full history is about \d+ of 128000 tokens/);
        assert.match(JSON.stringify(requests[3].input), /so do not compact yourself: delegate an assignment/);
        assert.equal(count(requests[4], WARNING), 1, "sent once");
      },
      true,
      {
        freeflowConfig: { toolExecution: { enabled: true } },
        beforePrompt: async ({ cwd }) => {
          for (const path of parts) await writeFile(join(cwd, path), "y".repeat(36_800));
        },
      },
    );
  },
);
