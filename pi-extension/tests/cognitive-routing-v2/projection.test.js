import assert from "node:assert/strict";
import test from "node:test";
import { Sources } from "../../dist/session-sources/sources.js";
import { initialState } from "../../dist/cognitive-routing-v2/state.js";
import { prepareView } from "../../dist/cognitive-routing-v2/projection.js";
import { fixture } from "../fixtures/routing-native.js";

test(
  "native projection receipts distinguish duplicate additions from actual removals",
  { timeout: 30000 },
  async () => {
    let ref;
    await fixture((n, _body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence and return." } }];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
        return [{ name: "freeflow_project", args: { operation: "add", refs: [ref] } }];
      }
      if (n === 4) return [{ name: "freeflow_project", args: { operation: "add", refs: [ref, ref] } }];
      if (n === 5) {
        const details = manager
          .getBranch()
          .filter((e) => e.message?.toolName === "freeflow_project")
          .at(-1).message.details;
        assert.deepEqual(details.selected, [ref]);
        assert.deepEqual(details.items, [{ ref, status: "already_selected" }]);
        return [
          {
            name: "freeflow_project",
            args: { operation: "remove", refs: [ref], reason: "Deliberate fixture withdrawal" },
          },
        ];
      }
      if (n === 6) {
        const details = manager
          .getBranch()
          .filter((e) => e.message?.toolName === "freeflow_project")
          .at(-1).message.details;
        assert.deepEqual(details.selected, []);
        assert.deepEqual(details.items, [{ ref, status: "removed" }]);
        return [
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Fixture complete; evidence withdrawn.", outcome: "partial" },
          },
        ];
      }
      return [];
    });
  },
);

const model = {
  id: "receiver",
  provider: "fixture",
  api: "fixture",
  input: ["text"],
  contextWindow: 100000,
  maxTokens: 1000,
};
const assistant = (content) => ({
  role: "assistant",
  content,
  model: "producer",
  provider: "fixture",
  api: "fixture",
  stopReason: "toolUse",
  timestamp: 1,
});
const entry = (id, parentId, message) => ({ type: "message", id, parentId, message });
function project(entries, refs, messages = entries.map((e) => e.message), producers = {}) {
  const state = initialState();
  state.assignmentId = "a";
  state.selections.set("a", { revision: 1, selected: refs, unresolved: [], withdrawals: [] });
  for (const e of entries)
    state.authors.set(e.id, { profile: producers[e.id] ?? "executor", executionId: "x", assignmentId: "a" });
  const sources = new Sources(entries, state);
  for (const s of sources.byRef.values()) state.exposure.set(s.ref, s.hash);
  return prepareView({
    messages,
    sources,
    state,
    view: "coordinator",
    projection: true,
    model,
    pair: { provider: "fixture", modelId: "receiver", thinking: "off" },
    systemPrompt: "",
    tools: [],
    runtimeMessage: { role: "custom", content: "state" },
    instance: "test",
  });
}
for (const thinking of [
  { type: "thinking", thinking: "summary", thinkingSignature: "opaque" },
  { type: "thinking", thinking: "", redacted: true },
]) {
  test(`text result survives a structural ${thinking.redacted ? "redacted" : "signed"} carrier`, () => {
    const a = assistant([thinking, { type: "toolCall", id: "call", name: "read", arguments: { path: "x" } }]);
    const r = {
      role: "toolResult",
      toolCallId: "call",
      toolName: "read",
      content: [{ type: "text", text: "EXACT_RESULT" }],
      timestamp: 2,
    };
    const entries = [entry("a", null, a), entry("r", "a", r)];
    const prepared = project(entries, ["ctx:r"]);
    assert.equal(prepared.ready, true, JSON.stringify(prepared.problems));
    assert.deepEqual(
      prepared.messages.find((m) => m.role === "toolResult"),
      r,
    );
    assert.deepEqual(entries[0].message, a);
    assert.equal(project(entries, ["ctx:a"]).ready, false, "explicit signed evidence remains unqualified");
  });
}
const call = (id) => ({ type: "toolCall", id, name: "read", arguments: { path: id } });
const result = (id, timestamp) => ({
  role: "toolResult",
  toolCallId: id,
  toolName: "read",
  content: [{ type: "text", text: `RESULT_${id}` }],
  timestamp,
});

test("a structural worker envelope carries only its calls, not the worker's reasoning or narration", () => {
  const a = assistant([
    { type: "thinking", thinking: "**Planning the read**" },
    { type: "text", text: "Reading the file now." },
    call("c1"),
  ]);
  const entries = [entry("a", null, a), entry("r", "a", result("c1", 2))];
  const prepared = project(entries, ["ctx:r"]);
  assert.equal(prepared.ready, true, JSON.stringify(prepared.problems));
  assert.deepEqual(prepared.messages.find((m) => m.role === "assistant").content, [call("c1")]);
  assert.deepEqual(entries[0].message, a, "canonical history is not modified");
});

test("a fully selected worker message keeps its reasoning", () => {
  const a = assistant([{ type: "thinking", thinking: "**Planning the read**" }, call("c1")]);
  const entries = [entry("a", null, a), entry("r", "a", result("c1", 2))];
  const prepared = project(entries, ["ctx:a", "ctx:r"]);
  assert.deepEqual(prepared.messages.find((m) => m.role === "assistant").content, a.content);
});

test("a completed worker run in the Coordinator view carries one provenance note with every row", () => {
  const entries = [];
  let parent = null;
  for (const id of ["c1", "c2", "c3"]) {
    entries.push(entry(`a${id}`, parent, assistant([call(id)])), entry(`r${id}`, `a${id}`, result(id, 2)));
    parent = `r${id}`;
  }
  const prepared = project(entries, ["ctx:rc1", "ctx:rc2", "ctx:rc3"]);
  const notes = prepared.messages.filter((m) => m.customType === "freeflow-routing-v2-refs");
  assert.equal(notes.length, 1);
  for (const id of ["ac1", "rc1", "ac2", "rc2", "ac3", "rc3"])
    assert.match(notes[0].content, new RegExp(`ctx:${id} \\|`));
  // The note follows the whole run.
  const lastResult = prepared.messages.findLastIndex((m) => m.role === "toolResult");
  assert.equal(prepared.messages.indexOf(notes[0]), lastResult + 1);
});

test("a later Coordinator view extends an earlier one, including a run the Coordinator interrupted", () => {
  const entries = [];
  let parent = null;
  const add = (id, message) => {
    entries.push(entry(id, parent, message));
    parent = id;
  };
  add("a1", assistant([call("c1")]));
  add("r1", result("c1", 2));
  add("a2", assistant([call("c2")]));
  add("r2", result("c2", 3));
  const interruption = assistant([{ type: "text", text: "Coordinator attention" }]);
  interruption.stopReason = "stop";
  add("m", interruption);
  const refs = ["ctx:r1", "ctx:r2", "ctx:r3"],
    producers = { m: "coordinator" };
  const earlier = project([...entries], refs, undefined, producers);
  add("a3", assistant([call("c3")]));
  add("r3", result("c3", 4));
  const later = project(entries, refs, undefined, producers);
  // Everything but the per-request runtime message is an exact prefix of the later view.
  const sent = earlier.messages.slice(0, -1);
  assert.deepEqual(later.messages.slice(0, sent.length), sent);
});

test("resuming an assessment after an attention view extends the Coordinator's sent prefix", () => {
  // Selected worker evidence was compacted out of the active context before the Coordinator's attention turn.
  const later = (text, t) => ({ role: "user", content: [{ type: "text", text }], timestamp: t });
  const all = [
    entry("w", null, assistant([call("c1")])),
    entry("r", "w", result("c1", 2)),
    entry("u1", "r", later("new user input", 3)),
    entry("u2", "u1", later("continue", 4)),
  ];
  const producers = { u1: "coordinator", u2: "coordinator" };
  const view = (entries, assessmentView, resumedAt) => {
    const state = initialState();
    state.assignmentId = "a";
    state.assessment = { handoffId: "h", assignmentId: "a", view: assessmentView, problems: [] };
    state.selections.set("a", { revision: 1, selected: ["ctx:r"], unresolved: [], withdrawals: [] });
    for (const e of entries)
      state.authors.set(e.id, { profile: producers[e.id] ?? "executor", executionId: "x", assignmentId: "a" });
    const sources = new Sources(entries, state);
    for (const s of sources.byRef.values()) state.exposure.set(s.ref, s.hash);
    return prepareView({
      messages: entries.slice(2).map((e) => e.message),
      sources,
      state,
      view: "coordinator",
      projection: true,
      model,
      pair: { provider: "fixture", modelId: "receiver", thinking: "off" },
      systemPrompt: "",
      tools: [],
      runtimeMessage: { role: "custom", content: "state" },
      instance: "test",
      resumedAt,
    });
  };
  const attention = view(all.slice(0, 3), "suspended").messages.slice(0, -1);
  // The assessment resumed after the attention turn, before "continue" (source rank 3).
  const resumed = view(all, "active", 3);
  assert.equal(resumed.ready, true, JSON.stringify(resumed.problems));
  assert.deepEqual(resumed.messages.slice(0, attention.length), attention);
  // The evidence is still delivered in full, after what the Coordinator already saw.
  const evidence = resumed.messages.findIndex((m) => m.role === "toolResult");
  assert.ok(evidence >= attention.length);
  assert.match(JSON.stringify(resumed.messages[evidence]), /RESULT_c1/);
});

test("without a resume, compacted evidence keeps its native position", () => {
  const later = (text, t) => ({ role: "user", content: [{ type: "text", text }], timestamp: t });
  const entries = [
    entry("w", null, assistant([call("c1")])),
    entry("r", "w", result("c1", 2)),
    entry("u1", "r", later("next", 3)),
  ];
  const prepared = project(entries, ["ctx:r"], [entries[2].message], { u1: "coordinator" });
  assert.equal(
    prepared.messages.findIndex((m) => m.role === "toolResult"),
    1,
  );
});

test("duplicate native occurrences are associated once in native order", () => {
  const body = assistant([{ type: "text", text: "IDENTICAL" }]);
  body.stopReason = "stop";
  const entries = [entry("one", null, body), entry("two", "one", structuredClone(body))];
  const result = project(
    entries,
    ["ctx:one"],
    entries.map((e) => structuredClone(e.message)),
  );
  assert.equal(result.ready, true);
  assert.equal(result.messages.filter((m) => m.role === "assistant").length, 1);
});
test("ambiguous selected occurrence is a gap, not opaque duplicates plus materialization", () => {
  const body = assistant([{ type: "text", text: "IDENTICAL" }]);
  body.stopReason = "stop";
  const result = project(
    [entry("one", null, body), entry("two", "one", structuredClone(body))],
    ["ctx:one"],
    [structuredClone(body)],
  );
  assert.equal(result.ready, false);
  assert.ok(result.problems.some((p) => p.code === "ambiguous_occurrence"));
});

test("image and failed-assistant limits remain explicit while error tool results remain evidence", () => {
  const a = assistant([{ type: "toolCall", id: "c", name: "read", arguments: {} }]);
  const result = {
    role: "toolResult",
    toolCallId: "c",
    toolName: "read",
    content: [{ type: "text", text: "actual failure" }],
    isError: true,
  };
  const entries = [entry("a", null, a), entry("r", "a", result)];
  assert.equal(project(entries, ["ctx:r"]).ready, true);
  result.content = [{ type: "image", data: "fixture", mimeType: "image/png" }];
  assert.equal(project(entries, ["ctx:r"]).ready, false);
  const failed = assistant([{ type: "text", text: "partial failure" }]);
  failed.stopReason = "error";
  assert.equal(project([entry("failed", null, failed)], ["ctx:failed"]).ready, false);
});

test(
  "native receiving request carries mechanical withdrawals even when report omits them",
  { timeout: 30000 },
  async () => {
    let ref;
    await fixture((n, body, manager) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence and return." } }];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
        return [{ name: "freeflow_project", args: { operation: "add", refs: [ref] } }];
      }
      if (n === 4)
        return [
          { name: "freeflow_project", args: { operation: "remove", refs: [ref], reason: "EVIDENCE_WITHDRAWN_177" } },
          { name: "freeflow_return", args: { operation: "submit", report: "Completed.", outcome: "completed" } },
        ];
      assert.equal(body.model, "gpt-4o");
      assert.match(JSON.stringify(body), /EVIDENCE_WITHDRAWN_177/);
      assert.doesNotMatch(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
      return [];
    });
  },
);

test(
  "native cross-model request preserves text result with signed structural carrier",
  { timeout: 30000 },
  async () => {
    await fixture(
      (n, body, manager) => {
        if (n === 1)
          return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read and select evidence." } }];
        if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
        if (n === 3)
          return [
            {
              name: "freeflow_project",
              args: {
                operation: "add",
                refs: ["ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id],
              },
            },
            { name: "freeflow_return", args: { operation: "submit", report: "Evidence ready.", outcome: "completed" } },
          ];
        assert.equal(body.model, "gpt-4o");
        assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
        return [];
      },
      true,
      undefined,
      true,
      {
        extensions: [
          (pi) =>
            pi.on("message_end", (event) => {
              if (event.message.role === "assistant" && event.message.content.some((b) => b.name === "read"))
                return {
                  message: {
                    ...event.message,
                    content: [
                      {
                        type: "thinking",
                        thinking: "fixture thinking",
                        thinkingSignature: JSON.stringify({
                          type: "reasoning",
                          id: "rs_fixture",
                          summary: [{ type: "summary_text", text: "fixture thinking" }],
                          encrypted_content: "opaque-fixture",
                        }),
                      },
                      ...event.message.content,
                    ],
                  },
                };
            }),
        ],
      },
    );
  },
);
