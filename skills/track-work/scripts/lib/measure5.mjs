// What a stretch of work used, read from the harness's transcript or given as --used (task-004's Spec, section 12
// "Planning from measured cost", P83, P89, T29 to T31): the context it added, the compaction cycles it touched, its
// requests' billed tokens by model and effort with their cost at API list price, and its working and wall-clock time.
// Everything here is arithmetic over what was measured; nothing is guessed.

import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";

/** How much of a log's end is read before reading further back, until the last reading's time is reached. */
const TAIL_STEPS = [8 * 1024 * 1024, 64 * 1024 * 1024, null];
/** A gap between two requests longer than this is waiting (on the user, on a run), not working. */
export const IDLE_MS = 5 * 60 * 1000;

/**
 * USD per million tokens at API list price, from the API reference bundled with Claude Code 2.1.311 (T31). A model's
 * `upTo` card applies while a request's prompt (input, cache written and cache read) is that size or smaller.
 */
export const PRICES = {
  date: "2026-10-30",
  source: "the Claude API reference bundled with Claude Code 2.1.311",
  models: {
    "claude-fable-5-1": [{ input: 10, write5m: 12.5, write1h: 20, read: 0.25, output: 50 }],
    "claude-opus-5-5": [{ input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 }],
    "claude-opus-5": [{ input: 5, write5m: 6.25, write1h: 10, read: 0.5, output: 25 }],
    "claude-sonnet-5-5": [{ input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 }],
    "claude-sonnet-5": [{ input: 2, write5m: 2.5, write1h: 4, read: 0.2, output: 10 }],
    "claude-haiku-5-5": [
      { upTo: 100_000, input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 },
      { input: 0.5, write5m: 0.625, write1h: 1, read: 0.05, output: 2.5 },
    ],
  },
};

/** The price table: PRICES, or the JSON file FREEFLOW_PRICES names, in the same shape. */
export function priceTable(env = process.env) {
  return env.FREEFLOW_PRICES ? JSON.parse(readFileSync(env.FREEFLOW_PRICES, "utf8")) : PRICES;
}

function readTail(path, bytes) {
  const descriptor = openSync(path, "r");
  try {
    const size = fstatSync(descriptor).size;
    const start = bytes === null ? 0 : Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    readSync(descriptor, buffer, 0, buffer.length, start);
    const text = buffer.toString("utf8");
    // A read that starts mid-file starts mid-line: that line is left out.
    return { text: start === 0 ? text : text.slice(text.indexOf("\n") + 1), whole: start === 0 };
  } finally {
    closeSync(descriptor);
  }
}

const contextOf = (usage) =>
  (usage.input_tokens ?? 0) +
  (usage.cache_creation_input_tokens ?? 0) +
  (usage.cache_read_input_tokens ?? 0) +
  (usage.output_tokens ?? 0);

/** A log's requests and compactions; a worker's own log (`worker`) holds only its requests, all marked sidechain. */
function parseEvents(text, { worker = false } = {}) {
  const requests = new Map();
  const compactions = [];
  for (const line of text.split("\n")) {
    const compact = line.includes('"compact_boundary"');
    if (!compact && !line.includes('"usage"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const time = Date.parse(entry?.timestamp ?? "");
    if (!Number.isFinite(time)) continue;
    if (compact && entry.type === "system" && entry.subtype === "compact_boundary") {
      const meta = entry.compactMetadata ?? {};
      compactions.push({ kind: "compaction", time, pre: meta.preTokens ?? null, post: meta.postTokens ?? null });
      continue;
    }
    const usage = entry?.message?.usage;
    if (entry?.type !== "assistant" || (entry.isSidechain && !worker) || !usage) continue;
    // One request is logged once per streamed block: keep its fullest usage.
    const id = entry.message.id ?? `${time}`;
    const event = {
      kind: "request",
      time,
      model: entry.message.model ?? "unknown",
      effort: entry.effort ?? null,
      usage,
    };
    const known = requests.get(id);
    if (!known || contextOf(usage) >= contextOf(known.usage)) requests.set(id, { ...event, time: known?.time ?? time });
  }
  return [...requests.values(), ...compactions].sort((a, b) => a.time - b.time);
}

/**
 * The main conversation's requests and compactions in a Claude Code log after `sinceMs`, oldest first. `reached` says
 * whether the log goes back that far: when it does not (the work began in another session), what it holds is all.
 */
export function transcriptEvents(path, sinceMs) {
  for (const bytes of TAIL_STEPS) {
    const { text, whole } = readTail(path, bytes);
    const events = parseEvents(text);
    const reached = events.length > 0 && events[0].time <= sinceMs;
    if (reached || whole) return { events: events.filter((event) => event.time > sinceMs), reached };
  }
  return { events: [], reached: false };
}

/**
 * Where this compaction cycle started in a Claude Code log: the context after its last compaction, else the session's
 * first request's; null when the log holds neither.
 */
export function cycleStart(path) {
  for (const bytes of TAIL_STEPS) {
    const { text, whole } = readTail(path, bytes);
    const events = parseEvents(text);
    const compaction = events.filter((event) => event.kind === "compaction" && event.post !== null).at(-1);
    if (compaction) return { tokens: compaction.post, from: "after the last compaction in the transcript" };
    if (whole) {
      const first = events.find((event) => event.kind === "request");
      return first ? { tokens: contextOf(first.usage), from: "the session's first request in the transcript" } : null;
    }
  }
  return null;
}

/**
 * What a worker used, from its own log (a Claude Code subagent's `agent-<id>.jsonl`): its whole context from its
 * first request on, its billed tokens and cost, and its working and wall-clock time; null when the log holds no
 * request (delegations measured from their workers' logs, A in P89).
 */
export function workerMeasure(path, table = PRICES) {
  const events = parseEvents(readFileSync(path, "utf8"), { worker: true });
  const first = events.find((event) => event.kind === "request");
  if (!first) return null;
  return addEvents({ ...emptyMeasure(), last: { time: first.time, context: 0 } }, { events, reached: true }, table);
}

/** A request's cost in USD at list price, or null when the table has no card for its model. */
export function requestCost(event, table = PRICES) {
  const name = Object.keys(table.models)
    .filter((key) => event.model.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  if (!name) return null;
  const usage = event.usage;
  const written = usage.cache_creation_input_tokens ?? 0;
  const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const prompt = (usage.input_tokens ?? 0) + written + (usage.cache_read_input_tokens ?? 0);
  const card = table.models[name].find((each) => each.upTo === undefined || prompt <= each.upTo);
  return (
    ((usage.input_tokens ?? 0) * card.input +
      (written - oneHour) * card.write5m +
      oneHour * card.write1h +
      (usage.cache_read_input_tokens ?? 0) * card.read +
      (usage.output_tokens ?? 0) * card.output) /
    1_000_000
  );
}

/** An empty measure: nothing used yet. */
export const emptyMeasure = () => ({
  context: 0,
  cycles: 1,
  workingMs: 0,
  wallMs: 0,
  billed: {},
  partial: false,
  last: null,
});

/**
 * Adds to `measure` what the events after its last reading used, and moves its last reading to the newest request.
 * Context grows within each stretch between compactions: from the last value to the next compaction's size before it,
 * then from its size after. A measure with no last reading only takes one (the Slice's start).
 */
export function addEvents(measure, { events, reached }, table = PRICES) {
  const next = structuredClone(measure);
  const requests = events.filter((event) => event.kind === "request");
  if (!requests.length) return next;
  if (next.last === null) {
    const newest = requests.at(-1);
    next.last = { time: newest.time, context: contextOf(newest.usage) };
    return next;
  }
  if (!reached) next.partial = true;
  let start = reached ? next.last.context : contextOf(requests[0].usage);
  let current = start;
  let previous = next.last.time;
  for (const event of events) {
    if (event.kind === "compaction") {
      next.context += Math.max(0, (event.pre ?? current) - start);
      start = event.post ?? 0;
      current = start;
      next.cycles += 1;
      continue;
    }
    current = contextOf(event.usage);
    if (event.time - previous <= IDLE_MS) next.workingMs += event.time - previous;
    previous = event.time;
    const key = `${event.model} ${event.effort ?? "default"}`;
    const billed = (next.billed[key] ??= { input: 0, written: 0, read: 0, output: 0, usd: 0, priced: true });
    billed.input += event.usage.input_tokens ?? 0;
    billed.written += event.usage.cache_creation_input_tokens ?? 0;
    billed.read += event.usage.cache_read_input_tokens ?? 0;
    billed.output += event.usage.output_tokens ?? 0;
    const cost = requestCost(event, table);
    if (cost === null) billed.priced = false;
    else billed.usd += cost;
  }
  next.context += Math.max(0, current - start);
  next.wallMs += requests.at(-1).time - next.last.time;
  next.last = { time: requests.at(-1).time, context: current };
  return next;
}

/** Adds a reading given as --used where no transcript can be read: context only, and partial across a compaction. */
export function addUsed(measure, used, now = Date.now()) {
  const next = structuredClone(measure);
  if (next.last !== null) {
    if (used >= next.last.context) next.context += used - next.last.context;
    else next.partial = true;
    next.wallMs += Math.max(0, now - next.last.time);
  }
  next.last = { time: now, context: used };
  return next;
}

const count = (value) => Math.round(value).toLocaleString("en-US");
const minutes = (ms) => Math.round(ms / 60_000);

/** The measure as the one line a Slice and its History entry hold (T29). */
export function renderMeasure(measure) {
  const parts = [
    `context ${count(measure.context)} over ${measure.cycles} compaction cycle(s)${measure.partial ? " (partly measured)" : ""}`,
    `working ${minutes(measure.workingMs)} min, wall ${minutes(measure.wallMs)} min`,
    ...Object.entries(measure.billed).map(
      ([key, billed]) =>
        `${key}: ${count(billed.input)} in, ${count(billed.written)} written, ${count(billed.read)} read, ${count(billed.output)} out, ${billed.priced ? `$${billed.usd.toFixed(2)}` : "no price"}`,
    ),
  ];
  if (measure.last)
    parts.push(`as of ${new Date(measure.last.time).toISOString()} at ${count(measure.last.context)} tokens`);
  return parts.join("; ");
}

const number = (text) => Number(text.replace(/,/g, ""));

/** The measure a line holds; the inverse of renderMeasure. */
export function parseMeasure(text) {
  const measure = emptyMeasure();
  for (const part of text.split("; ")) {
    let match;
    if ((match = /^context ([\d,]+) over (\d+) compaction cycle\(s\)( \(partly measured\))?$/.exec(part))) {
      measure.context = number(match[1]);
      measure.cycles = Number(match[2]);
      measure.partial = Boolean(match[3]);
    } else if ((match = /^working (\d+) min, wall (\d+) min$/.exec(part))) {
      measure.workingMs = Number(match[1]) * 60_000;
      measure.wallMs = Number(match[2]) * 60_000;
    } else if ((match = /^as of (\S+) at ([\d,]+) tokens$/.exec(part))) {
      measure.last = { time: Date.parse(match[1]), context: number(match[2]) };
    } else if (
      (match = /^(.+): ([\d,]+) in, ([\d,]+) written, ([\d,]+) read, ([\d,]+) out, (?:\$([\d.]+)|no price)$/.exec(part))
    ) {
      measure.billed[match[1]] = {
        input: number(match[2]),
        written: number(match[3]),
        read: number(match[4]),
        output: number(match[5]),
        usd: match[6] === undefined ? 0 : Number(match[6]),
        priced: match[6] !== undefined,
      };
    } else throw new Error(`Measured holds an unknown part: ${part}`);
  }
  return measure;
}
