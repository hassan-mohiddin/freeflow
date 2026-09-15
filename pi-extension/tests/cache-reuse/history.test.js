import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { RequestHistory } from "../../dist/runtime/request-history.js";
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
