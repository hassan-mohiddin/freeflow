import assert from "node:assert/strict";
import test from "node:test";
import { fixture, response } from "../fixtures/routing-native.js";

// Pi compacting on its own (here /compact) keeps Pi's summarizer and kept tail, with Freeflow's instructions added
// and Freeflow's state and recovery steps appended. The fixture's fixed summary is off so the real path runs.
const options = {
  cognitiveRouting: { enabled: false },
  freeflowConfig: { toolExecution: { enabled: true } },
  fixtureCompaction: false,
};
const FREEFLOW_INSTRUCTION = "Write state, not a story";
const compaction = (manager) => manager.getBranch().find((entry) => entry.type === "compaction");
// Two prompts, so Pi has earlier history to summarize. With a single prompt Pi summarizes only the current turn's
// prefix, with a prompt that takes no extra instructions; Freeflow's appended state still applies then.
const earlierPrompt = async ({ session }) => {
  await session.prompt("FIRST_PROMPT");
  await session.waitForIdle();
};

test("Pi's own compaction gets Freeflow's instructions, state and recovery steps", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => [[{ name: "read", args: { path: "evidence.txt" } }]][n - 1] ?? [],
    false,
    async ({ session, requests, manager }) => {
      const before = requests.length;
      await session.compact();
      const summarizer = JSON.stringify(requests.slice(before));
      assert.match(summarizer, /Additional focus:/);
      assert.ok(summarizer.includes(FREEFLOW_INSTRUCTION), "Freeflow's instructions reach Pi's summarizer");

      const entry = compaction(manager);
      assert.match(entry.summary, /^fixture response/, "Pi's summary comes first");
      assert.match(entry.summary, /## Freeflow state at compaction\n\nThis compaction starts cycle 2\./);
      assert.match(entry.summary, /if the summary names a Working Record for this work/);
      assert.match(entry.summary, /Compaction is no longer due: do not call freeflow_compact\./);
      assert.doesNotMatch(entry.summary, /Files read this cycle/, "Pi's summary already lists files");
      assert.notEqual(entry.firstKeptEntryId, entry.id, "Pi's kept tail stays");
      assert.equal(entry.details.freeflow.fallback, true);
      assert.equal(entry.details.freeflow.cycle, 2);
    },
    true,
    { ...options, beforePrompt: earlierPrompt },
  );
});

test("when Freeflow's summarizer fails, Pi compacts exactly as it would alone", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => [[{ name: "read", args: { path: "evidence.txt" } }]][n - 1] ?? [],
    false,
    async ({ session, manager }) => {
      await session.compact();
      const entry = compaction(manager);
      assert.match(entry.summary, /^fixture response/);
      assert.doesNotMatch(entry.summary, /Freeflow state at compaction/);
      assert.equal(entry.details?.freeflow, undefined);
    },
    true,
    {
      ...options,
      beforePrompt: earlierPrompt,
      response: (n, calls, body) =>
        JSON.stringify(body).includes(FREEFLOW_INSTRUCTION)
          ? new Response(JSON.stringify({ error: { message: "summarizer down", type: "invalid_request_error" } }), {
              status: 400,
              headers: { "content-type": "application/json" },
            })
          : response(n, calls),
    },
  );
});

test("file lists cover the whole session across a Freeflow compaction and then Pi's", { timeout: 30000 }, async () => {
  await fixture(
    async (n) =>
      [
        [{ name: "read", args: { path: "evidence.txt" } }],
        [{ name: "freeflow_compact", args: { summary: "S" } }],
        [],
        [{ name: "read", args: { path: "recovery.txt" } }],
      ][n - 1] ?? [],
    false,
    async ({ session, manager }) => {
      const [freeflow] = manager.getBranch().filter((entry) => entry.type === "compaction");
      assert.deepEqual(freeflow.details.readFiles, ["evidence.txt"]);
      await session.compact();
      const pi = manager
        .getBranch()
        .filter((entry) => entry.type === "compaction")
        .at(-1);
      assert.deepEqual(pi.details.readFiles, ["evidence.txt", "recovery.txt"], "Pi's lists include the earlier cycle");
      assert.match(pi.summary, /<read-files>\nevidence\.txt\nrecovery\.txt\n<\/read-files>/);
    },
    true,
    {
      ...options,
      beforePrompt: async ({ session, requests }) => {
        const before = requests.length;
        await session.prompt("/freeflow compact");
        for (let i = 0; i < 200 && requests.length === before; i++) await new Promise((r) => setTimeout(r, 10));
        await session.waitForIdle();
      },
    },
  );
});

test("after Pi's own compaction, freeflow_compact is refused with where to go next", { timeout: 30000 }, async () => {
  let compacted = false;
  let called = false;
  await fixture(
    async (n) => {
      if (n === 1) return [{ name: "read", args: { path: "evidence.txt" } }];
      // The fixture's own prompt, after Pi compacted: the agent tries to finish a compaction it was preparing.
      if (compacted && !called) {
        called = true;
        return [{ name: "freeflow_compact", args: { summary: "S" } }];
      }
      return [];
    },
    false,
    async ({ manager }) => {
      const refusal = manager
        .getBranch()
        .find((entry) => entry.message?.role === "toolResult" && entry.message.toolName === "freeflow_compact");
      assert.equal(refusal.message.isError, true);
      const text = refusal.message.content.map((part) => part.text).join("");
      assert.match(
        text,
        /this cycle began with Pi's own compaction, so the compaction you were preparing is no longer needed/,
      );
      assert.doesNotMatch(text, /\/freeflow compact/);
    },
    true,
    {
      ...options,
      beforePrompt: async (run) => {
        await earlierPrompt(run);
        await run.session.compact();
        compacted = true;
      },
    },
  );
});
