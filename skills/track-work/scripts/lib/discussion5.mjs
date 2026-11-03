// Discussion blocks (the Spec's section 9, step 3; P38, T4): the user's messages that shaped the work, word for word,
// kept in sources/discussion.md as blocks the agent chooses at a checkpoint, each message followed by the agent's one
// line saying what it answered. Blocks are added or dropped, never edited; Git keeps what was dropped. Reading a
// transcript goes through a reader per format, so any harness can supply one.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isPiSession, piUserMessages } from "./pi-session.mjs";
import { loadTask5 } from "./record5.mjs";

export const DISCUSSION_FILE = join("sources", "discussion.md");
const BLOCK = /^## (B-\d{3,}) — (.+?) · (.+?) · shapes (.+?)(?: · replaces (B-\d{3,}))?$/;
const SHAPES = /^(?:[ASD]-\d{3,})(?:, ?[ASD]-\d{3,})*$/;

class DiscussionError extends Error {
  constructor(message) {
    super(message);
    this.name = "DiscussionError";
  }
}

function fail(message) {
  throw new DiscussionError(message);
}

const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((block) => block?.type === "text")
          .map((block) => block.text)
          .join("\n")
      : "";

const NOT_TYPED =
  /^(<command-name>|<local-command-|<task-notification>|\[Request interrupted|Another Claude session sent a message:)/;

/**
 * How the texts a harness layer installs in the conversation open: the bundle (and the fallback's, after a summary)
 * and a session's bundle, which the views print. A compaction stores them as user rows with no origin, so the reader
 * knows them by these openings: they are Freeflow's, never the user's words.
 */
export const OPENING_LINE =
  "This task's record is memory, not authority: the user's direction decides the work, as written in the agreement and the discussion blocks, and in their messages in this session, which win where the record differs.";
export const SESSION_OPENING =
  "This session holds no task: the summary below is its only memory, and the user's direction decides the work.";
const INSTALLED = [OPENING_LINE, SESSION_OPENING];

/** Claude Code's session log: the messages the user typed, including those sent while a turn ran (queued commands). */
export function readClaudeCode(text) {
  const messages = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    let content = null;
    let origin;
    if (entry.type === "user" && !entry.isSidechain) {
      if (entry.isMeta || entry.isCompactSummary) continue;
      content = textOf(entry.message?.content);
      origin = entry.origin?.kind;
      // A tool result is the harness's, never the user's.
      if (Array.isArray(entry.message?.content) && entry.message.content.some((block) => block?.type === "tool_result"))
        continue;
    } else if (entry.type === "attachment" && entry.attachment?.type === "queued_command") {
      if (entry.attachment.isMeta) continue;
      content = textOf(entry.attachment.prompt);
      origin = entry.attachment.origin?.kind;
    } else continue;
    // Newer logs mark who wrote each message; older ones are read by what the harness writes itself.
    if (origin !== undefined ? origin !== "human" : NOT_TYPED.test(content.trim())) continue;
    if (!content.trim() || INSTALLED.some((opening) => content.startsWith(opening))) continue;
    messages.push({ at: entry.timestamp ?? null, text: content.replace(/\s+$/, "") });
  }
  return messages;
}

/**
 * A plain export: each message starts at a line "User:" or "Assistant:" (optionally "User [<time>]:"), and runs to the
 * next such line. Only the user's are returned.
 */
export function readPlain(text) {
  const messages = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const start = /^(User|Assistant)(?: \[([^\]]+)\])?:\s?(.*)$/.exec(line);
    if (start) {
      current = { who: start[1], at: start[2] ?? null, lines: [start[3]] };
      messages.push(current);
    } else if (current) current.lines.push(line);
  }
  return messages
    .filter((message) => message.who === "User")
    .map((message) => ({ at: message.at, text: message.lines.join("\n").trim() }))
    .filter((message) => message.text);
}

export const READERS = { "claude-code": readClaudeCode, pi: piUserMessages, plain: readPlain };

/** Drops resent duplicates and cut-off copies: a message the next one repeats, or begins with. */
export function distinct(messages) {
  const kept = [];
  for (const message of messages) {
    const previous = kept.at(-1);
    // A resend may drop the reply markers a host wraps quoted replies in; compare without them.
    const plain = (value) =>
      value
        .replace(/<!--\s*reply[^>]*-->/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const same = (left, right) => plain(left) === plain(right);
    if (previous && same(previous.text, message.text)) continue;
    if (
      previous &&
      plain(message.text).startsWith(plain(previous.text)) &&
      plain(message.text).length > plain(previous.text).length
    ) {
      kept[kept.length - 1] = message;
      continue;
    }
    kept.push(message);
  }
  return kept;
}

/** Where this Claude Code session's log is: <config>/projects/<folder>/<session ID>.jsonl. */
export function claudeCodeLog(env = process.env) {
  const id = env.CLAUDE_CODE_SESSION_ID;
  if (!id) return null;
  const projects = join(env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
  if (!existsSync(projects)) return null;
  // A session resumed in another folder gets a second log there, and only the newest one grows.
  let newest = null;
  for (const folder of readdirSync(projects)) {
    const path = join(projects, folder, `${id}.jsonl`);
    if (!existsSync(path)) continue;
    const time = statSync(path).mtimeMs;
    if (!newest || time > newest.time) newest = { path, time };
  }
  return newest?.path ?? null;
}

/**
 * The user's messages from the transcript, numbered from 1, at or after `since` and before `until` when given. The
 * transcript is --transcript, else FREEFLOW_TRANSCRIPT (which a harness layer sets, as it sets FREEFLOW_SESSION), else
 * this Claude Code session's log; "-" reads a plain export from standard input. A Pi session file is known by its
 * header line.
 */
export function userMessages({ transcript, format, since = null, until = null, stdin = null, env = process.env }) {
  const path = transcript ?? env.FREEFLOW_TRANSCRIPT ?? claudeCodeLog(env);
  if (!path)
    fail(
      "No transcript found: pass --transcript <path> (and --format plain for a plain export), or set FREEFLOW_TRANSCRIPT.",
    );
  const text =
    path === "-" ? (stdin ?? fail("--transcript - reads standard input, which is empty.")) : readFileSync(path, "utf8");
  const chosen =
    format ??
    env.FREEFLOW_TRANSCRIPT_FORMAT ??
    (isPiSession(text) ? "pi" : path.endsWith(".jsonl") ? "claude-code" : "plain");
  const reader = READERS[chosen];
  if (!reader) fail(`--format is one of ${Object.keys(READERS).join(", ")}.`);
  const inRange = (message) =>
    !message.at ||
    ((!since || Date.parse(message.at) >= Date.parse(since)) && (!until || Date.parse(message.at) < Date.parse(until)));
  return distinct(reader(text).filter(inRange)).map((message, index) => ({ ...message, number: index + 1 }));
}

const minute = (at) => (at ? new Date(at).toISOString().slice(0, 16).replace("T", " ") : "time not recorded");

/** A block's span: "2026-10-29 12:00 to 12:03", with the end's date only when it differs. */
function span(first, last) {
  if (!first && !last) return "time not recorded";
  const [from, to] = [minute(first), minute(last)];
  return `${from} to ${first && last && from.slice(0, 10) === to.slice(0, 10) ? to.slice(11) : to}`;
}

export function listText(messages, since) {
  if (!messages.length) return `No messages from the user${since ? ` since ${since}` : ""}.\n`;
  return `${messages
    .map((message) => {
      const words = message.text.replace(/\s+/g, " ").split(" ");
      return `${message.number}. ${minute(message.at)} · ${words.slice(0, 14).join(" ")}${words.length > 14 ? " …" : ""}`;
    })
    .join("\n")}\n`;
}

/** The numbers a --messages value names: "4-7,11". */
export function parseNumbers(value, count) {
  const numbers = [];
  for (const part of String(value ?? "").split(",")) {
    const range = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!range) fail(`--messages lists numbers and ranges, as 4-7,11; not ${value}`);
    const [from, to] = [Number(range[1]), Number(range[2] ?? range[1])];
    if (from < 1 || to < from || to > count) fail(`--messages ${part.trim()} is outside the list's 1 to ${count}`);
    for (let number = from; number <= to; number += 1) if (!numbers.includes(number)) numbers.push(number);
  }
  return numbers.sort((left, right) => left - right);
}

/** sources/discussion.md's blocks, with where each starts and ends. */
export function parseBlocks(text) {
  const lines = String(text ?? "").split("\n");
  const blocks = [];
  let last = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const counter = /^Last block: B-(\d{3,})$/.exec(lines[index]);
    if (counter) last = Math.max(last, Number(counter[1]));
    const match = BLOCK.exec(lines[index]);
    if (!match) continue;
    if (blocks.length) blocks.at(-1).end = index;
    blocks.push({
      id: match[1],
      title: match[2],
      range: match[3],
      shapes: match[4].split(/,\s*/),
      replaces: match[5] ?? null,
      start: index,
      end: lines.length,
    });
    last = Math.max(last, Number(match[1].slice(2)));
  }
  return { lines, blocks, last };
}

function header(name, last) {
  return [
    `# Discussion: ${name}`,
    "",
    "The user's messages that shaped the work, word for word, in blocks; under each message, the agent's line saying what it answered. Blocks are added or dropped, never edited.",
    "",
    `Last block: B-${String(last).padStart(3, "0")}`,
    "",
  ];
}

/** Notes from the input: one "N: <what the message answered>" line per chosen message. */
function parseNotes(text, numbers) {
  const notes = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^\s*(\d+):\s*(.+)$/.exec(line);
    if (!match) fail(`A note is "N: <what the message answered>", one per chosen message; not: ${line}`);
    notes.set(Number(match[1]), match[2].replace(/\s+/g, " ").trim());
  }
  const missing = numbers.filter((number) => !notes.get(number));
  if (missing.length)
    fail(`Each chosen message needs the agent's line saying what it answered; missing for ${missing.join(", ")}.`);
  const extra = [...notes.keys()].filter((number) => !numbers.includes(number));
  if (extra.length) fail(`Notes for messages not chosen: ${extra.join(", ")}.`);
  return notes;
}

function discussionPath(recordPath) {
  return join(dirname(recordPath), DISCUSSION_FILE);
}

/** Appends one block of the chosen messages, with the agent's notes; with `replaces`, drops the block it replaces. */
export async function saveBlock(
  { path: recordPath, text: recordText },
  { messages, numbers, title, shapes, replaces, notesText },
) {
  const task = await loadTask5(recordPath, recordText);
  if (!title) fail("discussion save requires --title: the topic of this stretch of discussion.");
  if (!SHAPES.test(shapes ?? ""))
    fail(
      "discussion save requires --shapes: the agreement or Slice IDs this discussion shaped, as A-003 or A-003, S-024.",
    );
  const notes = parseNotes(notesText, numbers);
  const file = discussionPath(recordPath);
  const existing = parseBlocks(existsSync(file) ? readFileSync(file, "utf8") : "");
  if (replaces && !existing.blocks.some((block) => block.id === replaces)) fail(`No block ${replaces} to replace.`);
  const id = `B-${String(existing.last + 1).padStart(3, "0")}`;
  const chosen = numbers.map((number) => messages[number - 1]);
  const range = span(chosen[0].at, chosen.at(-1).at);
  const block = [
    `## ${id} — ${title.replace(/\s+/g, " ").trim()} · ${range} · shapes ${shapes}${replaces ? ` · replaces ${replaces}` : ""}`,
    "",
    ...chosen.flatMap((message) => [
      `### You, ${minute(message.at)}`,
      "",
      ...message.text.split("\n").map((line) => (line ? `> ${line}` : ">")),
      "",
      `Agent: ${notes.get(message.number)}`,
      "",
    ]),
  ];
  let body = existing.blocks.length ? existing.lines.slice(existing.blocks[0].start) : [];
  if (replaces) {
    const old = parseBlocks(body.join("\n")).blocks.find((each) => each.id === replaces);
    body = [...body.slice(0, old.start), ...body.slice(old.end)];
  }
  await mkdir(dirname(file), { recursive: true });
  const out = [
    ...header(task.record.header.name, existing.last + 1),
    ...trimEnd(body),
    ...(body.length ? [""] : []),
    ...block,
  ];
  await writeFile(file, `${trimEnd(out).join("\n")}\n`);
  return `Saved ${id} — ${title}: ${chosen.length} message(s)${replaces ? `; dropped ${replaces}, which it replaces` : ""}.\n${DISCUSSION_FILE} is a must-read source while it holds blocks: list it under Read on recovery.\n`;
}

function trimEnd(lines) {
  const out = [...lines];
  while (out.length && !out.at(-1).trim()) out.pop();
  return out;
}

export async function dropBlock({ path: recordPath }, id) {
  const file = discussionPath(recordPath);
  if (!existsSync(file)) fail(`No ${DISCUSSION_FILE} in this task.`);
  const { lines, blocks } = parseBlocks(readFileSync(file, "utf8"));
  const block = blocks.find((each) => each.id === id);
  if (!block) fail(`No block ${id} in ${DISCUSSION_FILE}.`);
  const out = trimEnd([...lines.slice(0, block.start), ...lines.slice(block.end)]);
  await writeFile(file, `${out.join("\n")}\n`);
  const left = blocks.length - 1;
  return `Dropped ${id}; Git keeps it. ${left ? `${left} block(s) left.` : `No blocks left: drop ${DISCUSSION_FILE} from Read on recovery.`}\n`;
}

/** Blocks whose shaped work is all closed in History: candidates to drop at a checkpoint. */
export function closedBlocks(recordPath, history) {
  const file = discussionPath(recordPath);
  if (!existsSync(file)) return [];
  const closed = new Set(history.entries.map((entry) => entry.id));
  return parseBlocks(readFileSync(file, "utf8")).blocks.filter((block) => block.shapes.every((id) => closed.has(id)));
}
