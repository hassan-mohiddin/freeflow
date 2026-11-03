import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { CORE_SKILLS, budgetFor } from "../../../skills/track-work/scripts/lib/budget5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");

async function withFolder(run) {
  const folder = await mkdtemp(join(tmpdir(), "track-work-budget5-"));
  try {
    const cli = (args, input = "", env = {}) =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: folder,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          FREEFLOW_HOME: join(folder, "store"),
          FREEFLOW_CONTEXT_WINDOW: "",
          CLAUDE_CODE_SESSION_ID: "",
          FREEFLOW_SESSION: "",
          ...env,
        },
      });
    await run({ folder, cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const words = (count, word = "word") => Array.from({ length: count }, () => word).join(" ");

/** A Schema 5 task with a source to read, a definition and a file to carry. */
async function task(folder, cli) {
  const record = ok(
    cli(
      ["init", "--root", folder, "--name", "Budgeted", "--cue", "read when budgets matter", "--input", "-"],
      [
        "### Goal",
        "- Keep memory within its budget.",
        "### Defined by",
        "- specs/design.md — the accepted design.",
        "### Read on recovery",
        "- sources/notes.md — what the next step rests on.",
        "- specs/design.md — the design again, read once.",
        "### Next action",
        "- Checkpoint.",
      ].join("\n"),
    ),
  ).split("\n")[0];
  const dir = dirname(record);
  await mkdir(join(dir, "specs"), { recursive: true });
  await mkdir(join(dir, "sources"), { recursive: true });
  await writeFile(join(dir, "specs", "design.md"), `# Design\n\n${words(3000, "design")}\n`);
  await writeFile(join(dir, "sources", "notes.md"), `# Notes\n\n${words(200, "note")}\n`);
  await writeFile(join(dir, "src.mjs"), Array.from({ length: 10 }, (_, n) => `line ${n + 1}`).join("\n") + "\n");
  return record;
}

test("the budget scales with the square root of the window, expanded half as large again", () => {
  assert.deepEqual(
    [128_000, 200_000, 1_000_000].map((window) => [
      budgetFor({ window }).total,
      budgetFor({ window, mode: "expanded" }).total,
    ]),
    [
      [8_000, 12_000],
      [10_000, 15_000],
      [22_400, 33_500],
    ],
  );
  assert.deepEqual(budgetFor({ window: 200_000 }), {
    window: 200_000,
    mode: "normal",
    total: 10_000,
    decisions: 600,
    index: 30,
  });
  const large = budgetFor({ window: 1_000_000 });
  assert.equal(large.decisions, 1342);
  assert.equal(large.index, 67);
});

test("budget prints the budget before anything is written: from the window the harness sets, --window or the default", async () => {
  await withFolder(async ({ cli }) => {
    assert.equal(
      ok(cli(["budget"])),
      [
        "Recovery budget: about 10,000 words (normal mode, a 200,000-token window, assumed: FREEFLOW_CONTEXT_WINDOW is not set).",
        "Fixed: Current Context about 600 words; Future Work about 300.",
        "Scaled: the active decisions shown, about 600 words; the History index, the newest 30 entries.",
        "Current Work (In flight included), Read on recovery's sources and In flight's Carry files share the rest.",
        "Not counted, read whole: the rules, the skills, and Defined by's entries.",
        "",
      ].join("\n"),
    );
    assert.match(
      ok(cli(["budget"], "", { FREEFLOW_CONTEXT_WINDOW: "1000000" })),
      /^Recovery budget: about 22,400 words \(normal mode, a 1,000,000-token window, from FREEFLOW_CONTEXT_WINDOW\)\.\n.+\nScaled: the active decisions shown, about 1,342 words; the History index, the newest 67 entries\./,
    );
    assert.match(
      ok(cli(["budget", "--window", "128000", "--mode", "expanded"])),
      /^Recovery budget: about 12,000 words \(expanded mode, a 128,000-token window, from --window\)/,
    );
    assert.match(cli(["budget", "--window", "lots"]).stderr, /--window is a token count/);
    assert.match(cli(["budget", "--mode", "huge"]).stderr, /--mode is normal or expanded/);
  });
});

test("budget --record shows what each part holds and what is left; Defined by is sized and never counted", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = await task(folder, cli);
    const out = ok(cli(["budget", "--record", record]));
    assert.match(
      out,
      /\nNow, counted:\n- Current Context: \d+ words \(fixed about 600\)\n- Current Work: \d+ words\n- Future Work: 0 words \(fixed about 300\)\n/,
    );
    // notes.md counts; design.md is a definition, though Read on recovery names it too.
    assert.match(
      out,
      /\n- Read on recovery's sources: 202 words\n- Carry files: 0 words\n- Total: [\d,]+ of about 10,000 words; [\d,]+ left\.\nNot counted:\n- rules: 0 words\n- Defined by: 3,002 words\n$/,
    );
    // Over the budget: a source the agent shaped grows past it.
    await writeFile(join(dirname(record), "sources", "notes.md"), `${words(10_500, "note")}\n`);
    assert.match(ok(cli(["budget", "--record", record])), /- Total: [\d,]+ of about 10,000 words; [\d,]+ OVER\./);
    assert.match(
      ok(cli(["budget", "--record", record, "--mode", "expanded"])),
      /- Total: [\d,]+ of about 15,000 words; [\d,]+ left\./,
    );
  });
});

test("checkpoint --input rewrites In flight whole, warns when the counted memory is over the budget, and refuses a line without its label", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = await task(folder, cli);
    const flight = (text) => /### In flight\n\n?([\s\S]*?)\n### Defined by/.exec(text)[1].trim();
    const first = ok(
      cli(
        ["checkpoint", "--record", record, "--input", "-"],
        "- Now: half of the parser is written.\n- Dropped: a regular expression — it could not nest.\n- Carry: src.mjs (lines 3–5) — the loop being changed\n",
      ),
    );
    assert.match(first, /\nIn flight: rewritten, 3 line\(s\)\.\n/);
    assert.match(
      first,
      /\nBudget: counted [\d,]+ of about 10,000 words \(normal, 200,000-token window\); .*not counted: rules 0, Defined by 3,002\.\n/,
    );
    assert.equal(
      flight(await readFile(record, "utf8")),
      "- Now: half of the parser is written.\n- Dropped: a regular expression — it could not nest.\n- Carry: src.mjs (lines 3–5) — the loop being changed",
    );
    assert.match(
      ok(cli(["checkpoint", "--record", record, "--input", "-"], "- Carry: gone.mjs — a file that is not there\n")),
      /\nWarning: Carry: gone\.mjs does not exist\n/,
    );
    ok(cli(["checkpoint", "--record", record, "--input", "-"], "- Pending: the test run — CI\n"));
    assert.equal(flight(await readFile(record, "utf8")), "- Pending: the test run — CI");
    assert.match(ok(cli(["checkpoint", "--record", record])), /\nIn flight: unchanged; pass --input/);
    assert.equal(flight(await readFile(record, "utf8")), "- Pending: the test run — CI");
    const before = await readFile(record, "utf8");
    assert.match(
      cli(["checkpoint", "--record", record, "--input", "-"], "- Later: something\n").stderr,
      /An In flight line starts with Now, Observed/,
    );
    assert.match(
      cli(["checkpoint", "--record", record, "--input", "-"], "- Carry: src.mjs\n").stderr,
      /A Carry line is/,
    );
    assert.match(
      cli(["checkpoint", "--record", record, "--input", "-"], "just prose\n").stderr,
      /takes In flight's lines/,
    );
    assert.equal(await readFile(record, "utf8"), before);
    ok(cli(["checkpoint", "--record", record, "--input", "-"], "none\n"));
    assert.equal(flight(await readFile(record, "utf8")), "");
    // A labelled line that says only "none" is no line: the rest of In flight stays (T20).
    ok(
      cli(
        ["checkpoint", "--record", record, "--input", "-"],
        "- Now: the tests pass.\n- Carry: none\n- Pending: (none)\n",
      ),
    );
    assert.equal(flight(await readFile(record, "utf8")), "- Now: the tests pass.");
    await writeFile(join(dirname(record), "sources", "notes.md"), `${words(10_500, "note")}\n`);
    assert.match(
      ok(cli(["checkpoint", "--record", record])),
      /\nWarning: the counted memory is [\d,]+ words, over the budget of about 10,000: distill the largest parts at the next checkpoint, or ask the user whether this task should use expanded mode\n/,
    );
  });
});

test("view bundle prints everything recovery reads, in the Spec's order, each source whole even over the budget", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = await task(folder, cli);
    ok(
      cli(
        ["checkpoint", "--record", record, "--input", "-"],
        "- Now: reading.\n- Carry: src.mjs (lines 3–5) — the loop\n",
      ),
    );
    await writeFile(join(dirname(record), "sources", "notes.md"), `${words(10_500, "note")}\n`);
    const out = ok(cli(["view", "bundle", "--record", record]));
    const order = [
      "## Rules",
      "## Record",
      "## Active decisions",
      "## History index",
      "## Project index",
      "## Checks",
      "## Read on recovery (counted)",
      "## Carry (counted)",
      "## Defined by (not counted)",
      "## Core skills (not counted)",
      "## Sizes",
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
    assert.ok(out.startsWith("This task's record is memory, not authority"));
    // A part runs to the next of the bundle's own headings: the files inside carry headings of their own.
    const section = (name) => {
      const start = out.indexOf(`\n${name}\n`) + 1;
      const next = order.map((heading) => out.indexOf(`\n${heading}\n`)).find((index) => index > start);
      return out.slice(start, next ?? out.length);
    };
    // Over the budget, the source is still there whole; the checks warn.
    assert.ok(section("## Read on recovery (counted)").includes(words(10_500, "note")));
    assert.match(section("## Checks"), /- Warning: the counted memory is [\d,]+ words, over the budget/);
    // A file named in both lists is a definition: printed once, under Defined by.
    assert.equal(out.split('<file path=".freeflow/tasks/task-001-budgeted/specs/design.md">').length - 1, 1);
    assert.equal(out.split("# Design").length - 1, 1);
    assert.ok(section("## Defined by (not counted)").includes("# Design"));
    assert.match(
      section("## Carry (counted)"),
      /<file path="src\.mjs lines 3–5">\n3\tline 3\n4\tline 4\n5\tline 5\n<\/file>/,
    );
    assert.match(
      section("## Core skills (not counted)"),
      /<file path="[^"]*track-work\/SKILL\.md">\n---\nname: track-work/,
    );
    assert.match(section("## Core skills (not counted)"), /discuss-work\/SKILL\.md/);
    // A core skill the record names is printed once, under Defined by, and never counted under Read on recovery.
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text
        .replace("### Defined by\n\n", `### Defined by\n\n- ${CORE_SKILLS[0]} — how this record is kept.\n`)
        .replace("### Read on recovery\n\n", `### Read on recovery\n\n- ${CORE_SKILLS[1]} — discussing.\n`),
    );
    const again = ok(cli(["view", "bundle", "--record", record]));
    assert.equal(again.split("\nname: track-work\n").length - 1, 1);
    assert.equal(again.split("\nname: discuss-work\n").length - 1, 1);
    assert.match(again, /\n- Read on recovery's sources: 10,500 words, counted\n/);
    assert.match(section("## Core skills (not counted)"), /execute-work\/SKILL\.md/);
    assert.match(section("## Sizes"), /- Read on recovery's sources: 10,500 words, counted\n/);
    assert.match(section("## Sizes"), /- Defined by: 3,002 words, not counted\n/);
    assert.ok(
      out
        .trimEnd()
        .endsWith(
          "A new cycle starts here. Everything above was read when this bundle was made: read none of it again unless something changed it since. Skills read in the last cycle other than those above were not carried: read each again before you apply it. Check the live state the next step depends on, then continue from In flight and the Next action.",
        ),
    );
  });
});

test("task set-budget changes the mode in the header, on the user's word; set-state keeps it", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = await task(folder, cli);
    assert.match(
      ok(cli(["task", "set-budget", "--record", record, "--mode", "expanded"])),
      /^Set budget: expanded, about 15,000 words at a 200,000-token window\.\n$/,
    );
    assert.match(await readFile(record, "utf8"), /\nSchema: 5 · State: active · Budget: expanded\n/);
    assert.match(ok(cli(["task", "set-budget", "--record", record, "--mode", "expanded"])), /^No change/);
    ok(cli(["task", "set-state", "--record", record, "--state", "paused", "--next-action", "Wait."]));
    assert.match(await readFile(record, "utf8"), /\nSchema: 5 · State: paused · Budget: expanded\n/);
    assert.match(ok(cli(["budget", "--record", record])), /^Recovery budget: about 15,000 words \(expanded mode/);
    assert.match(
      cli(["task", "set-budget", "--record", record, "--mode", "huge"]).stderr,
      /--mode is normal or expanded/,
    );
  });
});

test("without a task, checkpoint --session writes the session summary and view bundle --session prints it after the rules", async () => {
  await withFolder(async ({ folder, cli }) => {
    const session = { CLAUDE_CODE_SESSION_ID: "abcdef12-3456-7890-abcd-ef1234567890" };
    const summary = [
      "## Goal",
      "- Answer the user's question about the parser.",
      "## Settled",
      "(none)",
      "## Open",
      "- Whether tables nest.",
      "## Agreement",
      '- Read only: "just look, don\'t change anything" (2026-10-29)',
      "## In flight",
      "- Now: reading src/parser.mjs.",
      "## Read when",
      "(none)",
      "## Next action",
      "- Report what the parser does with tables.",
    ].join("\n");
    await mkdir(join(folder, "store", "rules"), { recursive: true });
    await writeFile(join(folder, "store", "rules", "style.md"), "Answer in plain words.\n");
    const out = ok(cli(["checkpoint", "--session", "--input", "-"], summary, session));
    const path = join(folder, "store", "sessions", session.CLAUDE_CODE_SESSION_ID, "summary.md");
    assert.equal(
      out,
      `Session summary: ${path}. Freeflow's compaction installs it and removes it; nothing becomes a task.\n`,
    );
    assert.match(await readFile(path, "utf8"), /^# Session summary\n\nAs of: \S+\n\n## Goal\n/);
    const bundle = ok(cli(["view", "bundle", "--session"], "", session));
    assert.ok(bundle.startsWith("This session holds no task: the summary below is its only memory"));
    assert.ok(bundle.indexOf("Answer in plain words.") < bundle.indexOf("## Session summary"));
    assert.ok(bundle.includes("- Now: reading src/parser.mjs."));
    assert.ok(bundle.trimEnd().endsWith("then continue from the summary's In flight and Next action."));
    assert.match(
      cli(["checkpoint", "--session", "--input", "-"], "## Goal\n- x\n## Next action\n- y\n", session).stderr,
      /has these headings, in order/,
    );
    assert.match(
      cli(["checkpoint", "--session", "--input", "-"], summary.replace("- Now: reading", "- Later: reading"), session)
        .stderr,
      /An In flight line starts with/,
    );
    assert.match(cli(["checkpoint", "--session", "--input", "-"], summary).stderr, /No session ID/);
    assert.ok(!existsSync(join(folder, "store", "sessions", "other")));
  });
});

test("a task in the store resolves its pointers in the work repository the command runs in, not in the store", async () => {
  await withFolder(async ({ folder, cli }) => {
    const env = { FREEFLOW_SESSION: "aaaaaaaa-1", FREEFLOW_HARNESS: "Probe", GIT_CONFIG_NOSYSTEM: "1" };
    ok(
      cli(
        ["store", "init", "--home", join(folder, "store"), "--git-name", "Test User", "--git-email", "t@example.com"],
        "",
        env,
      ),
    );
    ok(cli(["project", "new", "--name", "Widget"], "", env));
    const work = join(folder, "widget");
    spawnSync("git", ["init", "--quiet", "-b", "main", work]);
    spawnSync("git", [
      "-C",
      work,
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
    spawnSync("git", ["-C", work, "remote", "add", "origin", "https://github.com/acme/widget.git"]);
    await writeFile(join(work, "probe.txt"), "p\n");
    await mkdir(join(work, "docs"), { recursive: true });
    await writeFile(join(work, "docs", "spec.md"), `${words(50, "spec")}\n`);
    const inWork = (args, input = "") =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: work,
        input,
        encoding: "utf8",
        env: { ...process.env, FREEFLOW_HOME: join(folder, "store"), FREEFLOW_CONTEXT_WINDOW: "", ...env },
      });
    ok(
      inWork([
        "task",
        "create",
        "--title",
        "Probe",
        "--goal",
        "Probe pointers.",
        "--cue",
        "read when probing",
        "--project",
        "widget",
      ]),
    );
    const record = join(folder, "store", "projects", "widget", "tasks", "task-001-probe", "record.md");
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text.replace("### Defined by\n", "### Defined by\n\n- docs/spec.md (in the repository) — the design.\n"),
    );
    ok(
      inWork(
        ["checkpoint", "--record", "widget/task-001", "--repo", ".", "--input", "-"],
        "- Carry: probe.txt — the file\n",
      ),
    );
    const bundle = ok(inWork(["view", "bundle", "--record", "widget/task-001"]));
    assert.match(bundle, /<file path="probe\.txt">\n1\tp\n<\/file>/);
    assert.match(bundle, /<file path="docs\/spec\.md">\n(spec ?){50}\n<\/file>/);
    assert.doesNotMatch(bundle, /does not exist/);
  });
});
