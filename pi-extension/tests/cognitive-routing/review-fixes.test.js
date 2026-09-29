import assert from "node:assert/strict";
import test from "node:test";
import { fixture, response } from "../fixtures/routing-native.js";

const NOTICE = /New delivered user input requires Coordinator attention/g;
const count = (body, pattern) => (JSON.stringify(body).match(pattern) ?? []).length;

test("an interrupted worker sees one attention notice, not a copy per request", { timeout: 30000 }, async () => {
  let active;
  const notices = [];
  await fixture(
    async (n, body) => {
      if (n > 2) notices.push(count(body, NOTICE));
      if (n === 1)
        return [
          { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt and return." } },
        ];
      if (n === 2) {
        await active.steer("STOP_AND_REPORT_31");
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      if (n === 3 || n === 4) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 5)
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Partial result after new input.", outcome: "partial" },
          },
        ];
      return [];
    },
    false,
    undefined,
    true,
    { onSession: (session) => (active = session) },
  );
  assert.deepEqual(notices.slice(0, 3), [1, 1, 1], "each interrupted worker request carries exactly one notice");
});

test("routing argument errors name the operation and the fields to fix", async () => {
  const { registerRoutingTools } = await import("../../dist/cognitive-routing/tools.js");
  const tools = new Map();
  registerRoutingTools({ registerTool: (definition) => tools.set(definition.name, definition) }, {});
  const message = async (name, input) => {
    try {
      await tools.get(name).execute("call-1", input, undefined, undefined, {});
    } catch (error) {
      return error.message;
    }
    return "";
  };
  const extra = await message("freeflow_project", { operation: "add", refs: ["ctx:a"], reason: "why" });
  assert.match(extra, /add/);
  assert.match(extra, /reason/);
  assert.match(extra, /allowed fields: operation, refs/i);
  const missing = await message("freeflow_delegate", { operation: "replace", contract: "c" });
  assert.match(missing, /replace/);
  assert.match(missing, /missing required field.*reason/i);
  const unknown = await message("freeflow_unit", { operation: "finish" });
  assert.match(unknown, /inspect, assess, recover, cancel-recovery, close/);
  const invalid = await message("freeflow_unit", { operation: "close", outcome: "done", assessment: "a" });
  assert.match(invalid, /outcome/);
});

test("flattened routing fields say which operations accept them", async () => {
  const { ROUTING_SCHEMAS } = await import("../../dist/cognitive-routing/schemas.js");
  assert.match(ROUTING_SCHEMAS.freeflow_project.properties.reason.description, /Only for operation: remove\./);
  assert.match(ROUTING_SCHEMAS.freeflow_delegate.properties.reason.description, /Only for operation: replace\./);
  assert.match(ROUTING_SCHEMAS.freeflow_unit.properties.limit.description, /Only for operation: inspect\./);
  assert.match(ROUTING_SCHEMAS.freeflow_unit.properties.assessment.description, /Only for operation: close\./);
  assert.doesNotMatch(ROUTING_SCHEMAS.freeflow_delegate.properties.contract.description ?? "", /Only for/);
});

test("assessment resumption reports its actual cause", async () => {
  const { initialState, reduce } = await import("../../dist/cognitive-routing/state.js");
  const event = (data) => ({
    version: 2,
    eventId: `e-${Math.random()}`,
    operationId: `op-${Math.random()}`,
    stepId: data.type,
    recordedSessionId: "s",
    data,
  });
  const resume = event({ type: "assessment-resumed", handoffId: "h1", basisUserEntryId: null });
  const suspended = () => {
    const state = initialState();
    state.control = "automatic";
    state.profile = "coordinator";
    state.assessment = { handoffId: "h1", assignmentId: "a1", view: "suspended", basisUserEntryId: null, problems: [] };
    return state;
  };
  const code = (state) => {
    try {
      reduce(state, resume);
      return "accepted";
    } catch (error) {
      return error.code;
    }
  };
  assert.equal(code(suspended()), "accepted");
  const worker = suspended();
  worker.profile = "executor";
  assert.equal(code(worker), "wrong_control");
  const manual = suspended();
  manual.control = "manual";
  assert.equal(code(manual), "wrong_control");
  const active = suspended();
  active.assessment.view = "active";
  assert.equal(code(active), "assessment_not_suspended");
  const other = suspended();
  other.assessment.handoffId = "h2";
  assert.equal(code(other), "assessment_missing");
  const recovering = suspended();
  recovering.recoveryId = "r1";
  assert.equal(code(recovering), "recovery_outstanding");
});

test("the resume rank of the current assessment comes from its latest resumption event", async () => {
  const { RoutingRuntime } = await import("../../dist/cognitive-routing/runtime.js");
  const { initialState } = await import("../../dist/cognitive-routing/state.js");
  const message = (id) => ({ type: "message", id, message: { role: "user", content: "x" } });
  const routing = (id, data) => ({ type: "custom", id, customType: "freeflow-routing-v2", data: { data } });
  const branch = [
    message("m0"),
    routing("e1", { type: "assessment-resumed", handoffId: "other" }),
    message("m1"),
    routing("e2", { type: "assessment-resumed", handoffId: "h1" }),
    message("m2"),
    message("m3"),
    routing("e3", { type: "assessment-resumed", handoffId: "h1" }),
    message("m4"),
  ];
  const runtime = new RoutingRuntime({ on() {}, registerTool() {} }, []);
  runtime.ctx = { sessionManager: { getLeafId: () => "m4", getBranch: () => branch } };
  const state = initialState();
  state.assessment = { handoffId: "h1", assignmentId: "a1", view: "active", problems: [] };
  assert.equal(runtime.admissions(state).resumedAt, 4, "rank after four messages");
  const none = initialState();
  assert.equal(runtime.admissions(none).resumedAt, undefined);
});

const routingCapability = (delegation = "executor") => ({
  configured: true,
  enabled: true,
  cognitiveRouting: { enabled: true, effective: true, projection: true, delegation },
  toolExecution: { effective: false },
});

test("Freeflow Runtime State does not churn on automatic profile switches", async () => {
  const { freeflowRuntimeStateMessage } = await import("../../dist/host/runtime-context.js");
  const snapshot = (activeProfile, controlMode = "automatic", delegation = "both") => ({
    effective: true,
    runtimeStatus: "active",
    activeProfile,
    controlMode,
    delegation,
  });
  const coordinator = freeflowRuntimeStateMessage(routingCapability(), snapshot("coordinator")).content;
  const executor = freeflowRuntimeStateMessage(routingCapability(), snapshot("executor")).content;
  assert.equal(executor, coordinator, "automatic switches leave the Freeflow state unchanged");
  assert.doesNotMatch(coordinator, /Profile:/);
  assert.match(coordinator, /Delegation: `both`/, "the effective delegation, including a session override");
  const manual = freeflowRuntimeStateMessage(
    routingCapability(),
    snapshot("executor", "manual-executor", "executor"),
  ).content;
  assert.match(manual, /Control: `manual`/);
  assert.match(manual, /Profile: `executor`/);
});

test("routing Runtime State carries responsibility without ids, boilerplate, or evidence JSON", async () => {
  const states = [];
  await fixture(
    async (n, body, manager) => {
      const state = body.input
        .filter((item) => JSON.stringify(item).includes("# Cognitive Routing Runtime State"))
        .at(-1);
      states.push(JSON.stringify(state));
      if (n === 1)
        return [
          { name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt and return." } },
        ];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        const ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
        return [
          { name: "freeflow_project", args: { operation: "add", refs: [ref] } },
          { name: "freeflow_return", args: { operation: "submit", report: "Read.", outcome: "completed" } },
        ];
      }
      return [];
    },
    true,
    undefined,
    true,
  );
  const worker = states[2];
  assert.match(worker, /Profile: executor/);
  assert.match(worker, /Assignment: A1 \(executor, outstanding\)/);
  assert.doesNotMatch(worker, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/, "no UUIDs");
  assert.doesNotMatch(worker, /Mechanical evidence facts/);
  assert.doesNotMatch(worker, /Completed\/superseded contracts/);
  assert.doesNotMatch(worker, /Delegation:|Projection:|Control:/, "owned by the Freeflow Runtime State");
  const coordinator = states.at(-1);
  assert.match(coordinator, /Profile: coordinator/);
  assert.match(coordinator, /Evidence: revision 1; selected ctx:/);
});

test("Freeflow Runtime State keeps a fixed position until it changes, then anchors where it changed", async () => {
  const { withFreeflowRuntimeState } = await import("../../dist/host/runtime-context.js");
  const user = (text) => ({ role: "user", content: text });
  const assistant = (text) => ({ role: "assistant", content: [{ type: "text", text }] });
  const anchor = {};
  const at = (messages) => messages.findIndex((m) => m.customType === "freeflow-runtime-state");
  const one = withFreeflowRuntimeState(
    [user("a"), assistant("b")],
    routingCapability("executor"),
    undefined,
    undefined,
    { anchor },
  );
  assert.equal(at(one), 0, "initially before the first user message");
  const two = withFreeflowRuntimeState(
    [user("a"), assistant("b"), user("c")],
    routingCapability("executor"),
    undefined,
    undefined,
    { anchor },
  );
  assert.deepEqual(two.slice(0, one.length), one, "unchanged state keeps the cached prefix");
  const three = withFreeflowRuntimeState(
    [user("a"), assistant("b"), user("c"), assistant("d"), user("e")],
    routingCapability("both"),
    undefined,
    undefined,
    { anchor },
  );
  assert.deepEqual(
    three.slice(0, 4),
    [user("a"), assistant("b"), user("c"), assistant("d")],
    "a change does not rewrite the earlier prefix",
  );
  assert.equal(at(three), 4, "a changed state is placed before the latest user message");
  const four = withFreeflowRuntimeState(
    [user("a"), assistant("b"), user("c"), assistant("d"), user("e"), assistant("f"), user("g")],
    routingCapability("both"),
    undefined,
    undefined,
    { anchor },
  );
  assert.deepEqual(four.slice(0, three.length), three, "the changed state then stays where it was anchored");
});

test("provenance rows describe only sources with observed routing attribution", async () => {
  const { RoutingRuntime } = await import("../../dist/cognitive-routing/runtime.js");
  const entries = [];
  let parent = null;
  const messages = [];
  for (let i = 0; i < 5; i++)
    for (const message of [
      { role: "user", content: [{ type: "text", text: `question ${i}` }], timestamp: i },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: `c${i}`, name: "read", arguments: { path: `f${i}` } }],
        api: "x",
        provider: "p",
        model: "m",
        usage: {},
        stopReason: "toolUse",
        timestamp: i,
      },
      {
        role: "toolResult",
        toolCallId: `c${i}`,
        toolName: "read",
        content: [{ type: "text", text: "body" }],
        timestamp: i,
      },
    ]) {
      const entry = { type: "message", id: `e${entries.length}`, parentId: parent, message };
      entries.push(entry);
      parent = entry.id;
      messages.push(message);
    }
  const sessionManager = {
    getBranch: () => entries,
    getEntries: () => entries,
    getLeafId: () => parent,
    getSessionId: () => "s",
    getSessionFile: () => undefined,
    buildContextEntries: () => entries,
  };
  const runtime = new RoutingRuntime({ appendEntry() {}, getAllTools: () => [], getActiveTools: () => [] }, []);
  const ctx = { sessionManager, cwd: process.cwd() };
  await runtime.bind(ctx, {
    effective: false,
    delegation: "executor",
    profiles: {},
    blockingReason: { code: "disabled", message: "off" },
  });
  const out = await runtime.context(ctx, messages);
  assert.equal(
    out.filter((m) => m.customType === "freeflow-routing-v2-refs").length,
    0,
    "no rows without routing attribution",
  );
  assert.equal(out.length, messages.length);
});

test("receipts identify contracts and reports without repeating their text", async () => {
  const CONTRACT = "CONTRACT_BODY_73 read evidence.txt and return.";
  const REPORT = "REPORT_BODY_79 evidence read.";
  let coordinatorBody;
  const result = await fixture(
    async (n, body, manager) => {
      if (n === 1) return [{ name: "freeflow_delegate", args: { operation: "assign", contract: CONTRACT } }];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        const ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
        return [
          { name: "freeflow_project", args: { operation: "add", refs: [ref] } },
          { name: "freeflow_return", args: { operation: "submit", report: REPORT, outcome: "completed" } },
        ];
      }
      coordinatorBody = JSON.stringify(body);
      return [];
    },
    true,
    undefined,
    true,
  );
  const receipt = (tool) =>
    result.entries.find((e) => e.message?.role === "toolResult" && e.message.toolName === tool).message;
  const delegate = JSON.stringify(receipt("freeflow_delegate"));
  assert.doesNotMatch(delegate, /CONTRACT_BODY_73/, "the delegate receipt does not repeat the contract");
  const returned = receipt("freeflow_return");
  const details = JSON.parse(returned.content[0].text);
  assert.equal(details.report, undefined, "the return receipt does not repeat the report");
  assert.match(details.reportSha256, /^[a-f0-9]{64}$/);
  assert.equal((coordinatorBody.match(/REPORT_BODY_79/g) ?? []).length, 1, "Coordinator sees the report once");
});

test("the Coordinator view keeps a worker's selected-result call but not its unselected narration", async () => {
  let coordinatorBody;
  await fixture(
    async (n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt." } }];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        const ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
        return [
          { name: "freeflow_project", args: { operation: "add", refs: [ref] } },
          { name: "freeflow_return", args: { operation: "submit", report: "Read.", outcome: "completed" } },
        ];
      }
      coordinatorBody = JSON.stringify(body);
      return [];
    },
    true,
    undefined,
    true,
    { response: (n, calls) => response(n, calls, n === 2 ? "WORKER_NARRATION_83" : "fixture response") },
  );
  assert.match(coordinatorBody, /evidence\.txt/, "the selected result's call envelope remains");
  assert.doesNotMatch(coordinatorBody, /WORKER_NARRATION_83/, "unselected worker narration is not delivered");
});
