import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { EventRecorder, eventPath, exitCode, IDLE_FLUSH_MS, piClaims, REQUESTS } from "../../dist/events/recorder.js";
import { fixture } from "../fixtures/routing-native.js";

// Freeflow's event log and claims on Pi (SPEC-006 4.2, 4.5): the recorder alone, then a real in-process Pi session with
// Track Work's real script writing the log.
const script = resolve("skills/track-work/scripts/working-record.mjs");
const noRouting = { cognitiveRouting: { enabled: false }, freeflowConfig: { toolExecution: { enabled: true } } };
const bash = (command) => ({ name: "bash", args: { command } });

/** The Freeflow home for one test, set in Pi's process as a user's environment would, and restored after. */
async function withHome(run) {
  const folder = await mkdtemp(join(tmpdir(), "freeflow-events-home-"));
  const names = ["FREEFLOW_HOME", "FREEFLOW_SESSION", "FREEFLOW_HARNESS", "FREEFLOW_TRANSCRIPT", "FREEFLOW_RESUME"];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.FREEFLOW_HOME = join(folder, "home");
  try {
    await run(process.env.FREEFLOW_HOME);
  } finally {
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    await rm(folder, { recursive: true, force: true });
  }
}

/** The session's log, once the flush that agent_settled started has written it. */
async function logLines(home, session, kinds) {
  const path = join(home, "events", `${session}.jsonl`);
  for (let i = 0; i < 400; i++) {
    if (existsSync(path)) {
      const lines = readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      if (kinds.every((kind) => lines.some((line) => line.kind === kind))) return lines;
    }
    await new Promise((done) => setTimeout(done, 25));
  }
  assert.fail(`${path} never held ${kinds.join(", ")}`);
}

test("Pi's claims follow its capabilities: routing, compaction, messaging and the event log; off, every request is no", () => {
  const on = {
    enabled: true,
    events: true,
    compaction: true,
    routing: false,
    messaging: false,
    askUser: true,
  };
  const claimOf = (claims) =>
    Object.fromEntries(Object.entries(claims).map(([request, each]) => [request, each.claim]));
  assert.deepEqual(Object.keys(piClaims(on)), [...REQUESTS]);
  assert.deepEqual(claimOf(piClaims(on)), {
    pin: "yes",
    inject: "yes",
    forget: "possible",
    compact: "yes",
    checkpoint: "yes",
    rewind: "no",
    route: "possible",
    spawn: "no",
    send: "possible",
    wake: "yes",
    ask: "yes",
    block: "yes",
    sensors: "yes",
    timers: "yes",
  });
  const all = claimOf(piClaims({ ...on, routing: true, messaging: true }));
  assert.equal(all.forget, "yes");
  assert.equal(all.route, "yes");
  assert.equal(all.send, "yes");
  const quiet = piClaims({ ...on, compaction: false, events: false, askUser: false });
  assert.equal(quiet.compact.claim, "possible");
  assert.equal(quiet.wake.claim, "possible");
  assert.equal(quiet.sensors.how, "the event log is off (events.enabled)");
  assert.equal(quiet.ask.claim, "no");
  for (const claim of Object.values(piClaims({ ...on, enabled: false })))
    assert.deepEqual(claim, { claim: "no", how: "Freeflow is off in this session (enabled)" });
});

test("a shell command's exit code, from Pi's text only; a file tool's path relative to the session's folder", () => {
  assert.equal(exitCode([{ type: "text", text: "boom\n\nCommand exited with code 2" }]), 2);
  assert.equal(exitCode([{ type: "text", text: "all fine" }]), undefined);
  assert.equal(eventPath("/work/app/src/a.ts", "/work/app"), "src/a.ts");
  assert.equal(eventPath("src/b.ts", "/work/app"), "src/b.ts");
  assert.equal(eventPath("/elsewhere/c.ts", "/work/app"), "/elsewhere/c.ts");
});

test("a flush that fails drops its lines and the next says how many, with only a freeflow line's fields", async () => {
  const runs = [];
  let fail = true;
  const recorder = new EventRecorder(
    async (args, options) => {
      runs.push({ args, input: options.input });
      return fail ? { code: 1, stdout: "", stderr: "Error: locked" } : { code: 0, stdout: "", stderr: "" };
    },
    () => Date.parse("2026-11-03T12:00:00.000Z"),
  );
  recorder.begin("pi-1", true);
  recorder.sessionStarted("startup", true);
  recorder.turnStart();
  await recorder.flush();
  assert.equal(recorder.pending(), 0);
  fail = false;
  recorder.turnEnd("stop");
  await recorder.flush();
  const lines = runs
    .at(-1)
    .input.split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(runs.at(-1).args, ["events", "append", "--input", "-"]);
  assert.deepEqual(lines[0], {
    v: 1,
    ts: "2026-11-03T12:00:00.000Z",
    session: "pi-1",
    harness: "pi",
    agent: "main",
    kind: "freeflow",
    what: "dropped",
    dropped: 2,
  });
  assert.deepEqual(lines[1], {
    v: 1,
    ts: "2026-11-03T12:00:00.000Z",
    session: "pi-1",
    harness: "pi",
    agent: "main",
    kind: "turn.end",
    turn: 1,
    reason: "answer",
    ms: 0,
  });
  await recorder.flush();
  assert.equal(runs.length, 2, "nothing waiting, nothing run");
  // Off, nothing is kept.
  recorder.setOn(false);
  recorder.turnStart();
  assert.equal(recorder.pending(), 0);
});

test(
  "a Pi session writes its loop to the event log when the run settles, and its claims at session start",
  { timeout: 60000 },
  async () => {
    await withHome(async (home) => {
      let session;
      await fixture(
        async (n) =>
          n === 1 ? [bash("echo SECRET_OUTPUT | rev"), bash(`node ${script} store status --token=abc123; exit 3`)] : [],
        false,
        async ({ requests }) => {
          assert.equal(requests.length, 2);
          session = process.env.FREEFLOW_SESSION;
          assert.ok(session);
          const lines = await logLines(home, session, ["turn.end", "tool.call", "model.request"]);
          // Every line is schema v1, numbered by the writer.
          assert.deepEqual(
            lines.map((line) => line.seq),
            lines.map((_, index) => index + 1),
          );
          for (const line of lines) {
            assert.equal(line.v, 1);
            assert.equal(line.session, session);
            assert.equal(line.harness, "pi");
            assert.equal(line.agent, "main");
          }
          const kinds = lines.map((line) => line.kind);
          assert.equal(kinds[0], "session.start");
          assert.deepEqual(lines[0], { ...lines[0], source: "startup", interactive: true });
          assert.equal(kinds.filter((kind) => kind === "turn.start").length, 2);
          assert.equal(kinds.filter((kind) => kind === "turn.end").length, 2);
          assert.equal(kinds.filter((kind) => kind === "model.request").length, 2);
          const request = lines.find((line) => line.kind === "model.request");
          assert.equal(request.model, "gpt-4o");
          assert.equal(request.effort, "off");
          assert.ok(Number.isInteger(request.in));
          const tools = lines.filter((line) => line.kind === "tool.call");
          assert.deepEqual(
            tools.map((line) => [line.tool, line.ok, line.exit, line.source]),
            [
              ["bash", true, undefined, "agent"],
              // Track Work's script from Freeflow's package: Freeflow's own, which Part 8 counts.
              ["bash", false, 3, "freeflow"],
            ],
          );
          // The writer redacted the token; no output reached the log.
          assert.match(tools[1].command, /--token=\[redacted\]; exit 3$/);
          assert.doesNotMatch(JSON.stringify(lines), /abc123|TUPTUO_TERCES|Complete the fixture assignment/);
          assert.ok(lines.some((line) => line.kind === "freeflow" && line.what === "capabilities"));

          const claims = JSON.parse(readFileSync(join(home, "sessions", session, "capabilities.json"), "utf8"));
          assert.equal(claims.driver, "pi-extension");
          assert.equal(claims.requestSet, 1);
          assert.equal(claims.events, true);
          assert.equal(claims.claims.compact.claim, "yes");
          assert.equal(claims.claims.route.claim, "possible");
        },
        true,
        noRouting,
      );
    });
  },
);

test(
  "events.enabled off: Pi writes no event log, and its claims say sensors is only possible",
  { timeout: 60000 },
  async () => {
    await withHome(async (home) => {
      await fixture(
        async (n) => (n === 1 ? [bash("true")] : []),
        false,
        async () => {
          const session = process.env.FREEFLOW_SESSION;
          await new Promise((done) => setTimeout(done, 300));
          assert.equal(existsSync(join(home, "events", `${session}.jsonl`)), false);
          const claims = JSON.parse(readFileSync(join(home, "sessions", session, "capabilities.json"), "utf8"));
          assert.equal(claims.events, false);
          assert.deepEqual(claims.claims.sensors, { claim: "possible", how: "the event log is off (events.enabled)" });
        },
        true,
        { ...noRouting, freeflowConfig: { ...noRouting.freeflowConfig, events: { enabled: false } } },
      );
    });
  },
);

test("/freeflow capabilities on Pi prints the listing for this session", { timeout: 60000 }, async () => {
  await withHome(async () => {
    await fixture(
      async () => [],
      false,
      async ({ session, notices }) => {
        await session.prompt("/freeflow capabilities");
        const listing = notices.map(([text]) => text).find((text) => /^Freeflow on Pi/.test(String(text)));
        assert.ok(listing, `a listing among ${JSON.stringify(notices)}`);
        assert.match(listing, /^Freeflow on Pi \(pi-extension \d+\.\d+\.\d+, request set 1, interactive\)\n/);
        assert.match(listing, /\n {2}compact {4}yes {7}its own compaction after a checkpoint/);
        assert.match(listing, /\nEvent log: on, .*events\/.*\.jsonl \(\d+ line\(s\)\)$/);
      },
      true,
      noRouting,
    );
  });
});

test("the lines wait for the session to stay idle after a run settles; a run that starts first takes them along (T3)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const runs = [];
  const recorder = new EventRecorder(async (args, options) => {
    runs.push(options.input);
    return { code: 0, stdout: "", stderr: "" };
  });
  recorder.begin("pi-1", true);
  recorder.turnStart();
  recorder.settled();
  t.mock.timers.tick(IDLE_FLUSH_MS - 1);
  recorder.runStarted();
  t.mock.timers.tick(IDLE_FLUSH_MS);
  await Promise.resolve();
  assert.equal(runs.length, 0, "a run started first: nothing written in it");
  recorder.turnEnd("stop");
  recorder.settled();
  t.mock.timers.tick(IDLE_FLUSH_MS);
  await recorder.flush();
  assert.equal(runs.length, 1);
  assert.deepEqual(
    runs[0].split("\n").map((line) => JSON.parse(line).kind),
    ["turn.start", "turn.end"],
  );
});
