// The delegation log (SPEC-009 4.2): `<task folder>/channel.jsonl`, one line per delegation event, appended where
// delegation already acts (delegate open, amend, join, check-return and close, a worker's checkpoint --delegation, and a
// harness layer's notice to a worker or the block of its stop). No message goes through it: it records what happened,
// as the event log does for the loop. Lines are kept by both sides when two stores merge (`channel.jsonl merge=union`).

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "./events5.mjs";
import { ensureUnionMerge } from "./freeflow-store.mjs";
import { freeflowStoreOf } from "./store.mjs";

export const CHANNEL_FILE = "channel.jsonl";
export const CHANNEL_VERSION = 1;
export const CHANNEL_KINDS = [
  "brief",
  "amend",
  "progress",
  "return",
  "blocked",
  "sent-back",
  "accepted",
  "stopped",
  "inform",
];
/** A body longer than this is cut; what does not fit belongs in a file the line's `ref` names. */
export const BODY_LIMIT = 300;
const DELEGATION = /^D-\d{3,}(?:\.\d+)?$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const channelPath = (taskDir) => join(taskDir, CHANNEL_FILE);

/**
 * Who wrote a line, from the session the command runs in (and the agent ID a harness layer passes for a subagent),
 * never from what the agent types.
 * @param {{ id: string } | null} identity
 * @param {string | null} [agent]
 */
export function fromOf(identity, agent = null) {
  const session = identity?.id ?? "no session";
  return agent ? `${session}/${agent}` : session;
}

/** A line's problem, or null for a line this module reads. */
export function channelProblem(line) {
  if (typeof line !== "object" || line === null || Array.isArray(line)) return "not a JSON object";
  if (line.v !== CHANNEL_VERSION) return `v is ${CHANNEL_VERSION}`;
  if (typeof line.id !== "string" || !line.id) return "no id";
  if (typeof line.ts !== "string" || !ISO.test(line.ts)) return "ts is an ISO time";
  if (!DELEGATION.test(String(line.delegation ?? ""))) return "delegation is D-NNN or D-NNN.n";
  if (!CHANNEL_KINDS.includes(line.kind)) return `kind is one of ${CHANNEL_KINDS.join(", ")}`;
  if (typeof line.from !== "string" || !line.from) return "no from";
  if (line.ref !== undefined && (typeof line.ref !== "string" || !line.ref)) return "ref is a path";
  if (line.body !== undefined && (typeof line.body !== "string" || line.body.length > BODY_LIMIT))
    return `body is text of at most ${BODY_LIMIT} characters`;
  return null;
}

/**
 * Appends one line to the task's delegation log and returns it. `body` is redacted and cut to BODY_LIMIT; `from` is
 * the session's, filled here.
 * @param {string} taskDir
 * @param {{ delegation: string, kind: string, ref?: string | null, body?: string | null }} event
 * @param {{ identity: { id: string } | null, agent?: string | null, now?: Date }} who
 */
export async function appendChannel(taskDir, event, { identity, agent = null, now = new Date() }) {
  const body = event.body ? redact(String(event.body).replace(/\s+/g, " ").trim()) : "";
  const line = {
    v: CHANNEL_VERSION,
    id: randomBytes(6).toString("hex"),
    ts: now.toISOString(),
    delegation: event.delegation,
    kind: event.kind,
    from: fromOf(identity, agent),
    ...(event.ref ? { ref: String(event.ref) } : {}),
    ...(body ? { body: body.length <= BODY_LIMIT ? body : `${body.slice(0, BODY_LIMIT - 1)}…` } : {}),
  };
  const problem = channelProblem(line);
  if (problem) throw new Error(`Not a delegation log line: ${problem}.`);
  const home = freeflowStoreOf(taskDir);
  if (home) await ensureUnionMerge(home);
  await appendFile(channelPath(taskDir), `${JSON.stringify(line)}\n`);
  return line;
}

/** The log's lines, oldest first, with the ones that cannot be read counted apart. */
export function readChannel(taskDir) {
  const path = channelPath(taskDir);
  const lines = [];
  let unreadable = 0;
  if (!existsSync(path)) return { path, lines, unreadable };
  for (const text of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!text.trim()) continue;
    try {
      const line = JSON.parse(text);
      if (channelProblem(line)) unreadable += 1;
      else lines.push(line);
    } catch {
      unreadable += 1;
    }
  }
  // A union merge may put the two sides' lines in either order.
  lines.sort((a, b) => a.ts.localeCompare(b.ts));
  return { path, lines, unreadable };
}

/** The log as `delegate log` prints it, for one delegation (and its sub-workers) or all. */
export function renderChannel(taskDir, id = null) {
  const { lines, unreadable } = readChannel(taskDir);
  const shown = id ? lines.filter((line) => line.delegation === id || line.delegation.startsWith(`${id}.`)) : lines;
  const rows = shown.map(
    (line) =>
      `${line.ts.slice(0, 16).replace("T", " ")} ${line.delegation} ${line.kind} · from ${line.from}${line.body ? ` · ${line.body}` : ""}${line.ref ? ` · ${line.ref}` : ""}`,
  );
  return `${rows.length ? rows.join("\n") : `No delegation log lines${id ? ` for ${id}` : ""}.`}${unreadable ? `\n${unreadable} line(s) could not be read.` : ""}\n`;
}

/** The latest return or blocked line of a delegation, or null. */
export function latestReturn(lines, id) {
  return (
    lines.filter((line) => line.delegation === id && (line.kind === "return" || line.kind === "blocked")).at(-1) ?? null
  );
}
