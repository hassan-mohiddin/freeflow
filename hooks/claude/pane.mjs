// Freeflow's pane and status line on Claude Code (SPEC-015): one pane, `freeflow`, with four views (Tasks, Agents,
// Cost, Decisions) and one status line under the prompt, drawn from what Track Work's script prints as JSON. The mod
// reads the script off the request path (a timer after session start, each main turn's end and each Track Work command
// a tool call ran), keeps the values in `$.state`, and draws from there: a render never writes state, and a redraw
// happens only when a value changed. A press runs the command the agent would run, with the user's press as the
// authority, and appends one row saying what the user did, so the agent sees it. Nothing here runs where no surface
// draws (a `-p` run, a cloud session): there is nothing to show.

const SCRIPT = "skills/track-work/scripts/working-record.mjs";
const SETTINGS_SCRIPT = "skills/setup-freeflow/scripts/settings.mjs";
const PANE = "freeflow";
const READ_TIMEOUT_MS = 30_000;
const SETTINGS_TIMEOUT_MS = 8_000;
const VIEWS = [
  { id: "tasks", label: "Tasks", hotkey: "1" },
  { id: "agents", label: "Agents", hotkey: "2" },
  { id: "cost", label: "Cost", hotkey: "3" },
  { id: "decisions", label: "Decisions", hotkey: "4" },
];
// What a Track Work command a tool ran looks like: after one, the store may have changed, so the pane reads again.
const TRACK_WORK = /working-record\.mjs\b/;

// The values a drawing reads; the mod alone writes them (SPEC-015 section 4).
/** Which view the pane shows. */
const VIEW = { plugin: "freeflow", key: "paneView" };
/** What the last reads found: `values`, `asOf` (the last read that found every value) and `failed` (what did not). */
const DATA = { plugin: "freeflow", key: "paneData" };
/** The row selected in each view, by view. */
const SELECTED = { plugin: "freeflow", key: "paneSelected" };
/** The question the pane's field is asking, or null: a new task's title or goal, a project to move to, a line to send. */
const ASKING = { plugin: "freeflow", key: "paneInput" };

/** Whether Freeflow is on and the pane and the status line are (`enabled`, `pane.enabled`, `pane.statusLine`). */
let switches = { enabled: true, pane: true, statusLine: true };
/** A read runs one at a time; one asked for meanwhile runs once it ends. */
let reading = false;
let readAgain = false;
/** The status line as last pinned, so an unchanged one is not set again. */
let pinned;

/**
 * Runs Track Work's script for this session, as its commands run in the session's shell.
 * @param {any} $
 * @param {string[]} args
 */
async function trackWork($, args) {
  return $.process.run(["node", `${$.plugin.root}/${SCRIPT}`, ...args], {
    env: { CLAUDE_CODE_SESSION_ID: await $.session.id() },
    timeoutMs: READ_TIMEOUT_MS,
  });
}

/** A failed run's first line, without the script's "Error: ". @param {{ stderr: string, exitCode: number }} run */
const firstError = (run) => (run.stderr.split("\n")[0] || `exit code ${run.exitCode}`).replace(/^Error: /, "").trim();

/**
 * Reads the three switches for the session's folder through the settings script, at session start and after
 * /freeflow settings changes one; a run that fails leaves them as they were. Off, the pane closes and the status line
 * goes.
 * @param {any} $
 * @param {any} [listed] the mod's own settings `list` result for this resolve, reused instead of a second run
 */
export async function resolvePane($, listed = undefined) {
  try {
    const settingsRows = listed !== undefined ? (listed.ok ? listed.data.settings : null) : await readSettingsRows($);
    if (!settingsRows) return;
    const rows = new Map(settingsRows.map((/** @type {any} */ row) => [row.key, row.value]));
    const value = (/** @type {string} */ key, /** @type {boolean} */ was) =>
      typeof rows.get(key) === "boolean" ? rows.get(key) : was;
    switches = {
      enabled: value("enabled", switches.enabled),
      pane: value("pane.enabled", switches.pane),
      statusLine: value("pane.statusLine", switches.statusLine),
    };
  } catch {
    return;
  }
  return applySwitches($);
}

/**
 * The settings script's rows for the session's folder, or null when its run fails.
 * @param {any} $
 */
async function readSettingsRows($) {
  const run = await $.process.run(
    [
      "node",
      `${$.plugin.root}/${SETTINGS_SCRIPT}`,
      "list",
      "--host",
      "claude-code",
      "--root",
      await $.session.cwd(),
      "--json",
    ],
    { env: { CLAUDE_CODE_SESSION_ID: await $.session.id() }, timeoutMs: SETTINGS_TIMEOUT_MS },
  );
  if (run.exitCode !== 0) return null;
  return JSON.parse(run.stdout).settings;
}

/**
 * Closes the pane and drops the status line when their switches are off.
 * @param {any} $
 */
async function applySwitches($) {
  if (!switches.enabled || !switches.pane)
    if ((await $.ui.panes()).some((/** @type {any} */ pane) => pane.id === PANE)) await $.ui.close({ id: PANE });
  if ((!switches.enabled || !switches.statusLine) && pinned !== undefined) {
    pinned = undefined;
    $.ui.status(undefined);
  }
}

/**
 * Asks for a read of the script's values, after the hook that asks has returned: never on the request path.
 * @param {any} $
 */
export function paneRead($) {
  if (!switches.enabled || (!switches.pane && !switches.statusLine)) return;
  $.clock.after(0, () => readAll($));
}

/** @param {any} $ */
async function readAll($) {
  if (reading) {
    readAgain = true;
    return;
  }
  reading = true;
  try {
    do {
      readAgain = false;
      await readOnce($);
    } while (readAgain);
  } catch (error) {
    $.ui.log(`Freeflow pane: ${error instanceof Error ? error.message : String(error)}`, { to: "debug" });
  } finally {
    reading = false;
  }
}

/** @param {any} $ */
async function isOpen($) {
  return (await $.ui.panes()).some((/** @type {any} */ pane) => pane.id === PANE);
}

/**
 * One read: session status, the projects and, for the task this session holds, its delegations; while the pane is
 * open, also what the task has spent, what its Slices left would take and this session's event summary; the session's
 * usage and agents from the engine. A script that fails keeps its last good value and is named in `failed`.
 * @param {any} $
 */
async function readOnce($) {
  const surfaces = await $.session.surfaces().catch(() => []);
  if (!surfaces?.length) return;
  const open = switches.pane && (await isOpen($));
  const { value: before } = await $.state.get(DATA);
  const last = before?.values ?? {};
  /** @type {string[]} */
  const failed = [];
  // A value read, or where its run fails the last one read, with the command named in `failed`.
  const read = async (/** @type {string} */ key, /** @type {string[]} */ args, /** @type {any} */ was = last[key]) => {
    try {
      const run = await trackWork($, args);
      if (run.exitCode === 0) return JSON.parse(run.stdout);
    } catch {
      // the same as a run that failed
    }
    failed.push(args.slice(0, 2).join(" "));
    return was ?? null;
  };
  const status = await read("status", ["session", "status"], {
    store: last.store,
    session: last.session,
    home: last.home,
    task: last.task ? { id: last.task } : null,
  });
  const store = Boolean(status?.store);
  const task = store ? (status?.task?.id ?? null) : null;
  const projects = store ? await read("projects", ["project", "list", "--json"]) : null;
  const delegations = task ? await read("delegations", ["delegate", "status", "--record", task, "--json"]) : null;
  let { spent = null, plan = null, events = null } = last;
  if (open) {
    spent = task ? await read("spent", ["estimate", "--spent", "--record", task, "--json"]) : null;
    // A task with no Slice proposed has nothing to plan: the script says so, which is not a failure.
    const planned = task ? await trackWork($, ["estimate", "--plan", "--record", task, "--json"]) : null;
    plan = planned ? (planned.exitCode === 0 ? JSON.parse(planned.stdout) : { none: firstError(planned) }) : null;
    // A session whose log has no line yet has nothing to sum: the script says so, which is not a failure.
    const summed = await trackWork($, ["events", "summary", "--json"]).catch(() => null);
    if (summed?.exitCode === 0) events = JSON.parse(summed.stdout);
    else if (summed && /No event log for session/.test(summed.stderr)) events = null;
    else failed.push("events summary");
  }
  const usage = await $.session.usage().catch(() => null);
  const agents = await $.agent.list().catch(() => []);
  const values = {
    session: status?.session ?? null,
    home: status?.home ?? null,
    store,
    task,
    cycle: store && status?.session ? await cycleOf($, status) : null,
    workers: store && status?.session ? await workersOf($, status) : {},
    projects,
    delegations,
    spent,
    plan,
    events,
    usage: usage && {
      context: usage.context?.percent ?? null,
      usd: usage.cost?.usd ?? null,
      windows: (usage.rateLimits ?? []).map((/** @type {any} */ limit) => ({
        kind: limit.kind,
        percent: limit.percentUsed,
        resetsAt: limit.resetsAt ?? null,
      })),
    },
    agents: agents.map((/** @type {any} */ agent) => ({
      id: agent.id,
      name: agent.name ?? null,
      description: agent.description,
      type: agent.type,
      status: agent.status,
      parentId: agent.parentId ?? null,
    })),
  };
  const changed =
    JSON.stringify(values) !== JSON.stringify(before?.values ?? null) ||
    JSON.stringify(failed) !== JSON.stringify(before?.failed ?? []);
  if (changed)
    await $.state.set(DATA, {
      values,
      failed,
      asOf: failed.length ? (before?.asOf ?? null) : new Date(await $.clock.now()).toISOString(),
    });
  pin($, values);
}

/**
 * The context cycle the mod counts in the store, as its rows name it: 1 until a compaction counts the next.
 * @param {any} $
 * @param {any} status
 */
async function cycleOf($, status) {
  const kept = await $.fs.read(`${status.home}/sessions/${status.session}/cycle.json`).catch(() => null);
  try {
    return Number(JSON.parse(kept ?? "null")?.cycle) || 1;
  } catch {
    return 1;
  }
}

/**
 * The workers the mod mapped to their delegations, by agent ID, from the store's sessions/ folder.
 * @param {any} $
 * @param {any} status
 */
async function workersOf($, status) {
  const kept = await $.fs.read(`${status.home}/sessions/${status.session}/delegations.json`).catch(() => null);
  try {
    return kept ? JSON.parse(kept) : {};
  } catch {
    return {};
  }
}

/** @param {any} values */
function heldTask(values) {
  for (const project of values?.projects?.projects ?? [])
    for (const task of project.tasks) if (task.id === values.task) return task;
  return null;
}

/** The plan's windows as the status line and the Cost view name them. */
const WINDOW_NAMES = /** @type {Record<string, string>} */ ({ five_hour: "5h", seven_day: "7d", spend_limit: "spend" });

/**
 * The status line: the task this session holds and its Slice or agreement, the context and its cycle, the weekly
 * window, and the workers (SPEC-015 section 3); null where there is nothing to say.
 * @param {any} values
 */
export function statusText(values) {
  if (!values?.store) return null;
  const task = heldTask(values);
  const work = task?.slice ?? task?.agreement ?? null;
  const parts = [values.task ? `${values.task}${work ? ` · ${work.id} ${work.title}` : ""}` : "Freeflow: no task held"];
  if (values.usage?.context !== null && values.usage?.context !== undefined)
    parts.push(`ctx ${values.usage.context}%${values.cycle ? ` (cycle ${values.cycle})` : ""}`);
  const week = values.usage?.windows?.find((/** @type {any} */ window) => window.kind === "seven_day");
  if (week) parts.push(`7d ${Math.round(week.percent)}%`);
  const open = values.delegations?.delegations ?? [];
  if (open.length) {
    const returned = open.filter((/** @type {any} */ item) => item.returned).length;
    parts.push(`${open.length} worker${open.length === 1 ? "" : "s"}${returned ? `, ${returned} returned` : ""}`);
  }
  return parts.join(" · ");
}

/**
 * Pins the status line when it changed, while it is on.
 * @param {any} $
 * @param {any} values
 */
function pin($, values) {
  const text = switches.enabled && switches.statusLine ? (statusText(values) ?? undefined) : undefined;
  if (text === pinned) return;
  pinned = text;
  $.ui.status(text);
}

/**
 * Serves `/freeflow pane`: opens the pane, or closes it when it is open.
 * @param {any} $
 * @returns {Promise<{ text: string }>}
 */
export async function paneCommand($) {
  // The switches as the files hold them now, whatever session start read.
  await resolvePane($);
  if (!switches.enabled) return { text: "Freeflow is off in this session (enabled): the pane has nothing to show." };
  if (!switches.pane)
    return { text: "Freeflow's pane is off (pane.enabled); /freeflow settings pane.enabled on turns it on." };
  if (await isOpen($)) {
    await $.ui.close({ id: PANE });
    return { text: "Freeflow's pane closed." };
  }
  const opened = await $.ui.open({ id: PANE, title: "Freeflow", focus: true, closeOnEscape: true });
  if (!opened.isPlaced) return { text: `Freeflow's pane did not open here (${opened.reason}).` };
  paneRead($);
  return { text: "Freeflow's pane opened: 1 Tasks, 2 Agents, 3 Cost, 4 Decisions." };
}

// ---- Drawing ----

/** A text cut to `width` cells, with an ellipsis where it was cut. */
const cut = (/** @type {string} */ text, /** @type {number} */ width) =>
  text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;

/** Minutes or hours since a "YYYY-MM-DD HH:MM" UTC time. */
function ago(/** @type {string | null} */ when, /** @type {number} */ now) {
  if (!when) return "never";
  const minutes = Math.round((now - Date.parse(`${when.replace(" ", "T")}:00Z`)) / 60_000);
  if (!Number.isFinite(minutes)) return when;
  return minutes < 60
    ? `${Math.max(0, minutes)} min ago`
    : minutes < 48 * 60
      ? `${Math.round(minutes / 60)} h ago`
      : `on ${when.slice(0, 10)}`;
}

/** Model and effort as a row names them: "claude-opus-5-5, high" is "opus high". */
const agentName = (/** @type {string | null} */ agent) =>
  (agent ?? "")
    .replace(/,\s*/, " ")
    .replace(/\bclaude-([a-z]+)(?:-[\d-]+)?/i, "$1")
    .trim()
    .toLowerCase();

const dollars = (/** @type {number} */ usd) => `$${usd.toFixed(2)}`;

/** The decision items waiting on the user: proposed or new. */
const waiting = (/** @type {any} */ task) =>
  (task?.decisions ?? []).filter((/** @type {any} */ item) => ["proposed", "new"].includes(item.state)).length;

/**
 * The tasks by state, what needs the user first (P2): a task with decisions waiting, or this session's with a worker
 * returned; then the ones a session holds; then the free ones still open.
 * @param {any} values
 */
export function taskGroups(values) {
  const returned = (values?.delegations?.delegations ?? []).some((/** @type {any} */ item) => item.returned);
  const groups = {
    needs: /** @type {any[]} */ ([]),
    working: /** @type {any[]} */ ([]),
    idle: /** @type {any[]} */ ([]),
  };
  for (const project of values?.projects?.projects ?? [])
    for (const task of project.tasks) {
      if (task.state && !["active", "paused"].includes(task.state)) continue;
      if (waiting(task) || (task.thisSession && returned)) groups.needs.push(task);
      else if (task.hold) groups.working.push(task);
      else groups.idle.push(task);
    }
  return groups;
}

/**
 * What a task's row says after its ID and title.
 * @param {any} task
 * @param {any} values
 * @param {number} now
 */
function holderText(task, values, now) {
  const decisions = waiting(task);
  const parts = [];
  if (task.thisSession) {
    parts.push("this session");
    if (task.agreement) parts.push(task.agreement.id);
    const returned = (values.delegations?.delegations ?? []).filter((/** @type {any} */ item) => item.returned).length;
    if (returned) parts.push(`${returned} returned`);
  } else if (task.hold) parts.push(`held by ${task.hold.session}`, `synced ${ago(task.lastSync, now)}`);
  else parts.push("free", `last ${task.lastSync ? task.lastSync.slice(0, 10) : "never"}`);
  if (decisions) parts.push(`${decisions} decision${decisions === 1 ? "" : "s"} waiting`);
  return parts.join(" · ");
}

/** The delegation's row: kind, model and effort, and where it stands. */
function delegationText(/** @type {any} */ item, /** @type {any} */ agent) {
  const state = item.returned
    ? `returned: ${item.returned}`
    : agent
      ? agent.status
      : item.handle && item.handle !== "not started"
        ? item.handle
        : "no return yet";
  return [item.kind, agentName(item.agent), state].filter(Boolean).join(" · ");
}

/** The agent working on a delegation: the agent ID the mod mapped to it, and that agent as `$.agent.list()` has it. */
function agentOf(/** @type {any} */ values, /** @type {string} */ delegation) {
  const id = Object.entries(values?.workers ?? {}).find(([, each]) => each === delegation)?.[0];
  return id ? (values.agents.find((/** @type {any} */ agent) => agent.id === id) ?? { id, status: "gone" }) : null;
}

/**
 * Draws the pane: the views' bar, the view the person chose, the field when the pane asks something, and the keys.
 * Reads `$.state` only; writes nothing.
 * @param {any} $
 * @param {any} e
 */
async function drawPane($, e) {
  const el = $.ui.resolve(e);
  const { value: view = "tasks" } = await $.state.get(VIEW);
  const { value: data } = await $.state.get(DATA);
  const { value: selected = {} } = await $.state.get(SELECTED);
  const { value: asking = null } = await $.state.get(ASKING);
  const width = Math.max(24, e.props?.bodyColumns ?? e.viewport?.columns ?? 80);
  const now = await $.clock.now();
  const text = (/** @type {string} */ words, /** @type {any} */ props = {}) =>
    el.Text({ ...props, children: cut(words, width) });
  const keys = (/** @type {[string, string, string, () => void][]} */ buttons) =>
    el.Box({
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: 2,
      children: buttons.map(([key, hotkey, label, onPress]) => el.Button({ key, hotkey, label, plain: true, onPress })),
    });
  const bar = el.Box({
    flexDirection: "row",
    columnGap: 2,
    children: [
      el.Text({ bold: true, children: "Freeflow" }),
      ...VIEWS.map((each) =>
        el.Button({
          key: `view-${each.id}`,
          hotkey: each.hotkey,
          label: each.label,
          plain: true,
          dimColor: each.id !== view,
          onPress: () => setView($, each.id),
        }),
      ),
    ],
  });
  const values = data?.values;
  /** @type {any[]} */
  let body;
  if (!values) body = [text("Reading Freeflow's state…", { dimColor: true })];
  else if (!values.store)
    body = [text("No Freeflow store in this session: the pane shows a store's tasks.", { dimColor: true })];
  else if (view === "agents") body = agentsView($, el, values, selected.agents, text, keys);
  else if (view === "cost") body = costView(values, text);
  else if (view === "decisions") body = decisionsView(values, text);
  else body = tasksView($, el, values, selected.tasks, text, keys, now);
  const field = asking ? askingField($, el, e.surface, asking, text) : [];
  const stale = data?.failed?.length
    ? [
        text(`as of ${data.asOf ? data.asOf.slice(11, 16) : "never"}; could not read ${data.failed.join(", ")}`, {
          dimColor: true,
        }),
      ]
    : [];
  return el.Box({ flexDirection: "column", children: [bar, ...body, ...field, ...stale] });
}

/**
 * The Tasks view: the store's open tasks by state, one line each, the selected one marked; Enter on a row selects it.
 * @param {any} $
 * @param {any} el
 * @param {any} values
 * @param {string | undefined} chosen
 * @param {(words: string, props?: any) => any} text
 * @param {(buttons: [string, string, string, () => void][]) => any} keys
 * @param {number} now
 */
function tasksView($, el, values, chosen, text, keys, now) {
  const groups = taskGroups(values);
  const rows = [];
  for (const [name, tasks] of /** @type {[string, any[]][]} */ ([
    ["Needs you", groups.needs],
    ["Working", groups.working],
    ["Idle", groups.idle],
  ])) {
    if (!tasks.length) continue;
    rows.push(text(name, { bold: true }));
    for (const task of tasks)
      rows.push(
        el.Button({
          key: `task:${task.id}`,
          plain: true,
          onPress: () => select($, "tasks", task.id),
          children: [
            `${task.id === chosen ? "› " : "  "}${task.id}  ${task.title ?? task.problem ?? ""}  `,
            el.Text({ dimColor: true, children: holderText(task, values, now) }),
          ],
        }),
      );
  }
  if (!rows.length) rows.push(text("No open tasks in the store.", { dimColor: true }));
  rows.push(
    keys([
      ["open", "o", "open", () => openTask($)],
      ["new-task", "n", "new task", () => ask($, { kind: "title" })],
      ["move", "m", "move", () => moveTask($)],
      ["release", "r", "release", () => releaseTask($)],
    ]),
  );
  return rows;
}

/**
 * The Agents view: the coordinator, its delegations with their sub-workers nested, then the session's other agents.
 * @param {any} $
 * @param {any} el
 * @param {any} values
 * @param {string | undefined} chosen
 * @param {(words: string, props?: any) => any} text
 * @param {(buttons: [string, string, string, () => void][]) => any} keys
 */
function agentsView($, el, values, chosen, text, keys) {
  const task = heldTask(values);
  const rows = [];
  const context = values.usage?.context;
  rows.push(
    text(
      `${task?.agreement?.id ?? values.task ?? "No task held"} · coordinator (this session)${context === null || context === undefined ? "" : ` · ctx ${context}%`}`,
      { bold: true },
    ),
  );
  const mapped = new Set(Object.keys(values.workers ?? {}));
  const row = (
    /** @type {string} */ id,
    /** @type {string} */ indent,
    /** @type {string} */ name,
    /** @type {string} */ detail,
    /** @type {boolean} */ flag,
  ) =>
    el.Button({
      key: `agent:${id}`,
      plain: true,
      onPress: () => select($, "agents", id),
      children: [
        `${id === chosen ? "› " : "  "}${indent}${name}  `,
        el.Text({ dimColor: true, children: detail }),
        ...(flag ? ["  ← check it"] : []),
      ],
    });
  for (const item of values.delegations?.delegations ?? []) {
    if (item.problem) {
      rows.push(text(`  ${item.id}: ${item.problem}`, { dimColor: true }));
      continue;
    }
    rows.push(
      row(
        item.id,
        "",
        `${item.id} ${item.title}`,
        delegationText(item, agentOf(values, item.id)),
        Boolean(item.returned),
      ),
    );
    if (item.id === chosen) rows.push(...folderLines(item, text));
    for (const sub of item.sub ?? []) {
      rows.push(row(sub.id, "  ", `${sub.id} ${sub.title}`, delegationText(sub, agentOf(values, sub.id)), false));
      if (sub.id === chosen) rows.push(...folderLines(sub, text));
    }
  }
  for (const agent of values.agents ?? []) {
    if (mapped.has(agent.id)) continue;
    rows.push(row(agent.id, "", agent.name ?? agent.description, `${agent.type} · ${agent.status}`, false));
  }
  if (rows.length === 1) rows.push(text("No delegations or agents running.", { dimColor: true }));
  rows.push(
    keys([
      ["view-agent", "v", "view the agent", () => viewAgent($)],
      ["send", "s", "send a line", () => sendLine($)],
      ["check-return", "c", "check-return", () => checkReturn($)],
    ]),
  );
  return rows;
}

/** A selected delegation's brief, progress and return. */
function folderLines(/** @type {any} */ item, /** @type {(words: string, props?: any) => any} */ text) {
  return [
    text(`      brief ${item.folder}/brief.md`, { dimColor: true }),
    text(`      progress ${item.folder}/progress.md`, { dimColor: true }),
    text(`      return ${item.folder}/return.md${item.returned ? ` (State: ${item.returned})` : ", none yet"}`, {
      dimColor: true,
    }),
  ];
}

/**
 * The Cost view: this session, the task's measured spending by model and effort, the plan's windows, and what the
 * Slices left would take.
 * @param {any} values
 * @param {(words: string, props?: any) => any} text
 */
function costView(values, text) {
  const rows = [text("This session", { bold: true })];
  const usd = values.usage?.usd;
  rows.push(text(`  ${usd === null || usd === undefined ? "cost not known" : `${dollars(usd)} so far`}`));
  for (const each of values.events?.tokens ?? [])
    rows.push(
      text(
        `  ${each.model}${each.effort ? ` ${each.effort}` : ""}: ${each.requests} requests, ${each.in + each.cacheRead + each.cacheWrite} in, ${each.out} out`,
        { dimColor: true },
      ),
    );
  if (values.task) {
    rows.push(text(`Task ${values.task}`, { bold: true }));
    const spent = values.spent;
    if (!spent) rows.push(text("  not read yet", { dimColor: true }));
    else {
      rows.push(
        text(
          `  ${spent.slices} Slice${spent.slices === 1 ? "" : "s"} and ${spent.delegations} delegation${spent.delegations === 1 ? "" : "s"} measured: ${dollars(spent.usd)} at API list price`,
        ),
      );
      for (const each of spent.byModel)
        rows.push(
          text(
            `  ${each.name}: ${[each.slices ? `${each.slices} Slice${each.slices === 1 ? "" : "s"}` : null, each.delegations ? `${each.delegations} delegation${each.delegations === 1 ? "" : "s"}` : null].filter(Boolean).join(", ")}, ${dollars(each.usd)}`,
            { dimColor: true },
          ),
        );
    }
    const plan = values.plan;
    rows.push(
      text(
        !plan
          ? "  The rest: not read yet"
          : plan.none
            ? "  The rest: nothing proposed in Future Work"
            : `  The rest: ${plan.slices} Slice${plan.slices === 1 ? "" : "s"} left, ${plan.cycles} context cycle${plan.cycles === 1 ? "" : "s"}${plan.total?.usd === null || plan.total?.usd === undefined ? "" : `, about ${dollars(plan.total.usd)}`}`,
      ),
    );
  }
  rows.push(text("Plan", { bold: true }));
  const windows = values.usage?.windows ?? [];
  rows.push(
    text(
      windows.length
        ? `  ${windows
            .map(
              (/** @type {any} */ window) =>
                `${WINDOW_NAMES[window.kind] ?? window.kind} ${Math.round(window.percent)}%${window.resetsAt ? ` (resets ${window.resetsAt.slice(0, 16).replace("T", " ")} UTC)` : ""}`,
            )
            .join(" · ")}`
        : "  no plan windows: an API key, or no request yet",
    ),
  );
  return rows;
}

/**
 * The Decisions view: the open agreement's items, those waiting on the user and new first, as the script orders them.
 * @param {any} values
 * @param {(words: string, props?: any) => any} text
 */
function decisionsView(values, text) {
  const task = heldTask(values);
  if (!task)
    return [text("This session holds no task: its decisions show here once it takes one.", { dimColor: true })];
  if (!task.agreement) return [text(`${task.id} has no open agreement.`, { dimColor: true })];
  const rows = [text(`${task.agreement.id} — ${task.agreement.title}`, { bold: true })];
  for (const item of task.decisions)
    rows.push(
      text(`  ${item.id} [${item.state}] ${item.text}`, { dimColor: !["proposed", "new"].includes(item.state) }),
    );
  if (!task.decisions.length) rows.push(text("  No decision items yet.", { dimColor: true }));
  return rows;
}

/**
 * The field the pane asks with, and a button that cancels it; where the surface has no field (mobile), a line says
 * where to type.
 * @param {any} $
 * @param {any} el
 * @param {string} surface
 * @param {any} asking
 * @param {(words: string, props?: any) => any} text
 */
function askingField($, el, surface, asking, text) {
  const label =
    asking.kind === "title"
      ? "New task's title:"
      : asking.kind === "goal"
        ? `Goal of "${asking.title}":`
        : asking.kind === "move"
          ? `Move ${asking.id} to project (none: no project):`
          : `Send to ${asking.label}:`;
  if (surface === "mobile") return [text(`${label} type it on the terminal or desktop.`, { dimColor: true })];
  return [
    el.Input({
      key: "pane-input",
      label,
      autoFocus: true,
      onSubmit: (/** @type {string} */ value) => answer($, value),
    }),
    el.Button({ key: "input-cancel", label: "cancel", plain: true, onPress: () => ask($, null) }),
  ];
}

// ---- Presses: each runs in the plugin, after the person's press; none runs while drawing ----

/** @param {any} $ @param {string} view */
async function setView($, view) {
  await $.state.set(VIEW, view);
}

/** @param {any} $ @param {string} view @param {string} id */
async function select($, view, id) {
  const { value = {} } = await $.state.get(SELECTED);
  await $.state.set(SELECTED, { ...value, [view]: id });
}

/** @param {any} $ @param {any} asking */
async function ask($, asking) {
  await $.state.set(ASKING, asking);
}

/** The values as last read, and the row selected in a view. @param {any} $ @param {string} view */
async function current($, view) {
  const { value: data } = await $.state.get(DATA);
  const { value: selected = {} } = await $.state.get(SELECTED);
  return { values: data?.values ?? null, id: selected[view] ?? null };
}

/**
 * Appends the row that tells the agent what the user did in the pane.
 * @param {any} $
 * @param {string} text
 */
async function tell($, text) {
  await $.session.append({ message: { type: "user", content: [{ type: "text", text }] } });
}

/**
 * Runs a Track Work command for a press. Done, one row tells the agent and a toast tells the user; failed, a toast
 * shows the error and nothing else changes (section 5). Either way the pane reads again.
 * @param {any} $
 * @param {string} what what the user did, as the row says it
 * @param {string[]} args
 */
async function act($, what, args) {
  let run;
  try {
    run = await trackWork($, args);
  } catch (error) {
    $.ui.toast(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (run.exitCode !== 0) {
    $.ui.toast(`Freeflow: ${firstError(run)}`);
    paneRead($);
    return;
  }
  const said = run.stdout.trim().split("\n")[0] ?? "";
  await tell($, `Freeflow: the user ${what} in Freeflow's pane (working-record.mjs ${args.join(" ")}): ${said}`);
  $.ui.toast(said || "Done.");
  paneRead($);
}

/**
 * Open: takes the selected task in this session (P46). Held elsewhere, it asks before taking it over; while this
 * session holds another task, the agent is asked to checkpoint that one first and switch, since only the agent can
 * write its checkpoint.
 * @param {any} $
 */
async function openTask($) {
  const { values, id } = await current($, "tasks");
  const task = values && taskGroupsList(values).find((each) => each.id === id);
  if (!task) {
    $.ui.toast("Freeflow: select a task first (Enter on its row).");
    return;
  }
  if (task.thisSession) {
    $.ui.toast(`Freeflow: this session already holds ${task.id}.`);
    return;
  }
  let takeover = false;
  if (task.hold) {
    const question = `${task.id} is held by session ${task.hold.session}, last synced ${task.lastSync ?? "never"}. Take it over?`;
    const chosen = await $.ui.ask(question, ["Take it over", "Leave it"]).catch(() => null);
    if (chosen !== "Take it over") return;
    takeover = true;
  }
  if (values.task) {
    await $.prompt.submit({
      text: `The user pressed open on ${task.id} in Freeflow's pane. Checkpoint ${values.task} first, then run task switch --id ${task.id}${takeover ? " --takeover" : ""} and recover it.`,
    });
    $.ui.toast(`Freeflow: the agent checkpoints ${values.task}, then switches to ${task.id}.`);
    return;
  }
  await act($, `opened ${task.id}`, ["task", "take", "--id", task.id, ...(takeover ? ["--takeover"] : [])]);
}

/** Every task the Tasks view lists. @param {any} values */
function taskGroupsList(values) {
  const groups = taskGroups(values);
  return [...groups.needs, ...groups.working, ...groups.idle];
}

/** Move: asks which project the selected task goes to. @param {any} $ */
async function moveTask($) {
  const { values, id } = await current($, "tasks");
  if (!values || !taskGroupsList(values).some((each) => each.id === id)) {
    $.ui.toast("Freeflow: select a task first (Enter on its row).");
    return;
  }
  await ask($, { kind: "move", id });
}

/** Release: ends this session's hold on the task it holds. @param {any} $ */
async function releaseTask($) {
  const { values } = await current($, "tasks");
  if (!values?.task) {
    $.ui.toast("Freeflow: this session holds no task.");
    return;
  }
  await act($, `released ${values.task}`, ["task", "release"]);
}

/**
 * The agent behind the row selected in the Agents view: a delegation's worker, or an agent of the session.
 * @param {any} values
 * @param {string | null} id
 */
function chosenAgent(values, id) {
  if (!values || !id) return null;
  if (/^D-\d/.test(id)) return agentOf(values, id);
  return values.agents.find((/** @type {any} */ agent) => agent.id === id) ?? null;
}

/** View: points the main view at the selected agent (`$.ui.view`). @param {any} $ */
async function viewAgent($) {
  const { values, id } = await current($, "agents");
  const agent = chosenAgent(values, id);
  if (!agent || agent.status === "gone") {
    $.ui.toast("Freeflow: select a running agent first (Enter on its row).");
    return;
  }
  const viewed = await $.ui.view({ agentId: agent.id });
  if (viewed?.deny) $.ui.toast(`Freeflow: ${viewed.deny}`);
}

/** Send: asks for the line to send to the selected agent. @param {any} $ */
async function sendLine($) {
  const { values, id } = await current($, "agents");
  const agent = chosenAgent(values, id);
  if (!agent || agent.status === "gone") {
    $.ui.toast("Freeflow: select a running agent first (Enter on its row).");
    return;
  }
  await ask($, { kind: "send", agentId: agent.id, label: id });
}

/** Check-return: runs delegate check-return on the selected delegation. @param {any} $ */
async function checkReturn($) {
  const { values, id } = await current($, "agents");
  if (!values?.task || !id || !/^D-\d/.test(id)) {
    $.ui.toast("Freeflow: select a delegation first (Enter on its row).");
    return;
  }
  await act($, `checked ${id}'s return`, ["delegate", "check-return", "--record", values.task, "--id", id]);
}

/**
 * What the field's Enter does, by the question it asked: a new task's title then its goal (then task create), a
 * project for task move, or a line sent to an agent.
 * @param {any} $
 * @param {string} value
 */
async function answer($, value) {
  const { value: asking } = await $.state.get(ASKING);
  const typed = value.trim();
  if (!asking) return;
  if (!typed) {
    await ask($, null);
    return;
  }
  if (asking.kind === "title") {
    await ask($, { kind: "goal", title: typed });
    return;
  }
  await ask($, null);
  if (asking.kind === "goal")
    await act($, `created the task "${asking.title}"`, [
      "task",
      "create",
      "--title",
      asking.title,
      "--goal",
      typed,
      "--cue",
      `read when ${asking.title} is in question`,
      "--cwd",
      await $.session.cwd(),
    ]);
  else if (asking.kind === "move")
    await act($, `moved ${asking.id}`, [
      "task",
      "move",
      "--id",
      asking.id,
      ...(typed === "none" ? ["--no-project"] : ["--project", typed]),
    ]);
  else if (asking.kind === "send") {
    const sent = await $.session.send({ to: { agentId: asking.agentId }, text: typed });
    if (sent?.isDelivered === false || sent?.deny) {
      $.ui.toast(`Freeflow: the line did not reach ${asking.label}.`);
      return;
    }
    await tell($, `Freeflow: the user sent ${asking.label} a line from Freeflow's pane: "${typed}"`);
    $.ui.toast(`Sent to ${asking.label}.`);
  }
}

/**
 * The pane's own hooks: its drawing, and the reads after each Track Work command a tool ran. The mod's other hooks
 * ask for a read at session start and at each main turn's end.
 * @param {import("claude-code").On} on
 */
export function registerPane(on) {
  on("ui.render", { component: "Pane", requestId: PANE }, ($, e) => drawPane($, e));

  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const result = await next(e);
    const input = /** @type {Record<string, unknown>} */ (e);
    if (typeof input.command === "string" && TRACK_WORK.test(input.command)) paneRead($);
    return result;
  });
}
