import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { routingState } from "../fixtures/routing-state.js";
import { Handoffs } from "../../dist/cognitive-routing/handoffs.js";
import { RoutingSession } from "../../dist/cognitive-routing/session.js";
import { initialState } from "../../dist/cognitive-routing/state.js";

const pair = { provider: "fixture", modelId: "coordinator", thinking: "off" };
const delegateCall = {
  role: "assistant",
  content: [{ type: "toolCall", id: "call-1", name: "freeflow_delegate", arguments: {} }],
  stopReason: "toolUse",
};
const entry = (id, message) => ({ id, type: "message", message });

// A Coordinator turn that delegated: its execution is opened, and the accepted handoff awaits turn end.
function delegatedTurn({ control = "automatic", assistants = ["assistant-1"] } = {}) {
  const branch = [
    entry("user-1", { role: "user", content: "Start.", timestamp: 1 }),
    ...assistants.map((id) => entry(id, delegateCall)),
    entry("result-1", { role: "toolResult", toolCallId: "call-1", toolName: "freeflow_delegate", content: [] }),
  ];
  const state = { ...initialState(), control, profile: "coordinator", pendingId: "handoff-1" };
  state.handoffs.set("handoff-1", { id: "handoff-1", state: "accepted", executionId: "execution-1" });
  const appended = [];
  const session = Object.assign(new RoutingSession(), {
    capability: { effective: true },
    store: { blocked: undefined, reader: { getBranch: () => branch } },
    turn: { id: "execution-1", profile: "coordinator", before: new Set(["user-1"]), opened: true, pair },
    stateData: () => state,
    append: (event) => appended.push(event),
  });
  const finished = [];
  const handoffs = new Handoffs(session, {}, {}, {});
  handoffs.finishHandoff = async (handoff) => finished.push(handoff.id);
  let aborted = false;
  const ctx = { sessionManager: { getBranch: () => branch }, abort: () => (aborted = true) };
  return { session, handoffs, ctx, appended, finished, aborted: () => aborted };
}

test("turn end binds the response to its execution and completes the accepted handoff", async () => {
  const run = delegatedTurn();
  await run.handoffs.turnEnd({ message: delegateCall }, run.ctx);
  assert.deepEqual(
    run.appended.map((e) => [e.type, e.assistantEntryId, e.resultEntryIds]),
    [["execution-bound", "assistant-1", ["result-1"]]],
  );
  assert.deepEqual(run.finished, ["handoff-1"]);
  assert.equal(run.session.error, undefined);
});

test("turn end leaves a handoff pending when automatic control ended during the run", async () => {
  // For example, the user picked a model in Pi while the Coordinator was delegating.
  const run = delegatedTurn({ control: "inactive" });
  await run.handoffs.turnEnd({ message: delegateCall }, run.ctx);
  assert.deepEqual(
    run.appended.map((e) => e.type),
    ["execution-bound"],
  );
  assert.deepEqual(run.finished, [], "no model switch is attempted");
  assert.equal(run.session.error, undefined, "routing is not blocked");
});

test("turn end refuses an ambiguous binding and stops the run", async () => {
  const run = delegatedTurn({ assistants: ["assistant-1", "assistant-2"] });
  await run.handoffs.turnEnd({ message: delegateCall }, run.ctx);
  assert.deepEqual(run.appended, [], "no execution is bound to a guessed entry");
  assert.deepEqual(run.finished, []);
  assert.match(run.session.error, /execution_binding_ambiguous/);
  assert.ok(run.aborted(), "the run is aborted");
});

test("crash resume waits for queued input to reach the Coordinator", async () => {
  const resumeWith = async (queued) => {
    const session = new RoutingSession();
    const handoffs = new Handoffs(session, {}, {}, {});
    let resumed = 0;
    handoffs.resume = async () => resumed++;
    const notices = [];
    const ctx = { hasPendingMessages: () => queued, ui: { notify: (text, level) => notices.push([text, level]) } };
    await handoffs.resumeAfterCrash(ctx, session.token);
    return { resumed, notices };
  };
  const idle = await resumeWith(false);
  assert.equal(idle.resumed, 1);
  const queued = await resumeWith(true);
  assert.equal(queued.resumed, 0, "the worker does not resume ahead of queued input");
  assert.equal(queued.notices.length, 1);
  assert.equal(queued.notices[0][1], "warning");
  assert.match(queued.notices[0][0], /\/freeflow resume/);
});

test("resume refuses to start while a run is active", async () => {
  const handoffs = new Handoffs(new RoutingSession(), {}, {}, {});
  await assert.rejects(handoffs.resume({ isIdle: () => false }), (error) => error.code === "not_idle");
});

test(
  "/freeflow resume refuses to restart a worker over input the Coordinator has not seen",
  { timeout: 30000 },
  async () => {
    let active;
    await fixture(
      async (n) => {
        if (n === 1)
          return [
            { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt and return." } },
          ];
        if (n === 2) await active.steer("Change of plan.");
        return [];
      },
      false,
      async ({ session, manager, requests, notices }) => {
        const state = routingState(manager);
        assert.equal(state.assignments.get(state.assignmentId).state, "outstanding");
        const before = requests.length;
        await session.prompt("/freeflow resume");
        await session.waitForIdle();
        assert.equal(requests.length, before, "the worker is not restarted");
        assert.ok(
          notices.some(([text]) => /New input needs Coordinator attention/.test(String(text))),
          "the user is told the new input needs the Coordinator first",
        );
      },
      true,
      { onSession: (session) => (active = session) },
    );
  },
);

test("a handoff whose model switch fails is recorded as blocked and the user is told", { timeout: 30000 }, async () => {
  let active;
  await fixture(
    async (n) => {
      if (n === 1) {
        // Only the switch to the Executor fails; restoring the Coordinator's model succeeds.
        const setModel = active.setModel.bind(active);
        active.setModel = async (model) => {
          if (model.id === "gpt-4.1-mini") throw new Error("fixture: model switch failed");
          return setModel(model);
        };
        return [
          { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt and return." } },
        ];
      }
      return [];
    },
    false,
    async ({ manager, notices }) => {
      const state = routingState(manager);
      const handoff = state.handoffs.get(state.pendingId);
      assert.equal(handoff?.state, "blocked", "the saved handoff is not claimed as configured");
      assert.ok(
        notices.some(([text]) => /Couldn’t switch to Executor — assignment saved/.test(String(text))),
        "the user is told the assignment was saved",
      );
    },
    true,
    { onSession: (session) => (active = session) },
  );
});
