import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { distinct, readClaudeCode, readPlain } from "../../../skills/track-work/scripts/lib/discussion5.mjs";

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

async function withTask(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-discussion5-"));
  try {
    const log = join(folder, "session.jsonl");
    await writeFile(log, `${LOG}\n`);
    const cli = (args, input = "") =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: folder,
        input,
        encoding: "utf8",
        env: { ...process.env, FREEFLOW_HOME: "", CLAUDE_CODE_SESSION_ID: "" },
      });
    const record = cli(
      [
        "init",
        "--schema",
        "5",
        "--root",
        folder,
        "--name",
        "Talking",
        "--cue",
        "read when discussion matters",
        "--input",
        "-",
      ],
      "### Goal\n- Talk.\n### Next action\n- Decide.\n",
    ).stdout.trim();
    // The record's last checkpoint is before the discussion, so list starts after it.
    const text = await readFile(record, "utf8");
    await writeFile(record, text.replace(/State as of: \S+/, "State as of: 2026-10-29T11:00:00.000Z"));
    await run({ folder, record, log, cli, discussion: join(dirname(record), "sources", "discussion.md") });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test("discussion list numbers the user's messages since the last checkpoint; save writes a block of chosen ones with the agent's lines", async () => {
  await withTask(async ({ record, log, cli, discussion }) => {
    assert.equal(
      ok(cli(["discussion", "list", "--record", record, "--transcript", log])),
      "1. 2026-10-29 12:00 · Should records keep the agent's replies?\n2. 2026-10-29 12:02 · Sent while you worked: keep it core.\n3. 2026-10-29 12:03 · <!-- reply 2 --> > Option 2 Blocks, yes.\n4. 2026-10-29 12:04 · And what about budgets?\n5. 2026-10-29 12:06 · ## A heading in my message\n",
    );
    const save = (args, notes) =>
      cli(["discussion", "save", "--record", record, "--transcript", log, ...args, "--input", "-"], notes);
    assert.match(
      save(["--messages", "1-3", "--title", "Replies", "--shapes", "A-001"], "1: asked whether to keep replies\n")
        .stderr,
      /missing for 2, 3/,
    );
    assert.match(
      save(["--messages", "1-9", "--title", "Replies", "--shapes", "A-001"], "").stderr,
      /outside the list's 1 to 5/,
    );
    assert.match(
      save(["--messages", "1", "--title", "Replies", "--shapes", "the agreement"], "1: x\n").stderr,
      /requires --shapes/,
    );
    assert.match(
      ok(
        save(
          ["--messages", "1-3", "--title", "Keeping replies", "--shapes", "A-001"],
          "1: opened the question of replies in records\n2: answering my three options: keep the user's messages, and keep it core\n3: answering option 2 of three (blocks of user messages): yes\n",
        ),
      ),
      /^Saved B-001 — Keeping replies: 3 message\(s\)\.\n/,
    );
    ok(
      save(
        ["--messages", "5", "--title", "Headings", "--shapes", "S-001"],
        "5: a message with a heading, kept quoted\n",
      ),
    );
    const text = await readFile(discussion, "utf8");
    assert.ok(
      text.startsWith("# Discussion: Talking\n\nThe user's messages that shaped the work, word for word, in blocks;"),
    );
    assert.ok(text.includes("Last block: B-002\n"));
    assert.ok(
      text.includes(
        "## B-001 — Keeping replies · 2026-10-29 12:00 to 12:03 · shapes A-001\n\n### You, 2026-10-29 12:00\n\n> Should records keep the agent's replies?\n\nAgent: opened the question of replies in records\n\n### You, 2026-10-29 12:02\n\n> Sent while you worked: keep it core.\n",
      ),
    );
    assert.ok(
      text.includes(
        "> <!-- reply 2 -->\n> > Option 2\n>\n> Blocks, yes.\n\nAgent: answering option 2 of three (blocks of user messages): yes\n",
      ),
    );
    assert.ok(
      text.endsWith(
        "## B-002 — Headings · 2026-10-29 12:06 to 12:06 · shapes S-001\n\n### You, 2026-10-29 12:06\n\n> ## A heading in my message\n\nAgent: a message with a heading, kept quoted\n",
      ),
    );
  });
});

test("a block that replaces another drops it; drop removes a block; block numbers are never reused", async () => {
  await withTask(async ({ record, log, cli, discussion }) => {
    const save = (args, notes) =>
      ok(cli(["discussion", "save", "--record", record, "--transcript", log, ...args, "--input", "-"], notes));
    save(["--messages", "1", "--title", "First take", "--shapes", "A-001"], "1: the question\n");
    save(["--messages", "4", "--title", "Budgets", "--shapes", "A-001"], "4: asked about budgets\n");
    assert.match(
      save(
        ["--messages", "1-3", "--title", "Second take", "--shapes", "A-001", "--replaces", "B-001"],
        "1: q\n2: core\n3: blocks\n",
      ),
      /dropped B-001, which it replaces/,
    );
    let text = await readFile(discussion, "utf8");
    assert.deepEqual(text.match(/^## B-\d+ — [^·]+/gm), ["## B-002 — Budgets ", "## B-003 — Second take "]);
    assert.match(text, /## B-003 — Second take · .+ · shapes A-001 · replaces B-001\n/);
    assert.match(
      ok(cli(["discussion", "drop", "--record", record, "--block", "B-003"])),
      /^Dropped B-003; Git keeps it\. 1 block\(s\) left\.\n/,
    );
    assert.match(
      ok(cli(["discussion", "drop", "--record", record, "--block", "B-002"])),
      /No blocks left: drop sources\/discussion\.md from Read on recovery/,
    );
    save(["--messages", "5", "--title", "After", "--shapes", "A-001"], "5: a heading\n");
    text = await readFile(discussion, "utf8");
    assert.match(text, /Last block: B-004\n/);
    assert.deepEqual(text.match(/^## B-\d+/gm), ["## B-004"]);
  });
});

test("checkpoint lists the blocks whose shaped work is closed in History", async () => {
  await withTask(async ({ record, log, cli }) => {
    ok(
      cli(
        ["agreement", "open", "--record", record, "--title", "Talk", "--input", "-"],
        '- Done when decided. You: "go" (2026-10-29)\n',
      ),
    );
    ok(
      cli(
        [
          "discussion",
          "save",
          "--record",
          record,
          "--transcript",
          log,
          "--messages",
          "1",
          "--title",
          "Question",
          "--shapes",
          "A-001",
          "--input",
          "-",
        ],
        "1: the question\n",
      ),
    );
    assert.doesNotMatch(ok(cli(["checkpoint", "--record", record])), /Discussion block/);
    ok(
      cli(
        ["agreement", "close", "--record", record, "--state", "completed", "--input", "-"],
        "- Cue: read when the talk matters\n- Result: Decided.\n- Task effect: None.\n",
      ),
    );
    assert.match(
      ok(cli(["checkpoint", "--record", record])),
      /Discussion block B-001 shaped A-001, now closed: drop it \(discussion drop --block B-001\) once nothing open rests on it\./,
    );
  });
});

test("a plain export can come from standard input, with the notes from a file", async () => {
  await withTask(async ({ folder, record, cli, discussion }) => {
    await writeFile(join(folder, "notes.txt"), "1: the only message\n");
    const out = ok(
      cli(
        [
          "discussion",
          "save",
          "--record",
          record,
          "--transcript",
          "-",
          "--messages",
          "1",
          "--title",
          "Plain",
          "--shapes",
          "A-001",
          "--input",
          join(folder, "notes.txt"),
        ],
        "User [2026-10-29T12:30:00Z]: From a plain export.\nAssistant: Noted.\n",
      ),
    );
    assert.match(out, /^Saved B-001 — Plain: 1 message\(s\)\./);
    assert.match(await readFile(discussion, "utf8"), /> From a plain export\.\n\nAgent: the only message\n/);
    // An export without times still gives a block; its span says so.
    await writeFile(join(folder, "untimed.txt"), "User: No time here.\nAssistant: Noted.\n");
    ok(
      cli(
        [
          "discussion",
          "save",
          "--record",
          record,
          "--transcript",
          join(folder, "untimed.txt"),
          "--messages",
          "1",
          "--title",
          "Untimed",
          "--shapes",
          "A-001",
          "--input",
          join(folder, "notes.txt"),
        ],
        "",
      ),
    );
    assert.match(
      await readFile(discussion, "utf8"),
      /## B-002 — Untimed · time not recorded · shapes A-001\n\n### You, time not recorded\n\n> No time here\.\n/,
    );
    assert.match(
      cli(
        [
          "discussion",
          "save",
          "--record",
          record,
          "--transcript",
          "-",
          "--messages",
          "1",
          "--title",
          "x",
          "--shapes",
          "A-001",
          "--input",
          "-",
        ],
        "User: x\n",
      ).stderr,
      /--transcript - reads standard input; give the notes with --input <file>/,
    );
  });
});
