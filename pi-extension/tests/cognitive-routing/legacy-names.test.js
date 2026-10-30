import assert from "node:assert/strict";
import test from "node:test";
import { isTaskEvidence, Sources } from "../../dist/cognitive-routing/sources.js";
import { initialState } from "../../dist/cognitive-routing/state.js";
import { routingToolName } from "../../dist/cognitive-routing/types.js";

// Sessions saved before the freeflow_ prefix was dropped hold the old tool names in their history.

const entry = (id, parentId, message) => ({ id, parentId, type: "message", message });
const call = (id, name, args) => ({ role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] });
const result = (id, toolName, text) => ({
  role: "toolResult",
  toolCallId: id,
  toolName,
  content: [{ type: "text", text }],
});

test("old routing names map to the current ones", () => {
  assert.equal(routingToolName("freeflow_delegate"), "delegate_work");
  assert.equal(routingToolName("freeflow_return"), "return_work");
  assert.equal(routingToolName("freeflow_unit"), "routing_unit");
  assert.equal(routingToolName("freeflow_project"), "select_evidence");
  assert.equal(routingToolName("read"), "read");
});

test("a saved return receipt and evidence selection under the old names are still recognized", () => {
  const receipt = JSON.stringify({ reportSaved: true, reportSha256: "a".repeat(64), handoff: "h1" });
  const entries = [
    entry("e1", null, call("c1", "freeflow_return", { operation: "submit", report: "done" })),
    entry("e2", "e1", result("c1", "freeflow_return", receipt)),
    entry("e3", "e2", call("c2", "freeflow_project", { operation: "inspect" })),
    entry("e4", "e3", result("c2", "freeflow_project", "{}")),
    entry("e5", "e4", call("c3", "read", { path: "a.txt" })),
    entry("e6", "e5", result("c3", "read", "text")),
  ];
  const sources = new Sources(entries, initialState());
  const at = (id) => sources.byRef.get(`ctx:${id}`);
  assert.equal(at("e2").reportHandoff, "h1");
  assert.equal(isTaskEvidence(at("e2")), false);
  assert.equal(isTaskEvidence(at("e4")), false);
  assert.equal(isTaskEvidence(at("e6")), true);
});
