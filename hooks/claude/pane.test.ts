// Freeflow's pane and status line on Claude Code (SPEC-015), run by `claude plugin test .`. The hooks a test registers
// stand for the engine and for Track Work's script: each `process.run` is answered from fixture JSON, so what is
// checked is what the pane reads, what it draws from it, and which command each press runs.
import { expect, mock, test } from "claude-code/testing";

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
      agent: "claude-opus-5-5, high",
      opened: "2026-11-03",
      handle: "running",
      branch: "session-catch-up",
      worktree: "/wt/scu",
      returned: null,
      folder: `${FOLDER}/D-035-session-catch-up`,
      sub: [
        {
          id: "D-035.1",
          title: "survey",
          kind: "gather",
          agent: "claude-haiku-5-5, xhigh",
          opened: "2026-11-03",
          handle: null,
          branch: null,
          worktree: null,
          returned: "done",
          folder: `${FOLDER}/D-035-session-catch-up/D-035.1-survey`,
        },
      ],
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
  tokens: [
    { model: "claude-opus-5-5", effort: "high", requests: 40, in: 1000, out: 5000, cacheRead: 9000, cacheWrite: 0 },
  ],
};
const STATUS_LINE = "freeflow/task-001 · A-011 The overnight run · ctx 62% (cycle 12) · 7d 41% · 2 workers, 1 returned";

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
    // Every Track Work run, as its arguments joined.
    runs: [] as string[],
    switches: { enabled: true, pane: true, statusLine: true },
    surfaces: ["terminal"] as string[],
    open: false,
    opened: [] as any[],
    statuses: [] as (string | undefined)[],
    toasts: [] as string[],
    submitted: [] as string[],
    sent: [] as any[],
    viewed: [] as any[],
    stateSets: 0,
    files: new Map<string, string>([
      ["/store/sessions/sess-1/cycle.json", JSON.stringify({ cycle: 12 })],
      ["/store/sessions/sess-1/delegations.json", JSON.stringify({ "agent-35": "D-035" })],
    ]),
    agents: [
      { id: "agent-35", description: "D-035 worker", type: "general-purpose", status: "running" },
      { id: "agent-9", description: "Explore the tests", type: "Explore", status: "completed" },
    ],
    clock: mock.clock(on, { now: T0 }),
    session: mock.session(on),
    /** What the pane reads, without the event log's flushes and the settings script. */
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
      const { enabled, pane, statusLine } = w.switches;
      if (args[0] === "set")
        return value({
          stdout: JSON.stringify({
            key: args[1],
            label: args[1],
            value: args[2] === "on",
            scope: "personal",
            hosts: "claude-code",
            state: [],
            changed: [],
            cleared: [],
            notes: [],
          }),
        });
      if (args[0] === "get")
        return value({ stdout: JSON.stringify({ key: args[1], value: args[1] === "enabled" ? enabled : true }) });
      return value({
        stdout: JSON.stringify({
          settings: [
            { key: "enabled", value: enabled },
            { key: "pane.enabled", value: pane },
            { key: "pane.statusLine", value: statusLine },
          ],
        }),
      });
    }
    const key = args.join(" ");
    w.runs.push(key);
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
    const text = w.files.get(e.path ?? e[0]);
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
  on("session.send", (_: any, e: any) => {
    w.sent.push(e);
    return { isDelivered: true };
  });
  on("state.set", (_: any, e: any, next: any) => {
    w.stateSets += 1;
    return next(e);
  });
  on("session.start", (_: any, e: any) => ({ cwd: e.cwd }));
  on("turn.complete", () => ({ text: "" }));
  on("tool.call", () => ({ result: {}, text: "" }));
  return w;
}

const start = ($: any) => $.session.start({ cwd: "/work/widget", surface: "terminal", isInteractive: true });
const freeflow = ($: any, args: string) => $.command.run({ command: "freeflow", args });
const PANE = (surface: (typeof SURFACES)[number]) =>
  ({
    plugin: "freeflow",
    component: "Pane",
    requestId: "freeflow",
    surface,
    props: {
      title: "Freeflow",
      isFocused: true,
      bodyColumns: 120,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  }) as const;

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

/** What the mod appended to the main conversation. */
const rows = (w: any) => w.session.appended().map((row: any) => row.message.content[0].text as string);

test("/freeflow pane opens the pane and reads the scripts' JSON off the request path; a second /freeflow pane closes it", async ($, on) => {
  const w = world(on);
  const result = await opened($, w);
  expect(result.text).toBe("Freeflow's pane opened: 1 Tasks, 2 Agents, 3 Cost, 4 Decisions.");
  expect(w.opened).toEqual([{ id: "freeflow", title: "Freeflow", focus: true, closeOnEscape: true }]);
  expect(w.reads()).toEqual([
    "session status",
    "project list --json",
    `delegate status --record ${TASK} --json`,
    `estimate --spent --record ${TASK} --json`,
    `estimate --plan --record ${TASK} --json`,
    "events summary --json",
  ]);
  expect((await freeflow($, "pane")).text).toBe("Freeflow's pane closed.");
  expect(w.open).toBe(false);

  // A turn's end reads again, after the hook returned: closed, the pane's own reads (cost, plan, events) wait.
  w.runs.length = 0;
  await $.turn.complete({ turnId: "t1", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  expect(w.reads()).toEqual(["session status"]);
  await w.clock.advance(1);
  expect(w.reads()).toEqual([
    "session status",
    "session status",
    "project list --json",
    `delegate status --record ${TASK} --json`,
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

test("each view renders from the fixtures, and the hotkeys 1 to 4 switch views, on the terminal and the desktop", async ($, on) => {
  const w = world(on);
  await opened($, w);
  for (const surface of SURFACES) {
    const ui = await $.ui.mount(PANE(surface));
    // Tasks: what needs the user first, one line a task, a finished task left out.
    let lines = await shown(ui);
    expect(lines.slice(0, 6)).toEqual(["Freeflow", "Tasks", "Agents", "Cost", "Decisions", "Needs you"]);
    expect(
      has(
        lines,
        /^ {2}freeflow\/task-001 {2}Memory and orchestration {2}this session · A-011 · 1 returned · 2 decisions waiting$/,
      ),
    ).toBe(true);
    expect(lines.indexOf("Working")).toBeLessThan(lines.indexOf("Idle"));
    expect(has(lines, /freeflow\/task-003 {2}Pi live check {2}held by 4b1e90c2 · synced 12 min ago$/)).toBe(true);
    expect(has(lines, /freeflow\/task-002 {2}Docs sweep {2}free · last 2026-11-01$/)).toBe(true);
    expect(has(lines, /task-001 {2}Loose notes {2}free · last 2026-10-30$/)).toBe(true);
    expect(has(lines, /Finished/)).toBe(false);
    expect((await ui.findAll({ type: "Button" })).map((button: any) => button.key)).toContain("new-task");

    // Agents: the coordinator, its workers with the sub-worker nested, the returned one flagged, then other agents.
    await ui.press({ key: "view-agents" });
    lines = await shown(ui);
    expect(lines).toContain("A-011 · coordinator (this session) · ctx 62%");
    // The first surface's selection stays, a value the host holds for the session.
    expect(has(lines, /^[ ›] D-031 gates {2}build · opus high · returned: done {2}← check it$/)).toBe(true);
    expect(has(lines, /^ {2}D-035 session-catch-up {2}build · opus high · running$/)).toBe(true);
    expect(has(lines, /^ {4}D-035\.1 survey {2}gather · haiku xhigh · returned: done$/)).toBe(true);
    expect(has(lines, /^ {2}Explore the tests {2}Explore · completed$/)).toBe(true);
    expect(has(lines, /D-035 worker/)).toBe(false);
    // Enter on a row selects it and shows its brief, progress and return.
    await ui.press({ key: "agent:D-031" });
    lines = await shown(ui);
    expect(has(lines, /^› D-031 gates/)).toBe(true);
    expect(lines).toContain(`      return ${FOLDER}/D-031-gates/return.md (State: done)`);

    // Cost: the session, the task by model and effort, the plan's windows, the rest.
    await ui.press({ key: "view-cost" });
    lines = await shown(ui);
    expect(lines).toContain("  $1.23 so far");
    expect(lines).toContain("  claude-opus-5-5 high: 40 requests, 10000 in, 5000 out");
    expect(lines).toContain("  4 Slices and 2 delegations measured: $12.50 at API list price");
    expect(lines).toContain("  claude-haiku-5-5 xhigh: 1 delegation, $0.70");
    expect(lines).toContain("  The rest: nothing proposed in Future Work");
    expect(lines).toContain("  5h 16% (resets 2026-11-03 15:10 UTC) · 7d 41% (resets 2026-11-04 10:00 UTC)");

    // Decisions: the open agreement's items, waiting and new first.
    await ui.press({ key: "view-decisions" });
    lines = await shown(ui);
    expect(lines.slice(5)).toEqual([
      "A-011 — The overnight run",
      "  P2 [proposed] Retry how often? -> three times",
      "  P3 [new] Which reviewer? -> Haiku",
      "  P1 [agreed] Which first? -> oldest",
    ]);
    await ui.press({ key: "view-tasks" });
    expect(has(await shown(ui), /^Needs you$/)).toBe(true);
    // Each view button carries its digit.
    expect(
      (await ui.findAll({ type: "Button" }))
        .filter((button: any) => /^view-/.test(button.key))
        .map((b: any) => b.props.hotkey),
    ).toEqual(["1", "2", "3", "4"]);
    await ui.unmount();
  }
});

test("presses run Track Work's own commands, and each one that ran appends one row the agent reads", async ($, on) => {
  const w = world(on);
  w.answers[`task take`] = { stdout: "Took freeflow/task-002: this session holds it.\n" };
  w.answers[`task release`] = { stdout: "Released freeflow/task-001.\n" };
  w.answers[`task create`] = { stdout: "Created freeflow/task-005 — Fix the parser.\n" };
  w.answers[`task move`] = { stdout: "Moved task-001 to other/task-001.\n" };
  w.answers[`delegate check-return`] = { stdout: "D-031's return is ready.\n" };
  await opened($, w);
  const ui = await $.ui.mount(PANE("terminal"));
  const before = w.stateSets;
  const ran = () => w.reads().filter((run) => /^(task|delegate check-return)/.test(run));

  // Release: this session's hold.
  await ui.press({ key: "release" });
  expect(ran()).toEqual(["task release"]);
  expect(rows(w)).toEqual([
    "Freeflow: the user released freeflow/task-001 in Freeflow's pane (working-record.mjs task release): Released freeflow/task-001.",
  ]);
  expect(w.toasts.at(-1)).toBe("Released freeflow/task-001.");

  // Open with no task held: task take on the selected row.
  w.answers["session status"] = { stdout: JSON.stringify({ ...STATUS, task: null }) };
  await w.clock.advance(1);
  await ui.press({ key: "open" });
  expect(w.toasts.at(-1)).toBe("Freeflow: select a task first (Enter on its row).");
  await ui.press({ key: "task:freeflow/task-002" });
  await ui.press({ key: "open" });
  expect(ran().at(-1)).toBe("task take --id freeflow/task-002");
  expect(rows(w).length).toBe(2);

  // New task: its title, then its goal, then task create.
  await ui.press({ key: "new-task" });
  await ui.input({ key: "pane-input", text: "Fix the parser" });
  await ui.input({ key: "pane-input", text: "Parse nested lists" });
  expect(ran().at(-1)).toBe(
    "task create --title Fix the parser --goal Parse nested lists --cue read when Fix the parser is in question --cwd /work/widget",
  );
  expect(rows(w).length).toBe(3);

  // Move: the selected task, to the project typed.
  await ui.press({ key: "task:task-001" });
  await ui.press({ key: "move" });
  await ui.input({ key: "pane-input", text: "other" });
  expect(ran().at(-1)).toBe("task move --id task-001 --project other");

  // A command that fails shows its error and changes nothing else: no row.
  w.answers["task take"] = { exitCode: 1, stderr: "Error: Refused: session 4b1e90c2 holds it.\n" };
  await ui.press({ key: "task:freeflow/task-002" });
  await ui.press({ key: "open" });
  expect(w.toasts.at(-1)).toBe("Freeflow: Refused: session 4b1e90c2 holds it.");
  expect(rows(w).length).toBe(4);

  // While this session holds a task, open asks the agent to checkpoint it first (P46), as a prompt.
  w.answers["session status"] = { stdout: JSON.stringify(STATUS) };
  await w.clock.advance(1);
  await ui.press({ key: "task:freeflow/task-002" });
  await ui.press({ key: "open" });
  expect(w.submitted).toEqual([
    "The user pressed open on freeflow/task-002 in Freeflow's pane. Checkpoint freeflow/task-001 first, then run task switch --id freeflow/task-002 and recover it.",
  ]);

  // Agents: check-return, view the agent and send it a line.
  await ui.press({ key: "view-agents" });
  await ui.press({ key: "agent:D-031" });
  await ui.press({ key: "check-return" });
  expect(ran().at(-1)).toBe(`delegate check-return --record ${TASK} --id D-031`);
  expect(rows(w).length).toBe(5);
  await ui.press({ key: "agent:D-035" });
  await ui.press({ key: "view-agent" });
  expect(w.viewed).toEqual([{ agentId: "agent-35" }]);
  await ui.press({ key: "send" });
  await ui.input({ key: "pane-input", text: "Stop after the survey." });
  expect(w.sent.map((each: any) => [each.to, each.text])).toEqual([["agent-35", "Stop after the survey."]]);
  expect(rows(w).at(-1)).toBe(`Freeflow: the user sent D-035 a line from Freeflow's pane: "Stop after the survey."`);
  expect(rows(w).length).toBe(6);
  expect(w.stateSets).toBeGreaterThan(before);
  await ui.unmount();
});

test("the status line matches the fixture, is set only when it changes, and goes with pane.statusLine off", async ($, on) => {
  const w = world(on);
  await start($);
  await $.turn.complete({ turnId: "t1", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  await w.clock.advance(1);
  expect(w.statuses).toEqual([STATUS_LINE]);
  await $.turn.complete({ turnId: "t2", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  await w.clock.advance(1);
  expect(w.statuses).toEqual([STATUS_LINE]);

  // No task held: the line says so.
  w.answers["session status"] = { stdout: JSON.stringify({ ...STATUS, task: null }) };
  await $.turn.complete({ turnId: "t3", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  await w.clock.advance(1);
  expect(w.statuses.at(-1)).toBe("Freeflow: no task held · ctx 62% (cycle 12) · 7d 41%");

  w.switches.statusLine = false;
  await freeflow($, "settings pane.statusLine off");
  expect(w.statuses.at(-1)).toBeUndefined();
  const count = w.statuses.length;
  await $.turn.complete({ turnId: "t4", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  await w.clock.advance(1);
  expect(w.statuses.length).toBe(count);
});

test("no render writes state; a script that fails keeps the last values with an as-of line", async ($, on) => {
  const w = world(on);
  await opened($, w);
  const sets = w.stateSets;
  for (const surface of [...SURFACES, "vscode", "mobile"] as const) {
    const ui = await $.ui.mount(PANE(surface));
    await ui.redraw();
    expect(has(await shown(ui), /freeflow\/task-003/)).toBe(true);
    await ui.unmount();
  }
  expect(w.stateSets).toBe(sets);

  w.answers["project list --json"] = { exitCode: 1, stderr: "Error: the store is busy\n" };
  await $.turn.complete({ turnId: "t1", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  await w.clock.advance(1);
  const ui = await $.ui.mount(PANE("terminal"));
  const lines = await shown(ui);
  expect(has(lines, /freeflow\/task-003 {2}Pi live check/)).toBe(true);
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
  await $.turn.complete({ turnId: "t1", reason: "answer", answer: "", durationMs: 1, isAborted: false });
  await w.clock.advance(1);
  // The status line still reads what it shows; the pane's own reads do not run.
  expect(w.reads()).not.toContain("events summary --json");
  expect(w.reads()).toContain("project list --json");
});
