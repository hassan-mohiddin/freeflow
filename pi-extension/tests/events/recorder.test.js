import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { EventRecorder, eventPath, exitCode, IDLE_FLUSH_MS, piClaims, REQUESTS } from "../../dist/events/recorder.js";
import { Inbound, sentWhatOf } from "../../dist/host/inbound.js";
import { fixture } from "../fixtures/pi-native.js";
import { CONFORMANCE } from "./conformance.js";

// Freeflow's event log and claims on Pi (SPEC-006 4.2, 4.5): the recorder alone, then a real in-process Pi session with
// Track Work's real script writing the log.
const script = resolve("skills/track-work/scripts/working-record.mjs");
const noRouting = { freeflowConfig: { toolExecution: { enabled: true } } };
const bash = (command) => ({ name: "bash", args: { command } });
const GOLDEN = new URL("./golden-events.jsonl", import.meta.url).pathname;

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
  let unread;
  for (let i = 0; i < 400; i++) {
    if (existsSync(path)) {
      // A read can land while the flush is still writing: an empty file or a half-written last line means "not yet".
      // A line that never parses still fails below, with its error.
      try {
        const lines = readFileSync(path, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        unread = undefined;
        if (kinds.every((kind) => lines.some((line) => line.kind === kind))) return lines;
      } catch (error) {
        unread = error;
      }
    }
    await new Promise((done) => setTimeout(done, 25));
  }
  assert.fail(`${path} never held ${kinds.join(", ")}${unread ? ` (last read: ${unread.message})` : ""}`);
}

test("Pi's claims follow its capabilities: compaction, messaging and the event log; off, every request is no", () => {
  const on = {
    enabled: true,
    events: true,
    compaction: true,
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
  const all = piClaims({ ...on, messaging: true });
  assert.equal(all.send.claim, "yes");
  for (const request of ["forget", "route"])
    assert.deepEqual(all[request], {
      claim: "possible",
      how: "Pi offers setModel, setThinkingLevel and context_with_system; Freeflow does not use them",
    });
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

          // The golden event log (SPEC-006 4.7): this session's lines as the real writer stored them, normalized, on
          // kinds, order and fields. A change fails here until the file is updated on purpose:
          // FREEFLOW_UPDATE_GOLDEN=1 node --test pi-extension/tests/events/recorder.test.js writes it.
          // The menu's line lands when the store's session start finishes, which runs beside the first request by
          // design: once, wherever it lands.
          assert.equal(lines.filter((line) => line.kind === "freeflow" && line.what === "menu").length, 1);
          // So do the gates' lines (SPEC-008): they follow the gate state that session start writes beside the first
          // request; Pi's gates are pinned by tests/gates/.
          // The sent lines (the text Freeflow sent the model) are checked on their own below, not in the golden.
          const normal = lines
            .filter((line) => !(line.kind === "freeflow" && (line.what === "menu" || line.what === "gates")))
            .filter((line) => line.kind !== "gate" && line.kind !== "sent")
            .map((line, index) => ({ ...line, seq: index + 1 }))
            .map((line) => {
              const { ts: _ts, session: _session, ...rest } = line;
              return JSON.stringify({
                ...rest,
                ...(rest.ms === undefined ? {} : { ms: "<ms>" }),
                ...(rest.command ? { command: rest.command.split(resolve(".")).join("<repo>") } : {}),
              });
            });
          if (process.env.FREEFLOW_UPDATE_GOLDEN === "1") writeFileSync(GOLDEN, `${normal.join("\n")}\n`);
          assert.deepEqual(normal, readFileSync(GOLDEN, "utf8").trim().split("\n"));
          // Each sent line is the whole text Freeflow sent, with the writer's length and digest for it.
          const sentLines = lines.filter((line) => line.kind === "sent");
          assert.ok(sentLines.some((line) => line.what === "system-prompt" && line.text.includes("Freeflow")));
          assert.ok(sentLines.some((line) => line.what === "runtime-state"));
          for (const line of sentLines) {
            assert.ok(line.text.length > 0);
            assert.ok(Number.isInteger(line.chars) && line.chars > 0);
            assert.match(line.sha, /^[0-9a-f]{12}$/);
          }
          // A system prompt section every request carries is kept once in the session.
          assert.equal(
            sentLines.filter((line) => line.what === "system-prompt").length,
            new Set(sentLines.filter((line) => line.what === "system-prompt").map((line) => line.sha)).size,
          );

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

test("every request Pi claims as yes has its conformance test, and each test named exists (4.7)", () => {
  const all = { enabled: true, events: true, compaction: true, messaging: true, askUser: true };
  const yes = Object.entries(piClaims(all))
    .filter(([, claim]) => claim.claim === "yes")
    .map(([request]) => request);
  assert.deepEqual(yes.sort(), Object.keys(CONFORMANCE).sort());
  for (const [request, [file, name]] of Object.entries(CONFORMANCE)) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(
      source.includes(`test(\n  ${JSON.stringify(name)}`) || source.includes(`test(${JSON.stringify(name)}`),
      `${request}: ${file} has the test ${name}`,
    );
  }
});

test("a sent line keeps the whole text, once per distinct text where a request repeats it; off keeps nothing", async () => {
  const runs = [];
  const recorder = new EventRecorder(
    async (args, options) => {
      runs.push({ args, input: options.input });
      return { code: 0, stdout: "", stderr: "" };
    },
    () => Date.parse("2026-11-14T10:00:00.000Z"),
  );
  const guidance = "# Freeflow guidance\n\nA section of many lines,\nkept whole.";
  recorder.begin("pi-sent", true);
  recorder.sent("system-prompt", guidance, { once: true });
  recorder.sent("system-prompt", guidance, { once: true });
  recorder.sent("runtime-state", "# Freeflow Runtime State\nFreeflow: active", { once: true });
  recorder.sent("runtime-state", "# Freeflow Runtime State\nFreeflow: active", { once: true });
  recorder.sent("notice", "Context cycle 1: the context is at 80% of its window.");
  recorder.sent("gate", "A gate's warning row.");
  recorder.sent("gate", "A gate's warning row.");
  recorder.sent("menu", "");
  await recorder.flush();
  const lines = runs
    .at(-1)
    .input.split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    lines.map((line) => [line.kind, line.what, line.text]),
    [
      ["sent", "system-prompt", guidance],
      ["sent", "runtime-state", "# Freeflow Runtime State\nFreeflow: active"],
      ["sent", "notice", "Context cycle 1: the context is at 80% of its window."],
      ["sent", "gate", "A gate's warning row."],
      ["sent", "gate", "A gate's warning row."],
    ],
  );
  // The session starts again: its own once-set, so a text is kept once more in the new session.
  recorder.begin("pi-sent-2", true);
  recorder.sent("system-prompt", guidance, { once: true });
  recorder.sent("system-prompt", guidance, { once: true });
  assert.equal(recorder.pending(), 1);
  // Off: nothing is kept, and nothing is written.
  await recorder.flush();
  recorder.begin("pi-sent-3", false);
  recorder.sent("notice", "not kept");
  recorder.sent("system-prompt", guidance, { once: true });
  assert.equal(recorder.pending(), 0);
});

test("a notice Freeflow delivers is kept under its source: background and monitor by their type, a store notice as waits", async () => {
  const kept = [];
  const inbound = new Inbound({
    sendMessage: () => {},
    sendUserMessage: () => {},
    isIdle: () => true,
    canWake: () => true,
    logSent: (what, text) => kept.push([what, text]),
  });
  const notice = (type, body) => `<freeflow-notice type="${type}">\n${body}\n</freeflow-notice>`;
  inbound.deliver({
    customType: "freeflow-background",
    content: notice("background", "Background command bg1 completed."),
    details: {},
    wake: false,
  });
  inbound.deliver({
    customType: "freeflow-monitor",
    content: notice("monitor", "Monitor m1: a line."),
    details: {},
    wake: false,
  });
  inbound.deliver({
    customType: "freeflow-store",
    content: notice("store", "Freeflow: D-001 returned."),
    details: {},
    wake: false,
  });
  inbound.deliver({
    customType: "freeflow-message",
    content: '<message from="other">\nhi\n</message>',
    details: {},
    wake: false,
  });
  // A notice is kept once its send is accepted, which the host reports asynchronously.
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(
    kept.map(([what]) => what),
    ["background", "monitor", "waits", "message"],
  );
  assert.equal(kept[2][1], notice("store", "Freeflow: D-001 returned."));
  assert.equal(sentWhatOf("freeflow-background", notice("monitor", "x")), "monitor");
});

test("every source Pi's extension names for a sent line is one Track Work's log takes", async () => {
  const { SENT_WHATS } = await import("../../../skills/track-work/scripts/lib/events5.mjs");
  const { readdirSync, readFileSync: read } = await import("node:fs");
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (path.endsWith(".ts")) files.push(path);
    }
  };
  walk(resolve("pi-extension/src"));
  const named = new Set();
  for (const file of files)
    for (const match of read(file, "utf8").matchAll(/\bsent\??\.?\(\s*"([a-z-]+)"/g)) named.add(match[1]);
  assert.ok(named.size >= 15, `found ${named.size} source names`);
  for (const name of named) assert.ok(SENT_WHATS.includes(name), `${name} is not a sent source`);
});
