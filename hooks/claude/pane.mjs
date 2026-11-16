// Freeflow's pane and status line on Claude Code (SPEC-015), as Hassan chose them from the mock-ups on 2026-11-14
// (layout B): one pane, `freeflow`, with what needs the user and what is happening now fixed at the top, and five tabs
// under them (Projects and tasks, Workers, Sent, Settings, About); and one status line under the prompt. Both are drawn
// from what Track Work's and Setup Freeflow's scripts print as JSON. The mod reads the scripts off the request path (a
// timer after session start, each main turn's end and each Track Work command a tool call ran), keeps the values in
// `$.state`, and draws from there: a render never writes state, and a redraw happens only when a value changed. A press
// runs the command the agent would run, with the user's press as the authority, and appends one row saying what the
// user did, so the agent sees it. Nothing here runs where no surface draws (a `-p` run, a cloud session).

// `/freeflow settings` as the mod serves it, so a change from the pane does what the command does (a plugin's own
// `$.command.run` skips its own hooks); and the event log's flush, so a switch reads what this session did.
import { flush, settingsCommand } from "./freeflow.mjs";

const SCRIPT = "skills/track-work/scripts/working-record.mjs";
const SETTINGS_SCRIPT = "skills/setup-freeflow/scripts/settings.mjs";
const PANE = "freeflow";
const READ_TIMEOUT_MS = 30_000;
/** A press's command may pull or push the store (take, release, switch, create), so it gets longer than a read. */
const PRESS_TIMEOUT_MS = 120_000;
const SETTINGS_TIMEOUT_MS = 8_000;
/** The pane's width docked: 50 columns, which a terminal of about 112 columns gives (a dock takes at most 45%). */
const DOCK_COLUMNS = 50;
/** The rows the pane asks for where it opens inline above the prompt. */
const INLINE_ROWS = 24;
/** The status line's budgets: the project's words and the task's (its short name when it has one). */
const PROJECT_BUDGET = 16;
const TASK_BUDGET = 24;
/** Sent's first page, and each "show older" adds as many again. */
const SENT_PAGE = 20;
/** A file or text the reading view shows is cut here. */
const READING_LIMIT = 20_000;
const GUIDE_URL = "https://github.com/hassan-mohiddin/freeflow/blob/main/plugin-docs/README.md";
const TABS = [
  { id: "projects", label: "Tasks", hotkey: "1" },
  { id: "workers", label: "Workers", hotkey: "2" },
  { id: "sent", label: "Sent", hotkey: "3" },
  { id: "settings", label: "Settings", hotkey: "4" },
  { id: "about", label: "About", hotkey: "5" },
];
/** A change's reach, as the `⋯` menu on a settings row offers it, and the `/freeflow settings` flag each takes (D-060). */
const REACHES = [
  { id: "everywhere", label: "Everywhere" },
  { id: "folder", label: "Only this folder" },
  { id: "session", label: "Only this session" },
];
const REACH_FLAGS = /** @type {Record<string, string>} */ ({
  everywhere: "",
  folder: "--folder",
  session: "--session",
});
// What a Track Work command a tool ran looks like: after one, the store may have changed, so the pane reads again.
const TRACK_WORK = /working-record\.mjs\b/;

// The values a drawing reads; the mod alone writes them (SPEC-015 section 4).
/** Which tab the pane shows. */
const TAB = { plugin: "freeflow", key: "paneTab" };
/** What the last reads found: `values`, `asOf` (the last read that found every value) and `failed` (what did not). */
const DATA = { plugin: "freeflow", key: "paneData" };
/** What the user picked: the project, the task and the worker. */
const SELECTED = { plugin: "freeflow", key: "paneSelected" };
/** The question the pane's field is asking, or null: a new task's title, then its goal. */
const ASKING = { plugin: "freeflow", key: "paneInput" };
/** What the reading view shows in place of the tab, or null: a brief, a return, a sent text, the guide. */
const READING = { plugin: "freeflow", key: "paneReading" };
/** The settings row whose `⋯` menu is open, and the reach the user chose for each row's next change. */
const REACH = { plugin: "freeflow", key: "paneReach" };
/**
 * A new task the user asked for while this session holds one with work done under it: the agent checkpoints and
 * releases the held task, and the pane creates this one at its next read that finds no task held (`from`: the task
 * held when it was asked). The user's text goes to the script as arguments, never through a shell.
 */
const NEW_TASK = { plugin: "freeflow", key: "paneNewTask" };
/** How many of the newest sent lines Sent lists. */
const SENT_SHOWN = { plugin: "freeflow", key: "paneSentShown" };

/**
 * Whether Freeflow is on, the pane and the status line are, and the event log is (`enabled`, `pane.enabled`,
 * `pane.statusLine`, `events.enabled`: off, Sent is empty).
 */
let switches = { enabled: true, pane: true, statusLine: true, eventLog: true };
/** A read runs one at a time; one asked for meanwhile runs once it ends. */
let reading = false;
let readAgain = false;
/** The status line as last pinned, so an unchanged one is not set again. */
let pinned;

/**
 * Runs Track Work's script for this session, as its commands run in the session's shell.
 * @param {any} $
 * @param {string[]} args
 * @param {number} [timeoutMs] a read's, unless a press's command needs longer
 */
async function trackWork($, args, timeoutMs = READ_TIMEOUT_MS) {
  return $.process.run(["node", `${$.plugin.root}/${SCRIPT}`, ...args], {
    env: { CLAUDE_CODE_SESSION_ID: await $.session.id() },
    timeoutMs,
  });
}

/**
 * Runs the settings script for the session's folder.
 * @param {any} $
 * @param {string[]} args
 */
async function settingsScript($, args) {
  return $.process.run(
    ["node", `${$.plugin.root}/${SETTINGS_SCRIPT}`, ...args, "--root", await $.session.cwd(), "--json"],
    { env: { CLAUDE_CODE_SESSION_ID: await $.session.id() }, timeoutMs: SETTINGS_TIMEOUT_MS },
  );
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
      eventLog: value("events.enabled", switches.eventLog),
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
  const run = await settingsScript($, ["list", "--host", "claude-code"]);
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
 * Asks for a read of the scripts' values, after the hook that asks has returned: never on the request path.
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
 * One read. Always: session status and the projects, which the status line needs; the session's usage from the engine.
 * While the pane is open, also: the held task's delegations, what the task has spent, this session's event summary
 * (the workers' minutes and tokens, and whether work was done under the held task), the newest sent lines, the
 * settings' normal view and the plugin's version; the session's agents from the engine. A script that fails keeps its
 * last good value and is named in `failed`.
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
  if (store && !failed.includes("session status")) await pendingTask($, task);
  const projects = store ? await read("projects", ["project", "list", "--json"]) : null;
  let { delegations = null, spent = null, events = null, sent = null, settings = null, version = null } = last;
  if (open) {
    delegations = task ? await read("delegations", ["delegate", "status", "--record", task, "--json"]) : null;
    spent = task ? await read("spent", ["estimate", "--spent", "--record", task, "--json"]) : null;
    events = await eventSummary($, failed, events);
    sent = await sentList($, failed, sent);
    settings = await settingsView($, failed, settings);
    version = await versionOf($);
  }
  const usage = await $.session.usage().catch(() => null);
  const agents = open ? await $.agent.list().catch(() => []) : (last.agents ?? []);
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
    events,
    sent,
    settings,
    version,
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
 * This session's event summary since it took the task it holds; a session whose log has no line yet has nothing to
 * sum, which is not a failure.
 * @param {any} $
 * @param {string[]} failed
 * @param {any} was
 */
async function eventSummary($, failed, was) {
  try {
    const summed = await trackWork($, ["events", "summary", "--json"]);
    if (summed.exitCode === 0) return JSON.parse(summed.stdout);
    if (/No event log for session/.test(summed.stderr)) return null;
  } catch {
    // the same as a run that failed: a run that cannot start, or output that is not JSON
  }
  failed.push("events summary");
  return was;
}

/**
 * The newest sent lines, as many as Sent shows; no event log yet is an empty list.
 * @param {any} $
 * @param {string[]} failed
 * @param {any} was
 */
async function sentList($, failed, was) {
  const { value: shown = SENT_PAGE } = await $.state.get(SENT_SHOWN);
  try {
    const run = await trackWork($, ["events", "sent", "--json", "--limit", String(shown)]);
    if (run.exitCode === 0) return JSON.parse(run.stdout);
    if (/No event log for session/.test(run.stderr)) return { total: 0, sent: [] };
  } catch {
    // the same as a run that failed: a run that cannot start, or output that is not JSON
  }
  failed.push("events sent");
  return was;
}

/**
 * The settings' normal view as rows: `list --view normal --json` from the settings script, each row with key, label,
 * value, the scope it came from, its choices and whether it is read-only.
 * @param {any} $
 * @param {string[]} failed
 * @param {any} was
 */
async function settingsView($, failed, was) {
  try {
    // The flat list also gives the event log's switch, which empties Sent; the normal view does not show it.
    const listed = await settingsScript($, ["list", "--host", "claude-code"]);
    const flat = listed.exitCode === 0 ? JSON.parse(listed.stdout).settings : null;
    const eventLog = flat?.find((/** @type {any} */ row) => row.key === "events.enabled")?.value;
    if (typeof eventLog === "boolean") switches = { ...switches, eventLog };
    const normal = await settingsScript($, ["list", "--view", "normal"]);
    if (normal.exitCode === 0)
      return { rows: JSON.parse(normal.stdout).settings.map((/** @type {any} */ row) => settingRow(row)) };
  } catch {
    // the same as a run that failed
  }
  failed.push("settings list");
  return was;
}

/**
 * One row of the normal view as the pane draws it.
 * @param {any} row
 */
function settingRow(row) {
  const choices = (row.choices ?? (typeof row.value === "boolean" ? [true, false] : [])).map(
    (/** @type {any} */ choice) =>
      typeof choice === "object" && choice !== null
        ? { value: choice.value, label: choice.label ?? shownValue(choice.value) }
        : { value: choice, label: shownValue(choice) },
  );
  return {
    key: row.key,
    label: row.label ?? row.key,
    value: row.value,
    scope: row.scope ?? "default",
    choices,
    readOnly: Boolean(row.readOnly ?? row.readonly ?? row["read-only"] ?? false),
  };
}

/** The plugin's version, from its manifest. @param {any} $ */
async function versionOf($) {
  try {
    return JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`)).version ?? null;
  } catch {
    return null;
  }
}

/**
 * The context cycle the mod counts in the store, as its notice names it: 1 until a compaction counts the next.
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

/** The task this session holds, with its project's name. @param {any} values */
function heldTask(values) {
  for (const project of values?.projects?.projects ?? [])
    for (const task of project.tasks) if (task.id === values.task) return { ...task, project: project.name };
  return null;
}

/**
 * Words cut to a budget at a word boundary, with an ellipsis where they were cut; a first word longer than the budget
 * is cut inside it.
 * @param {string} words
 * @param {number} budget
 */
export function cutWords(words, budget) {
  const text = words.trim().replace(/\s+/g, " ");
  if (text.length <= budget) return text;
  let kept = "";
  for (const word of text.split(" ")) {
    const next = kept ? `${kept} ${word}` : word;
    if (next.length + 1 > budget) break;
    kept = next;
  }
  // A cut never ends on a joining word or mark: "Memory &" is "Memory…".
  kept = kept
    .replace(/(?:\s+(?:&|and|or|of|for|the|a|an|to|in|on|at|by|as|with|from|into|-|–|—|,|:))+$/i, "")
    .replace(/[\s,:;–—-]+$/, "");
  return `${kept || text.slice(0, budget - 1)}…`;
}

/**
 * The status line (Setting 6): `Freeflow › <project> › <task> · A-012 · ctx 73% (cycle 3) · 7d 41%`, the project's
 * words within 16 characters and the task's within 24 (its short name when it has one), the agreement as its number;
 * `Freeflow: no task held` when this session holds none; null with no store.
 * @param {any} values
 */
export function statusText(values) {
  if (!values?.store) return null;
  if (!values.task) return "Freeflow: no task held";
  const task = heldTask(values);
  const name = cutWords(task?.short ?? task?.shortName ?? task?.title ?? values.task, TASK_BUDGET);
  const place = task?.project ? `${cutWords(task.project, PROJECT_BUDGET)} › ` : "";
  const parts = [`Freeflow › ${place}${name}`];
  if (task?.agreement) parts.push(task.agreement.id);
  if (values.usage?.context !== null && values.usage?.context !== undefined)
    parts.push(`ctx ${values.usage.context}%${values.cycle ? ` (cycle ${values.cycle})` : ""}`);
  const week = values.usage?.windows?.find((/** @type {any} */ window) => window.kind === "seven_day");
  if (week) parts.push(`7d ${Math.round(week.percent)}%`);
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
 * Serves `/freeflow pane`: opens the pane, or closes it when it is open. It asks for 50 columns docked and 24 rows
 * inline; the surface seats it (docked beside a fullscreen transcript from 110 columns, inline above the prompt below).
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
  const opened = await $.ui.open({
    id: PANE,
    title: "Freeflow",
    focus: true,
    closeOnEscape: true,
    columns: DOCK_COLUMNS,
    rows: INLINE_ROWS,
  });
  if (!opened.isPlaced) return { text: `Freeflow's pane did not open here (${opened.reason}).` };
  paneRead($);
  return { text: "Freeflow's pane opened: 1 Projects and tasks, 2 Workers, 3 Sent, 4 Settings, 5 About." };
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

/** Model and effort as a worker's row names them: "claude-opus-5-5, high" is "Opus · high". */
function modelText(/** @type {string | null | undefined} */ agent) {
  const [model, effort] = (agent ?? "").split(/,\s*/);
  const name = /\bclaude-([a-z]+)/i.exec(model ?? "")?.[1] ?? model ?? "";
  return [name ? `${name[0].toUpperCase()}${name.slice(1)}` : "", effort ?? ""].filter(Boolean).join(" · ");
}

const dollars = (/** @type {number} */ usd) => `$${usd.toFixed(2)}`;

/** A token count as a row shows it: 950, 48k, 1.2M. */
function tokensText(/** @type {number} */ count) {
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** A setting's value as the person reads it. @param {unknown} value */
const shownValue = (value) =>
  value === null || value === undefined ? "none" : value === true ? "on" : value === false ? "off" : String(value);

/** Where a setting's value comes from, in the normal view's words. @param {string} scope */
const scopeText = (scope) =>
  ({
    default: "the default",
    everywhere: "everywhere",
    folder: "this folder",
    session: "this session",
  })[scope] ?? scope;

/** The decision items waiting on the user: proposed or new. */
const waiting = (/** @type {any} */ task) =>
  (task?.decisions ?? []).filter((/** @type {any} */ item) => ["proposed", "new"].includes(item.state));

const plural = (/** @type {number} */ count, /** @type {string} */ word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The held task's delegations and their sub-workers, in one list. @param {any} values */
function allDelegations(values) {
  return (values?.delegations?.delegations ?? []).flatMap((/** @type {any} */ item) => [item, ...(item.sub ?? [])]);
}

/** The agent working on a delegation: the agent ID the mod mapped to it, and that agent as `$.agent.list()` has it. */
function agentOf(/** @type {any} */ values, /** @type {string} */ delegation) {
  const id =
    Object.entries(values?.workers ?? {}).find(([, each]) => each === delegation)?.[0] ??
    (values?.events?.agents ?? []).findLast((/** @type {any} */ each) => each.delegation === delegation)?.agent;
  if (!id) return null;
  return (values.agents ?? []).find((/** @type {any} */ agent) => agent.id === id) ?? { id, status: "gone" };
}

/** A worker's figures from the event log: minutes and tokens, where known. */
function workerFigures(/** @type {any} */ values, /** @type {string} */ delegation, /** @type {number} */ now) {
  const agent = agentOf(values, delegation);
  const logged = (values?.events?.agents ?? []).find(
    (/** @type {any} */ each) => each.delegation === delegation || (agent && each.agent === agent.id),
  );
  if (!logged) return [];
  const parts = [];
  if (logged.started) {
    const end = logged.stopped ? Date.parse(logged.stopped) : now;
    parts.push(`${Math.max(0, Math.round((end - Date.parse(logged.started)) / 60_000))} min`);
  }
  if (logged.tokens) parts.push(`${tokensText(logged.tokens)} tokens`);
  return parts;
}

/** Whether a delegation's worker is running in this session now. */
function isRunning(/** @type {any} */ values, /** @type {any} */ item) {
  if (item.returned) return false;
  const agent = agentOf(values, item.id);
  return Boolean(agent && agent.status === "running");
}

/**
 * What needs the user, in order: each worker's return to read, then the decisions waiting on the held task's
 * agreement, then any other open task's.
 * @param {any} values
 */
export function needsYou(values) {
  const items = [];
  for (const item of allDelegations(values))
    if (item.returned && !item.problem)
      items.push({ key: `needs:return:${item.id}`, text: `Read the return: ${item.id} ${item.title}`, act: "read" });
  for (const project of values?.projects?.projects ?? [])
    for (const task of project.tasks) {
      if (task.state && !["active", "paused"].includes(task.state)) continue;
      const count = waiting(task).length;
      if (!count) continue;
      const where = task.thisSession && task.agreement ? `on ${task.agreement.id}` : `in ${task.title ?? task.id}`;
      items.push({
        key: `needs:decisions:${task.id}`,
        text: `${plural(count, "decision")} waiting ${where}`,
        act: "show",
        first: task.thisSession,
      });
    }
  return [
    ...items.filter((item) => item.act === "read"),
    ...items.filter((item) => item.first),
    ...items.filter((item) => item.act === "show" && !item.first),
  ];
}

/**
 * Draws the pane: Needs you and Now fixed at the top, the tabs, then the tab's body (or what the reading view
 * shows), the field when the pane asks something, and an as-of line when a read failed. Reads `$.state` only.
 * @param {any} $
 * @param {any} e
 */
async function drawPane($, e) {
  const el = $.ui.resolve(e);
  const { value: tab = "projects" } = await $.state.get(TAB);
  const { value: data } = await $.state.get(DATA);
  const { value: selected = {} } = await $.state.get(SELECTED);
  const { value: asking = null } = await $.state.get(ASKING);
  const { value: shown = null } = await $.state.get(READING);
  const { value: reach = { open: null, chosen: {} } } = await $.state.get(REACH);
  const width = Math.max(24, e.props?.bodyColumns ?? DOCK_COLUMNS);
  const now = await $.clock.now();
  const text = (/** @type {string} */ words, /** @type {any} */ props = {}) =>
    el.Text({ ...props, children: cut(words, width) });
  const button = (
    /** @type {string} */ key,
    /** @type {string} */ words,
    /** @type {() => void} */ onPress,
    extra = {},
  ) => el.Button({ key, plain: true, onPress, ...extra, children: [cut(words, width)] });
  const keys = (/** @type {[string, string, string, () => void][]} */ buttons) =>
    el.Box({
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: 2,
      children: buttons.map(([key, hotkey, label, onPress]) => el.Button({ key, hotkey, label, plain: true, onPress })),
    });
  const rule = text("─".repeat(width), { dimColor: true });
  const ui = { el, text, button, keys, width, now };
  const values = data?.values;
  const head = [
    el.Box({
      flexDirection: "row",
      columnGap: 2,
      children: [text("Freeflow", { bold: true }), el.Text({ dimColor: true, children: "esc closes" })],
    }),
  ];
  if (!values)
    return el.Box({
      flexDirection: "column",
      children: [...head, text("Reading Freeflow's state…", { dimColor: true })],
    });
  if (!values.store)
    return el.Box({
      flexDirection: "column",
      children: [
        ...head,
        text("No Freeflow store in this session: the pane shows a store's projects and tasks.", { dimColor: true }),
      ],
    });
  // The terminal draws each hotkey before its label ("1: "), so the five fit 50 columns with one space between.
  const tabs = el.Box({
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 1,
    children: TABS.map((each) =>
      el.Button({
        key: `tab-${each.id}`,
        hotkey: each.hotkey,
        label: each.id === tab ? `[${each.label}]` : each.label,
        plain: true,
        dimColor: each.id !== tab,
        onPress: () => setTab($, each.id),
      }),
    ),
  });
  /** @type {any[]} */
  let body;
  if (shown) body = readingView($, ui, shown);
  else if (tab === "workers") body = workersView($, ui, values, selected.worker);
  else if (tab === "sent") body = sentView($, ui, values);
  else if (tab === "settings") body = settingsTab($, ui, values, reach);
  else if (tab === "about") body = aboutView($, ui, values);
  else body = projectsView($, ui, values, selected, asking, e.surface);
  const stale = data?.failed?.length
    ? [
        text(`as of ${data.asOf ? data.asOf.slice(11, 16) : "never"}; could not read ${data.failed.join(", ")}`, {
          dimColor: true,
        }),
      ]
    : [];
  return el.Box({
    flexDirection: "column",
    children: [...head, ...needsView($, ui, values), ...nowView($, ui, values), rule, tabs, rule, ...body, ...stale],
  });
}

/**
 * Needs you: each item with its action, or one line when nothing does, so Now rises.
 * @param {any} ui
 * @param {any} values
 */
function needsView($, ui, values) {
  const items = needsYou(values);
  if (!items.length) return [ui.text("Nothing needs you", { dimColor: true })];
  return [
    ui.text(`Needs you · ${items.length}`, { bold: true }),
    ...items.map((item) => {
      const label = `  [${item.act}]`;
      return ui.button(item.key, `  ${cut(item.text, ui.width - label.length - 2)}${label}`, () =>
        item.act === "read"
          ? readReturn($, item.key.slice("needs:return:".length))
          : showDecisions($, item.key.slice("needs:decisions:".length)),
      );
    }),
  ];
}

/**
 * Now: the held task, its Slice or agreement, a running worker, the context.
 * @param {any} ui
 * @param {any} values
 */
function nowView($, ui, values) {
  const task = heldTask(values);
  const context = values.usage?.context;
  const ctx =
    context === null || context === undefined
      ? null
      : `ctx ${context}%${values.cycle ? ` (cycle ${values.cycle})` : ""}`;
  if (!values.task)
    return [
      ui.text("Now · no task held", { bold: true }),
      ui.text("  Pick a task under Projects and tasks.", { dimColor: true }),
      ...(ctx ? [ui.text(`  ${ctx}`, { dimColor: true })] : []),
    ];
  const work = task?.slice ?? task?.agreement ?? null;
  const running = allDelegations(values).filter((item) => isRunning(values, item));
  const lines = [
    ui.text(`Now${work ? ` · ${work.title}` : ""}`, { bold: true }),
    ui.text(`  ${task?.title ?? values.task} · held here${task?.agreement ? ` · ${task.agreement.id}` : ""}`),
  ];
  if (running.length) {
    const first = running[0];
    const minutes = workerFigures(values, first.id, ui.now).find((part) => part.endsWith("min"));
    const more = running.length > 1 ? ` +${running.length - 1}` : "";
    // The context stays whole at the line's end; the worker's title is what is cut.
    const tail = `${minutes ? `, ${minutes}` : ""}${more}${context === null || context === undefined ? "" : ` · ctx ${context}%`}`;
    lines.push(ui.text(`${cut(`  Running: ${first.id} ${first.title}`, ui.width - tail.length)}${tail}`));
  } else if (ctx) lines.push(ui.text(`  ${ctx}`, { dimColor: true }));
  return lines;
}

/**
 * Projects and tasks: pick a project, pick a task; the picked task's action (take, release or switch); a new task.
 * @param {any} ui
 * @param {any} values
 * @param {any} selected
 * @param {any} asking
 * @param {string} surface
 */
function projectsView($, ui, values, selected, asking, surface) {
  const { el, text, button, keys, width, now } = ui;
  const projects = values.projects?.projects ?? [];
  const project = chosenProject(values, selected);
  const rows = [];
  if (projects.length)
    rows.push(
      el.Select({
        key: "project",
        label: "Project",
        value: projectValue(project?.name ?? null),
        options: projects.map((/** @type {any} */ each) => ({
          value: projectValue(each.name),
          label: each.name ?? "No project",
        })),
        onSelect: (/** @type {string} */ value) => select($, "project", value),
      }),
    );
  else rows.push(text("No projects in the store yet.", { dimColor: true }));
  const tasks = (project?.tasks ?? []).filter(
    (/** @type {any} */ task) => !task.state || ["active", "paused"].includes(task.state),
  );
  for (const task of tasks) {
    const picked = task.id === selected.task;
    const state = task.thisSession
      ? "held here"
      : task.hold
        ? `held by ${task.hold.session}`
        : task.state === "paused"
          ? "paused"
          : "free";
    const head = `${picked ? "›" : " "} ${task.thisSession ? "●" : "○"} `;
    const name = cut(task.title ?? task.id, width - head.length - state.length - 2);
    rows.push(button(`task:${task.id}`, `${head}${name}  ${state}`, () => select($, "task", task.id)));
    if (task.hold && !task.thisSession) rows.push(text(`      synced ${ago(task.lastSync, now)}`, { dimColor: true }));
    if (picked) {
      const asks = task.hold && !task.thisSession ? " (asks first)" : "";
      const action = task.thisSession
        ? ["release", "r", "release", () => releaseTask($)]
        : values.task
          ? ["switch", "s", `switch to it${asks}`, () => switchTask($, task)]
          : ["take", "t", `take${asks}`, () => takeTask($, task)];
      rows.push(el.Box({ paddingLeft: 6, children: [keys([/** @type {any} */ (action)])] }));
    }
  }
  if (project && !tasks.length)
    rows.push(text(`  No open tasks in ${project.name ?? "no project"}.`, { dimColor: true }));
  if (asking) rows.push(...askingField($, ui, asking, surface));
  else
    rows.push(keys([["new-task", "n", "new task", () => ask($, { kind: "title", project: project?.name ?? null })]]));
  return rows;
}

/** A project's name as the project picker's value: no project is "@none". */
const projectValue = (/** @type {string | null} */ name) => name ?? "@none";

/**
 * The project the picker shows: the one the user picked, else the held task's, else the first.
 * @param {any} values
 * @param {any} selected
 */
function chosenProject(values, selected) {
  const projects = values.projects?.projects ?? [];
  return (
    projects.find((/** @type {any} */ each) => projectValue(each.name) === selected.project) ??
    projects.find((/** @type {any} */ each) => each.tasks.some((/** @type {any} */ task) => task.thisSession)) ??
    projects[0] ??
    null
  );
}

/**
 * Workers: each running and returned delegation of the held task, with model, effort, minutes and tokens where known;
 * the picked one's actions; then what the session and the task have spent.
 * @param {any} ui
 * @param {any} values
 * @param {string | undefined} chosen
 */
function workersView($, ui, values, chosen) {
  const { el, text, button, keys, now } = ui;
  const rows = [];
  if (!values.task) rows.push(text("No task held: the held task's workers show here.", { dimColor: true }));
  for (const item of allDelegations(values)) {
    if (item.problem) {
      rows.push(text(`  ${item.id}: ${item.problem}`, { dimColor: true }));
      continue;
    }
    const agent = agentOf(values, item.id);
    const running = isRunning(values, item);
    const state = item.returned
      ? `returned (${item.returned})`
      : running
        ? "running"
        : agent
          ? agent.status
          : item.handle && item.handle !== "not started"
            ? item.handle
            : "no return yet";
    const picked = item.id === chosen;
    const indent = /\./.test(item.id) ? "  " : "";
    rows.push(
      button(`worker:${item.id}`, `${picked ? "›" : " "} ${indent}${item.id} ${item.title} · ${state}`, () =>
        select($, "worker", item.id),
      ),
    );
    const detail = [modelText(item.agent), ...workerFigures(values, item.id, now)].filter(Boolean).join(" · ");
    if (detail) rows.push(text(`    ${indent}${detail}`, { dimColor: true }));
    if (picked) {
      /** @type {[string, string, string, () => void][]} */
      const actions = [["brief", "b", "brief", () => readFile($, item, "brief")]];
      if (item.returned) actions.push(["return", "e", "return", () => readFile($, item, "return")]);
      if (running) actions.push(["see-now", "v", "see now", () => seeNow($, item.id)]);
      if (item.returned) actions.push(["check", "c", "check", () => checkReturn($, item.id)]);
      if (running) actions.push(["stop", "x", "stop", () => stopWorker($, item)]);
      rows.push(el.Box({ paddingLeft: 4, children: [keys(actions)] }));
    }
  }
  if (values.task && !allDelegations(values).length)
    rows.push(text("No workers on the held task.", { dimColor: true }));
  rows.push(...costLines($, ui, values));
  return rows;
}

/**
 * What this session cost and what the held task spent, by model (Setting 4: kept as information).
 * @param {any} ui
 * @param {any} values
 */
function costLines($, ui, values) {
  const { text } = ui;
  const usd = values.usage?.usd;
  const spent = values.spent;
  const parts = [];
  if (usd !== null && usd !== undefined) parts.push(`session ${dollars(usd)}`);
  if (spent) parts.push(`task ${dollars(spent.usd)} at list price`);
  if (!parts.length) return [];
  return [
    text("Cost", { bold: true }),
    text(`  ${parts.join(" · ")}`),
    ...(spent?.byModel ?? []).map((/** @type {any} */ each) =>
      text(`  ${each.name}: ${dollars(each.usd)}`, { dimColor: true }),
    ),
  ];
}

/**
 * Sent: the newest lines Freeflow sent to the model, each opening to its full text; then "show older".
 * @param {any} ui
 * @param {any} values
 */
function sentView($, ui, values) {
  const { text, button, keys } = ui;
  if (!switches.eventLog) return [text("The event log is off, so Sent is empty.", { dimColor: true })];
  const sent = values.sent;
  if (!sent) return [text("Reading what Freeflow sent…", { dimColor: true })];
  if (!sent.sent.length) return [text("Nothing sent to the model yet in this session.", { dimColor: true })];
  const rows = [text(`Sent · newest first · ${sent.sent.length} of ${sent.total}`, { dimColor: true })];
  for (const line of sent.sent)
    rows.push(
      button(`sent:${line.sha}`, `${line.ts.slice(11, 16)}  ${line.what}  ${line.first}`, () =>
        readSent($, line.sha, `${line.what} at ${line.ts.slice(11, 16)}`),
      ),
    );
  if (sent.total > sent.sent.length) rows.push(keys([["older", "o", "show older", () => showOlder($)]]));
  return rows;
}

/**
 * Settings: the normal view's rows as switches and choices, each with its `⋯` reach menu; Developer settings.
 * @param {any} ui
 * @param {any} values
 * @param {{ open: string | null, chosen: Record<string, string> }} reach
 */
function settingsTab($, ui, values, reach) {
  const { el, text, keys, width } = ui;
  const settings = values.settings;
  if (!settings) return [text("Reading the settings…", { dimColor: true })];
  const rows = [];
  for (const row of settings.rows) {
    if (row.readOnly) {
      rows.push(text(`${row.label} · read only`));
      rows.push(el.Text({ dimColor: true, wrap: "wrap", children: `  ${shownValue(row.value)}` }));
      continue;
    }
    const to = reach.chosen?.[row.key] ?? "everywhere";
    const change = (/** @type {unknown} */ value) => changeSetting($, row.key, value, to);
    const control =
      typeof row.value === "boolean"
        ? el.Button({
            key: `setting:${row.key}`,
            plain: true,
            label: `${row.label}  [${shownValue(row.value)}]`,
            onPress: () => change(!row.value),
          })
        : el.Select({
            key: `setting:${row.key}`,
            label: row.label,
            value: shownValue(row.value),
            options: row.choices.map((/** @type {any} */ choice) => ({
              value: shownValue(choice.value),
              label: choice.label,
            })),
            onSelect: (/** @type {string} */ value) =>
              change(
                row.choices.find((/** @type {any} */ choice) => shownValue(choice.value) === value)?.value ?? value,
              ),
          });
    rows.push(
      el.Box({
        flexDirection: "row",
        justifyContent: "space-between",
        width,
        children: [
          control,
          el.Button({ key: `reach:${row.key}`, plain: true, label: "⋯", onPress: () => openReach($, row.key) }),
        ],
      }),
    );
    const next = to === "everywhere" ? "" : ` · next change: ${scopeText(to)}`;
    rows.push(text(`  from ${scopeText(row.scope)}${next}`, { dimColor: true }));
    if (reach.open === row.key)
      rows.push(
        el.Select({
          key: `reach-pick:${row.key}`,
          label: "Apply to",
          value: to,
          options: REACHES.map((each) => ({ value: each.id, label: each.label })),
          onSelect: (/** @type {string} */ value) => chooseReach($, row.key, value),
        }),
      );
  }
  const all = "/freeflow settings --all";
  rows.push(keys([["developer", "d", `Developer settings › ${all}`, () => developerSettings($, all)]]));
  return rows;
}

/**
 * About: the version, what is on, the guide.
 * @param {any} ui
 * @param {any} values
 */
function aboutView($, ui, values) {
  const { el, text, keys } = ui;
  const on = [
    values.store ? "task memory" : null,
    switches.eventLog ? "event log" : null,
    switches.pane ? "pane" : null,
    switches.statusLine ? "status line" : null,
  ].filter(Boolean);
  return [
    text(`Freeflow, version ${values.version ?? "unknown"}`),
    text(`On: ${on.join(", ") || "nothing"}`),
    el.Link({ href: GUIDE_URL, label: "Guide: Freeflow's user docs" }),
    keys([["guide", "g", "read the pane's guide here", () => readGuide($)]]),
  ];
}

/**
 * The reading view: a brief, a return, a sent text, the decisions waiting or the guide, in place of the tab.
 * @param {any} ui
 * @param {{ title: string, text: string, path?: string, markdown?: boolean }} shown
 */
function readingView($, ui, shown) {
  const { el, text, keys } = ui;
  return [
    text(shown.title, { bold: true }),
    keys([["back", "q", "back", () => setReading($, null)]]),
    ...(shown.path ? [el.Link({ href: `file://${shown.path}`, label: "open the file" })] : []),
    shown.markdown
      ? el.Markdown({ key: "reading", text: shown.text })
      : el.Box({
          flexDirection: "column",
          children: shown.text.split("\n").map((line) => el.Text({ wrap: "wrap", children: line || " " })),
        }),
  ];
}

/**
 * The field the pane asks with, and a button that cancels it; where the surface has no field (mobile), a line says
 * where to type.
 * @param {any} ui
 * @param {any} asking
 * @param {string} surface
 */
function askingField($, ui, asking, surface) {
  const { el, text } = ui;
  const label = asking.kind === "title" ? "New task's title:" : `Goal of "${asking.title}":`;
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

/** @param {any} $ @param {string} tab */
async function setTab($, tab) {
  await $.state.set(READING, null);
  await $.state.set(TAB, tab);
  // Each tab's values are read while the pane is open; a tab opened reads them fresh.
  paneRead($);
}

/** @param {any} $ @param {string} what @param {string} id */
async function select($, what, id) {
  const { value = {} } = await $.state.get(SELECTED);
  await $.state.set(SELECTED, { ...value, [what]: id });
}

/** @param {any} $ @param {any} asking */
async function ask($, asking) {
  await $.state.set(ASKING, asking);
}

/** @param {any} $ @param {any} shown */
async function setReading($, shown) {
  await $.state.set(READING, shown);
}

/** The values as last read. @param {any} $ */
async function current($) {
  const { value: data } = await $.state.get(DATA);
  return data?.values ?? null;
}

/** The texts the pane put in front of the model since freeflow.mjs last took them, to keep as `sent` lines. */
let paneTexts = [];

/** Takes the texts the pane put in front of the model since the last call; freeflow.mjs logs them as `sent` lines. */
export function takePaneTexts() {
  const taken = paneTexts;
  paneTexts = [];
  return taken;
}

/**
 * Appends the row that tells the agent what the user did in the pane.
 * @param {any} $
 * @param {string} text
 */
async function tell($, text) {
  paneTexts.push(text);
  await $.session.append({ message: { type: "user", content: [{ type: "text", text }] } });
}

/**
 * Runs a Track Work command for a press. Done, one row tells the agent and a toast tells the user; failed, a toast
 * shows the error and nothing else changes (section 5). Either way the pane reads again.
 * @param {any} $
 * @param {string} what what the user did, as the row says it
 * @param {string[]} args
 * @param {(said: string) => string} [toast] what the toast says, from the command's first line
 * @returns {Promise<boolean>} whether the command ran
 */
async function act($, what, args, toast = (said) => said || "Done.") {
  let run;
  try {
    run = await trackWork($, args, PRESS_TIMEOUT_MS);
  } catch (error) {
    $.ui.toast(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
  if (run.exitCode !== 0) {
    $.ui.toast(`Freeflow: ${firstError(run)}`);
    paneRead($);
    return false;
  }
  const said = run.stdout.trim().split("\n")[0] ?? "";
  await tell($, `Freeflow: the user ${what} in Freeflow's pane (working-record.mjs ${args.join(" ")}): ${said}`);
  $.ui.toast(toast(said));
  paneRead($);
  return true;
}

/**
 * Whether the user agrees to take over a task another session holds; true when no other session holds it.
 * @param {any} $
 * @param {any} task
 */
async function takeoverAgreed($, task) {
  if (!task.hold || task.thisSession) return true;
  const question = `${task.title ?? task.id} is held by session ${task.hold.session}, last synced ${task.lastSync ?? "never"}. Take it over?`;
  const chosen = await $.ui.ask(question, ["Take it over", "Leave it"]).catch(() => null);
  return chosen === "Take it over";
}

/**
 * Take: this session takes the picked task (P46); held elsewhere, after asking.
 * @param {any} $
 * @param {any} task
 */
async function takeTask($, task) {
  const takeover = Boolean(task.hold && !task.thisSession);
  if (!(await takeoverAgreed($, task))) return;
  await act($, `took ${task.id}`, ["task", "take", "--id", task.id, ...(takeover ? ["--takeover"] : [])]);
}

/** Release: ends this session's hold on the task it holds. @param {any} $ */
async function releaseTask($) {
  const values = await current($);
  if (!values?.task) {
    $.ui.toast("Freeflow: this session holds no task.");
    return;
  }
  await act($, `released ${values.task}`, ["task", "release"]);
}

/**
 * Whether work was done under the held task since this session took it: a tool call that is not Freeflow's own, in the
 * event log, flushed and read fresh. Unknown (no log, a read that fails) counts as work, so the checkpoint is not
 * skipped.
 * @param {any} $
 */
async function workDone($) {
  try {
    await flush($);
    const run = await trackWork($, ["events", "summary", "--json"]);
    // No log (the event log off, or nothing written yet) is unknown: counted as work.
    if (run.exitCode !== 0) return true;
    const summary = JSON.parse(run.stdout);
    return summary.toolCalls - (summary.freeflow?.toolCalls ?? 0) > 0 || (summary.agents ?? []).length > 0;
  } catch {
    return true;
  }
}

/**
 * Switch: this session moves from the task it holds to the picked one (Q4). When work was done under the held task
 * the switch waits for its checkpoint, which only the agent can write: the agent is asked to checkpoint, then switch.
 * A task taken and left with nothing done switches at once.
 * @param {any} $
 * @param {any} task
 */
async function switchTask($, task) {
  const values = await current($);
  if (!values?.task) return takeTask($, task);
  const takeover = Boolean(task.hold && !task.thisSession);
  if (!(await takeoverAgreed($, task))) return;
  if (await workDone($)) {
    const text = `The user pressed switch on ${task.id} in Freeflow's pane. Checkpoint ${values.task} first, then run task switch --id ${task.id}${takeover ? " --takeover" : ""} and recover it.`;
    paneTexts.push(text);
    await $.prompt.submit({ text });
    $.ui.toast(`Freeflow: the agent checkpoints ${values.task}, then switches to ${task.id}.`);
    return;
  }
  await act($, `switched to ${task.id}`, ["task", "switch", "--id", task.id, ...(takeover ? ["--takeover"] : [])]);
}

/**
 * Opens a text in the reading view, cut to its limit.
 * @param {any} $
 * @param {string} title
 * @param {string} text
 * @param {{ path?: string, markdown?: boolean }} [more]
 */
async function show($, title, text, more = {}) {
  const shown =
    text.length > READING_LIMIT ? `${text.slice(0, READING_LIMIT)}\n\n… cut at ${READING_LIMIT} characters.` : text;
  await setReading($, { title, text: shown, ...more });
}

/**
 * Brief and Return: opens the delegation's file in the reading view, with a link to the file.
 * @param {any} $
 * @param {any} item
 * @param {"brief" | "return"} which
 */
async function readFile($, item, which) {
  const path = `${item.folder}/${which}.md`;
  const text = await $.fs.read(path).catch(() => null);
  if (text === null) {
    $.ui.toast(`Freeflow: ${item.id} has no ${which}.md yet.`);
    return;
  }
  await show($, `${item.id} ${which}`, text, { path, markdown: true });
}

/** Needs you's "read": a returned delegation's return. @param {any} $ @param {string} id */
async function readReturn($, id) {
  const item = allDelegations(await current($)).find((each) => each.id === id);
  if (item) await readFile($, item, "return");
}

/** Needs you's "show": a task's decision items waiting on the user. @param {any} $ @param {string} id */
async function showDecisions($, id) {
  const values = await current($);
  for (const project of values?.projects?.projects ?? [])
    for (const task of project.tasks)
      if (task.id === id)
        return show(
          $,
          `${task.agreement ? `${task.agreement.id} ${task.agreement.title}` : task.title}: decisions waiting`,
          waiting(task)
            .map((/** @type {any} */ item) => `${item.id} [${item.state}] ${item.text}`)
            .join("\n"),
        );
}

/** See now: the worker's own view in the main view (`$.ui.view`). @param {any} $ @param {string} id */
async function seeNow($, id) {
  const agent = agentOf(await current($), id);
  if (!agent || agent.status === "gone") {
    $.ui.toast(`Freeflow: ${id}'s worker is not running in this session.`);
    return;
  }
  const viewed = await $.ui.view({ agentId: agent.id });
  if (viewed?.deny) $.ui.toast(`Freeflow: ${viewed.deny}`);
}

/** Check: runs delegate check-return on the delegation. @param {any} $ @param {string} id */
async function checkReturn($, id) {
  const values = await current($);
  if (!values?.task) return;
  await act($, `checked ${id}'s return`, ["delegate", "check-return", "--record", values.task, "--id", id]);
}

/**
 * Stop: asks first (Q8), then stops the delegation's worker with the engine's TaskStop; one row tells the agent.
 * @param {any} $
 * @param {any} item
 */
async function stopWorker($, item) {
  const agent = agentOf(await current($), item.id);
  if (!agent || agent.status !== "running") {
    $.ui.toast(`Freeflow: ${item.id}'s worker is not running in this session.`);
    return;
  }
  const question = `Stop ${item.id} ${item.title}? Its worker ends now; what it wrote stays in its worktree.`;
  const chosen = await $.ui.ask(question, ["Stop it", "Keep it running"]).catch(() => null);
  if (chosen !== "Stop it") return;
  const stopped = await $.tool.call({ tool: "TaskStop", task_id: agent.id }).catch((/** @type {any} */ error) => ({
    deny: error instanceof Error ? error.message : String(error),
  }));
  if (stopped?.deny) {
    $.ui.toast(`Freeflow: ${item.id}'s worker did not stop: ${stopped.deny}`);
    return;
  }
  await tell($, `Freeflow: the user stopped ${item.id}'s worker (${agent.id}) from Freeflow's pane.`);
  $.ui.toast(`Stopped ${item.id}'s worker.`);
  paneRead($);
}

/** A sent line's full text. @param {any} $ @param {string} sha @param {string} title */
async function readSent($, sha, title) {
  // By the line's digest, not its place in the list: a flush between the read and the press adds lines at the front.
  const run = await trackWork($, ["events", "sent", "--sha", sha]).catch(() => null);
  if (!run || run.exitCode !== 0) {
    $.ui.toast(`Freeflow: ${run ? firstError(run) : "the sent line could not be read"}`);
    return;
  }
  await show($, title, run.stdout.trimEnd());
}

/** Show older: twenty more sent lines. @param {any} $ */
async function showOlder($) {
  const { value: shown = SENT_PAGE } = await $.state.get(SENT_SHOWN);
  await $.state.set(SENT_SHOWN, shown + SENT_PAGE);
  paneRead($);
}

/** The `⋯` menu on a settings row: open it, or close it when it is open. @param {any} $ @param {string} key */
async function openReach($, key) {
  const { value = { open: null, chosen: {} } } = await $.state.get(REACH);
  await $.state.set(REACH, { ...value, open: value.open === key ? null : key });
}

/** The reach the user chose for a row's next change. @param {any} $ @param {string} key @param {string} to */
async function chooseReach($, key, to) {
  const { value = { open: null, chosen: {} } } = await $.state.get(REACH);
  await $.state.set(REACH, { open: null, chosen: { ...value.chosen, [key]: to } });
}

/**
 * A setting changed from the pane: `/freeflow settings <key> <value>` with the reach's flag, as the mod serves the
 * command, so the mod does what the command does; the lines the command gives the model go to the agent as one row.
 * @param {any} $
 * @param {string} key
 * @param {unknown} value
 * @param {string} to
 */
async function changeSetting($, key, value, to) {
  const flag = REACH_FLAGS[to] ?? "";
  const result = await settingsCommand($, `settings ${key} ${shownValue(value)}${flag ? ` ${flag}` : ""}`);
  if (!result.context) {
    $.ui.toast(result.text);
    return;
  }
  await tell($, `${result.context.join("\n")}\n(The user changed it in Freeflow's pane.)`);
  $.ui.toast(result.text.split("\n")[0]);
  paneRead($);
}

/**
 * Developer settings: one link to `/freeflow settings --all`: it puts
 * the command in the prompt box for the user's Enter; where no box takes it, the command's listing shows in the pane.
 * @param {any} $
 * @param {string} command
 */
async function developerSettings($, command) {
  const filled = await $.prompt.fill({ text: command }).catch(() => null);
  if (filled?.isFilled) {
    $.ui.toast(`${command} is in the prompt: Enter runs it.`);
    return;
  }
  const result = await settingsCommand($, command.slice("/freeflow ".length));
  await show($, `Developer settings: ${command}`, result.text);
}

/** The pane's guide, read from the plugin's own user docs. @param {any} $ */
async function readGuide($) {
  const path = `${$.plugin.root}/plugin-docs/capabilities/pane.md`;
  const text = await $.fs.read(path).catch(() => null);
  if (text === null) {
    $.ui.toast(`Freeflow: the guide is at ${GUIDE_URL}`);
    return;
  }
  await show($, "The pane and the status line", text, { path, markdown: true });
}

/**
 * What the field's Enter does: a new task's title, then its goal, then task create in the project picked.
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
    await ask($, { kind: "goal", title: typed, project: asking.project ?? null });
    return;
  }
  await ask($, null);
  const create = [
    "task",
    "create",
    "--title",
    asking.title,
    "--goal",
    typed,
    "--cue",
    `read when ${asking.title} is in question`,
    ...(asking.project ? ["--project", asking.project] : ["--no-project"]),
    "--cwd",
    await $.session.cwd(),
  ];
  const values = await current($);
  // While this session holds a task, the new one is a switch: the held task's checkpoint first when work was done.
  if (values?.task) {
    if (await workDone($)) {
      // The agent writes the checkpoint and releases; the pane creates the task itself, so the user's title and goal
      // never pass through a command the agent types.
      await $.state.set(NEW_TASK, { create, title: asking.title, from: values.task });
      const text = `The user started a new task in Freeflow's pane. Checkpoint ${values.task} first, then run task release; the pane then creates the new task and this session takes it.`;
      paneTexts.push(text);
      await $.prompt.submit({ text });
      $.ui.toast(`Freeflow: the agent checkpoints ${values.task}; then the new task is created.`);
      return;
    }
    if (!(await act($, `released ${values.task}`, ["task", "release"]))) return;
  }
  await createTask($, asking.title, create);
}

/** Runs task create for the user's new task. @param {any} $ @param {string} title @param {string[]} create */
async function createTask($, title, create) {
  await act($, `created the task "${title}"`, create, (said) => `Created ${said}. This session holds it.`);
}

/**
 * A new task waiting on the held task's release: created once a read finds no task held; dropped when this session
 * holds another task instead.
 * @param {any} $
 * @param {string | null} task the task this session holds now
 */
async function pendingTask($, task) {
  const { value: pending = null } = await $.state.get(NEW_TASK);
  if (!pending || task === pending.from) return;
  await $.state.set(NEW_TASK, null);
  if (task) {
    $.ui.toast(`Freeflow: this session holds ${task} now, so "${pending.title}" was not created.`);
    return;
  }
  await createTask($, pending.title, pending.create);
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
