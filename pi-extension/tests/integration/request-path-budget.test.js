import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { fixture } from "../fixtures/routing-native.js";
import { requestHistoryCounters } from "../../dist/host/request-history.js";

// Request-path work Freeflow may add per prompt, counted rather than timed so the check is deterministic. Timing on a
// real or generated session is `npm run perf:request`; the rules and budgets are in dev-docs/guides/performance.md.
//
// Pi's getBranch walks the whole session each call, and Pi's getContextUsage rebuilds the session projection. In
// September 2026 Freeflow walked the branch 75 times per prompt with routing on, and compaction (October 2026) called
// getContextUsage on every turn; both grew with session length.
const BRANCH_WALKS_PER_PROMPT = 10;

// Task memory with a record attached and in focus, never the user's real registry.
process.env.FREEFLOW_HOME = await mkdtemp(join(tmpdir(), "freeflow-home-"));
const attachRecord = async ({ cwd, session, manager }) => {
  const script = resolve("skills/track-work/scripts/working-record.mjs");
  execFileSync(
    process.execPath,
    [script, "init", "--schema", "4", "--root", cwd, "--name", "Retry work", "--input", "-"],
    {
      input: "### Goal\n- Retries.\n\n### Next useful action\n- Continue.\n",
    },
  );
  await session.prompt("/freeflow task attach .freeflow/tasks/task-001-retry-work/record.md");
  assert.ok(
    manager.getBranch().some((entry) => entry.customType === "freeflow-task-memory-snapshot"),
    "attached",
  );
};

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
          await options.prepare?.(context);
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
  ["Freeflow defaults", { cognitiveRouting: { enabled: false } }],
  ["Cognitive Routing with projection and Tool Execution", { freeflowConfig: { toolExecution: { enabled: true } } }],
  [
    "Task memory with a focused record",
    { cognitiveRouting: { enabled: false }, freeflowConfig: { taskMemory: { enabled: true } }, prepare: attachRecord },
  ],
  ["without Freeflow", { skipFreeflow: true, cognitiveRouting: { enabled: false } }],
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

for (const [name, options] of [
  ["Freeflow defaults", { cognitiveRouting: { enabled: false } }],
  ["Cognitive Routing with projection", {}],
])
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
  const without = await countPrompt(50, { skipFreeflow: true, cognitiveRouting: { enabled: false } });
  const withFreeflow = await countPrompt(50, { cognitiveRouting: { enabled: false } });
  assert.equal(withFreeflow.usage, without.usage);
});
