import assert from "node:assert/strict";
import test from "node:test";
import { Sources } from "../../dist/cognitive-routing/sources.js";
import { tagProjectedMessages } from "../../dist/host/projection-tags.js";
import { initialState } from "../../dist/cognitive-routing/state.js";

const user = (text) => ({ role: "user", content: [{ type: "text", text }], timestamp: 1 });
const assistantText = (text) => ({ role: "assistant", content: [{ type: "text", text }], timestamp: 2 });
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

test("fresh sources over projected history hash nothing until a hash is needed", () => {
  const counter = { n: 0 };
  const branch = branchOf([user("one"), assistantText("reply"), user("two")].map((m) => counted(m, counter)));
  const sources = new Sources(branch, initialState());
  assert.equal(counter.n, 0, "building sources hashes no history");
  const incoming = branch.map((entry) => JSON.parse(JSON.stringify(entry.message)));
  counter.n = 0;
  const inserted = { role: "custom", customType: "freeflow-runtime-state", content: "state", display: false };
  tagProjectedMessages(incoming, projectionOf(branch), branch);
  const items = sources.associate([inserted, ...incoming]);
  assert.deepEqual(
    items.map((item) => item.source?.entry.id),
    [undefined, "e0", "e1", "e2"],
  );
  assert.equal(counter.n, 0, "associating projected history hashes nothing");
  assert.match(sources.byRef.get("ctx:e0").hash, /^[a-f0-9]{64}$/);
  assert.ok(counter.n > 0, "hashes are computed on demand");
  assert.equal(sources.byRef.has("ctx:e1#text"), false, "assistant text is not a separate evidence source");
});

test("sourceless projected summaries do not force history hashing", () => {
  const counter = { n: 0 };
  const branch = branchOf([user("one"), user("two")].map((m) => counted(m, counter)));
  const summary = { type: "compaction", id: "c", parentId: null, summary: "older work" };
  const sources = new Sources(branch, initialState());
  const incoming = [
    { role: "user", content: [{ type: "text", text: "summary of older work" }] },
    ...branch.map((entry) => JSON.parse(JSON.stringify(entry.message))),
  ];
  counter.n = 0;
  tagProjectedMessages(
    incoming,
    {
      entries: [
        { sourceEntry: summary, messages: [incoming[0]] },
        ...projectionOf(branch).entries.map((e, i) => ({ ...e, messages: [incoming[i + 1]] })),
      ],
    },
    branch,
  );
  assert.deepEqual(
    sources.associate(incoming).map((item) => item.source?.entry.id),
    [undefined, "e0", "e1"],
  );
  assert.equal(counter.n, 0);
});
