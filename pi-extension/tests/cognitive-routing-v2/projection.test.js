import assert from "node:assert/strict";
import test from "node:test";
import { Sources } from "../../dist/session-sources/sources.js";
import { initialState } from "../../dist/cognitive-routing-v2/state.js";
import { prepareView } from "../../dist/cognitive-routing-v2/projection.js";
import { fixture } from "../fixtures/routing-native.js";

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
function project(entries, refs, messages = entries.map((e) => e.message)) {
  const state = initialState();
  state.assignmentId = "a";
  state.selections.set("a", { revision: 1, selected: refs, unresolved: [], withdrawals: [] });
  for (const e of entries) state.authors.set(e.id, { profile: "executor", executionId: "x", assignmentId: "a" });
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
