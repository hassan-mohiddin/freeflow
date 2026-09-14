import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";
import { Sources } from "../../dist/session-sources/sources.js";
import { initialState } from "../../dist/cognitive-routing-v2/state.js";
import { prepareView, changeSelection } from "../../dist/cognitive-routing-v2/projection.js";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";

const call = (name, args) => [{ name, args }];
const receipt = (m, name) =>
  m
    .getBranch()
    .filter((e) => e.message?.toolName === name)
    .at(-1).message.details;
const model = {
  id: "receiver",
  provider: "fixture",
  api: "fixture",
  input: ["text"],
  contextWindow: 100000,
  maxTokens: 1000,
};
const assistant = (text, calls = []) => ({
  role: "assistant",
  content: [{ type: "text", text }, ...calls],
  model: "receiver",
  provider: "fixture",
  api: "fixture",
  timestamp: 1,
  stopReason: calls.length ? "toolUse" : "stop",
});
const entry = (id, parentId, message) => ({ type: "message", id, parentId, message });
function prepare(state, entries, messages = entries.map((e) => e.message), view = "executor") {
  return prepareView({
    state,
    sources: new Sources(entries, state),
    messages,
    view,
    projection: true,
    model,
    pair: { provider: "fixture", modelId: "receiver", thinking: "off" },
    systemPrompt: "",
    tools: [],
    runtimeMessage: RoutingRuntime.prototype.runtimeMessage.call(
      { projectionEnabled: true, token: "test", evidenceFacts: () => ({ selected: [] }) },
      state,
    ),
    instance: "test",
  });
}

test("source locators retain native occurrence identity and accept optional adapter labels", () => {
  const state = initialState();
  const assistantWith = (id, name, args) =>
    entry(id, null, assistant("Observed", [{ type: "toolCall", id, name, arguments: args }]));
  const result = (id, toolName) =>
    entry(`${id}-result`, id, {
      role: "toolResult",
      toolCallId: id,
      toolName,
      content: [{ type: "text", text: "RESULT_BODY" }],
    });
  const entries = [
    assistantWith("read-1", "read", { path: "same.txt", offset: 1, limit: 20 }),
    result("read-1", "read"),
    assistantWith("read-2", "read", { path: "same.txt", offset: 1, limit: 20 }),
    result("read-2", "read"),
    assistantWith("bash-1", "bash", { command: `printf "bad${String.fromCharCode(0)}${"x".repeat(220)}"` }),
    result("bash-1", "bash"),
    assistantWith("unknown-1", "write", { path: "out.txt" }),
    result("unknown-1", "write"),
    entry(
      "ambiguous",
      null,
      assistant("Ambiguous", [
        { type: "toolCall", id: "dup", name: "read", arguments: { path: "one.txt" } },
        { type: "toolCall", id: "dup", name: "read", arguments: { path: "two.txt" } },
      ]),
    ),
    entry("ambiguous-result", "ambiguous", {
      role: "toolResult",
      toolCallId: "dup",
      toolName: "read",
      content: [{ type: "text", text: "RESULT_BODY" }],
    }),
  ];
  for (const source of entries)
    state.authors.set(source.id, { profile: "executor", executionId: "e", assignmentId: "a" });
  const sources = new Sources(entries, state);
  assert.deepEqual(sources.locator("ctx:read-1-result"), {
    callRef: "ctx:read-1",
    toolCallId: "read-1",
  });
  assert.notEqual(sources.locator("ctx:read-1-result").callRef, sources.locator("ctx:read-2-result").callRef);
  assert.deepEqual(sources.locator("ctx:bash-1-result"), {
    callRef: "ctx:bash-1",
    toolCallId: "bash-1",
  });
  assert.deepEqual(sources.locator("ctx:unknown-1-result"), {
    callRef: "ctx:unknown-1",
    toolCallId: "unknown-1",
  });
  assert.equal(sources.locator("ctx:ambiguous-result"), undefined);

  const adapted = new Sources(entries, state, undefined, () => ({
    label: `adapter${String.fromCharCode(0)}${"x".repeat(220)}`,
  }));
  const adaptedLocator = adapted.locator("ctx:bash-1-result");
  assert.equal(adaptedLocator.truncated, true);
  assert.ok(adaptedLocator.label.length <= 160);
  assert.doesNotMatch(adaptedLocator.label, /\u0000/);
});

test("registered projection accepts a known eligible ref without inspection first", async () => {
  await fixture((n, _body, manager) => {
    if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Read evidence and return." });
    if (n === 2) return call("read", { path: "evidence.txt" });
    if (n === 3) {
      const ref = `ctx:${manager.getBranch().find((e) => e.message?.toolName === "read").id}`;
      return call("freeflow_project", { operation: "add", refs: [ref] });
    }
    if (n === 4) {
      const projects = manager.getBranch().filter((e) => e.message?.toolName === "freeflow_project");
      assert.equal(projects.length, 1);
      assert.deepEqual(
        projects[0].message.details.items.map((item) => item.status),
        ["added"],
      );
      assert.equal(projects[0].message.details.selected.length, 1);
      return [
        { name: "freeflow_return", args: { operation: "submit", report: "Evidence ready.", outcome: "completed" } },
      ];
    }
    return [];
  });
});

test("provenance covers old sources and complete exchanges, with stable prefixes and unchanged originals", () => {
  const state = initialState();
  const entries = Array.from({ length: 40 }, (_, i) =>
    entry(`m${i}`, i ? `m${i - 1}` : null, assistant(`Observation ${i}`)),
  );
  for (const [i, e] of entries.entries())
    state.authors.set(e.id, {
      profile: i % 2 ? "executor" : "coordinator",
      assignmentId: i % 2 ? "earlier-assignment" : undefined,
    });
  entries.push(entry("unknown", "m39", assistant("Imported observation")));
  entries.push(
    entry(
      "calls",
      "unknown",
      assistant("Read observations", [{ type: "toolCall", id: "c", name: "read", arguments: { path: "x" } }]),
    ),
  );
  entries.push(
    entry("result", "calls", {
      role: "toolResult",
      toolCallId: "c",
      toolName: "read",
      content: [{ type: "text", text: "FULL_RESULT" }],
    }),
  );
  state.authors.set("calls", { profile: "executor", assignmentId: "current" });
  state.authors.set("result", { profile: "executor", assignmentId: "current" });
  const before = JSON.stringify(entries);
  const prepared = prepare(state, entries);
  const annotations = prepared.messages.filter((m) => m.customType === "freeflow-routing-v2-refs");
  for (let i = 0; i < 40; i++)
    assert.ok(
      annotations.some((m) => m.content.includes(`ctx:m${i} | producer: ${i % 2 ? "executor" : "coordinator"}`)),
    );
  assert.ok(annotations.some((m) => m.content.includes("ctx:unknown | producer: unknown/common")));
  const callIndex = prepared.messages.findIndex((m) => m.role === "assistant" && m.content.some((b) => b.id === "c"));
  assert.equal(prepared.messages[callIndex + 1].toolCallId, "c", "no annotation splits a call/result exchange");
  assert.match(prepared.messages[callIndex - 1].content, /ctx:result.*producer: executor/);
  const extended = prepare(state, [...entries, entry("later", "result", assistant("Later observation"))]);
  assert.deepEqual(
    extended.messages.slice(0, prepared.messages.length - 1),
    prepared.messages.slice(0, -1),
    "appends leave old provenance stable",
  );
  assert.equal(JSON.stringify(entries), before);
});

test("new control selections are rejected while old selections and mixed assistant text remain usable", () => {
  const state = initialState();
  const entries = [
    entry(
      "control",
      null,
      assistant("Substantive executor finding", [
        { type: "toolCall", id: "c", name: "freeflow_project", arguments: { operation: "inspect" } },
      ]),
    ),
    entry("receipt", "control", {
      role: "toolResult",
      toolCallId: "c",
      toolName: "freeflow_project",
      content: [{ type: "text", text: '{"status":"unchanged"}' }],
    }),
  ];
  for (const e of entries) state.authors.set(e.id, { profile: "executor", assignmentId: "a" });
  const sources = new Sources(entries, state);
  for (const s of sources.byRef.values()) state.exposure.set(s.ref, s.hash);
  const empty = { revision: 0, selected: [], unresolved: [], withdrawals: [] };
  const attempted = changeSelection(
    empty,
    { operation: "add", refs: ["ctx:control", "ctx:receipt", "ctx:control#text"] },
    sources,
    state,
  );
  assert.deepEqual(attempted.selected, ["ctx:control#text"]);
  assert.deepEqual(
    attempted.unresolved.map((p) => p.code),
    ["routing_source", "routing_source"],
  );
  assert.deepEqual(
    attempted.unresolved.map((p) => p.detail),
    [
      "Routing control messages are not task evidence. Use ctx:control#text if its visible assistant text is the intended evidence.",
      "Routing control receipts are not task evidence; saved communication is delivered separately.",
    ],
  );
  const prior = { ...empty, revision: 1, selected: ["ctx:receipt"] };
  assert.equal(changeSelection(prior, { operation: "add", refs: ["ctx:receipt"] }, sources, state), prior);
  state.assignmentId = "a";
  state.selections.set("a", attempted);
  const projected = prepare(
    state,
    entries,
    entries.map((e) => e.message),
    "coordinator",
  );
  assert.ok(
    projected.messages.some(
      (m) => m.customType === "freeflow-routing-v2-refs" && m.content.includes("ctx:control#text | producer: executor"),
    ),
  );
  assert.ok(projected.messages.some((m) => m.customType === "freeflow-assistant-text"));
  state.selections.set("a", prior);
  assert.ok(
    prepare(
      state,
      entries,
      entries.map((e) => e.message),
      "coordinator",
    ).messages.some((m) => m.toolName === "freeflow_project"),
  );
});

test("restoration preserves full report metadata and deduplicates by accepted occurrence", () => {
  const state = initialState();
  state.profile = "coordinator";
  state.assignmentId = "a";
  state.assignments.set("a", { id: "a", state: "returned", contract: "CONTRACT", delegateHandoffId: "d" });
  state.handoffs.set("d", { id: "d", kind: "delegate", toolCallId: "dc" });
  const h = {
    id: "h",
    assignmentId: "a",
    kind: "return",
    state: "configured",
    toolCallId: "rc",
    text: "SAME_REPORT",
    outcome: "partial",
    limitations: ["UNRUN_INTEGRATION"],
    reportRevision: 2,
  };
  state.handoffs.set("h", h);
  state.assessment = { handoffId: "h", view: "active", problems: [] };
  const restored = JSON.stringify(prepare(state, [], [], "coordinator").messages);
  for (const value of ["SAME_REPORT", "UNRUN_INTEGRATION", "partial", "report:h:2", "assignment:a"])
    assert.ok(restored.includes(value));
  const old = {
    role: "toolResult",
    toolName: "freeflow_return",
    toolCallId: "other",
    content: [{ type: "text", text: JSON.stringify({ report: h.text, outcome: "completed", limitations: [] }) }],
  };
  const oldResult = prepare(state, [], [old], "coordinator");
  assert.ok(
    oldResult.messages.some(
      (m) => m.customType === "freeflow-routing-communication" && m.content.includes("SAME_REPORT"),
    ),
    "equal text from another call cannot satisfy current report",
  );
  const incomplete = { ...old, toolCallId: "rc" };
  const corrected = prepare(state, [], [incomplete], "coordinator");
  assert.equal(JSON.stringify(corrected.messages).split("SAME_REPORT").length - 1, 1);
  assert.ok(JSON.stringify(corrected.messages).includes("UNRUN_INTEGRATION"));
});

for (const projection of [false, true])
  test(`native report arrives complete without inspection and survives close, projection ${projection}`, async () => {
    await fixture((n, body, m) => {
      if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Return a partial report." });
      if (n === 2)
        return call("freeflow_return", {
          operation: "submit",
          report: "REPORT_DIRECT_91",
          outcome: "partial",
          limitations: ["LIMIT_DIRECT_92"],
        });
      if (n === 3) {
        const r = receipt(m, "freeflow_return");
        assert.equal(r.outcome, "partial");
        assert.deepEqual(r.limitations, ["LIMIT_DIRECT_92"]);
        assert.match(r.assignmentRef, /^assignment:/);
        assert.match(r.reportRef, /^report:.*:1$/);
        for (const text of ["REPORT_DIRECT_91", "LIMIT_DIRECT_92", r.reportRef])
          assert.ok(JSON.stringify(body).includes(text));
        return call("freeflow_unit", {
          operation: "close",
          outcome: "deferred",
          assessment: "Partial result acknowledged.",
        });
      }
      if (n === 4)
        for (const text of ["REPORT_DIRECT_91", "LIMIT_DIRECT_92"]) assert.ok(JSON.stringify(body).includes(text));
      return [];
    }, projection);
  });

test("native inspection snapshots distinguish page/scope totals, exclude controls and explain invalid work refs", async () => {
  let first;
  await fixture((n, body, m) => {
    if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Read observations." });
    if (n === 2) return Array.from({ length: 35 }, () => ({ name: "read", args: { path: "evidence.txt" } }));
    if (n === 3) return call("freeflow_project", { operation: "inspect", scope: "history" });
    if (n === 4) {
      first = receipt(m, "freeflow_project");
      assert.equal(first.pageCounts.candidates, 30);
      assert.ok(first.scopeCounts.candidates > 30);
      assert.equal(first.scopeCounts.eligible, first.scopeCounts.candidates);
      assert.ok(first.candidates.every((c) => c.producer === "executor" && !c.toolName?.startsWith("freeflow_")));
      return call("freeflow_project", { operation: "inspect", scope: "history", cursor: first.nextCursor });
    }
    if (n === 5) {
      const second = receipt(m, "freeflow_project");
      assert.deepEqual(second.scopeCounts, first.scopeCounts);
      assert.equal(
        new Set([...first.candidates, ...second.candidates].map((c) => c.ref)).size,
        first.scopeCounts.candidates,
      );
      return call("freeflow_return", { operation: "submit", report: "Done", outcome: "completed" });
    }
    if (n === 6)
      return call("freeflow_unit", {
        operation: "inspect",
        view: "detail",
        ref: receipt(m, "freeflow_return").handoff,
      });
    if (n === 7) {
      assert.equal(receipt(m, "freeflow_unit").code, "invalid_work_ref");
      return call("freeflow_unit", {
        operation: "inspect",
        view: "detail",
        ref: receipt(m, "freeflow_return").assignmentRef,
      });
    }
    if (n === 8) {
      assert.equal(receipt(m, "freeflow_unit").report, "Done");
      return call("freeflow_unit", { operation: "close", outcome: "accepted", assessment: "Read work assessed." });
    }
    return [];
  });
});

test("native compaction restores report limitations and revision into the same assessment", async () => {
  let saved;
  await fixture(
    (n, body, m) => {
      if (n === 1)
        return call("freeflow_delegate", { operation: "assign", contract: "Return a report for assessment." });
      if (n === 2)
        return call("freeflow_return", {
          operation: "submit",
          report: "COMPACT_REPORT_61",
          outcome: "partial",
          limitations: ["COMPACT_LIMIT_62"],
        });
      if (n === 3) {
        saved = receipt(m, "freeflow_return");
        return [];
      }
      if (n === 4) return call("freeflow_unit", { operation: "assess" });
      if (n === 5) {
        const wire = JSON.stringify(body);
        for (const value of ["COMPACT_REPORT_61", "COMPACT_LIMIT_62", "partial", saved.assignmentRef, saved.reportRef])
          assert.ok(wire.includes(value), value);
      }
      return [];
    },
    true,
    async ({ session }) => {
      await session.compact();
      await session.prompt("Resume assessment of the existing saved report.");
      await session.waitForIdle();
    },
  );
});

test("native retry delivers the unchanged complete report without a follow-up inspect", async () => {
  let saved;
  await fixture((n, body, m) => {
    if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Return available findings." });
    if (n === 2) return call("freeflow_project", { operation: "add", refs: ["ctx:unavailable"] });
    if (n === 3)
      return call("freeflow_return", {
        operation: "submit",
        report: "RETRY_REPORT_11",
        outcome: "partial",
        limitations: ["RETRY_LIMIT_12"],
      });
    if (n === 4) {
      saved = receipt(m, "freeflow_return");
      assert.equal(saved.ready, false);
      return call("freeflow_project", {
        operation: "remove",
        refs: ["ctx:unavailable"],
        reason: "Original capture unavailable; retain limitation.",
      });
    }
    if (n === 5) return call("freeflow_return", { operation: "retry" });
    if (n === 6) {
      const retried = receipt(m, "freeflow_return");
      for (const key of ["report", "reportRef", "reportRevision", "assignmentRef", "outcome", "limitations"])
        assert.deepEqual(retried[key], saved[key]);
      assert.equal(retried.reportUnchanged, true);
      for (const value of ["RETRY_REPORT_11", "RETRY_LIMIT_12", saved.reportRef])
        assert.ok(JSON.stringify(body).includes(value));
      return call("freeflow_unit", { operation: "close", outcome: "deferred", assessment: "Partial report assessed." });
    }
    return [];
  });
});

test("empty new assignment advertises earlier evidence and selected receipts retain its producer", async () => {
  let ref, oldAssignment;
  await fixture((n, body, m) => {
    if (n === 1 || n === 5)
      return call("freeflow_delegate", {
        operation: "assign",
        contract: n === 1 ? "Read an observation." : "Reuse the earlier observation.",
      });
    if (n === 2) return call("read", { path: "evidence.txt" });
    if (n === 3) {
      ref = `ctx:${m.getBranch().find((e) => e.message?.toolName === "read").id}`;
      return call("freeflow_return", { operation: "submit", report: "Observation captured.", outcome: "completed" });
    }
    if (n === 4)
      return call("freeflow_unit", { operation: "close", outcome: "accepted", assessment: "Supported result." });
    if (n === 6) return call("freeflow_project", { operation: "inspect" });
    if (n === 7) {
      const r = receipt(m, "freeflow_project");
      assert.equal(r.count, 0);
      assert.ok(r.otherAssignments > 0);
      assert.match(r.historyHint, /scope history/);
      return call("freeflow_project", { operation: "inspect", scope: "history" });
    }
    if (n === 8) {
      const candidate = receipt(m, "freeflow_project").candidates.find((c) => c.ref === ref);
      assert.equal(candidate.producer, "executor");
      assert.equal(candidate.eligible, true);
      oldAssignment = candidate.assignment;
      return call("freeflow_project", { operation: "add", refs: [ref] });
    }
    if (n === 9) {
      const selected = receipt(m, "freeflow_project").evidence.selected[0];
      assert.equal(selected.producer, "executor");
      assert.equal(selected.assignment, oldAssignment);
      return call("freeflow_return", {
        operation: "submit",
        report: "Earlier evidence selected.",
        outcome: "completed",
      });
    }
    if (n === 10) {
      const wire = JSON.stringify(body);
      assert.ok(wire.includes(`${ref} | producer: executor`));
      assert.ok(wire.includes("EXACT_EVIDENCE_BODY_81"));
      return call("freeflow_unit", { operation: "inspect", view: "detail", ref: "assignment:absent" });
    }
    if (n === 11) {
      assert.equal(receipt(m, "freeflow_unit").code, "work_unavailable");
      return call("freeflow_unit", { operation: "close", outcome: "accepted", assessment: "Supported result." });
    }
    return [];
  });
});

test("normal inspection hides delivery gaps while selected inspection preserves their diagnostics", async () => {
  let ref;
  const result = await fixture(
    (n, body, m) => {
      if (n === 1) return call("freeflow_delegate", { operation: "assign", contract: "Read and inspect evidence." });
      if (n === 2) return call("read", { path: "evidence.txt" });
      if (n === 3) {
        ref = `ctx:${m.getBranch().find((e) => e.message?.content?.some?.((b) => b.type === "toolCall" && b.name === "read")).id}`;
        return call("freeflow_project", { operation: "inspect", scope: "assignment" });
      }
      if ([4, 5, 6].includes(n)) {
        const r = receipt(m, "freeflow_project");
        assert.ok(r.candidates.every((c) => c.eligible && c.targetReady));
        assert.ok(r.candidates.every((c) => !Object.hasOwn(c, "preview")));
        assert.ok(!JSON.stringify(r).includes("EXACT_EVIDENCE_BODY_81"), "inspection does not repeat source text");
        assert.equal(
          r.candidates.find((c) => c.ref === ref),
          undefined,
          "incompatible whole message is not a candidate",
        );
        assert.ok(
          r.candidates.some((c) => c.ref === `${ref}#text`),
          "usable visible text remains offered",
        );
        assert.equal(r.scopeCounts.candidates, r.scopeCounts.targetReady);
        assert.equal(r.pageCounts.candidates, r.pageCounts.targetReady);
        if (n === 4) return call("freeflow_project", { operation: "inspect", scope: "active" });
        if (n === 5) return call("freeflow_project", { operation: "inspect", scope: "history" });
        return call("freeflow_project", { operation: "add", refs: [ref] });
      }
      if (n === 7) {
        const r = receipt(m, "freeflow_project");
        assert.equal(r.ready, false);
        assert.ok(r.problems.some((p) => p.code === "target_representation"));
        return call("freeflow_project", { operation: "inspect", scope: "selected" });
      }
      if (n === 8) {
        const r = receipt(m, "freeflow_project");
        assert.deepEqual(r.selected, [ref]);
        const selected = r.candidates.find((c) => c.ref === ref);
        assert.equal(Object.hasOwn(selected, "preview"), false);
        assert.equal(selected.targetReady, false);
        assert.ok(selected.limitations.some((p) => p.code === "target_representation"));
        assert.equal(r.scopeCounts.candidates, 1);
        assert.equal(r.scopeCounts.targetReady, 0);
      }
      return [];
    },
    true,
    undefined,
    true,
    {
      extensions: [
        (pi) =>
          pi.on("message_end", (e) => {
            if (
              e.message.role === "assistant" &&
              e.message.content.some((b) => b.type === "toolCall" && b.name === "read")
            )
              return {
                message: {
                  ...e.message,
                  content: [
                    ...e.message.content,
                    {
                      type: "thinking",
                      thinking: "Fixture signed reasoning",
                      thinkingSignature: JSON.stringify({
                        type: "reasoning",
                        id: "rs_candidate",
                        summary: [{ type: "summary_text", text: "Fixture signed reasoning" }],
                      }),
                    },
                  ],
                },
              };
          }),
      ],
    },
  );
  assert.deepEqual(
    [...result.state.selections.values()].at(-1).selected,
    [ref],
    "inspection does not silently withdraw evidence",
  );
});
