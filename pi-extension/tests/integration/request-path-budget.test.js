import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { fixture } from "../fixtures/pi-native.js";
import { requestHistoryCounters } from "../../dist/host/request-history.js";

// Request-path work Freeflow may add per prompt, counted rather than timed so the check is deterministic. Timing on a
// real or generated session is `npm run perf:request`; the rules and budgets are in dev-docs/guides/performance.md.
//
// Pi's getBranch walks the whole session each call, and Pi's getContextUsage rebuilds the session projection. In
// September 2026 Freeflow walked the branch 75 times per prompt with routing on, and compaction (October 2026) called
// getContextUsage on every turn; both grew with session length.
const BRANCH_WALKS_PER_PROMPT = 10;

// Freeflow's layer reads the Freeflow home at session start: a temporary one, never the user's real store.
process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));

const history = (manager, turns) => {
  for (let t = 0; t < turns; t++) {
    manager.appendMessage({ role: "user", content: [{ type: "text", text: `Earlier step ${t}.` }], timestamp: t });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `Done ${t}.` }],
      api: "openai-responses",
      provider: "openai",
      model: "gpt-4o",
      usage: {
        input: 100,
        output: 10,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 110,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: t,
    });
  }
};

/** Counts Pi's branch walks and context-usage estimates during the fixture's one prompt. */
async function countPrompt(turns, options) {
  const counts = { walks: 0, usage: 0 };
  const getBranch = SessionManager.prototype.getBranch;
  const getContextUsage = AgentSession.prototype.getContextUsage;
  let counting = false;
  SessionManager.prototype.getBranch = function (...args) {
    if (counting) counts.walks++;
    return getBranch.apply(this, args);
  };
  AgentSession.prototype.getContextUsage = function (...args) {
    if (counting) counts.usage++;
    return getContextUsage.apply(this, args);
  };
  try {
    await fixture(
      async () => [],
      true,
      async () => {
        counting = false;
      },
      true,
      {
        ...options,
        beforePrompt: async (context) => {
          history(context.manager, turns);
          counting = true;
        },
      },
    );
  } finally {
    SessionManager.prototype.getBranch = getBranch;
    AgentSession.prototype.getContextUsage = getContextUsage;
  }
  return counts;
}

for (const [name, options] of [
  ["Freeflow defaults", {}],
  ["Tool Execution", { freeflowConfig: { toolExecution: { enabled: true } } }],
  ["without Freeflow", { skipFreeflow: true }],
])
  test(
    `${name}: request-path work per prompt stays bounded and independent of session length`,
    { timeout: 60000 },
    async () => {
      const short = await countPrompt(20, options);
      const long = await countPrompt(400, options);
      assert.ok(long.walks <= BRANCH_WALKS_PER_PROMPT, `${long.walks} branch walks in one prompt`);
      assert.equal(long.walks, short.walks, "branch walks do not grow with session length");
      assert.equal(long.usage, short.usage, "context-usage estimates do not grow with session length");
    },
  );

/**
 * Whole-message fingerprints request history computes while assembling one later request of a prompt. The first
 * request of a session fingerprints each message once; later requests may fingerprint only what is new or generated.
 * Before October 2026 routing's views gave every message a new identity, so each request fingerprinted all of them.
 */
async function fingerprintsForLaterRequest(turns, options) {
  const at = [];
  await fixture(
    async (n) => {
      at[n] = requestHistoryCounters.fingerprints;
      return n < 3 ? [{ name: "read", args: { path: "missing.txt" } }] : [];
    },
    true,
    async () => {},
    true,
    { ...options, beforePrompt: async ({ manager }) => history(manager, turns) },
  );
  return at[3] - at[2];
}

for (const [name, options] of [["Freeflow defaults", {}]])
  test(
    `${name}: a later request fingerprints only what is new, however long the history`,
    { timeout: 60000 },
    async () => {
      const short = await fingerprintsForLaterRequest(20, options);
      const long = await fingerprintsForLaterRequest(400, options);
      assert.ok(long <= 20, `${long} fingerprints for one later request`);
      assert.equal(long, short, "fingerprints per request do not grow with the history");
    },
  );

test("Freeflow adds no context-usage estimate when the turn reports its usage", { timeout: 60000 }, async () => {
  const without = await countPrompt(50, { skipFreeflow: true });
  const withFreeflow = await countPrompt(50, {});
  assert.equal(withFreeflow.usage, without.usage);
});

// The turn's discussion capture (D-056) is scheduled off the request path: once per settled run, and none while a run is
// in flight. Counted, so the check is deterministic: the capture's script starts, per settled run and per prompt.
test(
  "Freeflow starts at most one discussion capture per settled run, and none while a run is in flight",
  { timeout: 60000 },
  async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { DiscussionCapture, CAPTURE_IDLE_MS } = await import("../../dist/discussion/capture.js");
    const home = await mkdtemp(join(tmpdir(), "freeflow-capture-budget-"));
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "store.json"), "{}\n");
    const saved = {
      FREEFLOW_HOME: process.env.FREEFLOW_HOME,
      FREEFLOW_SESSION: process.env.FREEFLOW_SESSION,
      FREEFLOW_TRANSCRIPT: process.env.FREEFLOW_TRANSCRIPT,
    };
    process.env.FREEFLOW_HOME = home;
    process.env.FREEFLOW_SESSION = "budget-session";
    process.env.FREEFLOW_TRANSCRIPT = join(home, "transcript.jsonl");
    try {
      const starts = [];
      const capture = new DiscussionCapture(async (args) => {
        if (args[1] === "capture") starts.push(args);
        return { code: 0, stdout: "No new messages.\n", stderr: "" };
      });
      capture.settled();
      capture.runStarted();
      await new Promise((done) => setTimeout(done, CAPTURE_IDLE_MS + 300));
      assert.equal(starts.length, 0, "no capture starts while a run is in flight");
      capture.settled();
      await new Promise((done) => setTimeout(done, CAPTURE_IDLE_MS + 300));
      assert.equal(starts.length, 1, "one capture per settled run");
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await rm(home, { recursive: true, force: true });
    }
  },
);
