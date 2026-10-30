import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const long = (word) => `${word} `.repeat(40).trim();

/** A Claude Code log: a result before a compaction, then a read, a one-line acknowledgement, a test run, and a worker's. */
function transcript() {
  const at = (minute) => `2026-10-30T10:${String(minute).padStart(2, "0")}:00.000Z`;
  const call = (minute, id, name, input, sidechain = false) => ({
    type: "assistant",
    isSidechain: sidechain,
    timestamp: at(minute),
    message: { content: [{ type: "tool_use", id, name, input }] },
  });
  const result = (minute, id, content, sidechain = false) => ({
    type: "user",
    isSidechain: sidechain,
    timestamp: at(minute),
    message: { content: [{ type: "tool_result", tool_use_id: id, content }] },
  });
  return [
    call(1, "toolu_old", "Bash", { command: "ls", description: "List the files" }),
    result(1, "toolu_old", long("before")),
    { type: "system", subtype: "compact_boundary", timestamp: at(2), compactMetadata: { preTokens: 9, postTokens: 1 } },
    call(3, "toolu_read", "Read", { file_path: "/work/src/app.js" }),
    result(3, "toolu_read", [{ type: "text", text: long("source") }]),
    call(4, "toolu_ack", "Bash", { command: "git add .", description: "Stage" }),
    result(4, "toolu_ack", "ok"),
    call(5, "toolu_test", "Bash", { command: "npm test", description: "Run the tests" }),
    result(5, "toolu_test", long("pass")),
    call(6, "toolu_worker", "Bash", { command: "pwd" }, true),
    result(6, "toolu_worker", long("worker"), true),
  ]
    .map((entry) => JSON.stringify(entry))
    .join("\n");
}

test("carry list numbers this compaction cycle's tool results; carry show prints one by number or by ID from any cycle", async () => {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "track-work-carry5-")));
  try {
    const log = join(folder, "session.jsonl");
    await writeFile(log, `${transcript()}\n`);
    const run = (...args) =>
      spawnSync(process.execPath, [scriptPath, ...args, "--transcript", log], { encoding: "utf8" });
    const list = run("carry", "list");
    assert.equal(list.status, 0, list.stderr);
    assert.equal(
      list.stdout,
      [
        "1. 10:03 · Read: /work/src/app.js · 70 tokens · toolu_read",
        "2. 10:04 · Bash: Stage · 1 tokens · toolu_ack",
        "3. 10:05 · Bash: Run the tests · 50 tokens · toolu_test",
        'Carry one with "- Carry: result <n> — <why>" in In flight; the checkpoint pins it to its ID.',
        "",
      ].join("\n"),
    );
    assert.match(
      run("carry", "show", "--id", "1").stdout,
      /^Read: \/work\/src\/app\.js · 2026-10-30T10:03:00\.000Z · toolu_read\nsource source/,
    );
    assert.match(
      run("carry", "show", "--id", "toolu_old").stdout,
      /^Bash: List the files · .* · toolu_old\nbefore before/,
    );
    const missing = run("carry", "show", "--id", "toolu_worker");
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No tool result toolu_worker/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a Carry line names a result: checkpoint pins its number to its ID, and the bundle carries it whole, then the newest others within the carry budget", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-carry5-record-")));
  try {
    const log = join(root, "session.jsonl");
    await writeFile(log, `${transcript()}\n`);
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: root });
    await writeFile(join(root, ".gitignore"), ".freeflow/\nsession.jsonl\n");
    const run = (args, input = "", env = {}) =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: root,
        encoding: "utf8",
        input,
        env: {
          ...process.env,
          FREEFLOW_TRANSCRIPT: log,
          CLAUDE_CODE_SESSION_ID: "",
          FREEFLOW_CONTEXT_WINDOW: "",
          ...env,
        },
      });
    const init = run(
      ["init", "--root", root, "--name", "Demo", "--cue", "read when the demo matters", "--input", "-"],
      "### Goal\n\n- A demo.\n\n### Next action\n\n- Build it.\n",
    );
    assert.equal(init.status, 0, init.stderr);
    const record = init.stdout.trim().split("\n")[0];
    // A number carry list has not given is refused, naming the transcript.
    const refused = run(
      ["checkpoint", "--record", record, "--input", "-"],
      "- Now: building.\n- Carry: result 9 — a test run\n",
    );
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /Carry names result 9, which is not in .*session\.jsonl; carry list numbers/);
    const pinned = run(
      ["checkpoint", "--record", record, "--input", "-"],
      "- Now: building.\n- Carry: result 1 — the source the next step edits\n",
    );
    assert.equal(pinned.status, 0, pinned.stderr);
    assert.match(
      await readFile(record, "utf8"),
      /\n- Carry: result toolu_read \(Read: \/work\/src\/app\.js\) — the source the next step edits\n/,
    );
    const bundle = run(["view", "bundle", "--record", record]).stdout;
    const carry = bundle.slice(bundle.indexOf("## Carry (counted)"), bundle.indexOf("## Recent results"));
    assert.match(
      carry,
      /<result id="toolu_read" call="Read: \/work\/src\/app\.js" at="2026-10-30T10:03:00\.000Z">\nsource source/,
    );
    // The newest others: the test run; not the carried read, the one-line acknowledgement, the result before the
    // compaction or a worker's.
    const recent = bundle.slice(bundle.indexOf("## Recent results"), bundle.indexOf("\n## Defined by (not counted)"));
    assert.match(recent, /^## Recent results \(counted, within the carry budget of 30,000 tokens\)\n/);
    assert.deepEqual(
      [...recent.matchAll(/<result id="([^"]+)"/g)].map((match) => match[1]),
      ["toolu_test"],
    );
    assert.match(bundle, /\n- Carried results: \d+ words, counted\n/);
    // With the result gone from the transcript, the checks say so.
    await writeFile(log, "");
    assert.match(
      run(["view", "recover", "--record", record]).stdout,
      /\n- Carry: result toolu_read is not in .*session\.jsonl\n/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
