import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fixture } from "../fixtures/routing-native.js";

// Freeflow compaction's agent path on a real Pi session: /freeflow compact makes compaction due and sends the request
// as the user's message, freeflow_compact schedules it, and the turn end writes the compaction, carried context and
// recovery message and continues the run.
const noRouting = (extra = {}) => ({
  cognitiveRouting: { enabled: false },
  freeflowConfig: { toolExecution: { enabled: true }, ...extra },
});
const compact = (args) => ({ name: "freeflow_compact", args });
const text = (item) =>
  typeof item.content === "string"
    ? item.content
    : (item.content ?? []).map((part) => part.text ?? "").join("") + (item.output ?? "");
const inputTexts = (body) => body.input.filter((item) => item.role !== "system").map(text);
const toolResults = (manager, name) =>
  manager
    .getBranch()
    .filter((entry) => entry.message?.role === "toolResult" && entry.message.toolName === name)
    .map((entry) => entry.message);
// /freeflow compact sends the request as the user's message; its run starts after the command returns.
const compactNow = async ({ session, requests }) => {
  const before = requests.length;
  await session.prompt("/freeflow compact");
  for (let i = 0; i < 200 && requests.length === before; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  await session.waitForIdle();
};

test("freeflow_compact is refused until compaction is due", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => [[compact({ summary: "EARLY" })]][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const [result] = toolResults(manager, "freeflow_compact");
      assert.equal(result.isError, true);
      assert.match(text(result), /Compaction is not due/);
      assert.ok(!manager.getBranch().some((entry) => entry.type === "compaction"));
    },
    true,
    noRouting(),
  );
});

test("/freeflow compact leads to one compaction and the same run continues from it", { timeout: 30000 }, async () => {
  let cwd;
  await fixture(
    async (n) => {
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        await writeFile(join(cwd, "evidence.txt"), "FRESH_AT_COMPACTION");
        return [compact({ summary: "AGENT_SUMMARY_MARKER", carry: [{ file: "evidence.txt" }] })];
      }
      return [];
    },
    false,
    async ({ requests, manager, session, notices }) => {
      // 1: the first prompt; 2-4: the run /freeflow compact started, compacting after request 3; 5: the next prompt.
      assert.equal(requests.length, 5);
      const after = inputTexts(requests[3]);
      assert.match(after[0], /compacted into the following summary/);
      assert.match(after[0], /AGENT_SUMMARY_MARKER/);
      assert.match(after[0], /This compaction starts cycle 2\./);
      assert.match(after[0], /<read-files>\nevidence\.txt\n<\/read-files>/);
      assert.match(after[1], /# Carried context/);
      assert.match(after[1], /FIRST_USER_MESSAGE/);
      assert.match(
        after[1],
        /Compact now: read the compaction skill/,
        "the user's /freeflow compact request is carried",
      );
      assert.match(after[1], /### evidence\.txt\n\n`+\nFRESH_AT_COMPACTION\n`+/);
      assert.match(after[2], /There is no Working Record, so the summary is your record for this cycle/);
      // Nothing from before the compaction is sent again: not the old read, not the request that compacted.
      assert.ok(!JSON.stringify(requests[3].input).includes("EXACT_EVIDENCE_BODY_81"));
      assert.ok(!requests[3].input.some((item) => item.type === "function_call"));
      // The next cycle extends its own requests.
      assert.deepEqual(requests[4].input.slice(0, requests[3].input.length - 1), requests[3].input.slice(0, -1));

      const entry = manager.getBranch().find((each) => each.type === "compaction");
      assert.equal(entry.firstKeptEntryId, entry.id, "keeps no earlier entries");
      assert.equal(entry.details.freeflow.cycle, 2);
      assert.deepEqual(
        entry.details.freeflow.carried.map(({ kind, path, firstCycle }) => [kind, path, firstCycle]),
        [["file", "evidence.txt", 2]],
      );
      await session.prompt("/freeflow status");
      assert.match(
        notices.at(-1)[0],
        /compaction: enabled \(cycle 2, .*last compaction: Freeflow, carried about \dk\)/,
      );
      const reopened = SessionManager.open(manager.getSessionFile()).buildSessionProjection().messages;
      assert.deepEqual(
        reopened
          .filter((message) => message.role !== "system")
          .slice(0, 3)
          .map((message) => message.customType ?? message.role),
        ["compactionSummary", "freeflow-carried-context", "freeflow-compaction-recovery"],
      );
    },
    true,
    {
      ...noRouting(),
      beforePrompt: async (run) => {
        cwd = run.cwd;
        await run.session.prompt("FIRST_USER_MESSAGE");
        await run.session.waitForIdle();
        await compactNow(run);
      },
    },
  );
});

test("a compaction request over its limits is refused with what to change", { timeout: 30000 }, async () => {
  let cwd;
  await fixture(
    async (n) =>
      [
        [compact({ summary: "S", carry: [{ file: "missing.txt" }] })],
        [compact({ summary: "x".repeat(40_000) })],
        [compact({ summary: "S", carry: [{ file: "big.txt" }] })],
        [compact({ summary: "S", carry: [{ file: "big.txt", lines: [3, 1] }] })],
        [compact({ summary: "S", carry: [{ file: "big.txt", lines: [1, 2] }] })],
      ][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const results = toolResults(manager, "freeflow_compact").map(text);
      assert.match(results[0], /missing\.txt \(file not found\)/);
      assert.match(results[1], /about 10000 tokens; the limit is 8000/);
      assert.match(results[2], /the budget is 19200/);
      assert.match(results[3], /lines must be \[first, last\]/);
      assert.match(results[4], /Compaction will happen at the end of this turn/);
      assert.equal(manager.getBranch().filter((entry) => entry.type === "compaction").length, 1);
    },
    true,
    {
      ...noRouting(),
      beforePrompt: async (run) => {
        cwd = run.cwd;
        await writeFile(join(cwd, "big.txt"), "line\n".repeat(20_000));
        await compactNow(run);
      },
    },
  );
});

test("after compaction the model holds only the files it carried", { timeout: 30000 }, async () => {
  await fixture(
    async (n) =>
      [
        [
          { name: "read", args: { path: "evidence.txt" } },
          { name: "read", args: { path: "recovery.txt" } },
        ],
        [compact({ summary: "S", carry: [{ file: "evidence.txt" }] })],
        [{ name: "write", args: { path: "recovery.txt", content: "OVERWRITE" } }],
        [{ name: "write", args: { path: "evidence.txt", content: "OVERWRITE" } }],
      ][n - 1] ?? [],
    false,
    async ({ manager }) => {
      const [notCarried, carried] = toolResults(manager, "write");
      assert.equal(notCarried.isError, true, "a file read only before compaction counts as unread");
      assert.equal(carried.isError, false, "a carried file counts as read");
    },
    true,
    { ...noRouting(), beforePrompt: compactNow },
  );
});

test("freeflow_compact is declared while compaction is on, and not when it is off", { timeout: 30000 }, async () => {
  const declared = async (options) => {
    let tools;
    await fixture(
      async () => [],
      false,
      async ({ requests }) => {
        tools = requests[0].tools.map((tool) => tool.name);
      },
      true,
      options,
    );
    return tools.includes("freeflow_compact");
  };
  assert.equal(await declared(noRouting()), true);
  assert.equal(await declared(noRouting({ compaction: { enabled: false } })), false);
});

test("a worker compacts mid-assignment, recovers, and the unit completes", { timeout: 30000 }, async () => {
  const delegate = { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt." } };
  const submit = { name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } };
  const close = { name: "freeflow_unit", args: { operation: "close", outcome: "accepted", assessment: "Enough." } };
  await fixture(
    async (n) =>
      [
        [delegate],
        [{ name: "read", args: { path: "evidence.txt" } }],
        [compact({ summary: "WORKER_SUMMARY" })],
        [submit],
        [close],
      ][n - 1] ?? [],
    true,
    async ({ requests }) => {
      // The run /freeflow compact started does the whole unit; the last request answers the fixture's own prompt.
      assert.deepEqual(
        requests.map((body) => body.model),
        ["gpt-4o", "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4o", "gpt-4o", "gpt-4o"],
      );
      const after = JSON.stringify(requests[3]);
      assert.match(after, /WORKER_SUMMARY/);
      assert.match(after, /Cognitive Routing profile when compacted: executor\./);
      assert.match(after, /Current exact assignment [^:]+:\\nRead evidence\.txt\./);
      // The Coordinator learns which worker compacted; the worker's own requests carry no such line.
      const NOTE = "Compaction: cycle 2 began when the Executor compacted; its summary opens your view.";
      assert.ok(!JSON.stringify(requests[3].input).includes(NOTE));
      assert.ok(JSON.stringify(requests[4].input).includes(NOTE));
      // Each new copy of routing's Runtime State is complete, so the latest one still carries it.
      const states = requests[5].input.filter((item) =>
        JSON.stringify(item).includes("# Cognitive Routing Runtime State"),
      );
      assert.ok(JSON.stringify(states.at(-1)).includes(NOTE));
    },
    true,
    {
      freeflowConfig: { toolExecution: { enabled: true } },
      // Compaction is due from the start; the worker compacts during its assignment.
      beforePrompt: compactNow,
    },
  );
});

test("a Coordinator under projection is told to delegate compaction, not to compact", { timeout: 30000 }, async () => {
  await fixture(
    async (n) => [[compact({ summary: "COORDINATOR_SUMMARY" })]][n - 1] ?? [],
    true,
    async ({ manager }) => {
      const [result] = toolResults(manager, "freeflow_compact");
      assert.equal(result.isError, true);
      assert.match(text(result), /Your view leaves out what workers did, so do not compact yourself/);
      assert.ok(!manager.getBranch().some((entry) => entry.type === "compaction"));
    },
    true,
    { freeflowConfig: { toolExecution: { enabled: true } }, beforePrompt: compactNow },
  );
});

test("the compaction skill is listed to the model with Freeflow's skills", { timeout: 30000 }, async () => {
  await fixture(
    async () => [],
    false,
    async ({ requests }) => {
      const system = requests[0].input.find((item) => item.role === "system").content;
      assert.match(system, /<name>compaction<\/name>\s*<description>Use when Freeflow says compaction is due/);
      assert.match(system, /capabilities\/compaction\/SKILL\.md/);
    },
    true,
    noRouting(),
  );
});
