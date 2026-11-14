// The Freeflow mod's tests, one per row of the task-004 Spec's section 11 table, run by `claude plugin test .`.
// The hooks a test registers stand for the engine and for Track Work's script: each `process.run` is answered from the
// scenario, so what is checked is when the mod runs which command and what it delivers.
import { expect, mock, test } from "claude-code/testing";

const T0 = Date.parse("2026-10-29T12:00:00.000Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const SESSION = "sess-1";
const HOME = "/store";
const RECORD = "/store/projects/widget/tasks/task-001-probe/record.md";
const MENU = "The record is memory; the user's message decides the work.\nProject widget (github.com/acme/widget):\n";

type Answer = { exitCode?: number; stdout?: string; stderr?: string };
type Run = { args: string[]; session?: string; stdin?: string };

const store = (fields: object = {}) => ({
  home: HOME,
  store: true,
  session: SESSION,
  task: null,
  summary: null,
  changed: false,
  transcript: null,
  ...fields,
});
const held = (stateAsOf: string, fields: object = {}) =>
  store({ task: { id: "widget/task-001", record: RECORD, stateAsOf }, ...fields });
// The session's gate state (SPEC-008), as Track Work writes it: by default one where every rule holds, so the gates
// stay quiet in the tests that are not about them.
const GATES_PATH = `${HOME}/sessions/${SESSION}/gates.json`;
const gateState = (fields: object = {}) =>
  JSON.stringify({
    v: 1,
    task: "widget/task-001",
    taskDir: "/store/projects/widget/tasks/task-001-probe",
    store: HOME,
    agreement: "A-001",
    session: null,
    exactSpec: null,
    slice: { id: "S-001", state: "in_progress" },
    delegations: {},
    updated: "2026-10-29T12:00:00.000Z",
    ...fields,
  });

/** The engine and the script beneath the mod, answered from the scenario `w` the test changes as it goes. */
function world(on: any) {
  const w = {
    status: null as object | null,
    answers: {} as Record<string, Answer>,
    tokens: undefined as number | undefined,
    // The plan's usage windows and the session's cost, as $.session.usage() gives them (SPEC-014 2.3).
    rateLimits: [] as { kind: string; percentUsed: number; resetsAt?: string }[],
    cost: undefined as number | undefined,
    threshold: 167_000 as number | undefined,
    compactionWindow: undefined as number | undefined,
    response: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    runs: [] as Run[],
    // The settings script's runs, apart from Track Work's, and what it answers: `get enabled` from `enabled`.
    settingsRuns: [] as Run[],
    enabled: true as boolean,
    eventsEnabled: true as boolean,
    // Every event line the mod flushed, in order, parsed.
    events: () =>
      w.eventRuns.flatMap((run) =>
        String(run.stdin)
          .split("\n")
          .map((line) => JSON.parse(line)),
      ),
    settingsAnswers: {} as Record<string, Answer>,
    // The event log's flushes, apart from the other runs: each is one `events append` with its lines (SPEC-006 T2).
    eventRuns: [] as Run[],
    eventAnswer: { stdout: "Wrote" } as Answer,
    // The capabilities script's runs, and what it answers.
    capabilityRuns: [] as Run[],
    capabilityAnswer: {
      stdout: "Freeflow on Claude Code (claude-code-mod 0.9.0, request set 1, interactive)",
    } as Answer,
    // The renderer's runs (SPEC-013), which print the session-start hooks' texts, and what it answers: the parts as the
    // hooks print them, and the Freeflow home.
    sectionRuns: [] as Run[],
    parts: ["CORE GUIDANCE", "THE CONTRACT", "THE METHOD"] as string[],
    sectionAnswer: undefined as Answer | undefined,
    // The session-start ledger the mod keeps, by path, apart from the other writes.
    ledgers: new Map<string, any>(),
    // What the settings hooks beneath the mod add to a classic SessionStart: none, unless a test gives them.
    hookContext: undefined as string[] | undefined,
    registered: [] as any[],
    env: {} as Record<string, string | undefined>,
    sent: [] as any[],
    submitted: [] as string[],
    commandsRun: [] as string[],
    compactions: [] as any[],
    writes: [] as { path: string; text: string }[],
    claims: [] as { path: string; text: string }[],
    // The files the mod wrote, by path, which it reads back.
    stored: new Map<string, string>([[GATES_PATH, gateState()]]),
    logs: [] as any[],
    clock: mock.clock(on, { now: T0 }),
    session: mock.session(on),
    // A turn's end runs `discussion capture` with a store (its own test below checks it), so the lists of the other calls
    // leave it out.
    commands: () =>
      w.runs.map((run) => run.args.join(" ")).filter((command) => !command.startsWith("discussion capture")),
    beforeRun: (_key: string): unknown => undefined,
    // What a slash command the mod runs comes to; a test throws here for a run the engine drops.
    commandResult: (_e: any): object => ({ text: "Compacted" }),
    // Paths that exist, each with where it really lands; a stat of anything else is refused as missing.
    files: new Map<string, string>([
      ["/store", "/store"],
      ["/store/projects/widget/tasks/task-001-probe", "/store/projects/widget/tasks/task-001-probe"],
      [
        "/store/projects/widget/tasks/task-001-probe/record.md",
        "/store/projects/widget/tasks/task-001-probe/record.md",
      ],
      ["/store/projects/widget/tasks/task-001-probe/sources", "/store/projects/widget/tasks/task-001-probe/sources"],
      ["/store/../etc/passwd", "/etc/passwd"],
      ["/work/widget/src.mjs", "/work/widget/src.mjs"],
      ["/work/widget/memory", "/store/projects/widget"],
      ["/store-other/notes.md", "/store-other/notes.md"],
    ]),
    verdict: { decision: "ask" } as { decision: string; rule?: string },
    toolFails: false as boolean,
    // Track Work's script as the mod runs it, under the plugin's root.
    scriptPath: "" as string,
  };
  on("process.run", async (_: any, e: any) => {
    const result = (answer: Answer) => ({
      value: {
        exitCode: answer.exitCode ?? 0,
        stdout: answer.stdout ?? "",
        stderr: answer.stderr ?? "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    });
    if (e.argv[0] === "node" && String(e.argv[1]).endsWith("hooks/shared/runtime-context.mjs")) {
      w.sectionRuns.push({ args: e.argv.slice(2), session: e.init?.env?.CLAUDE_CODE_SESSION_ID });
      return result(w.sectionAnswer ?? { stdout: JSON.stringify({ parts: w.parts, home: HOME }) });
    }
    if (e.argv[0] === "node" && String(e.argv[1]).endsWith("setup-freeflow/scripts/capabilities.mjs")) {
      w.capabilityRuns.push({ args: e.argv.slice(2), session: e.init?.env?.CLAUDE_CODE_SESSION_ID });
      return result(w.capabilityAnswer);
    }
    if (
      e.argv[0] === "node" &&
      String(e.argv[1]).endsWith("working-record.mjs") &&
      e.argv.slice(2, 4).join(" ") === "events append"
    ) {
      w.eventRuns.push({ args: e.argv.slice(2), session: e.init?.env?.CLAUDE_CODE_SESSION_ID, stdin: e.init?.stdin });
      return result(w.eventAnswer);
    }
    if (e.argv[0] === "node" && String(e.argv[1]).endsWith("setup-freeflow/scripts/settings.mjs")) {
      const args = e.argv.slice(2);
      w.settingsRuns.push({ args, session: e.init?.env?.CLAUDE_CODE_SESSION_ID });
      const key = args.join(" ");
      for (const [prefix, value] of Object.entries(w.settingsAnswers)) if (key.startsWith(prefix)) return result(value);
      if (key.startsWith("get events.enabled "))
        return result({
          stdout: JSON.stringify({
            key: "events.enabled",
            label: "Event log",
            value: w.eventsEnabled,
            scope: "default",
            hosts: "all",
          }),
        });
      if (key.startsWith("get enabled "))
        return result({
          stdout: JSON.stringify({
            key: "enabled",
            label: "Freeflow",
            value: w.enabled,
            scope: "default",
            hosts: "all",
          }),
        });
      return result({ exitCode: 1, stderr: `no answer for settings ${key}` });
    }
    const script = e.argv[0] === "node" && String(e.argv[1]).endsWith("working-record.mjs");
    if (script) w.scriptPath = String(e.argv[1]);
    const args = script ? e.argv.slice(2) : [...e.argv];
    w.runs.push({ args, session: e.init?.env?.CLAUDE_CODE_SESSION_ID, stdin: e.init?.stdin });
    const key = args.join(" ");
    await w.beforeRun(key);
    let answer: Answer = { stdout: "" };
    if (key === "session status") answer = { stdout: JSON.stringify(w.status ?? { home: HOME, store: false }) };
    for (const [prefix, value] of Object.entries(w.answers)) if (key.startsWith(prefix)) answer = value;
    return {
      value: {
        exitCode: answer.exitCode ?? 0,
        stdout: answer.stdout ?? "",
        stderr: answer.stderr ?? "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on("session.usage", (_: any, e: any) => ({
    value: {
      startedAt: T0,
      rateLimits: w.rateLimits,
      ...(w.cost === undefined ? {} : { cost: { usd: w.cost } }),
      context: {
        window: 200_000,
        ...(w.tokens === undefined ? {} : { tokens: w.tokens, percent: Math.round(w.tokens / 2000) }),
        ...(e?.breakdown ? { breakdown: { autoCompactThreshold: w.threshold, rawMaxTokens: w.compactionWindow } } : {}),
      },
    },
  }));
  on("session.id", () => ({ value: SESSION }));
  on("session.cwd", () => ({ value: "/work/widget" }));
  on("command.register", (_: any, e: any) => {
    w.registered.push(e);
    return { value: { command: e.name } };
  });
  on("env.set", (_: any, e: any) => {
    w.env[e.name] = e.value;
    return { value: {} };
  });
  on("fs.exists", (_: any, e: any) => ({ value: w.stored.has(e.path ?? e[0]) }));
  on("fs.read", (_: any, e: any) => {
    const text = w.stored.get(e.path ?? e[0]);
    return text === undefined ? { deny: `ENOENT: ${e.path ?? e[0]}` } : { value: text };
  });
  on("fs.stat", (_: any, e: any) => {
    // A relative path resolves against a working directory, here one standing at "/", which the mod cannot tell from a
    // tool's own: the mod never asks where one lands.
    const real = w.files.get(e.path) ?? (String(e.path).endsWith("store/x.md") ? "/store/x.md" : undefined);
    return real === undefined
      ? { deny: `ENOENT: ${e.path}` }
      : { value: { kind: "file", size: 1, mtimeMs: 0, isLink: false, ...(e.resolve ? { realPath: real } : {}) } };
  });
  on("tool.check", () => ({ ...w.verdict }));
  // A tool runs: its result, or an error result when the scenario says so.
  on("tool.call", () => ({ result: {}, text: "", ...(w.toolFails ? { isError: true } : {}) }));
  on("fs.write", (_: any, e: any) => {
    // The claims a session start writes are kept apart, as the event runs are (SPEC-006 T4).
    if (String(e.path ?? e[0]).endsWith("/capabilities.json")) {
      w.claims.push({ path: e.path ?? e[0], text: e.text ?? e[1] });
      return { value: undefined };
    }
    if (String(e.path ?? e[0]).endsWith("/start.json")) {
      w.ledgers.set(e.path ?? e[0], JSON.parse(e.text ?? e[1]));
      w.stored.set(e.path ?? e[0], e.text ?? e[1]);
      return { value: undefined };
    }
    w.writes.push({ path: e.path ?? e[0], text: e.text ?? e[1] });
    w.stored.set(e.path ?? e[0], e.text ?? e[1]);
    return { value: undefined };
  });
  on("ui.log", (_: any, e: any) => {
    w.logs.push(e.text ?? e);
    return { value: undefined };
  });
  on("session.send", (_: any, e: any) => {
    w.sent.push(e);
    return { isDelivered: true };
  });
  on("command.run", (_: any, e: any) => {
    w.commandsRun.push(e.command);
    return w.commandResult(e);
  });
  on("prompt.submit", (_: any, e: any) => {
    w.submitted.push(e.text);
    return { text: e.text };
  });
  on("session.compact", (_: any, e: any) => {
    w.compactions.push(e);
    return { messages: [{ role: "user", text: "Claude's summary.", toolUses: [] }] };
  });
  on("session.start", (_: any, e: any) => ({ cwd: e.cwd }));
  on("classic.SessionStart", () => (w.hookContext ? { additionalContext: [...w.hookContext] } : {}));
  // The engine's own system prompt, as it composes it.
  on("prompt.compose", () => ({
    sections: [
      { id: "intro", text: "You are Claude Code.", scope: "shared" },
      { id: "memory", text: "Project notes.", scope: "session" },
    ],
  }));
  on("classic.SubagentStop", () => ({}));
  on("turn.complete", () => ({ text: "" }));
  on("turn.start", (_: any, e: any) => ({ turnId: e.turnId }));
  on("session.end", (_: any, e: any) => ({ sessionId: e.sessionId }));
  on("agent.spawn", () => ({ model: "haiku", agentId: "agent-7" }));
  on("turn.step", async function* (_: any, e: any) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "",
      toolUses: [],
      stopReason: "end_turn",
      usage: { ...w.response, output_tokens: 10, model: e.model },
    };
  });
  return w;
}

/** An Agent call as the engine raises its spawn, with the prompt that names (or does not name) a delegation. */
const spawn = (prompt: string): any => ({
  prompt,
  description: "a worker",
  subagentType: "general-purpose",
  provider: { kind: "model" as const, model: "opus" },
  parentModel: "opus",
  tool_use_id: "toolu_1",
  background: false,
  fork: false,
});

/** One model request of the main conversation (or of a worker, with agentId), read to its end. */
async function step($: any, w: any, tokens: number, fields: object = {}) {
  w.tokens = tokens;
  const stream = $.turn.step({ turnId: "turn-1", index: 0, model: "opus", messageCount: 2, ...fields });
  for await (const _ of stream);
  return stream.result;
}

const CONVERSATION = [{ role: "user" as const, text: "Go on with the parser.", toolUses: [] }];

const turnEnd = (reason: "answer" | "aborted") => ({
  turnId: "turn-1",
  reason,
  answer: "Done.",
  durationMs: 1_000,
  isAborted: reason === "aborted",
});

const start = ($: any, fields: object = {}) =>
  $.classic.SessionStart({ source: "startup", session_id: SESSION, cwd: "/work/widget", ...fields });

/** What the mod appended to the main conversation: every row, or only its checkpoint notices or its context rows. */
const appended = (w: any) => w.session.appended().map((row: any) => row.message.content[0].text as string);
const noticesOf = (w: any) => appended(w).filter((text) => text.includes("Keep working until a safe point"));
const rowsOf = (w: any) => appended(w).filter((text) => text.includes("the checkpoint notice comes at"));

test("session start: with a store, pull it, give the scripts the window and the agent the menu; otherwise only what is missing", async ($, on) => {
  const w = world(on);
  w.answers["task here"] = { stdout: MENU };

  expect((await start($)).additionalContext).toBeUndefined();
  expect(w.commands()).toEqual(["session status"]);
  expect(w.env.FREEFLOW_CONTEXT_WINDOW).toBe("200000");

  w.status = store({ transcript: "/home/u/.claude/projects/p/sess-1.jsonl" });
  w.runs.length = 0;
  const result = await start($);
  expect(w.env.FREEFLOW_TRANSCRIPT).toBe("/home/u/.claude/projects/p/sess-1.jsonl");
  // The menu also remembers where a task's repositories are: in the session's folder, beside it, or Freeflow's own (P96).
  expect(w.commands().slice(0, 2)).toEqual(["session status", "store sync --pull"]);
  expect(w.commands()[2]).toStartWith("task here --cwd /work/widget --scan /work/widget:/work:");
  // The rules come with the menu, so the session has them before it takes a task (Spec section 4).
  expect(w.commands()[2]).toEndWith(" --rules --take-back");
  expect(w.commands().length).toBe(3);
  expect(w.runs.every((run) => run.session === SESSION)).toBe(true);
  expect(result.additionalContext).toEqual([`Freeflow task memory:\n${MENU}`]);

  w.runs.length = 0;
  expect((await start($, { source: "compact" })).additionalContext).toBeUndefined();
  expect(w.runs).toEqual([]);

  // What keeps the session from a working store, with who fixes it, comes with the menu or in its place (P94).
  const missing = { what: "the store has no remote", fix: "store remote --url <url>, on the user's word", by: "agent" };
  w.status = store({ missing: [missing] });
  expect((await start($)).additionalContext).toEqual([
    `Freeflow task memory:\n${MENU}- Missing: the store has no remote. Fix (the agent): store remote --url <url>, on the user's word.\n`,
  ]);
  w.status = {
    home: HOME,
    store: false,
    missing: [{ what: "the store is not at /h", fix: "select its repository when starting a session", by: "user" }],
  };
  w.runs.length = 0;
  expect((await start($)).additionalContext).toEqual([
    "Freeflow task memory: the store is not ready.\n- Missing: the store is not at /h. Fix (the user): select its repository when starting a session.",
  ]);
  expect(w.commands()).toEqual(["session status"]);
});

test("a turn's end captures the user's messages with a store, before its store sync, and not without one", async ($, on) => {
  const w = world(on);
  w.answers["task here"] = { stdout: MENU };
  await start($);
  w.status = held(at(0.5), { changed: true });
  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  const ran = w.runs.map((run) => run.args.join(" "));
  expect(ran.findIndex((command) => command.startsWith("discussion capture"))).toBeGreaterThan(-1);
  expect(ran.findIndex((command) => command.startsWith("discussion capture"))).toBeLessThan(ran.indexOf("store sync"));
  expect(w.runs.find((run) => run.args.join(" ").startsWith("discussion capture"))?.session).toBe(SESSION);

  w.status = store({ store: false });
  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.runs.map((run) => run.args.join(" ")).filter((command) => command.startsWith("discussion capture"))).toEqual(
    [],
  );
});

test("a store attached after session start: the turn that ends with it does what session start does with a store, once", async ($, on) => {
  const w = world(on);
  w.answers["task here"] = { stdout: MENU };
  const edit = () => $.tool.check({ tool: "Edit", input: { file_path: RECORD } } as any);

  await start($);
  expect((await edit()).decision).toBe("ask");

  // The store's repository is added to the running session: at the turn's end the transcript is set, the store pulled
  // and the task's repositories remembered (P96), and its files are the agent's to keep (P69).
  w.status = store({ transcript: "/home/u/.claude/projects/p/sess-1.jsonl" });
  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  expect(w.env.FREEFLOW_TRANSCRIPT).toBe("/home/u/.claude/projects/p/sess-1.jsonl");
  expect(w.commands().slice(0, 2)).toEqual(["session status", "store sync --pull"]);
  expect(w.commands()[2]).toStartWith("task here --cwd /work/widget --scan /work/widget:/work:");
  expect(w.commands().length).toBe(3);
  expect(w.runs.every((run) => run.session === SESSION)).toBe(true);
  expect((await edit()).decision).toBe("allow");

  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  expect(w.commands()).toEqual(["session status"]);
  expect(appended(w)).toEqual([]);
});

test("a store attached after session start that takes back the task this session's end released tells the agent so (F36)", async ($, on) => {
  const w = world(on);
  await start($);
  w.status = store();
  w.answers["task here"] = {
    stdout: `Took widget/task-001 back: this session held it until it ended.\n${MENU}`,
  };
  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  expect(w.commands()[2]).toEndWith(" --rules --take-back");
  expect(appended(w)).toEqual(["Freeflow: Took widget/task-001 back: this session held it until it ended."]);
});

test("a request ends: one notice a cycle, at the lower of 75% and a tenth before Claude's threshold, asking for a checkpoint at a safe point", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  await start($);
  const notices = () => noticesOf(w);

  await step($, w, 146_000);
  expect(notices()).toEqual([]);
  await step($, w, 148_000);
  expect(notices().length).toBe(1);
  expect(notices()[0]).toContain(
    "Freeflow, context cycle 1: the context is at 74% of its window (148000 of 200000 tokens)",
  );
  expect(notices()[0]).toContain("Claude Code compacts on its own at about 167000");
  expect(notices()[0]).toContain("Keep working until a safe point: a finished step whose result you know");
  expect(notices()[0]).toContain("bring widget/task-001's Current Context up to date");
  expect(notices()[0]).toContain("checkpoint --record widget/task-001 --compact --input -");
  expect(notices()[0]).toContain("Then end your turn");
  expect(notices()[0]).toContain("the only notice this context cycle");
  // One notice a cycle: no repeats, whether or not the checkpoint has come (P50), and no script runs for it after.
  w.runs.length = 0;
  await step($, w, 158_000);
  await step($, w, 166_000);
  expect(notices().length).toBe(1);
  expect(w.commands()).toEqual([]);

  // Two requests whose notices are made at once still give the cycle one.
  await start($);
  let overlapping: Promise<unknown> | null = null;
  w.beforeRun = (key: string) => {
    if (overlapping !== null || key !== "session status" || w.tokens !== 149_000) return undefined;
    overlapping = step($, w, 150_000);
    return overlapping;
  };
  await step($, w, 149_000);
  w.beforeRun = () => undefined;
  expect(notices().length).toBe(2);

  // A compaction while the notice is being made starts a new cycle, which the request's figures no longer describe:
  // the notice is dropped, and the new cycle still has its own.
  await start($);
  w.answers["view bundle --record"] = { stdout: "THE BUNDLE\n" };
  let compacting: Promise<unknown> | null = null;
  w.beforeRun = (key: string) => {
    if (compacting !== null || key !== "session status" || w.tokens !== 150_000) return undefined;
    compacting = $.session.compact({ trigger: "auto", messages: CONVERSATION });
    return compacting;
  };
  await step($, w, 150_000);
  w.beforeRun = () => undefined;
  expect(notices().length).toBe(2);
  await step($, w, 151_000);
  expect(notices().length).toBe(3);

  // With Claude's automatic compaction off there is no threshold: the notice comes at 75%.
  w.threshold = undefined;
  w.status = store();
  await start($);
  await step($, w, 149_000);
  expect(notices().length).toBe(3);
  await step($, w, 150_000);
  expect(notices().length).toBe(4);
  expect(notices()[3]).toContain("This session holds no task: at that point, write its summary with");
  expect(notices()[3]).toContain("checkpoint --session --compact --input -");
  expect(notices()[3]).not.toContain("compacts on its own");

  // Claude's compaction set to a smaller window than the model's: the notice and the scripts use that window.
  w.threshold = 67_000;
  w.compactionWindow = 100_000;
  w.status = held(at(-30));
  await start($);
  expect(w.env.FREEFLOW_CONTEXT_WINDOW).toBe("100000");
  await step($, w, 56_000);
  expect(notices().length).toBe(4);
  await step($, w, 57_000);
  expect(notices().length).toBe(5);
  expect(notices()[4]).toContain("at 57% of its window (57000 of 100000 tokens)");

  // Without a store, no notice.
  w.status = null;
  await start($);
  await step($, w, 99_000);
  expect(notices().length).toBe(5);
});

test("a request ends: the context shown at 50, 60 and 70% below the notice, once each a cycle, and every row naming the cycle the store counts", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["view bundle --record"] = { stdout: "THE BUNDLE\n" };
  await start($);
  const cycleFile = "/store/sessions/sess-1/cycle.json";

  await step($, w, 99_000);
  expect(appended(w)).toEqual([]);
  await step($, w, 100_000);
  expect(rowsOf(w)).toEqual([
    "Freeflow, context cycle 1: the context is at 50% of its window (100000 of 200000 tokens); the checkpoint notice comes at about 147000 tokens.",
  ]);
  await step($, w, 118_000);
  expect(rowsOf(w).length).toBe(1);
  // Past two marks at once, only the higher one's row; past the notice point, the notice and no row.
  await step($, w, 141_000);
  await step($, w, 146_000);
  await step($, w, 148_000);
  expect(rowsOf(w).length).toBe(2);
  expect(rowsOf(w)[1]).toContain("Freeflow, context cycle 1: the context is at 71%");
  expect(noticesOf(w).length).toBe(1);
  expect(noticesOf(w)[0]).toContain("Freeflow, context cycle 1: the context is at 74%");
  expect(appended(w).length).toBe(3);

  // A compaction moves the count on in the store, and the new cycle has its rows and notice again, naming it.
  const compacted = await $.session.compact({ trigger: "auto", messages: CONVERSATION });
  expect(compacted.skip).toBeUndefined();
  expect(w.stored.get(cycleFile)).toBe('{"cycle":2}\n');
  await step($, w, 30_000);
  await step($, w, 145_000);
  expect(rowsOf(w).length).toBe(3);
  expect(rowsOf(w)[2]).toContain("Freeflow, context cycle 2: the context is at 73%");
  await step($, w, 147_000);
  expect(noticesOf(w)[1]).toContain("Freeflow, context cycle 2:");

  // A resumed session keeps its count, read again from the store; another session starts its own at 1.
  await start($, { source: "resume" });
  await step($, w, 100_000);
  expect(rowsOf(w)[3]).toContain("Freeflow, context cycle 2:");
  w.status = held(at(-30), { session: "sess-2" });
  await start($, { session_id: "sess-2" });
  await step($, w, 100_000);
  expect(rowsOf(w)[4]).toContain("Freeflow, context cycle 1:");

  // Claude's own compaction in a session with no task and no summary is a new cycle too: the count moves on, and the
  // next notice comes.
  w.status = store();
  await start($);
  await step($, w, 150_000);
  expect(noticesOf(w).length).toBe(3);
  await $.session.compact({ trigger: "auto", messages: CONVERSATION });
  expect(w.stored.get(cycleFile)).toBe('{"cycle":3}\n');
  await step($, w, 150_000);
  expect(noticesOf(w).length).toBe(4);
  expect(noticesOf(w)[3]).toContain("Freeflow, context cycle 3:");

  // Without a store, no row, and the store is asked once a mark, not on every request.
  w.status = null;
  await start($);
  const before = appended(w).length;
  w.runs.length = 0;
  await step($, w, 100_000);
  await step($, w, 101_000);
  await step($, w, 102_000);
  expect(appended(w).length).toBe(before);
  expect(w.commands()).toEqual(["session status"]);
});

test("a turn ends: sync a changed store; only checkpoint --compact compacts, once, between turns, then starts the next (P102)", async ($, on) => {
  const w = world(on);
  const REQUEST = `${HOME}/sessions/${SESSION}/compact.json`;
  const request = (done = false) => ({ path: REQUEST, requestedAt: at(2), done });
  w.status = held(at(-30));
  w.answers["view bundle --record"] = { stdout: "THE BUNDLE\n" };
  await start($);
  await w.clock.advance(60_000);
  await step($, w, 160_000);

  // A plain checkpoint after the notice: the store syncs, nothing compacts.
  w.status = held(at(0.5), { changed: true });
  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  // The checkpoint moved the record: the cost governor reads its plan again (SPEC-014 2.3).
  expect(w.commands()).toEqual(["session status", "store sync", `estimate --plan --record ${RECORD} --json`]);
  expect(w.commandsRun).toEqual([]);

  // checkpoint --compact, but the turn was interrupted: nothing compacts.
  w.status = held(at(2), { compact: request() });
  await $.turn.complete(turnEnd("aborted"));
  await w.clock.advance(1);
  expect(w.commandsRun).toEqual([]);

  // The turn ended: the mod runs /compact as the person would, and a prompt starts the next turn. The request is
  // answered only when the engine compacts through the mod's session.compact hook and the bundle is installed.
  w.writes.length = 0;
  await $.turn.complete(turnEnd("answer"));
  expect(w.commandsRun).toEqual([]);
  await w.clock.advance(1);
  expect(w.logs).toEqual([]);
  expect(w.commandsRun).toEqual(["compact"]);
  // The prompt waits for input queued meanwhile to start a turn of its own; none did, so it goes (F35).
  expect(w.submitted).toEqual([]);
  await w.clock.advance(2_000);
  expect(w.submitted.length).toBe(1);
  expect(w.submitted[0]).toContain("Continue from In flight and the Next action.");
  expect(w.writes).toEqual([]);
  await $.session.compact({ trigger: "manual", messages: CONVERSATION });
  expect(w.writes.filter((write) => write.path === REQUEST)).toEqual([
    { path: REQUEST, text: JSON.stringify({ requestedAt: at(2), done: true }, null, 2) },
  ]);

  // A request already answered compacts nothing more.
  w.status = held(at(3), { compact: request(true) });
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.commandsRun).toEqual(["compact"]);
  expect(w.submitted.length).toBe(1);
});

test("a dropped /compact keeps the request: the next turn end tries again, a line says so, and three drops stop it", async ($, on) => {
  const w = world(on);
  const REQUEST = `${HOME}/sessions/${SESSION}/compact.json`;
  w.answers["view bundle --record"] = { stdout: "THE BUNDLE\n" };
  w.status = held(at(-30));
  await start($);
  w.status = held(at(2), { compact: { path: REQUEST, requestedAt: at(2), done: false } });

  // Queued input started the next turn first, and a Stop dropped the queued /compact.
  w.commandResult = () => {
    throw new Error("dropped past a Stop");
  };
  await $.turn.complete(turnEnd("answer"));
  // A second turn end while the first /compact is still queued asks for no other.
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.commandsRun).toEqual(["compact"]);
  expect(w.submitted).toEqual([]);
  expect(w.writes).toEqual([]);
  expect(appended(w).length).toBe(1);
  expect(appended(w)[0]).toMatch(
    /^Freeflow: the compaction your checkpoint asked for did not run \(.+\); it tries again when the next turn ends\.$/,
  );

  // The next turn end tries again; this time it runs, the bundle is installed, and the request is answered.
  w.commandResult = () => ({ text: "Compacted" });
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.commandsRun).toEqual(["compact", "compact"]);
  await w.clock.advance(2_000);
  expect(w.submitted.length).toBe(1);
  await $.session.compact({ trigger: "manual", messages: CONVERSATION });
  expect(w.writes.filter((write) => write.path === REQUEST)).toEqual([
    { path: REQUEST, text: JSON.stringify({ requestedAt: at(2), done: true }, null, 2) },
  ]);

  // A request whose /compact is dropped three times is given up, and the line says what to do.
  w.writes.length = 0;
  w.status = held(at(3), { compact: { path: REQUEST, requestedAt: at(3), done: false } });
  w.commandResult = () => ({ text: "Not compacted: nothing to compact" });
  for (let turn = 0; turn < 3; turn += 1) {
    await $.turn.complete(turnEnd("answer"));
    await w.clock.advance(1);
  }
  expect(w.commandsRun.length).toBe(5);
  expect(w.writes.filter((write) => write.path === REQUEST)).toEqual([
    { path: REQUEST, text: JSON.stringify({ requestedAt: at(3), done: true }, null, 2) },
  ]);
  expect(appended(w).at(-1)).toBe(
    "Freeflow: the compaction your checkpoint asked for did not run (Not compacted: nothing to compact), 3 times; it stops trying. Checkpoint with --compact again, or run /compact.",
  );
});

test("checkpoint --compact compacts before any notice: the agent decides when (P102)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  await start($);
  await w.clock.advance(60_000);
  await step($, w, 20_000);
  w.status = held(at(1), {
    compact: { path: `${HOME}/sessions/${SESSION}/compact.json`, requestedAt: at(1), done: false },
  });
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(noticesOf(w)).toEqual([]);
  expect(w.commandsRun).toEqual(["compact"]);
  await w.clock.advance(2_000);
  expect(w.submitted.length).toBe(1);
});

test("after its compaction, a turn that input queued meanwhile starts first gets no prompt behind it (F35)", async ($, on) => {
  const w = world(on);
  const REQUEST = `${HOME}/sessions/${SESSION}/compact.json`;
  w.status = held(at(-30));
  await start($);
  w.status = held(at(1), { compact: { path: REQUEST, requestedAt: at(1), done: false } });
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.commandsRun).toEqual(["compact"]);
  // A notification queued while the compaction ran starts its turn first, and that turn goes on from the bundle: a
  // prompt now would wait behind it and arrive after it, out of date.
  await $.turn.start({ text: "A background task finished.", turnId: "turn-queued" });
  await w.clock.advance(2_000);
  expect(w.submitted).toEqual([]);

  // A subagent's turn is not the main loop's: after the next compaction, it does not hold the prompt back.
  w.status = held(at(2), { compact: { path: REQUEST, requestedAt: at(2), done: false } });
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.commandsRun).toEqual(["compact", "compact"]);
  await $.turn.start({ text: "Read the callers.", turnId: "turn-worker", agentId: "agent-7" });
  await w.clock.advance(2_000);
  expect(w.submitted.length).toBe(1);
});

test("a compaction: after a checkpoint, the bundle alone; before it, Claude's with the bundle after its summary; without a task, the summary", async ($, on) => {
  const w = world(on);
  w.answers["view bundle --record"] = { stdout: "THE BUNDLE\n" };
  w.answers[`view bundle --record ${RECORD} --fallback`] = { stdout: "THE FALLBACK BUNDLE\n" };
  w.answers["view bundle --session"] = { stdout: "THE SESSION BUNDLE\n" };
  w.status = store();
  await start($);

  // A checkpoint in this cycle and no notice: the user's /compact, or the mod's own call, installs the bundle with no
  // summarizer (P68).
  await w.clock.advance(2 * 60_000);
  w.status = held(at(1));
  const own = await $.session.compact({ trigger: "manual", messages: CONVERSATION });
  expect(own.messages?.map((m: any) => [m.role, m.text])).toEqual([
    ["user", "THE BUNDLE\n"],
    ["assistant", "Recovered from Freeflow's bundle."],
  ]);
  await w.clock.advance(2 * 60_000);
  w.status = held(at(3));
  const plugin = await $.session.compact({ trigger: "plugin", messages: CONVERSATION });
  expect(plugin.messages?.[0]?.text).toBe("THE BUNDLE\n");
  expect(w.compactions).toEqual([]);
  w.status = held(at(1));

  // The compaction started a new cycle: the same checkpoint is now older than it, so Claude compacts first.
  const fallback = await $.session.compact({
    trigger: "manual",
    instructions: "Keep the parser.",
    messages: CONVERSATION,
  });
  expect(w.compactions.length).toBe(1);
  expect(w.compactions[0].instructions).toBe(
    `Keep the parser.\n\nFreeflow: the task's Working Record (widget/task-001) holds the work up to its last checkpoint, ${at(1)}; keep in the summary what happened after that.`,
  );
  expect(fallback.messages?.map((m: any) => m.text)).toEqual(["Claude's summary.", "THE FALLBACK BUNDLE\n"]);

  // A record left invalid mid-edit: no bundle can be made, so a message after Claude's summary says how to recover.
  w.answers[`view bundle --record ${RECORD} --fallback`] = {
    exitCode: 1,
    stderr: "Error: Future Work holds only proposed Slices.\n",
  };
  const unmade = await $.session.compact({ trigger: "auto", messages: CONVERSATION });
  expect(unmade.messages?.map((m: any) => m.text)).toEqual([
    "Claude's summary.",
    expect.stringContaining(
      `Freeflow could not make widget/task-001's bundle: Future Work holds only proposed Slices. Its record, last checkpointed at ${at(1)}, is ${RECORD}`,
    ),
  ]);
  expect(unmade.messages?.[1]?.text).toContain("view recover --record widget/task-001");
  await w.clock.advance(60_000);
  w.answers["view bundle --record"] = { exitCode: 1, stderr: "Error: Future Work holds only proposed Slices.\n" };
  w.status = held(at(10));
  const ownUnmade = await $.session.compact({ trigger: "manual", messages: CONVERSATION });
  expect(ownUnmade.messages?.map((m: any) => m.text.slice(0, 41))).toEqual([
    "Claude's summary.",
    "Freeflow could not make widget/task-001's",
  ]);
  w.answers["view bundle --record"] = { stdout: "THE BUNDLE\n" };
  w.answers[`view bundle --record ${RECORD} --fallback`] = { stdout: "THE FALLBACK BUNDLE\n" };

  // Without a task: the session summary written in this cycle is installed and removed.
  await w.clock.advance(2 * 60_000);
  const summary = "/store/sessions/sess-1/summary.md";
  w.status = store({ summary: { path: summary, asOf: at(13) } });
  w.runs.length = 0;
  const session = await $.session.compact({ trigger: "auto", messages: CONVERSATION });
  expect(session.messages?.[0]?.text).toBe("THE SESSION BUNDLE\n");
  expect(w.runs.map((run) => run.args.at(-1))).toEqual(["status", "--session", summary]);

  // Neither a task nor a summary, and a precomputed one: Claude's compaction as it is.
  w.status = store();
  await $.session.compact({ trigger: "auto", messages: CONVERSATION });
  w.runs.length = 0;
  await $.session.compact({ trigger: "precompute", messages: CONVERSATION });
  expect(w.runs).toEqual([]);
  expect(w.compactions.length).toBe(5);
  expect(w.compactions.slice(-3).every((e: any) => e.instructions === undefined)).toBe(true);
});

test("a worker runs: its delegation comes from the spawn's prompt; near its threshold it is told to keep progress.md; its compaction says how it recovers", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  await start($);

  await $.agent.spawn(spawn("You are the worker for D-012: read delegations/D-012-parser/brief.md."));
  expect(w.writes).toEqual([
    { path: "/store/sessions/sess-1/delegations.json", text: JSON.stringify({ "agent-7": "D-012" }, null, 2) },
  ]);

  w.response = { input_tokens: 100_000, cache_read_input_tokens: 45_000, cache_creation_input_tokens: 1_000 };
  await step($, w, 1_000, { agentId: "agent-7", model: "haiku" });
  expect(w.sent).toEqual([]);
  w.response = { input_tokens: 100_000, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 2_000 };
  await step($, w, 1_000, { agentId: "agent-7", model: "haiku" });
  expect(w.sent.length).toBe(1);
  expect(w.sent[0].to).toBe("agent-7"); // the engine spells { agentId } as the ID
  expect(w.sent[0].text).toContain("At your next safe point, rewrite D-012's progress.md");
  expect(w.commands().filter((command) => command.startsWith("delegate log"))).toEqual([
    `delegate log --record ${RECORD} --id D-012 --append --kind inform --body context at 76%: told to rewrite progress.md --agent agent-7`,
  ]);
  expect(w.session.appended()).toEqual([]);
  // One notice a cycle for a worker too.
  w.response = { input_tokens: 100_000, cache_read_input_tokens: 70_000, cache_creation_input_tokens: 2_000 };
  await step($, w, 1_000, { agentId: "agent-7", model: "haiku" });
  expect(w.sent.length).toBe(1);

  await $.session.compact({ trigger: "auto", agentId: "agent-7", messages: CONVERSATION });
  expect(w.compactions[0].instructions).toContain("view recover --record widget/task-001 --delegation D-012");
  // Its compaction starts the worker's next cycle, with a notice of its own.
  w.response = { input_tokens: 100_000, cache_read_input_tokens: 52_000, cache_creation_input_tokens: 0 };
  await step($, w, 1_000, { agentId: "agent-7", model: "haiku" });
  expect(w.sent.length).toBe(2);

  // An agent whose prompt names no delegation is not watched.
  w.writes.length = 0;
  await $.agent.spawn(spawn("Search the repository for callers of parse()."));
  expect(w.writes).toEqual([]);
});

test("a worker hands back: a return that is not ready sends it back once, saying what is missing", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  await start($);
  await $.agent.spawn(spawn("Work on D-012."));
  const stop = (fields: object = {}) =>
    $.classic.SubagentStop({
      agent_id: "agent-7",
      agent_type: "general-purpose",
      agent_transcript_path: "",
      stop_hook_active: false,
      ...fields,
    });

  w.answers["delegate check-return"] = { exitCode: 1, stderr: "Error: D-012's return is not ready: no return.md.\n" };
  expect((await stop()).block).toBe(
    "Freeflow: D-012's return is not ready: no return.md. Write return.md as your brief says, then hand back.",
  );
  expect(w.commands()).toContain(`delegate check-return --record ${RECORD} --id D-012`);
  // The block is a line in the task's delegation log (SPEC-009 4.2), with the worker's agent ID.
  expect(w.commands()).toContain(
    `delegate log --record ${RECORD} --id D-012 --append --kind blocked --body stop blocked: D-012's return is not ready: no return.md. --agent agent-7`,
  );
  expect((await stop({ stop_hook_active: true })).block).toBeUndefined();

  w.answers["delegate check-return"] = { exitCode: 1, stderr: "Error: No folder for D-012 in /store.\n" };
  expect((await stop()).block).toBeUndefined();
  w.answers["delegate check-return"] = { exitCode: 0, stdout: "D-012's return passes the check.\n" };
  expect((await stop()).block).toBeUndefined();
});

test("the session ends: release the hold and push, as the ending session", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  await $.session.end({ reason: "prompt_input_exit", sessionId: "sess-old", resume: { id: "sess-old" } });
  // As ended, so a resume of this session takes the task back (F36).
  expect(w.commands()).toEqual(["session status", "task release --ended"]);
  expect(w.runs.every((run) => run.session === "sess-old")).toBe(true);

  w.runs.length = 0;
  w.status = store({ changed: true });
  await $.session.end({ reason: "clear", sessionId: "sess-old", resume: { id: "sess-old" } });
  expect(w.commands()).toEqual(["session status", "store sync"]);
});

test("a worker session (SPEC-009): its compaction installs the worker's bundle; its end releases its claims", async ($, on) => {
  const w = world(on);
  const joined = (progressAsOf: string | null) =>
    store({
      delegation: { id: "D-031", task: "widget/task-001", record: RECORD, taskDir: "/t", progressAsOf },
    });
  w.answers[`view bundle --record ${RECORD} --delegation D-031`] = { stdout: "THE WORKER BUNDLE\n" };
  w.status = joined(null);
  await start($);
  // Before its progress checkpoint: Claude's compaction, told whose worker it is, then the worker's bundle.
  const before = await $.session.compact({ trigger: "auto", messages: CONVERSATION });
  expect(w.compactions.at(-1).instructions).toContain("this session is the worker for D-031 of widget/task-001");
  expect(before.messages?.map((m: any) => m.text)).toEqual(["Claude's summary.", "THE WORKER BUNDLE\n"]);
  // After checkpoint --delegation in this cycle: the worker's bundle alone.
  await w.clock.advance(2 * 60_000);
  w.status = joined(at(1));
  const own = await $.session.compact({ trigger: "manual", messages: CONVERSATION });
  expect(own.messages?.map((m: any) => [m.role, m.text])).toEqual([
    ["user", "THE WORKER BUNDLE\n"],
    ["assistant", "Recovered from Freeflow's bundle."],
  ]);
  // Its end: its claims released and the log told it ended, then the store pushed.
  w.runs.length = 0;
  await $.session.end({ reason: "prompt_input_exit", sessionId: "sess-old", resume: { id: "sess-old" } });
  expect(w.commands()).toEqual(["session status", "release --ended", "store sync"]);
});

test("a delegation the Slice waits on comes back (SPEC-009 4.4): one row, and the idle session woken once", async ($, on) => {
  const w = world(on);
  const waiting = (returned: string | null) =>
    held(at(-30), {
      waits: {
        slice: "S-057",
        channel: "/t/channel.jsonl",
        delegations: [{ id: "D-031", returned, at: returned && at(1) }],
      },
    });
  w.status = waiting(null);
  await start($);
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(61_000);
  expect(w.submitted).toEqual([]);
  // The return: after the batching window, one prompt that names it.
  w.status = waiting("done");
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(61_000);
  expect(w.submitted).toEqual(["Freeflow: D-031 returned (done). S-057 waits on it: check it and close it."]);
  // The same return never wakes it again.
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(61_000);
  expect(w.submitted.length).toBe(1);
});

test("two returns within the batching window come as one prompt (SPEC-009 4.4)", async ($, on) => {
  const w = world(on);
  const waiting = (first: string | null, second: string | null) =>
    held(at(-30), {
      waits: {
        slice: "S-057",
        channel: "/t/channel.jsonl",
        delegations: [
          { id: "D-031", returned: first, at: first && at(1) },
          { id: "D-032", returned: second, at: second && at(2) },
        ],
      },
    });
  w.status = waiting(null, null);
  await start($);
  // One return found at a turn end opens the window; another found 30 s later, still inside it, joins it.
  w.status = waiting("done", null);
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(30_000);
  w.status = waiting("done", "done");
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(2 * 60_000);
  expect(w.submitted).toEqual([
    "Freeflow: D-031 returned (done). S-057 waits on it: check it and close it. D-032 returned (done). S-057 waits on it: check it and close it.",
  ]);
});

test("delegation.claimHours reaches Track Work's script and the agent's commands as FREEFLOW_CLAIM_HOURS (SPEC-009 4.7)", async ($, on) => {
  const w = world(on);
  w.settingsAnswers["list "] = {
    stdout: JSON.stringify({
      root: "/work/widget",
      settings: [
        { key: "delegation.claimHours", label: "Claim hours", value: "8", scope: "personal", hosts: "all" },
        { key: "delegation.wakeOnReturn", label: "Wake on return", value: true, scope: "default", hosts: "all" },
      ],
      state: [],
    }),
  };
  w.status = store();
  await start($);
  expect(w.env.FREEFLOW_CLAIM_HOURS).toBe("8");
});

test("a return logged while the session sits idle wakes it within two minutes, with no turn ending (SPEC-009 4.4)", async ($, on) => {
  const w = world(on);
  const waiting = (returned: string | null) =>
    held(at(-30), {
      waits: {
        slice: "S-057",
        channel: "/t/channel.jsonl",
        delegations: [{ id: "D-031", returned, at: returned && at(1) }],
      },
    });
  w.status = waiting(null);
  await start($);
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(5 * 60_000);
  expect(w.submitted).toEqual([]);
  // The worker returns while nothing happens in this session: the next minute's look finds it, then the batch window.
  w.status = waiting("done");
  await w.clock.advance(2 * 60_000 + 1_000);
  expect(w.submitted).toEqual(["Freeflow: D-031 returned (done). S-057 waits on it: check it and close it."]);
  // Nothing is left to wait on, so it stops looking: no second prompt.
  await w.clock.advance(10 * 60_000);
  expect(w.submitted.length).toBe(1);
});

test("the store is the agent's to keep: file tools inside it are allowed where the mode would ask, and nothing else changes", async ($, on) => {
  const w = world(on);
  const check = (tool: string, input: object) => $.tool.check({ tool, input } as any);
  const record = "/store/projects/widget/tasks/task-001-probe/record.md";

  // Without a store, the engine's verdict stands.
  expect((await check("Edit", { file_path: record })).decision).toBe("ask");

  w.status = held(at(-30));
  await start($);
  const allowed = await check("Edit", { file_path: record });
  expect(allowed.decision).toBe("allow");
  expect(allowed.reason).toContain("Freeflow's store");
  // A file not there yet lands in its folder, or its nearest folder that is; a Read, a Grep of the store itself, and a
  // path through a link into it.
  expect(
    (await check("Write", { file_path: "/store/projects/widget/tasks/task-001-probe/sources/words.md" })).decision,
  ).toBe("allow");
  expect(
    (await check("Write", { file_path: "/store/projects/widget/tasks/task-001-probe/notes/2026/talk.md" })).decision,
  ).toBe("allow");
  expect((await check("Read", { file_path: record })).decision).toBe("allow");
  expect((await check("Grep", { pattern: "x", path: "/store" })).decision).toBe("allow");
  expect((await check("Read", { file_path: "/work/widget/memory" })).decision).toBe("allow");

  // Outside the store, a path that only spells its way in, a relative path, a folder beside the store, a shell
  // command: the verdict stands.
  expect((await check("Edit", { file_path: "/work/widget/src.mjs" })).decision).toBe("ask");
  expect((await check("Edit", { file_path: "/store/../etc/passwd" })).decision).toBe("ask");
  expect((await check("Edit", { file_path: "store/x.md" })).decision).toBe("ask");
  expect((await check("Edit", { file_path: "/store-other/notes.md" })).decision).toBe("ask");
  expect(
    (await check("Write", { file_path: "/store/projects/widget/tasks/task-001-probe/none/../../../../../../../etc/x" }))
      .decision,
  ).toBe("ask");
  expect((await check("Bash", { command: `cat ${record}` })).decision).toBe("ask");

  // A deny stands, inside the store too.
  w.verdict = { decision: "deny", rule: "Edit(/store/**)" };
  expect((await check("Edit", { file_path: record })).decision).toBe("deny");
});

const ready = ($: any) => $.session.start({ cwd: "/work/widget", surface: null, isInteractive: false });
const freeflow = ($: any, args: string) => $.command.run({ command: "freeflow", args });
const LISTED = {
  root: "/work/widget",
  settings: [
    { key: "enabled", label: "Freeflow", value: true, scope: "default", hosts: "all" },
    { key: "prompts.enabled", label: "Runtime prompts", value: true, scope: "default", hosts: "all" },
    { key: "prompts.core", label: "Core prompt", value: false, scope: "personal", hosts: "all" },
    { key: "skills.enabled", label: "Skills", value: true, scope: "default", hosts: "all" },
    { key: "skills.write-skill", label: "Skill write-skill", value: true, scope: "default", hosts: "all" },
    { key: "review.unit", label: "Review unit", value: "manual", scope: "repository", hosts: "all" },
    { key: "review.model", label: "Reviewer model", value: "auto", scope: "default", hosts: "all" },
    { key: "review.rounds", label: "Review rounds", value: 3, scope: "default", hosts: "all" },
    { key: "review.depth", label: "Review depth rules", value: null, scope: "default", hosts: "all" },
  ],
  state: ["Review: unit `manual`, model `auto`"],
};

test("/freeflow settings: declared at session start, lists what Claude Code acts on, and changes one with the line the model reads now (SPEC-005 4.4)", async ($, on) => {
  const w = world(on);
  await ready($);
  expect(w.registered.map((command) => command.name)).toEqual(["freeflow"]);
  // enabled, the event log's own switch (SPEC-006 P5), and the cost governor's settings in one list (SPEC-014).
  expect(w.settingsRuns.map((run) => run.args.join(" "))).toEqual([
    "get enabled --root /work/widget --json",
    "get events.enabled --root /work/widget --json",
    // and the gates' modes (SPEC-008 4.5)
    "list --root /work/widget --json",
  ]);
  expect(w.settingsRuns[0].session).toBe(SESSION);

  w.settingsAnswers["list "] = { stdout: JSON.stringify(LISTED) };
  const listed = await freeflow($, "settings");
  expect(w.settingsRuns.at(-1)!.args.join(" ")).toBe("list --host claude-code --root /work/widget --json");
  // Each section's switch and the review always; another key only when a scope sets it.
  expect(listed.text).toStartWith("Freeflow settings for /work/widget (Claude Code)\n  Freeflow ");
  expect(listed.text).toContain("  Core prompt      off       Personal  (prompts.core)");
  expect(listed.text).toContain("  Review unit      manual    Repository\n");
  expect(listed.text).toContain("  Review rounds    3         default\n");
  expect(listed.text).not.toContain("write-skill");
  // review.depth has no row: the repository's file holds it, and the plan reads it from the base.
  expect(listed.text).not.toContain("\n  Review depth rules");
  expect(listed.text).toContain("Review depth rules (review.depth) are edited in .freeflow/config.json");
  expect(listed.text).toContain("Pi-only settings (tool execution, compaction, messaging) are changed");
  expect(listed.context).toBeUndefined();

  w.settingsAnswers["set review.unit manual --scope personal "] = {
    stdout: JSON.stringify({
      key: "review.unit",
      label: "Review unit",
      value: "manual",
      scope: "personal",
      hosts: "all",
      state: ["Review: unit `manual`, model `auto`"],
      changed: ["Review: unit `manual`, model `auto`"],
      cleared: [],
      notes: [],
    }),
  };
  const changed = await freeflow($, "settings review.unit manual");
  expect(changed.text).toBe("Review unit: manual, from .freeflow/local.json (Personal). The agent sees it now.");
  expect(changed.context).toEqual([
    "The user changed a Freeflow setting with /freeflow settings: review.unit is now manual, from .freeflow/local.json (Personal).\nRuntime State now: Review: unit `manual`, model `auto`",
  ]);

  // A scope flag and inherit reach the script as its scope and unset.
  w.settingsAnswers["unset review.unit --scope session "] = {
    stdout: JSON.stringify({
      key: "review.unit",
      label: "Review unit",
      value: "pr",
      scope: "default",
      hosts: "all",
      state: [],
      changed: [],
      cleared: ["Review: unit `manual`, model `auto`"],
      notes: [],
    }),
  };
  const inherited = await freeflow($, "settings review.unit inherit --session");
  expect(inherited.text).toBe("Review unit: pr, from the default. The agent sees it now.");
  expect(inherited.context![0]).toEndWith("\nRuntime State no longer: Review: unit `manual`, model `auto`");

  // A refusal is the script's first line, and the model is told nothing.
  w.settingsAnswers["set review.unit sometimes "] = {
    exitCode: 1,
    stderr: "review.unit takes pr, push, commit, agreement, manual, not sometimes\nUsage: ...",
  };
  const refused = await freeflow($, "settings review.unit sometimes");
  expect(refused).toEqual({
    text: "Freeflow settings: review.unit takes pr, push, commit, agreement, manual, not sometimes",
  });
  expect((await freeflow($, "settings review.unit manual --global")).text).toStartWith(
    "Freeflow settings: unknown option --global.",
  );
  expect((await freeflow($, "status")).text).toBe(
    "Freeflow on Claude Code: /freeflow settings lists Freeflow's settings and changes one; /freeflow capabilities says what Freeflow can do in this session; /freeflow pane opens or closes Freeflow's pane.",
  );
  expect(w.commands()).toEqual([]);
});

test("enabled off: the mod does nothing but serve /freeflow, and turning it on brings the store back at the next turn end (SPEC-005 P6)", async ($, on) => {
  const w = world(on);
  w.enabled = false;
  w.status = held(at(-30), { changed: true });
  w.answers["task here"] = { stdout: MENU };
  await ready($);
  expect((await start($)).additionalContext).toBeUndefined();
  await step($, w, 190_000);
  await $.turn.complete(turnEnd("answer"));
  expect(appended(w)).toEqual([]);
  expect((await $.tool.check({ tool: "Edit", input: { file_path: RECORD } } as any)).decision).toBe("ask");
  const compacted = await $.session.compact({ trigger: "manual", messages: CONVERSATION } as any);
  expect(compacted.messages[0].text).toBe("Claude's summary.");
  expect(w.commands()).toEqual([]);

  // On again with the command: the change says so, and the next turn end does what session start does with a store.
  w.enabled = true;
  w.settingsAnswers["set enabled on --scope personal "] = {
    stdout: JSON.stringify({
      key: "enabled",
      label: "Freeflow",
      value: true,
      scope: "personal",
      hosts: "all",
      state: [],
      changed: [],
      cleared: [],
      notes: [],
    }),
  };
  const on_ = await freeflow($, "settings enabled on");
  expect(on_.text).toContain("Freeflow's task menu, notices and compaction work in this session from its next event.");
  await $.turn.complete(turnEnd("answer"));
  expect(w.commands().slice(0, 2)).toEqual(["session status", "store sync --pull"]);
  expect(w.commands()).toContain("store sync");

  // Off again: from the next event nothing runs.
  w.enabled = false;
  w.settingsAnswers["set enabled off --scope session "] = {
    stdout: JSON.stringify({
      key: "enabled",
      label: "Freeflow",
      value: false,
      scope: "session",
      hosts: "all",
      state: [],
      changed: [],
      cleared: [],
      notes: [],
    }),
  };
  const off = await freeflow($, "settings enabled off --session");
  expect(off.text).toStartWith("Freeflow: off, from this session (Session). The agent sees it now.\n");
  expect(off.context![0]).toContain("no menu, notices, context rows, compaction, hold or sync");
  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  expect(w.commands()).toEqual([]);
});

test("a settings script that fails leaves enabled as it was", async ($, on) => {
  const w = world(on);
  w.settingsAnswers["get enabled "] = {
    exitCode: 1,
    stderr: ".freeflow/config.json is invalid: enabled must be a boolean",
  };
  w.status = store();
  w.answers["task here"] = { stdout: MENU };
  await ready($);
  expect((await start($)).additionalContext).toEqual([`Freeflow task memory:\n${MENU}`]);
});

/** The kinds and agents of the lines flushed so far, in order. */
const kinds = (w: any) =>
  w.events().map((line: any) => (line.agent === "main" ? line.kind : `${line.kind}@${line.agent}`));

test("the event log: each loop event the mod sees is one schema v1 line, in order, written in one run at the turn's end (SPEC-006 4.2)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30), { changed: true });
  w.answers["task here"] = { stdout: MENU };
  await ready($);
  await start($);
  expect(w.eventRuns).toEqual([]);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  w.response = { input_tokens: 3, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 };
  await step($, w, 1_000, { effort: "high" });
  // Allowed, as the mode would: an ask here refuses a test's call, which no person can answer.
  w.verdict = { decision: "allow" };
  await $.tool.call({ tool: "Bash", command: "npm test -- --token=abc123" } as any);
  w.toolFails = true;
  await $.tool.call({ tool: "Edit", file_path: "/work/widget/src.mjs", old_string: "a", new_string: "b" } as any);
  expect(w.eventRuns).toEqual([]);
  await $.turn.complete(turnEnd("answer"));

  // One run, as this session, with every line of the turn.
  expect(w.eventRuns.length).toBe(1);
  expect(w.eventRuns[0].args).toEqual(["events", "append", "--input", "-"]);
  expect(w.eventRuns[0].session).toBe(SESSION);
  expect(kinds(w)).toEqual([
    "session.start",
    "freeflow",
    "freeflow",
    "turn.start",
    "model.request",
    "tool.call",
    "tool.call",
    "turn.end",
    "freeflow",
  ]);
  const lines = w.events();
  for (const line of lines) {
    expect(line.v).toBe(1);
    expect(line.ts).toBe(new Date(T0).toISOString());
    expect(line.session).toBe(SESSION);
    expect(line.harness).toBe("claude-code");
    expect(line.seq).toBeUndefined();
  }
  // A -p run: no one at the prompt (section 4.5).
  expect(lines[0]).toMatchObject({ kind: "session.start", source: "startup", interactive: false });
  expect(lines.filter((line: any) => line.kind === "freeflow").map((line: any) => line.what)).toEqual([
    "capabilities",
    "menu",
    "sync",
  ]);
  expect(lines[3]).toMatchObject({ kind: "turn.start", agent: "main", turn: 1 });
  expect(lines[4]).toMatchObject({
    kind: "model.request",
    model: "opus",
    effort: "high",
    in: 3,
    out: 10,
    cacheRead: 900,
    cacheWrite: 40,
    context: 943,
    stop: "end_turn",
  });
  // The command goes to the writer, which redacts and cuts it; Claude Code gives no exit code.
  expect(lines[5]).toMatchObject({
    kind: "tool.call",
    tool: "Bash",
    ok: true,
    command: "npm test -- --token=abc123",
    source: "agent",
  });
  expect(lines[5].exit).toBeUndefined();
  expect(lines[5].paths).toBeUndefined();
  expect(lines[6]).toMatchObject({ kind: "tool.call", tool: "Edit", ok: false, paths: ["src.mjs"], source: "agent" });
  expect(lines[6].command).toBeUndefined();
  // Never contents: no prompt text, answer, file content or tool output.
  expect(JSON.stringify(lines)).not.toContain("go");
  expect(JSON.stringify(lines)).not.toContain("Done.");
  expect(JSON.stringify(lines)).not.toContain("old_string");
  expect(lines[7]).toMatchObject({ kind: "turn.end", turn: 1, reason: "answer", ms: 1_000 });

  // Nothing new, nothing written.
  await $.turn.complete(turnEnd("answer"));
  expect(w.eventRuns.length).toBe(2);
  expect(kinds(w).slice(9)).toEqual(["turn.end", "freeflow"]);
});

test("the event log is written at a compaction, a worker's hand-back and the session's end, and before a checkpoint or release runs (T2)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  await ready($);
  await start($);
  // A worker's turn and its stop: its lines carry its agent ID, and its hand-back writes them.
  await $.agent.spawn(spawn("Do D-012's part."));
  await $.turn.start({ text: "x", turnId: "turn-w", agentId: "agent-7" } as any);
  await step($, w, 1_000, { agentId: "agent-7", model: "haiku" });
  await $.turn.complete({ ...turnEnd("answer"), agentId: "agent-7" } as any);
  expect(w.eventRuns).toEqual([]);
  await $.classic.SubagentStop({ agent_id: "agent-7", agent_type: "general-purpose", stop_hook_active: false } as any);
  expect(w.eventRuns.length).toBe(1);
  expect(kinds(w).slice(-5)).toEqual([
    "agent.spawn@agent-7",
    "turn.start@agent-7",
    "model.request@agent-7",
    "turn.end@agent-7",
    "agent.stop@agent-7",
  ]);
  expect(w.events().at(-5)).toMatchObject({ delegation: "D-012", model: "haiku" });
  expect(w.events().at(-1)).toMatchObject({ blocked: false });

  // A checkpoint the agent runs: the lines so far are written first, so the summary it commits counts them.
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  await $.tool.call({
    tool: "Bash",
    command: `node ${w.scriptPath} checkpoint --record widget/task-001 --input -`,
  } as any);
  expect(w.eventRuns.length).toBe(2);
  expect(kinds(w).at(-1)).toBe("turn.start");

  // A compaction of the main conversation, before the checkpoint: Claude's, by the harness; written before it answers.
  w.tokens = 150_000;
  await $.session.compact({ trigger: "manual", messages: CONVERSATION } as any);
  expect(w.eventRuns.length).toBe(3);
  expect(w.events().at(-1)).toMatchObject({ kind: "compaction", trigger: "manual", by: "harness", before: 150_000 });
  // A script under Freeflow's own plugin is Freeflow's overhead, which Part 8 counts.
  expect(w.scriptPath).toEndWith("/skills/track-work/scripts/working-record.mjs");
  expect(w.events().at(-2)).toMatchObject({ kind: "tool.call", tool: "Bash", source: "freeflow" });

  // After a checkpoint made in the cycle, Freeflow's own.
  w.status = held(at(30));
  w.answers["view bundle"] = { stdout: "BUNDLE" };
  await $.session.compact({ trigger: "manual", messages: CONVERSATION } as any);
  expect(w.events().at(-1)).toMatchObject({ kind: "compaction", by: "freeflow" });

  // The session's end: its line, written before the hold is released, so the release's summary has it.
  w.runs.length = 0;
  await $.session.end({ reason: "prompt_input_exit", sessionId: SESSION } as any);
  expect(w.events().at(-1)).toMatchObject({ kind: "session.end", reason: "prompt_input_exit" });
  expect(w.eventRuns.at(-1)!.session).toBe(SESSION);
  expect(w.commands()).toEqual(["session status", "task release --ended"]);
});

test("a flush that fails drops its lines and says so: one log line now, and a dropped line first in the next flush (section 5)", async ($, on) => {
  const w = world(on);
  await ready($);
  await start($);
  w.eventAnswer = { exitCode: 1, stderr: "Error: sess-1.jsonl is locked by another writer" };
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  await $.turn.complete(turnEnd("answer"));
  // The session's start, its claims, the turn's start and end.
  expect(w.logs.at(-1)).toBe("Freeflow: 4 event line(s) not written: sess-1.jsonl is locked by another writer");
  w.eventAnswer = { stdout: "Wrote" };
  await $.turn.start({ text: "go", turnId: "turn-2" } as any);
  await $.turn.complete(turnEnd("answer"));
  const last = String(w.eventRuns.at(-1)!.stdin)
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(last.map((line: any) => line.kind)).toEqual(["freeflow", "turn.start", "turn.end"]);
  // Only the fields schema v1 gives a freeflow line, whatever line came first (the writer refuses any other).
  expect(last[0]).toEqual({
    v: 1,
    ts: new Date(T0).toISOString(),
    session: SESSION,
    harness: "claude-code",
    agent: "main",
    kind: "freeflow",
    what: "dropped",
    dropped: 4,
  });
  // Written, the count starts again.
  await $.turn.start({ text: "go", turnId: "turn-3" } as any);
  await $.turn.complete(turnEnd("answer"));
  expect(String(w.eventRuns.at(-1)!.stdin)).not.toContain("dropped");
});

test("events.enabled off writes no line and claims sensors only as possible; Freeflow off writes nothing (P5)", async ($, on) => {
  const w = world(on);
  w.eventsEnabled = false;
  w.status = store();
  await ready($);
  await start($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  await $.tool.call({ tool: "Bash", command: "ls" } as any);
  await $.turn.complete(turnEnd("answer"));
  expect(w.eventRuns).toEqual([]);
  const claims = JSON.parse(w.claims.at(-1)!.text);
  expect(claims.events).toBe(false);
  expect(claims.claims.sensors).toEqual({ claim: "possible", how: "the event log is off (events.enabled)" });

  // On again with the command: the claims follow at once, and the next turn's lines are written.
  w.eventsEnabled = true;
  w.settingsAnswers["set events.enabled on --scope session "] = {
    stdout: JSON.stringify({
      key: "events.enabled",
      label: "Event log",
      value: true,
      scope: "session",
      hosts: "all",
      state: [],
      changed: [],
      cleared: [],
      notes: [],
    }),
  };
  await freeflow($, "settings events.enabled on --session");
  expect(JSON.parse(w.claims.at(-1)!.text).claims.sensors.claim).toBe("yes");
  await $.turn.start({ text: "go", turnId: "turn-2" } as any);
  await $.turn.complete(turnEnd("answer"));
  expect(kinds(w)).toEqual(["freeflow", "turn.start", "turn.end"]);

  // Freeflow off: no claims but no, and nothing written.
  w.enabled = false;
  w.settingsAnswers["set enabled off --scope session "] = {
    stdout: JSON.stringify({
      key: "enabled",
      label: "Freeflow",
      value: false,
      scope: "session",
      hosts: "all",
      state: [],
      changed: [],
      cleared: [],
      notes: [],
    }),
  };
  await freeflow($, "settings enabled off --session");
  const off = JSON.parse(w.claims.at(-1)!.text);
  expect(off.enabled).toBe(false);
  expect(Object.values(off.claims).every((claim: any) => claim.claim === "no")).toBe(true);
  const runs = w.eventRuns.length;
  await $.turn.start({ text: "go", turnId: "turn-3" } as any);
  await $.tool.call({ tool: "Bash", command: "ls" } as any);
  await $.turn.complete(turnEnd("answer"));
  expect(w.eventRuns.length).toBe(runs);
});

test("the claims: written at session start in the Freeflow home, with section 4.5's claims for an interactive and a headless session", async ($, on) => {
  const w = world(on);
  w.status = store();
  await $.session.start({ cwd: "/work/widget", surface: "terminal", isInteractive: true } as any);
  await start($);
  expect(w.claims.map((write) => write.path)).toEqual(["/store/sessions/sess-1/capabilities.json"]);
  const file = JSON.parse(w.claims[0].text);
  expect(file).toMatchObject({
    v: 1,
    requestSet: 1,
    driver: "claude-code-mod",
    mode: "interactive",
    enabled: true,
    events: true,
  });
  const claimOf = (claims: any) =>
    Object.fromEntries(Object.entries(claims).map(([request, each]: any) => [request, each.claim]));
  expect(claimOf(file.claims)).toEqual({
    pin: "yes",
    inject: "yes",
    forget: "no",
    compact: "yes",
    checkpoint: "yes",
    rewind: "no",
    route: "possible",
    spawn: "possible",
    send: "yes",
    wake: "yes",
    ask: "possible",
    block: "yes",
    sensors: "yes",
    timers: "yes",
  });
  // Each yes has its conformance test (conformance.mjs; hooks/tests checks each test exists).
  expect(
    Object.entries(file.claims)
      .filter(([, each]: any) => each.claim === "yes")
      .map(([request]) => request)
      .sort(),
  ).toEqual(Object.keys(CONFORMANCE).sort());
  // Every claim says how, or why not.
  expect(Object.values(file.claims).every((each: any) => typeof each.how === "string" && each.how.length > 0)).toBe(
    true,
  );

  // Headless (-p): nothing runs between turns, so no wake, and compaction only on the next one that comes (P51).
  await ready($);
  await start($);
  const headless = JSON.parse(w.claims.at(-1)!.text);
  expect(headless.mode).toBe("headless");
  expect(headless.claims.wake).toEqual({ claim: "no", how: "nothing runs between turns in a headless run" });
  expect(headless.claims.compact).toEqual({
    claim: "yes",
    how: "on the next compaction; it cannot start one in a headless run",
  });

  // In the other order, the classic SessionStart before session.start, the claims are written again once it says
  // a headless run, as a -p run's are.
  await $.session.start({ cwd: "/work/widget", surface: "terminal", isInteractive: true } as any);
  await start($);
  expect(JSON.parse(w.claims.at(-1)!.text).mode).toBe("interactive");
  await ready($);
  expect(JSON.parse(w.claims.at(-1)!.text).mode).toBe("headless");

  // A session start with no Freeflow home to read writes none.
  w.claims.length = 0;
  w.answers["session status"] = { exitCode: 1, stderr: "broken" };
  await start($);
  expect(w.claims).toEqual([]);
});

test("/freeflow capabilities prints the capabilities script's listing for this session (section 4.6)", async ($, on) => {
  const w = world(on);
  await ready($);
  const listed = await freeflow($, "capabilities");
  expect(w.capabilityRuns).toEqual([{ args: ["list"], session: SESSION }]);
  expect(listed.text).toBe("Freeflow on Claude Code (claude-code-mod 0.9.0, request set 1, interactive)");
  w.capabilityAnswer = { exitCode: 2, stderr: "Error: Unknown option --x\n" };
  expect((await freeflow($, "capabilities")).text).toBe("Freeflow capabilities: Unknown option --x");
  expect(w.commands()).toEqual([]);
});

// The golden event log (SPEC-006 4.7): a scripted session through the mod, its lines normalized (the plugin's path on
// this machine) and compared on kinds, order and fields with golden-events.mjs. A change to what the mod writes fails
// here until that file is updated on purpose, with the lines this test prints. The mods test kit runs no process, so
// hooks/tests/golden-events.test.mjs runs the same lines through Track Work's real `events append`: the schema test.
import CONFORMANCE from "./conformance.mjs";
import GOLDEN from "./golden-events.mjs";

test("the golden event log: a scripted session through the mod matches golden-events.mjs (4.7)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  w.answers["view bundle"] = { stdout: "BUNDLE" };
  w.verdict = { decision: "allow" };
  await $.session.start({ cwd: "/work/widget", surface: "terminal", isInteractive: true } as any);
  await start($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  w.response = { input_tokens: 4, cache_read_input_tokens: 2_000, cache_creation_input_tokens: 300 };
  await step($, w, 2_304, { effort: "high" });
  await $.tool.call({ tool: "Bash", command: "npm test -- --token=abc123" } as any);
  await $.tool.call({ tool: "Read", file_path: "/work/widget/src.mjs" } as any);
  // A delivery step: the delivery gate warns and logs it (SPEC-008 4.4).
  await $.tool.call({ tool: "Bash", command: "git push origin main" } as any);
  await $.agent.spawn(spawn("Do D-012's part."));
  await $.turn.start({ text: "x", turnId: "turn-w", agentId: "agent-7" } as any);
  await step($, w, 1_000, { agentId: "agent-7", model: "haiku" });
  await $.turn.complete({ ...turnEnd("answer"), agentId: "agent-7" } as any);
  await $.classic.SubagentStop({ agent_id: "agent-7", agent_type: "general-purpose", stop_hook_active: false } as any);
  await $.tool.call({
    tool: "Bash",
    command: `node ${w.scriptPath} checkpoint --record widget/task-001 --input -`,
  } as any);
  await $.turn.complete(turnEnd("answer"));
  // The checkpoint is done: Freeflow's own compaction, then the session's end.
  w.status = held(at(30));
  w.tokens = 150_000;
  await $.session.compact({ trigger: "manual", messages: CONVERSATION } as any);
  await $.session.end({ reason: "prompt_input_exit", sessionId: SESSION } as any);

  const root = w.scriptPath.slice(0, -"/skills/track-work/scripts/working-record.mjs".length);
  const lines = w
    .events()
    .map((line: any) =>
      line.command ? { ...line, command: String(line.command).split(root).join("<plugin>") } : line,
    );
  if (JSON.stringify(lines) !== JSON.stringify(GOLDEN))
    console.log(`golden-events.mjs would be:\n${JSON.stringify(lines, null, 2)}`);
  expect(lines).toEqual(GOLDEN);
});

// The cost governor (SPEC-014 2.3): the plan's seven-day window at a daily pace, the task's plan, governor.cap.
const RESETS = new Date(T0 + 4.5 * 86_400_000).toISOString();
const governorRows = (w: any) => appended(w).filter((text) => text.startsWith("Freeflow cost governor:"));
const governorLines = (w: any) => w.events().filter((line: any) => line.kind === "governor");
const governorSettings = (mode: string, cap: number | null = null) => ({
  stdout: JSON.stringify({
    root: "/work/widget",
    settings: [
      { key: "governor.mode", label: "Cost governor", value: mode, scope: "personal", hosts: "claude-code" },
      {
        key: "governor.cap",
        label: "Cost cap",
        value: cap,
        scope: cap === null ? "default" : "personal",
        hosts: "claude-code",
      },
    ],
    state: [],
  }),
});

test("the cost governor on a subscription: the daily pace, no row below 80%, one row at 80%, one notice at 100% under warn", async ($, on) => {
  const w = world(on);
  w.status = store();
  await start($);
  // 4.5 days to the reset: this day of the window began 12 hours ago, and 5 days are left from it.
  const seven = (percentUsed: number) => [
    { kind: "five_hour", percentUsed: 99, resetsAt: at(60) },
    { kind: "seven_day", percentUsed, resetsAt: RESETS },
  ];
  w.rateLimits = seven(50);
  await step($, w, 1_000);
  // The first reading starts the day, kept beside the event log for every session of the day: 50% left over 5 days.
  expect(JSON.parse(w.stored.get(`${HOME}/events/governor.json`))).toEqual({
    resetsAt: RESETS,
    dayStart: "2026-10-29T00:00:00.000Z",
    percent: 50,
  });
  w.rateLimits = seven(57.9);
  await step($, w, 1_000);
  expect(governorRows(w)).toEqual([]);
  // 8% used today, of a 10% pace: one row, and not again.
  w.rateLimits = seven(58);
  await step($, w, 1_000);
  w.rateLimits = seven(59);
  await step($, w, 1_000);
  expect(governorRows(w)).toEqual([
    `Freeflow cost governor: this day of the seven-day window used 8% of it, against a daily pace of 10% (50% left over 5 day(s)), 80% of the cap; it resets at ${RESETS}.`,
  ]);
  // The pace reached: one notice, under warn only a notice.
  w.rateLimits = seven(60);
  await step($, w, 1_000);
  w.rateLimits = seven(63);
  await step($, w, 1_000);
  expect(governorRows(w).length).toBe(2);
  expect(governorRows(w)[1]).toStartWith(
    "Freeflow cost governor: a cap is reached: this day of the seven-day window used 10% of it, against a daily pace of 10%",
  );
  expect(governorRows(w)[1]).toEndWith(
    "Say so to the user in your next answer; Freeflow only notifies (governor.mode warn).",
  );
  await $.turn.complete(turnEnd("answer"));
  expect(
    governorLines(w).map(({ cap, unit, limit, use, response }: any) => ({ cap, unit, limit, use, response })),
  ).toEqual([
    { cap: "pace", unit: "percent", limit: 10, use: 8, response: "row" },
    { cap: "pace", unit: "percent", limit: 10, use: 10, response: "notice" },
  ]);

  // The next day of the window starts from where this one ended: 37% left over 4 days.
  await w.clock.advance(13 * 3_600_000);
  w.rateLimits = seven(63);
  await step($, w, 1_000);
  expect(JSON.parse(w.stored.get(`${HOME}/events/governor.json`))).toMatchObject({
    dayStart: "2026-10-30T00:00:00.000Z",
    percent: 63,
  });
  w.rateLimits = seven(70.4);
  await step($, w, 1_000);
  expect(governorRows(w).at(-1)).toStartWith(
    "Freeflow cost governor: this day of the seven-day window used 7.4% of it, against a daily pace of 9.3% (37% left over 4 day(s))",
  );
});

test("the cost governor under stop: the ask to stop at 100%; a held task's plan in dollars; governor.cap over either", async ($, on) => {
  const w = world(on);
  w.settingsAnswers["list "] = governorSettings("stop");
  w.status = held(at(-30));
  w.answers["estimate --plan"] = { stdout: JSON.stringify({ total: { usd: 3, usdLow: 2, usdHigh: 4 } }) };
  await start($);
  // An API-key session: no window, the cost in dollars. The plan is read at the turn's end, with the cost then.
  w.cost = 1;
  await $.turn.complete(turnEnd("answer"));
  expect(w.commands()).toContain(`estimate --plan --record ${RECORD} --json`);
  w.cost = 4.1;
  await step($, w, 1_000);
  expect(governorRows(w)).toEqual([]);
  w.cost = 4.2;
  await step($, w, 1_000);
  expect(governorRows(w)).toEqual([
    "Freeflow cost governor: widget/task-001 cost $3.20 at API list price since its plan was read, of $4.00, the high end its open Slices are predicted to cost, 80% of the cap.",
  ]);
  // Straight past 100%: the ask, under stop.
  w.cost = 5.5;
  await step($, w, 1_000);
  expect(governorRows(w)[1]).toStartWith(
    "Freeflow cost governor: a cap is reached: widget/task-001 cost $4.50 at API list price since its plan was read, of $4.00",
  );
  expect(governorRows(w)[1]).toContain("Stop at your next safe point:");
  expect(governorRows(w)[1]).toEndWith(
    "Checkpoint there (your task's record, or this session's summary), then end your turn asking the user whether to go on (governor.mode stop).",
  );
  await $.turn.complete(turnEnd("answer"));
  expect(governorLines(w).map(({ cap, unit, response }: any) => [cap, unit, response])).toEqual([
    ["task", "usd", "row"],
    ["task", "usd", "ask"],
  ]);
  // The plan is read once while the record stands.
  expect(w.commands().filter((command: string) => command.startsWith("estimate")).length).toBe(1);

  // governor.cap in dollars replaces the plan's cap where there is no window.
  w.settingsAnswers["list "] = governorSettings("stop", 6);
  w.settingsAnswers["set governor.cap"] = {
    stdout: JSON.stringify({
      key: "governor.cap",
      label: "Cost cap",
      value: 6,
      scope: "personal",
      notes: [],
      changed: [],
      cleared: [],
    }),
  };
  await freeflow($, "settings governor.cap 6");
  await step($, w, 1_000);
  expect(governorRows(w).at(-1)).toBe(
    "Freeflow cost governor: this session has cost $5.50 at API list price, of the $6.00 your governor.cap sets, 92% of the cap.",
  );
  // On a subscription it is a percent of the seven-day window, in place of the pace.
  w.rateLimits = [{ kind: "seven_day", percentUsed: 5.5, resetsAt: RESETS }];
  w.cost = 5.6;
  await step($, w, 1_000);
  expect(governorRows(w).at(-1)).toBe(
    `Freeflow cost governor: the seven-day window is 5.5% used, of the 6% your governor.cap sets, 92% of the cap; it resets at ${RESETS}.`,
  );
});

test("the cost governor stays quiet with no window and no cost, and with Freeflow off", async ($, on) => {
  const w = world(on);
  w.status = store();
  await start($);
  await step($, w, 1_000);
  w.rateLimits = [{ kind: "seven_day", percentUsed: 100, resetsAt: RESETS }];
  w.enabled = false;
  await ready($);
  await step($, w, 1_000);
  expect(governorRows(w)).toEqual([]);
});

// Freeflow arriving mid-session, and its guidance pinned (SPEC-013).
const LEDGER = `${HOME}/sessions/${SESSION}/start.json`;
const STEPS = ["window", "cycle", "capabilities", "sync", "menu", "guidance"];
const SECTION = "CORE GUIDANCE\n\nTHE CONTRACT\n\nTHE METHOD";
const MID_SESSION =
  "Freeflow started mid-session: its session start did not run in this session, so what it gives a session at its start follows now.";
const COMPOSE = { model: "opus", promptModel: "opus", surfaces: [], tools: [], outputStyle: null, traits: [] } as any;
/** The settings script's answer to a change of one key, with no Runtime State lines. */
const changeOf = (key: string, value: unknown) => ({
  stdout: JSON.stringify({
    key,
    label: key,
    value,
    scope: "personal",
    hosts: "all",
    state: [],
    changed: [],
    cleared: [],
    notes: [],
  }),
});

test("the guidance pinned: one section of the system prompt, the hooks' own text, their copies left out while it is there, still there after a compaction, and rendered again once at a settings change (SPEC-013)", async ($, on) => {
  const w = world(on);
  w.status = store();
  w.answers["task here"] = { stdout: MENU };
  // The three session-start hooks' texts, and another plugin's context, which stays.
  w.hookContext = ["CORE GUIDANCE", "THE CONTRACT", "THE METHOD", "ANOTHER PLUGIN'S CONTEXT"];
  await $.session.start({ cwd: "/work/widget", surface: "terminal", isInteractive: true } as any);
  expect((await start($)).additionalContext).toEqual(["ANOTHER PLUGIN'S CONTEXT", `Freeflow task memory:\n${MENU}`]);
  // Rendered by the hooks' own renderer, for the session's folder and the session.
  expect(w.sectionRuns).toEqual([{ args: ["section", "--cwd", "/work/widget"], session: SESSION }]);

  // The engine's sections first, as it composed them, then Freeflow's after the cache boundary's session side.
  const composed = await $.prompt.compose(COMPOSE);
  expect(composed.sections).toEqual([
    { id: "intro", text: "You are Claude Code.", scope: "shared" },
    { id: "memory", text: "Project notes.", scope: "session" },
    { id: "freeflow:guidance", text: SECTION, scope: "session" },
  ]);
  // Every request's prompt the same: no render, no change.
  expect((await $.prompt.compose(COMPOSE)).sections).toEqual(composed.sections);
  expect(w.sectionRuns.length).toBe(1);
  expect(w.ledgers.get(LEDGER)).toMatchObject({ v: 1, pinned: true });
  expect(Object.keys(w.ledgers.get(LEDGER).steps).sort()).toEqual([...STEPS].sort());

  // A turn starts: its session start ran, so nothing comes twice.
  w.runs.length = 0;
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  expect(appended(w)).toEqual([]);
  expect(w.runs).toEqual([]);

  // A compaction: the hooks deliver again and their copies are left out; the prompt starts over with the section.
  await $.session.compact({ trigger: "manual", messages: CONVERSATION } as any);
  expect((await start($, { source: "compact" })).additionalContext).toEqual(["ANOTHER PLUGIN'S CONTEXT"]);
  expect((await $.prompt.compose(COMPOSE)).sections.at(-1)).toEqual({
    id: "freeflow:guidance",
    text: SECTION,
    scope: "session",
  });
  expect(w.ledgers.get(LEDGER).pinned).toBe(true);

  // A settings change renders the section again, once; the next prompt the engine composes carries it.
  const renders = w.sectionRuns.length;
  w.parts = ["CORE GUIDANCE", "THE CONTRACT", ""];
  w.settingsAnswers["set prompts.workingMethod off --scope personal "] = changeOf("prompts.workingMethod", false);
  await freeflow($, "settings prompts.workingMethod off");
  expect(w.sectionRuns.length).toBe(renders + 1);
  expect((await $.prompt.compose(COMPOSE)).sections.at(-1)!.text).toBe("CORE GUIDANCE\n\nTHE CONTRACT");
  await $.prompt.compose(COMPOSE);
  expect(w.sectionRuns.length).toBe(renders + 1);

  // --bare keeps its one section; and with Freeflow off there is no section to send.
  expect((await $.prompt.compose({ ...COMPOSE, traits: ["bare"] })).sections.map((s: any) => s.id)).toEqual([
    "intro",
    "memory",
  ]);
  w.enabled = false;
  w.settingsAnswers["set enabled off --scope personal "] = changeOf("enabled", false);
  await freeflow($, "settings enabled off");
  expect((await $.prompt.compose(COMPOSE)).sections.map((s: any) => s.id)).toEqual(["intro", "memory"]);
});

test("a resumed thread keeps the prompt it recorded: the hooks' copies are left out only where its ledger says the section was there (SPEC-013)", async ($, on) => {
  const w = world(on);
  w.status = store();
  w.answers["task here"] = { stdout: MENU };
  w.hookContext = ["CORE GUIDANCE", "THE CONTRACT", "THE METHOD"];
  await start($);
  expect(w.ledgers.get(LEDGER).pinned).toBe(true);
  // The ledger read on resume is the store's, from the Freeflow home the renderer names.
  expect((await start($, { source: "resume" })).additionalContext).toEqual([`Freeflow task memory:\n${MENU}`]);

  // A thread recorded before the section existed, or a fork, which is a new session: the hooks keep the job.
  w.stored.delete(LEDGER);
  w.ledgers.clear();
  expect((await start($, { source: "resume" })).additionalContext).toEqual([
    "CORE GUIDANCE",
    "THE CONTRACT",
    "THE METHOD",
    `Freeflow task memory:\n${MENU}`,
  ]);
  expect(w.ledgers.get(LEDGER).pinned).toBe(false);
  // Its compaction starts the prompt over, with the section.
  expect((await start($, { source: "compact" })).additionalContext).toBeUndefined();
  expect(w.ledgers.get(LEDGER).pinned).toBe(true);

  // A renderer that fails leaves the hooks' copies in place.
  w.sectionAnswer = { exitCode: 1, stderr: "Error: no prompts\n" };
  expect((await start($)).additionalContext).toEqual([
    "CORE GUIDANCE",
    "THE CONTRACT",
    "THE METHOD",
    `Freeflow task memory:\n${MENU}`,
  ]);
  expect(w.logs.at(-1)).toBe(
    "Freeflow: the guidance could not be rendered: Error: no prompts; the session-start hooks keep it",
  );
});

test("Freeflow arriving mid-session: a session whose start never ran gets the guidance, the menu and its claims at its first turn's start, once (SPEC-013)", async ($, on) => {
  const w = world(on);
  w.status = store({ transcript: "/home/u/.claude/projects/p/sess-1.jsonl" });
  w.answers["task here"] = { stdout: MENU };
  // The module loads into a running session: no SessionStart comes.
  await $.session.start({ cwd: "/work/widget", surface: "terminal", isInteractive: true } as any);
  expect(w.runs).toEqual([]);

  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  expect(appended(w)).toEqual([`${MID_SESSION}\n\n${SECTION}\n\nFreeflow task memory:\n${MENU.trimEnd()}`]);
  // What session start does with a store: the transcript, a pull, the menu with the repositories and the take-back.
  expect(w.commands().slice(0, 2)).toEqual(["session status", "store sync --pull"]);
  expect(w.commands()[2]).toStartWith("task here --cwd /work/widget --scan /work/widget:/work:");
  expect(w.commands()[2]).toEndWith(" --rules --take-back");
  expect(w.env.FREEFLOW_TRANSCRIPT).toBe("/home/u/.claude/projects/p/sess-1.jsonl");
  expect(w.env.FREEFLOW_CONTEXT_WINDOW).toBe("200000");
  expect(w.claims.map((write) => write.path)).toEqual(["/store/sessions/sess-1/capabilities.json"]);
  // The ledger keeps every step; the thread's prompt was recorded without the section.
  expect(w.ledgers.get(LEDGER).pinned).toBe(false);
  expect(Object.keys(w.ledgers.get(LEDGER).steps).sort()).toEqual([...STEPS].sort());
  // The store's files are the agent's to keep from now.
  expect((await $.tool.check({ tool: "Edit", input: { file_path: RECORD } } as any)).decision).toBe("allow");

  // Once: the next turns run nothing for it, and the turn end does not take the store up again.
  const runs = w.runs.length;
  await $.turn.complete(turnEnd("answer"));
  await $.turn.start({ text: "go on", turnId: "turn-2" } as any);
  expect(appended(w).length).toBe(1);
  expect(w.commands().slice(runs)).toEqual(["session status"]);
  expect(w.events().filter((line: any) => line.kind === "freeflow")).toEqual([
    expect.objectContaining({ what: "capabilities" }),
    expect.objectContaining({ what: "menu", detail: "mid-session: window, cycle, capabilities, guidance, sync, menu" }),
  ]);
});

test("a normal session gets nothing twice, and a reloaded mod reads the ledger its session start kept (SPEC-013)", async ($, on) => {
  const w = world(on);
  w.status = store();
  w.answers["task here"] = { stdout: MENU };
  w.stored.set(
    LEDGER,
    JSON.stringify({ v: 1, steps: Object.fromEntries(STEPS.map((step) => [step, at(-5)])), pinned: true }),
  );
  // The mod reloads mid-session: one status read finds the ledger complete, and nothing else runs.
  await ready($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  await $.turn.start({ text: "go on", turnId: "turn-2" } as any);
  expect(w.commands()).toEqual(["session status"]);
  expect(appended(w)).toEqual([]);
  expect(w.sectionRuns).toEqual([]);
});

test("enabled switched on mid-session: the next turn's start does what the session start it skipped would have (SPEC-013)", async ($, on) => {
  const w = world(on);
  w.enabled = false;
  w.status = store();
  w.answers["task here"] = { stdout: MENU };
  await ready($);
  await start($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  expect(w.commands()).toEqual([]);
  expect(appended(w)).toEqual([]);
  // Off, nothing is rendered either.
  expect(w.sectionRuns).toEqual([]);

  w.enabled = true;
  w.settingsAnswers["set enabled on --scope personal "] = changeOf("enabled", true);
  await freeflow($, "settings enabled on");
  await $.turn.start({ text: "go on", turnId: "turn-2" } as any);
  expect(appended(w)).toEqual([`${MID_SESSION}\n\n${SECTION}\n\nFreeflow task memory:\n${MENU.trimEnd()}`]);
  // The turn end that follows does not take the store up a second time.
  await $.turn.complete(turnEnd("answer"));
  expect(w.commands().filter((command) => command === "store sync --pull").length).toBe(1);
});

test("a catch-up step that fails is logged and tried once more at the next turn, then left (SPEC-013 section 4)", async ($, on) => {
  const w = world(on);
  w.status = store();
  w.answers["task here"] = { exitCode: 1, stderr: "Error: the store is locked\n" };
  await ready($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  // What ran is delivered; the menu is not, and the log says why.
  expect(appended(w)).toEqual([`${MID_SESSION}\n\n${SECTION}`]);
  expect(w.logs).toContain("Freeflow: session start's menu step failed mid-session: the store is locked");
  await $.turn.complete(turnEnd("answer"));
  expect(w.events().filter((line: any) => line.kind === "freeflow" && line.what === "menu")).toEqual([
    expect.objectContaining({ detail: "mid-session, menu failed: the store is locked" }),
    expect.objectContaining({ detail: "mid-session: window, cycle, capabilities, guidance, sync" }),
  ]);

  // The next turn tries the menu once more; it comes when it works, and the turn after tries nothing.
  const tries = () => w.commands().filter((command) => command.startsWith("task here")).length;
  w.answers["task here"] = { stdout: MENU };
  await $.turn.start({ text: "go on", turnId: "turn-2" } as any);
  expect(tries()).toBe(2);
  expect(appended(w).at(-1)).toBe(`${MID_SESSION}\n\nFreeflow task memory:\n${MENU.trimEnd()}`);

  // The turn after tries nothing.
  await $.turn.start({ text: "and on", turnId: "turn-3" } as any);
  expect(tries()).toBe(2);
});

test("a catch-up step that fails twice is left, one try a turn (SPEC-013 section 4)", async ($, on) => {
  const w = world(on);
  w.status = store();
  w.answers["task here"] = { exitCode: 1, stderr: "Error: the store is locked\n" };
  await ready($);
  const tries = () => w.commands().filter((command) => command.startsWith("task here")).length;
  for (const [turn, expected] of [
    ["turn-1", 1],
    ["turn-2", 2],
    ["turn-3", 2],
    ["turn-4", 2],
  ] as const) {
    await $.turn.start({ text: "go", turnId: turn } as any);
    expect(tries()).toBe(expected);
  }
  expect(w.logs.filter((line) => /menu step failed mid-session/.test(line)).length).toBe(2);
  // Only the first turn's catch-up had something to show.
  expect(appended(w)).toEqual([`${MID_SESSION}\n\n${SECTION}`]);
});

const GATE_ROW = /^Freeflow gate \(warn, (\w+)\): /;
const gateRows = (w: any) => appended(w).filter((text) => GATE_ROW.test(text));
const gateLines = (w: any) =>
  w
    .events()
    .filter((line: any) => line.kind === "gate")
    .map((line: any) => `${line.gate}:${line.decision}:${line.tool}`);
const gateSettings = (
  modes: Record<string, string>,
  ignored: { file: string; key: string | null; reason: string }[] = [],
) => ({
  stdout: JSON.stringify({
    root: "/work/widget",
    settings: Object.entries(modes).map(([gate, value]) => ({
      key: `gates.${gate}`,
      label: gate,
      value,
      scope: "repository",
      hosts: "all",
    })),
    ignored,
  }),
});

test("the gates warn: the call runs as the engine decided, the agent reads one row per gate per turn, and each would-fire is logged (SPEC-008 4.3)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  w.stored.set(GATES_PATH, gateState({ agreement: null, slice: null }));
  await start($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  const edit = (file_path: string) => $.tool.check({ tool: "Edit", input: { file_path } } as any);

  // A change outside the store with no agreement and no Slice: the verdict stands, and both gates warn once.
  expect((await edit("/work/widget/src.mjs")).decision).toBe("ask");
  expect(gateRows(w).map((text) => GATE_ROW.exec(text)![1])).toEqual(["agreement", "slice"]);
  expect(gateRows(w)[1]).toBe(
    [
      "Freeflow gate (warn, slice): Edit on src.mjs with no open Slice in widget/task-001.",
      "Why: an effect outside the record needs a Slice first, so a lost context can tell what was half done.",
      "Way through: slice start-direct (or slice start), then go on. This gate only warns for now.",
    ].join("\n"),
  );
  expect((await edit("/work/widget/other.mjs")).decision).toBe("ask");
  expect(gateRows(w).length).toBe(2);
  // The store's allow still holds, and the store is no change the gates guard; a read is none either.
  expect((await edit(RECORD)).decision).toBe("allow");
  expect((await $.tool.check({ tool: "Bash", input: { command: "git status" } } as any)).decision).toBe("ask");
  expect(gateRows(w).length).toBe(2);

  // A Track Work command changes the state: the next call reads it again. The delivery gate always reminds.
  w.stored.set(GATES_PATH, gateState());
  await $.tool.call({
    tool: "Bash",
    command: `node ${w.scriptPath} slice start-direct --record widget/task-001`,
  } as any);
  await $.tool.check({ tool: "Bash", input: { command: "npm test && git push" } } as any);
  expect(gateRows(w).map((text) => GATE_ROW.exec(text)![1])).toEqual(["agreement", "slice", "delivery"]);
  // A new turn warns again.
  await $.turn.complete(turnEnd("answer"));
  await $.turn.start({ text: "again", turnId: "turn-2" } as any);
  await $.tool.check({ tool: "Bash", input: { command: "git commit -m x" } } as any);
  expect(gateRows(w).length).toBe(4);
  await $.turn.complete(turnEnd("answer"));
  expect(gateLines(w)).toEqual([
    "agreement:warn:Edit",
    "slice:warn:Edit",
    "agreement:warn:Edit",
    "slice:warn:Edit",
    "delivery:warn:Bash",
    "delivery:warn:Bash",
  ]);
});

test("the gates under block: refused with the gate's text, a delivery step put to the person where someone can answer, a deny beneath standing (SPEC-008 4.2)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  w.settingsAnswers["list "] = gateSettings({
    agreement: "block",
    slice: "block",
    delivery: "block",
    delegation: "block",
  });
  w.stored.set(GATES_PATH, gateState({ slice: null }));
  w.verdict = { decision: "allow" };
  await start($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);

  const refused = await $.tool.check({ tool: "Write", input: { file_path: "/work/widget/new.mjs" } } as any);
  expect(refused.decision).toBe("deny");
  expect(refused.reason).toStartWith("Freeflow gate (block, slice): Write on new.mjs with no open Slice");
  expect(gateRows(w)).toEqual([]);
  // The store's own files stay allowed.
  w.verdict = { decision: "ask" };
  expect((await $.tool.check({ tool: "Edit", input: { file_path: RECORD } } as any)).decision).toBe("allow");
  // A delivery step asks where someone can answer, and is refused where nobody can.
  w.stored.set(GATES_PATH, gateState());
  await $.tool.call({ tool: "Bash", command: `node ${w.scriptPath} slice resume --record widget/task-001` } as any);
  w.verdict = { decision: "allow" };
  const asked = await $.tool.check({ tool: "Bash", input: { command: "git push" }, approver: "person" } as any);
  expect(asked.decision).toBe("ask");
  expect(asked.reason).toContain("git push is a delivery step.");
  expect((await $.tool.check({ tool: "Bash", input: { command: "git push" } } as any)).decision).toBe("deny");
  // A deny from beneath is never turned into anything else.
  w.verdict = { decision: "deny", rule: "Bash(git push:*)" };
  expect(
    (await $.tool.check({ tool: "Bash", input: { command: "git push" }, approver: "person" } as any)).decision,
  ).toBe("deny");
  await $.turn.complete(turnEnd("answer"));
  expect(gateLines(w)).toEqual(["slice:block:Write", "delivery:ask:Bash", "delivery:block:Bash"]);
});

// R1 B1: a gate whose value the listing ignores keeps the mode the mod last read in this process; a config problem
// never drops a block to warn (D-045). Three session starts in one process: block, an ignored value, block.
test("a gate's ignored value keeps the mode the mod last read: block, an ignored value, block stay block (D-045, R1 B1)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  w.verdict = { decision: "allow" };
  const pushDecision = async () =>
    (await $.tool.check({ tool: "Bash", input: { command: "git push" } } as any)).decision;
  const ignoredValue = [
    { file: ".freeflow/config.json", key: "gates.delivery", reason: "gates.delivery must be one of off, warn, block" },
  ];
  const starts: [Record<string, string>, typeof ignoredValue][] = [
    [{ delivery: "block" }, []],
    [{ delivery: "warn" }, ignoredValue],
    [{ delivery: "block" }, []],
  ];
  const decisions: string[] = [];
  for (const [modes, ignored] of starts) {
    w.settingsAnswers["list "] = gateSettings(modes, ignored);
    await start($);
    await $.turn.start({ text: "go", turnId: "turn-1" } as any);
    decisions.push(await pushDecision());
    await $.turn.complete(turnEnd("answer"));
  }
  expect(decisions).toEqual(["deny", "deny", "deny"]);
});

test("the delegation gate: a worker's write outside its brief's May write, or to the task's record, warns the worker (SPEC-008 4.2)", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  w.stored.set(
    GATES_PATH,
    gateState({
      delegations: {
        "D-012": {
          writes: ["/wt/d-012/skills/review-work/**"],
          worktree: "/wt/d-012",
          folder: "/store/projects/widget/tasks/task-001-probe/delegations/D-012-review",
        },
      },
    }),
  );
  await start($);
  await $.agent.spawn(spawn("Do D-012's part."));
  await $.turn.start({ text: "x", turnId: "turn-w", agentId: "agent-7" } as any);
  const worker = (file_path: string) => $.tool.check({ tool: "Edit", input: { file_path }, agentId: "agent-7" } as any);
  await worker("/wt/d-012/skills/review-work/SKILL.md");
  await worker("/store/projects/widget/tasks/task-001-probe/delegations/D-012-review/progress.md");
  expect(w.sent).toEqual([]);
  await worker("/wt/d-012/hooks/claude/freeflow.mjs");
  expect(w.sent.map((each: any) => each.to)).toEqual(["agent-7"]); // the engine spells { agentId } as the ID
  expect(w.sent[0].text).toStartWith(
    "Freeflow gate (warn, delegation): Edit on /wt/d-012/hooks/claude/freeflow.mjs by D-012, outside its scope (May write: /wt/d-012/skills/review-work/**).",
  );
  // The main conversation is not told; the main loop is not a worker.
  expect(gateRows(w)).toEqual([]);
  await $.turn.complete({ ...turnEnd("answer"), agentId: "agent-7" } as any);
  await $.classic.SubagentStop({ agent_id: "agent-7", agent_type: "general-purpose", stop_hook_active: false } as any);
  expect(w.events().filter((line: any) => line.kind === "gate")).toEqual([
    expect.objectContaining({
      agent: "agent-7",
      gate: "delegation",
      decision: "warn",
      rule: "outside the worker's scope",
    }),
  ]);
});

test("with no gate state the gates are quiet under warn and say so once in the event log; closed under block (SPEC-008 section 5)", async ($, on) => {
  const w = world(on);
  w.stored.delete(GATES_PATH);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  await start($);
  await $.turn.start({ text: "go", turnId: "turn-1" } as any);
  expect((await $.tool.check({ tool: "Edit", input: { file_path: "/work/widget/src.mjs" } } as any)).decision).toBe(
    "ask",
  );
  await $.tool.check({ tool: "Edit", input: { file_path: "/work/widget/src.mjs" } } as any);
  expect(gateRows(w)).toEqual([]);
  await $.turn.complete(turnEnd("answer"));
  expect(w.events().filter((line: any) => line.kind === "freeflow" && line.what === "gates").length).toBe(1);
});

test("with no gate state under block, a change is refused with how to write one (SPEC-008 section 5)", async ($, on) => {
  const w = world(on);
  w.stored.delete(GATES_PATH);
  w.status = held(at(-30));
  w.answers["task here"] = { stdout: MENU };
  w.settingsAnswers["list "] = gateSettings({ agreement: "block" });
  await start($);
  const refused = await $.tool.check({ tool: "Edit", input: { file_path: "/work/widget/src.mjs" } } as any);
  expect(refused.decision).toBe("deny");
  expect(refused.reason).toContain("Freeflow cannot read its gate state; run `task here` or `agree`");
});
