import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  COMMAND_LIMIT,
  KINDS,
  lineProblem,
  redact,
  renderSummary,
  summarize,
} from "../../../skills/track-work/scripts/lib/events5.mjs";
import { PRICES, requestCost } from "../../../skills/track-work/scripts/lib/measure5.mjs";

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
  ]);
});

test("a governor line names its cap, unit, limit, use and response, and the summary prints each one", () => {
  const governor = (fields) => ({ ...base(), kind: "governor", ...fields });
  const row = { cap: "pace", unit: "percent", limit: 14.3, use: 11.6, response: "row" };
  assert.equal(lineProblem(governor(row)), null);
  assert.equal(lineProblem(governor({ ...row, cap: "five_hour" })), "governor's cap is not a value it takes");
  assert.equal(lineProblem(governor({ ...row, use: -1 })), "governor's use is not a value it takes");
  assert.equal(lineProblem(governor({ ...row, response: "stop" })), "governor's response is not a value it takes");
  assert.equal(lineProblem(governor({ cap: "task", unit: "usd", limit: 4, use: 4.2 })), "governor requires response");
  const lines = [
    { ...base("s", "2026-11-03T10:00:00.000Z"), kind: "governor", ...row },
    {
      ...base("s", "2026-11-03T11:00:00.000Z"),
      kind: "governor",
      cap: "task",
      unit: "usd",
      limit: 4,
      use: 4.25,
      response: "ask",
    },
  ];
  const summary = summarize(lines, { session: "s" });
  assert.deepEqual(
    summary.governor.map((each) => [each.cap, each.response]),
    [
      ["pace", "row"],
      ["task", "ask"],
    ],
  );
  assert.equal(summarize([], { session: "s" }).governor, undefined);
  const text = renderSummary(summary);
  assert.match(text, /^Governor: 2 response\(s\)$/m);
  assert.match(text, /^ {2}2026-11-03T10:00:00\.000Z: the daily pace at 11\.6% of 14\.3%, a row$/m);
  assert.match(text, /^ {2}2026-11-03T11:00:00\.000Z: the task's cost at \$4\.25 of \$4\.00, the ask to stop$/m);
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
    assert.match(printed, /\nGates: agreement 0, slice 0, delivery 0, delegation 0 would-fire\n$/);
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

// SPEC-011 4.1: the overhead fields, Freeflow's estimated share of the input, and the cost at list price.
test("the overhead fields validate: a request's turn, a tool result's size, and what Freeflow put in the context", () => {
  const ok = (line) => assert.equal(lineProblem({ ...base(), ...line }), null);
  ok({ kind: "model.request", model: "claude-haiku-5-5", turn: 3, in: 1 });
  ok({ kind: "tool.call", tool: "Bash", ok: true, source: "agent", outChars: 0 });
  ok({ kind: "freeflow", what: "bundle", chars: 1200 });
  ok({ kind: "freeflow", what: "guidance", chars: 900 });
  assert.match(
    lineProblem({ ...base(), kind: "tool.call", tool: "Bash", ok: true, source: "agent", outChars: -1 }),
    /outChars/,
  );
  assert.match(lineProblem({ ...base(), kind: "freeflow", what: "notice", chars: 1.5 }), /chars/);
  assert.match(lineProblem({ ...base(), kind: "model.request", model: "m", turn: "1" }), /turn/);
});

test("the summary's overhead matches a hand count, and its cost matches Track Work's for the same requests", () => {
  const at = (minute) => `2026-11-04T10:${String(minute).padStart(2, "0")}:00.000Z`;
  const request = (minute, fields) => ({
    ...base("s", at(minute)),
    kind: "model.request",
    model: "claude-haiku-5-5",
    effort: "xhigh",
    ...fields,
  });
  const lines = [
    { ...base("s", at(0)), kind: "freeflow", what: "guidance", chars: 4000 },
    request(1, { turn: 1, in: 10, cacheWrite: 3000, cacheRead: 0, out: 200 }),
    { ...base("s", at(2)), kind: "tool.call", tool: "Bash", ok: true, source: "freeflow", outChars: 800 },
    { ...base("s", at(3)), kind: "tool.call", tool: "Read", ok: true, source: "agent", outChars: 2000 },
    { ...base("s", at(4)), kind: "freeflow", what: "notice", chars: 400 },
    request(5, { turn: 1, in: 5, cacheWrite: 1000, cacheRead: 3010, out: 100 }),
    { ...base("s", at(6)), kind: "compaction", by: "freeflow" },
    { ...base("s", at(7)), kind: "freeflow", what: "bundle", chars: 2000 },
    request(8, { turn: 2, in: 0, cacheWrite: 2000, cacheRead: 1200, out: 50 }),
    // A request from a log written before `turn`: the agent's, and counted as unattributed.
    request(9, { in: 100, cacheRead: 500, cacheWrite: 0 }),
  ];
  const summary = summarize(lines, { session: "s" });
  // By hand, in tokens (characters over 4). Request 1: of its 3,010 new tokens the guidance is 1,000. Request 2: the
  // guidance's 1,000 is in its 3,010 cached; of its 1,005 new, the last output (200) and the agent's Read (500) are
  // the agent's, Freeflow's Bash result (200) and the notice (100) Freeflow's. The compaction empties the context but
  // for the guidance, in the system prompt. Request 3: the guidance's 1,000 of its 1,200 cached, the bundle's 500 of
  // its 2,000 new. Request 4 has no turn. Uncached 6,115, of it Freeflow's 1,800; cached 4,710, of it Freeflow's 2,000.
  assert.deepEqual(summary.overhead, {
    estimate: true,
    charsPerToken: 4,
    tokens: 3800,
    of: 10825,
    share: Math.round((3800 / 10825) * 10000) / 10000,
    uncached: Math.round((1800 / 6115) * 10000) / 10000,
    cached: Math.round((2000 / 4710) * 10000) / 10000,
    byWhat: { guidance: 0.7895, bundle: 0.1316, tools: 0.0526, notice: 0.0263 },
    unattributed: 1,
  });
  // Haiku 5.5's card below 100,000 prompt tokens, per million: input 0.1, a cache write 0.125, a read 0.01, output 0.5.
  const byHand =
    (10 * 0.1 +
      3000 * 0.125 +
      200 * 0.5 +
      (5 * 0.1 + 1000 * 0.125 + 3010 * 0.01 + 100 * 0.5) +
      (2000 * 0.125 + 1200 * 0.01 + 50 * 0.5) +
      (100 * 0.1 + 500 * 0.01)) /
    1e6;
  const trackWork = lines
    .filter((line) => line.kind === "model.request")
    .reduce(
      (sum, line) =>
        sum +
        requestCost({
          model: line.model,
          usage: {
            input_tokens: line.in ?? 0,
            output_tokens: line.out ?? 0,
            cache_read_input_tokens: line.cacheRead ?? 0,
            cache_creation_input_tokens: line.cacheWrite ?? 0,
          },
        }),
      0,
    );
  assert.ok(Math.abs(summary.cost.usd - byHand) < 1e-9, `${summary.cost.usd} against ${byHand}`);
  assert.ok(Math.abs(summary.cost.usd - trackWork) < 1e-9);
  assert.deepEqual(summary.cost.byModel, [{ model: "claude-haiku-5-5", effort: "xhigh", usd: summary.cost.usd }]);
  assert.equal(summary.cost.unpriced, 0);
  assert.equal(summary.cost.prices, PRICES.date);
  const text = renderSummary(summary);
  assert.match(
    text,
    /\nCost at API list price: \$0\.0010 \(claude-haiku-5-5 xhigh \$0\.0010\), prices of 2026-10-30\n/,
  );
  assert.match(
    text,
    /\nOverhead: 35% of input tokens by estimate \(Freeflow's injected text and its own tool results, 4 characters a token\), 29% of uncached, 42% of cached; the guidance 79%, the bundle 13%, its own tool results 5%, notices 3%; 1 request\(s\) without a turn counted as the agent's\n/,
  );
});

test("a model the price table lacks is counted, not priced, and a log with no request prints no overhead or cost", () => {
  const lines = [{ ...base("s"), kind: "model.request", model: "made-up-model", turn: 1, in: 10, out: 1 }];
  const summary = summarize(lines, { session: "s" });
  assert.equal(summary.cost.usd, 0);
  assert.equal(summary.cost.unpriced, 1);
  assert.match(
    renderSummary(summary),
    /Cost at API list price: \$0\.00, prices of 2026-10-30; 1 request\(s\) of a model with no price\n/,
  );
  const empty = renderSummary(summarize([], { session: "s" }));
  assert.doesNotMatch(empty, /Overhead|Cost at/);
});

test("events append never writes through a link planted in events/: the log a link, events/ a link, or a FIFO in its place", async () => {
  await withFolder(async ({ folder, home, cli }) => {
    const line = jsonl([{ ...base(), kind: "turn.start", turn: 1 }]);
    await mkdir(join(home, "events"), { recursive: true });
    const outside = join(folder, "outside.txt");
    await writeFile(outside, "the host's own file\n");
    // R7 B1's probe: the session's log replaced by a link to a file outside the store.
    await symlink(outside, join(home, "events", "sess-1.jsonl"));
    const linked = cli(["events", "append", "--input", "-"], { input: line });
    assert.notEqual(linked.status, 0);
    assert.match(linked.stderr, /Refused to use .*sess-1\.jsonl: it is a symbolic link/);
    assert.equal(await readFile(outside, "utf8"), "the host's own file\n");
    // A dangling link is not followed to make a file either.
    const nowhere = join(folder, "made-through-link.jsonl");
    await symlink(nowhere, join(home, "events", "sess-2.jsonl"));
    assert.notEqual(
      cli(["events", "append", "--input", "-"], { input: jsonl([{ ...base("sess-2"), kind: "turn.start", turn: 1 }]) })
        .status,
      0,
    );
    assert.equal(existsSync(nowhere), false);
    // events/ itself a link to a folder outside the store.
    const elsewhere = join(folder, "elsewhere");
    await mkdir(elsewhere);
    await rm(join(home, "events"), { recursive: true });
    await symlink(elsewhere, join(home, "events"));
    const folderLinked = cli(["events", "append", "--input", "-"], {
      input: jsonl([{ ...base("sess-3"), kind: "turn.start", turn: 1 }]),
    });
    assert.notEqual(folderLinked.status, 0);
    assert.match(folderLinked.stderr, /events is a symbolic link/);
    assert.deepEqual(await readdir(elsewhere), []);
    // A FIFO where the log goes: refused at once, not waited on.
    await rm(join(home, "events"));
    await mkdir(join(home, "events"));
    execFileSync("mkfifo", [join(home, "events", "sess-4.jsonl")]);
    const fifo = cli(["events", "append", "--input", "-"], {
      input: jsonl([{ ...base("sess-4"), kind: "turn.start", turn: 1 }]),
    });
    assert.notEqual(fifo.status, 0);
    assert.match(fifo.stderr, /not a regular file/);
    // The control: a plain log is written.
    ok(cli(["events", "append", "--input", "-"], { input: line }));
    assert.equal((await readLines(join(home, "events", "sess-1.jsonl"))).length, 1);
  });
});
