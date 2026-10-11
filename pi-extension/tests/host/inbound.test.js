import assert from "node:assert/strict";
import test from "node:test";
import { Inbound, NOTICE_PREFIX } from "../../dist/host/inbound.js";

// The inbound channel: how a notice reaches the model while the agent works or waits, and how a noisy source is
// batched and stopped.
function host(idle) {
  const sent = [];
  return {
    sent,
    sendMessage: (message, options) => sent.push({ kind: "message", message, options }),
    sendUserMessage: (content) => sent.push({ kind: "user", content }),
    isIdle: () => idle,
  };
}
const notice = (content, wake = true) => ({
  customType: "freeflow-test",
  content: `${NOTICE_PREFIX} ${content}`,
  details: { id: content },
  wake,
});
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

test("while the agent works a notice is steered in; while idle it starts a turn as a user message", async () => {
  const busy = host(false);
  new Inbound(busy).deliver(notice("done"));
  assert.deepEqual(busy.sent[0].options, { triggerTurn: true, deliverAs: "steer" });
  assert.equal(busy.sent[0].message.display, true);
  const idle = host(true);
  new Inbound(idle).deliver(notice("done"));
  assert.deepEqual(idle.sent, [{ kind: "user", content: `${NOTICE_PREFIX} done` }]);
  // A notice that should not wake the agent waits for the next turn, idle or not.
  const quiet = host(true);
  new Inbound(quiet).deliver(notice("still running", false));
  assert.deepEqual(quiet.sent[0].options, { triggerTurn: false });
});

test("notices from one source within the window join one notice", async () => {
  const h = host(false);
  const inbound = new Inbound(h);
  inbound.deliver(notice("line 1"), { key: "m1", windowMs: 30 });
  inbound.deliver(notice("line 2"), { key: "m1", windowMs: 30 });
  inbound.deliver(notice("other"), { key: "m2", windowMs: 30 });
  assert.equal(h.sent.length, 0);
  await pause(60);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0].message.content, `${NOTICE_PREFIX} line 1\n${NOTICE_PREFIX} line 2`);
  assert.equal(h.sent[0].message.details.batched, 2);
});

test("a source past its limit is stopped once and sends nothing more", async () => {
  const h = host(false);
  const inbound = new Inbound(h);
  let stopped = 0;
  const batch = { key: "noisy", windowMs: 5, perMinute: 2, onLimit: () => stopped++ };
  for (let i = 0; i < 4; i++) {
    inbound.deliver(notice(`event ${i}`), batch);
    await pause(15);
  }
  assert.equal(h.sent.length, 2);
  assert.equal(stopped, 1);
  inbound.close("noisy");
  inbound.deliver(notice("after close"), batch);
  await pause(15);
  assert.equal(h.sent.length, 3, "closing a source forgets its limit");
});

test("a notice renders as one line naming its source", async () => {
  const { renderNotice } = await import("../../dist/host/inbound.js");
  const line = renderNotice("Background")(
    { content: `${NOTICE_PREFIX} Background command bg1 (npm test) completed. Output: /tmp/x.` },
    { expanded: false },
    undefined,
  )
    .render(200)
    .join("\n")
    .trimEnd();
  assert.equal(line, "Background command bg1 (npm test) completed. Output: /tmp/x.");
});
