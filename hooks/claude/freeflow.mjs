// Freeflow's Claude Code layer: a hooks module Claude Code runs on its own events (the task-004 Spec's section 11).
// It decides when Track Work's script runs and delivers what the script prints; what happens to a task's memory is
// the script's. Its task memory work runs only where the Freeflow store exists (session status says so); its event
// log and claims (SPEC-006) need none. Elsewhere every hook passes its event on unchanged.

const SCRIPT = "skills/track-work/scripts/working-record.mjs";
const SETTINGS_SCRIPT = "skills/setup-freeflow/scripts/settings.mjs";
const CAPABILITIES_SCRIPT = "skills/setup-freeflow/scripts/capabilities.mjs";
const SETTINGS_TIMEOUT_MS = 8_000; // within the 10 seconds a hook gets
const NOTICE_AT = 0.75; // of the window, one notice a cycle (P50)
const THRESHOLD_LEAD = 0.1; // and at least a tenth of the window before Claude's own threshold (T13)
const ROWS_AT = [0.5, 0.6, 0.7]; // of the window, one row each a cycle below the notice point, showing the context (P80)
const DELEGATION = /\bD-\d{3,}(?:\.\d+)?\b/; // the delegation an Agent call's prompt names (T7)
const FILE_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit", "Glob", "Grep"]);
const STORE_REASON = "Freeflow's store, which holds the task memory the agent keeps";
const CONTINUE =
  "Freeflow compacted the session after your checkpoint: the conversation is now your task's bundle. Continue from In flight and the Next action.";

// What the mod keeps between events. A cycle runs from the session's start or a compaction to the next compaction;
// its notice is the time of its one checkpoint notice (T12), its number is counted in the store (T27), and row is the
// highest share of the window a row has shown in it (P80). A module reload starts it over, reading the number again.
/** @type {{ startedAt: number, notice: number | null, number: number | null, row: number }} */
let cycle = { startedAt: Date.now(), notice: null, number: null, row: 0 };
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
    pin: claim("possible", "prompt.section exists; Freeflow does not use it yet"),
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
    block: claim("possible", "tool.check can deny; Freeflow only allows store files today"),
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
  contextWindow = size || null;
}

/** A new cycle: no notice or row yet, and the window read again; its number as given, null to read it from the store. */
async function newCycle($, number = cycle.number) {
  cycle = { startedAt: await $.clock.now(), notice: null, number, row: 0 };
  contextWindow = null;
}

/** Where the store counts this session's cycles: a resumed session keeps its count, a new one starts at 1. */
const cyclePath = (state) => `${state.home}/sessions/${state.session}/cycle.json`;

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
  if (state) await $.fs.write(cyclePath(state), `${JSON.stringify({ cycle: number })}\n`);
  await newCycle($, number);
}

/**
 * Where the notice comes, in tokens: 75% of the window, or a tenth of it before Claude's threshold if lower.
 * @param {number} size
 */
const noticePoint = (size) => Math.min(NOTICE_AT * size, threshold ? threshold - THRESHOLD_LEAD * size : Infinity);

/** What a safe point is: where stopping loses nothing that is not written down (Pi's "compaction is due soon"). */
const SAFE_POINT =
  "a finished step whose result you know (a check run and read, a set of edits complete, a report written), not mid-edit or with a command still running";

const share = (context) =>
  `${Math.round((100 * context.tokens) / context.window)}% of its window (${context.tokens} of ${context.window} tokens)`;

function noticeText($, context, state, number) {
  const command = `node ${$.plugin.root}/${SCRIPT}`;
  const limit = threshold ? `; Claude Code compacts on its own at about ${Math.round(threshold)} tokens` : "";
  const checkpoint = state.task
    ? `At that point, checkpoint ${state.task.id}: rewrite ${state.task.id}'s Current Context, adjust the rest of Current Work and Future Work, save as blocks any discussion in this cycle that shaped the work (discussion list, discussion save; skip it when there was none), then run ${command} checkpoint --record ${state.task.id} --compact --input - with In flight's lines.`
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
  const point = noticePoint(contextWindow);
  const context = { tokens, window: contextWindow };
  if (tokens < point) {
    const row = ROWS_AT.filter((at) => tokens >= at * contextWindow).at(-1);
    if (!row || row <= cycle.row) return;
    // Taken before the store is asked, so a session with none asks once a row.
    cycle.row = row;
    const state = await status($);
    if (cycle !== current || cycle.notice !== null || !state) return;
    const number = await cycleNumber($, state);
    await appendRow(
      $,
      `Freeflow, context cycle ${number}: the context is at ${share(context)}; the checkpoint notice comes at about ${Math.round(point)} tokens.`,
    );
    await emit($, "freeflow", { what: "row", detail: `cycle ${number}, ${Math.round(row * 100)}%` });
    return;
  }
  const state = await status($);
  // A compaction that came meanwhile started a new cycle, which this request's figures no longer describe; a notice
  // another request made meanwhile is the cycle's one.
  if (cycle !== current || cycle.notice !== null) return;
  if (!state) return;
  cycle.notice = await $.clock.now();
  const number = await cycleNumber($, state);
  await appendRow($, noticeText($, context, state, number));
  await emit($, "freeflow", { what: "notice", detail: `cycle ${number}` });
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
  if (!size || tokens < noticePoint(size)) return;
  worker.noticed = true;
  await $.session.send({
    to: { agentId: step.agentId },
    text: `Freeflow: your context is at ${Math.round((100 * tokens) / size)}% of its window and compaction is near. At your next safe point, rewrite ${worker.delegation}'s progress.md (Done, Half done, Didn't work, Next), so a compaction loses nothing, then go on.`,
  });
}

/** Whether the checkpoint this cycle asked for is done: the record's State as of, or the summary's time, is later
 * than the cycle's last notice, or than its start when no notice came (T12, P68). */
function checkpointDone(state) {
  const asOf = state.task ? state.task.stateAsOf : state.summary?.asOf;
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
  const made = await script(
    $,
    state.task ? ["view", "bundle", "--record", state.task.record] : ["view", "bundle", "--session"],
  );
  if (made.exitCode !== 0) return withMessage(await next(e), unmade($, state, made));
  // The bundle replaces the conversation: a checkpoint --compact waiting for this is answered, whoever compacted.
  if (state.compact && !state.compact.done) await answered($, state.compact);
  if (!state.task)
    await $.process.run([
      "node",
      "-e",
      "require('node:fs').rmSync(process.argv[1], { force: true })",
      state.summary.path,
    ]);
  return ownMessages(made.stdout);
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

/**
 * Reads `enabled` for the session's folder again; it stays as it was when the script fails or a file is invalid.
 * @param {any} $
 */
async function resolveEnabled($) {
  const result = await settings($, ["get", "enabled"]);
  if (result.ok && typeof result.data.value === "boolean") enabled = result.data.value;
  const events = await settings($, ["get", "events.enabled"]);
  if (events.ok && typeof events.data.value === "boolean") eventsOn = events.data.value;
  await resolveGovernor($);
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
  "review.mode",
  "review.model",
  "governor.mode",
  "governor.cap",
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
  return [
    `Freeflow settings for ${data.root} (Claude Code)`,
    ...rows.map(
      (/** @type {any} */ row) =>
        `  ${row.label.padEnd(width)}  ${shown(row.value).padEnd(8)}  ${SCOPE_NAMES[row.scope]}${SECTION_ROWS.has(row.key) ? "" : `  (${row.key})`}`,
    ),
    COMMAND_USAGE,
    "Keys: enabled, prompts.enabled, prompts.<prompt>, skills.enabled, skills.<skill>, events.enabled, review.mode, review.model, governor.mode, governor.cap.",
    "Pi-only settings (tool execution, compaction, messaging, Cognitive Routing) are changed on Pi or in the files.",
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
      text: "Freeflow on Claude Code: /freeflow settings lists Freeflow's settings and changes one; /freeflow capabilities says what Freeflow can do in this session.",
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
    const result = await settings($, ["list"]);
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
  const wasOn = enabled;
  if (data.key === "enabled" || data.key === "events.enabled") {
    await resolveEnabled($);
    // The claims follow the switch: off, every request is no; the event log's own off, sensors is only possible.
    await writeCapabilities($, freeflowHome);
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
 * Reads `governor.mode` and `governor.cap` with one settings run; each stays as it was when the script fails.
 * @param {any} $
 */
async function resolveGovernor($) {
  const result = await settings($, ["list"]);
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

/** @param {import("claude-code").On} on */
export function register(on) {
  // The session is ready, or the module reloaded: declare /freeflow, and read whether Freeflow is on for this folder.
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "freeflow",
      description:
        "Freeflow's settings: list them, or change one for this session, you or the repository; and what Freeflow can do here",
      argumentHint: "settings [<key> <value|inherit> [--session | --personal | --repository]] | capabilities",
    });
    // A -p run or the SDK has no one at the prompt, so nothing runs between its turns (section 4.5). Claims written
    // before this event came, at the classic SessionStart, are written again with what it says.
    const was = interactive;
    if (typeof e.isInteractive === "boolean") interactive = e.isInteractive;
    await resolveEnabled($);
    if (interactive !== was && freeflowHome && enabled) await writeCapabilities($, freeflowHome);
    return next(e);
  });

  on("command.run", { command: "freeflow" }, ($, e) =>
    /^\s*capabilities\b/.test(e.args ?? "") ? capabilitiesCommand($) : settingsCommand($, e.args),
  );

  // Session start, /clear and resume: pull the store, give the scripts the window, and give the agent the menu, which
  // says which task this session holds, taken back when a resume finds the task its end released (Spec section 4, F36).
  on("classic.SessionStart", async ($, e, next) => {
    const result = await next(e);
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
    await writeCapabilities($, freeflowHome);
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
    turnsOf.set(agent, (turnsOf.get(agent) ?? 0) + 1);
    await emit($, "turn.start", { turn: turnsOf.get(agent) }, agent);
    return next(e);
  });

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
  on("tool.check", async ($, e, next) => {
    const verdict = await next(e);
    if (!enabled || verdict.decision !== "ask" || !FILE_TOOLS.has(e.tool)) return verdict;
    const input = /** @type {Record<string, unknown>} */ (e.input ?? {});
    const root = await storeRootOf($);
    if (!root) return verdict;
    const real = await placed($, input.file_path ?? input.notebook_path ?? input.path);
    const inside = real !== undefined && (real === root || real.startsWith(root + separatorOf(root)));
    return inside ? { decision: /** @type {const} */ ("allow"), reason: STORE_REASON } : verdict;
  });

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
      !state || (!state.task && !state.summary)
        ? await next(e)
        : checkpointDone(state)
          ? await ownCompaction($, e, next, state)
          : state.task
            ? await fallbackCompaction($, e, next, state)
            : await next(e);
    // Every compaction of the main conversation starts the next cycle, Claude's own without a task included.
    if (!result.skip) {
      const ours = Boolean(state) && (state.task || state.summary) && checkpointDone(state);
      await emit($, "compaction", {
        trigger: typeof e.trigger === "string" ? e.trigger : undefined,
        by: ours ? "freeflow" : "harness",
        before: Number.isInteger(before) ? before : undefined,
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
      else if (state?.changed) await script($, ["store", "sync"], options);
    } catch (error) {
      $.ui.log(`Freeflow: ${error instanceof Error ? error.message : String(error)}`);
    }
    return next(e);
  });
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
  return {
    ...result,
    block: `Freeflow: ${checked.stderr.replace(/^Error: /, "").trim()} Write return.md as your brief says, then hand back.`,
  };
}
