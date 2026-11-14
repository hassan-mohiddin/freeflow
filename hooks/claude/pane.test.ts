// Freeflow's pane and status line on Claude Code (SPEC-015, layout B), run by `claude plugin test .`. The hooks a test
// registers stand for the engine and for the scripts: each `process.run` is answered from fixture JSON, so what is
// checked is what the pane reads, what it draws from it, and which command each press runs.
import { expect, mock, test } from "claude-code/testing";
import { cutWords, statusText } from "./pane.mjs";

const T0 = Date.parse("2026-11-03T12:00:00.000Z");
const SESSION = "sess-1";
const TASK = "freeflow/task-001";
const SURFACES = ["terminal", "desktop"] as const;
const FOLDER = "/store/projects/freeflow/tasks/task-001-memory/delegations";

type Answer = { exitCode?: number; stdout?: string; stderr?: string };

const task = (fields: object) => ({
  title: "A task",
  state: "active",
  cue: "read when it matters",
  hold: null,
  thisSession: false,
  lastSync: "2026-11-01 09:00",
  agreement: null,
  slice: null,
  decisions: [],
  problem: null,
  ...fields,
});

// What the scripts print, as Track Work's --json outputs have it.
const STATUS = { home: "/store", store: true, session: SESSION, task: { id: TASK, record: "/r.md", stateAsOf: "x" } };
const PROJECTS = {
  session: "sess-1",
  projects: [
    {
      name: "freeflow",
      tasks: [
        task({ id: "freeflow/task-004", title: "Finished", state: "completed" }),
        task({
          id: "freeflow/task-003",
          title: "Pi live check",
          hold: { session: "4b1e90c2", harness: "Claude Code", where: "mac", since: "2026-11-03 10:00" },
          lastSync: "2026-11-03 11:48",
        }),
        task({ id: "freeflow/task-002", title: "Docs sweep", state: "paused" }),
        task({
          id: TASK,
          title: "Memory and orchestration",
          hold: { session: "sess-1", harness: "Claude Code", where: "cloud", since: "2026-11-03 08:00" },
          thisSession: true,
          lastSync: "2026-11-03 11:59",
          agreement: { id: "A-011", title: "The overnight run" },
          decisions: [
            { id: "P2", state: "proposed", text: "Retry how often? -> three times" },
            { id: "P3", state: "new", text: "Which reviewer? -> Haiku" },
            { id: "P1", state: "agreed", text: "Which first? -> oldest" },
          ],
        }),
      ],
    },
    { name: null, tasks: [task({ id: "task-001", title: "Loose notes", lastSync: "2026-10-30 08:00" })] },
  ],
};
const DELEGATIONS = {
  delegations: [
    {
      id: "D-031",
      title: "gates",
      kind: "build",
      agent: "claude-opus-5-5, high",
      opened: "2026-11-03",
      handle: "running",
      branch: "gates",
      worktree: "/wt/gates",
      returned: "done",
      folder: `${FOLDER}/D-031-gates`,
      sub: [],
    },
    {
      id: "D-035",
      title: "session-catch-up",
      kind: "build",
      agent: "claude-haiku-5-5, xhigh",
      opened: "2026-11-03",
      handle: "running",
      branch: "session-catch-up",
      worktree: "/wt/scu",
      returned: null,
      folder: `${FOLDER}/D-035-session-catch-up`,
      sub: [],
    },
  ],
};
const SPENT = {
  slices: 4,
  partial: 0,
  delegations: 2,
  usd: 12.5,
  byModel: [
    { name: "claude-opus-5-5 high", slices: 4, delegations: 1, usd: 11.8 },
    { name: "claude-haiku-5-5 xhigh", slices: 0, delegations: 1, usd: 0.7 },
  ],
};
const EVENTS = {
  toolCalls: 12,
  freeflow: { toolCalls: 3, share: 0.25 },
  agents: [
    {
      agent: "agent-35",
      delegation: "D-035",
      model: "claude-haiku-5-5",
      effort: "xhigh",
      started: "2026-11-03T11:48:00.000Z",
      stopped: null,
      requests: 12,
      tokens: 48_200,
    },
  ],
};
/** Sent lines, newest first, as `events sent --json` numbers them. */
const SENT = (total: number, limit: number) => ({
  session: SESSION,
  total,
  sent: Array.from({ length: Math.min(total, limit) }, (_, index) => ({
    n: index + 1,
    ts: `2026-11-03T11:${String(59 - index).padStart(2, "0")}:00.000Z`,
    what: index === 0 ? "notice" : "gate",
    chars: 120,
    first: index === 0 ? "Freeflow: the context reached the notice point." : `Gate warning ${index}`,
  })),
});
const STATUS_LINE = "Freeflow › freeflow › Memory and orchestration · A-011 · ctx 62% (cycle 12) · 7d 41%";

/** The engine and the scripts beneath the mod, answered from the scenario `w` the test changes as it goes. */
function world(on: any) {
  const w = {
    answers: {
      "session status": { stdout: JSON.stringify(STATUS) },
      "project list --json": { stdout: JSON.stringify(PROJECTS) },
      [`delegate status --record ${TASK} --json`]: { stdout: JSON.stringify(DELEGATIONS) },
      [`estimate --spent --record ${TASK} --json`]: { stdout: JSON.stringify(SPENT) },
      [`estimate --plan --record ${TASK} --json`]: {
        exitCode: 1,
        stderr: "Error: No Slice is left to plan: Future Work proposes none, and no list was given.\n",
      },
      "events summary --json": { stdout: JSON.stringify(EVENTS) },
    } as Record<string, Answer>,
    sentTotal: 25,
    // Every Track Work run, as its arguments joined.
    runs: [] as string[],
    // Every settings script run, as its arguments joined (without --root and --json).
    settingsRuns: [] as string[],
    // The normal view `list --view normal --json` gives, or null for a script that has no views yet.
    normalView: null as any[] | null,
    switches: { enabled: true, pane: true, statusLine: true, events: true },
    surfaces: ["terminal"] as string[],
    open: false,
    opened: [] as any[],
    statuses: [] as (string | undefined)[],
    toasts: [] as string[],
    submitted: [] as string[],
    viewed: [] as any[],
    // What the person answers each question `$.ui.ask` puts, in order, and the questions put.
    replies: [] as string[],
    asked: [] as string[],
    stopped: [] as string[],
    stateSets: 0,
    files: new Map<string, string>([
      ["/store/sessions/sess-1/cycle.json", JSON.stringify({ cycle: 12 })],
      ["/store/sessions/sess-1/delegations.json", JSON.stringify({ "agent-35": "D-035" })],
      [`${FOLDER}/D-031-gates/brief.md`, "# D-031 — gates\n\nBuild the gates."],
      [`${FOLDER}/D-031-gates/return.md`, "# D-031 return\nState: done\n\n## Result\n\nThe gates are built."],
      ["/plugin/.claude-plugin/plugin.json", JSON.stringify({ name: "freeflow", version: "0.9.0" })],
      ["/plugin/plugin-docs/capabilities/pane.md", "# The pane and the status line\n\nOpen it with /freeflow pane."],
    ]),
    agents: [
      { id: "agent-35", description: "D-035 worker", type: "general-purpose", status: "running" },
      { id: "agent-9", description: "Explore the tests", type: "Explore", status: "completed" },
    ],
    clock: mock.clock(on, { now: T0 }),
    session: mock.session(on),
    /** What the pane reads, without the event log's flushes. */
    reads: () => w.runs.filter((run) => !run.startsWith("events append")),
  };
  on("process.run", (_: any, e: any) => {
    const value = (answer: Answer) => ({
      value: {
        exitCode: answer.exitCode ?? 0,
        stdout: answer.stdout ?? "",
        stderr: answer.stderr ?? "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    });
    const args: string[] = e.argv.slice(2);
    if (String(e.argv[1]).endsWith("setup-freeflow/scripts/settings.mjs")) {
      const plain = args.filter((arg, index) => arg !== "--json" && arg !== "--root" && args[index - 1] !== "--root");
      w.settingsRuns.push(plain.join(" "));
      const { enabled, pane, statusLine, events } = w.switches;
      if (args[0] === "set")
        return value({
          stdout: JSON.stringify({
            key: args[1],
            label: args[1] === "pane.statusLine" ? "Status line" : args[1],
            value: args[2] === "on",
            scope: args[args.indexOf("--scope") + 1],
            hosts: "claude-code",
            state: [],
            changed: [],
            cleared: [],
            notes: [],
          }),
        });
      if (args[0] === "get")
        return value({ stdout: JSON.stringify({ key: args[1], value: args[1] === "enabled" ? enabled : true }) });
      if (args.includes("--view")) {
        if (!w.normalView) return value({ exitCode: 1, stderr: "Error: Unknown option --view\n" });
        return value({ stdout: JSON.stringify({ root: "/work/widget", settings: w.normalView }) });
      }
      return value({
        stdout: JSON.stringify({
          root: "/work/widget",
          settings: [
            { key: "enabled", label: "Freeflow", value: enabled, scope: "default", hosts: "all" },
            { key: "events.enabled", label: "Event log", value: events, scope: "default", hosts: "all" },
            { key: "pane.enabled", label: "Pane", value: pane, scope: "default", hosts: "claude-code" },
            {
              key: "pane.statusLine",
              label: "Status line",
              value: statusLine,
              scope: statusLine ? "default" : "personal",
              hosts: "claude-code",
            },
          ],
        }),
      });
    }
    const key = args.join(" ");
    w.runs.push(key);
    if (key.startsWith("events sent --json")) {
      if (!w.switches.events) return value({ exitCode: 1, stderr: "Error: No event log for session sess-1 (/x)\n" });
      return value({ stdout: JSON.stringify(SENT(w.sentTotal, Number(args.at(-1)))) });
    }
    if (key.startsWith("events sent --show"))
      return value({ stdout: `Sent line ${args.at(-1)}, whole.\nIts second line.\n` });
    for (const [prefix, answer] of Object.entries(w.answers)) if (key.startsWith(prefix)) return value(answer);
    return value({ stdout: "" });
  });
  on("session.id", () => ({ value: SESSION }));
  on("session.cwd", () => ({ value: "/work/widget" }));
  on("session.surfaces", () => ({ value: w.surfaces }));
  on("session.usage", () => ({
    value: {
      startedAt: T0,
      context: { window: 200_000, tokens: 124_000, percent: 62 },
      rateLimits: [
        { kind: "five_hour", percentUsed: 16, resetsAt: "2026-11-03T15:10:00.000Z" },
        { kind: "seven_day", percentUsed: 41.2, resetsAt: "2026-11-04T10:00:00.000Z" },
      ],
      cost: { usd: 1.234 },
    },
  }));
  on("agent.list", () => ({ value: w.agents }));
  on("command.register", (_: any, e: any) => ({ value: { command: e.name } }));
  on("fs.read", (_: any, e: any) => {
    const path = String(e.path ?? e[0]).replace(
      /^.*\/\.claude-plugin\/plugin\.json$/,
      "/plugin/.claude-plugin/plugin.json",
    );
    const text =
      w.files.get(path) ?? w.files.get(String(e.path ?? e[0]).replace(/^.*\/plugin-docs\//, "/plugin/plugin-docs/"));
    return text === undefined ? { deny: `ENOENT: ${e.path ?? e[0]}` } : { value: text };
  });
  on("fs.write", () => ({ value: undefined }));
  on("env.set", () => ({ value: {} }));
  on("ui.log", () => ({ value: undefined }));
  on("ui.open", (_: any, e: any) => {
    w.open = true;
    w.opened.push(e);
    return { value: { isPlaced: true } };
  });
  on("ui.close", () => {
    w.open = false;
    return { value: undefined };
  });
  on("ui.panes", () => ({
    value: w.open ? [{ id: "freeflow", title: "Freeflow", isShown: true, isFocused: true, isPlaced: true }] : [],
  }));
  on("ui.status", (_: any, e: any) => {
    w.statuses.push(e.text);
    return { value: undefined };
  });
  on("ui.toast", (_: any, e: any) => {
    w.toasts.push(e.text);
    return { value: undefined };
  });
  on("ui.view", (_: any, e: any) => {
    w.viewed.push(e);
    return { value: {} };
  });
  on("prompt.submit", (_: any, e: any) => {
    w.submitted.push(e.text);
    return { text: e.text };
  });
  on("state.set", (_: any, e: any, next: any) => {
    w.stateSets += 1;
    return next(e);
  });
  on("session.start", (_: any, e: any) => ({ cwd: e.cwd }));
  on("turn.complete", () => ({ text: "" }));
  on("tool.call", (_: any, e: any) => {
    // `$.ui.ask` is a call of AskUserQuestion: the person's answer is the next reply.
    if (e.tool === "AskUserQuestion") {
      const question = e.questions[0].question;
      w.asked.push(question);
      const reply = w.replies.shift();
      if (reply === undefined) return { deny: "dismissed" };
      return { result: { questions: e.questions, answers: { [question]: reply } } };
    }
    if (e.tool === "TaskStop") {
      w.stopped.push(e.task_id);
      return { result: { message: "stopped", task_id: e.task_id, task_type: "local_agent" } };
    }
    return { result: {}, text: "" };
  });
  return w;
}

const start = ($: any) => $.session.start({ cwd: "/work/widget", surface: "terminal", isInteractive: true });
const freeflow = ($: any, args: string) => $.command.run({ command: "freeflow", args });
const turn = async ($: any, w: any, id = "t") => {
  await $.turn.complete({ turnId: id, reason: "answer", answer: "", durationMs: 1, isAborted: false });
  await w.clock.advance(1);
};
const PANE = (surface: string, bodyColumns = 50, placement: "dock" | "inline" = "dock") =>
  ({
    plugin: "freeflow",
    component: "Pane",
    requestId: "freeflow",
    surface,
    props: {
      title: "Freeflow",
      isFocused: true,
      bodyColumns,
      placement,
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  }) as any;

/** Opens the pane with /freeflow pane and lets its read run. */
async function opened($: any, w: any) {
  await start($);
  const result = await freeflow($, "pane");
  await w.clock.advance(1);
  return result;
}

/** Every Text's and Button's text in the drawing, in order (a Button's dim part is also a Text of its own). */
async function shown(ui: any) {
  return (await ui.findAll({}))
    .filter((each: any) => ["Text", "Button"].includes(each.type))
    .map((each: any) => each.text)
    .filter(Boolean) as string[];
}
const has = (lines: string[], pattern: RegExp) => lines.some((line) => pattern.test(line));
const keysOf = async (ui: any) => (await ui.findAll({ type: "Button" })).map((button: any) => button.key as string);

/** What the mod appended to the main conversation. */
const rows = (w: any) => w.session.appended().map((row: any) => row.message.content[0].text as string);

test("/freeflow pane opens at 50 columns docked and 24 rows inline, reads the scripts' JSON off the request path; a second /freeflow pane closes it", async ($, on) => {
  const w = world(on);
  const result = await opened($, w);
  expect(result.text).toBe("Freeflow's pane opened: 1 Projects and tasks, 2 Workers, 3 Sent, 4 Settings, 5 About.");
  expect(w.opened).toEqual([
    { id: "freeflow", title: "Freeflow", focus: true, closeOnEscape: true, columns: 50, rows: 24 },
  ]);
  expect(w.reads()).toEqual([
    "session status",
    "project list --json",
    `delegate status --record ${TASK} --json`,
    `estimate --spent --record ${TASK} --json`,
    "events summary --json",
    "events sent --json --limit 20",
  ]);
  expect(w.settingsRuns).toContain("list --view normal");
  expect((await freeflow($, "pane")).text).toBe("Freeflow's pane closed.");
  expect(w.open).toBe(false);

  // A turn's end reads again, after the hook returned: closed, only what the status line needs.
  w.runs.length = 0;
  await $.turn.complete({ turnId: "t1", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  // The cost governor reads the held task's plan once at the turn's end (SPEC-014); that read is the governor's.
  expect(w.reads()).toEqual(["session status", "estimate --plan --record /r.md --json"]);
  await w.clock.advance(1);
  expect(w.reads()).toEqual([
    "session status",
    "estimate --plan --record /r.md --json",
    "session status",
    "project list --json",
  ]);

  // A Track Work command a tool ran reads again too; any other command does not.
  w.runs.length = 0;
  await $.tool.call({ tool: "Bash", command: "ls" });
  await w.clock.advance(1);
  expect(w.reads()).toEqual([]);
  await $.tool.call({ tool: "Bash", command: "node /p/skills/track-work/scripts/working-record.mjs task release" });
  await w.clock.advance(1);
  expect(w.reads()).toContain("project list --json");
});

test("layout B: Needs you first, then Now, then the five tabs; every line fits 50 columns; 1 to 5 switch tabs", async ($, on) => {
  const w = world(on);
  await opened($, w);
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(PANE(surface));
    const lines = await shown(ui);
    expect(lines.slice(0, 11)).toEqual([
      "Freeflow",
      "esc closes",
      "Needs you · 2",
      "  Read the return: D-031 gates  [read]",
      "  2 decisions waiting on A-011  [show]",
      "Now · The overnight run",
      "  Memory and orchestration · held here · A-011",
      "  Running: D-035 session-catch-…, 12 min · ctx 62%",
      "─".repeat(50),
      "[Projects]",
      "Workers",
    ]);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(50);
    const tabs = (await ui.findAll({ type: "Button" })).filter((button: any) => /^tab-/.test(button.key));
    expect(tabs.map((button: any) => [button.key, button.props.hotkey])).toEqual([
      ["tab-projects", "1"],
      ["tab-workers", "2"],
      ["tab-sent", "3"],
      ["tab-settings", "4"],
      ["tab-about", "5"],
    ]);
    await ui.press({ key: "tab-workers" });
    expect((await shown(ui)).includes("[Workers]")).toBe(true);
    await ui.press({ key: "tab-projects" });
    await ui.unmount();
  }

  // Nothing waiting: one line, and Now rises.
  w.answers[`delegate status --record ${TASK} --json`] = { stdout: JSON.stringify({ delegations: [] }) };
  const quiet = structuredClone(PROJECTS);
  quiet.projects[0].tasks[3].decisions = [];
  w.answers["project list --json"] = { stdout: JSON.stringify(quiet) };
  await turn($, w);
  const ui = await $.ui.mount(PANE("terminal"));
  const lines = await shown(ui);
  expect(lines.slice(2, 6)).toEqual([
    "Nothing needs you",
    "Now · The overnight run",
    "  Memory and orchestration · held here · A-011",
    "  ctx 62% (cycle 12)",
  ]);
  await ui.unmount();
});

test("below about 112 columns the terminal seats the pane inline above the prompt: the mod asks 24 rows for it and draws the same sections at its width", async ($, on) => {
  const w = world(on);
  await opened($, w);
  // The terminal seats it: docked from 110 columns, inline below; the mod asked for 24 rows for the inline seat.
  expect(w.opened[0].rows).toBe(24);
  const ui = await $.ui.mount(PANE("terminal", 100, "inline"));
  const lines = await shown(ui);
  expect(lines).toContain("Needs you · 2");
  expect(lines).toContain("  Running: D-035 session-catch-up, 12 min · ctx 62%");
  expect(lines).toContain("─".repeat(100));
  expect(lines).toContain("[Projects]");
  expect(has(lines, /Memory and orchestration {2}held here$/)).toBe(true);
  await ui.unmount();
});

test("Projects and tasks: pick a project, pick a task, take, release, switch, take after asking, start a new task", async ($, on) => {
  const w = world(on);
  w.answers["task take"] = { stdout: "Took freeflow/task-002: this session holds it.\n" };
  w.answers["task release"] = { stdout: "Released freeflow/task-001.\n" };
  w.answers["task switch"] = { stdout: "Switched to freeflow/task-002.\n" };
  w.answers["task create"] = {
    stdout: "task-002\n/store/tasks/task-002-fix-the-parser/record.md\nThis session holds it.\n",
  };
  await opened($, w);
  const ui = await $.ui.mount(PANE("terminal"));
  const ran = () => w.reads().filter((run) => /^task /.test(run));

  // The held task's project is the one shown; the finished task is left out.
  let lines = await shown(ui);
  expect(lines).toContain("  ● Memory and orchestration  held here");
  expect(lines).toContain("  ○ Pi live check  held by 4b1e90c2");
  expect(lines).toContain("      synced 12 min ago");
  expect(lines).toContain("  ○ Docs sweep  paused");
  expect(has(lines, /Finished/)).toBe(false);
  expect((await ui.find({ key: "project" }))?.props.value).toBe("freeflow");

  // Release: pick the held task; its one action is release.
  await ui.press({ key: `task:${TASK}` });
  expect(await keysOf(ui)).toContain("release");
  await ui.press({ key: "release" });
  expect(ran()).toEqual(["task release"]);
  expect(rows(w).at(-1)).toBe(
    "Freeflow: the user released freeflow/task-001 in Freeflow's pane (working-record.mjs task release): Released freeflow/task-001.",
  );
  expect(w.toasts.at(-1)).toBe("Released freeflow/task-001.");

  // Take, with no task held: a free task is taken at once.
  w.answers["session status"] = { stdout: JSON.stringify({ ...STATUS, task: null }) };
  await turn($, w);
  await ui.press({ key: "task:freeflow/task-002" });
  await ui.press({ key: "take" });
  expect(ran().at(-1)).toBe("task take --id freeflow/task-002");

  // A task another session holds is taken only after asking: declined, nothing runs; agreed, --takeover.
  await ui.press({ key: "task:freeflow/task-003" });
  expect(has(await shown(ui), /t take \(asks first\)/)).toBe(true);
  const before = ran().length;
  w.replies.push("Leave it");
  await ui.press({ key: "take" });
  expect(w.asked.at(-1)).toBe("Pi live check is held by session 4b1e90c2, last synced 2026-11-03 11:48. Take it over?");
  expect(ran().length).toBe(before);
  w.replies.push("Take it over");
  await ui.press({ key: "take" });
  expect(ran().at(-1)).toBe("task take --id freeflow/task-003 --takeover");

  // Switch with nothing done under the held task: at once.
  w.answers["session status"] = { stdout: JSON.stringify(STATUS) };
  w.answers["events summary --json"] = {
    stdout: JSON.stringify({ toolCalls: 2, freeflow: { toolCalls: 2, share: 1 }, agents: [] }),
  };
  await turn($, w);
  await ui.press({ key: "task:freeflow/task-002" });
  await ui.press({ key: "switch" });
  expect(ran().at(-1)).toBe("task switch --id freeflow/task-002");
  expect(w.submitted).toEqual([]);

  // Switch with work done under it: the switch waits for the held task's checkpoint, which the agent writes.
  w.answers["events summary --json"] = { stdout: JSON.stringify(EVENTS) };
  await ui.press({ key: "switch" });
  expect(w.submitted).toEqual([
    "The user pressed switch on freeflow/task-002 in Freeflow's pane. Checkpoint freeflow/task-001 first, then run task switch --id freeflow/task-002 and recover it.",
  ]);
  expect(w.toasts.at(-1)).toBe(
    "Freeflow: the agent checkpoints freeflow/task-001, then switches to freeflow/task-002.",
  );

  // Pick another project, then a new task in it: its title, then its goal, then task create. While this session
  // holds a task with work done under it, the agent checkpoints it first.
  await ui.select({ key: "project", value: "@none" });
  lines = await shown(ui);
  expect(lines).toContain("  ○ Loose notes  free");
  await ui.press({ key: "new-task" });
  await ui.input({ key: "pane-input", text: "Fix the parser" });
  await ui.input({ key: "pane-input", text: "Parse nested lists" });
  expect(w.submitted.at(-1)).toBe(
    'The user started a new task in Freeflow\'s pane. Checkpoint freeflow/task-001 first, then run task release, then task create --title "Fix the parser" --goal "Parse nested lists" --cue "read when Fix the parser is in question" --no-project --cwd /work/widget.',
  );
  // Nothing done under it: released, then created, at once.
  w.answers["events summary --json"] = {
    stdout: JSON.stringify({ toolCalls: 1, freeflow: { toolCalls: 1 }, agents: [] }),
  };
  await ui.press({ key: "new-task" });
  await ui.input({ key: "pane-input", text: "Fix the parser" });
  await ui.input({ key: "pane-input", text: "Parse nested lists" });
  expect(ran().slice(-2)).toEqual([
    "task release",
    "task create --title Fix the parser --goal Parse nested lists --cue read when Fix the parser is in question --no-project --cwd /work/widget",
  ]);
  expect(w.toasts.at(-1)).toBe("Created task-002. This session holds it.");
  w.answers["session status"] = { stdout: JSON.stringify({ ...STATUS, task: null }) };
  await turn($, w);
  await ui.select({ key: "project", value: "freeflow" });
  await ui.press({ key: "new-task" });
  await ui.input({ key: "pane-input", text: "Probe" });
  await ui.input({ key: "pane-input", text: "Probe it" });
  expect(ran().at(-1)).toContain("--project freeflow --cwd /work/widget");
  w.answers["session status"] = { stdout: JSON.stringify(STATUS) };
  await turn($, w);

  // A command that fails shows its error and changes nothing else: no row.
  const appended = rows(w).length;
  w.answers["task switch"] = { exitCode: 1, stderr: "Error: Refused: session 4b1e90c2 holds it.\n" };
  w.answers["events summary --json"] = {
    stdout: JSON.stringify({ toolCalls: 0, freeflow: { toolCalls: 0 }, agents: [] }),
  };
  await ui.press({ key: "task:freeflow/task-002" });
  await ui.press({ key: "switch" });
  expect(w.toasts.at(-1)).toBe("Freeflow: Refused: session 4b1e90c2 holds it.");
  expect(rows(w).length).toBe(appended);
  await ui.unmount();
});

test("Workers: each delegation with model, effort, minutes and tokens; Brief, Return, See now, Check; Stop asks first", async ($, on) => {
  const w = world(on);
  w.answers["delegate check-return"] = { stdout: "D-031's return is ready.\n" };
  await opened($, w);
  await w.clock.advance(12 * 60_000);
  const ui = await $.ui.mount(PANE("terminal"));
  await ui.press({ key: "tab-workers" });
  let lines = await shown(ui);
  expect(lines).toContain("  D-031 gates · returned (done)");
  expect(lines).toContain("    Opus · high");
  expect(lines).toContain("  D-035 session-catch-up · running");
  expect(lines).toContain("    Haiku · xhigh · 24 min · 48k tokens");
  expect(lines).toContain("Cost");
  expect(lines).toContain("  session $1.23 · task $12.50 at list price");

  // A returned worker: Brief and Return open its files in the pane, Check runs check-return.
  await ui.press({ key: "worker:D-031" });
  expect(await keysOf(ui)).toEqual(expect.arrayContaining(["brief", "return", "check"]));
  expect(await keysOf(ui)).not.toContain("stop");
  await ui.press({ key: "return" });
  lines = await shown(ui);
  expect(lines).toContain("D-031 return");
  expect((await ui.find({ key: "reading" }))?.text).toContain("The gates are built.");
  await ui.press({ key: "back" });
  await ui.press({ key: "brief" });
  expect((await ui.find({ key: "reading" }))?.text).toContain("Build the gates.");
  await ui.press({ key: "back" });
  await ui.press({ key: "check" });
  expect(w.reads().at(-1)).toBe(`delegate check-return --record ${TASK} --id D-031`);
  expect(rows(w).at(-1)).toContain("the user checked D-031's return in Freeflow's pane");

  // A running worker: See now shows it in the main view; Stop asks, and only "Stop it" stops it.
  await ui.press({ key: "worker:D-035" });
  expect(await keysOf(ui)).toEqual(expect.arrayContaining(["brief", "see-now", "stop"]));
  await ui.press({ key: "see-now" });
  expect(w.viewed).toEqual([{ agentId: "agent-35" }]);
  w.replies.push("Keep it running");
  await ui.press({ key: "stop" });
  expect(w.asked.at(-1)).toBe("Stop D-035 session-catch-up? Its worker ends now; what it wrote stays in its worktree.");
  expect(w.stopped).toEqual([]);
  await ui.press({ key: "stop" });
  expect(w.stopped).toEqual([]);
  w.replies.push("Stop it");
  await ui.press({ key: "stop" });
  expect(w.stopped).toEqual(["agent-35"]);
  expect(rows(w).at(-1)).toBe("Freeflow: the user stopped D-035's worker (agent-35) from Freeflow's pane.");
  expect(w.toasts.at(-1)).toBe("Stopped D-035's worker.");
  await ui.unmount();
});

test("Sent: the 20 newest lines, then show older; each opens to its full text; the event log off empties it", async ($, on) => {
  const w = world(on);
  await opened($, w);
  const ui = await $.ui.mount(PANE("terminal"));
  await ui.press({ key: "tab-sent" });
  let lines = await shown(ui);
  expect(lines).toContain("Sent · newest first · 20 of 25");
  expect(lines).toContain("11:59  notice  Freeflow: the context reached the …");
  expect((await keysOf(ui)).filter((key) => key.startsWith("sent:")).length).toBe(20);
  await ui.press({ key: "older" });
  await w.clock.advance(1);
  expect(w.reads().at(-1)).toBe("events sent --json --limit 40");
  lines = await shown(ui);
  expect(lines).toContain("Sent · newest first · 25 of 25");
  expect(await keysOf(ui)).not.toContain("older");
  await ui.press({ key: "sent:1" });
  expect(w.reads().at(-1)).toBe("events sent --show 1");
  lines = await shown(ui);
  expect(lines).toContain("notice at 11:59");
  expect(lines).toContain("Sent line 1, whole.");
  expect(lines).toContain("Its second line.");
  await ui.press({ key: "back" });

  w.switches.events = false;
  await freeflow($, "settings events.enabled off");
  await turn($, w);
  expect(await shown(ui)).toContain("The event log is off, so Sent is empty.");
  await ui.unmount();
});

test("Settings: the rows as switches and choices with a ⋯ reach menu, from the normal view or mapped from the flat list", async ($, on) => {
  const w = world(on);
  await opened($, w);
  const ui = await $.ui.mount(PANE("terminal"));
  await ui.press({ key: "tab-settings" });
  const sets = () => w.settingsRuns.filter((run) => run.startsWith("set "));

  // The script has no views yet: the flat list mapped to Freeflow, Task memory (read only), Status line, Pane.
  let lines = await shown(ui);
  expect(lines).toEqual(
    expect.arrayContaining([
      "Freeflow  [on]",
      "Task memory · read only",
      "  On",
      "Status line  [on]",
      "Pane  [on]",
      "  from the default",
    ]),
  );
  await ui.press({ key: "setting:pane.statusLine" });
  expect(sets().at(-1)).toBe("set pane.statusLine off --scope personal");
  expect(rows(w).at(-1)).toContain(
    "The user changed a Freeflow setting with /freeflow settings: pane.statusLine is now off",
  );
  expect(rows(w).at(-1)).toContain("(The user changed it in Freeflow's pane.)");

  // ⋯: only this session, for that row's next change.
  await ui.press({ key: "reach:pane.enabled" });
  expect((await ui.find({ key: "reach-pick:pane.enabled" }))?.props.options.map((each: any) => each.label)).toEqual([
    "Everywhere",
    "Only this folder",
    "Only this session",
  ]);
  await ui.select({ key: "reach-pick:pane.enabled", value: "session" });
  expect(await shown(ui)).toContain("  from the default · next change: this session");
  await ui.press({ key: "setting:pane.enabled" });
  expect(sets().at(-1)).toBe("set pane.enabled off --scope session");

  // Developer settings: what the command lists, in the pane.
  await ui.press({ key: "developer" });
  lines = await shown(ui);
  expect(lines).toContain("Developer settings: /freeflow settings --all");
  expect(has(lines, /^Freeflow settings for \/work\/widget \(Claude Code\)$/)).toBe(true);
  await ui.press({ key: "back" });

  // The settings script's normal view: its rows, choices and read-only rows; a change goes everywhere by default.
  w.normalView = [
    { key: "enabled", label: "Freeflow", value: true, scope: "default", choices: [true, false], readOnly: false },
    {
      key: "memory",
      label: "Task memory",
      value: "local",
      scope: "everywhere",
      choices: [
        { value: "local", label: "On, this machine" },
        { value: "sync", label: "On, with sync" },
        { value: "off", label: "Off" },
      ],
      readOnly: false,
    },
    {
      key: "review",
      label: "Review",
      value: "One reviewer and one round, from your rules or Freeflow's default",
      scope: "default",
      choices: [],
      readOnly: true,
    },
  ];
  await turn($, w);
  lines = await shown(ui);
  expect(lines).toContain("Review · read only");
  expect(lines).toContain("  One reviewer and one round, from your rules or Freeflow's default");
  expect(lines).toContain("  from everywhere");
  const memory = await ui.find({ key: "setting:memory" });
  expect(memory?.props.options.map((each: any) => each.label)).toEqual(["On, this machine", "On, with sync", "Off"]);
  await ui.select({ key: "setting:memory", value: "sync" });
  expect(sets().at(-1)).toBe("set memory sync --scope personal");
  await ui.unmount();
});

test("About: the version, what is on, the guide", async ($, on) => {
  const w = world(on);
  await opened($, w);
  const ui = await $.ui.mount(PANE("terminal"));
  await ui.press({ key: "tab-about" });
  const lines = await shown(ui);
  expect(lines).toContain("Freeflow, version 0.9.0");
  expect(lines).toContain("On: task memory, event log, pane, status line");
  expect((await ui.find({ type: "Link" }))?.props.href).toBe(
    "https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/README.md",
  );
  await ui.press({ key: "guide" });
  expect((await ui.find({ key: "reading" }))?.text).toContain("Open it with /freeflow pane.");
  await ui.unmount();
});

test("the status line's words: project within 16, task within 24 cut at a word, a short name in its place, no task held", () => {
  const values = (project: string | null, fields: object, task: string | null = TASK) => ({
    store: true,
    task,
    cycle: 3,
    projects: {
      projects: [{ name: project, tasks: [{ id: TASK, agreement: { id: "A-012", title: "x" }, ...fields }] }],
    },
    usage: { context: 73, windows: [{ kind: "seven_day", percent: 41.2 }] },
  });
  expect(statusText(values("freeflow", { title: "Memory & orchestration" }))).toBe(
    "Freeflow › freeflow › Memory & orchestration · A-012 · ctx 73% (cycle 3) · 7d 41%",
  );
  // A long task is cut at a word, before "for".
  expect(statusText(values("freeflow", { title: "Memory & orchestration for long-horizon agent work" }))).toBe(
    "Freeflow › freeflow › Memory & orchestration… · A-012 · ctx 73% (cycle 3) · 7d 41%",
  );
  // A long project is cut within 16.
  expect(statusText(values("Applications and experiments", { title: "Docs sweep" }))).toBe(
    "Freeflow › Applications… › Docs sweep · A-012 · ctx 73% (cycle 3) · 7d 41%",
  );
  // A task's short name stands in place of its title.
  expect(
    statusText(values("freeflow", { title: "Memory and orchestration for long-horizon agent work", short: "Memory" })),
  ).toBe("Freeflow › freeflow › Memory · A-012 · ctx 73% (cycle 3) · 7d 41%");
  // A task in no project has no project part.
  expect(statusText(values(null, { title: "Loose notes" }))).toBe(
    "Freeflow › Loose notes · A-012 · ctx 73% (cycle 3) · 7d 41%",
  );
  expect(statusText(values("freeflow", { title: "x" }, null))).toBe("Freeflow: no task held");
  expect(statusText({ store: false })).toBe(null);
  expect(cutWords("Supercalifragilisticexpialidocious", 16)).toBe("Supercalifragil…");
  // A cut never ends on a joining word.
  expect(cutWords("Memory and the orchestration of agents", 24)).toBe("Memory…");
});

test("the status line matches the fixture, has no workers, is set only when it changes, and goes with pane.statusLine off", async ($, on) => {
  const w = world(on);
  await start($);
  await turn($, w, "t1");
  expect(w.statuses).toEqual([STATUS_LINE]);
  await turn($, w, "t2");
  expect(w.statuses).toEqual([STATUS_LINE]);

  // No task held: the line says so, and nothing else.
  w.answers["session status"] = { stdout: JSON.stringify({ ...STATUS, task: null }) };
  await turn($, w, "t3");
  expect(w.statuses.at(-1)).toBe("Freeflow: no task held");

  w.switches.statusLine = false;
  await freeflow($, "settings pane.statusLine off");
  expect(w.statuses.at(-1)).toBeUndefined();
  const count = w.statuses.length;
  await turn($, w, "t4");
  expect(w.statuses.length).toBe(count);
});

test("no render writes state; a script that fails keeps the last values with an as-of line", async ($, on) => {
  const w = world(on);
  await opened($, w);
  for (const tab of ["projects", "workers", "sent", "settings", "about"]) {
    const ui = await $.ui.mount(PANE("terminal"));
    await ui.press({ key: `tab-${tab}` });
    await w.clock.advance(1);
    await ui.unmount();
    // The tab is chosen; drawing it on every surface, again and again, writes nothing.
    const sets = w.stateSets;
    for (const surface of [...SURFACES, "vscode", "mobile"]) {
      const drawn = await $.ui.mount(PANE(surface));
      await drawn.redraw();
      expect(await shown(drawn)).toContain("Needs you · 2");
      await drawn.unmount();
    }
    expect(w.stateSets).toBe(sets);
  }
  const back = await $.ui.mount(PANE("terminal"));
  await back.press({ key: "tab-projects" });
  await back.unmount();

  // A session with no event log yet is not a failure.
  w.answers["events summary --json"] = { exitCode: 1, stderr: "Error: No event log for session sess-1 (/x)\n" };
  w.answers["project list --json"] = { exitCode: 1, stderr: "Error: the store is busy\n" };
  await turn($, w);
  const ui = await $.ui.mount(PANE("terminal"));
  const lines = await shown(ui);
  expect(has(lines, /Pi live check/)).toBe(true);
  expect(lines.at(-1)).toBe("as of 12:00; could not read project list");
  await ui.unmount();
});

test("where no surface draws, or with the pane off, nothing is read for it", async ($, on) => {
  const w = world(on);
  w.surfaces = [];
  await opened($, w);
  expect(w.reads()).toEqual([]);
  expect(w.statuses).toEqual([]);

  w.surfaces = ["terminal"];
  await freeflow($, "pane");
  w.switches.pane = false;
  await freeflow($, "settings pane.enabled off");
  expect(w.open).toBe(false);
  expect((await freeflow($, "pane")).text).toBe(
    "Freeflow's pane is off (pane.enabled); /freeflow settings pane.enabled on turns it on.",
  );
  w.runs.length = 0;
  await turn($, w);
  // The status line still reads what it shows; the pane's own reads do not run.
  expect(w.reads()).not.toContain("events summary --json");
  expect(w.reads()).toContain("project list --json");
});
