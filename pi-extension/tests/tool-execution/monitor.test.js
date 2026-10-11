import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackgroundJobs, MONITOR_MAX_LINES, MONITOR_PER_MINUTE } from "../../dist/tool-execution/background.js";
import { Inbound } from "../../dist/host/inbound.js";

const tagged = (type, text) => `<freeflow-notice type="${type}">\n${text}\n</freeflow-notice>`;

/** Monitors wired as index.ts wires them, through a real Inbound whose host records what reaches the model. */
async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), "freeflow-mon-"));
  const session = `test-${process.pid}-${Date.now()}`;
  const sent = [];
  const inbound = new Inbound({
    sendMessage: (message, options) => sent.push({ type: message.customType, text: message.content, options }),
    sendUserMessage: () => assert.fail("busy agent: notices are steered, not sent as user messages"),
    isIdle: () => false,
  });
  const jobs = new BackgroundJobs({
    effective: () => true,
    shellPath: () => undefined,
    send: (content, details, wake) => inbound.deliver({ customType: "freeflow-background", content, details, wake }),
    event: (id, line, join, onLimit) =>
      inbound.deliver(
        { customType: "freeflow-monitor", content: line, details: { id }, wake: true },
        { key: id, perMinute: MONITOR_PER_MINUTE, onLimit, join: (notices) => join(notices.map((n) => n.content)) },
      ),
    endEvents: (id) => {
      inbound.flush(id);
      inbound.close(id);
    },
  });
  const until = async (check, ms = 15_000) => {
    for (let waited = 0; !check() && waited < ms; waited += 25) await new Promise((r) => setTimeout(r, 25));
    assert.ok(check(), "condition not reached in time");
  };
  const cleanup = async () => {
    await jobs.stopAll();
    inbound.reset();
    await rm(cwd, { recursive: true, force: true });
    await rm(join(tmpdir(), "freeflow", session), { recursive: true, force: true });
  };
  return { jobs, sent, cwd, session, until, cleanup };
}

test(
  "stdout lines become batched events, stderr stays in the file, the exit notice comes last",
  { timeout: 30000 },
  async () => {
    const { jobs, sent, cwd, session, until, cleanup } = await setup();
    try {
      const { id, outputPath } = await jobs.monitor(
        "printf 'a\\nb\\n'; sleep 0.5; echo oops >&2; printf 'd'",
        "watch",
        60_000,
        cwd,
        session,
      );
      assert.match(id, /^mon\w{6}$/);
      await until(() => sent.some((each) => each.type === "freeflow-background"));
      assert.deepEqual(
        sent.map((each) => each.text),
        [
          tagged("monitor", `Monitor ${id} (watch):\na\nb`),
          tagged("monitor", `Monitor ${id} (watch):\nd`),
          tagged("monitor", `Monitor ${id} (watch) exited with code 0 after 3 events. Output: ${outputPath}.`),
        ],
      );
      assert.deepEqual(sent[0].options, { triggerTurn: true, deliverAs: "steer" });
      const file = await readFile(outputPath, "utf8");
      assert.match(file, /oops/);
      assert.match(file, /\[exited with code 0\]\n$/);
    } finally {
      await cleanup();
    }
  },
);

test("a monitor past its timeout is stopped with one notice", { timeout: 30000 }, async () => {
  const { jobs, sent, cwd, session, until, cleanup } = await setup();
  try {
    const { id, outputPath, timeoutMs } = await jobs.monitor(
      "while true; do sleep 1; done",
      "idle",
      1_000,
      cwd,
      session,
    );
    assert.equal(timeoutMs, 1_000);
    await until(() => sent.length > 0);
    assert.equal(
      sent[0].text,
      tagged(
        "monitor",
        `Monitor ${id} (idle) reached its timeout after 0 events and was stopped. Start it again to keep watching. Output: ${outputPath}.`,
      ),
    );
    assert.equal(jobs.running().length, 0);
    assert.match(await readFile(outputPath, "utf8"), /\[stopped: timeout\]\n$/);
    assert.equal((await jobs.stop(id)).text, `${id} already stopped. Output: ${outputPath}.`);
  } finally {
    await cleanup();
  }
});

test(
  "a monitor that sends too many notices is stopped after its limit, with one notice",
  { timeout: 60000 },
  async () => {
    const { jobs, sent, cwd, session, until, cleanup } = await setup();
    try {
      // Lines 250 ms apart fall into separate 200 ms batches, so each line is its own notice.
      const { id } = await jobs.monitor("while true; do echo tick; sleep 0.25; done", "noisy", 60_000, cwd, session);
      await until(() => sent.some((each) => each.type === "freeflow-background"), 30_000);
      const events = sent.filter((each) => each.type === "freeflow-monitor");
      assert.equal(events.length, MONITOR_PER_MINUTE);
      const end = sent.at(-1).text;
      assert.match(
        end,
        new RegExp(
          `Monitor ${id} \\(noisy\\) was stopped after \\d+ events: it sent more than ${MONITOR_PER_MINUTE} notices in a minute`,
        ),
      );
      assert.equal(jobs.running().length, 0);
    } finally {
      await cleanup();
    }
  },
);

test("stop_background stops a monitor without a notice; restatement names monitors", { timeout: 30000 }, async () => {
  const { jobs, sent, cwd, session, cleanup } = await setup();
  try {
    const { id, outputPath } = await jobs.monitor("sleep 60", "quiet", 60_000, cwd, session);
    jobs.restate();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(
      sent[0].text,
      tagged(
        "background",
        `Still running: monitor ${id} (quiet), output ${outputPath}. Do not start them again; stop one with stop_background before restarting it.`,
      ),
    );
    assert.equal((await jobs.stop(id)).text, `Stopped ${id}.`);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(sent.length, 1);
    assert.match(await readFile(outputPath, "utf8"), /\[stopped\]\n$/);
  } finally {
    await cleanup();
  }
});

test("one notice shows at most the line cap and points to the file for the rest", { timeout: 30000 }, async () => {
  const { jobs, sent, cwd, session, until, cleanup } = await setup();
  try {
    const { id, outputPath } = await jobs.monitor("seq 1 100; sleep 1", "count", 60_000, cwd, session);
    await until(() => sent.length > 0);
    const lines = sent[0].text.split("\n").slice(1, -1); // inside the notice tag
    assert.equal(lines.length, 1 + MONITOR_MAX_LINES + 1);
    assert.equal(lines[1], "1");
    assert.equal(lines.at(-1), `... ${100 - MONITOR_MAX_LINES} more lines in ${outputPath}`);
    await jobs.stop(id);
  } finally {
    await cleanup();
  }
});
