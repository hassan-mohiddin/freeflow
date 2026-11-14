import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, utimesSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  claudeCodeLog,
  distinct,
  readTranscriptSince,
  isCodexRollout,
  parseMessageNumbers,
  parseMessages,
  readClaudeCode,
  readCodex,
  readPlain,
  messageHash,
  userMessages,
} from "../../../skills/track-work/scripts/lib/discussion5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

const entry = (fields) => JSON.stringify(fields);
const human = (at, content) =>
  entry({ type: "user", timestamp: at, origin: { kind: "human" }, message: { role: "user", content } });

/** A log in the shape of Claude Code's: the user's messages among the harness's own entries. */
const LOG = [
  human("2026-10-29T10:00:00.000Z", "Before the checkpoint."),
  human("2026-10-29T12:00:00.000Z", "Should records keep the agent's replies?"),
  entry({
    type: "assistant",
    timestamp: "2026-10-29T12:00:30.000Z",
    message: { content: [{ type: "text", text: "Here are three options." }] },
  }),
  entry({
    type: "user",
    timestamp: "2026-10-29T12:01:00.000Z",
    message: { content: [{ type: "tool_result", content: "ok" }] },
  }),
  entry({
    type: "user",
    timestamp: "2026-10-29T12:01:10.000Z",
    origin: { kind: "task-notification" },
    message: { content: "<task-notification>done</task-notification>" },
  }),
  entry({
    type: "user",
    timestamp: "2026-10-29T12:01:20.000Z",
    isMeta: true,
    message: { content: "Stop hook feedback" },
  }),
  entry({
    type: "attachment",
    timestamp: "2026-10-29T12:02:00.000Z",
    attachment: { type: "queued_command", origin: { kind: "human" }, prompt: "Sent while you worked: keep it core." },
  }),
  entry({
    type: "attachment",
    timestamp: "2026-10-29T12:02:10.000Z",
    attachment: {
      type: "queued_command",
      origin: { kind: "peer" },
      isMeta: true,
      prompt: "<agent-message>a hand-back</agent-message>",
    },
  }),
  human("2026-10-29T12:03:00.000Z", "<!-- reply 2 -->\n> Option 2\n\nBlocks, yes."),
  human("2026-10-29T12:03:40.000Z", "> Option 2\n\nBlocks, yes."),
  human("2026-10-29T12:04:00.000Z", "And what about"),
  human("2026-10-29T12:04:20.000Z", "And what about budgets?"),
  entry({
    type: "user",
    timestamp: "2026-10-29T12:05:00.000Z",
    isCompactSummary: true,
    message: { content: "This session is being continued" },
  }),
  human("2026-10-29T12:06:00.000Z", [{ type: "text", text: "## A heading in my message" }]),
].join("\n");

test("the Claude Code reader keeps only what the user typed, mid-turn messages included; resends and cut-off copies are dropped", () => {
  const messages = distinct(readClaudeCode(LOG));
  assert.deepEqual(
    messages.map((message) => message.text),
    [
      "Before the checkpoint.",
      "Should records keep the agent's replies?",
      "Sent while you worked: keep it core.",
      "<!-- reply 2 -->\n> Option 2\n\nBlocks, yes.",
      "And what about budgets?",
      "## A heading in my message",
    ],
  );
});

test("the plain reader takes the User: messages of an export, with their times when given", () => {
  const messages = readPlain(
    "User [2026-10-29T12:00:00Z]: First line\nsecond line\nAssistant: A reply.\nUser: Second message.\n",
  );
  assert.deepEqual(messages, [
    { at: "2026-10-29T12:00:00Z", text: "First line\nsecond line" },
    { at: null, text: "Second message." },
  ]);
});

// Codex's rollout: its typed messages are event_msg user_message entries; the response items around them carry what
// Codex puts in the context too (the environment, the AGENTS.md instructions), which is not the user's words.
const CODEX = [
  entry({ type: "session_meta", timestamp: "2026-11-14T06:00:00.000Z", payload: { id: "c1", cwd: "/w" } }),
  entry({
    type: "response_item",
    timestamp: "2026-11-14T06:00:01.000Z",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "# AGENTS.md instructions for /w" }],
    },
  }),
  entry({
    type: "event_msg",
    timestamp: "2026-11-14T06:01:00.000Z",
    payload: { type: "user_message", message: "Read the Codex rollout." },
  }),
  entry({
    type: "response_item",
    timestamp: "2026-11-14T06:01:00.000Z",
    payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Read the Codex rollout." }] },
  }),
  entry({
    type: "event_msg",
    timestamp: "2026-11-14T06:02:00.000Z",
    payload: { type: "agent_message", message: "Reading it." },
  }),
  entry({
    type: "event_msg",
    timestamp: "2026-11-14T06:03:00.000Z",
    payload: { type: "user_message", message: "Keep it on by default." },
  }),
].join("\n");

test("the Codex reader takes the user's typed messages from a rollout, and only those", () => {
  assert.equal(isCodexRollout(CODEX), true);
  assert.equal(isCodexRollout(LOG), false);
  assert.deepEqual(
    readCodex(CODEX).map((message) => [message.at, message.text]),
    [
      ["2026-11-14T06:01:00.000Z", "Read the Codex rollout."],
      ["2026-11-14T06:03:00.000Z", "Keep it on by default."],
    ],
  );
  // A rollout with no typed messages (an older one) is read from its user response items, minus Codex's context.
  const older = [
    entry({
      type: "response_item",
      timestamp: "2026-11-14T06:00:01.000Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "<environment_context>cwd</environment_context>" }],
      },
    }),
    entry({
      type: "response_item",
      timestamp: "2026-11-14T06:00:02.000Z",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Only the older one." }] },
    }),
  ].join("\n");
  assert.deepEqual(
    readCodex(older).map((message) => message.text),
    ["Only the older one."],
  );
});

test("message numbers are read as M-4–M-7, M-11, M-3-9, and a malformed list is named", () => {
  assert.deepEqual(parseMessageNumbers("M-4–M-7, M-11"), [4, 5, 6, 7, 11]);
  assert.deepEqual(parseMessageNumbers("M-3-9,M-5"), [3, 4, 5, 6, 7, 8, 9]);
  assert.throws(() => parseMessageNumbers("4-7"), /Messages are named as M-4–M-7/);
  assert.throws(() => parseMessageNumbers("M-9–M-3"), /from a lower number to a higher one/);
});

test("a stored file reads back word for word: quoted lines, blank lines, a heading inside a message, a removed message's tombstone", () => {
  const stored = [
    "# Discussion · 2026-11-14",
    "",
    "### M-1 · 06:32",
    "",
    "> First line",
    ">",
    "> ### M-9 · 99:99 looks like a heading",
    "",
    "### M-2 · 06:40 · removed",
    "",
    "<!-- removed 0123456789abcdef -->",
    "",
  ].join("\n");
  const messages = parseMessages(stored, "2026-11-14");
  assert.deepEqual(
    messages.map(({ number, day, time, removed, text, hash }) => ({ number, day, time, removed, text, hash })),
    [
      {
        number: 1,
        day: "2026-11-14",
        time: "06:32",
        removed: false,
        text: "First line\n\n### M-9 · 99:99 looks like a heading",
        hash: messages[0].hash,
      },
      { number: 2, day: "2026-11-14", time: "06:40", removed: true, text: "", hash: "0123456789abcdef" },
    ],
  );
});

async function withStore(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-discussion5-"));
  try {
    const home = join(folder, "home");
    const work = join(folder, "work");
    await mkdir(work, { recursive: true });
    const cli = (args, { session = "aaaaaaaa-1", input = "", cwd = work } = {}) => {
      const env = {
        ...process.env,
        FREEFLOW_HOME: home,
        FREEFLOW_SESSION: session,
        FREEFLOW_HARNESS: "Test",
        FREEFLOW_RESUME: `resume ${session}`,
        CLAUDECODE: "",
        CLAUDE_CODE_SESSION_ID: "",
        CLAUDE_CODE_REMOTE: "",
        CLAUDE_CODE_REMOTE_SESSION_ID: "",
      };
      delete env.FREEFLOW_TRANSCRIPT;
      return spawnSync(process.execPath, [scriptPath, ...args], { cwd, input, encoding: "utf8", env });
    };
    ok(cli(["store", "init", "--git-name", "Test User", "--git-email", "test@example.com"]));
    await run({ folder, home, work, cli, log: (name, lines) => writeLog(folder, name, lines) });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function writeLog(folder, name, lines) {
  const path = join(folder, name);
  await writeFile(path, `${lines.join("\n")}\n`);
  return path;
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

/** Makes a project and a task in it, held by session `aaaaaaaa-1`, and returns the task's folder and record. */
function createTask(cli, title = "First task") {
  ok(cli(["project", "new", "--name", "Widget"]));
  const created = ok(
    cli([
      "task",
      "create",
      "--title",
      title,
      "--goal",
      "Discuss.",
      "--cue",
      "read when the discussion matters",
      "--project",
      "widget",
    ]),
  );
  const record = created.split("\n")[1];
  return { record, taskDir: dirname(record) };
}

test("capture keeps each user message once, in the held task's day file, numbered per task; a secret is redacted", async () => {
  await withStore(async ({ work, cli, log }) => {
    const { record, taskDir } = createTask(cli);
    const transcript = await log("session.jsonl", [
      human("2026-10-29T12:00:00.000Z", "Should records keep the replies?"),
      human("2026-10-29T12:03:00.000Z", "Use sk-abcdefghijklmnopqrstuvwx for the test, and no more."),
    ]);
    assert.match(
      ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work })),
      /^Captured 2 message\(s\), M-1–M-2, into .+discussions\.\n/,
    );
    const day = await readFile(join(taskDir, "discussions", "2026-10-29.md"), "utf8");
    assert.match(day, /### M-1 · 12:00\n\n> Should records keep the replies\?\n/);
    assert.match(day, /### M-2 · 12:03\n\n> Use \[redacted\] for the test, and no more\.\n/);
    assert.doesNotMatch(day, /sk-abcdef/);
    // Captured once: the same transcript again adds nothing; a later message gets the next number, across days.
    assert.equal(ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work })), "No new messages.\n");
    await writeFile(
      transcript,
      `${await readFile(transcript, "utf8")}${human("2026-10-30T09:00:00.000Z", "The next day.")}\n`,
    );
    ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work }));
    assert.match(
      await readFile(join(taskDir, "discussions", "2026-10-30.md"), "utf8"),
      /### M-3 · 09:00\n\n> The next day\.\n/,
    );
    assert.equal(
      ok(cli(["discussion", "list", "--record", record])),
      "M-1 · 2026-10-29 12:00 · Should records keep the replies?\nM-2 · 2026-10-29 12:03 · Use [redacted] for the test, and no more.\nM-3 · 2026-10-30 09:00 · The next day.\n",
    );
    assert.equal(
      ok(cli(["discussion", "list", "--record", record, "--date", "2026-10-30"])),
      "M-3 · 2026-10-30 09:00 · The next day.\n",
    );
  });
});

test("a turn's messages are captured once across a compaction and across a resumed session in another folder", async () => {
  await withStore(async ({ work, cli, log, folder, home }) => {
    const { taskDir } = createTask(cli);
    const first = [human("2026-10-29T12:00:00.000Z", "One."), human("2026-10-29T12:01:00.000Z", "Two.")];
    const transcript = await log("log.jsonl", first);
    ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work }));
    // Compaction: the log grows with the summary and the next message; the earlier ones stay.
    await writeFile(
      transcript,
      [
        ...first,
        entry({
          type: "user",
          timestamp: "2026-10-29T12:02:00.000Z",
          isCompactSummary: true,
          message: { content: "Summary." },
        }),
        human("2026-10-29T12:03:00.000Z", "Three, after the compaction."),
      ].join("\n") + "\n",
    );
    ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work }));
    // A resumed session in another folder: its copy of the log holds all of it, and only the new message is taken.
    const copy = join(folder, "resumed", "log.jsonl");
    await mkdir(dirname(copy), { recursive: true });
    await writeFile(
      copy,
      `${await readFile(transcript, "utf8")}${human("2026-10-29T12:04:00.000Z", "Four, resumed.")}\n`,
    );
    assert.match(
      ok(cli(["discussion", "capture", "--transcript", copy], { cwd: work })),
      /Captured 1 message\(s\), M-4/,
    );
    assert.deepEqual(
      (await readFile(join(taskDir, "discussions", "2026-10-29.md"), "utf8")).match(/^### M-\d+ · \S+$/gm),
      ["### M-1 · 12:00", "### M-2 · 12:01", "### M-3 · 12:03", "### M-4 · 12:04"],
    );
    // A lost cursor does not take the stored messages again: each is checked against what is stored.
    await rm(join(home, "sessions", "aaaaaaaa-1", "discussion-cursor.json"), { force: true });
    assert.equal(ok(cli(["discussion", "capture", "--transcript", copy], { cwd: work })), "No new messages.\n");
  });
});

test("messages sent before a task moves into it with task create, renumbered from M-1; the session's file goes", async () => {
  await withStore(async ({ work, cli, log, home: store }) => {
    const transcript = await log("before.jsonl", [
      human("2026-10-29T10:00:00.000Z", "Before any task."),
      human("2026-10-29T10:05:00.000Z", "Still before."),
    ]);
    assert.match(
      ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work })),
      /M-1–M-2, into .+discussion\.md/,
    );
    const { taskDir } = createTask(cli);
    assert.equal(
      await readFile(join(taskDir, "discussions", "2026-10-29.md"), "utf8").then((text) =>
        /### M-2 · 10:05/.test(text),
      ),
      true,
    );
    const sessionFile = join(store, "sessions", "aaaaaaaa-1", "discussion.md");
    assert.equal(
      await readFile(sessionFile, "utf8").then(
        () => true,
        () => false,
      ),
      false,
    );
  });
});

test("discussion remove deletes one message's text and keeps its number; no later capture takes it back; only the holder may remove", async () => {
  await withStore(async ({ work, cli, log, home }) => {
    const { record, taskDir } = createTask(cli);
    const transcript = await log("log.jsonl", [
      human("2026-10-29T12:00:00.000Z", "Keep."),
      human("2026-10-29T12:01:00.000Z", "Remove me."),
    ]);
    ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work }));
    assert.equal(
      ok(cli(["discussion", "remove", "--message", "M-2", "--record", record])),
      "Removed M-2; Git keeps it.\n",
    );
    const day = await readFile(join(taskDir, "discussions", "2026-10-29.md"), "utf8");
    assert.doesNotMatch(day, /Remove me\./);
    assert.match(day, /### M-2 · 12:01 · removed\n/);
    assert.match(ok(cli(["discussion", "list", "--record", record])), /M-2 · 2026-10-29 12:01 · removed\n/);
    // Neither the cursor nor a lost cursor brings it back.
    assert.equal(ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work })), "No new messages.\n");
    await rm(join(home, "sessions", "aaaaaaaa-1", "discussion-cursor.json"), { force: true });
    assert.equal(ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work })), "No new messages.\n");
    assert.match(cli(["discussion", "remove", "--message", "M-2", "--record", record]).stderr, /already removed/);
    // Another session does not hold the task, so it cannot remove a message from it.
    assert.match(
      cli(["discussion", "remove", "--message", "M-1", "--record", record], { session: "bbbbbbbb-2" }).stderr,
      /does not hold|holds it/,
    );
  });
});

test("show prints the named messages whole; a number that does not exist is named", async () => {
  await withStore(async ({ work, cli, log }) => {
    const { record } = createTask(cli);
    const transcript = await log("log.jsonl", [
      human("2026-10-29T12:00:00.000Z", "A line.\n\nAnd a second paragraph."),
      human("2026-10-29T12:01:00.000Z", "Second."),
      human("2026-10-29T12:02:00.000Z", "Third."),
    ]);
    ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work }));
    assert.equal(
      ok(cli(["discussion", "show", "M-1–M-2", "--record", record])),
      "### M-1 · 2026-10-29 12:00\n\nA line.\n\nAnd a second paragraph.\n\n### M-2 · 2026-10-29 12:01\n\nSecond.\n",
    );
    assert.match(cli(["discussion", "show", "M-9", "--record", record]).stderr, /No message M-9 in this task/);
  });
});

test("a Recovery line naming messages resolves, names a missing number, and prints its messages word for word in the bundle", async () => {
  await withStore(async ({ work, cli, log }) => {
    const { record } = createTask(cli);
    const transcript = await log("log.jsonl", [
      human("2026-10-29T12:00:00.000Z", "The goal is the discussion."),
      human("2026-10-29T12:01:00.000Z", "Settled: capture every message."),
    ]);
    ok(cli(["discussion", "capture", "--transcript", transcript], { cwd: work }));
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text.replace("### Recovery\n", "### Recovery\n\n- always: messages M-2, M-7 — what the user settled\n"),
    );
    const recover = ok(cli(["view", "recover", "--record", record]));
    assert.match(recover, /- Recovery: M-7 does not exist in discussions\/\n/);
    const bundle = ok(cli(["view", "bundle", "--record", record]));
    assert.match(
      bundle,
      /<file path="messages M-2, M-7">\n### M-2 · 2026-10-29 12:01\n\nSettled: capture every message\.\n/,
    );
    assert.doesNotMatch(bundle, /The goal is the discussion/);
  });
});

test("task tidy moves sources/discussion*.md into discussions/ unchanged, rewrites the Recovery lines that named them, writes the README, and moves nothing else", async () => {
  await withStore(async ({ cli }) => {
    const { record, taskDir } = createTask(cli);
    const block =
      "## B-001 — An old block · 2026-10-29 12:00 to 12:00 · shapes A-001\n\n### You, 2026-10-29 12:00\n\n> A message.\n\nAgent: noted\n";
    await mkdir(join(taskDir, "sources"), { recursive: true });
    await writeFile(join(taskDir, "sources", "discussion.md"), block);
    await writeFile(join(taskDir, "sources", "paper.md"), "A paper.\n");
    const history = await readFile(join(taskDir, "history.md"), "utf8");
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text.replace(
        "### Recovery\n",
        "### Recovery\n\n- always: sources/discussion.md — the old messages\n- always, not counted: sources/paper.md — the paper\n",
      ),
    );
    const out = ok(cli(["task", "tidy", "--id", "widget/task-001"]));
    assert.match(
      out,
      /Moved 1 file\(s\) unchanged, from sources\/ to discussions\/:\n- sources\/discussion\.md → discussions\/discussion\.md\n/,
    );
    assert.equal(await readFile(join(taskDir, "discussions", "discussion.md"), "utf8"), block);
    const after = await readFile(record, "utf8");
    assert.match(after, /- always: discussions\/discussion\.md — the old messages\n/);
    assert.match(
      after,
      /- always, not counted: sources\/paper\.md — the paper\n/,
      "a line naming another file is left as it was",
    );
    assert.equal(await readFile(join(taskDir, "history.md"), "utf8"), history);
    assert.equal(await readFile(join(taskDir, "sources", "paper.md"), "utf8"), "A paper.\n");
    const readme = await readFile(join(taskDir, "README.md"), "utf8");
    assert.match(readme, /^# First task\n/);
    assert.match(readme, /- `discussions\/`: the user's messages/);
    assert.match(readme, /- `sources\/`: outside material only/);
    assert.match(out, /README\.md written\.|README\.md is current\./);
    assert.match(
      ok(cli(["task", "tidy", "--id", "widget/task-001"])),
      /Nothing to move: sources\/ holds no discussion file\.\nRecovery: no line named a moved file\.\nREADME\.md is current\./,
    );
  });
});

test("tidy refuses to overwrite a file in discussions/, and moves nothing", async () => {
  await withStore(async ({ cli }) => {
    const { taskDir } = createTask(cli);
    await mkdir(join(taskDir, "sources"), { recursive: true });
    await mkdir(join(taskDir, "discussions"), { recursive: true });
    await writeFile(join(taskDir, "sources", "discussion.md"), "old\n");
    await writeFile(join(taskDir, "discussions", "discussion.md"), "already here\n");
    assert.match(cli(["task", "tidy", "--id", "widget/task-001"]).stderr, /already exists: move or rename/);
    assert.equal(await readFile(join(taskDir, "sources", "discussion.md"), "utf8"), "old\n");
  });
});

test("checkpoint refreshes the README when a folder appears; the README lists the folders that exist", async () => {
  await withStore(async ({ cli }) => {
    const { record, taskDir } = createTask(cli);
    assert.doesNotMatch(await readFile(join(taskDir, "README.md"), "utf8"), /notes\//);
    await mkdir(join(taskDir, "notes"), { recursive: true });
    await writeFile(join(taskDir, "notes", "list.md"), "- a working list\n");
    ok(cli(["checkpoint", "--record", record]));
    assert.match(await readFile(join(taskDir, "README.md"), "utf8"), /- `notes\/`: the agent's working lists/);
    assert.deepEqual(
      (await readdir(taskDir)).filter((name) => name === "README.md"),
      ["README.md"],
    );
  });
});

test("a Claude Code log is found beside its session, and a session with no log has none", async () => {
  const config = await mkdtemp(join(tmpdir(), "track-work-log-"));
  try {
    const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_SESSION_ID: "d5d6ba82" };
    const copy = async (folder, minutesAgo) => {
      const path = join(config, "projects", folder, "d5d6ba82.jsonl");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "{}\n");
      const time = new Date(Date.now() - minutesAgo * 60_000);
      utimesSync(path, time, time);
      return path;
    };
    await copy("-home-user-freeflow", 30);
    const newer = await copy("-home-user", 1);
    assert.equal(claudeCodeLog(env), newer);
    const newest = await copy("-home-user-freeflow", 0);
    assert.equal(claudeCodeLog(env), newest);
    assert.equal(claudeCodeLog({ ...env, CLAUDE_CODE_SESSION_ID: "absent" }), null);
  } finally {
    await rm(config, { recursive: true, force: true });
  }
});

test("identity and turns: a message repeated with no agent entry between is a resend; the same words in two turns are two messages; an entry seen twice counts once", () => {
  const user = (id, turn, text) => ({ at: null, text, id, turn });
  const repeated = distinct([user("a", 0, "continue"), user("b", 1, "continue")]);
  assert.deepEqual(
    repeated.map((message) => message.id),
    ["a", "b"],
    "two turns, both kept",
  );
  const resend = distinct([user("a", 0, "Fix the parser"), user("b", 0, "Fix the parser and the lexer")]);
  assert.deepEqual(
    resend.map((message) => message.text),
    ["Fix the parser and the lexer"],
    "a resend keeps the longer copy",
  );
  const twice = distinct([user("a", 0, "once"), user("a", 0, "once")]);
  assert.equal(twice.length, 1, "the same entry is counted once");
  // A cursor's last message is the one before the read: a resend across two reads is caught, a new turn is not.
  assert.deepEqual(distinct([user("c", 0, "same")], { turn: 0, text: "same" }), []);
  assert.equal(distinct([user("c", 1, "same")], { turn: 0, text: "same" }).length, 1);
});

test("a Claude Code log's agent entries separate turns: 'continue' twice across turns are both captured", () => {
  const log = [
    human("2026-10-29T12:00:00.000Z", "continue"),
    entry({
      type: "assistant",
      timestamp: "2026-10-29T12:00:05.000Z",
      message: { content: [{ type: "text", text: "On it." }] },
    }),
    human("2026-10-29T12:01:00.000Z", "continue"),
  ].join("\n");
  assert.deepEqual(
    distinct(readClaudeCode(log)).map((message) => message.text),
    ["continue", "continue"],
  );
});

test("the Freeflow's own submitted prompts are not the user's: the wait rows and the continue prompt are left out", () => {
  const log = [
    human("2026-10-29T12:00:00.000Z", "Freeflow: a wait row"),
    human(
      "2026-10-29T12:01:00.000Z",
      "Freeflow compacted the session after your checkpoint: the conversation is now your task's bundle. Continue from In flight and the Next action.",
    ),
    human("2026-10-29T12:02:00.000Z", "My own words."),
  ].join("\n");
  assert.deepEqual(
    readClaudeCode(log).map((message) => message.text),
    ["My own words."],
  );
  // The opening the reader leaves out is the one Freeflow's mod submits (a test against the source).
  const mod = readFileSync(resolve("hooks/claude/freeflow.mjs"), "utf8");
  assert.ok(
    mod.includes("Freeflow compacted the session after your checkpoint: the conversation is now your task's bundle."),
  );
});

test("an incremental read takes only the complete lines the transcript gained since the cursor; a shorter file or a changed tail is read whole", async () => {
  const folder = await mkdtemp(join(tmpdir(), "track-work-incremental-"));
  try {
    const path = join(folder, "log.jsonl");
    const first = `${human("2026-10-29T12:00:00.000Z", "One.")}\n`;
    await writeFile(path, first);
    const read = readTranscriptSince({ path });
    assert.deepEqual(
      read.messages.map((message) => message.text),
      ["One."],
    );
    const cursor = {
      transcript: path,
      kind: read.kind,
      offset: read.offset,
      turn: read.turn,
      last: read.last,
      tail: null,
      mode: read.mode,
    };
    cursor.tail = (await import("node:crypto"))
      .createHash("sha256")
      .update(
        Buffer.from(first)
          .subarray(Math.max(0, first.length - 256))
          .toString("utf8"),
      )
      .digest("hex")
      .slice(0, 16);
    // A growing file: only the new line is read, and a partial line waits.
    await writeFile(path, `${first}${human("2026-10-29T12:01:00.000Z", "Two.")}\n{"type":"user","timest`);
    const more = readTranscriptSince({ path, cursor });
    assert.deepEqual(
      more.messages.map((message) => message.text),
      ["Two."],
      "the partial line waits for its newline",
    );
    assert.ok(more.offset > read.offset && more.offset < (await stat(path)).size);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("userMessages reads a Codex rollout by its entries, not by its file name", async () => {
  const folder = await mkdtemp(join(tmpdir(), "track-work-codex-"));
  try {
    const path = join(folder, "rollout-2026-11-14.jsonl");
    await writeFile(path, `${CODEX}\n`);
    assert.deepEqual(
      userMessages({ transcript: path }).map((message) => message.text),
      ["Read the Codex rollout.", "Keep it on by default."],
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a Claude Code session's capture reads its own log, not a FREEFLOW_TRANSCRIPT another session left in its environment", async () => {
  await withStore(async ({ work, log, folder, home }) => {
    const config = join(folder, "claude-config");
    const id = "d5d6ba82-0000-4000-8000-000000000001";
    const own = join(config, "projects", "-work", `${id}.jsonl`);
    await mkdir(dirname(own), { recursive: true });
    await writeFile(own, `${human("2026-10-29T12:00:00.000Z", "My own message.")}\n`);
    const other = await log("other.jsonl", [human("2026-10-29T13:00:00.000Z", "Another session's message.")]);
    const result = spawnSync(process.execPath, [scriptPath, "discussion", "capture", "--no-push"], {
      cwd: work,
      encoding: "utf8",
      env: {
        ...process.env,
        FREEFLOW_HOME: home,
        FREEFLOW_SESSION: "",
        FREEFLOW_HARNESS: "Test",
        CLAUDE_CODE_SESSION_ID: id,
        CLAUDE_CONFIG_DIR: config,
        FREEFLOW_TRANSCRIPT: other,
        CLAUDECODE: "",
        CLAUDE_CODE_REMOTE: "",
        CLAUDE_CODE_REMOTE_SESSION_ID: "",
      },
    });
    ok(result);
    const captured = await readFile(join(home, "sessions", id, "discussion.md"), "utf8");
    assert.match(captured, /> My own message\./);
    assert.doesNotMatch(captured, /Another session's message/);
  });
});

test("a Pi session in a Claude Code container captures its own transcript: FREEFLOW_SESSION names it, so the Claude Code log is not read", async () => {
  await withStore(async ({ work, log, home }) => {
    const pi = await log("pi-session.jsonl", [human("2026-10-29T14:00:00.000Z", "A Pi message.")]);
    const result = spawnSync(process.execPath, [scriptPath, "discussion", "capture", "--no-push"], {
      cwd: work,
      encoding: "utf8",
      env: {
        ...process.env,
        FREEFLOW_HOME: home,
        FREEFLOW_SESSION: "pi-session-1",
        FREEFLOW_HARNESS: "Pi",
        FREEFLOW_TRANSCRIPT: pi,
        CLAUDE_CODE_SESSION_ID: "d5d6ba82-0000-4000-8000-000000000009",
        CLAUDE_CONFIG_DIR: join(home, "no-claude-logs"),
        CLAUDECODE: "",
        CLAUDE_CODE_REMOTE: "",
        CLAUDE_CODE_REMOTE_SESSION_ID: "",
      },
    });
    ok(result);
    assert.match(await readFile(join(home, "sessions", "pi-session-1", "discussion.md"), "utf8"), /> A Pi message\./);
  });
});

test("a plain export on standard input is captured (--transcript -), and a removed message is never taken again", async () => {
  await withStore(async ({ work, cli }) => {
    const { record } = createTask(cli);
    const out = cli(["discussion", "capture", "--transcript", "-"], {
      cwd: work,
      input: "User: From standard input.\nAssistant: Noted.\nUser: And a second one.\n",
    });
    ok(out);
    assert.match(out.stdout, /^Captured 2 message\(s\), M-1–M-2/);
    assert.match(ok(cli(["discussion", "list", "--record", record])), /M-1 · .* · From standard input\.\n/);
  });
});

test("task tidy is refused unless the session holds the task; the record is published whole", async () => {
  await withStore(async ({ cli, log }) => {
    const { record, taskDir } = createTask(cli);
    const block = "## B-001 — Old\n\n### You, 2026-10-29 12:00\n\n> Old words.\n";
    await mkdir(join(taskDir, "sources"), { recursive: true });
    await writeFile(join(taskDir, "sources", "discussion.md"), block);
    const refused = cli(["task", "tidy", "--id", "widget/task-001"], { session: "bbbbbbbb-2" });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /holds it|does not hold/);
    assert.equal(await readFile(join(taskDir, "sources", "discussion.md"), "utf8"), block, "nothing moved");
    ok(cli(["task", "tidy", "--id", "widget/task-001"]));
    assert.equal(await readFile(join(taskDir, "discussions", "discussion.md"), "utf8"), block);
    assert.match(await readFile(record, "utf8"), /^# First task/m);
  });
});

test("task take moves the session's pre-task messages into the task it takes, numbered on from its last message", async () => {
  await withStore(async ({ work, cli, log }) => {
    const { taskDir } = createTask(cli);
    const first = await log("a.jsonl", [human("2026-10-29T12:00:00.000Z", "Held by A.")]);
    ok(cli(["discussion", "capture", "--transcript", first], { cwd: work }));
    ok(cli(["task", "release", "--id", "widget/task-001"]));
    const second = await log("b.jsonl", [human("2026-10-29T13:00:00.000Z", "Before B takes it.")]);
    // B holds no task: its message lands in B's own session file.
    ok(cli(["discussion", "capture", "--transcript", second], { session: "bbbbbbbb-2", cwd: work }));
    ok(cli(["task", "take", "--id", "widget/task-001"], { session: "bbbbbbbb-2", cwd: work }));
    const text = await readFile(join(taskDir, "discussions", "2026-10-29.md"), "utf8");
    assert.match(text, /### M-2 · 13:00\n\n> Before B takes it\.\n/);
  });
});

test("a Claude Code process under a Pi shell captures its own log: --session names it, and the inherited Pi transcript is not read", async () => {
  await withStore(async ({ work, log, folder, home }) => {
    const config = join(folder, "claude-config-nested");
    const claudeId = "d5d6ba82-0000-4000-8000-00000000000a";
    await mkdir(join(config, "projects", "-work"), { recursive: true });
    await writeFile(
      join(config, "projects", "-work", `${claudeId}.jsonl`),
      `${human("2026-10-29T12:00:00.000Z", "The Claude process's own words.")}\n`,
    );
    const piLog = await log("pi.jsonl", [human("2026-10-29T12:30:00.000Z", "Pi's words.")]);
    const result = spawnSync(
      process.execPath,
      [scriptPath, "discussion", "capture", "--session", claudeId, "--no-push"],
      {
        cwd: work,
        encoding: "utf8",
        env: {
          ...process.env,
          FREEFLOW_HOME: home,
          FREEFLOW_SESSION: "pi-session-9",
          FREEFLOW_HARNESS: "Test",
          FREEFLOW_TRANSCRIPT: piLog,
          CLAUDE_CODE_SESSION_ID: claudeId,
          CLAUDE_CONFIG_DIR: config,
          CLAUDECODE: "",
          CLAUDE_CODE_REMOTE: "",
          CLAUDE_CODE_REMOTE_SESSION_ID: "",
        },
      },
    );
    ok(result);
    const captured = await readFile(join(home, "sessions", claudeId, "discussion.md"), "utf8");
    assert.match(captured, /> The Claude process's own words\./);
    assert.doesNotMatch(captured, /Pi's words/);
  });
});

test("a checkpoint captures the turn in progress before it writes the record, so its Recovery line can name that message", async () => {
  await withStore(async ({ work, log, home, cli, folder }) => {
    const { record, taskDir } = createTask(cli);
    const transcript = await log("turn.jsonl", [
      human("2026-10-29T12:00:00.000Z", "The message that started this turn."),
    ]);
    const result = spawnSync(process.execPath, [scriptPath, "checkpoint", "--record", record], {
      cwd: work,
      encoding: "utf8",
      input: "- Now: working.\n",
      env: {
        ...process.env,
        FREEFLOW_HOME: home,
        FREEFLOW_SESSION: "aaaaaaaa-1",
        FREEFLOW_HARNESS: "Test",
        FREEFLOW_TRANSCRIPT: transcript,
        CLAUDECODE: "",
        CLAUDE_CODE_SESSION_ID: "",
        CLAUDE_CODE_REMOTE: "",
        CLAUDE_CODE_REMOTE_SESSION_ID: "",
      },
    });
    ok(result);
    assert.match(
      await readFile(join(taskDir, "discussions", "2026-10-29.md"), "utf8"),
      /> The message that started this turn\./,
    );
    void folder;
  });
});
