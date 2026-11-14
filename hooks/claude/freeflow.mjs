// Freeflow's Claude Code layer: a hooks module Claude Code runs on its own events (the task-004 Spec's section 11).
// It decides when Track Work's script runs and delivers what the script prints; what happens to a task's memory is
// the script's. Its task memory work runs only where the Freeflow store exists (session status says so); its event
// log and claims (SPEC-006) need none, nor do its gates (SPEC-008). Elsewhere every hook passes its event on unchanged.

import { decide, gateEvent, gateText, validGateState } from "../../skills/track-work/scripts/lib/gates5.mjs";
import { noticePoint, rowAt } from "../../skills/track-work/scripts/lib/notice5.mjs";

import { paneCommand, paneRead, registerPane, resolvePane } from "./pane.mjs";

const SCRIPT = "skills/track-work/scripts/working-record.mjs";
const SETTINGS_SCRIPT = "skills/setup-freeflow/scripts/settings.mjs";
const CAPABILITIES_SCRIPT = "skills/setup-freeflow/scripts/capabilities.mjs";
const SETTINGS_TIMEOUT_MS = 8_000; // within the 10 seconds a hook gets
const DELEGATION = /\bD-\d{3,}(?:\.\d+)?\b/; // the delegation an Agent call's prompt names (T7)
const FILE_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Glob", "Grep"]);
const STORE_REASON = "Freeflow's store, which holds the task memory the agent keeps";
const CONTINUE =
  "Freeflow compacted the session after your checkpoint: the conversation is now your task's bundle. Continue from In flight and the Next action.";

// What the mod keeps between events. A cycle runs from the session's start or a compaction to the next compaction;
// its notice is the time of its one checkpoint notice (T12), its number is counted in the store (T27), and row is the
// highest share of the window a row has shown in it (P80). Number, row and notice are kept in the store's cycle.json,
// so a module reload mid-cycle keeps them: `restored` says whether that file was read for this cycle.
/** @type {{ startedAt: number, notice: number | null, number: number | null, row: number, restored: boolean }} */
let cycle = { startedAt: Date.now(), notice: null, number: null, row: 0, restored: false };
/** @type {number | null} the window the conversation compacts against, read once a cycle */
let contextWindow = null;
/** @type {number | null} where Claude's own compaction starts in it; null with automatic compaction off */
let threshold = null;
/** @type {Map<string, { delegation: string, noticed: boolean }> | null} agent ID -> its delegation, and whether its cycle had its notice; the delegations are kept in the store's sessions/ folder too */
let workers = null;
/** @type {string | null | undefined} where the store really is; null where there is none, undefined until read */
let storeRoot = undefined;
/** @type {{ session: string, cwd: string } | null} a session that started with no store, until a turn ends with one */
let awaitingStore = null;
/**
 * Whether Freeflow is on for the session's folder (`enabled`, Session then Personal then Repository then the default),
 * resolved through the settings script at session start and after each /freeflow settings change, so no event pays for
 * a script run. Off, the mod serves /freeflow and nothing else (SPEC-005 P6). A file edited by hand counts from the next
 * session start; a script that fails leaves it as it was.
 */
let enabled = true;
/** @type {string | undefined} the Freeflow home, from session status at session start, where the claims are written */
let freeflowHome;
/** Whether a /compact this mod asked for is still queued, so a turn end does not ask for a second one. */
let compactQueued = false;
/** @type {Map<string, number>} how many of a request's /compact runs were dropped, by the request's time */
const droppedRuns = new Map();
/** Dropped runs after which the mod stops trying and says so. */
const MAX_COMPACT_TRIES = 3;
/** Turns the main loop started this session, so the prompt after a compaction goes only when no other turn did. */
let mainTurns = 0;
/** How long after its /compact the mod waits for input queued meanwhile to start a turn, before it prompts (F35). */
const CONTINUE_AFTER_MS = 2_000;

// The event log (SPEC-006): what happens in the session's loop, never contents, one line per event in schema v1. The
// mods API cannot append to a file, so the lines wait here and one `events append` run writes them at a turn's end, a
// compaction, a worker's hand-back and the session's end (T2); lines waiting when the process dies are lost. A flush
// that fails drops its lines and the next one says how many (section 5): the log is a sensor, and a sensor fails open.
const EVENT_HARNESS = "claude-code";
const EVENT_FLUSH_MS = 5_000;
const COMMAND_TOOLS = new Set(["Bash"]);
/** @type {Record<string, unknown>[]} */
let buffered = [];
/** Lines a failed flush dropped, said in the next one. */
let droppedLines = 0;
/** Whether the event log is on (`events.enabled`), resolved with `enabled`. */
let eventsOn = true;
/** Whether a person is at the prompt (`session.start`'s isInteractive): a headless run cannot wake or start a compaction. */
let interactive = true;
/** @type {string | null} this session's ID, read once */
let sessionId = null;
/** @type {Map<string, number>} each worker's turns, and the main loop's under "main" */
const turnsOf = new Map();

// The gates (SPEC-008): before each tool call, Track Work's gates5.mjs decides it from the session's gate state, which
// Track Work's lifecycle commands write to `<home>/sessions/<session>/gates.json`. The state is read once a turn and
// again after a Track Work command; each gate's mode (`gates.*`) is read with `enabled`. Under warn the call runs and
// the agent reads one row per gate per turn; under block the call is refused with the same text, and a delivery step
// is put to the person where someone can answer.
const GATE_KEYS = ["agreement", "slice", "delivery", "delegation"];
/** @type {Record<string, string>} each gate's mode: off, warn or block */
let gateModes = { agreement: "warn", slice: "warn", delivery: "warn", delegation: "warn" };
/** @type {any} the session's gate state as last read; undefined until read this turn, null where there is none */
let gateState = undefined;
/** Whether the event log has its one line saying the gate state is missing. */
let gateMissingSaid = false;
/** @type {Map<string, Set<string>>} the gates that warned in each loop's current turn, by agent ID or "main" */
const warnedGates = new Map();

// Delegation across sessions (SPEC-009): the returns a Waits on row already named, whether a return wakes the idle
// session (`delegation.wakeOnReturn`), and the window that folds several returns into one prompt.
/** @type {Set<string>} */
const seenReturns = new Set();
let wakeOnReturn = true;
const WAIT_BATCH_MS = 60_000;
/** How often an idle session whose Slice waits on a delegation looks for its return (Pi's WaitWatch, once a minute). */
const WAIT_POLL_MS = 60_000;
/** The idle watch now running; a later turn end or watch replaces it. */
let idleWatch = 0;
/** The Waits on rows found in the batching window now open, which go out together when it closes (SPEC-009 4.4). */
let pendingWaits = [];

/**
 * Keeps one event line for the next flush, while Freeflow and its event log are on.
 * @param {any} $
 * @param {string} kind
 * @param {Record<string, unknown>} fields
 * @param {string} [agent]
 */
async function emit($, kind, fields, agent = "main") {
  if (!enabled || !eventsOn) return;
  sessionId ??= await $.session.id();
  const line = { v: 1, ts: new Date(await $.clock.now()).toISOString(), session: sessionId, harness: EVENT_HARNESS };
  buffered.push({
    ...line,
    agent,
    kind,
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
  });
}

/**
 * Writes the waiting lines with one script run; never fails the hook it runs in.
 * @param {any} $
 * @param {{ session?: string, timeoutMs?: number }} [options]
 */
async function flush($, options = {}) {
  if (!buffered.length) return;
  const lines = buffered;
  buffered = [];
  const { v, ts, session, harness } = lines[0];
  const note = droppedLines
    ? [{ v, ts, session, harness, agent: "main", kind: "freeflow", what: "dropped", dropped: droppedLines }]
    : [];
  try {
    const run = await script($, ["events", "append", "--input", "-"], {
      session: options.session,
      stdin: [...note, ...lines].map((line) => JSON.stringify(line)).join("\n"),
      timeoutMs: options.timeoutMs ?? EVENT_FLUSH_MS,
    });
    if (run.exitCode !== 0) throw new Error(run.stderr.replace(/^Error: /, "").trim() || `exit code ${run.exitCode}`);
    droppedLines = 0;
  } catch (error) {
    droppedLines += lines.length;
    $.ui.log(
      `Freeflow: ${lines.length} event line(s) not written: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * The paths a file tool's call names, relative to the session's folder when inside it.
 * @param {Record<string, unknown>} input
 * @param {string} cwd
 */
function toolPaths(input, cwd) {
  const named = [input.file_path, input.notebook_path, input.path].filter(
    (path) => typeof path === "string" && path !== "",
  );
  const base = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return named.map((path) => (String(path).startsWith(base) ? String(path).slice(base.length) : String(path)));
}

/**
 * The requests this driver claims (section 4.5): yes for what it carries out today, possible for what Claude Code
 * offers and Freeflow does not use yet, no for what the mods API cannot carry. A headless run (`-p`) wakes nothing and
 * starts no compaction, so its claims say so; with the event log off, so does sensors.
 */
function claims() {
  const claim = (/** @type {string} */ value, /** @type {string} */ how) => ({ claim: value, how });
  return {
    pin: claim("yes", "its guidance is a section of the system prompt (prompt.compose)"),
    inject: claim("yes", "appends rows the agent reads ($.session.append)"),
    forget: claim("no", "nothing removes a stored row"),
    compact: interactive
      ? claim("yes", "its own compaction after a checkpoint, the bundle in place of the summary")
      : claim("yes", "on the next compaction; it cannot start one in a headless run"),
    checkpoint: claim("yes", "through Track Work's script"),
    rewind: claim("no", "no rewind in the mods API"),
    route: claim("possible", "turn.step can change model and effort; Freeflow does not yet"),
    spawn: claim("possible", "$.agent.spawn exists; Freeflow does not start workers itself"),
    send: claim("yes", "messages to its workers ($.session.send)"),
    wake: interactive
      ? claim("yes", "a prompt after its compaction ($.prompt.submit)")
      : claim("no", "nothing runs between turns in a headless run"),
    ask: claim("possible", "$.ui.ask exists; Freeflow does not ask through it yet"),
    block: claim(
      "yes",
      "tool.check refuses a gate's call under block, or asks the person for a delivery step (gates.*)",
    ),
    sensors: eventsOn
      ? claim("yes", "turns, model requests, tool calls, compactions, workers, written to the event log")
      : claim("possible", "the event log is off (events.enabled)"),
    timers: claim("yes", "$.clock.after"),
  };
}

/**
 * Writes this session's claims to `<home>/sessions/<session>/capabilities.json` (T4), which capabilities.mjs and
 * Track Work's checkpoint --compact read; with Freeflow off, every request is no.
 * @param {any} $
 * @param {string | undefined} home the Freeflow home, from session status
 */
async function writeCapabilities($, home) {
  if (!home) return;
  sessionId ??= await $.session.id();
  const version = await $.fs
    .read(`${$.plugin.root}/plugin.json`)
    .then((/** @type {string} */ text) => JSON.parse(text).version ?? null)
    .catch(() => null);
  const all = claims();
  const off = Object.fromEntries(
    Object.keys(all).map((request) => [request, { claim: "no", how: "Freeflow is off in this session (enabled)" }]),
  );
  const file = {
    v: 1,
    requestSet: 1,
    driver: "claude-code-mod",
    freeflow: version,
    mode: interactive ? "interactive" : "headless",
    enabled,
    events: enabled && eventsOn,
    claims: enabled ? all : off,
  };
  await $.fs.write(`${home}/sessions/${sessionId}/capabilities.json`, `${JSON.stringify(file, null, 2)}\n`);
  await emit($, "freeflow", { what: "capabilities", detail: file.mode });
}

/**
 * Runs Track Work's script for this session (or the one ending), as its commands run in the session's shell.
 * @param {any} $
 * @param {string[]} args
 * @param {{ session?: string, stdin?: string, timeoutMs?: number }} [options]
 */
async function script($, args, { session, stdin, timeoutMs = 60_000 } = {}) {
  const id = session ?? (await $.session.id());
  return $.process.run(["node", `${$.plugin.root}/${SCRIPT}`, ...args], {
    env: { CLAUDE_CODE_SESSION_ID: id },
    ...(stdin === undefined ? {} : { stdin }),
    timeoutMs,
  });
}

/**
 * This session's state in the store, or null where there is no store or it cannot be read.
 * @param {any} $
 * @param {{ session?: string, timeoutMs?: number }} [options]
 */
async function status($, options) {
  const state = await sessionStatus($, options);
  return state?.store ? state : null;
}

/**
 * Session status as the script prints it, a store or not, or null where it cannot be read.
 * @param {any} $
 * @param {{ session?: string, timeoutMs?: number }} [options]
 */
async function sessionStatus($, options) {
  const run = await script($, ["session", "status"], options);
  if (run.exitCode !== 0) return null;
  try {
    return JSON.parse(run.stdout);
  } catch {
    return null;
  }
}

/**
 * What keeps the session from a working store, for the agent to relay or fix (P94); empty when nothing does.
 * @param {any} state session status
 */
const missingText = (state) =>
  (state?.missing ?? []).map(
    (/** @type {{ what: string, fix: string, by: string }} */ part) =>
      `- Missing: ${part.what}. Fix (${part.by === "user" ? "the user" : "the agent"}): ${part.fix}.`,
  );

/** @param {string} path */
const separatorOf = (path) => (path.includes("\\") && !path.includes("/") ? "\\" : "/");

/**
 * Where the store really is, from session status the first time; null where there is none.
 * @param {any} $
 * @param {any} [state] session status, when the caller has it
 */
async function storeRootOf($, state) {
  if (state !== undefined || storeRoot === undefined) {
    const known = state === undefined ? await status($) : state;
    storeRoot = known
      ? ((await $.fs.stat(known.home, { resolve: true }).catch(() => undefined))?.realPath ?? null)
      : null;
  }
  return storeRoot;
}

/**
 * Where a tool's path really lands, or undefined: an absolute path's own real path, or for one not there yet (a Write
 * makes the folders it needs) its nearest existing folder's real path plus the names below it. A spelling it cannot
 * place lands nowhere: a relative path, or a "." or ".." among the names not there yet.
 * @param {any} $
 * @param {unknown} path
 */
async function placed($, path) {
  if (typeof path !== "string" || !/^(\/|[A-Za-z]:[\\/])/.test(path)) return undefined;
  const missing = [];
  let at = path;
  for (;;) {
    const stat = await $.fs.stat(at, { resolve: true }).catch(() => undefined);
    if (stat?.realPath) {
      const root = stat.realPath.replace(/[\\/]$/, "");
      return missing.length ? [root, ...missing.reverse()].join(separatorOf(stat.realPath)) : stat.realPath;
    }
    const cut = Math.max(at.lastIndexOf("/"), at.lastIndexOf("\\"));
    const name = at.slice(cut + 1);
    if (cut <= 0 || name === "" || name === "." || name === "..") return undefined;
    missing.push(name);
    at = at.slice(0, cut);
  }
}

/**
 * Reads the window the conversation compacts against, from the session itself: the model's, or the smaller one
 * Claude's compaction is set to (CLAUDE_CODE_AUTO_COMPACT_WINDOW); and where Claude's own compaction starts in it.
 * The window is the session's for the scripts too (T11).
 * @param {any} $
 */
async function readWindow($) {
  const { context } = await $.session.usage({ breakdown: "summary" });
  const size = context.breakdown?.rawMaxTokens || context.window;
  threshold = context.breakdown?.autoCompactThreshold ?? null;
  if (size && size !== contextWindow) await $.env.set("FREEFLOW_CONTEXT_WINDOW", String(size));
  // The notice point the scripts' planner and estimate use, beside the window (notice5.mjs).
  if (size) await $.env.set("FREEFLOW_NOTICE_POINT", String(pointOf(size)));
  contextWindow = size || null;
}

/** A new cycle: no notice or row yet, and the window read again; its number as given, null to read it from the store. */
async function newCycle($, number = cycle.number) {
  cycle = { startedAt: await $.clock.now(), notice: null, number, row: 0, restored: false };
  contextWindow = null;
}

/** Where the store counts this session's cycles, and what each cycle has shown: a resumed session keeps both. */
const cyclePath = (state) => `${state.home}/sessions/${state.session}/cycle.json`;

/** The cycle's number, its highest row and its notice's time, as the store keeps them (cycle.json), for a reload. */
async function keepCycle($, state) {
  await $.fs.write(
    cyclePath(state),
    `${JSON.stringify({ cycle: cycle.number, row: cycle.row, notice: cycle.notice })}\n`,
  );
}

/**
 * What this cycle showed before a reload, read from the store the first time the module asks it in the cycle: the
 * highest row and the notice, when the file's cycle is this one (P80, T12). A module that loads with no state left this
 * cycle's rows to be shown again; the store's copy says what was.
 */
async function restoreCycle($, state) {
  cycle.restored = true;
  if (!state) return;
  const number = await cycleNumber($, state);
  let kept = null;
  try {
    kept = JSON.parse(await $.fs.read(cyclePath(state)));
  } catch {
    // none kept, or unreadable: this cycle shows what it has not shown
  }
  if (!kept || Number(kept.cycle) !== number) return;
  cycle.row = Math.max(cycle.row, Number(kept.row) || 0);
  cycle.notice ??= typeof kept.notice === "number" ? kept.notice : null;
}

/** This cycle's number, read from the store the first time. */
async function cycleNumber($, state) {
  if (cycle.number === null) {
    const kept = await $.fs.read(cyclePath(state)).catch(() => "null");
    let number = 1;
    try {
      number = Number(JSON.parse(kept).cycle) || 1;
    } catch {
      // none kept yet, or unreadable: the count starts again at 1
    }
    cycle.number ??= number;
  }
  return cycle.number;
}

/** A compaction of the main conversation: the next cycle, its number counted in the store where there is one. */
async function nextCycle($, state) {
  const number = state ? (await cycleNumber($, state)) + 1 : null;
  await newCycle($, number);
  if (state) await keepCycle($, state);
}

/**
 * Where the notice comes, in tokens: a lead before Claude's own threshold, under a ceiling, or 75% of the window where
 * Claude's threshold is not known (notice5.mjs, the one formula every driver shares).
 * @param {number} size
 */
const pointOf = (size) => noticePoint({ window: size, hostPoint: threshold });

/** What a safe point is: where stopping loses nothing that is not written down (Pi's "compaction is due soon"). */
const SAFE_POINT =
  "a finished step whose result you know (a check run and read, a set of edits complete, a report written), not mid-edit or with a command still running";

const share = (context) =>
  `${Math.round((100 * context.tokens) / context.window)}% of its window (${context.tokens} of ${context.window} tokens)`;

function noticeText($, context, state, number) {
  const command = `node ${$.plugin.root}/${SCRIPT}`;
  const limit = threshold ? `; Claude Code compacts on its own at about ${Math.round(threshold)} tokens` : "";
  const checkpoint = state.delegation
    ? `This session is the worker for ${state.delegation.id} of ${state.delegation.task}: at that point, rewrite its progress.md with ${command} checkpoint --delegation ${state.delegation.id} --record ${state.delegation.task} --compact --input - (## Done, ## Half done, ## Didn't work, ## Next).`
    : state.task
      ? `At that point, checkpoint ${state.task.id}: bring ${state.task.id}'s Current Context up to date, adjust the rest of Current Work and Future Work, save as blocks any discussion in this cycle that shaped the work and is not saved yet (discussion list, discussion save; skip it when there was none), then run ${command} checkpoint --record ${state.task.id} --compact --input - with In flight's lines.`
      : `This session holds no task: at that point, write its summary with ${command} checkpoint --session --compact --input - (Goal, Settled, Open, Agreement, In flight, Recovery, Next action).`;
  return `Freeflow, context cycle ${number}: the context is at ${share(context)}${limit}. Keep working until a safe point: ${SAFE_POINT}. If your work ends within a step or two, finish it first. ${checkpoint} Then end your turn: on that request, Freeflow compacts the session with the record in place of the conversation, and starts the next turn where it can. This is the only notice this context cycle; if Claude Code compacts before the checkpoint, the record as of its last checkpoint follows Claude's summary.`;
}

/**
 * @param {any} $
 * @param {string} text
 */
async function appendRow($, text) {
  await $.session.append({ message: { type: "user", content: [{ type: "text", text }] } });
}

/** After each request of the main conversation: below the notice point, a row at the highest of ROWS_AT the context
 * has crossed, once each a cycle (P80, T28); at it, the cycle's one checkpoint notice, appended so a long turn has it
 * (P50, T13). Appending leaves what the model already received, and the prompt cache, as it was. */
async function watchMain($) {
  if (cycle.notice !== null) return;
  const current = cycle;
  const { tokens } = (await $.session.usage()).context;
  if (!tokens) return;
  if (contextWindow === null) await readWindow($);
  if (!contextWindow) return;
  const point = pointOf(contextWindow);
  const context = { tokens, window: contextWindow };
  if (tokens < point) {
    const row = rowAt(tokens, contextWindow, point);
    if (!row || (cycle.restored && row <= cycle.row)) return;
    // The store is asked once a mark is crossed, and this cycle's copy in it is read the first time: a reloaded module
    // then shows no row it showed before the reload (P80).
    const state = await status($);
    if (cycle !== current) return;
    if (!cycle.restored) await restoreCycle($, state);
    if (cycle.notice !== null || row <= cycle.row) return;
    // Set before a session with no store returns, so it asks the store once a mark, not on every request.
    cycle.row = row;
    if (!state) return;
    await keepCycle($, state);
    const number = await cycleNumber($, state);
    await appendRow(
      $,
      `Freeflow, context cycle ${number}: the context is at ${share(context)}; the checkpoint notice comes at about ${Math.round(point)} tokens.`,
    );
    await emit($, "freeflow", {
      what: "row",
      detail: `cycle ${number}, ${Math.round(row * 100)}%`,
      context: tokens,
      point: Math.round(point),
    });
    return;
  }
  const state = await status($);
  // A compaction that came meanwhile started a new cycle, which this request's figures no longer describe; a notice
  // another request made meanwhile, or the cycle's copy in the store says was made before a reload, is the cycle's one.
  if (cycle !== current) return;
  if (!cycle.restored) await restoreCycle($, state);
  if (cycle.notice !== null || !state) return;
  cycle.notice = await $.clock.now();
  await keepCycle($, state);
  const number = await cycleNumber($, state);
  await appendRow($, noticeText($, context, state, number));
  await emit($, "freeflow", { what: "notice", detail: `cycle ${number}`, context: tokens, point: Math.round(point) });
}

/** The workers this session started, by agent ID: read once from the store's sessions/ folder after a reload. */
async function workerMap($, state) {
  if (workers) return workers;
  workers = new Map();
  const path = state && `${state.home}/sessions/${state.session}/delegations.json`;
  if (path && (await $.fs.exists(path))) {
    for (const [agentId, delegation] of Object.entries(JSON.parse(await $.fs.read(path))))
      workers.set(agentId, { delegation, noticed: false });
  }
  return workers;
}

/** After each request of a worker: once a cycle, near the threshold, in the session's window, a message to rewrite its
 * progress.md at a safe point (T7). Its context is its request's usage. */
async function noticeWorker($, step, response) {
  const worker = (await workerMap($, null)).get(step.agentId);
  if (!worker || worker.noticed || !response.usage) return;
  const { input_tokens, cache_read_input_tokens, cache_creation_input_tokens } = response.usage;
  const tokens = input_tokens + (cache_read_input_tokens ?? 0) + (cache_creation_input_tokens ?? 0);
  if (contextWindow === null) await readWindow($);
  const size = contextWindow;
  if (!size || tokens < pointOf(size)) return;
  worker.noticed = true;
  await logDelegation(
    $,
    worker.delegation,
    "inform",
    `context at ${Math.round((100 * tokens) / size)}%: told to rewrite progress.md`,
    step.agentId,
  );
  await $.session.send({
    to: { agentId: step.agentId },
    text: `Freeflow: your context is at ${Math.round((100 * tokens) / size)}% of its window and compaction is near. At your next safe point, rewrite ${worker.delegation}'s progress.md (Done, Half done, Didn't work, Next), so a compaction loses nothing, then go on.`,
  });
}

/** Whether the checkpoint this cycle asked for is done: the record's State as of, or the summary's time, is later
 * than the cycle's last notice, or than its start when no notice came (T12, P68). */
function checkpointDone(state) {
  const asOf = state.task
    ? state.task.stateAsOf
    : state.delegation
      ? state.delegation.progressAsOf
      : state.summary?.asOf;
  return Boolean(asOf) && Date.parse(asOf) > (cycle.notice ?? cycle.startedAt);
}

/** @param {string} text */
const ownMessages = (text) => ({
  messages: [
    { role: /** @type {const} */ ("user"), text, toolUses: [] },
    { role: /** @type {const} */ ("assistant"), text: "Recovered from Freeflow's bundle.", toolUses: [] },
  ],
});

/**
 * Claude's compaction with one message added after its summary: the bundle, or what stands in for it.
 * @param {any} compacted
 * @param {string} text
 */
const withMessage = (compacted, text) =>
  compacted.skip
    ? compacted
    : {
        ...compacted,
        messages: [...compacted.messages, { role: /** @type {const} */ ("user"), text, toolUses: [] }],
      };

/**
 * What stands in for a bundle the script could not make (a record left invalid mid-edit, say): the error, and where
 * the next cycle recovers once it is mended.
 * @param {any} $
 * @param {any} state
 * @param {{ stderr: string }} made
 */
function unmade($, state, made) {
  const [error] = made.stderr
    .replace(/^Error: /, "")
    .trim()
    .split("\n");
  return state.task
    ? `Freeflow could not make ${state.task.id}'s bundle: ${error.replace(/\.$/, "")}. Its record, last checkpointed at ${state.task.stateAsOf}, is ${state.task.record}: mend what the error names, then run node ${$.plugin.root}/${SCRIPT} view recover --record ${state.task.id} and read what it lists.`
    : `Freeflow could not make this session's bundle: ${error.replace(/\.$/, "")}. Its summary is ${state.summary.path}: read it.`;
}

/** Freeflow's compaction (P63, T14): the bundle as the whole conversation, with no summarizer request. */
async function ownCompaction($, e, next, state) {
  const made = await script($, bundleArgs(state));
  if (made.exitCode !== 0) return withMessage(await next(e), unmade($, state, made));
  // The bundle replaces the conversation: a checkpoint --compact waiting for this is answered, whoever compacted.
  if (state.compact && !state.compact.done) await answered($, state.compact);
  if (!state.task && !state.delegation)
    await $.process.run([
      "node",
      "-e",
      "require('node:fs').rmSync(process.argv[1], { force: true })",
      state.summary.path,
    ]);
  return ownMessages(made.stdout);
}

/**
 * The bundle Freeflow's compaction installs: the held task's, a worker session's (SPEC-009 4.1), or the summary's.
 * @param {any} state
 */
function bundleArgs(state) {
  if (state.task) return ["view", "bundle", "--record", state.task.record];
  if (state.delegation)
    return ["view", "bundle", "--record", state.delegation.record, "--delegation", state.delegation.id];
  return ["view", "bundle", "--session"];
}

/** A worker session's compaction before its progress checkpoint: Claude's, told whose worker it is, then its bundle. */
async function workerSessionCompaction($, e, next, state) {
  const { id, task } = state.delegation;
  const note = `Freeflow: this session is the worker for ${id} of ${task}; its progress.md holds the work up to ${state.delegation.progressAsOf ?? "its last checkpoint --delegation"}. Say so in the summary, and keep what happened after that.`;
  const compacted = await next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${note}` : note });
  if (compacted.skip) return compacted;
  const made = await script($, bundleArgs(state));
  return withMessage(
    compacted,
    made.exitCode === 0
      ? made.stdout
      : `Freeflow could not make ${id}'s bundle: ${made.stderr.replace(/^Error: /, "").trim()}. Recover with node ${$.plugin.root}/${SCRIPT} view recover --record ${task} --delegation ${id}.`,
  );
}

/**
 * One line in the held task's delegation log (SPEC-009 4.2) for what the mod did to a subagent worker: its notice
 * (inform) or the block of its stop (blocked), through `delegate log --append`; a log that cannot be written is let go.
 * @param {any} $
 * @param {string} delegation
 * @param {"inform" | "blocked"} kind
 * @param {string} body
 * @param {string | undefined} agentId
 * @param {any} [known] session status, when the caller has it
 */
async function logDelegation($, delegation, kind, body, agentId, known) {
  try {
    const state = known ?? (await status($));
    if (!state?.task) return;
    await script($, [
      "delegate",
      "log",
      "--record",
      state.task.record,
      "--id",
      delegation,
      "--append",
      "--kind",
      kind,
      "--body",
      body,
      ...(agentId ? ["--agent", agentId] : []),
    ]);
  } catch (error) {
    $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The Waits on row (SPEC-009 4.4): when a delegation the current Slice waits on has come back, one row at the turn
 * boundary, and, where nobody is at work and the session can be woken, the row as the next prompt. Each return gives
 * one row once.
 * @param {any} $
 * @param {any} state session status
 * @param {{ wake: boolean }} options
 */
async function waitsReturned($, state, { wake }) {
  const back = (state?.waits?.delegations ?? []).filter(
    (/** @type {any} */ each) => each.returned && !seenReturns.has(`${each.id} ${each.returned} ${each.at}`),
  );
  if (!back.length) return;
  for (const each of back) seenReturns.add(`${each.id} ${each.returned} ${each.at}`);
  const row = back
    .map(
      (/** @type {any} */ each) =>
        `${each.id} returned (${each.returned}). ${state.waits.slice} waits on it: check it and close it.`,
    )
    .join(" ");
  await emit($, "freeflow", { what: "waits", detail: back.map((/** @type {any} */ each) => each.id).join(", ") });
  if (wake && interactive && wakeOnReturn) {
    // Returns found while a window is open join it, so several returns within a minute come as one row.
    pendingWaits.push(row);
    if (pendingWaits.length > 1) return;
    const turns = mainTurns;
    // A message that woke the session meanwhile starts its turn first, and the row goes into that turn instead.
    $.clock.after(WAIT_BATCH_MS, async () => {
      const text = `Freeflow: ${pendingWaits.join(" ")}`;
      pendingWaits = [];
      if (mainTurns === turns) await $.prompt.submit({ text });
      else await appendRow($, text);
    });
  } else await appendRow($, `Freeflow: ${row}`);
}

/**
 * While the session sits idle and its Slice waits on a delegation that has not come back, it looks once a minute, so a
 * return logged with no turn ending still wakes it (SPEC-009 4.4). It stops at a turn's start, when nothing is left to
 * wait on, or where the session cannot be woken.
 * @param {any} $
 * @param {any} state session status
 */
function watchWaits($, state) {
  const watch = ++idleWatch;
  const pending = (state?.waits?.delegations ?? []).some((/** @type {any} */ each) => !each.returned);
  if (!pending || !interactive || !wakeOnReturn) return;
  const turns = mainTurns;
  $.clock.after(WAIT_POLL_MS, async () => {
    if (watch !== idleWatch || mainTurns !== turns) return;
    const now = await status($);
    await waitsReturned($, now, { wake: true });
    if (watch === idleWatch && mainTurns === turns) watchWaits($, now);
  });
}

/** A compaction before the checkpoint (P16): Claude's, told what the record holds, then the bundle as of the last
 * checkpoint with the user's messages since and the transcript's path, as one message after its summary (T14). */
async function fallbackCompaction($, e, next, state) {
  const note = `Freeflow: the task's Working Record (${state.task.id}) holds the work up to its last checkpoint, ${state.task.stateAsOf}; keep in the summary what happened after that.`;
  const compacted = await next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${note}` : note });
  if (compacted.skip) return compacted;
  const made = await script($, ["view", "bundle", "--record", state.task.record, "--fallback"]);
  return withMessage(compacted, made.exitCode === 0 ? made.stdout : unmade($, state, made));
}

/** A worker's compaction: its summary names its delegation and how it recovers. */
async function workerCompaction($, e, next) {
  const state = await status($);
  const worker = (await workerMap($, state)).get(e.agentId);
  if (!state?.task || !worker) return next(e);
  // Its compaction starts the worker's next cycle, with a notice of its own.
  worker.noticed = false;
  const note = `Freeflow: this agent is the worker for delegation ${worker.delegation}. Say so in the summary, and that after the compaction it recovers with node ${$.plugin.root}/${SCRIPT} view recover --record ${state.task.id} --delegation ${worker.delegation}, then continues from its progress.md.`;
  return next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${note}` : note });
}

/**
 * Marks a checkpoint --compact request answered, once the bundle has replaced the conversation.
 * @param {any} $
 * @param {any} request
 */
async function answered($, request) {
  await $.fs.write(request.path, JSON.stringify({ ...request, path: undefined, done: true }, null, 2));
}

/**
 * After a turn that ended with checkpoint --compact: compact between turns, then a prompt to go on (P51, P102).
 * @param {any} $
 * @param {any} request
 */
async function compactAndContinue($, request) {
  let dropped = null;
  try {
    // /compact, run as the person would: a plugin's own $.session.compact() passes none of its own hooks, so the
    // engine's summary would stand in for the bundle. The engine runs it once the session is idle, and drops it
    // past a Stop, as when queued input starts the next turn first and that turn is interrupted.
    const { text } = await $.command.run({ command: "compact" });
    if (/^Not compacted/.test(text ?? "")) dropped = (text ?? "").split("\n")[0];
    else {
      await emit($, "freeflow", { what: "compact", detail: "ran /compact after the checkpoint" });
      await newCycle($);
      // Input queued meanwhile, a notification or the person's own prompt, starts its turn first, and that turn goes
      // on from the bundle; a prompt submitted now would wait behind it and arrive out of date (F35).
      const turns = mainTurns;
      $.clock.after(CONTINUE_AFTER_MS, async () => {
        if (mainTurns === turns) await $.prompt.submit({ text: CONTINUE });
      });
    }
  } catch (error) {
    dropped = error instanceof Error ? error.message : String(error);
    $.ui.log(`Freeflow: ${dropped}`);
  } finally {
    compactQueued = false;
  }
  if (dropped === null) return;
  // The request stays waiting, and the next turn end tries again; the agent and the user see that it did not run.
  const tries = (droppedRuns.get(request.requestedAt) ?? 0) + 1;
  droppedRuns.set(request.requestedAt, tries);
  if (tries < MAX_COMPACT_TRIES) {
    await appendRow(
      $,
      `Freeflow: the compaction your checkpoint asked for did not run (${dropped}); it tries again when the next turn ends.`,
    );
    return;
  }
  await answered($, request);
  await appendRow(
    $,
    `Freeflow: the compaction your checkpoint asked for did not run (${dropped}), ${tries} times; it stops trying. Checkpoint with --compact again, or run /compact.`,
  );
}

/**
 * What a session does once it has a store: the transcript for the script, a pull, and the menu, which also remembers
 * where a task's repositories are and takes back the task this session held when it ended (F36).
 * @param {any} $
 * @param {any} state session status, with a store
 * @param {string} session
 * @param {string} cwd the session's folder
 */
async function storeArrived($, state, session, cwd) {
  // The session's transcript, which Track Work's script reads to measure what a Slice uses (Spec section 12).
  if (state.transcript) await $.env.set("FREEFLOW_TRANSCRIPT", state.transcript);
  await script($, ["store", "sync", "--pull"], { session });
  // The session's folder, its siblings and Freeflow's own checkout, where a task's repositories may be (P96).
  const parent = cwd.slice(0, cwd.lastIndexOf(separatorOf(cwd))) || cwd;
  const scan = [cwd, parent, $.plugin.root].join(separatorOf(cwd) === "\\" ? ";" : ":");
  // The menu, then the rules every task follows, so a session has them before it takes a task (Spec section 4).
  return script($, ["task", "here", "--cwd", cwd, "--scan", scan, "--rules", "--take-back"], { session });
}

async function turnEnded($, e) {
  const state = await status($);
  if (!state) return;
  if (awaitingStore) {
    // A store attached after the session started, as a repository added to a running cloud session is: what session
    // start does with a store, done now, so its transcript, sync, repositories and permission are not lost.
    const { session, cwd } = awaitingStore;
    awaitingStore = null;
    await storeRootOf($, state);
    const menu = await storeArrived($, state, session, cwd);
    // The menu has no place to go now, but a task taken back does: the agent learns it holds the task (F36).
    const tookBack = menu.exitCode === 0 ? /^Took .+ back: .+$/m.exec(menu.stdout)?.[0] : undefined;
    if (tookBack) await appendRow($, `Freeflow: ${tookBack}`);
  }
  if (state.changed) {
    await script($, ["store", "sync"]);
    await emit($, "freeflow", { what: "sync" });
  }
  await waitsReturned($, state, { wake: e.reason === "answer" });
  if (e.reason === "answer") watchWaits($, state);
  // The cost governor's task cap follows the held task's plan.
  await governorTask($, state);
  // Only the agent's own request compacts (P102): checkpoint --compact, after a turn that ended, until the bundle
  // replaces the conversation; one /compact queued at a time.
  const request = state.compact;
  if (e.reason !== "answer" || !request || request.done || compactQueued || !checkpointDone(state)) return;
  compactQueued = true;
  $.clock.after(0, () => compactAndContinue($, request));
}

/**
 * Runs the settings script on the session's folder, as the session's own shell would.
 * @param {any} $
 * @param {string[]} args
 * @returns {Promise<{ ok: true, data: any } | { ok: false, error: string }>}
 */
async function settings($, args) {
  try {
    const run = await $.process.run(
      ["node", `${$.plugin.root}/${SETTINGS_SCRIPT}`, ...args, "--root", await $.session.cwd(), "--json"],
      { env: { CLAUDE_CODE_SESSION_ID: await $.session.id() }, timeoutMs: SETTINGS_TIMEOUT_MS },
    );
    if (run.exitCode !== 0)
      return { ok: false, error: (run.stderr.split("\n")[0] || `exit code ${run.exitCode}`).trim() };
    return { ok: true, data: JSON.parse(run.stdout) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The settings listing the last resolveEnabled read, which the pane's switches reuse at session start. */
let lastListed;

/**
 * The gates a settings listing ignores: those its `gates.<gate>` or `gates` entries name, and every gate when a whole
 * file is ignored, since that file's gate values are then unknown (D-045).
 * @param {{ key: string | null }[]} ignored the listing's ignored entries
 * @returns {Set<string>}
 */
function ignoredGates(ignored) {
  const gates = new Set();
  for (const item of ignored) {
    if (item.key === null || item.key === "gates") for (const gate of GATE_KEYS) gates.add(gate);
    else {
      const gate = /^gates\.(\w+)$/.exec(item.key)?.[1];
      if (gate) gates.add(gate);
    }
  }
  return gates;
}

/**
 * Reads `enabled` for the session's folder again; it stays as it was when the script fails or a file is invalid.
 * @param {any} $
 */
async function resolveEnabled($) {
  const result = await settings($, ["get", "enabled"]);
  if (result.ok && typeof result.data.value === "boolean") enabled = result.data.value;
  const events = await settings($, ["get", "events.enabled"]);
  if (events.ok && typeof events.data.value === "boolean") eventsOn = events.data.value;
  const listed = await settings($, ["list"]);
  lastListed = listed;
  await resolveGovernor($, listed);
  if (listed.ok) {
    // A gate whose value or file the listing ignores keeps the mode this process last read for it: the default would
    // weaken a block a config problem did not cause (D-045, review 1 B1).
    const ignored = ignoredGates(listed.data.ignored ?? []);
    for (const row of listed.data.settings ?? []) {
      if (row.key === "delegation.wakeOnReturn" && typeof row.value === "boolean") wakeOnReturn = row.value;
      if (row.key === "delegation.claimHours" && row.value != null)
        await $.env.set("FREEFLOW_CLAIM_HOURS", String(row.value));
      const gate = /^gates\.(\w+)$/.exec(row.key)?.[1];
      if (gate && GATE_KEYS.includes(gate) && !ignored.has(gate) && ["off", "warn", "block"].includes(row.value))
        gateModes = { ...gateModes, [gate]: row.value };
    }
  }
}

/**
 * The session's gate state, read at most once a turn and after a Track Work command (SPEC-008 4.3); null where there
 * is none, said once in the event log.
 * @param {any} $
 */
async function readGates($) {
  if (gateState !== undefined) return gateState;
  if (!freeflowHome) return null;
  sessionId ??= await $.session.id();
  let parsed = null;
  try {
    parsed = JSON.parse(await $.fs.read(`${freeflowHome}/sessions/${sessionId}/gates.json`));
  } catch {
    // No state, or one that cannot be read: the gates that need it are quiet under warn and closed under block.
  }
  gateState = validGateState(parsed) ? parsed : null;
  if (gateState === null && !gateMissingSaid) {
    gateMissingSaid = true;
    await emit($, "freeflow", { what: "gates", detail: "no gate state for this session" });
  }
  return gateState;
}

/**
 * The gates on one tool call (SPEC-008 4.2, 4.3): the verdict as it stands under warn, with one row per gate per turn
 * the agent reads (a worker's as a message to it); under block, a deny with the gate's text, or an ask for a delivery
 * step where someone can answer. A deny beneath stands.
 * @param {any} $
 * @param {any} e
 * @param {{ decision: string, reason?: string }} verdict
 */
async function gated($, e, verdict) {
  if (verdict.decision === "deny") return verdict;
  const input = /** @type {Record<string, unknown>} */ (e.input ?? {});
  const delegation = e.agentId === undefined ? undefined : (await workerMap($, null)).get(e.agentId)?.delegation;
  const result = decide(
    await readGates($),
    {
      tool: e.tool,
      paths: FILE_TOOLS.has(e.tool)
        ? [input.file_path, input.notebook_path, input.path].filter((path) => typeof path === "string" && path)
        : [],
      command: COMMAND_TOOLS.has(e.tool) && typeof input.command === "string" ? input.command : undefined,
      cwd: await $.session.cwd(),
      readOnly: e.isReadOnly === true,
      delegation,
      canAsk: e.approver !== undefined,
    },
    gateModes,
  );
  if (result.decision === "allow") return verdict;
  const agent = e.agentId ?? "main";
  for (const fired of result.fired) await emit($, "gate", gateEvent(fired, e.tool), agent);
  if (result.decision === "warn") {
    const warned = warnedGates.get(agent) ?? new Set();
    warnedGates.set(agent, warned);
    const rows = result.fired
      .filter((/** @type {any} */ fired) => !warned.has(fired.gate))
      .map((/** @type {any} */ fired) => {
        warned.add(fired.gate);
        return gateText(fired);
      });
    for (const row of rows)
      if (e.agentId !== undefined) await $.session.send({ to: { agentId: e.agentId }, text: row });
      else await appendRow($, row);
    return verdict;
  }
  const reason = result.fired
    .filter((/** @type {any} */ fired) => fired.decision !== "warn")
    .map((/** @type {any} */ fired) => gateText(fired))
    .join("\n\n");
  return { decision: /** @type {const} */ (result.decision === "ask" ? "ask" : "deny"), reason };
}

const SCOPE_NAMES = /** @type {Record<string, string>} */ ({
  repository: "Repository",
  personal: "Personal",
  session: "Session",
  default: "default",
});
const FILES = /** @type {Record<string, string>} */ ({
  repository: ".freeflow/config.json",
  personal: ".freeflow/local.json",
});
const SECTION_ROWS = new Set([
  "enabled",
  "prompts.enabled",
  "skills.enabled",
  "events.enabled",
  "gates.agreement",
  "gates.slice",
  "gates.delivery",
  "gates.delegation",
  "review.unit",
  "review.model",
  "review.rounds",
  "governor.mode",
  "governor.cap",
  "pane.enabled",
  "pane.statusLine",
]);
const COMMAND_USAGE = [
  "Set one: /freeflow settings <key> <value> [--session | --personal | --repository]  (Personal by default)",
  "Remove one: /freeflow settings <key> inherit [--session | --personal | --repository]",
].join("\n");

/** A value as the person reads it. @param {unknown} value */
const shown = (value) => (value === null ? "none" : value === true ? "on" : value === false ? "off" : String(value));

/** Where a resolved value comes from, in words. @param {string} scope */
const from = (scope) =>
  scope === "default"
    ? "the default"
    : scope === "session"
      ? "this session (Session)"
      : `${FILES[scope]} (${SCOPE_NAMES[scope]})`;

/**
 * Lists the settings Claude Code acts on: each section's switch and the review, always, and any other key a scope sets.
 * @param {any} data the script's list
 */
function listText(data) {
  const rows = data.settings.filter((/** @type {any} */ row) => SECTION_ROWS.has(row.key) || row.scope !== "default");
  const width = Math.max(...rows.map((/** @type {any} */ row) => row.label.length));
  // The settings a file ignores are named with the script's own line for them, and Freeflow stays on (D-045).
  const ignored = (data.state ?? []).filter((/** @type {string} */ line) => line.startsWith("Settings ignored:"));
  return [
    `Freeflow settings for ${data.root} (Claude Code)`,
    ...rows.map(
      (/** @type {any} */ row) =>
        `  ${row.label.padEnd(width)}  ${shown(row.value).padEnd(8)}  ${SCOPE_NAMES[row.scope]}${SECTION_ROWS.has(row.key) ? "" : `  (${row.key})`}`,
    ),
    ...ignored,
    COMMAND_USAGE,
    "Keys: enabled, prompts.enabled, prompts.<prompt>, skills.enabled, skills.<skill>, events.enabled, gates.agreement, gates.slice, gates.delivery, gates.delegation, review.unit, review.model, review.rounds, governor.mode, governor.cap, pane.enabled, pane.statusLine.",
    "Review depth rules (review.depth) are edited in .freeflow/config.json; review-plan reads them from the base commit.",
    "Pi-only settings (tool execution, compaction, messaging) are changed on Pi or in the files.",
  ].join("\n");
}

/**
 * Serves `/freeflow capabilities`: what Freeflow can do in this session, from the claims this mod wrote, through Setup
 * Freeflow's capabilities.mjs, the script the agent runs (section 4.6).
 * @param {any} $
 * @returns {Promise<{ text: string }>}
 */
async function capabilitiesCommand($) {
  try {
    const run = await $.process.run(["node", `${$.plugin.root}/${CAPABILITIES_SCRIPT}`, "list"], {
      env: { CLAUDE_CODE_SESSION_ID: await $.session.id() },
      timeoutMs: SETTINGS_TIMEOUT_MS,
    });
    const text =
      run.exitCode === 0 ? run.stdout.trimEnd() : (run.stderr.split("\n")[0] || `exit code ${run.exitCode}`).trim();
    return { text: run.exitCode === 0 ? text : `Freeflow capabilities: ${text.replace(/^Error: /, "")}` };
  } catch (error) {
    return { text: `Freeflow capabilities: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Serves `/freeflow settings [<key> [<value>] [--session | --personal | --repository]]` through the settings script:
 * the lines for the person, and for the model the setting and the Runtime State lines that changed (SPEC-005 4.4).
 * @param {any} $
 * @param {string} args
 * @returns {Promise<{ text: string, context?: string[] }>}
 */
async function settingsCommand($, args) {
  const words = args.trim().split(/\s+/).filter(Boolean);
  if (words[0] !== "settings")
    return {
      text: "Freeflow on Claude Code: /freeflow settings lists Freeflow's settings and changes one; /freeflow capabilities says what Freeflow can do in this session; /freeflow pane opens or closes Freeflow's pane.",
    };
  const flags = words.slice(1).filter((word) => word.startsWith("--"));
  const [key, value, extra] = words.slice(1).filter((word) => !word.startsWith("--"));
  const scopes = flags.map((flag) => flag.slice(2));
  const unknown = scopes.find((scope) => !["session", "personal", "repository"].includes(scope));
  if (unknown !== undefined || scopes.length > 1 || extra !== undefined)
    return {
      text: `Freeflow settings: ${unknown !== undefined ? `unknown option --${unknown}` : "too many arguments"}.\n${COMMAND_USAGE}`,
    };
  if (key === undefined) {
    const result = await settings($, ["list", "--host", "claude-code"]);
    return { text: result.ok ? listText(result.data) : `Freeflow settings: ${result.error}` };
  }
  if (value === undefined) {
    const result = await settings($, ["get", key]);
    return {
      text: result.ok
        ? `${result.data.label}: ${shown(result.data.value)}, from ${from(result.data.scope)}.`
        : `Freeflow settings: ${result.error}`,
    };
  }
  const scope = scopes[0] ?? "personal";
  const result = await settings(
    $,
    value === "inherit" ? ["unset", key, "--scope", scope] : ["set", key, value, "--scope", scope],
  );
  if (!result.ok) return { text: `Freeflow settings: ${result.error}` };
  const data = result.data;
  await guidanceChanged($);
  const wasOn = enabled;
  if (data.key === "enabled" || data.key === "events.enabled") {
    await resolveEnabled($);
    // The claims follow the switch: off, every request is no; the event log's own off, sensors is only possible.
    await writeCapabilities($, freeflowHome);
  }
  // The pane and the status line follow their switches, and Freeflow's (SPEC-015).
  if (data.key === "enabled" || data.key.startsWith("pane.")) {
    await resolvePane($);
    paneRead($);
  }
  if (data.key.startsWith("governor.")) await resolveGovernor($);
  if (!wasOn && enabled) {
    // On again: the next turn end does what session start does with a store, and the window is read at the next request.
    awaitingStore = { session: await $.session.id(), cwd: await $.session.cwd() };
    contextWindow = null;
  }
  const notes = [...data.notes];
  if (data.key === "enabled")
    notes.push(
      enabled
        ? "Freeflow's task menu, notices and compaction work in this session from its next event."
        : "Freeflow's task memory layer stops in this session now: no menu, notices, context rows, compaction, hold or sync; the session-start context stops from the next session.",
    );
  const line = `${data.label}: ${shown(data.value)}, from ${from(data.scope)}.`;
  return {
    text: [`${line} The agent sees it now.`, ...notes].join("\n"),
    context: [
      [
        `The user changed a Freeflow setting with /freeflow settings: ${data.key} is now ${shown(data.value)}, from ${from(data.scope)}.`,
        ...data.changed.map((/** @type {string} */ each) => `Runtime State now: ${each}`),
        ...data.cleared.map((/** @type {string} */ each) => `Runtime State no longer: ${each}`),
        ...notes,
      ].join("\n"),
    ],
  };
}

// The cost governor (SPEC-014, section 2.3): after each model request it reads the plan's usage windows and the
// session's cost, and tells the agent once a cap is near: a row at 80% of it, and at 100% a notice (`governor.mode`
// warn, the default) or the ask to stop at the next safe point, checkpoint and ask the user (stop). The caps: on a
// subscription, the seven-day window's daily pace, what is left of it at the start of this day of the window over the
// days until it resets, against what this day used; with a held task, its plan's high end (`estimate --plan`) against
// what the session spent since the plan was read. `governor.cap` replaces the pace with a percent of the seven-day
// window, or where there is no window (an API key), the task's cap with dollars of the session's cost. Each response
// comes once for its cap and period, and is written to the event log. It notifies; a gate for it is not built.
const DAY_MS = 86_400_000;
const GOVERNOR_ROW_AT = 0.8;
/** @type {"warn" | "stop"} */
let governorMode = "warn";
/** @type {number | null} `governor.cap`: a percent of the seven-day window, or dollars */
let governorCap = null;
/** @type {{ task: string, asOf: string | null, usd: number | null, from: number | null } | null} the held task's plan: its high end, and the session's cost when it was read */
let taskPlan = null;
/** @type {{ resetsAt: string, dayStart: string, percent: number } | null | undefined} this day of the window's start; undefined until read */
let dayBase = undefined;
/** Responses already given, by cap, period and response: each comes once. */
const governed = new Set();

/**
 * Reads `governor.mode` and `governor.cap` with one settings run, or from the listing the caller already read; each
 * stays as it was when the script fails.
 * @param {any} $
 * @param {any} [listed] a settings `list` result read for the same resolve
 */
async function resolveGovernor($, listed = undefined) {
  const result = listed ?? (await settings($, ["list"]));
  if (!result.ok) return;
  const value = (/** @type {string} */ key) =>
    result.data.settings?.find((/** @type {any} */ row) => row.key === key)?.value;
  const mode = value("governor.mode");
  if (mode === "warn" || mode === "stop") governorMode = mode;
  const cap = value("governor.cap");
  if (cap === null || (typeof cap === "number" && cap > 0)) governorCap = cap;
}

/**
 * The held task's plan, read again when the task or its last checkpoint changes: the high end of what its open Slices
 * are predicted to cost (null where the planner cannot predict it), and the session's cost then.
 * @param {any} $
 * @param {any} state session status
 */
async function governorTask($, state) {
  if (!state.task) {
    taskPlan = null;
    return;
  }
  if (taskPlan && taskPlan.task === state.task.id && taskPlan.asOf === state.task.stateAsOf) return;
  const run = await script($, ["estimate", "--plan", "--record", state.task.record, "--json"]);
  let usd = null;
  try {
    const high = run.exitCode === 0 ? JSON.parse(run.stdout).total?.usdHigh : null;
    usd = typeof high === "number" && high > 0 ? high : null;
  } catch {
    // Not the planner's JSON: no task cap.
  }
  const spent = (await $.session.usage()).cost?.usd;
  taskPlan = {
    task: state.task.id,
    asOf: state.task.stateAsOf ?? null,
    usd,
    from: typeof spent === "number" ? spent : null,
  };
}

/**
 * The day of the seven-day window `now` is in, counted back from its reset: its start, and the days left from it.
 * @param {string} resetsAt
 * @param {number} now
 */
function windowDay(resetsAt, now) {
  const reset = Date.parse(resetsAt);
  if (!Number.isFinite(reset) || reset <= now) return null;
  const days = Math.floor((reset - now) / DAY_MS) + 1;
  return { start: new Date(reset - days * DAY_MS).toISOString(), days };
}

/**
 * The daily pace: what was left of the window when this day of it began, over the days left from then.
 * @param {number} basePercent
 * @param {number} days
 */
const dailyPace = (basePercent, days) => Math.max(0, 100 - basePercent) / days;

/**
 * Where this day of the window began, from the Freeflow home (beside the event log, on this machine only), so every
 * session of the day counts from the same point; the first reading of a day starts it.
 * @param {any} $
 * @param {{ kind: string, percentUsed: number, resetsAt: string }} window
 * @param {{ start: string }} day
 */
async function baseOf($, window, day) {
  const path = freeflowHome ? `${freeflowHome}/events/governor.json` : null;
  if (dayBase === undefined) {
    dayBase = null;
    if (path)
      try {
        dayBase = JSON.parse(await $.fs.read(path));
      } catch {
        // None kept yet, or unreadable: this reading starts the day.
      }
  }
  if (dayBase?.resetsAt === window.resetsAt && dayBase.dayStart === day.start) return dayBase;
  dayBase = { resetsAt: window.resetsAt, dayStart: day.start, percent: window.percentUsed };
  if (path) await $.fs.write(path, `${JSON.stringify(dayBase)}\n`).catch(() => undefined);
  return dayBase;
}

/**
 * The caps that apply now, each with its use, limit, unit, the period it holds for and how it reads.
 * @param {any} $
 * @param {any} usage
 */
async function governorCaps($, usage) {
  const caps = [];
  const money = (/** @type {number} */ value) => `$${value.toFixed(2)}`;
  const seven = (usage.rateLimits ?? []).find(
    (/** @type {any} */ each) => each.kind === "seven_day" && typeof each.percentUsed === "number",
  );
  const spent = usage.cost?.usd;
  if (seven && governorCap !== null)
    caps.push({
      cap: "window",
      unit: "percent",
      use: seven.percentUsed,
      limit: governorCap,
      period: seven.resetsAt ?? "window",
      what: `the seven-day window is ${seven.percentUsed}% used, of the ${governorCap}% your governor.cap sets`,
      resets: seven.resetsAt,
    });
  else if (seven?.resetsAt) {
    const day = windowDay(seven.resetsAt, await $.clock.now());
    if (day) {
      const base = await baseOf($, seven, day);
      const limit = dailyPace(base.percent, day.days);
      const use = Math.max(0, seven.percentUsed - base.percent);
      caps.push({
        cap: "pace",
        unit: "percent",
        use,
        limit,
        period: day.start,
        what: `this day of the seven-day window used ${round(use)}% of it, against a daily pace of ${round(limit)}% (${round(100 - base.percent)}% left over ${day.days} day(s))`,
        resets: seven.resetsAt,
      });
    }
  }
  if (typeof spent === "number" && !seven && governorCap !== null)
    caps.push({
      cap: "task",
      unit: "usd",
      use: spent,
      limit: governorCap,
      period: "session",
      what: `this session has cost ${money(spent)} at API list price, of the ${money(governorCap)} your governor.cap sets`,
    });
  else if (typeof spent === "number" && taskPlan?.usd && taskPlan.from !== null) {
    const use = Math.max(0, spent - taskPlan.from);
    caps.push({
      cap: "task",
      unit: "usd",
      use,
      limit: taskPlan.usd,
      period: `${taskPlan.task} ${taskPlan.asOf}`,
      what: `${taskPlan.task} cost ${money(use)} at API list price since its plan was read, of ${money(taskPlan.usd)}, the high end its open Slices are predicted to cost`,
    });
  }
  return caps;
}

const round = (/** @type {number} */ value) => Math.round(value * 10) / 10;

/**
 * After each model request: each cap at 80% gets one row, and at 100% one notice or, under stop, the ask.
 * @param {any} $
 */
async function governStep($) {
  const usage = await $.session.usage();
  for (const cap of await governorCaps($, usage)) {
    if (!(cap.limit > 0)) continue;
    const share = cap.use / cap.limit;
    const response =
      share >= 1 ? (governorMode === "stop" ? "ask" : "notice") : share >= GOVERNOR_ROW_AT ? "row" : null;
    if (!response) continue;
    const key = `${cap.cap} ${cap.period} ${response === "row" ? "row" : "full"}`;
    if (governed.has(key)) continue;
    governed.add(key);
    if (response !== "row") governed.add(`${cap.cap} ${cap.period} row`);
    const resets = cap.resets ? `; it resets at ${cap.resets}` : "";
    const text =
      response === "row"
        ? `Freeflow cost governor: ${cap.what}, ${Math.round(share * 100)}% of the cap${resets}.`
        : response === "notice"
          ? `Freeflow cost governor: a cap is reached: ${cap.what}${resets}. Say so to the user in your next answer; Freeflow only notifies (governor.mode warn).`
          : `Freeflow cost governor: a cap is reached: ${cap.what}${resets}. Stop at your next safe point: ${SAFE_POINT}. Checkpoint there (your task's record, or this session's summary), then end your turn asking the user whether to go on (governor.mode stop).`;
    await appendRow($, text);
    await emit($, "governor", {
      cap: cap.cap,
      unit: cap.unit,
      limit: Math.round(cap.limit * 100) / 100,
      use: Math.round(cap.use * 100) / 100,
      response,
    });
  }
}

// Freeflow arriving mid-session, and its guidance pinned (SPEC-013). What session start does, it does once per session,
// and a ledger in the Freeflow home (`sessions/<session>/start.json`) says which of its steps ran: a session whose start
// did not run them (the plugin enabled or updated mid-session, `enabled` switched on, a harness that skips the hook)
// gets each missing one at its next turn's start, the guidance and the menu as one row. Where this Claude Code composes
// the system prompt through mods (`prompt.compose`), the session-start hooks' text is one section of it, so it is in
// every request and survives every compaction, and the hooks' copies are left out while it is there.
const SECTION_SCRIPT = "hooks/shared/runtime-context.mjs";
/** The guidance's section in the system prompt; a plugin's own is `<plugin>:<name>`. */
const SECTION_ID = "freeflow:guidance";
/** Session start's steps, in the order a catch-up runs them. */
const START_STEPS = ["window", "cycle", "capabilities", "sync", "menu", "guidance"];
/** Tries a failed step gets, at most one a turn: the first, then one more at the next turn (section 4). */
const STEP_TRIES = 2;
const MID_SESSION =
  "Freeflow started mid-session: its session start did not run in this session, so what it gives a session at its start follows now.";
/** @type {{ session: string, steps: Record<string, string>, pinned: boolean } | null} the ledger, null until known */
let started = null;
/** Whether the ledger kept in the store was read into `started` for this session yet. */
let ledgerRead = false;
/** @type {Map<string, number>} each step's failed tries this session */
const stepFailures = new Map();
/** Whether a catch-up is running, so two turn starts never run one twice. */
let catching = false;
/** @type {{ parts: string[], text: string, home?: string } | null} the hooks' texts, their section; null until rendered */
let guidance = null;
/** Whether this session start's thread carries the section, for the ledger. */
let pinnedAtStart = false;

/** @param {string} home @param {string} session */
const ledgerPath = (home, session) => `${home}/sessions/${session}/start.json`;

/**
 * The session-start hooks' texts for the session's folder and settings, rendered by the hooks' own renderer, the
 * section they make joined in their order, and the Freeflow home the renderer reads; kept until settings change or a
 * session start renders them again.
 * @param {any} $
 * @param {{ cwd?: string, session?: string }} [where] a session start's folder and session, else the session's own
 */
async function renderGuidance($, where = {}) {
  if (guidance) return guidance;
  const run = await $.process.run(
    ["node", `${$.plugin.root}/${SECTION_SCRIPT}`, "section", "--cwd", where.cwd || (await $.session.cwd())],
    { env: { CLAUDE_CODE_SESSION_ID: where.session || (await $.session.id()) }, timeoutMs: SETTINGS_TIMEOUT_MS },
  );
  let rendered;
  try {
    rendered = JSON.parse(run.stdout);
  } catch {
    rendered = undefined;
  }
  const parts = rendered?.parts;
  if (run.exitCode !== 0 || !Array.isArray(parts) || !parts.every((part) => typeof part === "string"))
    throw new Error(
      `the guidance could not be rendered: ${(run.stderr.split("\n")[0] || `exit code ${run.exitCode}`).trim()}`,
    );
  guidance = {
    parts,
    text: parts.filter((part) => part.trim()).join("\n\n"),
    home: typeof rendered.home === "string" ? rendered.home : undefined,
  };
  return guidance;
}

/**
 * A settings change: the section is rendered again, once, so the next prompt the engine composes carries the change
 * (one cache write, at the new thread or compaction where the engine sends a changed section).
 * @param {any} $
 */
async function guidanceChanged($) {
  guidance = null;
  await renderGuidance($).catch((/** @type {unknown} */ error) =>
    $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`),
  );
}

/**
 * A session start's result without the hooks' copies of the guidance, where the section carries it.
 * @param {any} result
 * @param {string[]} parts
 */
function withoutHookGuidance(result, parts) {
  const ours = new Set(parts.map((part) => part.trim()).filter(Boolean));
  if (!Array.isArray(result.additionalContext)) return result;
  const rest = result.additionalContext.filter((/** @type {string} */ text) => !ours.has(String(text).trim()));
  if (rest.length === result.additionalContext.length) return result;
  const { additionalContext: _dropped, ...others } = result;
  return rest.length ? { ...others, additionalContext: rest } : others;
}

/** @param {any} $ */
async function keepLedger($) {
  if (!freeflowHome || !started) return;
  const file = { v: 1, steps: started.steps, pinned: started.pinned };
  await $.fs
    .write(ledgerPath(freeflowHome, started.session), `${JSON.stringify(file, null, 2)}\n`)
    .catch((/** @type {unknown} */ error) =>
      $.ui.log(`Freeflow: the session-start ledger: ${error instanceof Error ? error.message : String(error)}`),
    );
}

/**
 * The ledger a session keeps in the Freeflow home, or null where there is none.
 * @param {any} $
 * @param {string} home
 * @param {string} session
 */
async function readLedger($, home, session) {
  try {
    const kept = JSON.parse(await $.fs.read(ledgerPath(home, session)));
    return { steps: typeof kept.steps === "object" && kept.steps ? kept.steps : {}, pinned: kept.pinned === true };
  } catch {
    return null;
  }
}

/** Whether every step ran or has had its tries. */
const settled = () =>
  started !== null && START_STEPS.every((step) => started?.steps[step] || (stepFailures.get(step) ?? 0) >= STEP_TRIES);

/**
 * The classic SessionStart's chain beneath the mod, with the hooks' copies of the guidance left out where the section
 * carries it: a new thread and a compaction start their prompt over with it, and a resumed or forked thread keeps the
 * prompt it recorded, so there only a ledger saying that prompt had it does. A compaction delivers the guidance again,
 * through the section or the hooks, which the ledger keeps.
 * @param {any} $
 * @param {any} e
 * @param {any} next
 */
async function pinnedStart($, e, next) {
  const result = await next(e);
  const fresh = e.source !== "compact";
  if (fresh) {
    guidance = null;
    pinnedAtStart = false;
  }
  // Off, the hooks deliver nothing either, and the mod does nothing but serve /freeflow.
  if (!enabled) return result;
  let pinned = false;
  let out = result;
  try {
    const rendered = await renderGuidance($, { cwd: e.cwd, session: e.session_id });
    const home = freeflowHome ?? rendered.home;
    const recorded = !["resume", "fork"].includes(e.source)
      ? true
      : Boolean(home) && (await readLedger($, String(home), e.session_id))?.pinned === true;
    pinned = Boolean(rendered.text) && recorded;
    if (pinned) out = withoutHookGuidance(result, rendered.parts);
  } catch (error) {
    $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}; the session-start hooks keep it`);
  }
  if (fresh) pinnedAtStart = pinned;
  else {
    const now = new Date(await $.clock.now()).toISOString();
    if (started?.session === e.session_id) {
      started.steps.guidance = now;
      started.pinned = pinned;
      await keepLedger($);
    } else {
      // Not known in this process: the next catch-up reads what the store keeps and adds this to it.
      started = { session: e.session_id, steps: { guidance: now }, pinned };
      ledgerRead = false;
    }
  }
  return out;
}

/**
 * A session start Freeflow ran with Freeflow on: every step is in the ledger, done by this start.
 * @param {any} $
 * @param {any} e
 */
async function startRan($, e) {
  const now = new Date(await $.clock.now()).toISOString();
  started = {
    session: e.session_id,
    steps: Object.fromEntries(START_STEPS.map((step) => [step, now])),
    pinned: pinnedAtStart,
  };
  ledgerRead = true;
  stepFailures.clear();
  await keepLedger($);
}

/**
 * At a main turn's start, with Freeflow on: each step session start would have done and has not, once, and the
 * guidance and the menu as one row. A step that fails is logged and tried again at the next turn, once.
 * @param {any} $
 */
async function caughtUp($) {
  if (!enabled || catching || settled()) return;
  catching = true;
  try {
    await catchUp($);
  } catch (error) {
    $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    catching = false;
  }
}

/** @param {any} $ */
async function catchUp($) {
  const session = await $.session.id();
  if (started && started.session !== session) {
    started = null;
    ledgerRead = false;
    stepFailures.clear();
  }
  const found = await sessionStatus($, { session });
  if (found?.home) freeflowHome = found.home;
  if (!ledgerRead && freeflowHome) {
    ledgerRead = true;
    const kept = await readLedger($, freeflowHome, session);
    if (kept)
      started = { session, steps: { ...kept.steps, ...started?.steps }, pinned: started?.pinned ?? kept.pinned };
  }
  started ??= { session, steps: {}, pinned: false };
  const ledger = started;
  const due = START_STEPS.filter((step) => !ledger.steps[step] && (stepFailures.get(step) ?? 0) < STEP_TRIES);
  if (!due.length) return;
  const cwd = await $.session.cwd();
  const now = new Date(await $.clock.now()).toISOString();
  /** @type {string[]} */
  const done = [];
  /** @type {{ guidance?: string, menu?: string }} */
  const shown = {};
  /** @param {string} step @param {unknown} error */
  const failed = async (step, error) => {
    const message = error instanceof Error ? error.message : String(error);
    stepFailures.set(step, (stepFailures.get(step) ?? 0) + 1);
    $.ui.log(`Freeflow: session start's ${step} step failed mid-session: ${message}`);
    await emit($, "freeflow", { what: "menu", detail: `mid-session, ${step} failed: ${message}` });
  };
  const unread = new Error("session status could not be read");
  for (const step of due.filter((each) => each !== "sync" && each !== "menu")) {
    try {
      if (step === "window") await readWindow($);
      else if (step === "cycle") {
        await newCycle($, null);
        workers = null;
      } else if (step === "capabilities") {
        if (!found?.home) throw unread;
        await writeCapabilities($, freeflowHome);
      } else if (step === "guidance") shown.guidance = (await renderGuidance($)).text;
      ledger.steps[step] = now;
      done.push(step);
    } catch (error) {
      await failed(step, error);
    }
  }
  const store = due.filter((each) => each === "sync" || each === "menu");
  if (store.length) {
    const missing = missingText(found);
    if (!found) for (const step of store) await failed(step, unread);
    else if (!found.store) {
      // No store yet: the turn that ends with one takes it up, as after a session start without one.
      awaitingStore = { session, cwd };
      if (store.includes("menu") && missing.length) shown.menu = `the store is not ready.\n${missing.join("\n")}`;
      for (const step of store) ledger.steps[step] = now;
      done.push(...store);
    } else
      try {
        await storeRootOf($, found);
        const menu = await storeArrived($, found, session, cwd);
        awaitingStore = null;
        ledger.steps.sync ??= now;
        if (store.includes("sync")) done.push("sync");
        if (menu.exitCode !== 0)
          throw new Error((menu.stderr.split("\n")[0] || `exit code ${menu.exitCode}`).replace(/^Error: /, ""));
        if (store.includes("menu")) {
          shown.menu = [menu.stdout.trimEnd(), ...missing].join("\n");
          ledger.steps.menu = now;
          done.push("menu");
        }
      } catch (error) {
        await failed(store.includes("menu") ? "menu" : "sync", error);
      }
  }
  if (shown.guidance || shown.menu)
    await appendRow(
      $,
      [
        MID_SESSION,
        ...(shown.guidance ? [shown.guidance] : []),
        ...(shown.menu ? [`Freeflow task memory:\n${shown.menu}`] : []),
      ].join("\n\n"),
    );
  if (done.length) await emit($, "freeflow", { what: "menu", detail: `mid-session: ${done.join(", ")}` });
  await keepLedger($);
}

/**
 * The system prompt as the engine composed it, with the guidance as one section after the engine's own: the engine
 * sends a changed answer only in a new thread or after a compaction, so it stands for the whole thread.
 * @param {any} $
 * @param {any} e
 * @param {any} composed
 */
async function withGuidance($, e, composed) {
  if (!enabled || e.traits?.includes("bare")) return composed;
  try {
    const { text } = await renderGuidance($);
    if (!text) return composed;
    return {
      sections: [
        ...composed.sections.filter((/** @type {{ id: string }} */ section) => section.id !== SECTION_ID),
        { id: SECTION_ID, text, scope: /** @type {const} */ ("session") },
      ],
    };
  } catch (error) {
    $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    return composed;
  }
}

/** @param {import("claude-code").On} on */
export function register(on) {
  // The session is ready, or the module reloaded: declare /freeflow, and read whether Freeflow is on for this folder.
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "freeflow",
      description:
        "Freeflow's settings: list them, or change one for this session, you or the repository; what Freeflow can do here; and Freeflow's pane",
      argumentHint: "settings [<key> <value|inherit> [--session | --personal | --repository]] | capabilities | pane",
    });
    // A -p run or the SDK has no one at the prompt, so nothing runs between its turns (section 4.5). Claims written
    // before this event came, at the classic SessionStart, are written again with what it says.
    const was = interactive;
    if (typeof e.isInteractive === "boolean") interactive = e.isInteractive;
    await resolveEnabled($);
    if (interactive !== was && freeflowHome && enabled) await writeCapabilities($, freeflowHome);
    // The pane's and the status line's switches (SPEC-015), from the listing resolveEnabled just read.
    await resolvePane($, lastListed);
    return next(e);
  });

  on("command.run", { command: "freeflow" }, ($, e) =>
    /^\s*capabilities\b/.test(e.args ?? "")
      ? capabilitiesCommand($)
      : /^\s*pane\b/.test(e.args ?? "")
        ? paneCommand($)
        : settingsCommand($, e.args),
  );

  // Session start, /clear and resume: pull the store, give the scripts the window, and give the agent the menu, which
  // says which task this session holds, taken back when a resume finds the task its end released (Spec section 4, F36).
  on("classic.SessionStart", async ($, e, next) => {
    const result = await pinnedStart($, e, next);
    if (e.source === "compact") {
      await emit($, "session.start", { source: "compact", interactive });
      return result;
    }
    await resolveEnabled($);
    if (!enabled) return result;
    await emit($, "session.start", { source: e.source, interactive });
    await newCycle($, null);
    workers = null;
    await readWindow($);
    const found = await sessionStatus($, { session: e.session_id });
    freeflowHome = found?.home;
    await startRan($, e);
    await writeCapabilities($, freeflowHome);
    // The pane and the status line read the script after this hook returns (SPEC-015).
    paneRead($);
    const state = found?.store ? found : null;
    await storeRootOf($, state);
    const missing = missingText(found);
    awaitingStore = state ? null : { session: e.session_id, cwd: e.cwd };
    if (!state)
      return missing.length
        ? {
            ...result,
            additionalContext: [
              ...(result.additionalContext ?? []),
              `Freeflow task memory: the store is not ready.\n${missing.join("\n")}`,
            ],
          }
        : result;
    const menu = await storeArrived($, state, e.session_id, e.cwd);
    if (menu.exitCode !== 0) return result;
    await emit($, "freeflow", { what: "menu" });
    const text = [menu.stdout.trimEnd(), ...missing].join("\n");
    return {
      ...result,
      additionalContext: [...(result.additionalContext ?? []), `Freeflow task memory:\n${text}\n`],
    };
  });

  on("turn.start", async ($, e, next) => {
    if (e.agentId === undefined) mainTurns += 1;
    const agent = e.agentId ?? "main";
    // Each turn reads the gate state again, and each gate may warn once in it.
    if (e.agentId === undefined) gateState = undefined;
    warnedGates.delete(agent);
    turnsOf.set(agent, (turnsOf.get(agent) ?? 0) + 1);
    await emit($, "turn.start", { turn: turnsOf.get(agent) }, agent);
    if (e.agentId === undefined) await caughtUp($);
    return next(e);
  });

  // The guidance pinned as a section of the system prompt (SPEC-013).
  on("prompt.compose", async ($, e, next) => withGuidance($, e, await next(e)));

  on("turn.step", async function* ($, e, next) {
    const response = yield* next(e);
    if (!enabled) return response;
    const usage = response?.usage;
    const model = e.model ?? usage?.model;
    if (model) {
      const [input, read, written] = [
        usage?.input_tokens,
        usage?.cache_read_input_tokens,
        usage?.cache_creation_input_tokens,
      ].map((count) => (Number.isInteger(count) ? count : undefined));
      await emit(
        $,
        "model.request",
        {
          model: String(model),
          effort: typeof e.effort === "string" ? e.effort : null,
          in: input,
          out: Number.isInteger(usage?.output_tokens) ? usage.output_tokens : undefined,
          cacheRead: read,
          cacheWrite: written,
          context: usage ? (input ?? 0) + (read ?? 0) + (written ?? 0) : undefined,
          stop: typeof response?.stopReason === "string" && response.stopReason ? response.stopReason : undefined,
        },
        e.agentId ?? "main",
      );
    }
    try {
      if (e.agentId === undefined) await watchMain($);
      else await noticeWorker($, e, response);
    } catch (error) {
      $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    }
    // The cost governor, after every request of the session's: the plan's windows and the cost are the session's.
    try {
      await governStep($);
    } catch (error) {
      $.ui.log(`Freeflow cost governor: ${error instanceof Error ? error.message : String(error)}`);
    }
    return response;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    const agent = e.agentId ?? "main";
    await emit(
      $,
      "turn.end",
      {
        turn: turnsOf.get(agent),
        reason: ["answer", "aborted", "refusal", "error"].includes(e.reason) ? e.reason : undefined,
        ms: Number.isInteger(e.durationMs) && e.durationMs >= 0 ? e.durationMs : undefined,
      },
      agent,
    );
    if (e.agentId !== undefined || !enabled) return result;
    try {
      await turnEnded($, e);
    } catch (error) {
      $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    }
    // The turn's lines, written in one run (T2).
    await flush($);
    // The pane and the status line read the script again after the turn (SPEC-015).
    paneRead($);
    return result;
  });

  // Every tool call, as one line: the tool, whether it ran without error, its time, the paths a file tool names and a
  // shell command's text, which the writer redacts and cuts (P4). Before a checkpoint or a release runs, the lines so
  // far are written, so the summary it commits counts this turn too.
  on("tool.call", async ($, e, next) => {
    if (!enabled || !eventsOn) return next(e);
    const input = /** @type {Record<string, unknown>} */ (e);
    const command = COMMAND_TOOLS.has(e.tool) && typeof input.command === "string" ? input.command : undefined;
    if (command !== undefined && /working-record\.mjs\s+(checkpoint|task\s+(release|switch))\b/.test(command))
      await flush($);
    const started = await $.clock.now();
    const result = await next(e);
    const ended = await $.clock.now();
    // A Track Work command may have changed the gate state: the next check reads it again.
    if (command !== undefined && command.includes("working-record.mjs")) gateState = undefined;
    const paths = FILE_TOOLS.has(e.tool) ? toolPaths(input, await $.session.cwd()) : [];
    const root = storeRoot ?? null;
    const ours =
      (command !== undefined && command.includes(`${$.plugin.root}/`)) ||
      (root !== null && paths.some((path) => path === root || path.startsWith(`${root}/`)));
    await emit(
      $,
      "tool.call",
      {
        tool: String(e.tool),
        ok: !result.deny && !result.isError,
        ms: Math.max(0, Math.round(ended - started)),
        paths: paths.length ? paths : undefined,
        command,
        source: ours ? "freeflow" : "agent",
      },
      e.agentId ?? "main",
    );
    return result;
  });

  // The store holds the task memory the agent keeps, so a file tool on a path that really lands inside it runs where
  // the mode would ask, as in a working directory with edits allowed; any deny, a rule's or a hook's, still stands.
  // Then the gates decide (SPEC-008): a warning leaves the verdict as it is; a gate under block refuses, or asks.
  on("tool.check", async ($, e, next) => {
    const verdict = await next(e);
    if (!enabled) return verdict;
    return gated($, e, await storeAllowed($, e, verdict));
  }).catch(async ($, e, next) =>
    // A gate that fails is open under warn, as its sensor is, and closed under block (section 5).
    Object.values(gateModes).includes("block")
      ? { decision: /** @type {const} */ ("deny"), reason: "Freeflow's gates could not decide this call; try again." }
      : next(e),
  );

  on("session.compact", async ($, e, next) => {
    if (e.trigger === "precompute" || !enabled) return next(e);
    if (e.agentId !== undefined) {
      const compacted = await workerCompaction($, e, next);
      if (!compacted.skip) await emit($, "compaction", { trigger: e.trigger, by: "harness" }, e.agentId);
      await flush($);
      return compacted;
    }
    const before = (await $.session.usage()).context.tokens;
    const state = await status($);
    const result =
      !state || (!state.task && !state.summary && !state.delegation)
        ? await next(e)
        : checkpointDone(state)
          ? await ownCompaction($, e, next, state)
          : state.task
            ? await fallbackCompaction($, e, next, state)
            : state.delegation
              ? await workerSessionCompaction($, e, next, state)
              : await next(e);
    // Every compaction of the main conversation starts the next cycle, Claude's own without a task included.
    if (!result.skip) {
      const ours = Boolean(state) && (state.task || state.summary || state.delegation) && checkpointDone(state);
      // The cycle that ended is the one this compaction closes (its number is the store's, when there is a store).
      const ended = state ? await cycleNumber($, state) : (cycle.number ?? undefined);
      await emit($, "compaction", {
        trigger: typeof e.trigger === "string" ? e.trigger : undefined,
        by: ours ? "freeflow" : "harness",
        before: Number.isInteger(before) ? before : undefined,
        cycle: ended,
      });
      await nextCycle($, state);
    }
    await flush($);
    return result;
  });

  // A worker's start: which delegation it is, from its prompt (T7), kept for its notices, compaction and hand-back.
  on("agent.spawn", async ($, e, next) => {
    const result = await next(e);
    const delegation = DELEGATION.exec(e.prompt ?? "")?.[0];
    if (result.agentId) {
      const model = typeof result.model === "string" ? result.model : typeof e.model === "string" ? e.model : undefined;
      await emit($, "agent.spawn", { delegation, model }, result.agentId);
    }
    if (!enabled || !result.agentId || !delegation) return result;
    const state = await status($);
    const map = await workerMap($, state);
    map.set(result.agentId, { delegation, noticed: false });
    if (state)
      await $.fs.write(
        `${state.home}/sessions/${state.session}/delegations.json`,
        JSON.stringify(Object.fromEntries([...map].map(([agentId, worker]) => [agentId, worker.delegation])), null, 2),
      );
    return result;
  });

  // Freeflow's pane and status line (SPEC-015): their drawing, and a read after each Track Work command a tool ran.
  registerPane(on);

  // A worker hands back: its return is checked, and once it is told what is missing.
  on("classic.SubagentStop", async ($, e, next) => {
    const result = await stopChecked($, e, await next(e));
    await emit($, "agent.stop", { blocked: Boolean(result.block) }, e.agent_id || "main");
    await flush($);
    return result;
  });

  // The session ends: release its hold as ended, so a resume of this session takes it back (F36), and push, within
  // the short time an exit allows; the event log's last lines go first, so the release's summary counts them.
  on("session.end", async ($, e, next) => {
    try {
      const options = { session: e.sessionId, timeoutMs: Math.min(60_000, Math.max(1, next.budget.remainingMs - 500)) };
      await emit($, "session.end", { reason: typeof e.reason === "string" && e.reason ? e.reason : undefined });
      await flush($, { session: e.sessionId, timeoutMs: Math.min(EVENT_FLUSH_MS, options.timeoutMs) });
      const state = await status($, options);
      if (state?.task) await script($, ["task", "release", "--ended"], options);
      // A worker session's end, or one holding claims, releases them, and the worker's log says it ended (SPEC-009 5).
      else if (state?.delegation || state?.claims) await script($, ["release", "--ended"], options);
      if (!state?.task && (state?.changed || state?.delegation || state?.claims))
        await script($, ["store", "sync"], options);
    } catch (error) {
      $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    }
    return next(e);
  });
}

/**
 * The store's allow: a file tool's ask on a path that really lands inside the store becomes an allow.
 * @param {any} $
 * @param {any} e
 * @param {{ decision: string, reason?: string }} verdict
 */
async function storeAllowed($, e, verdict) {
  if (verdict.decision !== "ask" || !FILE_TOOLS.has(e.tool)) return verdict;
  const input = /** @type {Record<string, unknown>} */ (e.input ?? {});
  const root = await storeRootOf($);
  if (!root) return verdict;
  const real = await placed($, input.file_path ?? input.notebook_path ?? input.path);
  const inside = real !== undefined && (real === root || real.startsWith(root + separatorOf(root)));
  return inside ? { decision: /** @type {const} */ ("allow"), reason: STORE_REASON } : verdict;
}

/**
 * A worker hands back: its return is checked, and once it is told what is missing.
 * @param {any} $
 * @param {any} e
 * @param {any} result
 */
async function stopChecked($, e, result) {
  if (!enabled || e.stop_hook_active || result.block) return result;
  const state = await status($);
  const worker = (await workerMap($, state)).get(e.agent_id);
  if (!state?.task || !worker) return result;
  const checked = await script($, [
    "delegate",
    "check-return",
    "--record",
    state.task.record,
    "--id",
    worker.delegation,
  ]);
  if (checked.exitCode === 0 || !/return is not ready/.test(checked.stderr)) return result;
  const reason = checked.stderr.replace(/^Error: /, "").trim();
  await logDelegation($, worker.delegation, "blocked", `stop blocked: ${reason}`, e.agent_id, state);
  return {
    ...result,
    block: `Freeflow: ${reason} Write return.md as your brief says, then hand back.`,
  };
}
