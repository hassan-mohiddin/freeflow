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

/** The engine and the script beneath the mod, answered from the scenario `w` the test changes as it goes. */
function world(on: any) {
  const w = {
    status: null as object | null,
    answers: {} as Record<string, Answer>,
    tokens: undefined as number | undefined,
    threshold: 167_000 as number | undefined,
    compactionWindow: undefined as number | undefined,
    response: { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    runs: [] as Run[],
    env: {} as Record<string, string | undefined>,
    sent: [] as any[],
    submitted: [] as string[],
    commandsRun: [] as string[],
    compactions: [] as any[],
    writes: [] as { path: string; text: string }[],
    logs: [] as any[],
    clock: mock.clock(on, { now: T0 }),
    session: mock.session(on),
    commands: () => w.runs.map((run) => run.args.join(" ")),
    beforeRun: (_key: string): unknown => undefined,
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
  };
  on("process.run", async (_: any, e: any) => {
    const script = e.argv[0] === "node" && String(e.argv[1]).endsWith("working-record.mjs");
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
      rateLimits: [],
      context: {
        window: 200_000,
        ...(w.tokens === undefined ? {} : { tokens: w.tokens, percent: Math.round(w.tokens / 2000) }),
        ...(e?.breakdown ? { breakdown: { autoCompactThreshold: w.threshold, rawMaxTokens: w.compactionWindow } } : {}),
      },
    },
  }));
  on("session.id", () => ({ value: SESSION }));
  on("env.set", (_: any, e: any) => {
    w.env[e.name] = e.value;
    return { value: {} };
  });
  on("fs.exists", () => ({ value: false }));
  on("fs.stat", (_: any, e: any) => {
    // A relative path resolves against a working directory, here one standing at "/", which the mod cannot tell from a
    // tool's own: the mod never asks where one lands.
    const real = w.files.get(e.path) ?? (String(e.path).endsWith("store/x.md") ? "/store/x.md" : undefined);
    return real === undefined
      ? { deny: `ENOENT: ${e.path}` }
      : { value: { kind: "file", size: 1, mtimeMs: 0, isLink: false, ...(e.resolve ? { realPath: real } : {}) } };
  });
  on("tool.check", () => ({ ...w.verdict }));
  on("fs.write", (_: any, e: any) => {
    w.writes.push({ path: e.path ?? e[0], text: e.text ?? e[1] });
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
    return { text: "Compacted" };
  });
  on("prompt.submit", (_: any, e: any) => {
    w.submitted.push(e.text);
    return { text: e.text };
  });
  on("session.compact", (_: any, e: any) => {
    w.compactions.push(e);
    return { messages: [{ role: "user", text: "Claude's summary.", toolUses: [] }] };
  });
  on("classic.SessionStart", () => ({}));
  on("classic.SubagentStop", () => ({}));
  on("turn.complete", () => ({ text: "" }));
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

test("session start: with a store, pull it, give the scripts the window and the agent the menu; otherwise nothing", async ($, on) => {
  const w = world(on);
  w.answers["task here"] = { stdout: MENU };

  expect((await start($)).additionalContext).toBeUndefined();
  expect(w.commands()).toEqual(["session status"]);
  expect(w.env.FREEFLOW_CONTEXT_WINDOW).toBe("200000");

  w.status = store();
  w.runs.length = 0;
  const result = await start($);
  expect(w.commands()).toEqual(["session status", "store sync --pull", "task here --cwd /work/widget"]);
  expect(w.runs.every((run) => run.session === SESSION)).toBe(true);
  expect(result.additionalContext).toEqual([`Freeflow task memory:\n${MENU}`]);

  w.runs.length = 0;
  expect((await start($, { source: "compact" })).additionalContext).toBeUndefined();
  expect(w.runs).toEqual([]);
});

test("a request ends: one notice a cycle, at the lower of 75% and a tenth before Claude's threshold, asking for a checkpoint at a safe point", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  await start($);
  const notices = () => w.session.appended().map((row: any) => row.message.content[0].text);

  await step($, w, 146_000);
  expect(notices()).toEqual([]);
  await step($, w, 148_000);
  expect(notices().length).toBe(1);
  expect(notices()[0]).toContain("Freeflow: the context is at 74% of its window (148000 of 200000 tokens)");
  expect(notices()[0]).toContain("Claude Code compacts on its own at about 167000");
  expect(notices()[0]).toContain("Keep working until a safe point: a finished step whose result you know");
  expect(notices()[0]).toContain("rewrite widget/task-001's Current Context");
  expect(notices()[0]).toContain("checkpoint --record widget/task-001 --input -");
  expect(notices()[0]).toContain("Then end your turn");
  expect(notices()[0]).toContain("the only notice this cycle");
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
  expect(notices()[3]).toContain("checkpoint --session --input -");
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

test("a turn ends: sync a changed store; after the checkpoint a notice asked for, compact between turns and start the next", async ($, on) => {
  const w = world(on);
  w.status = held(at(-30));
  w.answers["view bundle --record"] = { stdout: "THE BUNDLE\n" };
  await start($);
  await w.clock.advance(60_000);
  await step($, w, 160_000);

  // A checkpoint older than the notice: the store syncs, nothing compacts.
  w.status = held(at(0.5), { changed: true });
  w.runs.length = 0;
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.commands()).toEqual(["session status", "store sync"]);
  expect(w.submitted).toEqual([]);

  // An interrupted turn does not compact, though the checkpoint is done.
  w.status = held(at(2));
  await $.turn.complete(turnEnd("aborted"));
  await w.clock.advance(1);
  expect(w.submitted).toEqual([]);

  // The checkpoint is done: once the turn has ended, the mod runs /compact as the person would, which the engine
  // compacts through the mod's session.compact hook (the next test), then a prompt starts the next turn.
  await $.turn.complete(turnEnd("answer"));
  expect(w.commandsRun).toEqual([]);
  await w.clock.advance(1);
  expect(w.logs).toEqual([]);
  expect(w.commandsRun).toEqual(["compact"]);
  expect(w.submitted.length).toBe(1);
  expect(w.submitted[0]).toContain("Continue from In flight and the Next action.");

  // That compaction started a new cycle, even where no hook of the mod's saw it: the next turn end compacts nothing,
  // though the checkpoint is still later than the old notice (T12).
  w.status = held(at(3));
  await $.turn.complete(turnEnd("answer"));
  await w.clock.advance(1);
  expect(w.commandsRun).toEqual(["compact"]);
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
  expect(w.commands()).toEqual(["session status", "task release"]);
  expect(w.runs.every((run) => run.session === "sess-old")).toBe(true);

  w.runs.length = 0;
  w.status = store({ changed: true });
  await $.session.end({ reason: "clear", sessionId: "sess-old", resume: { id: "sess-old" } });
  expect(w.commands()).toEqual(["session status", "store sync"]);
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
