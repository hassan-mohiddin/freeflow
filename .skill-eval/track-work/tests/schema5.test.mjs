import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { remoteName } from "../../../skills/track-work/scripts/lib/transitions5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const fixture = resolve(".skill-eval/track-work/fixtures/schema5/task-001-fixture-task");
const IDENTITY = ["--git-name", "Test User", "--git-email", "test@example.com"];

async function withFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-schema5-"));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Runs the script in folder, outside any repository, with a Git configuration of the folder's own. */
function run(folder, args, input = "") {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: folder,
    input,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
      FREEFLOW_HOME: "",
      FREEFLOW_CONTEXT_WINDOW: "",
    },
  });
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}

const today = (() => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
})();

async function copyFixture(folder) {
  const target = join(folder, ".freeflow", "tasks", "task-001-fixture-task");
  await mkdir(dirname(target), { recursive: true });
  await cp(fixture, target, { recursive: true });
  return join(target, "record.md");
}

/** A Schema 5 task at root, through init; returns its record's path. */
function initTask(folder, root, name = "Demo task") {
  const out = ok(
    run(
      folder,
      ["init", "--schema", "5", "--root", root, "--name", name, "--cue", "read when testing Schema 5", "--input", "-"],
      "### Goal\n- Try Schema 5.\n### Next action\n- Open the agreement.\n",
    ),
  );
  // The first line is the record's path; the budget follows it.
  return out.split("\n")[0];
}

const historyEntries = async (record) =>
  (await readFile(join(dirname(record), "history.md"), "utf8")).split("\n").filter((line) => /^## /.test(line));

function startedSlice(folder, record, under = null) {
  ok(
    run(
      folder,
      ["slice", "propose", "--record", record, "--title", "Make the demo", "--input", "-"],
      "- Result wanted: A demo.\n- Done when: it runs.\n",
    ),
  );
  ok(
    run(
      folder,
      ["slice", "start", "--record", record, "--title", "Make the demo", "--next-action", "Build it.", "--input", "-"],
      `- Scope: the demo only.\n- Stop if: it needs more.\n- Started from: nothing.\n${under ? `- Under: ${under}\n` : ""}`,
    ),
  );
}

test("the Schema 5 fixture's record.md, history.md and decisions.md validate, and each file's broken shapes are refused", async () => {
  await withFolder(async (folder) => {
    const record = await copyFixture(folder);
    assert.match(
      ok(run(folder, ["validate", "--record", record])),
      /^valid\n.+, 3 history entries\n1 evidence pointer\(s\) checked\n$/,
    );
    const text = await readFile(record, "utf8");
    const history = await readFile(join(dirname(record), "history.md"), "utf8");
    const broken = [
      ["record.md", text.replace("Cue: read when testing the Schema 5 record format\n", ""), /needs a Cue line/],
      [
        "record.md",
        text.replace("- Review: none yet\n", "- Review: none yet\n  and more detail\n"),
        /An update is one line/,
      ],
      [
        "record.md",
        text.replace("- Review: none yet\n", "- Review: none yet\n- Scope: more.\n"),
        /field Scope comes after the updates/,
      ],
      ["record.md", text.replace("### Space\n", "### Space\n\n- github.com/acme/widget · main\n"), /A Space line is/],
      [
        "record.md",
        text.replace(
          "### Read when\n\n- history.md — closed work; read when the next action depends on it.",
          "### Read when\n\n- history.md — closed work.",
        ),
        /names its trigger/,
      ],
      ["record.md", text.replace("- Opened: 2026-10-28\n", ""), /needs one Opened/],
      ["record.md", text.replace("### Delegations\n", "### Notes\n\n### Delegations\n"), /Current Work holds/],
      [
        "history.md",
        history.replace("- Cue: read when the parser's shape is in question\n", ""),
        /Missing field Cue in history.md\/S-001/,
      ],
      ["history.md", history.replace("## D-002 — Read the format", "## X-002 — Read the format"), /<S\|A\|D>-NNN/],
      [
        "history.md",
        history.replace("- Return: delegations/D-002-read-the-format/return.md\n", ""),
        /Missing field Return/,
      ],
      ["history.md", `${history}\nA stray line.\n`, /Unowned content/],
      ["history.md", history.replace("- State: accepted", "- State: done"), /Invalid State in history.md\/D-002/],
    ];
    for (const [name, candidate, message] of broken) {
      const path = join(dirname(record), name);
      const original = await readFile(path, "utf8");
      await writeFile(path, candidate);
      const result = run(folder, ["validate", "--record", record]);
      assert.equal(result.status, 1, `${name} should be refused for ${message}`);
      assert.match(result.stderr, message);
      await writeFile(path, original);
    }
  });
});

test("init --schema 5 writes record.md, history.md and decisions.md, and refuses a cue that is not one", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    assert.equal(record, join(folder, ".freeflow", "tasks", "task-001-demo-task", "record.md"));
    const text = await readFile(record, "utf8");
    assert.match(
      text,
      /^# Demo task\n\nSchema: 5 · State: active · Budget: normal\nCue: read when testing Schema 5\nState as of: \d{4}-\d{2}-\d{2}T/,
    );
    assert.match(
      text,
      /### Goal\n\n- Try Schema 5.\n\n### Settled\n\n### Open\n\n## Current Work\n\n### Delegations\n\n### Space\n\n### In flight\n\n### Defined by\n\n### Read on recovery\n/,
    );
    // After the record's path, init prints the budget, so the agent writes the record knowing it (P66).
    const second = ok(
      run(
        folder,
        ["init", "--schema", "5", "--root", folder, "--name", "Second", "--cue", "read when testing", "--input", "-"],
        "### Goal\n- Two.\n### Defined by\n- specs/two.md — the design.\n### Next action\n- Go.\n",
      ),
    ).split("\n");
    assert.match(second[0], /task-002-second\/record\.md$/);
    assert.equal(
      second[1],
      "Recovery budget: about 10,000 words (normal mode, a 200,000-token window, assumed: FREEFLOW_CONTEXT_WINDOW is not set).",
    );
    assert.match(await readFile(second[0], "utf8"), /### Defined by\n\n- specs\/two\.md — the design\.\n/);
    assert.equal(await readFile(join(dirname(record), "history.md"), "utf8"), "# History: Demo task\n");
    assert.equal(await readFile(join(dirname(record), "decisions.md"), "utf8"), "# Decisions\n");
    assert.ok(existsSync(join(dirname(record), "scratch")));
    for (const [cue, message] of [
      ["testing", /starts "read when"/],
      [`read when ${"word ".repeat(30)}`, /at most 25 words/],
    ]) {
      const refused = run(
        folder,
        ["init", "--schema", "5", "--root", folder, "--name", "Other", "--cue", cue, "--input", "-"],
        "### Goal\n- G.\n### Next action\n- N.\n",
      );
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, message);
    }
    assert.ok(!existsSync(join(folder, ".freeflow", "tasks", "task-002-other")));
    assert.match(
      run(folder, ["init", "--root", folder, "--name", "Four", "--cue", "read when x"]).stderr,
      /--cue is for --schema 5/,
    );
  });
});

test("the slice commands change only what they name, and closing a Slice appends exactly one History entry", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    ok(
      run(
        folder,
        ["agreement", "open", "--record", record, "--title", "Build the demo", "--input", "-"],
        '- Done when the demo runs. You: "go" (2026-10-29)\n',
      ),
    );
    ok(
      run(
        folder,
        ["slice", "propose", "--record", record, "--title", "Make the demo", "--input", "-"],
        "- Result wanted: A demo.\n- Done when: it runs.\n",
      ),
    );
    let text = await readFile(record, "utf8");
    assert.match(
      text,
      /## Future Work\n\n### Slice — Make the demo\n\n- Result wanted: A demo.\n- Done when: it runs.\n$/,
    );
    ok(
      run(
        folder,
        [
          "slice",
          "start",
          "--record",
          record,
          "--title",
          "Make the demo",
          "--next-action",
          "Build it.",
          "--input",
          "-",
        ],
        "- Scope: the demo only.\n- Stop if: it needs more.\n- Started from: nothing.\n",
      ),
    );
    text = await readFile(record, "utf8");
    assert.ok(
      text.includes(
        `### Slice S-001 — Make the demo\n\n- State: in_progress\n- Opened: ${today}\n- Under: A-001\n- Result wanted: A demo.\n- Scope: the demo only.\n- Done when: it runs.\n- Stop if: it needs more.\n- Started from: nothing.\n\n### Delegations`,
      ),
    );
    assert.match(text, /### Next action\n\n- Build it.\n\n## Future Work\n$/);
    await writeFile(
      record,
      text.replace(
        "- Started from: nothing.\n",
        "- Started from: nothing.\n- Evidence (observed): the demo ran — record.md\n",
      ),
    );
    ok(
      run(folder, [
        "slice",
        "pause",
        "--record",
        record,
        "--reason",
        "waiting on a fix",
        "--resume-when",
        "it lands",
        "--next-action",
        "Wait.",
      ]),
    );
    assert.match(
      await readFile(record, "utf8"),
      /- State: paused\n[^]*- Evidence \(observed\): the demo ran — record.md\n- Paused: waiting on a fix; resume when: it lands\n/,
    );
    ok(
      run(folder, [
        "slice",
        "resume",
        "--record",
        record,
        "--resolution",
        "the fix landed",
        "--next-action",
        "Finish it.",
      ]),
    );
    assert.match(await readFile(record, "utf8"), /- State: in_progress\n[^]*- Resumed: the fix landed\n/);
    const tooLong = run(
      folder,
      ["slice", "close", "--record", record, "--state", "completed", "--next-action", "Next.", "--input", "-"],
      `- Cue: read when ${"x ".repeat(30)}\n- Result: R.\n- Evidence: E.\n- Task effect: T.\n`,
    );
    assert.match(tooLong.stderr, /at most 25 words/);
    assert.deepEqual(await historyEntries(record), []);
    const closed = ok(
      run(
        folder,
        ["slice", "close", "--record", record, "--state", "completed", "--next-action", "Checkpoint.", "--input", "-"],
        "- Cue: read when the demo breaks\n- Result: It runs.\n- Evidence: record.md\n- Task effect: The demo exists.\n",
      ),
    );
    assert.equal(closed, "Closed Slice: S-001 — completed\nNot in a Freeflow store: nothing to commit.\n");
    assert.deepEqual(await historyEntries(record), ["## S-001 — Make the demo"]);
    const history = await readFile(join(dirname(record), "history.md"), "utf8");
    assert.ok(
      history.endsWith(
        `- State: completed\n- Dates: ${today}\n- Cue: read when the demo breaks\n- Under: A-001\n- Result wanted: A demo.\n- Result: It runs.\n- Evidence: record.md\n- Task effect: The demo exists.\n- Updates:\n  - Evidence (observed): the demo ran — record.md\n  - Paused: waiting on a fix; resume when: it lands\n  - Resumed: the fix landed\n`,
      ),
    );
    text = await readFile(record, "utf8");
    assert.ok(!text.includes("### Slice S-001"));
    assert.match(text, /### Next action\n\n- Checkpoint.\n/);
    // IDs are never reused: the next Slice is S-002, though S-001 is no longer in record.md.
    ok(
      run(
        folder,
        ["slice", "start-direct", "--record", record, "--title", "Another", "--next-action", "Go.", "--input", "-"],
        "- Result wanted: More.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n",
      ),
    );
    assert.match(await readFile(record, "utf8"), /### Slice S-002 — Another/);
  });
});

test("a close stopped after writing History finishes on a second run, without a second entry", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    ok(
      run(
        folder,
        ["agreement", "open", "--record", record, "--title", "Build", "--input", "-"],
        "- Done when built.\n",
      ),
    );
    startedSlice(folder, record);
    const before = await readFile(record, "utf8");
    const input =
      "- Cue: read when the demo breaks\n- Result: It runs.\n- Evidence: record.md\n- Task effect: The demo exists.\n";
    ok(
      run(
        folder,
        ["slice", "close", "--record", record, "--state", "completed", "--next-action", "Next.", "--input", "-"],
        input,
      ),
    );
    // As if record.md's write had failed: History holds the entry, record.md still holds the Slice.
    await writeFile(record, before);
    const refused = run(folder, ["validate", "--record", record]);
    assert.match(refused.stderr, /S-001 is open in record.md and closed in history.md/);
    assert.match(
      run(folder, ["slice", "pause", "--record", record, "--reason", "r", "--resume-when", "w", "--next-action", "n"])
        .stderr,
      /interrupted/,
    );
    ok(
      run(
        folder,
        ["slice", "close", "--record", record, "--state", "completed", "--next-action", "Next.", "--input", "-"],
        input,
      ),
    );
    assert.deepEqual(await historyEntries(record), ["## S-001 — Make the demo"]);
    assert.match(ok(run(folder, ["validate", "--record", record])), /1 history entries/);
  });
});

test("agreements: one open at a time, updates in the user's words, and closing carries the decision list into one History entry", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    const lines =
      '- Done when the demo runs. You: "go" (2026-10-29)\n- Ask first: anything else.\n  Even small things.\n';
    assert.equal(
      ok(run(folder, ["agreement", "open", "--record", record, "--title", "Build the demo", "--input", "-"], lines)),
      "Opened agreement: A-001 — Build the demo\n",
    );
    assert.match(
      run(folder, ["agreement", "open", "--record", record, "--title", "Again", "--input", "-"], "- x\n").stderr,
      /A-001 is open/,
    );
    assert.match(
      run(folder, ["agreement", "open", "--record", record, "--title", "x", "--input", "-"], "not a bullet\n").stderr,
      /A-001 is open|as bullets/,
    );
    ok(run(folder, ["agreement", "update", "--record", record, "--text", 'Narrowed: "diagnose first" (2026-10-29)']));
    let text = await readFile(record, "utf8");
    assert.ok(
      text.includes(
        `### Agreement A-001 — Build the demo\n\n- Opened: ${today}\n${lines}- Update: Narrowed: "diagnose first" (2026-10-29)\n\n### Delegations`,
      ),
    );
    startedSlice(folder, record);
    const close = (state = "completed") =>
      run(
        folder,
        ["agreement", "close", "--record", record, "--state", state, "--next-action", "Done.", "--input", "-"],
        "- Cue: read when what was agreed is in question\n- Result: Built.\n- Task effect: Nothing open.\n- Settled: The demo runs (S-001).\n",
      );
    assert.match(close().stderr, /S-001 works under A-001; close it first/);
    ok(
      run(
        folder,
        ["slice", "close", "--record", record, "--state", "completed", "--next-action", "n", "--input", "-"],
        "- Cue: read when the demo breaks\n- Result: R.\n- Evidence: E.\n- Task effect: T.\n",
      ),
    );
    await writeFile(
      join(dirname(record), "decisions.md"),
      '# Decisions\n\n- P1 [agreed] Demo name -> demo. You: "go" (2026-10-29)\n',
    );
    assert.match(close("finished").stderr, /completed, ended or replaced/);
    assert.equal(ok(close()), "Closed agreement: A-001 — completed\nNot in a Freeflow store: nothing to commit.\n");
    assert.deepEqual(await historyEntries(record), ["## S-001 — Make the demo", "## A-001 — Build the demo"]);
    const history = await readFile(join(dirname(record), "history.md"), "utf8");
    assert.ok(
      history.endsWith(
        `## A-001 — Build the demo\n\n- State: completed\n- Dates: ${today}\n- Cue: read when what was agreed is in question\n- Lines:\n  - Done when the demo runs. You: "go" (2026-10-29)\n  - Ask first: anything else.\n    Even small things.\n- Updates:\n  - Narrowed: "diagnose first" (2026-10-29)\n- Decisions:\n  - P1 [agreed] Demo name -> demo. You: "go" (2026-10-29)\n- Result: Built.\n- Task effect: Nothing open.\n`,
      ),
    );
    assert.equal(await readFile(join(dirname(record), "decisions.md"), "utf8"), "# Decisions\n");
    text = await readFile(record, "utf8");
    assert.ok(!text.includes("### Agreement"));
    assert.match(text, /### Settled\n\n- The demo runs \(S-001\).\n\n### Open/);
    assert.match(
      ok(
        run(
          folder,
          ["agreement", "open", "--record", record, "--title", "Next", "--input", "-"],
          "- Done when next.\n",
        ),
      ),
      /A-002/,
    );
  });
});

test("slice record writes one retroactive History entry and leaves record.md alone", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    const before = await readFile(record, "utf8");
    const fields = (occurred) =>
      `- Occurred: ${occurred}\n- Cue: read when the baseline matters\n- Under: the user's request in session 1\n- Result wanted: A baseline.\n- Result: 3 of 4.\n- Evidence: scratch/baseline.txt\n- Task effect: The baseline is known.\n`;
    assert.match(
      run(
        folder,
        ["slice", "record", "--record", record, "--title", "Baseline", "--state", "completed", "--input", "-"],
        fields("2999-01-01"),
      ).stderr,
      /after today/,
    );
    ok(
      run(
        folder,
        ["slice", "record", "--record", record, "--title", "Baseline", "--state", "completed", "--input", "-"],
        fields("2026-10-01 to 2026-10-02"),
      ),
    );
    assert.equal(await readFile(record, "utf8"), before);
    const history = await readFile(join(dirname(record), "history.md"), "utf8");
    assert.match(
      history,
      new RegExp(
        `## S-001 — Baseline\n\n- State: completed\n- Dates: 2026-10-01 to 2026-10-02\n- Recorded: retroactively on ${today}\n`,
      ),
    );
  });
});

test("a Slice is not closed as completed while a delegation it waits on is open", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    ok(
      run(
        folder,
        ["slice", "start-direct", "--record", record, "--title", "Wait", "--next-action", "n", "--input", "-"],
        "- Result wanted: r.\n- Under: the user's request.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n- Waits on: D-001\n",
      ),
    );
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text.replace(
        "### Delegations\n",
        "### Delegations\n\n- D-001 — Gather (gather, Haiku xhigh) · under the user's request · from S-001 · running · delegations/D-001-gather/brief.md\n",
      ),
    );
    const input =
      "- Cue: read when waiting matters\n- Result: R.\n- Evidence: E.\n- Task effect: T.\n- Reason: stopped.\n";
    assert.match(
      run(
        folder,
        ["slice", "close", "--record", record, "--state", "completed", "--next-action", "n", "--input", "-"],
        input,
      ).stderr,
      /waits on D-001, still open/,
    );
    ok(
      run(
        folder,
        ["slice", "close", "--record", record, "--state", "abandoned", "--next-action", "n", "--input", "-"],
        input,
      ),
    );
    assert.match(
      ok(
        run(
          folder,
          ["slice", "start-direct", "--record", record, "--title", "Next", "--next-action", "n", "--input", "-"],
          "- Result wanted: r.\n- Under: u.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n",
        ),
      ),
      /S-002/,
    );
  });
});

test("validate and checkpoint warn on a section over its budget, and checkpoint sets State as of", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    const text = await readFile(record, "utf8");
    await writeFile(record, text.replace("### Settled\n", `### Settled\n\n- ${"word ".repeat(650).trim()}\n`));
    assert.match(
      ok(run(folder, ["validate", "--record", record])),
      /warning: Current Context has 6\d\d words, over its fixed budget of about 600: distill it at the next checkpoint/,
    );
    const before = /State as of: (\S+)/.exec(await readFile(record, "utf8"))[1];
    await new Promise((done) => setTimeout(done, 5));
    const out = ok(run(folder, ["checkpoint", "--record", record]));
    assert.match(
      out,
      /^Checkpoint: task-001-demo-task, State as of \S+\.\nBudget: counted [\d,]+ of about 10,000 words \(normal, 200,000-token window\); largest: Current Context 6\d\d, .+; fixed: Current Context 6\d\d of about 600, OVER, Future Work 0 of about 300; not counted: rules 0, Defined by 0\.\nIn flight: unchanged; pass --input with its lines to rewrite it whole\.\n/,
    );
    assert.match(out, /Warning: Current Context has 6\d\d words/);
    assert.match(out, /Space: unchanged/);
    assert.notEqual(/State as of: (\S+)/.exec(await readFile(record, "utf8"))[1], before);
  });
});

test("in a cloud store, checkpoint writes the work repository's Space line, and closes and checkpoints push the store", async () => {
  await withFolder(async (folder) => {
    const remote = join(folder, "store.git");
    execFileSync("git", ["init", "--quiet", "--bare", remote]);
    const home = join(folder, "home");
    ok(run(folder, ["store", "init", "--remote", remote, "--home", home, ...IDENTITY]));
    await mkdir(join(home, "projects", "widget"), { recursive: true });
    const record = initTask(folder, join(home, "projects", "widget"));
    assert.equal(record, join(home, "projects", "widget", "tasks", "task-001-demo-task", "record.md"));
    const work = join(folder, "widget");
    execFileSync("git", ["init", "--quiet", "-b", "main", work]);
    git(work, [
      "-c",
      "user.name=T",
      "-c",
      "user.email=t@example.com",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "start",
    ]);
    git(work, ["remote", "add", "origin", "git@github.com:acme/widget.git"]);
    const head = git(work, ["rev-parse", "--short=8", "HEAD"]);
    const out = ok(run(folder, ["checkpoint", "--record", record, "--repo", work]));
    assert.match(
      out,
      new RegExp(
        `Space: github.com/acme/widget · main · ${head} · not pushed\nStore: committed \\d+ path\\(s\\), pushed.\n$`,
      ),
    );
    ok(run(folder, ["checkpoint", "--record", record, "--repo", work]));
    assert.equal((await readFile(record, "utf8")).match(/github.com\/acme\/widget/g).length, 1);
    startedSlice(folder, record, "the user's request");
    assert.match(
      ok(
        run(
          folder,
          ["slice", "close", "--record", record, "--state", "completed", "--next-action", "n", "--input", "-"],
          "- Cue: read when the demo breaks\n- Result: R.\n- Evidence: E.\n- Task effect: T.\n",
        ),
      ),
      /Store: committed \d+ path\(s\), pushed./,
    );
    const pushed = execFileSync("git", ["--git-dir", remote, "log", "--format=%an %s", "main"], { encoding: "utf8" });
    assert.match(
      pushed,
      /^Test User task-001-demo-task: close S-001\nTest User task-001-demo-task: checkpoint\nTest User task-001-demo-task: checkpoint\nTest User Create the Freeflow store\n$/,
    );
    assert.match(run(folder, ["checkpoint", "--record", record, "--repo", home]).stderr, /it is the Freeflow store/);
  });
});

test("Schema 4 records keep their commands and refuse Schema 5's; Schema 5 records refuse Schema 4's", async () => {
  await withFolder(async (folder) => {
    const four = ok(
      run(
        folder,
        ["init", "--root", folder, "--name", "Four", "--input", "-"],
        "### Goal\n- G.\n\n### Next useful action\n- N.\n",
      ),
    ).trim();
    assert.match(
      run(folder, ["agreement", "open", "--record", four, "--title", "x", "--input", "-"], "- x\n").stderr,
      /agreement is for Schema 5 records; this one is Schema 4/,
    );
    assert.match(
      run(folder, ["checkpoint", "--record", four]).stderr,
      /checkpoint without an operation is for Schema 5/,
    );
    ok(
      run(
        folder,
        ["slice", "start-direct", "--record", four, "--title", "Four's slice", "--next-action", "n", "--input", "-"],
        "- Intended result: r.\n- Authority source: a.\n- Scope: s.\n- Expected evidence: e.\n- Stop condition: x.\n- Starting state: y.\n",
      ),
    );
    ok(
      run(
        folder,
        ["checkpoint", "propose", "--record", four, "--title", "Commit", "--input", "-"],
        "- Type: preserve\n- Condition: c.\n- Applies to: S-001\n",
      ),
    );
    assert.match(ok(run(folder, ["view", "resume", "--record", four])), /#### S-001 — Four's slice/);
    const five = initTask(folder, folder, "Five");
    assert.match(
      run(folder, ["decision", "add", "--record", five, "--title", "x", "--input", "-"], "- Decision: d.\n").stderr,
      /Not a Schema 5 command: decision add/,
    );
    assert.match(
      run(folder, ["slice", "reopen", "--record", five, "--id", "S-001", "--next-action", "n"]).stderr,
      /Not a Schema 5 command: slice reopen/,
    );
    assert.match(ok(run(folder, ["view", "full", "--record", five])), /^# Five\n/);
  });
});

test("task set-state on a Schema 5 record pauses its Slice and refuses completion while one is open", async () => {
  await withFolder(async (folder) => {
    const record = initTask(folder, folder);
    startedSlice(folder, record, "the user's request");
    ok(
      run(folder, [
        "task",
        "set-state",
        "--record",
        record,
        "--state",
        "paused",
        "--next-action",
        "Wait for the user.",
      ]),
    );
    const text = await readFile(record, "utf8");
    assert.match(text, /Schema: 5 · State: paused/);
    assert.match(text, /- State: paused\n[^]*- Paused: the task was paused; resume when: the task is active again\n/);
    assert.match(
      run(folder, ["task", "set-state", "--record", record, "--state", "completed", "--next-action", "n"]).stderr,
      /close S-001 first/,
    );
    ok(
      run(folder, ["task", "set-state", "--record", record, "--state", "active", "--next-action", "Resume the Slice."]),
    );
    assert.match(await readFile(record, "utf8"), /- State: paused/);
  });
});

test("a remote is named host/owner/repo whatever its URL's form", () => {
  assert.equal(remoteName("https://github.com/acme/widget.git"), "github.com/acme/widget");
  assert.equal(remoteName("https://user:token@github.com/acme/widget"), "github.com/acme/widget");
  assert.equal(remoteName("git@github.com:acme/widget.git"), "github.com/acme/widget");
  assert.equal(remoteName("ssh://git@github.com:22/acme/widget.git"), "github.com/acme/widget");
  assert.equal(remoteName("/srv/git/widget.git"), "/srv/git/widget");
});
