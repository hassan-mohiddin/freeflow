import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CAPTURE_IDLE_MS, DiscussionCapture } from "../../dist/discussion/capture.js";

// Freeflow's discussion capture on Pi (D-056): one capture per settled turn, naming this session and its transcript,
// with no store none, cancelled by a run that starts first, one push when it stored something, and never throwing.

/** A fake run: records its arguments; answers "Captured 1 message(s)" for a capture, or fails when `fail` is set. */
function recorder({ delay = 0, fail = false, answer = "Captured 1 message(s), M-1, into x.\n" } = {}) {
  const calls = [];
  const run = async (args, options) => {
    calls.push({ args, timeoutMs: options?.timeoutMs });
    await new Promise((done) => setTimeout(done, delay));
    if (fail) throw new Error("the script is not there");
    return { code: 0, stdout: args[1] === "capture" ? answer : "", stderr: "" };
  };
  return { calls, run };
}

/** A Freeflow home with a store (its store.json), and this session's variables, set for one test and restored after. */
async function withStore(run, { store = true } = {}) {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-capture-"));
  const saved = {
    FREEFLOW_HOME: process.env.FREEFLOW_HOME,
    FREEFLOW_SESSION: process.env.FREEFLOW_SESSION,
    FREEFLOW_TRANSCRIPT: process.env.FREEFLOW_TRANSCRIPT,
  };
  try {
    await mkdir(join(folder, "home"), { recursive: true });
    if (store) await writeFile(join(folder, "home", "store.json"), "{}\n");
    process.env.FREEFLOW_HOME = join(folder, "home");
    process.env.FREEFLOW_SESSION = "pi-session-1";
    process.env.FREEFLOW_TRANSCRIPT = join(folder, "session.jsonl");
    await run();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(folder, { recursive: true, force: true });
  }
}

test("a capture names this session and its transcript, commits without pushing", async () => {
  await withStore(async () => {
    const { calls, run } = recorder({ answer: "No new messages.\n" });
    await new DiscussionCapture(run).capture();
    assert.deepEqual(calls, [
      {
        args: [
          "discussion",
          "capture",
          "--no-push",
          "--session",
          "pi-session-1",
          "--transcript",
          process.env.FREEFLOW_TRANSCRIPT,
        ],
        timeoutMs: 30_000,
      },
    ]);
  });
});

test("a capture that stored something pushes once, after it", async () => {
  await withStore(async () => {
    const { calls, run } = recorder();
    await new DiscussionCapture(run).capture();
    assert.deepEqual(
      calls.map((call) => call.args.slice(0, 2)),
      [
        ["discussion", "capture"],
        ["store", "sync"],
      ],
    );
  });
});

test("with no store, no capture runs", async () => {
  await withStore(
    async () => {
      const { calls, run } = recorder();
      await new DiscussionCapture(run).capture();
      assert.deepEqual(calls, []);
    },
    { store: false },
  );
});

test("a settled run captures once the session has stayed idle a moment; a run that starts first cancels it", async () => {
  await withStore(async () => {
    const { calls, run } = recorder();
    const capture = new DiscussionCapture(run);
    capture.settled();
    assert.equal(calls.length, 0, "not while the run is still settling");
    await new Promise((done) => setTimeout(done, CAPTURE_IDLE_MS + 300));
    assert.equal(calls[0].args[1], "capture");
    capture.settled();
    capture.runStarted();
    await new Promise((done) => setTimeout(done, CAPTURE_IDLE_MS + 300));
    assert.equal(calls.filter((call) => call.args[1] === "capture").length, 1, "the cancelled capture did not run");
  });
});

test("captures run one after another, and a failed one does not reject the next or Pi", async () => {
  await withStore(async () => {
    const { calls, run } = recorder({ delay: 20, fail: true });
    const capture = new DiscussionCapture(run);
    await Promise.all([capture.capture(), capture.capture()]);
    assert.equal(calls.filter((call) => call.args[1] === "capture").length, 2);
  });
});
