import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { RequestHistory } from "../../dist/runtime/request-history.js";
import { tagProjectedMessages } from "../../dist/session-sources/sources.js";
const state = (text) => ({ role: "custom", customType: "freeflow-runtime-state", content: text, display: false });
const communication = (text) => ({
  role: "custom",
  customType: "freeflow-routing-communication",
  content: text,
  display: false,
});
const user = (text) => ({ role: "user", content: [{ type: "text", text }], timestamp: 1 });
function fixture(manager = SessionManager.inMemory("/tmp/freeflow-cache")) {
  const pi = { appendEntry: (type, data) => manager.appendCustomEntry(type, data) };
  return { manager, pi, ctx: { sessionManager: manager, ui: { setStatus() {} } }, history: new RequestHistory(pi) };
}
test("generated state stays at its original position and changed state appends", async () => {
  const f = fixture(),
    one = await f.history.assemble([state("enabled"), user("one")], "ordinary", f.ctx);
  const two = await f.history.assemble([user("one"), state("disabled"), user("two")], "ordinary", f.ctx);
  assert.deepEqual(two.slice(0, one.length), one);
  assert.equal(two.at(-1).content, "disabled");
  const count = f.manager.getEntries().length;
  assert.deepEqual(await f.history.assemble([state("disabled"), user("one"), user("two")], "ordinary", f.ctx), two);
  assert.equal(f.manager.getEntries().length, count);
  const reload = new RequestHistory(f.pi);
  const three = await reload.assemble([state("disabled"), user("one"), user("two"), user("three")], "ordinary", f.ctx);
  assert.deepEqual(three.slice(0, two.length), two);
});
test("view changes never import excluded bodies or stale required communication", async () => {
  const f = fixture();
  await f.history.assemble([user("SECRET"), state("worker"), communication("required report")], "ordinary", f.ctx);
  const coordinator = await f.history.assemble([user("selected"), state("coordinator")], "coordinator", f.ctx);
  assert.ok(!JSON.stringify(coordinator).includes("SECRET"));
  const reduced = await f.history.assemble([user("new visible"), state("worker")], "ordinary", f.ctx);
  assert.ok(!JSON.stringify(reduced).includes("SECRET"));
  assert.ok(!JSON.stringify(reduced).includes("required report"));
});
test("context persistence failure returns the current qualified view without old bodies", async () => {
  const f = fixture();
  await f.history.assemble([user("old"), state("first")], "ordinary", f.ctx);
  f.pi.appendEntry = () => {
    throw Error("disk");
  };
  const current = [user("current"), state("second")];
  assert.equal(await f.history.assemble(current, "ordinary", f.ctx), current);
});

test("changing only the view label retains the exact permitted prefix", async () => {
  const f = fixture();
  const first = await f.history.assemble([user("common"), state("ordinary")], "ordinary", f.ctx);
  const next = await f.history.assemble([user("common"), state("coordinator")], "coordinator", f.ctx);
  assert.deepEqual(next.slice(0, first.length), first);
});

test("native labeled forks preserve generated-state positions", async () => {
  const root = await mkdtemp(join(tmpdir(), "freeflow-cache-fork-"));
  try {
    const manager = SessionManager.create(root, root),
      f = fixture(manager);
    const id = manager.appendMessage(user("one"));
    manager.appendLabelChange(id, "named");
    const first = await f.history.assemble([user("one"), state("enabled")], "ordinary", f.ctx);
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      timestamp: 2,
      stopReason: "stop",
    });
    const path = manager.createBranchedSession(manager.getLeafId());
    const nextFixture = fixture(SessionManager.open(path));
    const next = await nextFixture.history.assemble(
      [user("one"), user("two"), state("disabled")],
      "ordinary",
      nextFixture.ctx,
    );
    assert.deepEqual(next.slice(0, first.length), first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a branch summary keeps generated state at its original positions", async () => {
  const f = fixture();
  f.manager.appendMessage(user("one"));
  const first = await f.history.assemble([user("one"), state("enabled")], "ordinary", f.ctx);
  f.manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "abandoned" }], timestamp: 2 });
  // Navigate back to the recorded request and summarize the abandoned path, as /tree does.
  const frame = f.manager.getBranch().findLast((e) => e.customType === "freeflow-request-history-v1");
  f.manager.branchWithSummary(frame.id, "Summary of the abandoned path.");
  const summary = { role: "branchSummary", summary: "Summary of the abandoned path.", timestamp: 3 };
  const next = await f.history.assemble([user("one"), summary, user("two"), state("enabled")], "ordinary", f.ctx);
  assert.deepEqual(next.slice(0, first.length), first);
});

test("compaction still starts a new generation", async () => {
  const f = fixture();
  f.manager.appendMessage(user("one"));
  await f.history.assemble([user("one"), state("enabled")], "ordinary", f.ctx);
  f.manager.appendCompaction("Compacted.", f.manager.getLeafId(), 100);
  const compacted = { role: "compactionSummary", summary: "Compacted.", timestamp: 3 };
  const next = await f.history.assemble([compacted, user("two"), state("enabled")], "ordinary", f.ctx);
  // Pre-compaction positions do not apply; current state is placed at the tail of the new history.
  assert.equal(next.at(-1).content, "enabled");
  assert.equal(next.length, 3);
});

test("budget notices see assembled historical overhead and clear without rewriting old notices", async () => {
  const f = fixture();
  let length;
  const first = await f.history.assemble([user("one"), state("enabled")], "ordinary", f.ctx, (messages) => {
    length = messages.length;
    return { role: "custom", customType: "freeflow-routing-budget", content: "Large input", display: false };
  });
  assert.equal(length, 2);
  const next = await f.history.assemble([user("one"), user("two"), state("enabled")], "ordinary", f.ctx, (messages) => {
    length = messages.length;
  });
  assert.equal(length, 4);
  assert.deepEqual(next.slice(0, first.length), first);
  assert.match(next.at(-1).content, /warning cleared/);
});

test("ending a restoration obligation retains already admitted communication until context changes", async () => {
  const f = fixture();
  const first = await f.history.assemble(
    [user("one"), communication("accepted report"), state("active")],
    "ordinary",
    f.ctx,
  );
  const closed = await f.history.assemble([user("one"), user("two"), state("closed")], "ordinary", f.ctx);
  assert.deepEqual(closed.slice(0, first.length), first);
  const again = await f.history.assemble(
    [user("one"), user("two"), communication("accepted report"), state("closed")],
    "ordinary",
    f.ctx,
  );
  assert.equal(again.filter((message) => message.content === "accepted report").length, 1);
});
test("an attention notice appends once per interruption and again after it clears", async () => {
  const f = fixture();
  const attention = {
    role: "custom",
    customType: "freeflow-routing-attention",
    content: "New delivered user input requires Coordinator attention.",
    display: false,
  };
  const notices = (messages) => messages.filter((m) => m.customType === "freeflow-routing-attention").length;
  const one = await f.history.assemble([user("one"), attention], "ordinary", f.ctx);
  const two = await f.history.assemble([user("one"), user("two"), attention], "ordinary", f.ctx);
  assert.equal(notices(two), 1, "an unchanged notice is not duplicated");
  assert.deepEqual(two.slice(0, one.length), one);
  const three = await f.history.assemble([user("one"), user("two"), user("three")], "ordinary", f.ctx);
  assert.equal(notices(three), 1, "the earlier occurrence stays in place");
  const four = await f.history.assemble(
    [user("one"), user("two"), user("three"), user("four"), attention],
    "ordinary",
    f.ctx,
  );
  assert.deepEqual(four.slice(0, three.length), three);
  assert.equal(notices(four), 2, "a new interruption appends a new notice");
  assert.equal(four.at(-1).customType, "freeflow-routing-attention");
});

test("unchanged generated state appends one frame, not one per request, and keeps its position", async () => {
  const f = fixture();
  const frames = () => f.manager.getEntries().filter((e) => e.customType === "freeflow-request-history-v1").length;
  const conversation = [user("one")];
  const first = await f.history.assemble([state("enabled"), ...conversation], "ordinary", f.ctx);
  assert.equal(frames(), 1);
  let previous = first;
  for (const text of ["two", "three", "four", "five"]) {
    conversation.push(user(text));
    const next = await f.history.assemble([state("enabled"), ...conversation], "ordinary", f.ctx);
    assert.deepEqual(next.slice(0, previous.length), previous);
    previous = next;
  }
  assert.equal(frames(), 1);
  const reload = new RequestHistory(f.pi);
  const resumed = await reload.assemble([state("enabled"), ...conversation, user("six")], "ordinary", f.ctx);
  assert.deepEqual(resumed.slice(0, previous.length), previous);
  assert.equal(frames(), 1);
});

test("a replaced native frame with the same ID is revalidated instead of using a stale cached body", async () => {
  const f = fixture();
  await f.history.assemble([state("original"), user("one")], "ordinary", f.ctx);
  const native = f.manager.getBranch().find((entry) => entry.customType === "freeflow-request-history-v1");
  const replaced = structuredClone(native);
  replaced.data.additions[0].message.content = "replacement";
  const manager = {
    getBranch: () => [replaced],
    getLeafId: () => f.manager.getLeafId(),
    getSessionId: () => f.manager.getSessionId(),
    getSessionFile: () => undefined,
  };
  const current = [state("original"), user("one")];
  const changed = await f.history.assemble(current, "ordinary", { ...f.ctx, sessionManager: manager });
  assert.equal(changed.at(-1).content, "replacement");
  const invalid = structuredClone(replaced);
  invalid.data.length = -1;
  manager.getBranch = () => [invalid];
  assert.equal(await f.history.assemble(current, "ordinary", { ...f.ctx, sessionManager: manager }), current);
});

test("switching native siblings rebuilds the frame view without importing the other branch", async () => {
  const f = fixture();
  const base = f.manager.appendMessage(user("base"));
  const first = await f.history.assemble([user("base"), state("sibling A")], "ordinary", f.ctx);
  const a = f.manager.getLeafId();
  assert.equal(first.at(-1).content, "sibling A");
  f.manager.branch(base);
  const second = await f.history.assemble([user("base"), state("sibling B")], "ordinary", f.ctx);
  assert.equal(second.at(-1).content, "sibling B");
  assert.ok(!JSON.stringify(second).includes("sibling A"));
  f.manager.branch(a);
  const restored = await f.history.assemble([user("base"), state("sibling A")], "ordinary", f.ctx);
  assert.deepEqual(restored, first);
});

test("host-edited native content invalidates cached request prefixes", async () => {
  const f = fixture();
  const projected = (text, edited) => {
    const message = user(text);
    tagProjectedMessages(
      [message],
      { entries: [{ sourceEntry: { type: "message", id: "native:one" }, messages: [message] }] },
      edited ? [{ type: "context_edit", targetId: "native:one" }] : [],
    );
    return [message, state("enabled")];
  };
  await f.history.assemble(projected("original", false), "ordinary", f.ctx);
  assert.equal(f.manager.getEntries().filter((entry) => entry.customType === "freeflow-request-history-v1").length, 1);
  const edited = await f.history.assemble(projected("changed", true), "ordinary", f.ctx);
  assert.equal(edited[0].content[0].text, "changed");
  assert.equal(f.manager.getEntries().filter((entry) => entry.customType === "freeflow-request-history-v1").length, 2);
});

test("entry-backed messages are fingerprinted once and assemble identically to untagged messages", async () => {
  let traversed = 0;
  const conversation = ["one", "two", "three"].map((text, i) => ({ id: `e${i}`, message: user(text) }));
  // Each request receives fresh message objects for the same native entries, as Pi does.
  const request = (count) => {
    const messages = conversation.slice(0, count).map(
      ({ message }) =>
        new Proxy(structuredClone(message), {
          ownKeys(target) {
            traversed += 1;
            return Reflect.ownKeys(target);
          },
        }),
    );
    tagProjectedMessages(
      messages,
      {
        entries: conversation
          .slice(0, count)
          .map(({ id }, i) => ({ sourceEntry: { type: "message", id }, messages: [messages[i]] })),
      },
      [],
    );
    return [state("enabled"), ...messages];
  };
  const tagged = fixture(),
    plain = fixture();
  for (const count of [1, 2, 3]) {
    const before = traversed;
    const out = await tagged.history.assemble(request(count), "ordinary", tagged.ctx);
    const assembledTraversals = traversed - before;
    const expected = await plain.history.assemble(
      [state("enabled"), ...conversation.slice(0, count).map(({ message }) => structuredClone(message))],
      "ordinary",
      plain.ctx,
    );
    assert.deepEqual(JSON.parse(JSON.stringify(out)), JSON.parse(JSON.stringify(expected)));
    assert.ok(assembledTraversals <= 2, `request ${count} fingerprinted only its new entry (${assembledTraversals})`);
  }
});
