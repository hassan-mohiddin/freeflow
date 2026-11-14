// The event log (SPEC-006, sections 4.1 to 4.4): what happens in a session's loop, one JSON object per line, in one
// schema for every Freeflow driver. The drivers (Claude Code's mod, the Pi extension, Codex's driver) hand their lines to
// `events append`, which checks each against schema v1, redacts and cuts a shell command, sets `seq` under a lock on the
// file and appends; one writer keeps the schema in one place (T1). The log lives on this machine only, in
// `<FREEFLOW_HOME>/events/<session>.jsonl`, which the store's Git ignores (P1); a checkpoint and a release write a short
// summary of it into the held task's folder, `events/<session>.json`, which the store commits (P7). A line never holds
// a prompt, an answer, a file's content or a tool's output (P4): the writer refuses any field schema v1 does not name.
// Readers ignore a kind or field they do not know, so a later minor version may add both.

import { existsSync, readFileSync, statSync } from "node:fs";
import { appendFile, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { GATES } from "./gates5.mjs";
import { isFreeflowStore } from "./store.mjs";

/** The schema's major version; readers accept it and the one before (there is none before 1). */
export const EVENT_VERSION = 1;
export const EVENTS_FOLDER = "events";
export const HARNESSES = ["claude-code", "pi", "codex"];
/** How long a shell command's text may be once redacted (P4). */
export const COMMAND_LIMIT = 200;
/** Every line has these, set by its driver; `seq` alone is the writer's. */
const COMMON = ["v", "ts", "seq", "session", "harness", "agent", "kind"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TEXT_LIMIT = 200;
const PATH_LIMIT = 1024;
const PATHS_LIMIT = 64;

const count = (value) => Number.isInteger(value) && value >= 0;
const text = (value) => typeof value === "string" && value.trim() !== "" && value.length <= TEXT_LIMIT;
const oneOf = (values) => (value) => values.includes(value);
const boolean = (value) => typeof value === "boolean";
const nullable = (check) => (value) => value === null || check(value);
const amount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
/**
 * The cost governor's caps (SPEC-014, section 2.3): the seven-day window's daily pace, the seven-day window at the
 * `governor.cap` percent, and the task's cost (its plan's high end, or `governor.cap` dollars). Its responses: a row at
 * 80% of a cap; at 100% a notice under `governor.mode` warn, the ask to stop under stop.
 */
export const GOVERNOR_CAPS = ["pace", "window", "task"];
export const GOVERNOR_RESPONSES = ["row", "notice", "ask"];

/**
 * Schema v1's kinds and the fields each takes beyond the common ones (section 4.1): `true` marks a required field.
 * A field a kind does not list is refused, so nothing a driver sees can slip into the log by accident.
 */
export const KINDS = {
  "session.start": {
    source: [oneOf(["startup", "resume", "clear", "compact", "fork"]), true],
    interactive: [boolean],
  },
  "session.end": { reason: [text] },
  "turn.start": { turn: [count] },
  "turn.end": { turn: [count], reason: [oneOf(["answer", "aborted", "refusal", "error"])], ms: [count] },
  "model.request": {
    model: [text, true],
    effort: [nullable(text)],
    in: [count],
    out: [count],
    cacheRead: [count],
    cacheWrite: [count],
    context: [count],
    stop: [text],
  },
  "tool.call": {
    tool: [text, true],
    ok: [boolean, true],
    exit: [Number.isInteger],
    ms: [count],
    paths: [(value) => Array.isArray(value) && value.length <= PATHS_LIMIT && value.every(isPath)],
    command: [(value) => typeof value === "string"],
    source: [oneOf(["freeflow", "agent"]), true],
  },
  // `cycle` (additive, schema v1): the context cycle that ended.
  compaction: {
    trigger: [text],
    by: [oneOf(["freeflow", "harness"]), true],
    before: [count],
    after: [count],
    cycle: [count],
  },
  "agent.spawn": { delegation: [(value) => /^D-\d{3,}(\.\d+)?$/.test(value)], model: [text] },
  "agent.stop": { blocked: [boolean] },
  // SPEC-008, additive to v1 (T3): a gate that did not allow a call, and an agreement `agree` recorded.
  gate: {
    gate: [oneOf(GATES), true],
    decision: [oneOf(["warn", "ask", "block"]), true],
    tool: [text, true],
    rule: [text],
  },
  agreement: { outcome: [(value) => typeof value === "string" && value.trim() !== "", true], exactSpec: [text] },
  // Additive to schema v1: `context` is the tokens of the request that crossed a notice or row (or that the checkpoint
  // was made in), `point` the notice point in tokens. `checkpoint` is Track Work's own line when a checkpoint is written.
  freeflow: {
    what: [
      oneOf(["notice", "row", "menu", "compact", "sync", "capabilities", "dropped", "error", "gates", "checkpoint"]),
      true,
    ],
    detail: [(value) => typeof value === "string"],
    dropped: [count],
    context: [count],
    point: [count],
  },
  // The cost governor: a cap, the use measured against it (both in percent of a window or in dollars), and its response.
  governor: {
    cap: [oneOf(GOVERNOR_CAPS), true],
    unit: [oneOf(["percent", "usd"]), true],
    limit: [amount, true],
    use: [amount, true],
    response: [oneOf(GOVERNOR_RESPONSES), true],
  },
};

function isPath(value) {
  return typeof value === "string" && value !== "" && value.length <= PATH_LIMIT && !/[\0\n\r]/.test(value);
}

/**
 * Keys and tokens in a shell command, replaced with `[redacted]` before it is written (section 4.3): API keys, GitHub,
 * Slack and AWS tokens, a bearer token, and the value of any `…key=`, `…token=`, `…secret=` or `…password=`.
 */
const SECRETS = [
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[redacted]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[redacted]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted]"],
  [/\bxox[abps]-[A-Za-z0-9-]{10,}/g, "[redacted]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]"],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]"],
  [/\b([A-Za-z0-9_-]*(?:key|token|secret|password))=("[^"]*"|'[^']*'|[^\s&;|]+)/gi, "$1=[redacted]"],
];

export function redact(value) {
  return SECRETS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

/**
 * A command cut at its first heredoc operator (`<<`, `<<-` or `<<<`), which is written as ` <<…`: the body of a heredoc
 * is a file's or a message's text, which the log never holds (P4), and a command's first 200 characters would hold it.
 */
export function cutHeredoc(value) {
  const at = value.search(/<</);
  return at < 0 ? value : `${value.slice(0, at).trimEnd()} <<…`;
}

/** Redacted first, so a cut never leaves part of a secret behind, then cut to `limit` characters. */
function redactAndCut(value, limit) {
  const clean = redact(value.replace(/\s+/g, " ").trim());
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

/**
 * Whether one line from a driver is a schema v1 line, before the writer sets its `seq`: the reason it is not, or
 * null. A `seq` the driver sent is ignored, since only the writer numbers a file's lines.
 */
export function lineProblem(line) {
  if (typeof line !== "object" || line === null || Array.isArray(line)) return "not a JSON object";
  if (line.v !== EVENT_VERSION) return `v must be ${EVENT_VERSION}`;
  if (typeof line.ts !== "string" || !ISO.test(line.ts) || Number.isNaN(Date.parse(line.ts)))
    return "ts must be an ISO 8601 UTC time with milliseconds";
  if (typeof line.session !== "string" || !SESSION_ID.test(line.session))
    return "session must be a session ID (letters, digits, dot, dash, underscore)";
  if (!HARNESSES.includes(line.harness)) return `harness must be one of ${HARNESSES.join(", ")}`;
  if (!text(line.agent)) return 'agent must be "main" or the worker\'s agent ID';
  const fields = KINDS[line.kind];
  if (!fields) return `kind must be one of ${Object.keys(KINDS).join(", ")}`;
  for (const key of Object.keys(line)) {
    if (COMMON.includes(key)) continue;
    const field = fields[key];
    if (!field) return `${line.kind} takes no field ${key}`;
    if (!field[0](line[key])) return `${line.kind}'s ${key} is not a value it takes`;
  }
  for (const [key, [, required]] of Object.entries(fields))
    if (required && line[key] === undefined) return `${line.kind} requires ${key}`;
  return null;
}

/** The free-text fields the writer redacts and cuts. */
const CUT = new Set(["command", "detail", "outcome", "exactSpec"]);

/** The line as written: its fields in schema order, the command, detail and an agreement's text redacted and cut. */
function normalize(line, seq) {
  const fields = KINDS[line.kind];
  const written = {
    v: line.v,
    ts: line.ts,
    seq,
    session: line.session,
    harness: line.harness,
    agent: line.agent,
    kind: line.kind,
  };
  for (const key of Object.keys(fields)) {
    if (line[key] === undefined) continue;
    // A command is cut at its heredoc before the length cut, so no body text is kept past its operator (P4).
    written[key] = CUT.has(key)
      ? redactAndCut(key === "command" ? cutHeredoc(line[key]) : line[key], COMMAND_LIMIT)
      : line[key];
  }
  return written;
}

export function eventsFolder(home) {
  return join(home, EVENTS_FOLDER);
}

export function logPath(home, session) {
  return join(eventsFolder(home), `${session}.jsonl`);
}

/** The last `seq` in a log, read from its tail; a torn last line from a process that died is passed over. */
async function lastSeq(path) {
  if (!existsSync(path)) return 0;
  const { size } = await stat(path);
  for (const window of [65536, size]) {
    const handle = await open(path, "r");
    try {
      const length = Math.min(window, size);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      const lines = buffer.toString("utf8").split("\n");
      if (length < size) lines.shift();
      for (const raw of lines.reverse()) {
        try {
          const seq = JSON.parse(raw)?.seq;
          if (Number.isInteger(seq)) return seq;
        } catch {
          // A torn or foreign line: keep looking further back.
        }
      }
    } finally {
      await handle.close();
    }
    if (window >= size) break;
  }
  return 0;
}

/** Whether a log's last byte is not a line's end. */
async function endsMidLine(path) {
  if (!existsSync(path)) return false;
  const { size } = await stat(path);
  if (!size) return false;
  const handle = await open(path, "r");
  try {
    const byte = Buffer.alloc(1);
    await handle.read(byte, 0, 1, size - 1);
    return byte[0] !== 0x0a;
  } finally {
    await handle.close();
  }
}

const LOCK_WAIT_MS = 2000;
/** A lock older than this was left by a writer that died; a live writer holds it for milliseconds. */
const LOCK_STALE_MS = 10000;

/** Runs `work` holding `<path>.lock`, so two writers of one log (a session and its resume) never share a `seq`. */
async function withLock(path, work) {
  const lock = `${path}.lock`;
  const started = Date.now();
  let handle = null;
  for (let attempt = 0; !handle; attempt += 1) {
    try {
      handle = await open(lock, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const age = Date.now() - ((await stat(lock).catch(() => null))?.mtimeMs ?? Date.now());
      if (age > LOCK_STALE_MS) {
        await rm(lock, { force: true });
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS)
        throw new Error(`${basename(path)} is locked by another writer (${lock}); this batch was not written`);
      await new Promise((done) => setTimeout(done, Math.min(10 * 2 ** attempt, 200)));
    }
  }
  try {
    return await work();
  } finally {
    await handle.close();
    await rm(lock, { force: true });
  }
}

/** In a store, its .gitignore keeps the root's events/ out of Git, for a store made before the log existed. */
async function ignoreInStore(home) {
  if (!isFreeflowStore(home)) return;
  const path = join(home, ".gitignore");
  const current = existsSync(path) ? await readFile(path, "utf8") : "";
  if (current.split(/\r?\n/).some((line) => line.trim() === "/events/")) return;
  await writeFile(path, `${current.replace(/\s*$/, "")}${current.trim() ? "\n" : ""}/events/\n`);
}

/**
 * `events append`: the lines in `input` (JSON Lines), each checked, normalized and appended to its session's log. A
 * line that is not schema v1 is refused and the rest are written, with one `freeflow` line of what `dropped` saying how
 * many were refused and why the first was (section 5).
 */
export async function appendEvents(home, input) {
  const accepted = new Map();
  const refused = [];
  input.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      refused.push({ number: index + 1, problem: "not JSON", line: null });
      return;
    }
    const problem = lineProblem(line);
    if (problem) refused.push({ number: index + 1, problem, line });
    else accepted.set(line.session, [...(accepted.get(line.session) ?? []), line]);
  });
  if (refused.length) {
    // The refusal goes into the log of the session the batch was for: the first line that names one.
    const owner = [...accepted.values()][0]?.[0] ?? refused.map((each) => each.line).find(validOwner);
    if (owner) {
      const note = {
        v: EVENT_VERSION,
        ts: new Date().toISOString(),
        session: owner.session,
        harness: owner.harness,
        agent: "main",
        kind: "freeflow",
        what: "dropped",
        dropped: refused.length,
        detail: `refused by events append: line ${refused[0].number}, ${refused[0].problem}`,
      };
      accepted.set(owner.session, [...(accepted.get(owner.session) ?? []), note]);
    }
  }
  const written = [];
  if (accepted.size) {
    await mkdir(eventsFolder(home), { recursive: true });
    await ignoreInStore(home);
  }
  for (const [session, lines] of accepted) {
    const path = logPath(home, session);
    await withLock(path, async () => {
      let seq = await lastSeq(path);
      const text = lines.map((line) => `${JSON.stringify(normalize(line, (seq += 1)))}\n`).join("");
      // A torn last line, from a writer that died mid-write, stays on its own line, unread.
      await appendFile(path, `${(await endsMidLine(path)) ? "\n" : ""}${text}`, { mode: 0o600 });
    });
    written.push({ session, path, count: lines.length });
  }
  return { written, refused };
}

function validOwner(line) {
  return line && typeof line.session === "string" && SESSION_ID.test(line.session) && HARNESSES.includes(line.harness);
}

/** A log's lines, parsed; a line that cannot be read is named in `skipped` and passed over (section 5). */
export function readLog(path) {
  if (!existsSync(path)) return { lines: [], skipped: [], bytes: 0 };
  const lines = [];
  const skipped = [];
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((raw, index) => {
      if (!raw.trim()) return;
      try {
        const line = JSON.parse(raw);
        if (line?.v === EVENT_VERSION && typeof line.kind === "string") lines.push(line);
        else skipped.push(index + 1);
      } catch {
        skipped.push(index + 1);
      }
    });
  return { lines, skipped, bytes: statSync(path).size };
}

/**
 * What a session's lines add up to (section 4.4): model requests and their tokens by model and effort, tool calls by
 * tool with their failures, compactions by who ran them, workers, and the share of tool calls that were Freeflow's own.
 */
export function summarize(lines, { session, since = null, task = null, bytes = null } = {}) {
  const chosen = since ? lines.filter((line) => line.ts >= since) : lines;
  const times = chosen.map((line) => line.ts).sort();
  const tokens = new Map();
  const tools = new Map();
  const compactions = { freeflow: 0, harness: 0 };
  const workers = { spawned: 0, stopped: 0, blocked: 0 };
  let requests = 0;
  let toolCalls = 0;
  let freeflowCalls = 0;
  let dropped = 0;
  const governor = [];
  let harness = null;
  const gates = Object.fromEntries(GATES.map((gate) => [gate, 0]));
  let gatesBlocked = 0;
  let agreements = 0;
  // The tokens from a cycle's notice to the checkpoint that answered it. Rows (schema v1's older kind of line) are not
  // measured: no driver writes one now, and the notice is the only signal before compaction.
  const toCheckpoint = { notice: [] };
  let noticeAt = null;
  for (const line of chosen) {
    harness ??= line.harness ?? null;
    if (line.kind === "freeflow" && line.what === "notice" && Number.isInteger(line.context)) noticeAt = line.context;
    else if (line.kind === "freeflow" && line.what === "checkpoint") {
      if (Number.isInteger(line.context) && noticeAt !== null) toCheckpoint.notice.push(line.context - noticeAt);
      noticeAt = null;
    } else if (line.kind === "compaction") noticeAt = null;
    if (line.kind === "model.request") {
      requests += 1;
      const key = `${line.model}\u0000${line.effort ?? ""}`;
      const entry = tokens.get(key) ?? {
        model: line.model,
        effort: line.effort ?? null,
        requests: 0,
        in: 0,
        out: 0,
        cacheRead: 0,
        cacheWrite: 0,
      };
      entry.requests += 1;
      for (const field of ["in", "out", "cacheRead", "cacheWrite"]) entry[field] += line[field] ?? 0;
      tokens.set(key, entry);
    } else if (line.kind === "tool.call") {
      toolCalls += 1;
      if (line.source === "freeflow") freeflowCalls += 1;
      const entry = tools.get(line.tool) ?? { tool: line.tool, calls: 0, failed: 0 };
      entry.calls += 1;
      if (line.ok === false) entry.failed += 1;
      tools.set(line.tool, entry);
    } else if (line.kind === "compaction") {
      if (line.by in compactions) compactions[line.by] += 1;
    } else if (line.kind === "agent.spawn") workers.spawned += 1;
    else if (line.kind === "agent.stop") {
      workers.stopped += 1;
      if (line.blocked) workers.blocked += 1;
    } else if (line.kind === "freeflow" && line.what === "dropped") dropped += line.dropped ?? 0;
    else if (line.kind === "governor") {
      const { ts, cap, unit, limit, use, response } = line;
      governor.push({ ts, cap, unit, limit, use, response });
    } else if (line.kind === "gate" && line.gate in gates) {
      gates[line.gate] += 1;
      if (line.decision !== "warn") gatesBlocked += 1;
    } else if (line.kind === "agreement") agreements += 1;
  }
  const spread = (values) => {
    const sorted = [...values].sort((x, y) => x - y);
    const middle = sorted.length / 2;
    const median = sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
    return { cycles: sorted.length, median: Math.round(median), largest: sorted.at(-1) };
  };
  const checkpoints = [...(toCheckpoint.notice.length ? [{ from: "notice", ...spread(toCheckpoint.notice) }] : [])];
  const byName = (x, y) =>
    (x.model ?? x.tool).localeCompare(y.model ?? y.tool) || (x.effort ?? "").localeCompare(y.effort ?? "");
  return {
    v: EVENT_VERSION,
    session,
    harness,
    ...(task ? { task } : {}),
    since: since ?? times[0] ?? null,
    until: times.at(-1) ?? null,
    events: chosen.length,
    ...(bytes === null ? {} : { logBytes: bytes }),
    modelRequests: requests,
    tokens: [...tokens.values()].sort(byName),
    toolCalls,
    tools: [...tools.values()].sort(byName),
    compactions,
    workers,
    freeflow: {
      toolCalls: freeflowCalls,
      share: toolCalls ? Math.round((freeflowCalls / toolCalls) * 1000) / 1000 : 0,
    },
    dropped,
    ...(governor.length ? { governor } : {}),
    gates: { ...gates, blocked: gatesBlocked },
    agreements,
    ...(checkpoints.length ? { toCheckpoint: checkpoints } : {}),
  };
}

const CAP_NAMES = { pace: "the daily pace", window: "the seven-day window", task: "the task's cost" };
const RESPONSE_NAMES = { row: "a row", notice: "a notice", ask: "the ask to stop" };

/** One governor line as `events summary` prints it. */
function governorLine(each) {
  const figure = (value) => (each.unit === "usd" ? `$${value.toFixed(2)}` : `${Math.round(value * 10) / 10}%`);
  return `  ${each.ts}: ${CAP_NAMES[each.cap] ?? each.cap} at ${figure(each.use)} of ${figure(each.limit)}, ${RESPONSE_NAMES[each.response] ?? each.response}`;
}

/** A summary as the few lines `events summary` prints. */
export function renderSummary(summary) {
  const n = (value) => value.toLocaleString("en-US");
  const lines = [
    `Events for session ${summary.session}${summary.task ? `, ${summary.task}` : ""}: ${n(summary.events)} line(s)${summary.since ? ` from ${summary.since}` : ""}${summary.until ? ` to ${summary.until}` : ""}${summary.logBytes === undefined ? "" : `; the log is ${n(summary.logBytes)} bytes`}`,
    `Model requests: ${n(summary.modelRequests)}`,
    ...summary.tokens.map(
      (each) =>
        `  ${each.model}${each.effort ? ` ${each.effort}` : ""}: ${n(each.requests)} request(s), ${n(each.in)} in, ${n(each.cacheWrite)} written, ${n(each.cacheRead)} read, ${n(each.out)} out`,
    ),
    `Tool calls: ${n(summary.toolCalls)}, ${n(summary.freeflow.toolCalls)} of them Freeflow's own (${Math.round(summary.freeflow.share * 100)}%)`,
    ...summary.tools.map(
      (each) => `  ${each.tool}: ${n(each.calls)}${each.failed ? `, ${n(each.failed)} failed` : ""}`,
    ),
    `Compactions: ${summary.compactions.freeflow} by Freeflow, ${summary.compactions.harness} by the harness`,
    ...(summary.toCheckpoint ?? []).map(
      (each) =>
        `Notice to checkpoint: ${n(each.cycles)} cycle(s), median ${n(each.median)}, largest ${n(each.largest)}`,
    ),
    `Workers: ${summary.workers.spawned} started, ${summary.workers.stopped} stopped${summary.workers.blocked ? `, ${summary.workers.blocked} sent back` : ""}`,
    ...(summary.gates
      ? [
          `Gates: ${GATES.map((gate) => `${gate} ${summary.gates[gate] ?? 0}`).join(", ")} would-fire${summary.gates.blocked ? `, ${summary.gates.blocked} of them asked or refused` : ""}`,
        ]
      : []),
    ...(summary.agreements ? [`Agreements recorded with agree: ${summary.agreements}`] : []),
    ...(summary.dropped ? [`Dropped: ${summary.dropped} line(s) were not written`] : []),
    ...(summary.governor?.length
      ? [`Governor: ${summary.governor.length} response(s)`, ...summary.governor.map(governorLine)]
      : []),
  ];
  return `${lines.join("\n")}\n`;
}

/** Every session's log in the home, with its size, for `events summary` with no session (P6). */
export async function listLogs(home) {
  const folder = eventsFolder(home);
  if (!existsSync(folder)) return [];
  const names = (await readdir(folder)).filter((name) => name.endsWith(".jsonl")).sort();
  return Promise.all(
    names.map(async (name) => {
      const path = join(folder, name);
      const { size, mtime } = await stat(path);
      return { session: name.slice(0, -".jsonl".length), path, bytes: size, modified: mtime.toISOString() };
    }),
  );
}

/** The time a hold in sessions.md started ("2026-11-03 10:52", UTC), as the ISO time the log's lines are compared to. */
export function holdStart(from) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(from ?? "") ? `${from.replace(" ", "T")}:00.000Z` : null;
}

/**
 * Writes the summary of this session's log since it took the task into the task folder's `events/<session>.json`
 * (P7), for the checkpoint or release to commit. Returns the path, or null when the session wrote no log.
 */
export async function writeTaskSummary({ home, taskDir, taskId, session, since }) {
  const path = logPath(home, session);
  if (!existsSync(path)) return null;
  const { lines, bytes } = readLog(path);
  const summary = summarize(lines, { session, since, task: taskId, bytes });
  const target = join(taskDir, EVENTS_FOLDER, `${session}.json`);
  await mkdir(join(taskDir, EVENTS_FOLDER), { recursive: true });
  await writeFile(target, `${JSON.stringify(summary, null, 2)}\n`);
  return target;
}

/**
 * Before a checkpoint or a release is committed: this session's event summary in the task's folder (P7). Never fails
 * the command it serves; returns the line it prints, or null when the session wrote no log.
 */
export async function summaryForTask({ home, taskDir, taskId, identity, since }) {
  if (!identity) return null;
  try {
    const path = await writeTaskSummary({ home, taskDir, taskId, session: identity.id, since });
    return path ? `Events: summary written to events/${identity.id}.json in the task folder.` : null;
  } catch (error) {
    return `Events: no summary written (${error.message}).`;
  }
}
