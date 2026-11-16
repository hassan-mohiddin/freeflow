import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { userMessages } from "../../../skills/track-work/scripts/lib/discussion5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const long = (word) => `${word} `.repeat(40).trim();

/**
 * A Pi session (Pi 1.4.0's session format): a result before a compaction, then a user message, a Freeflow notice in
 * the user's turn, a read and a test run on the active branch, and a branch left with /tree that holds its own result
 * and message, written before the active branch's last entries so only the parent links tell them apart.
 */
function piSession() {
  const at = (minute) => `2026-10-30T10:${String(minute).padStart(2, "0")}:00.000Z`;
  let previous = null;
  const entry = (id, minute, body, parentId = previous) => {
    previous = id;
    return { id, parentId, timestamp: at(minute), ...body };
  };
  const message = (role, content, extra = {}) => ({ type: "message", message: { role, content, ...extra } });
  const call = (id, name, args) => message("assistant", [{ type: "toolCall", id, name, arguments: args }]);
  const result = (id, name, text) =>
    message("toolResult", [{ type: "text", text }], { toolCallId: id, toolName: name, isError: false });
  const lines = [
    { type: "session", version: 3, id: "session-1", timestamp: at(0), cwd: "/work" },
    entry("e01", 1, message("user", "List the files.")),
    entry("e02", 1, call("call_old", "bash", { command: "ls" })),
    entry("e03", 1, result("call_old", "bash", long("before"))),
    entry("e04", 2, { type: "compaction", summary: "Earlier work.", firstKeptEntryId: "e04" }),
    entry("e05", 3, message("user", [{ type: "text", text: "Fix the parser." }])),
    entry("e06", 3, message("user", '<freeflow-notice type="compaction">\nCompaction is near.\n</freeflow-notice>')),
    entry("e07", 4, call("call_read", "read", { path: "/work/src/parser.js" })),
    entry("e08", 4, result("call_read", "read", long("source"))),
  ];
  // A branch from e08 that /tree left: its result and message are not the conversation's.
  lines.push(entry("x01", 5, call("call_left", "bash", { command: "npm run lint" }), "e08"));
  lines.push(entry("x02", 5, result("call_left", "bash", long("lint"))));
  lines.push(entry("x03", 6, message("user", "Try the other way.")));
  // The active branch goes on from e08.
  lines.push(entry("e09", 7, call("call_test", "bash", { command: "npm test" }), "e08"));
  lines.push(entry("e10", 7, result("call_test", "bash", long("pass"))));
  lines.push(entry("e11", 8, message("user", "Now the docs.")));
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}

test("a Pi session is read along its active branch: the reader takes its user's messages, not a branch /tree left", async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "track-work-pi-session-")));
  try {
    const session = join(folder, "2026-10-30T10-00-00_session-1.jsonl");
    await writeFile(session, piSession());
    const messages = userMessages({ transcript: session, since: "2026-10-30T09:00:00Z" });
    assert.deepEqual(
      messages.map((message) => [message.number, message.text]),
      [
        [1, "List the files."],
        [2, "Fix the parser."],
        [3, "Now the docs."],
      ],
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
