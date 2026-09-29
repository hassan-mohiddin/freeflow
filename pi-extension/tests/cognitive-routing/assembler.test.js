import assert from "node:assert/strict";
import test from "node:test";
import { ContextAssembler } from "../../dist/cognitive-routing/assembler.js";
import { RoutingSession } from "../../dist/cognitive-routing/session.js";
import { initialState } from "../../dist/cognitive-routing/state.js";

test("an automatic request whose live pair differs from its profile's pair is blocked, not sent", async () => {
  const state = { ...initialState(), control: "automatic", profile: "coordinator" };
  const session = Object.assign(new RoutingSession(), {
    store: { blocked: undefined },
    supported: () => true,
    stateData: () => state,
    observed: () => ({ provider: "fixture", modelId: "worker-model", thinking: "high" }),
    profilePair: () => ({ provider: "fixture", modelId: "coordinator-model", thinking: "high" }),
  });
  let aborted = false;
  const notices = [];
  const ctx = { abort: () => (aborted = true), ui: { notify: (text) => notices.push(text) } };
  const messages = await new ContextAssembler(session, {}, {}).context(ctx, [
    { role: "user", content: "Continue.", timestamp: 1 },
  ]);
  assert.equal(messages.length, 1, "no conversation history is sent");
  assert.equal(messages[0].details.routingRequestBlocked, true);
  assert.match(session.error, /prepared_pair_mismatch/);
  assert.ok(aborted, "the run is aborted");
  assert.equal(notices.length, 1, "the user is told once");
});

test("admission ranks follow the branch leaf, not only the routing state", () => {
  const message = (id) => ({ type: "message", id, message: { role: "user", content: id } });
  const selection = {
    type: "custom",
    id: "s1",
    customType: "freeflow-routing-v2",
    data: { data: { type: "selection-changed", assignmentId: "a1", selection: { selected: ["ctx:r1"] } } },
  };
  const state = initialState();
  state.selections.set("a1", { revision: 1, selected: ["ctx:r1"], unresolved: [], withdrawals: [] });
  let branch = [message("m1"), selection];
  const assembler = new ContextAssembler({
    ctx: { sessionManager: { getLeafId: () => branch.at(-1).id, getBranch: () => branch } },
  });
  assert.equal(assembler.admissions(state).admissions.get("ctx:r1"), 1);
  branch = [message("m0"), message("m1"), selection, message("m2")];
  assert.equal(assembler.admissions(state).admissions.get("ctx:r1"), 2, "a moved leaf recomputes ranks");
});
