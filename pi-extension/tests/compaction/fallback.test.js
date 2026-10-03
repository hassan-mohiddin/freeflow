import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
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
      assert.match(entry.summary, /do not re-read the compaction skill or its summary format/);
      assert.doesNotMatch(entry.summary, /carried context is above/, "Pi's own compaction carries nothing");
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

test(
  "under routing, Pi's own compaction lists the worker's assignment results by ref",
  { timeout: 30000 },
  async () => {
    const steps = [
      [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read the two parts." } }],
      [{ name: "read", args: { path: "part1.txt" } }],
      [{ name: "read", args: { path: "part2.txt" } }],
      [{ name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } }],
      [{ name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } }],
    ];
    // The third step reports usage past any model's window, so Pi compacts before the worker's next response (under
    // routing Pi judges the current model, the worker's). Summarizer requests get a plain summary and do not advance
    // the steps.
    const usage = [5_000, 50_000, 2_000_000];
    let step = 0;
    await fixture(
      async () => [],
      true,
      async ({ manager }) => {
        const entry = manager.getBranch().find((each) => each.type === "compaction");
        assert.ok(entry, "Pi compacted mid-assignment");
        assert.equal(entry.details.freeflow.fallback, true);
        assert.match(entry.summary, /### Results of this assignment\n\nPi kept the most recent as they were/);
        for (const path of ["part1.txt", "part2.txt"])
          assert.match(entry.summary, new RegExp(`- ctx:\\S+ {2}read {2}${path.replace(".", "\\.")}`));
      },
      true,
      {
        freeflowConfig: { toolExecution: { enabled: true } },
        fixtureCompaction: false,
        piAutoCompaction: true,
        beforePrompt: async ({ cwd }) => {
          await writeFile(join(cwd, "part1.txt"), "PART ONE");
          await writeFile(join(cwd, "part2.txt"), "PART TWO");
        },
        response: (n, _calls, body) => {
          // Pi's summarizer (its history summary and, mid-turn, the turn-prefix summary) is not a scripted step.
          if (JSON.stringify(body).includes("You are a context summarization assistant"))
            return response(n, [], "PI SUMMARY");
          const at = step++;
          const tokens = usage[at] ?? 1_000;
          return response(n, steps[at] ?? [], "fixture response", {
            input_tokens: tokens,
            output_tokens: 10,
            total_tokens: tokens + 10,
          });
        },
      },
    );
  },
);
