import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  appendEvents,
  COMMAND_LIMIT,
  cutHeredoc,
  digest,
  KINDS,
  lineProblem,
  logPath,
  redact,
  renderSummary,
  summarize,
} from "../../../skills/track-work/scripts/lib/events5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

const ENV = {
  FREEFLOW_CONTEXT_WINDOW: "",
  FREEFLOW_TRANSCRIPT: "",
  CLAUDE_CODE_SESSION_ID: "",
  CLAUDE_CODE_REMOTE: "",
  CLAUDE_CODE_REMOTE_SESSION_ID: "",
  FREEFLOW_SESSION: "",
  GIT_CONFIG_NOSYSTEM: "1",
};

async function withFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-events5-"));
  const home = join(folder, "store");
  const env = (extra) => ({ ...process.env, FREEFLOW_HOME: home, ...ENV, ...extra });
  try {
    const cli = (args, { input = "", env: extra = {}, cwd = folder } = {}) =>
      spawnSync(process.execPath, [scriptPath, ...args], { cwd, input, encoding: "utf8", env: env(extra) });
    // The same command, running beside others, as two writers of one log do.
    const cliAsync = (args, { input = "", env: extra = {} } = {}) =>
      new Promise((done) => {
        const child = spawn(process.execPath, [scriptPath, ...args], { cwd: folder, env: env(extra) });
        let stderr = "";
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("close", (status) => done({ status, stderr }));
        child.stdin.end(input);
      });
    await run({ folder, home, cli, cliAsync });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const base = (session = "sess-1", ts = "2026-11-03T12:00:00.000Z") => ({
  v: 1,
  ts,
  session,
  harness: "claude-code",
  agent: "main",
});
const jsonl = (lines) =>
  `${lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n")}\n`;
const readLines = async (path) =>
  (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

test("schema v1: each kind's required fields, its values, and no field it does not name", () => {
  assert.equal(lineProblem({ ...base(), kind: "session.start", source: "startup", interactive: true }), null);
  assert.equal(lineProblem({ ...base(), kind: "session.start" }), "session.start requires source");
  assert.equal(
    lineProblem({ ...base(), kind: "session.start", source: "reboot" }),
    "session.start's source is not a value it takes",
  );
  assert.equal(lineProblem({ ...base(), v: 2, kind: "turn.start" }), "v must be 1");
  assert.equal(
    lineProblem({ ...base(), ts: "2026-11-03 12:00", kind: "turn.start" }),
    "ts must be an ISO 8601 UTC time with milliseconds",
  );
  assert.match(lineProblem({ ...base("../escape"), kind: "turn.start" }), /^session must be a session ID/);
  // Codex's driver writes "codex" (SPEC-012); a harness with no driver is still refused.
  assert.equal(lineProblem({ ...base(), harness: "codex", kind: "turn.start" }), null);
  assert.match(lineProblem({ ...base(), harness: "cursor", kind: "turn.start" }), /^harness must be one of/);
  assert.match(lineProblem({ ...base(), kind: "prompt" }), /^kind must be one of/);
  // Never contents (P4): a tool's output, a prompt, an answer, a file's text have no field to go in.
  assert.equal(
    lineProblem({ ...base(), kind: "tool.call", tool: "Read", ok: true, source: "agent", output: "file text" }),
    "tool.call takes no field output",
  );
  assert.equal(
    lineProblem({ ...base(), kind: "model.request", model: "m", prompt: "hi" }),
    "model.request takes no field prompt",
  );
  assert.equal(lineProblem({ ...base(), kind: "tool.call", tool: "Bash", ok: true }), "tool.call requires source");
  assert.equal(
    lineProblem({ ...base(), kind: "tool.call", tool: "Bash", ok: true, source: "agent", exit: 1.5 }),
    "tool.call's exit is not a value it takes",
  );
  assert.equal(lineProblem({ ...base(), kind: "agent.spawn", delegation: "D-012.1", model: "haiku" }), null);
  assert.equal(
    lineProblem({ ...base(), kind: "agent.spawn", delegation: "S-012" }),
    "agent.spawn's delegation is not a value it takes",
  );
  assert.equal(lineProblem({ ...base(), kind: "compaction", by: "freeflow", before: 90000, after: 12000 }), null);
  assert.deepEqual(Object.keys(KINDS), [
    "session.start",
    "session.end",
    "turn.start",
    "turn.end",
    "model.request",
    "tool.call",
    "compaction",
    "agent.spawn",
    "agent.stop",
    "gate",
    "agreement",
    "freeflow",
    "governor",
    "sent",
  ]);
});

test("an older log's governor line still reads, and the summary no longer counts or prints it (D-058)", () => {
  const governor = (fields) => ({ ...base(), kind: "governor", ...fields });
  const row = { cap: "pace", unit: "percent", limit: 14.3, use: 11.6, response: "row" };
  assert.equal(lineProblem(governor(row)), null);
  assert.equal(lineProblem(governor({ ...row, cap: "five_hour" })), "governor's cap is not a value it takes");
  assert.equal(lineProblem(governor({ ...row, use: -1 })), "governor's use is not a value it takes");
  assert.equal(lineProblem(governor({ ...row, response: "stop" })), "governor's response is not a value it takes");
  assert.equal(lineProblem(governor({ cap: "task", unit: "usd", limit: 4, use: 4.2 })), "governor requires response");
  const summary = summarize([governor(row), { ...base("s", "2026-11-03T11:00:00.000Z"), kind: "governor", ...row }], {
    session: "s",
  });
  assert.equal(summary.governor, undefined);
  assert.doesNotMatch(renderSummary(summary), /Governor/);
});

test("redaction replaces keys and tokens in a command before it is written", () => {
  const cases = [
    ["curl -H 'Authorization: Bearer abc.def-123'", "curl -H 'Authorization: Bearer [redacted]'"],
    ["export ANTHROPIC_API_KEY=sk-ant-api03-AbCdEfGhIjKlMnOpQrSt", "export ANTHROPIC_API_KEY=[redacted]"],
    ["echo sk-ant-api03-AbCdEfGhIjKlMnOpQrSt", "echo [redacted]"],
    ["git push https://ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/x", "git push https://[redacted]@github.com/x"],
    ["gh auth login --with-token github_pat_11ABCDEFG0123456789_abcdefghij", "gh auth login --with-token [redacted]"],
    ["slack xoxb-1234567890-abcdefghij", "slack [redacted]"],
    ["aws AKIAABCDEFGHIJKLMNOP s3 ls", "aws [redacted] s3 ls"],
    ["mysql --password=hunter2 -u root", "mysql --password=[redacted] -u root"],
    ["curl 'https://x/api?token=abc&page=2'", "curl 'https://x/api?token=[redacted]&page=2'"],
    ['deploy secret="two words" now', "deploy secret=[redacted] now"],
    ["npm test", "npm test"],
  ];
  for (const [given, written] of cases) assert.equal(redact(given), written, given);
});

test("events append sets seq per log under a lock, redacts and cuts commands, and refuses what is not schema v1", async () => {
  await withFolder(async ({ home, cli }) => {
    const long = `node build.mjs ${"--flag ".repeat(60)}TOKEN=abc123`;
    const first = ok(
      cli(["events", "append", "--input", "-"], {
        input: jsonl([
          { ...base(), kind: "session.start", source: "startup", interactive: true },
          { ...base(), seq: 99, kind: "tool.call", tool: "Bash", ok: true, ms: 12, command: long, source: "agent" },
          { ...base("sess-2"), kind: "turn.start", turn: 1 },
          { ...base(), kind: "tool.call", tool: "Read", ok: true, source: "agent", output: "secret text" },
          "not json",
          "",
        ]),
      }),
    );
    assert.match(first, /^Wrote 3 event line\(s\) to .*sess-1\.jsonl\.\nWrote 1 event line\(s\) to .*sess-2\.jsonl\./);
    assert.match(first, /\nRefused line 4: tool.call takes no field output\.\nRefused line 5: not JSON\.\n$/);
    const lines = await readLines(join(home, "events", "sess-1.jsonl"));
    assert.deepEqual(
      lines.map((line) => [line.seq, line.kind]),
      [
        [1, "session.start"],
        [2, "tool.call"],
        [3, "freeflow"],
      ],
    );
    // The driver's seq is not the writer's; the command is redacted, then cut, on one line.
    assert.equal(lines[1].command.length, COMMAND_LIMIT);
    assert.match(lines[1].command, /…$/);
    assert.doesNotMatch(JSON.stringify(lines), /abc123|secret text/);
    assert.equal(lines[2].what, "dropped");
    assert.equal(lines[2].dropped, 2);
    assert.equal(lines[2].detail, "refused by events append: line 4, tool.call takes no field output");
    assert.deepEqual(Object.keys(lines[0]), [
      "v",
      "ts",
      "seq",
      "session",
      "harness",
      "agent",
      "kind",
      "source",
      "interactive",
    ]);

    // The next batch goes on from the file's last seq, past a torn line a dead writer left.
    await writeFile(
      join(home, "events", "sess-1.jsonl"),
      `${await readFile(join(home, "events", "sess-1.jsonl"), "utf8")}{"v":1,"se`,
    );
    ok(
      cli(["events", "append", "--input", "-"], { input: jsonl([{ ...base(), kind: "turn.end", reason: "answer" }]) }),
    );
    const shown = ok(cli(["events", "show", "--session", "sess-1", "--kind", "turn.end"]));
    assert.equal(JSON.parse(shown).seq, 4);
    const all = cli(["events", "show", "--session", "sess-1"]);
    assert.equal(all.stdout.trim().split("\n").length, 4);
    assert.match(all.stderr, /^Skipped unreadable line\(s\) 4 of .*sess-1\.jsonl\.\n$/);
  });
});

test("two writers of one log never share a seq; a stale lock is cleared, a live one makes the batch fail", async () => {
  await withFolder(async ({ home, cli, cliAsync }) => {
    const batch = (writer) =>
      jsonl(
        Array.from({ length: 20 }, (_, index) => ({
          ...base(),
          kind: "tool.call",
          tool: `Writer${writer}`,
          ok: true,
          ms: index,
          source: "agent",
        })),
      );
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((writer) => cliAsync(["events", "append", "--input", "-"], { input: batch(writer) })),
    );
    for (const result of results) assert.equal(result.status, 0, result.stderr);
    const lines = await readLines(join(home, "events", "sess-1.jsonl"));
    assert.deepEqual(
      lines.map((line) => line.seq),
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    // Each batch is written whole, never interleaved with another.
    for (let at = 0; at < 100; at += 20)
      assert.equal(new Set(lines.slice(at, at + 20).map((line) => line.tool)).size, 1);

    const lock = join(home, "events", "sess-1.jsonl.lock");
    await writeFile(lock, "");
    const old = new Date(Date.now() - 60_000);
    await utimes(lock, old, old);
    ok(cli(["events", "append", "--input", "-"], { input: jsonl([{ ...base(), kind: "turn.start", turn: 2 }]) }));
    assert.equal(existsSync(lock), false);

    await writeFile(lock, "");
    const held = cli(["events", "append", "--input", "-"], {
      input: jsonl([{ ...base(), kind: "turn.start", turn: 3 }]),
    });
    assert.equal(held.status, 1);
    assert.match(held.stderr, /sess-1\.jsonl is locked by another writer .*; this batch was not written/);
    assert.equal((await readLines(join(home, "events", "sess-1.jsonl"))).length, 101);
  });
});

test("the event log stays out of the store's Git, and a home with only a log still takes a store", async () => {
  await withFolder(async ({ home, cli }) => {
    const holder = { FREEFLOW_SESSION: "aaaaaaaa-1111", FREEFLOW_HARNESS: "Probe" };
    ok(cli(["events", "append", "--input", "-"], { input: jsonl([{ ...base("aaaaaaaa-1111"), kind: "turn.start" }]) }));
    ok(cli(["store", "init", "--git-name", "Test User", "--git-email", "t@example.com"], { env: holder }));
    assert.equal((await readLines(join(home, "events", "aaaaaaaa-1111.jsonl"))).length, 1);
    assert.match(await readFile(join(home, ".gitignore"), "utf8"), /^\/events\/$/m);
    // A store made before the log existed gains the ignore line at the first append.
    await writeFile(join(home, ".gitignore"), "scratch/\nlocal/\nsessions/\n");
    ok(cli(["events", "append", "--input", "-"], { input: jsonl([{ ...base("aaaaaaaa-1111"), kind: "turn.end" }]) }));
    assert.equal(await readFile(join(home, ".gitignore"), "utf8"), "scratch/\nlocal/\nsessions/\n/events/\n");
    const tracked = spawnSync("git", ["-C", home, "status", "--porcelain", "--untracked-files=all"], {
      encoding: "utf8",
    });
    assert.doesNotMatch(tracked.stdout, /events\//);
  });
});

test("checkpoint and release commit the session's event summary since it took the task", async () => {
  await withFolder(async ({ folder, home, cli }) => {
    const holder = { FREEFLOW_SESSION: "aaaaaaaa-1111", FREEFLOW_HARNESS: "Probe" };
    ok(cli(["store", "init", "--git-name", "Test User", "--git-email", "t@example.com"], { env: holder }));
    ok(cli(["project", "new", "--name", "Widget"], { env: holder }));
    const work = join(folder, "widget");
    await mkdir(work);
    ok(
      cli(
        [
          "task",
          "create",
          "--title",
          "Probe",
          "--goal",
          "Probe the log.",
          "--cue",
          "read when probing",
          "--project",
          "widget",
        ],
        { env: holder, cwd: work },
      ),
    );
    const taskDir = join(home, "projects", "widget", "tasks", "task-001-probe");
    const summaryPath = join(taskDir, "events", "aaaaaaaa-1111.json");
    // No log yet: nothing to summarize, and the checkpoint says nothing of it.
    assert.doesNotMatch(ok(cli(["checkpoint", "--record", "widget/task-001"], { env: holder, cwd: work })), /Events:/);
    assert.equal(existsSync(summaryPath), false);

    const now = Date.now();
    const at = (ms) => new Date(now + ms).toISOString();
    ok(
      cli(["events", "append", "--input", "-"], {
        input: jsonl([
          // Before the task was taken: left out of its summary.
          {
            ...base("aaaaaaaa-1111", "2020-01-01T00:00:00.000Z"),
            kind: "tool.call",
            tool: "Bash",
            ok: true,
            source: "agent",
          },
          {
            ...base("aaaaaaaa-1111", at(1)),
            kind: "model.request",
            model: "claude-opus-5-5",
            effort: "high",
            in: 3,
            out: 100,
            cacheRead: 900,
            cacheWrite: 40,
          },
          {
            ...base("aaaaaaaa-1111", at(2)),
            kind: "model.request",
            model: "claude-opus-5-5",
            effort: "high",
            in: 2,
            out: 50,
            cacheRead: 1000,
            cacheWrite: 10,
          },
          {
            ...base("aaaaaaaa-1111", at(3)),
            agent: "w1",
            kind: "model.request",
            model: "claude-haiku-5-5",
            effort: "xhigh",
            in: 1,
            out: 10,
          },
          { ...base("aaaaaaaa-1111", at(4)), kind: "tool.call", tool: "Bash", ok: false, exit: 1, source: "freeflow" },
          {
            ...base("aaaaaaaa-1111", at(5)),
            kind: "tool.call",
            tool: "Edit",
            ok: true,
            paths: ["src/a.ts"],
            source: "agent",
          },
          { ...base("aaaaaaaa-1111", at(6)), kind: "tool.call", tool: "Bash", ok: true, source: "agent" },
          { ...base("aaaaaaaa-1111", at(7)), kind: "compaction", by: "freeflow", before: 90000, after: 9000 },
          { ...base("aaaaaaaa-1111", at(8)), kind: "agent.spawn", delegation: "D-001", model: "claude-haiku-5-5" },
          { ...base("aaaaaaaa-1111", at(9)), agent: "w1", kind: "agent.stop", blocked: true },
        ]),
      }),
    );
    const checkpoint = ok(cli(["checkpoint", "--record", "widget/task-001"], { env: holder, cwd: work }));
    assert.match(
      checkpoint,
      /\nEvents: summary written to events\/aaaaaaaa-1111\.json in the task folder\.\nStore: committed/,
    );
    const summary = JSON.parse(await readFile(summaryPath, "utf8"));
    assert.equal(summary.task, "widget/task-001");
    assert.equal(summary.harness, "claude-code");
    assert.equal(summary.events, 9);
    assert.equal(summary.modelRequests, 3);
    assert.deepEqual(summary.tokens, [
      { model: "claude-haiku-5-5", effort: "xhigh", requests: 1, in: 1, out: 10, cacheRead: 0, cacheWrite: 0 },
      { model: "claude-opus-5-5", effort: "high", requests: 2, in: 5, out: 150, cacheRead: 1900, cacheWrite: 50 },
    ]);
    assert.equal(summary.toolCalls, 3);
    assert.deepEqual(summary.tools, [
      { tool: "Bash", calls: 2, failed: 1 },
      { tool: "Edit", calls: 1, failed: 0 },
    ]);
    assert.deepEqual(summary.compactions, { freeflow: 1, harness: 0 });
    assert.deepEqual(summary.workers, { spawned: 1, stopped: 1, blocked: 1 });
    assert.deepEqual(summary.freeflow, { toolCalls: 1, share: 0.333 });
    // The summary is committed with the checkpoint; the log itself never is.
    const committed = spawnSync("git", ["-C", home, "ls-files"], { encoding: "utf8" }).stdout;
    assert.match(committed, /^projects\/widget\/tasks\/task-001-probe\/events\/aaaaaaaa-1111\.json$/m);
    assert.doesNotMatch(committed, /\.jsonl/);

    const printed = ok(cli(["events", "summary"], { env: holder }));
    assert.match(printed, /^Events for session aaaaaaaa-1111, widget\/task-001: 9 line\(s\) from /);
    assert.match(printed, /\n  claude-opus-5-5 high: 2 request\(s\), 5 in, 50 written, 1,900 read, 150 out\n/);
    assert.match(printed, /\nTool calls: 3, 1 of them Freeflow's own \(33%\)\n  Bash: 2, 1 failed\n  Edit: 1\n/);
    assert.match(printed, /\nWorkers: 1 started, 1 stopped, 1 sent back\n/);
    // Gate lines (SPEC-008) are counted on their own line; this log has none.
    assert.match(printed, /\nGates: delegation 0 would-fire\n$/);
    // Another session's view of this log is the whole log: it holds no task.
    assert.match(ok(cli(["events", "summary", "--session", "aaaaaaaa-1111"])), /: 10 line\(s\) from 2020-01-01/);
    assert.match(ok(cli(["events", "summary"])), /^- aaaaaaaa-1111: \d[\d,]* bytes, last written /);

    ok(
      cli(["events", "append", "--input", "-"], {
        input: jsonl([{ ...base("aaaaaaaa-1111", at(10)), kind: "session.end", reason: "exit" }]),
      }),
    );
    const released = ok(cli(["task", "release"], { env: holder }));
    assert.match(
      released,
      /^Released widget\/task-001\.\nEvents: summary written to events\/aaaaaaaa-1111\.json in the task folder\.\n/,
    );
    assert.equal(JSON.parse(await readFile(summaryPath, "utf8")).events, 10);
    assert.equal(spawnSync("git", ["-C", home, "status", "--porcelain"], { encoding: "utf8" }).stdout, "");
  });
});

test("summarize counts dropped lines and leaves out what came before since", () => {
  const lines = [
    { ...base("s", "2026-11-03T10:00:00.000Z"), kind: "tool.call", tool: "Bash", ok: true, source: "agent" },
    { ...base("s", "2026-11-03T11:00:00.000Z"), kind: "freeflow", what: "dropped", dropped: 4 },
    { ...base("s", "2026-11-03T11:30:00.000Z"), kind: "made.up", extra: 1 },
  ];
  const summary = summarize(lines, { session: "s", since: "2026-11-03T10:30:00.000Z" });
  assert.equal(summary.events, 2);
  assert.equal(summary.toolCalls, 0);
  assert.equal(summary.dropped, 4);
  assert.equal(summary.until, "2026-11-03T11:30:00.000Z");
});

test("the schema takes a notice's and a row's context and point, a checkpoint kind, and a compaction's cycle", () => {
  const at = { ...base(), kind: "freeflow", what: "notice", detail: "cycle 1", context: 148_000, point: 147_000 };
  assert.equal(lineProblem(at), null);
  assert.equal(lineProblem({ ...base(), kind: "freeflow", what: "checkpoint", detail: "compact, session" }), null);
  assert.equal(
    lineProblem({ ...base(), kind: "compaction", trigger: "auto", by: "freeflow", before: 150_000, cycle: 2 }),
    null,
  );
  assert.match(lineProblem({ ...base(), kind: "freeflow", what: "notice", context: "148000" }), /context/);
  assert.match(lineProblem({ ...base(), kind: "freeflow", what: "notice", point: -1 }), /point/);
});

test("the summary measures the tokens from a cycle's notice to the checkpoint that answered it; old row lines are not measured", () => {
  const freeflow = (what, fields = {}) => ({ ...base(), kind: "freeflow", what, ...fields });
  const lines = [
    freeflow("row", { detail: "cycle 1, 70%", context: 100_000, point: 147_000 }),
    freeflow("notice", { detail: "cycle 1", context: 148_000, point: 147_000 }),
    freeflow("checkpoint", { detail: "compact, session", context: 160_000 }),
    { ...base(), kind: "compaction", trigger: "auto", by: "freeflow", before: 161_000, cycle: 1 },
    freeflow("row", { detail: "cycle 2, 50%", context: 100_000, point: 147_000 }),
    freeflow("checkpoint", { detail: "plain", context: 110_000 }),
    { ...base(), kind: "compaction", trigger: "auto", by: "harness", before: 150_000, cycle: 2 },
    freeflow("notice", { detail: "cycle 3", context: 149_000, point: 147_000 }),
    freeflow("checkpoint", { detail: "plain", context: 151_000 }),
  ];
  const summary = summarize(lines, { session: "sess-1" });
  assert.deepEqual(summary.toCheckpoint, [{ from: "notice", cycles: 2, median: 7_000, largest: 12_000 }]);
  const text = renderSummary(summary);
  assert.match(text, /^Notice to checkpoint: 2 cycle\(s\), median 7,000, largest 12,000$/m);
  assert.doesNotMatch(text, /Row to checkpoint/);
  // A session with rows and no notice measures nothing: rows are no longer a signal before compaction.
  assert.equal(
    summarize([freeflow("row", { context: 1 }), freeflow("checkpoint", { context: 5 })], { session: "s" }).toCheckpoint,
    undefined,
  );
});
test("a checkpoint writes its own freeflow line, with what it was and the context its transcript shows, and says nothing when the log is off", async () => {
  await withFolder(async ({ folder, home, cli }) => {
    const transcript = join(folder, "session.jsonl");
    const entry = (usage) => JSON.stringify({ type: "assistant", message: { usage } });
    await writeFile(
      transcript,
      [
        entry({ input_tokens: 5, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 0, output_tokens: 10 }),
        entry({
          input_tokens: 3,
          cache_read_input_tokens: 140_000,
          cache_creation_input_tokens: 0,
          output_tokens: 100,
        }),
      ].join("\n") + "\n",
    );
    const summary = [
      "## Goal",
      "- Probe the checkpoint line.",
      "## Settled",
      "(none)",
      "## Open",
      "(none)",
      "## Agreement",
      "(none)",
      "## In flight",
      "(none)",
      "## Recovery",
      "(none)",
      "## Next action",
      "- Read the log.",
    ].join("\n");
    const claude = {
      CLAUDE_CODE_SESSION_ID: "cafe0000-1111",
      FREEFLOW_HARNESS: "Claude Code",
      FREEFLOW_TRANSCRIPT: transcript,
    };
    ok(cli(["checkpoint", "--session", "--compact", "--input", "-"], { input: summary, env: claude }));
    const log = join(home, "events", "cafe0000-1111.jsonl");
    const lines = (await readLines(log)).filter((line) => line.what === "checkpoint");
    assert.equal(lines.length, 1);
    assert.equal(lines[0].detail, "compact, session");
    assert.equal(lines[0].context, 140_103);
    assert.equal(lines[0].harness, "claude-code");

    // With the log off (events.enabled off, which the claims file says), the checkpoint still works and writes nothing.
    await mkdir(join(home, "sessions", "beef0000-2222"), { recursive: true });
    await writeFile(
      join(home, "sessions", "beef0000-2222", "capabilities.json"),
      JSON.stringify({ v: 1, events: false }),
    );
    const off = { FREEFLOW_SESSION: "beef0000-2222", FREEFLOW_HARNESS: "Pi" };
    const out = cli(["checkpoint", "--session", "--input", "-"], { input: summary, env: off });
    assert.equal(out.status, 0, out.stderr);
    assert.equal(existsSync(join(home, "events", "beef0000-2222.jsonl")), false);
  });
});

test("a command's heredoc body is never written to the event log: a command is cut at its first heredoc operator", async () => {
  await withFolder(async ({ home }) => {
    assert.equal(cutHeredoc("cat x <<-EOF\nbody\nEOF"), "cat x <<…");
    assert.equal(cutHeredoc("cat x <<<word"), "cat x <<…");
    assert.equal(cutHeredoc("echo no heredoc"), "echo no heredoc");
    const body = "MARKER_BODY_TEXT that is a file's content";
    const heredoc = `cat > notes.md <<'EOF'\n${body}\nEOF`;
    const long = `${"x".repeat(150)} <<EOF\n${body}\nEOF`;
    const plain = `echo ${"y".repeat(300)}`;
    const batch = jsonl(
      [heredoc, long, plain].map((command) => ({
        ...base("sess-heredoc"),
        kind: "tool.call",
        tool: "Bash",
        ok: true,
        source: "agent",
        command,
      })),
    );
    const { written, refused } = await appendEvents(home, batch);
    assert.equal(refused.length, 0);
    assert.equal(written[0].count, 3);
    const lines = await readLines(logPath(home, "sess-heredoc"));
    assert.equal(lines[0].command, "cat > notes.md <<…");
    assert.equal(lines[1].command, `${"x".repeat(150)} <<…`);
    assert.equal(lines[2].command.length, 200);
    assert.ok(lines[2].command.endsWith("…"));
    assert.equal(
      lines.some((line) => JSON.stringify(line).includes("MARKER_BODY_TEXT")),
      false,
    );
  });
});

test("a sent line keeps the whole text it sent, redacted and never cut; the writer sets its chars and sha from the text as sent", async () => {
  await withFolder(async ({ home }) => {
    const text = `Freeflow, context cycle 1: token=abc123secret\n${"notice text ".repeat(40)}`;
    const sent = { ...base(), kind: "sent", what: "notice", text };
    assert.equal(lineProblem(sent), null);
    assert.equal(lineProblem({ ...sent, what: "bogus" }), "sent's what is not a value it takes");
    assert.equal(lineProblem({ ...sent, text: "   " }), "sent's text is not a value it takes");
    assert.equal(lineProblem({ ...sent, chars: -1 }), "sent's chars is not a value it takes");
    assert.equal(lineProblem({ ...sent, sha: "not-a-digest" }), "sent's sha is not a value it takes");
    const { written, refused } = await appendEvents(home, jsonl([sent]));
    assert.equal(refused.length, 0);
    assert.equal(written[0].count, 1);
    const [line] = await readLines(logPath(home, "sess-1"));
    assert.equal(line.kind, "sent");
    assert.equal(line.what, "notice");
    assert.equal(line.text, text.replace("abc123secret", "[redacted]"));
    assert.equal(line.text.length > COMMAND_LIMIT, true);
    assert.match(line.text, /\n/);
    assert.equal(line.chars, text.length);
    assert.equal(line.sha, digest(text));
    assert.equal(line.sha.length, 12);
    assert.equal(redact("Bearer abc.def"), "Bearer [redacted]");
  });
});

test('redact replaces each form the event-log doc lists: word=value, word = value, word: value, JSON "word": "value", a PEM key block; a secret in none of them is kept', () => {
  assert.equal(redact("password=hunter2"), "password=[redacted]");
  assert.equal(redact("API_KEY = x9y8z7"), "API_KEY = [redacted]");
  assert.equal(redact("password: hunter2"), "password: [redacted]");
  assert.equal(redact('{"apiKey": "abc123"}'), '{"apiKey": [redacted]}');
  assert.equal(
    redact("-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----"),
    "[redacted]",
  );
  // A secret written in no listed form stays as it is: the doc says so.
  assert.equal(redact("the value hunter2 is in the text"), "the value hunter2 is in the text");
});

test("events sent lists a session's sent lines newest first; --what keeps one source; --show prints one whole", async () => {
  await withFolder(async ({ cli }) => {
    ok(
      cli(["events", "append", "--input", "-"], {
        input: jsonl([
          {
            ...base("sess-1", "2026-11-03T10:00:00.000Z"),
            kind: "sent",
            what: "session-start",
            text: "Guidance.\nmore",
          },
          {
            ...base("sess-1", "2026-11-03T10:05:00.000Z"),
            kind: "sent",
            what: "notice",
            text: `Notice ${"x".repeat(150)}`,
          },
          { ...base("sess-1", "2026-11-03T10:06:00.000Z"), kind: "tool.call", tool: "Read", ok: true, source: "agent" },
          { ...base("sess-1", "2026-11-03T10:07:00.000Z"), kind: "sent", what: "notice", text: "Second notice" },
        ]),
      }),
    );
    const rows = ok(cli(["events", "sent", "--session", "sess-1"]))
      .trimEnd()
      .split("\n");
    assert.equal(rows.length, 3);
    assert.equal(rows[0], "1  2026-11-03T10:07:00.000Z  notice  13 chars  Second notice");
    assert.match(rows[1], /^2  2026-11-03T10:05:00\.000Z  notice  157 chars  Notice x+…$/);
    assert.equal(rows[1].split("  ").pop().length, 80);
    assert.equal(rows[2], "3  2026-11-03T10:00:00.000Z  session-start  14 chars  Guidance.");
    assert.equal(
      ok(cli(["events", "sent", "--session", "sess-1", "--what", "session-start"])).trimEnd(),
      "1  2026-11-03T10:00:00.000Z  session-start  14 chars  Guidance.",
    );
    assert.equal(
      ok(cli(["events", "sent", "--session", "sess-1", "--what", "catch-up"])),
      "No sent lines (what catch-up) in session sess-1.\n",
    );
    assert.equal(ok(cli(["events", "sent", "--session", "sess-1", "--show", "1"])), "Second notice\n");
    assert.equal(ok(cli(["events", "sent", "--session", "sess-1", "--show", "2"])), `Notice ${"x".repeat(150)}\n`);
    const outside = cli(["events", "sent", "--session", "sess-1", "--show", "9"]);
    assert.notEqual(outside.status, 0);
    assert.match(outside.stderr, /--show takes a number from 1 to 3/);
    const unknown = cli(["events", "sent", "--session", "sess-1", "--what", "bogus"]);
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /--what is one of session-start, menu, catch-up/);
  });
});

test("the summary counts the text sent by source, and a task summary carries the counts, never the text", () => {
  const sent = (what, text) => ({ ...base(), kind: "sent", what, text });
  const summary = summarize(
    [sent("notice", "NOTICE TEXT"), sent("menu", "MENU TEXT"), sent("notice", "NOTICE TEXT 2")],
    { session: "sess-1" },
  );
  assert.deepEqual(summary.sent, { lines: 3, by: { menu: 1, notice: 2 } });
  assert.match(renderSummary(summary), /^Sent: 3 \(by what: menu 1, notice 2\)$/m);
  assert.equal(JSON.stringify(summary).includes("NOTICE TEXT"), false);
  assert.match(renderSummary(summarize([], { session: "sess-1" })), /^Sent: 0$/m);
});
