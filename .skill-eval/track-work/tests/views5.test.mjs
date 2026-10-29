import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { activeDecisions } from "../../../skills/track-work/scripts/lib/views5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const fixture = resolve(".skill-eval/track-work/fixtures/schema5/task-001-fixture-task");

async function withFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-views5-"));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

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

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

/** A cloud store with a project, the fixture as its task-003, and another task beside it. */
async function storeWithFixture(folder) {
  const remote = join(folder, "store.git");
  execFileSync("git", ["init", "--quiet", "--bare", remote]);
  const home = join(folder, "home");
  ok(
    run(folder, [
      "store",
      "init",
      "--remote",
      remote,
      "--home",
      home,
      "--git-name",
      "Test User",
      "--git-email",
      "test@example.com",
    ]),
  );
  const project = join(home, "projects", "widget");
  const taskDir = join(project, "tasks", "task-003-fixture-task");
  await cp(fixture, taskDir, { recursive: true });
  ok(
    run(
      folder,
      [
        "init",
        "--schema",
        "5",
        "--root",
        project,
        "--name",
        "Other task",
        "--cue",
        "read when the other task matters",
        "--input",
        "-",
      ],
      "### Goal\n- Another.\n### Next action\n- Wait.\n",
    ),
  );
  return { home, project, remote, record: join(taskDir, "record.md") };
}

test("view recover prints the opening line, rules, record, decisions, History and project indexes, then the checks, in the Spec's order", async () => {
  await withFolder(async (folder) => {
    const { home, project, record } = await storeWithFixture(folder);
    await mkdir(join(home, "rules"), { recursive: true });
    await writeFile(join(home, "rules", "style.md"), "Answer in plain words.\n");
    await mkdir(join(project, "rules"), { recursive: true });
    await writeFile(join(project, "rules", "widget.md"), "Widget builds with make.\n");
    // 32 more closed Slices: the index shows the newest 30 and S-001, which the record names.
    const history = await readFile(join(project, "tasks", "task-003-fixture-task", "history.md"), "utf8");
    const more = Array.from({ length: 32 }, (_, n) => {
      const id = `S-${String(n + 10).padStart(3, "0")}`;
      return `## ${id} — Step ${n + 10}\n\n- State: completed\n- Dates: 2026-10-29\n- Cue: read when step ${n + 10} matters\n- Under: A-001\n- Result wanted: r.\n- Result: r.\n- Evidence: e.\n- Task effect: t.\n`;
    });
    await writeFile(
      join(project, "tasks", "task-003-fixture-task", "history.md"),
      `${history.trimEnd()}\n\n${more.join("\n")}`,
    );
    // Decisions past their budget: the waiting and answered items first, then the rest newest first.
    const items = [
      "- P1 [default] An early default -> yes",
      '- P2 [agreed] The answered one -> yes. You: "go" (2026-10-29)',
      "- P3 [new] The waiting one -> maybe",
      ...Array.from(
        { length: 120 },
        (_, n) => `- T${n + 1} [default] Technical choice number ${n + 1} with some words -> serves P1`,
      ),
    ];
    await writeFile(
      join(project, "tasks", "task-003-fixture-task", "decisions.md"),
      `# Decisions\n\n${items.join("\n")}\n`,
    );
    // A missing must-read source, and the store one commit ahead of its remote.
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text.replace("- record.md — this file.\n", "- record.md — this file.\n- sources/missing.md — gone.\n"),
    );
    git(home, ["add", "-A"]);
    git(home, ["commit", "--quiet", "-m", "local only"]);
    // The repository the record names in Space, on this machine at another branch.
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
    git(work, ["remote", "add", "origin", "https://github.com/acme/widget.git"]);
    await mkdir(join(home, "local"), { recursive: true });
    await writeFile(join(home, "local", "repositories.json"), JSON.stringify({ "github.com/acme/widget": work }));

    const out = ok(run(folder, ["view", "recover", "--record", record]));
    assert.ok(
      out.startsWith(
        "This task's record is memory, not authority: the user's direction decides the work, as written in the agreement and the discussion blocks",
      ),
    );
    const order = [
      "## Rules",
      "### rules/style.md",
      "### projects/widget/rules/widget.md",
      "## Record",
      "# Fixture task",
      "## Active decisions",
      "## History index",
      "## Project index",
      "## Checks",
    ];
    const at = order.map((heading) => out.indexOf(`\n${heading}\n`));
    assert.ok(
      at.every((index) => index > 0),
      `every part is printed: ${at}`,
    );
    assert.deepEqual(
      [...at].sort((left, right) => left - right),
      at,
    );
    const section = (name) => out.slice(out.indexOf(`\n## ${name}\n`) + 1).split(/\n## /)[0];
    const decisions = section("Active decisions")
      .split("\n")
      .filter((line) => line.startsWith("- "));
    assert.deepEqual(decisions.slice(0, 4), [
      "- P3 [new] The waiting one -> maybe",
      '- P2 [agreed] The answered one -> yes. You: "go" (2026-10-29)',
      "- T120 [default] Technical choice number 120 with some words -> serves P1",
      "- T119 [default] Technical choice number 119 with some words -> serves P1",
    ]);
    assert.match(
      section("Active decisions"),
      new RegExp(`\\n${123 - decisions.length} more in decisions.md, not shown \\(budget about 600 words\\)\\.`),
    );
    const index = section("History index")
      .split("\n")
      .filter((line) => line.startsWith("- "));
    assert.equal(index[0], "- S-041 completed — Step 41 · read when step 41 matters");
    assert.equal(index.length, 31);
    assert.ok(index.includes("- S-001 completed — Write the parser · read when the parser's shape is in question"));
    assert.match(section("History index"), /\n4 older entries not shown: view index lists them all\./);
    assert.match(
      section("Project index"),
      /^## Project index\n\n- widget\/task-004 — Other task · active · read when the other task matters\n/,
    );
    const checks = section("Checks");
    assert.match(
      checks,
      /- Budget: counted [\d,]+ of about 10,000 words \(normal, 200,000-token window\); largest: .+; fixed: Current Context \d+ of about 600, Future Work \d+ of about 300; not counted: rules 8, Defined by [\d,]+\./,
    );
    assert.match(checks, /- Read on recovery: sources\/missing.md does not exist/);
    assert.match(checks, /- Store: 1 commit\(s\) not pushed, 0 path\(s\) not committed; last sync \S+, created\./);
    assert.match(
      checks,
      new RegExp(
        `- github.com/acme/widget at ${realpathSync(work)}: now main at [0-9a-f]{8}, not pushed; the record says schema-5 at 1a2b3c4d, not pushed`,
      ),
    );
    assert.ok(
      out
        .trimEnd()
        .endsWith(
          "Now read every Defined by entry, every Read on recovery source and the core skills, then say in one line what you read.",
        ),
    );
  });
});

test("view entry prints History entries as stored, view index lists every entry, and Schema 5 has no resume view", async () => {
  await withFolder(async (folder) => {
    const { record } = await storeWithFixture(folder);
    const entries = ok(run(folder, ["view", "entry", "A-001", "S-001", "--record", record]));
    assert.ok(entries.startsWith("## A-001 — Build the parser\n\n- State: completed\n"));
    assert.ok(entries.includes("\n\n## S-001 — Write the parser\n\n"));
    assert.ok(entries.endsWith("- Correction: Result; before: parses; after: parses record.md; reason: clarity\n"));
    assert.match(run(folder, ["view", "entry", "S-099", "--record", record]).stderr, /No History entry S-099/);
    assert.equal(
      ok(run(folder, ["view", "index", "--record", record])),
      "- S-001 completed — Write the parser · read when the parser's shape is in question\n- A-001 completed — Build the parser · read when what was agreed about the parser is in question\n- D-002 accepted — Read the format · read when the format reading is in question\n",
    );
    assert.match(run(folder, ["view", "resume", "--record", record]).stderr, /Schema 5 has no resume view/);
  });
});

test("checkpoint remembers where each Space repository is, so recover finds it from any folder", async () => {
  await withFolder(async (folder) => {
    const { home, record } = await storeWithFixture(folder);
    const work = join(folder, "widget");
    execFileSync("git", ["init", "--quiet", "-b", "schema-5", work]);
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
    ok(run(folder, ["checkpoint", "--record", record, "--repo", work]));
    assert.deepEqual(JSON.parse(await readFile(join(home, "local", "repositories.json"), "utf8")), {
      // Git names a repository by its real path: on macOS the temporary folder is reached through a symlink.
      "github.com/acme/widget": realpathSync(work),
    });
    assert.match(
      ok(run(folder, ["view", "recover", "--record", record])),
      new RegExp(
        `- github.com/acme/widget at ${realpathSync(work)}: schema-5 at [0-9a-f]{8}, not pushed, as recorded\\n`,
      ),
    );
  });
});

test("the active decisions put waiting and answered items first, then the rest newest first, within the budget", () => {
  const list = [
    "# Decisions",
    "- P1 [default] a -> b",
    "- P2 [agreed] c -> d",
    "- P3 [proposed] e -> f",
    "- T1 [changed] g -> serves P1",
    "- T2 [dropped] h -> serves P1",
  ].join("\n");
  assert.deepEqual(activeDecisions(list, 1000), {
    shown: [
      "- P3 [proposed] e -> f",
      "- P2 [agreed] c -> d",
      "- T2 [dropped] h -> serves P1",
      "- T1 [changed] g -> serves P1",
      "- P1 [default] a -> b",
    ],
    hidden: 0,
    total: 5,
    budget: 1000,
  });
  assert.deepEqual(activeDecisions(list, 12).hidden, 3);
  assert.deepEqual(activeDecisions(null), { shown: [], hidden: 0, total: 0, budget: 600 });
});
