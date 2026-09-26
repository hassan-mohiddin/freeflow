import assert from "node:assert/strict";
import test from "node:test";
import { Sources, tagProjectedMessages } from "../../dist/session-sources/sources.js";
import { initialState } from "../../dist/cognitive-routing-v2/state.js";

const user = (text) => ({ role: "user", content: [{ type: "text", text }], timestamp: 1 });
function branchOf(messages) {
  let parent = null;
  return messages.map((message, i) => {
    const entry = { type: "message", id: `e${i}`, parentId: parent, message };
    parent = entry.id;
    return entry;
  });
}
const projectionOf = (branch) => ({
  entries: branch.map((entry) => ({ sourceEntry: entry, messages: entry.type === "message" ? [entry.message] : [] })),
});
// Counts canonical-JSON traversal; tagged messages must never be traversed for hashing.
function counted(message, counter) {
  return new Proxy(structuredClone(message), {
    ownKeys(target) {
      counter.n++;
      return Reflect.ownKeys(target);
    },
  });
}

test("projected messages associate by entry identity without hashing", () => {
  const branch = branchOf([user("same"), user("same"), user("other")]);
  const sources = new Sources(branch, initialState());
  const counter = { n: 0 };
  const incoming = branch.map((entry) => counted(entry.message, counter));
  tagProjectedMessages(incoming, projectionOf(branch), branch);
  const items = sources.associate(incoming);
  assert.deepEqual(
    items.map((item) => item.source?.entry.id),
    ["e0", "e1", "e2"],
    "identical bodies resolve to their exact entries",
  );
  assert.equal(counter.n, 0, "tagged messages are not hashed");
  assert.equal(sources.ambiguous.size, 0);
});

test("untagged, edited, or misaligned messages keep content association", () => {
  const branch = branchOf([user("one"), user("two")]);
  const edited = [...branch, { type: "context_edit", id: "x", parentId: "e1", targetId: "e1", replacement: null }];
  const sources = new Sources(branch, initialState());
  const incoming = branch.map((entry) => structuredClone(entry.message));
  tagProjectedMessages(incoming, projectionOf(branch), edited);
  assert.deepEqual(
    sources.associate(incoming).map((item) => item.source?.entry.id),
    ["e0", "e1"],
    "an edited target falls back to exact content association",
  );
  const shifted = [user("injected"), ...branch.map((entry) => structuredClone(entry.message))];
  tagProjectedMessages(shifted, projectionOf(branch), branch);
  const fresh = new Sources(branch, initialState());
  assert.deepEqual(
    fresh.associate(shifted).map((item) => item.source?.entry.id),
    [undefined, "e0", "e1"],
    "a misaligned projection is not trusted",
  );
});
