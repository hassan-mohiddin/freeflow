import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

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

test("a Pi session is read along its active branch: carry list, carry show and discussion list", async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "track-work-pi-session-")));
  try {
    const session = join(folder, "2026-10-30T10-00-00_session-1.jsonl");
    await writeFile(session, piSession());
    const run = (...args) => spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
    const list = run("carry", "list", "--transcript", session);
    assert.equal(list.status, 0, list.stderr);
    assert.equal(
      list.stdout,
      [
        "1. 10:04 · read: /work/src/parser.js · 70 tokens · call_read",
        "2. 10:07 · bash: npm test · 50 tokens · call_test",
        'Carry one with "- Carry: result <n> — <why>" in In flight; the checkpoint pins it to its ID.',
        "",
      ].join("\n"),
    );
    assert.match(
      run("carry", "show", "--id", "call_old", "--transcript", session).stdout,
      /^bash: ls · 2026-10-30T10:01:00\.000Z · call_old\nbefore before/,
    );
    assert.equal(run("carry", "show", "--id", "call_left", "--transcript", session).status, 1);

    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: folder });
    await writeFile(join(folder, ".gitignore"), ".freeflow/\n*.jsonl\n");
    const init = spawnSync(
      process.execPath,
      [scriptPath, "init", "--root", folder, "--name", "Pi", "--cue", "read when Pi matters", "--input", "-"],
      { encoding: "utf8", input: "### Goal\n\n- Read Pi.\n\n### Next action\n\n- Go.\n" },
    );
    assert.equal(init.status, 0, init.stderr);
    const record = init.stdout.trim().split("\n")[0];
    const messages = run(
      "discussion",
      "list",
      "--record",
      record,
      "--since",
      "2026-10-30T09:00:00Z",
      "--transcript",
      session,
    );
    assert.equal(messages.status, 0, messages.stderr);
    assert.equal(
      messages.stdout,
      [
        "1. 2026-10-30 10:01 · List the files.",
        "2. 2026-10-30 10:03 · Fix the parser.",
        "3. 2026-10-30 10:08 · Now the docs.",
        "",
      ].join("\n"),
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("view bundle --no-recent leaves out the newest results, and keeps a result In flight carries", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-pi-bundle-")));
  try {
    const session = join(root, "session.jsonl");
    await writeFile(session, piSession());
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
    await writeFile(join(root, ".gitignore"), ".freeflow/\nsession.jsonl\n");
    const run = (args, input = "") =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: root,
        encoding: "utf8",
        input,
        env: { ...process.env, FREEFLOW_TRANSCRIPT: session, CLAUDE_CODE_SESSION_ID: "", FREEFLOW_CONTEXT_WINDOW: "" },
      });
    const init = run(
      ["init", "--root", root, "--name", "Pi", "--cue", "read when Pi matters", "--input", "-"],
      "### Goal\n\n- Read Pi.\n\n### Next action\n\n- Go.\n",
    );
    assert.equal(init.status, 0, init.stderr);
    const record = init.stdout.trim().split("\n")[0];
    const pinned = run(
      ["checkpoint", "--record", record, "--input", "-"],
      "- Now: testing.\n- Carry: result 2 — the run\n",
    );
    assert.equal(pinned.status, 0, pinned.stderr);
    const whole = run(["view", "bundle", "--record", record]).stdout;
    assert.match(whole, /<result id="call_test" call="bash: npm test"/);
    assert.match(whole, /## Recent results[^\n]*\n\n<result id="call_read"/);
    const bare = run(["view", "bundle", "--record", record, "--no-recent"]).stdout;
    assert.match(bare, /<result id="call_test" call="bash: npm test"/);
    assert.doesNotMatch(bare, /## Recent results|call_read/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
