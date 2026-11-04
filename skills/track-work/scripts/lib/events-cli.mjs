// The `events` commands (SPEC-006, sections 4.2 and 4.4): `append` for a Freeflow driver, `summary` and `show` for the
// agent and the user. The log's format and the writer are lib/events5.mjs's.

import { existsSync } from "node:fs";

import { appendEvents, holdStart, KINDS, listLogs, logPath, readLog, renderSummary, summarize } from "./events5.mjs";
import { priceTable } from "./measure5.mjs";
import { heldTask, readSessions } from "./projects5.mjs";
import { isFreeflowStore } from "./store.mjs";

/** The task this session holds in the store at `home`, with when its hold started, or null. */
function heldSince(home, identity) {
  if (!identity || !isFreeflowStore(home)) return null;
  const task = heldTask(home, identity);
  if (!task) return null;
  return { task, since: holdStart(readSessions(task.dir).hold?.from) };
}

export async function runEvents(operation, options, { home, identity, input }) {
  if (operation === "append") {
    const { written, refused } = await appendEvents(home, input);
    const lines = [
      written.length
        ? written.map((each) => `Wrote ${each.count} event line(s) to ${each.path}.`).join("\n")
        : "Wrote no event lines.",
      ...refused.map((each) => `Refused line ${each.number}: ${each.problem}.`),
    ];
    return `${lines.join("\n")}\n`;
  }
  const session = options["--session"] ?? identity?.id ?? null;
  if (operation === "summary") {
    if (!session) {
      const logs = await listLogs(home);
      if (!logs.length) return `No event logs in ${home}/events.\n`;
      if (options["--json"]) return `${JSON.stringify(logs, null, 2)}\n`;
      return `${logs.map((each) => `- ${each.session}: ${each.bytes.toLocaleString("en-US")} bytes, last written ${each.modified}`).join("\n")}\n`;
    }
    const path = logPath(home, session);
    if (!existsSync(path)) throw new Error(`No event log for session ${session} (${path})`);
    const { lines, skipped, bytes } = readLog(path);
    // This session's summary counts from when it took the task it holds, as the one a checkpoint commits does.
    const held = session === identity?.id ? heldSince(home, identity) : null;
    const summary = summarize(lines, {
      session,
      since: held?.since ?? null,
      task: held?.task.id ?? null,
      bytes,
      prices: priceTable(),
    });
    const unread = skipped.length ? `Skipped unreadable line(s) ${skipped.join(", ")} of ${path}.\n` : "";
    return options["--json"] ? `${JSON.stringify(summary, null, 2)}\n` : `${renderSummary(summary)}${unread}`;
  }
  if (operation === "show") {
    if (!session) throw new Error("No session: give --session <ID>, or run it in a session that names its own");
    const kind = options["--kind"];
    if (kind !== undefined && !KINDS[kind]) throw new Error(`--kind is one of ${Object.keys(KINDS).join(", ")}`);
    const path = logPath(home, session);
    if (!existsSync(path)) throw new Error(`No event log for session ${session} (${path})`);
    const { lines, skipped } = readLog(path);
    if (skipped.length) process.stderr.write(`Skipped unreadable line(s) ${skipped.join(", ")} of ${path}.\n`);
    return lines
      .filter((line) => kind === undefined || line.kind === kind)
      .map((line) => `${JSON.stringify(line)}\n`)
      .join("");
  }
  throw new Error(`Unknown command: events ${operation ?? ""}`.trim());
}
