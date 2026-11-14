#!/usr/bin/env node

// Freeflow's driver for Codex (SPEC-012): one script Codex runs on each hook event Freeflow uses, as
// `driver.mjs <event>` with the hook's input on stdin. It does what Claude Code's mod does where a Codex hook can carry
// it: the guidance and the task menu at session start, the task's bundle after Codex compacts, the context rows and the
// checkpoint notice from each model request's token usage, the event log, the store's sync at a turn's end and the hold
// released at the session's end. What happens to a task's memory stays Track Work's script's.
//
// Each run is its own process, so what lasts between events lives in the Freeflow home, beside the session's other
// files (never synced): sessions/<session>/cycle.json (the context cycle, its notice and rows, the window), due.json (a
// row or notice waiting for the next hook that can add context), events-buffer.jsonl (event lines until a turn ends)
// and calls/ (when each tool call started). Every handler fails open: on an error it prints nothing, Codex goes on, and
// a `freeflow` line in the event log says what failed. The one exception is PreToolUse's gates under `block`, which
// fail closed (SPEC-008, section 5).

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  DEFAULT_GATE_SETTINGS,
  FILE_WRITE_TOOLS,
  GATES,
  GATE_MODES,
  SHELL_TOOLS,
  decide,
  gateEvent,
  gateText,
  validGateState,
} from "../../skills/track-work/scripts/lib/gates5.mjs";
import { noticePoint as hostNoticePoint, rowAt } from "../../skills/track-work/scripts/lib/notice5.mjs";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = join(PLUGIN_ROOT, "skills/track-work/scripts/working-record.mjs");
export const DRIVER = "codex-driver";
const HARNESS = "codex"; // the event log's name for Codex (schema v1)
const HARNESS_NAME = "Codex"; // sessions.md's
const SESSION_ID = /^[A-Za-z0-9._-]+$/;

/**
 * How long each event's work may take, within the timeout hooks.json gives it (seconds there): a script run gets what
 * is left, so a slow store sync is cut short and the rest still answers.
 */
const BUDGET_MS = {
  SessionStart: 4_200,
  SessionStartCompact: 9_000,
  Stop: 9_000,
  SessionEnd: 2_600,
  default: 1_600,
};

/**
 * The window a model's conversation compacts against, by model name, for a Codex config that names none
 * (model_context_window); Codex's own defaults for these families. An unknown model has no rows and no notice.
 */
const KNOWN_WINDOWS = [
  [/^gpt-5/, 272_000],
  [/^codex-/, 200_000],
  [/^o[34]/, 200_000],
  [/^gpt-4\.1/, 1_047_576],
  [/^gpt-4o/, 128_000],
];

/** What a safe point is: where stopping loses nothing that is not written down (as on Claude Code and Pi). */
const SAFE_POINT =
  "a finished step whose result you know (a check run and read, a set of edits complete, a report written), not mid-edit or with a command still running";

// ---------------------------------------------------------------------------------------------------------------
// The session's files

/** @param {any} ctx */
const sessionDir = (ctx) => join(ctx.home, "sessions", ctx.session);
/** @param {any} ctx @param {string} name */
const fileOf = (ctx, name) => join(sessionDir(ctx), name);

/** @param {string} path */
function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** Writes whole, through a file beside it, so a reader never sees half of it. @param {string} path */
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

/**
 * The session's driver state: whether Freeflow and its event log are on (resolved at session start), whether a store
 * was there, the window and Codex's compaction limit, the turns counted, and lines a failed flush dropped.
 * @param {any} ctx
 */
const readState = (ctx) => readJson(fileOf(ctx, "codex.json"), null);
/** @param {any} ctx @param {Record<string, unknown>} changes */
function updateState(ctx, changes) {
  const state = { ...(readState(ctx) ?? {}), ...changes };
  writeJson(fileOf(ctx, "codex.json"), state);
  return state;
}

/**
 * The context cycle (as Claude Code's mod keeps it, in the same file): its number, when it started, its one notice and
 * the highest row shown in it; a resumed session keeps its number.
 * @param {any} ctx
 */
function readCycle(ctx) {
  const kept = readJson(fileOf(ctx, "cycle.json"), {});
  return {
    cycle: Number(kept?.cycle) || 1,
    startedAt: Number(kept?.startedAt) || Date.now(),
    notice: typeof kept?.notice === "number" ? kept.notice : null,
    row: Number(kept?.row) || 0,
  };
}
/** @param {any} ctx @param {{ cycle: number, startedAt: number, notice: number | null, row: number }} cycle */
const writeCycle = (ctx, cycle) => writeJson(fileOf(ctx, "cycle.json"), cycle);

// ---------------------------------------------------------------------------------------------------------------
// The event log (SPEC-006): one schema v1 line per loop event, never contents. A line is appended to the session's
// buffer with a plain append (one writer per session, one line per write); a turn's end moves the buffer through
// Track Work's `events append` in one run, so no tool call starts the event writer.

/**
 * Keeps one event line for the next flush, while Freeflow and its event log are on.
 * @param {any} ctx
 * @param {string} kind
 * @param {Record<string, unknown>} fields
 * @param {string} [agent]
 */
function emit(ctx, kind, fields, agent = "main") {
  const state = ctx.state ?? readState(ctx);
  if (state && (state.enabled === false || state.events === false)) return;
  const line = {
    v: 1,
    ts: new Date().toISOString(),
    session: ctx.session,
    harness: HARNESS,
    agent,
    kind,
    ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)),
  };
  mkdirSync(sessionDir(ctx), { recursive: true });
  appendFileSync(fileOf(ctx, "events-buffer.jsonl"), `${JSON.stringify(line)}\n`);
}

/**
 * Writes the waiting lines with one `events append` run; a run that fails drops them, and the next says how many.
 * @param {any} ctx
 * @param {number} [timeoutMs]
 */
function flush(ctx, timeoutMs) {
  const buffer = fileOf(ctx, "events-buffer.jsonl");
  if (!existsSync(buffer)) return;
  // Taken aside first, so lines a hook appends meanwhile wait for the next flush.
  const taken = `${buffer}.${process.pid}.flushing`;
  renameSync(buffer, taken);
  try {
    const lines = readFileSync(taken, "utf8")
      .split("\n")
      .filter((line) => line.trim());
    if (!lines.length) return;
    const state = readState(ctx) ?? {};
    const first = JSON.parse(lines[0]);
    const note = state.dropped
      ? [
          JSON.stringify({
            v: 1,
            ts: first.ts,
            session: ctx.session,
            harness: HARNESS,
            agent: "main",
            kind: "freeflow",
            what: "dropped",
            dropped: state.dropped,
          }),
        ]
      : [];
    const run = script(ctx, ["events", "append", "--input", "-"], {
      input: [...note, ...lines].join("\n"),
      timeoutMs,
    });
    const ok = run.status === 0;
    if (ok && state.dropped) updateState(ctx, { dropped: 0 });
    if (!ok) updateState(ctx, { dropped: (state.dropped ?? 0) + lines.length });
  } finally {
    rmSync(taken, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Track Work's script, run for this session

/**
 * Runs Track Work's script as the session's own commands run it: the session from the hook's input, the harness named,
 * and the way back to it. Claude Code's variables are left out, so a Codex started from a Claude Code shell is not
 * taken for that session. Never throws; a run past the event's budget is stopped.
 * @param {any} ctx
 * @param {string[]} args
 * @param {{ input?: string, timeoutMs?: number }} [options]
 */
function script(ctx, args, { input, timeoutMs } = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_CODE_REMOTE_SESSION_ID;
  delete env.CLAUDECODE;
  Object.assign(env, {
    FREEFLOW_SESSION: ctx.session,
    FREEFLOW_HARNESS: HARNESS_NAME,
    FREEFLOW_RESUME: `codex resume ${ctx.session}`,
    FREEFLOW_HOME: ctx.home,
  });
  if (ctx.window) env.FREEFLOW_CONTEXT_WINDOW = String(ctx.window);
  if (ctx.window)
    env.FREEFLOW_NOTICE_POINT = String(hostNoticePoint({ window: ctx.window, hostPoint: ctx.limit ?? null }));
  const left = Math.max(1, ctx.deadline - Date.now());
  const run = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: existsSync(ctx.cwd) ? ctx.cwd : undefined,
    env,
    input: input ?? "",
    encoding: "utf8",
    timeout: Math.min(timeoutMs ?? left, left),
    killSignal: "SIGKILL",
  });
  return {
    status: run.status ?? (run.error ? -1 : 1),
    stdout: run.stdout ?? "",
    stderr: run.stderr || (run.error ? String(run.error.message) : ""),
  };
}

/** Session status as the script prints it, a store or not, or null where it cannot be read. @param {any} ctx */
function sessionStatus(ctx, timeoutMs) {
  const run = script(ctx, ["session", "status"], { timeoutMs });
  if (run.status !== 0) return null;
  try {
    return JSON.parse(run.stdout);
  } catch {
    return null;
  }
}

/** What keeps the session from a working store, for the agent to relay or fix (P94). @param {any} found */
const missingText = (found) =>
  (found?.missing ?? []).map(
    (/** @type {{ what: string, fix: string, by: string }} */ part) =>
      `- Missing: ${part.what}. Fix (${part.by === "user" ? "the user" : "the agent"}): ${part.fix}.`,
  );

// ---------------------------------------------------------------------------------------------------------------
// Settings and the window

/**
 * Whether Freeflow and its event log are on for the session's folder: Session, then Personal, then Repository, then
 * the default, as the settings script resolves them. A file that cannot be used contributes what it keeps; the
 * settings it ignores are named by the guidance, which is how the session says so (D-045).
 * @param {string} root
 * @param {any} ctx
 */
async function resolveSwitches(root, ctx) {
  const store = await import(pathToFileURL(join(PLUGIN_ROOT, "pi-extension/dist/host/config-store.js")).href);
  const validation = await import(pathToFileURL(join(PLUGIN_ROOT, "pi-extension/dist/host/config-validation.js")).href);
  const repository = store.readConfigFile(root, "repository");
  const personal = store.readConfigFile(root, "personal");
  const layers = {
    repository: repository.value,
    personal: personal.value,
    session: store.readSessionSettings(ctx.home, ctx.session),
  };
  const value = (/** @type {string} */ key) => store.resolveSetting(validation.settingSpec(key), layers).value;
  return {
    enabled: value("enabled") !== false,
    events: value("events.enabled") !== false,
    gates: Object.fromEntries(GATES.map((gate) => [gate, value(`gates.${gate}`)])),
  };
}

/**
 * The top-level keys of a Codex config.toml this driver reads (numbers and strings before the first table).
 * @param {string} path
 */
function codexConfig(path) {
  /** @type {Record<string, string | number>} */
  const found = {};
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return found;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) break;
    const match = /^([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([0-9_]+))\s*(?:#.*)?$/.exec(line);
    if (!match) continue;
    found[match[1]] = match[4] !== undefined ? Number(match[4].replace(/_/g, "")) : (match[2] ?? match[3]);
  }
  return found;
}

/**
 * The window the conversation compacts against and where Codex's own compaction starts: model_context_window and
 * model_auto_compact_token_limit from Codex's config (the project's .codex/config.toml over CODEX_HOME's), else the
 * model's window this driver knows, else none.
 * @param {string} cwd
 * @param {string | undefined} model
 * @param {NodeJS.ProcessEnv} env
 */
export function codexWindow(cwd, model, env = process.env) {
  const user = codexConfig(join(env.CODEX_HOME || join(homedir(), ".codex"), "config.toml"));
  const project = codexConfig(join(cwd, ".codex", "config.toml"));
  const config = { ...user, ...project };
  const named = typeof config.model === "string" ? config.model : model;
  const known = KNOWN_WINDOWS.find(([pattern]) => pattern.test(String(model ?? named ?? "")))?.[1] ?? null;
  const window = Number.isInteger(config.model_context_window) ? Number(config.model_context_window) : known;
  const limit = Number.isInteger(config.model_auto_compact_token_limit)
    ? Number(config.model_auto_compact_token_limit)
    : null;
  return { window: window && window > 0 ? window : null, limit: limit && limit > 0 ? limit : null };
}

/** Where the notice comes, in tokens: a lead before Codex's compaction limit, or 75% of the window where it is not known. */
export const noticePoint = (/** @type {number} */ window, /** @type {number | null} */ limit) =>
  hostNoticePoint({ window, hostPoint: limit });

const share = (/** @type {number} */ tokens, /** @type {number} */ window) =>
  `${Math.round((100 * tokens) / window)}% of its window (${tokens} of ${window} tokens)`;

// ---------------------------------------------------------------------------------------------------------------
// Claims (SPEC-006 4.5, SPEC-012 4.2)

/**
 * The requests this driver claims: yes for what it carries out today (each with a conformance test), possible for
 * what Codex's hooks offer and Freeflow does not use yet, no for what no Codex hook carries.
 * @param {boolean} eventsOn
 */
export function claims(eventsOn) {
  const claim = (/** @type {string} */ value, /** @type {string} */ how) => ({ claim: value, how });
  return {
    pin: claim("yes", "session-start context, again after each compaction (SessionStart, source compact)"),
    inject: claim("yes", "context added after a tool call or at a prompt (additionalContext)"),
    forget: claim("no", "no Codex hook removes or rewrites stored history"),
    compact: claim(
      "no",
      "Codex compacts on its own (model_auto_compact_token_limit, model_post_turn_compact_threshold_percent or /compact); after it, the bundle is added",
    ),
    checkpoint: claim("yes", "through Track Work's script"),
    rewind: claim("no", "no Codex hook rewinds; /fork and /resume are the user's"),
    route: claim("no", "no Codex hook changes the model or effort"),
    spawn: claim("no", "SubagentStart observes a subagent; no hook starts one"),
    send: claim("no", "no Codex hook addresses another session or agent"),
    wake: claim("no", "nothing runs in an idle Codex session until the next prompt"),
    ask: claim("no", "no Codex hook asks the user; the agent asks in its reply"),
    block: claim(
      "yes",
      "PreToolUse denies a gate's call under block (gates.*), with the reason; not hosted tools such as web search",
    ),
    sensors: eventsOn
      ? claim("yes", "tool calls, model requests with token usage, compactions, workers, written to the event log")
      : claim("possible", "the event log is off (events.enabled)"),
    timers: claim("no", "Codex has no timer event"),
  };
}

/**
 * Writes this session's claims to <home>/sessions/<session>/capabilities.json, which capabilities.mjs and Track
 * Work's checkpoint --compact read; with Freeflow off, every request is no.
 * @param {any} ctx
 * @param {{ enabled: boolean, events: boolean }} switches
 */
function writeCapabilities(ctx, switches) {
  const version = readJson(join(PLUGIN_ROOT, "package.json"), {})?.version ?? null;
  const all = claims(switches.events);
  const off = Object.fromEntries(
    Object.keys(all).map((request) => [request, { claim: "no", how: "Freeflow is off in this session (enabled)" }]),
  );
  writeJson(fileOf(ctx, "capabilities.json"), {
    v: 1,
    requestSet: 1,
    driver: DRIVER,
    freeflow: version,
    enabled: switches.enabled,
    events: switches.enabled && switches.events,
    claims: switches.enabled ? all : off,
  });
  emit(ctx, "freeflow", { what: "capabilities" });
}

// ---------------------------------------------------------------------------------------------------------------
// Rows and the notice

/**
 * The checkpoint notice, once a cycle at the notice point: work on to a safe point, checkpoint, end the turn. Codex
 * compacts on its own, so the notice asks for no compaction; after Codex's, the bundle follows its summary.
 * @param {any} found session status
 */
function noticeText(found, tokens, window, limit, number) {
  const command = `node ${SCRIPT}`;
  const at = limit ? `; Codex compacts on its own at about ${limit} tokens` : "";
  const checkpoint = found?.task
    ? `At that point, checkpoint ${found.task.id}: bring ${found.task.id}'s Current Context up to date, adjust the rest of Current Work and Future Work, save as blocks any discussion in this cycle that shaped the work and is not saved yet (discussion list, discussion save; skip it when there was none), then run ${command} checkpoint --record ${found.task.id} --input - with In flight's lines.`
    : `This session holds no task: at that point, write its summary with ${command} checkpoint --session --input - (Goal, Settled, Open, Agreement, In flight, Recovery, Next action).`;
  return `Freeflow, context cycle ${number}: compaction is near. The context is at ${share(tokens, window)}${at}. Keep working until a safe point: ${SAFE_POINT}. If your work ends within a step or two, finish it first. ${checkpoint} Then end your turn. When Codex compacts, Freeflow adds the record as of that checkpoint after Codex's summary. This is the only notice this context cycle.`;
}

/**
 * After a model request of the main conversation: below the notice point, a row at the highest of ROWS_AT crossed,
 * once each a cycle; at it, the cycle's notice. Both wait in due.json for the next hook that can add context.
 * @param {any} ctx
 * @param {number} tokens
 */
function watch(ctx, tokens) {
  const state = ctx.state;
  if (!state?.store || !state.window) return;
  const window = state.window;
  const cycle = readCycle(ctx);
  if (cycle.notice !== null) return;
  const point = noticePoint(window, state.limit ?? null);
  if (tokens < point) {
    const row = rowAt(tokens, window, point);
    if (!row || row <= cycle.row) return;
    writeCycle(ctx, { ...cycle, row });
    writeJson(fileOf(ctx, "due.json"), {
      what: "row",
      detail: `cycle ${cycle.cycle}, ${Math.round(row * 100)}%`,
      text: `Freeflow, context cycle ${cycle.cycle}: the context is at ${share(tokens, window)}; the checkpoint notice comes at about ${Math.round(point)} tokens.`,
    });
    return;
  }
  const found = sessionStatus(ctx);
  writeCycle(ctx, { ...cycle, notice: Date.now() });
  writeJson(fileOf(ctx, "due.json"), {
    what: "notice",
    detail: `cycle ${cycle.cycle}`,
    text: noticeText(found, tokens, window, state.limit ?? null, cycle.cycle),
  });
}

/**
 * The row or notice waiting, taken by one hook only (a rename is atomic), or null.
 * @param {any} ctx
 * @returns {string | null}
 */
function takeDue(ctx) {
  const path = fileOf(ctx, "due.json");
  if (!existsSync(path)) return null;
  const taken = `${path}.${process.pid}`;
  try {
    renameSync(path, taken);
  } catch {
    return null;
  }
  const due = readJson(taken, null);
  rmSync(taken, { force: true });
  if (!due?.text) return null;
  emit(ctx, "freeflow", { what: due.what === "notice" ? "notice" : "row", detail: due.detail });
  return due.text;
}

// ---------------------------------------------------------------------------------------------------------------
// Tool calls

/**
 * The paths a call names: a file tool's path fields, and the files an apply_patch adds, updates, deletes or moves to;
 * relative to the session's folder when inside it. Never the patch's content.
 * @param {string} tool
 * @param {any} input
 * @param {string} cwd
 */
export function toolPaths(tool, input, cwd) {
  if (!input || typeof input !== "object") return [];
  const named = [input.file_path, input.path, input.notebook_path].filter(
    (value) => typeof value === "string" && value !== "",
  );
  if (tool === "apply_patch" && typeof input.command === "string")
    for (const match of input.command.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm))
      named.push(match[1].trim());
  const base = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return [...new Set(named.map((path) => (path.startsWith(base) ? path.slice(base.length) : path)))]
    .filter((path) => path !== "" && path.length <= 1024 && !/[\0\n\r]/.test(path))
    .slice(0, 64);
}

/** A shell call's command text, which the writer redacts and cuts. @param {string} tool @param {any} input */
function commandOf(tool, input) {
  if (tool !== "Bash" || !input) return undefined;
  const command = input.command;
  if (typeof command === "string") return command;
  if (Array.isArray(command) && command.every((part) => typeof part === "string"))
    return command.length === 3 && /^-l?c$/.test(command[1]) ? command[2] : command.join(" ");
  return undefined;
}

/** Whether the tool's response says it failed; Codex documents no exit code, so a plain output counts as ran. */
function failed(response) {
  if (!response || typeof response !== "object") return false;
  return response.success === false || response.isError === true || response.is_error === true;
}

/** @param {unknown} id */
const callFile = (ctx, id) =>
  typeof id === "string" && SESSION_ID.test(id) ? join(sessionDir(ctx), "calls", id) : null;

// ---------------------------------------------------------------------------------------------------------------
// The handlers

/** @param {string} additionalContext @param {string} eventName */
const context = (eventName, additionalContext) => ({
  hookSpecificOutput: { hookEventName: eventName, additionalContext },
});

/**
 * The guidance, as the session-start adapters render it for this folder and session.
 * @param {any} ctx
 */
async function guidance(ctx) {
  const shared = await import(pathToFileURL(join(PLUGIN_ROOT, "hooks/shared/runtime-context.mjs")).href);
  const root = shared.findWorkspaceRoot(ctx.cwd);
  return { root, text: shared.renderRuntimeContext(root, undefined, { session: ctx.session }) };
}

/**
 * SessionStart (startup, resume, clear, fork): the guidance, then the task menu with the store's rules, taking back
 * the task this session held when it ended (F36); the claims; a new context cycle.
 * @param {any} ctx
 */
async function sessionStart(ctx) {
  if (ctx.input.source === "compact") return afterCompaction(ctx);
  const parts = [];
  let root = ctx.cwd;
  try {
    const rendered = await guidance(ctx);
    root = rendered.root;
    if (rendered.text.trim()) parts.push(rendered.text);
  } catch (error) {
    note(ctx, error);
  }
  try {
    await taskMemoryAtStart(ctx, root, parts);
  } catch (error) {
    note(ctx, error);
  }
  return parts.length ? context("SessionStart", parts.join("\n\n")) : null;
}

/**
 * The task memory half of session start; what it adds goes after the guidance in `parts`.
 * @param {any} ctx
 * @param {string} root
 * @param {string[]} parts
 */
async function taskMemoryAtStart(ctx, root, parts) {
  const switches = await resolveSwitches(root, ctx);
  const { window, limit } = codexWindow(ctx.cwd, ctx.input.model, ctx.env);
  ctx.window = window;
  ctx.limit = limit;
  ctx.state = updateState(ctx, { ...switches, window, limit, model: ctx.input.model ?? null, store: false });
  // Off, no line is kept (emit asks the state) and every claim is no.
  emit(ctx, "session.start", {
    source: ["startup", "resume", "clear", "fork"].includes(ctx.input.source) ? ctx.input.source : "startup",
  });
  writeCapabilities(ctx, switches);
  if (!switches.enabled) return;
  const kept = readCycle(ctx);
  writeCycle(ctx, { cycle: kept.cycle, startedAt: Date.now(), notice: null, row: 0 });
  rmSync(fileOf(ctx, "due.json"), { force: true });

  const found = sessionStatus(ctx, 1_200);
  const missing = missingText(found);
  if (found?.store) {
    ctx.state = updateState(ctx, { store: true });
    // Pushes what the last session's end committed and could not push (P3), else takes the remote's commits.
    script(ctx, found.changed ? ["store", "sync"] : ["store", "sync", "--pull"], { timeoutMs: 1_500 });
    const parent = dirname(ctx.cwd);
    const menu = script(ctx, [
      "task",
      "here",
      "--cwd",
      ctx.cwd,
      "--scan",
      [ctx.cwd, parent, PLUGIN_ROOT].join(delimiter),
      "--rules",
      "--take-back",
    ]);
    if (menu.status === 0) {
      emit(ctx, "freeflow", { what: "menu" });
      parts.push(`Freeflow task memory:\n${[menu.stdout.trimEnd(), ...missing].join("\n")}\n`);
    }
  } else if (missing.length) parts.push(`Freeflow task memory: the store is not ready.\n${missing.join("\n")}`);
}

/**
 * Whether the checkpoint this cycle asked for is done: the record's State as of, or the summary's time, is later than
 * the cycle's notice, or than its start when no notice came (T12, P68).
 * @param {any} found session status
 * @param {{ startedAt: number, notice: number | null }} cycle
 */
function checkpointDone(found, cycle) {
  const asOf = found.task ? found.task.stateAsOf : found.summary?.asOf;
  return Boolean(asOf) && Date.parse(asOf) > (cycle.notice ?? cycle.startedAt);
}

/**
 * SessionStart (compact): Codex's summary stands, and the guidance and the bundle follow it: the record as of the
 * checkpoint this cycle asked for, or, when Codex compacted first, the bundle as of the last checkpoint with a line
 * saying what it lacks. The cycle moves on.
 * @param {any} ctx
 */
async function afterCompaction(ctx) {
  const parts = [];
  try {
    const rendered = await guidance(ctx);
    if (rendered.text.trim()) parts.push(rendered.text);
  } catch (error) {
    note(ctx, error);
  }
  try {
    if (ctx.state?.enabled !== false) bundleAfterCompaction(ctx, parts);
  } catch (error) {
    note(ctx, error);
  }
  return parts.length ? context("SessionStart", parts.join("\n\n")) : null;
}

/**
 * The cycle moved on, and the bundle that follows Codex's summary, added to `parts`.
 * @param {any} ctx
 * @param {string[]} parts
 */
function bundleAfterCompaction(ctx, parts) {
  const state = ctx.state;
  const cycle = readCycle(ctx);
  const compacting = state?.compacting ?? null;
  emit(ctx, "session.start", { source: "compact" });
  emit(ctx, "compaction", {
    trigger: typeof compacting?.trigger === "string" && compacting.trigger ? compacting.trigger : undefined,
    by: "harness",
  });
  ctx.state = updateState(ctx, { compacting: null });
  writeCycle(ctx, { cycle: cycle.cycle + 1, startedAt: Date.now(), notice: null, row: 0 });
  rmSync(fileOf(ctx, "due.json"), { force: true });

  const found = state?.store === false ? null : sessionStatus(ctx, 2_000);
  if (found?.store && (found.task || found.summary)) {
    const done = checkpointDone(found, cycle);
    if (found.task) {
      const made = script(ctx, ["view", "bundle", "--record", found.task.record, ...(done ? [] : ["--fallback"])]);
      if (made.status === 0)
        parts.push(
          done
            ? `Freeflow task memory, after Codex's compaction: ${found.task.id}'s record as of the checkpoint this cycle.\n\n${made.stdout.trimEnd()}`
            : `Freeflow task memory, after Codex's compaction: Codex compacted before a checkpoint in this cycle, so below is ${found.task.id}'s record as of its last checkpoint, ${found.task.stateAsOf}. Freeflow cannot read Codex's transcript: the user's messages since then are not in it ("None." below means not read). Read the record's In flight against what Codex's summary says; where they differ, the summary is later.\n\n${made.stdout.trimEnd()}`,
        );
      else
        parts.push(
          `Freeflow could not make ${found.task.id}'s bundle: ${
            made.stderr
              .replace(/^Error: /, "")
              .trim()
              .split("\n")[0]
          }. Its record, last checkpointed at ${found.task.stateAsOf}, is ${found.task.record}: mend what the error names, then run node ${SCRIPT} view recover --record ${found.task.id} and read what it lists.`,
        );
    } else if (done) {
      const made = script(ctx, ["view", "bundle", "--session"]);
      if (made.status === 0)
        parts.push(`Freeflow, after Codex's compaction: this session's summary.\n\n${made.stdout.trimEnd()}`);
    }
  }
}

/** UserPromptSubmit: a turn starts; a row or notice waiting reaches the model now. @param {any} ctx */
function userPromptSubmit(ctx) {
  const turn = (ctx.state?.turn ?? 0) + 1;
  ctx.state = updateState(ctx, { turn });
  emit(ctx, "turn.start", { turn });
  const due = takeDue(ctx);
  return due ? context("UserPromptSubmit", due) : null;
}

/**
 * PreToolUse: keeps when the call started, for the call's line, then the gates decide it (SPEC-008 4.3). An error in
 * keeping the start time loses only the line's `ms`; the gates still run.
 * @param {any} ctx
 */
function preToolUse(ctx) {
  try {
    const path = callFile(ctx, ctx.input.tool_use_id);
    if (path) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, String(Date.now()));
    }
  } catch (error) {
    note(ctx, error);
  }
  return gated(ctx);
}

// ---------------------------------------------------------------------------------------------------------------
// The gates (SPEC-008): Track Work's gates5.mjs decides each file-writing or shell call from the session's gate state,
// which Track Work's lifecycle commands write to sessions/<session>/gates.json; each gate's mode (gates.*) was resolved
// with enabled at session start. Under warn the call runs and the agent reads one row per gate per turn, as
// additionalContext; under block Codex refuses the call with the same text (permissionDecision: deny). Codex has no
// ask, so a delivery step under block is refused too. Each gate that fired leaves a `gate` line in the buffer.

/** The gates' modes as session start resolved them; a state from before gates.* existed gives the defaults. */
function gateModes(ctx) {
  const kept = ctx.state?.gates ?? {};
  return Object.fromEntries(
    GATES.map((gate) => [gate, GATE_MODES.includes(kept[gate]) ? kept[gate] : DEFAULT_GATE_SETTINGS[gate]]),
  );
}

/**
 * The session's gate state, read once for this call; null where it is missing or not a version this module reads,
 * said once a session in the event log.
 * @param {any} ctx
 */
function readGates(ctx) {
  const state = readJson(fileOf(ctx, "gates.json"), null);
  if (validGateState(state)) return state;
  if (!ctx.state?.gatesMissing) {
    ctx.state = updateState(ctx, { gatesMissing: true });
    emit(ctx, "freeflow", { what: "gates", detail: "no gate state for this session" });
  }
  return null;
}

/**
 * The gates among `fired` not yet warned in this loop's turn (its turn_id), marked warned now: one row per gate per
 * turn, for the main conversation and each subagent apart.
 * @param {any} ctx
 * @param {string} agent
 * @param {{ gate: string }[]} fired
 */
function firstWarnings(ctx, agent, fired) {
  const path = fileOf(ctx, "gates-warned.json");
  const warned = readJson(path, {}) ?? {};
  const turn =
    typeof ctx.input.turn_id === "string" && ctx.input.turn_id ? ctx.input.turn_id : String(ctx.state?.turn ?? 0);
  const kept = warned[agent]?.turn === turn ? warned[agent].gates : [];
  const fresh = fired.filter((each) => !kept.includes(each.gate));
  if (fresh.length)
    writeJson(path, { ...warned, [agent]: { turn, gates: [...kept, ...fresh.map((each) => each.gate)] } });
  return fresh;
}

/** Codex's refusal of a tool call: the reason reaches the model as the call's result. @param {string} reason */
const deny = (reason) => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
});

/**
 * The gates on one tool call: nothing printed where every gate allows; under warn, the rows not yet read this turn as
 * additionalContext; under block, a deny with each refusing gate's text. A failure is open under warn and closed
 * while any gate is at block (section 5); a hook Codex stops for its timeout is open, which no driver can change.
 * @param {any} ctx
 */
function gated(ctx) {
  const modes = gateModes(ctx);
  const tool = String(ctx.input.tool_name ?? "");
  if (!FILE_WRITE_TOOLS.has(tool) && !SHELL_TOOLS.has(tool)) return null;
  if (GATES.every((gate) => modes[gate] === "off")) return null;
  try {
    const input = ctx.input.tool_input;
    const result = decide(
      readGates(ctx),
      { tool, paths: toolPaths(tool, input, ctx.cwd), command: commandOf(tool, input), cwd: ctx.cwd, canAsk: false },
      modes,
    );
    if (result.decision === "allow") return null;
    const agent = agentOf(ctx);
    for (const fired of result.fired) emit(ctx, "gate", gateEvent(fired, tool), agent);
    if (result.decision === "warn") {
      const rows = firstWarnings(ctx, agent, result.fired).map((fired) => gateText(fired));
      return rows.length ? context("PreToolUse", rows.join("\n\n")) : null;
    }
    return deny(
      result.fired
        .filter((fired) => fired.decision !== "warn")
        .map((fired) => gateText(fired))
        .join("\n\n"),
    );
  } catch (error) {
    note(ctx, error);
    return Object.values(modes).includes("block")
      ? deny("Freeflow's gates could not decide this call; try again.")
      : null;
  }
}

/**
 * PostToolUse: the call's line (its tool, whether it failed, its time, the paths it names and a shell command's text);
 * a row or notice waiting reaches the model after the call's result.
 * @param {any} ctx
 */
function postToolUse(ctx) {
  const tool = String(ctx.input.tool_name ?? "");
  const input = ctx.input.tool_input;
  const started = callFile(ctx, ctx.input.tool_use_id);
  let ms;
  if (started && existsSync(started)) {
    const at = Number(readFileSync(started, "utf8"));
    if (Number.isFinite(at)) ms = Math.max(0, Date.now() - at);
    rmSync(started, { force: true });
  }
  const command = commandOf(tool, input);
  const paths = toolPaths(tool, input, ctx.cwd);
  const home = ctx.home.endsWith("/") ? ctx.home : `${ctx.home}/`;
  const ours =
    (command !== undefined && command.includes(`${PLUGIN_ROOT}/`)) ||
    paths.some((path) => `${path}/`.startsWith(home) || path.startsWith(home));
  if (tool)
    emit(
      ctx,
      "tool.call",
      {
        tool,
        ok: !failed(ctx.input.tool_response),
        ms,
        paths: paths.length ? paths : undefined,
        command,
        source: ours ? "freeflow" : "agent",
      },
      agentOf(ctx),
    );
  const due = agentOf(ctx) === "main" ? takeDue(ctx) : null;
  return due ? context("PostToolUse", due) : null;
}

/**
 * PostModelRequest: the request's line from its token usage, and for the main conversation the context's share
 * against the window: a row or the notice, waiting for the next hook that can add context.
 * @param {any} ctx
 */
function postModelRequest(ctx) {
  const usage = ctx.input.token_usage;
  const count = (/** @type {unknown} */ value) =>
    Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
  const valid = usage && typeof usage === "object" && count(usage.total_tokens) !== undefined;
  const input = valid ? count(usage.input_tokens) : undefined;
  const cached = valid ? count(usage.cached_input_tokens) : undefined;
  const model = typeof ctx.input.model === "string" && ctx.input.model ? ctx.input.model : "unknown";
  emit(
    ctx,
    "model.request",
    {
      model,
      effort: null,
      in: input !== undefined ? Math.max(0, input - (cached ?? 0)) : undefined,
      out: valid ? count(usage.output_tokens) : undefined,
      cacheRead: cached,
      cacheWrite: valid && count(usage.cache_write_input_tokens) ? count(usage.cache_write_input_tokens) : undefined,
      context: valid ? count(usage.total_tokens) : undefined,
      stop: typeof ctx.input.status === "string" && ctx.input.status ? ctx.input.status : undefined,
    },
    agentOf(ctx),
  );
  if (agentOf(ctx) !== "main" || ctx.input.status !== "completed") return null;
  if (!valid) {
    // No usage, or a shape this driver does not know: no row, no notice, and the log says so once a session.
    if (!ctx.state?.usageMissing) {
      ctx.state = updateState(ctx, { usageMissing: true });
      emit(ctx, "freeflow", { what: "error", detail: "PostModelRequest: no token_usage this driver reads" });
    }
    return null;
  }
  if (ctx.state && ctx.state.model !== model) {
    const { window, limit } = codexWindow(ctx.cwd, model, ctx.env);
    ctx.window = window;
    ctx.limit = limit;
    ctx.state = updateState(ctx, { model, window, limit });
  }
  watch(ctx, Number(usage.total_tokens));
  return null;
}

/** PreCompact and PostCompact: what started the compaction, so the next SessionStart (compact) names it. @param {any} ctx */
function compactEvent(ctx) {
  if (agentOf(ctx) !== "main") return null;
  const trigger = ["manual", "auto"].includes(ctx.input.trigger) ? ctx.input.trigger : undefined;
  ctx.state = updateState(ctx, {
    compacting: {
      trigger: trigger ?? ctx.state?.compacting?.trigger ?? null,
      at: Date.now(),
      done: ctx.event === "PostCompact",
    },
  });
  return null;
}

/** SubagentStart and SubagentStop: a worker's lines. @param {any} ctx */
function subagent(ctx) {
  const agent = typeof ctx.input.agent_id === "string" && ctx.input.agent_id ? ctx.input.agent_id : "main";
  if (ctx.event === "SubagentStart")
    emit(
      ctx,
      "agent.spawn",
      { model: typeof ctx.input.model === "string" && ctx.input.model ? ctx.input.model : undefined },
      agent,
    );
  else emit(ctx, "agent.stop", { blocked: false }, agent);
  return null;
}

/** Stop: the turn's end; the store synced when it changed; the turn's lines written in one run. @param {any} ctx */
function stop(ctx) {
  if (agentOf(ctx) !== "main") return null;
  emit(ctx, "turn.end", { turn: ctx.state?.turn ?? undefined });
  if (ctx.state?.store) {
    const found = sessionStatus(ctx, 2_000);
    if (found?.store && found.changed) {
      script(ctx, ["store", "sync"], { timeoutMs: 5_000 });
      emit(ctx, "freeflow", { what: "sync" });
    }
  }
  flush(ctx, 2_000);
  rmSync(join(sessionDir(ctx), "calls"), { recursive: true, force: true });
  return null;
}

/**
 * SessionEnd: the last lines, then the hold released as ended, on this machine only (Codex gives this hook 1 to 3
 * seconds); the next session start pushes it, and a resume of this session takes the task back (F36).
 * @param {any} ctx
 */
function sessionEnd(ctx) {
  emit(ctx, "session.end", {
    reason: typeof ctx.input.reason === "string" && ctx.input.reason ? ctx.input.reason : undefined,
  });
  flush(ctx, 900);
  if (ctx.state?.store) script(ctx, ["task", "release", "--ended", "--no-push"]);
  return null;
}

/** @param {any} ctx */
const agentOf = (ctx) =>
  typeof ctx.input.agent_id === "string" && ctx.input.agent_id && ctx.event !== "SubagentStart"
    ? ctx.input.agent_id
    : "main";

/** A `freeflow` line saying what failed; never throws. @param {any} ctx @param {unknown} error */
function note(ctx, error) {
  try {
    const message = error instanceof Error ? error.message : String(error);
    emit(ctx, "freeflow", { what: "error", detail: `${ctx.event}: ${message}`.slice(0, 200) });
  } catch {
    // The log is a sensor, and a sensor fails open.
  }
}

const HANDLERS = /** @type {Record<string, (ctx: any) => any>} */ ({
  SessionStart: sessionStart,
  UserPromptSubmit: userPromptSubmit,
  PreToolUse: preToolUse,
  PostToolUse: postToolUse,
  PostModelRequest: postModelRequest,
  PreCompact: compactEvent,
  PostCompact: compactEvent,
  SubagentStart: subagent,
  SubagentStop: subagent,
  Stop: stop,
  SessionEnd: sessionEnd,
});
export const EVENTS = Object.keys(HANDLERS);

/**
 * Answers one hook event: the output Codex reads, or null for none. Nothing runs with
 * FREEFLOW_DISABLE_RUNTIME_CONTEXT=1, and without a session ID only the guidance does.
 * @param {string} event
 * @param {any} input
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function handle(event, input, env = process.env) {
  const handler = HANDLERS[event];
  if (!handler || env.FREEFLOW_DISABLE_RUNTIME_CONTEXT === "1") return null;
  const session = typeof input?.session_id === "string" && SESSION_ID.test(input.session_id) ? input.session_id : null;
  // Codex always names its session; an input that names none gets the guidance at session start and nothing else.
  if (!session) {
    if (event !== "SessionStart") return null;
    const { text } = await guidance({ cwd: typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd() });
    return text.trim() ? context("SessionStart", text) : null;
  }
  const budget =
    event === "SessionStart"
      ? input.source === "compact"
        ? BUDGET_MS.SessionStartCompact
        : BUDGET_MS.SessionStart
      : (BUDGET_MS[event] ?? BUDGET_MS.default);
  const ctx = {
    event,
    input,
    env,
    session,
    home: resolve(env.FREEFLOW_HOME || join(homedir(), ".freeflow")),
    cwd: typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd(),
    deadline: Date.now() + budget,
    state: null,
    window: null,
  };
  try {
    ctx.state = readState(ctx);
    // Off for this session (enabled, at its start): only the guidance, which the renderer decides.
    if (ctx.state?.enabled === false && event !== "SessionStart") return null;
    // No session start ran (its hook not trusted, say): the switches are read once here.
    if (!ctx.state && event !== "SessionStart") {
      const shared = await import(pathToFileURL(join(PLUGIN_ROOT, "hooks/shared/runtime-context.mjs")).href);
      ctx.state = updateState(ctx, {
        ...(await resolveSwitches(shared.findWorkspaceRoot(ctx.cwd), ctx)),
        store: false,
      });
      if (ctx.state.enabled === false) return null;
    }
    ctx.window = ctx.state?.window ?? null;
    return await handler(ctx);
  } catch (error) {
    note(ctx, error);
    return null;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  // Read as a stream: a synchronous read of a pipe the host has not written yet fails with EAGAIN.
  let raw = "";
  try {
    for await (const chunk of process.stdin) raw += chunk;
  } catch {
    return;
  }
  let input = {};
  try {
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return;
  }
  const event = argv[0] || input.hook_event_name || "";
  const output = await handle(event, input, env);
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
}

/** Whether this file is the script Node runs: real paths, since a host may run the plugin through a symlink. */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain())
  main().catch(() => {
    // Fails open: Codex goes on with nothing from this hook.
  });
