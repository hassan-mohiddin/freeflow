// Discussion messages (the Spec's section 9; P38, T4): every message the user sent, word for word. After each turn
// Freeflow captures the turn's new user messages into the held task's discussions/<day>.md, numbered M-1, M-2 ... per
// task: continuous across days and never reused. While no task is held they go to the session's own
// sessions/<session>/discussion.md, and `task create` moves them into the new task. A message is quoted line by line
// ("> "), so a heading inside it cannot break the parse, and it is never edited: `discussion remove` deletes its text
// and keeps its number, and Git keeps what was there. Reading a transcript goes through a reader per format, so any
// harness can supply one.

import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { redact } from "./events5.mjs";
import { isPiSession, piUserMessages } from "./pi-session.mjs";

export const DISCUSSIONS_DIR = "discussions";
export const SESSION_DISCUSSION = "discussion.md";
export const CURSOR_FILE = "discussion-cursor.json";
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const DAY_HEADING = /^## (\d{4}-\d{2}-\d{2})$/;
const MESSAGE_HEADING = /^### M-(\d+) · (\d{2}:\d{2}|--:--)( · removed)?$/;
const REMOVED_HASH = /^<!-- removed ([0-9a-f]{16}) -->$/;
const DAY_NOTE =
  "The user's messages of this day, word for word, numbered per task: kept by Freeflow, never edited. A removed message keeps its number with no text.";
const SESSION_NOTE =
  "The user's messages this session sent before it held a task, word for word. `task create` moves them into the new task, renumbered from M-1.";

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
  "This task's record is memory, not authority: the user's direction decides the work, as written in the agreement and the user's messages in discussions/, and in their messages in this session, which win where the record differs.";
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

/** Codex's rollout: JSON Lines with a session_meta line, then response_item and event_msg entries. */
export function isCodexRollout(text) {
  for (const line of text.split("\n", 40)) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      entry?.type === "session_meta" ||
      ((entry?.type === "event_msg" || entry?.type === "response_item") && typeof entry.payload === "object")
    )
      return true;
  }
  return false;
}

// Codex records what it puts in the model's context as user messages too: its environment, its instructions and its
// own notes. Those are not the user's words, so the response items that open this way are left out.
const CODEX_CONTEXT =
  /^\s*(<environment_context>|<user_instructions>|<INSTRUCTIONS>|<user_shell_command>|<turn_aborted>|# AGENTS\.md instructions)/;
const codexText = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .filter((block) => block?.type === "input_text" || block?.type === "text")
          .map((block) => block.text ?? "")
          .join("\n")
      : "";

/**
 * Codex's rollout (rollout-*.jsonl, named by Stop's transcript_path): the user's typed messages are its event_msg
 * user_message entries; a rollout without them (an older one) is read from its user response items, minus the context
 * Codex records beside them.
 */
export function readCodex(text) {
  const typed = [];
  const responses = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const at = entry?.timestamp ?? null;
    if (entry?.type === "event_msg" && entry.payload?.type === "user_message")
      typed.push({ at, text: String(entry.payload.message ?? "").replace(/\s+$/, "") });
    else if (entry?.type === "response_item" && entry.payload?.type === "message" && entry.payload.role === "user") {
      const message = codexText(entry.payload.content);
      if (!CODEX_CONTEXT.test(message)) responses.push({ at, text: message.replace(/\s+$/, "") });
    }
  }
  return (typed.length ? typed : responses).filter((message) => message.text.trim());
}

export const READERS = { "claude-code": readClaudeCode, codex: readCodex, pi: piUserMessages, plain: readPlain };

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
 * The user's messages from the transcript, numbered from 1 in the order read, at or after `since` and before `until`
 * when given. The transcript is --transcript, else FREEFLOW_TRANSCRIPT (which a harness layer sets, as it sets
 * FREEFLOW_SESSION), else this Claude Code session's log; "-" reads a plain export from standard input. A Pi session
 * file is known by its header line, a Codex rollout by its entries; any other .jsonl is Claude Code's log.
 */
export function userMessages({ transcript, format, since = null, until = null, stdin = null, env = process.env } = {}) {
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
    (isPiSession(text) ? "pi" : isCodexRollout(text) ? "codex" : path.endsWith(".jsonl") ? "claude-code" : "plain");
  const reader = READERS[chosen];
  if (!reader) fail(`--format is one of ${Object.keys(READERS).join(", ")}.`);
  const inRange = (message) =>
    !message.at ||
    ((!since || Date.parse(message.at) >= Date.parse(since)) && (!until || Date.parse(message.at) < Date.parse(until)));
  return distinct(reader(text).filter(inRange)).map((message, index) => ({ ...message, number: index + 1 }));
}

const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
export { hashOf as messageHash };

/** A message's day and HH:MM in UTC, or today's day and "--:--" when its time is not recorded. */
export function stampOf(at, now = new Date()) {
  if (!at || Number.isNaN(Date.parse(at))) return { day: now.toISOString().slice(0, 10), time: "--:--" };
  const iso = new Date(at).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * A stored file's messages, in file order: { number, day, time, text, removed, hash, start, end } with the lines they
 * occupy. A day heading (in the session file) sets the day of the messages under it; otherwise `fileDay` does.
 */
export function parseMessages(text, fileDay = null) {
  const lines = String(text ?? "").split("\n");
  const messages = [];
  let day = fileDay;
  let current = null;
  const close = (index) => {
    if (current) current.end = index;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const dayHeading = DAY_HEADING.exec(line);
    if (dayHeading) {
      close(index);
      current = null;
      day = dayHeading[1];
      continue;
    }
    const heading = MESSAGE_HEADING.exec(line);
    if (heading) {
      close(index);
      current = {
        number: Number(heading[1]),
        day,
        time: heading[2],
        removed: Boolean(heading[3]),
        lines: [],
        hash: null,
        start: index,
        end: lines.length,
      };
      messages.push(current);
      continue;
    }
    if (!current) continue;
    if (current.removed) {
      const hash = REMOVED_HASH.exec(line);
      if (hash) current.hash = hash[1];
    } else if (line === ">") current.lines.push("");
    else if (line.startsWith("> ")) current.lines.push(line.slice(2));
  }
  for (const message of messages) {
    message.text = message.removed ? "" : message.lines.join("\n");
    message.hash = message.removed ? message.hash : hashOf(message.text);
    delete message.lines;
  }
  return messages;
}

/** The lines that hold one message, as stored: its heading, then its text quoted line by line, then a blank line. */
export function renderMessage(message) {
  const quoted = message.text.split("\n").map((line) => (line ? `> ${line}` : ">"));
  return `${[`### M-${message.number} · ${message.time}`, "", ...quoted, ""].join("\n")}\n`;
}

/** A removed message: its heading with "· removed", and the hash of its text, so a later capture does not take it again. */
function tombstone(message) {
  return `${[`### M-${message.number} · ${message.time} · removed`, "", `<!-- removed ${message.hash} -->`, ""].join("\n")}\n`;
}

/** The messages of a held task, every day file in discussions/, in number order. */
export function taskMessages(taskDir) {
  const folder = join(taskDir, DISCUSSIONS_DIR);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => DAY_FILE.test(name))
    .sort()
    .flatMap((name) => {
      const day = DAY_FILE.exec(name)[1];
      return parseMessages(readFileSync(join(folder, name), "utf8"), day).map((message) => ({
        ...message,
        file: join(folder, name),
      }));
    })
    .sort((left, right) => left.number - right.number);
}

/** A session's own messages, from its file before a task holds them. */
export function sessionMessages(file) {
  if (!existsSync(file)) return [];
  return parseMessages(readFileSync(file, "utf8")).map((message) => ({ ...message, file }));
}

/** The number the next message gets: one past the highest number ever used, a removed message's included. */
export function nextNumber(messages) {
  return messages.reduce((highest, message) => Math.max(highest, message.number), 0) + 1;
}

const storedKey = (message) => `${message.day}|${message.time}|${message.hash}`;

/**
 * The transcript's messages not yet captured. The cursor says how many messages the last capture read and the hash of
 * the last one, so a message is captured once, across a compaction, a resumed session, or a transcript that another
 * folder's copy holds. Failing those, the time of the last one; with no cursor, whatever is not stored already.
 */
export function freshMessages(messages, cursor, stored, now = new Date()) {
  if (!messages.length) return [];
  if (cursor && Number.isInteger(cursor.count) && cursor.count > 0) {
    if (messages[cursor.count - 1] && hashOf(messages[cursor.count - 1].text) === cursor.hash)
      return messages.slice(cursor.count);
    const found = messages.findLastIndex((message) => hashOf(message.text) === cursor.hash);
    if (found >= 0 && (messages[found].at ?? null) === (cursor.at ?? null)) return messages.slice(found + 1);
  }
  if (cursor?.at) return messages.filter((message) => message.at && Date.parse(message.at) > Date.parse(cursor.at));
  const seen = new Set(stored.map(storedKey));
  return messages.filter((message) => {
    const { day, time } = stampOf(message.at, now);
    return !seen.has(`${day}|${time}|${hashOf(redact(message.text))}`);
  });
}

function readCursor(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Captures the messages of a turn into the held task's discussions/ (`taskDir`), or else into the session's own file
 * (`sessionDir`/discussion.md). `messages` are the transcript's, as userMessages numbers them. Writes the cursor after
 * the messages, so a failed write captures them again next time rather than skipping them.
 */
export function captureMessages({ sessionDir, taskDir = null, messages, now = new Date() }) {
  const cursorPath = join(sessionDir, CURSOR_FILE);
  const file = join(sessionDir, SESSION_DISCUSSION);
  const stored = taskDir ? taskMessages(taskDir) : sessionMessages(file);
  const fresh = freshMessages(messages, readCursor(cursorPath), stored, now);
  const first = nextNumber(stored);
  if (fresh.length) {
    // The secrets redaction the event log uses applies to what is stored; the cursor keeps the transcript's own text.
    const numbered = fresh.map((message, index) => ({
      ...message,
      ...stampOf(message.at, now),
      text: redact(message.text),
      number: first + index,
    }));
    if (taskDir) appendToTask(taskDir, numbered);
    else appendToSession(file, numbered);
  }
  if (messages.length) {
    const last = messages.at(-1);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      cursorPath,
      `${JSON.stringify({ count: messages.length, hash: hashOf(last.text), at: last.at ?? null }, null, 2)}\n`,
    );
  }
  const numbers = fresh.map((_, index) => first + index);
  return { captured: fresh.length, numbers, path: taskDir ? join(taskDir, DISCUSSIONS_DIR) : file };
}

function appendToTask(taskDir, numbered) {
  const folder = join(taskDir, DISCUSSIONS_DIR);
  mkdirSync(folder, { recursive: true });
  const days = [...new Set(numbered.map((message) => message.day))];
  for (const day of days) {
    const path = join(folder, `${day}.md`);
    const head = existsSync(path) ? "" : `# Discussion · ${day}\n\n${DAY_NOTE}\n\n`;
    appendFileSync(
      path,
      head +
        numbered
          .filter((message) => message.day === day)
          .map(renderMessage)
          .join(""),
    );
  }
}

function appendToSession(file, numbered) {
  mkdirSync(dirname(file), { recursive: true });
  const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
  let current =
    [...existing.split("\n")]
      .reverse()
      .map((line) => DAY_HEADING.exec(line))
      .find(Boolean)?.[1] ?? null;
  let out = existing ? "" : `# Discussion before a task\n\n${SESSION_NOTE}\n\n`;
  for (const message of numbered) {
    if (message.day !== current) {
      out += `## ${message.day}\n\n`;
      current = message.day;
    }
    out += renderMessage(message);
  }
  appendFileSync(file, out);
}

/**
 * Moves a session's messages into a new task: renumbered from M-1 in the task's day files, in their order, and the
 * session's file removed. Returns how many moved.
 */
export function moveSessionMessages(file, taskDir) {
  const live = sessionMessages(file).filter((message) => !message.removed);
  if (!live.length) {
    if (existsSync(file)) rmSync(file, { force: true });
    return 0;
  }
  const numbered = live.map((message, index) => ({ ...message, number: index + 1 }));
  appendToTask(taskDir, numbered);
  rmSync(file, { force: true });
  return numbered.length;
}

/** Removes one message's text, keeping its number; the file's other lines stay as they are. */
export function removeMessage(messages, number) {
  const message = messages.find((each) => each.number === number);
  if (!message) fail(`No message M-${number} in this task.`);
  if (message.removed) fail(`M-${number} is already removed.`);
  const lines = readFileSync(message.file, "utf8").split("\n");
  const out = [
    ...lines.slice(0, message.start),
    ...tombstone(message).split("\n").slice(0, -1),
    ...lines.slice(message.end),
  ];
  writeFileSync(message.file, out.join("\n"));
  return `Removed M-${number}; Git keeps it.\n`;
}

/** The numbers a message list names: "M-4–M-7, M-11", or "M-3", or "M-3-9". */
export function parseMessageNumbers(value) {
  const numbers = [];
  for (const part of String(value ?? "").split(",")) {
    const range = /^\s*M-(\d+)(?:\s*[–-]\s*(?:M-)?(\d+))?\s*$/i.exec(part);
    if (!range) fail(`Messages are named as M-4–M-7, M-11; not ${String(value)}`);
    const [from, to] = [Number(range[1]), Number(range[2] ?? range[1])];
    if (from < 1 || to < from) fail(`Messages ${part.trim()} run from a lower number to a higher one, from M-1.`);
    for (let number = from; number <= to; number += 1) if (!numbers.includes(number)) numbers.push(number);
  }
  return numbers.sort((left, right) => left - right);
}

const firstWords = (text) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return `${words.slice(0, 14).join(" ")}${words.length > 14 ? " …" : ""}`;
};

/** `discussion list`: each message's number, day, time and first words; a removed one says so. */
export function listText(messages, { date = null } = {}) {
  const shown = messages.filter((message) => !date || message.day === date);
  if (!shown.length) return `No messages${date ? ` on ${date}` : ""}.\n`;
  return `${shown
    .map((message) =>
      message.removed
        ? `M-${message.number} · ${message.day} ${message.time} · removed`
        : `M-${message.number} · ${message.day} ${message.time} · ${firstWords(message.text)}`,
    )
    .join("\n")}\n`;
}

/** `discussion show`: the named messages whole, word for word, each under its heading. */
export function showText(messages, numbers) {
  const missing = numbers.filter((number) => !messages.some((message) => message.number === number));
  if (missing.length) fail(`No message ${missing.map((number) => `M-${number}`).join(", ")} in this task.`);
  return numbers
    .map((number) => {
      const message = messages.find((each) => each.number === number);
      if (message.removed) return `### M-${number} · ${message.day} ${message.time}\n\nremoved\n`;
      return `### M-${number} · ${message.day} ${message.time}\n\n${message.text}\n`;
    })
    .join("\n");
}

/**
 * The messages a Recovery line names, as a bundle prints them: the named ones that exist and are not removed, each
 * under its heading. `entries` are recovery entries whose message pointers carry their numbers (recover.mjs).
 */
export function messageFiles(entries, messages) {
  return entries.flatMap((entry) =>
    entry.pointers
      .filter((pointer) => pointer.kind === "messages")
      .map((pointer) => {
        const picked = messages.filter((message) => pointer.numbers.includes(message.number) && !message.removed);
        const text = picked
          .map((message) => `### M-${message.number} · ${message.day} ${message.time}\n\n${message.text}`)
          .join("\n\n");
        return {
          pointer: pointer.value,
          path: null,
          text,
          words: text.split(/\s+/).filter(Boolean).length,
          ranged: false,
          messages: true,
        };
      }),
  );
}

/** Each stored message's problem for a Recovery line: a number that does not exist, or one removed. */
export function messagePointerProblems(numbers, messages) {
  const problems = [];
  for (const number of numbers) {
    const message = messages.find((each) => each.number === number);
    if (!message) problems.push(`M-${number} does not exist in discussions/`);
    else if (message.removed) problems.push(`M-${number} was removed; its number stays, its text does not`);
  }
  return problems;
}
