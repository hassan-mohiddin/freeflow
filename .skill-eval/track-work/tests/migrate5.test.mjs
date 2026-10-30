import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const fixture = resolve(".skill-eval/track-work/fixtures/schema4-full/task-001-full-record");

async function withFixture(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-migrate5-"));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    const taskDir = join(folder, ".freeflow", "tasks", "task-001-full-record");
    await mkdir(join(folder, ".freeflow", "tasks"), { recursive: true });
    await cp(fixture, taskDir, { recursive: true });
    await writeFile(
      join(folder, "cues.txt"),
      "S-001: read when the reader matters\nS-003: read when speed is compared\n",
    );
    const cli = (args, input = "") =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: folder,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
          FREEFLOW_HOME: "",
        },
      });
    await run({ folder, taskDir, record: join(taskDir, "record.md"), cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const MIGRATE = ["--cue", "read when the parser is in question", "--cues", "cues.txt"];

test("migrate converts a Schema 4 record in place, keeping the old record whole and every closed Slice in History", async () => {
  await withFixture(async ({ taskDir, record, cli }) => {
    const before = await readFile(record, "utf8");
    const out = ok(cli(["migrate", "--record", record, ...MIGRATE]));
    assert.match(
      out,
      /History: 3 closed Slice\(s\); no cue for S-002 \(each marked missing; add one as a Correction\)\./,
    );
    assert.match(
      out,
      /with 1 superseded or retired Decision\(s\) and 1 closed Checkpoint\(s\) that Schema 5 has no place for\. The decision list was moved to decisions\.md/,
    );
    assert.match(ok(cli(["validate", "--record", record])), /^valid\n.+, 3 history entries\n/);
    assert.equal(await readFile(join(taskDir, "sources", "schema4-record.md"), "utf8"), before);
    const text = await readFile(record, "utf8");
    assert.match(
      text,
      /^# Full record\n\nSchema: 5 · State: active · Budget: normal\nCue: read when the parser is in question\n/,
    );
    assert.ok(
      text.includes(
        "### Settled\n\n- The parser reads Markdown.\n- A line written without a bullet.\n- D-002 — Markdown only: The parser reads Markdown only. (The user, 2026-10-19.)\n",
      ),
    );
    assert.ok(
      text.includes(
        "- Tentative: A streaming parser may be faster.\n- Pending Checkpoint C-002 — Commit the tables (preserve, for S-004): The table tests pass.\n",
      ),
    );
    assert.match(
      text,
      /### Agreement A-001 — The work agreement\n\n- Opened: \d{4}-\d{2}-\d{2}\n- Done when the parser ships\. You: "go" \(2026-10-18\)\n- Without asking: the parser and its tests\.\n  The fixtures too\.\n- Boundary: No network\.\n/,
    );
    assert.ok(
      text.includes(
        "- Under: The work agreement.\n- Result wanted: Tables parse.\n- Scope: src/tables.mjs.\n- Done when: The table tests pass.\n- Stop if: A table shape the spec does not settle.\n- Started from: No table support.\n- Evidence (observed): claim: two shapes parse;",
      ),
    );
    assert.ok(
      text.includes(
        "- Extension: authority: the user; added scope: nested tables; added evidence: one more test\n- Evidence (reported): Delegation — D-001 (gather, Haiku xhigh): running; delegations/D-001-tables/brief.md\n",
      ),
    );
    assert.ok(
      text.includes(
        "### Defined by\n\n- specs/parser.md — the accepted design.\n- skills/track-work/SKILL.md (in the repository) — how this record is kept.\n\n### Read on recovery\n\n- specs/parser.md — the design; sections 2 and 3 govern the Slice.\n",
      ),
    );
    assert.ok(
      text.includes(
        "### Read when\n\n- sources/benchmarks.md — timings; read when measuring speed.\n- sources/schema4-record.md — ",
      ),
    );
    assert.ok(
      text.endsWith(
        "### Slice — Add the CLI\n\n- Result wanted: A CLI over the parser.\n- Done when: CLI tests.\n- Dependencies: Parse tables.\n\n### Slice — Continue the current direction\n\n- Result wanted: Finish the parser, then its CLI.\n",
      ),
    );
    const history = await readFile(join(taskDir, "history.md"), "utf8");
    assert.ok(
      history.includes(
        "## S-001 — Read the input\n\n- State: completed\n- Dates: not recorded before Schema 5\n- Cue: read when the reader matters\n- Under: The work agreement.\n- Result wanted: Input is read.\n- Result: It reads files.\n- Evidence: The reader's tests; no large files tried.\n- Task effect:\n  The parser has input.\n  Residual effects: A temp file is left behind.\n- Correction: Field: Result; before: reads; after: reads files; reason: clarity; source: the tests\n",
      ),
    );
    assert.ok(
      history.includes(
        "## S-002 — Parse headings\n\n- State: blocked\n- Dates: not recorded before Schema 5\n- Cue: read when — no cue was given at migrate; add one as a Correction\n- Under: not recorded before Schema 5\n",
      ),
    );
    assert.ok(history.includes("- Resume when: The spec settles level three.\n"));
    assert.ok(
      history.includes(
        "## S-003 — Baseline timings\n\n- State: completed\n- Dates: 2026-10-15 to 2026-10-16\n- Recorded: retroactively on 2026-10-17\n- Cue: read when speed is compared\n",
      ),
    );
    assert.equal(
      await readFile(join(taskDir, "decisions.md"), "utf8"),
      '# Decisions\n\n- P1 [agreed] Input format -> Markdown. You: "yes" (2026-10-19)\n',
    );
    assert.ok(!existsSync(join(taskDir, "sources", "decisions.md")));
    assert.equal(
      await readFile(join(taskDir, "sources", "notes.md"), "utf8"),
      "A free note: the parser was named on 2026-10-18.\n",
    );
    assert.match(ok(cli(["view", "recover", "--record", record])), /^This task's record is memory/);
    assert.match(
      cli(["migrate", "--record", record, ...MIGRATE]).stderr,
      /migrate converts a Schema 4 record, or with --project brings a Schema 5 one into the store; this one is Schema 5/,
    );
  });
});

test("migrate --project copies the task into the store as its next task, converts it there and commits, leaving the original as it was", async () => {
  await withFixture(async ({ folder, record, cli }) => {
    const home = join(folder, "store");
    ok(cli(["store", "init", "--home", home, "--git-name", "Test User", "--git-email", "test@example.com"]));
    await mkdir(join(home, "projects", "parser", "tasks"), { recursive: true });
    const before = await readFile(record, "utf8");
    const out = ok(cli(["migrate", "--record", record, "--home", home, "--project", "parser", ...MIGRATE]));
    const moved = join(home, "projects", "parser", "tasks", "task-001-full-record", "record.md");
    assert.match(out, new RegExp(`^Migrated to Schema 5: ${moved.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\n`));
    assert.match(out, /The original folder is unchanged: .+\nStore: committed; a local store\./);
    assert.equal(await readFile(record, "utf8"), before);
    assert.match(ok(cli(["validate", "--record", moved])), /3 history entries/);
    assert.equal(
      execFileSync("git", ["-C", home, "log", "-1", "--format=%s"], { encoding: "utf8" }).trim(),
      "Migrate task-001-full-record to Schema 5",
    );
    assert.equal(execFileSync("git", ["-C", home, "status", "--porcelain"], { encoding: "utf8" }), "");
  });
});

test("migrate --project brings a Schema 5 task kept in a repository into the store, unchanged, leaving the original (P91)", async () => {
  await withFixture(async ({ folder, record, cli }) => {
    ok(cli(["migrate", "--record", record, ...MIGRATE]));
    const before = await readFile(record, "utf8");
    const home = join(folder, "store");
    ok(cli(["store", "init", "--home", home, "--git-name", "Test User", "--git-email", "test@example.com"]));
    await mkdir(join(home, "projects", "parser", "tasks"), { recursive: true });
    const out = ok(cli(["migrate", "--record", record, "--home", home, "--project", "parser"]));
    const moved = join(home, "projects", "parser", "tasks", "task-001-full-record", "record.md");
    assert.match(
      out,
      /^Brought into the store as parser\/task-001: .+\/store\/projects\/parser\/tasks\/task-001-full-record\/record\.md\nThe original folder is unchanged: .+\/\.freeflow\/tasks\/task-001-full-record\.\nStore: committed; a local store\.\n$/,
    );
    assert.equal(await readFile(moved, "utf8"), before);
    assert.equal(await readFile(record, "utf8"), before);
    assert.match(ok(cli(["validate", "--record", moved])), /3 history entries/);
    assert.equal(execFileSync("git", ["-C", home, "status", "--porcelain"], { encoding: "utf8" }), "");
  });
});

test("migrate refuses a cue that is not one and a cue for a Slice that is not closed, writing nothing", async () => {
  await withFixture(async ({ folder, taskDir, record, cli }) => {
    assert.match(cli(["migrate", "--record", record, "--cue", "the parser"]).stderr, /--cue: a cue starts "read when"/);
    await writeFile(join(folder, "bad-cues.txt"), "S-004: read when tables matter\n");
    assert.match(
      cli(["migrate", "--record", record, "--cue", "read when parsing", "--cues", "bad-cues.txt"]).stderr,
      /--cues names S-004, which is not a closed Slice/,
    );
    assert.ok(!existsSync(join(taskDir, "history.md")));
    assert.ok(!existsSync(join(taskDir, "sources", "schema4-record.md")));
  });
});
