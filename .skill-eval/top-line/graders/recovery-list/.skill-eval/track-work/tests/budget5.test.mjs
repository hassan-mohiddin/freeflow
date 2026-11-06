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
        "### Recovery",
        "- always, not counted: specs/design.md — the accepted design.",
        "- always: sources/notes.md — what the next step rests on.",
        "- always: specs/design.md — the design again, read once.",
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
        "Current Work (In flight included) and the files Recovery's always lines name share the rest; a when line's file counts once its trigger applies and it is read.",
        "Not counted: the rules, the skills, and the files Recovery's always, not counted lines name.",
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

test("budget --record shows what each part holds and what is left; an always, not counted line's file is sized and never counted", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = await task(folder, cli);
    const out = ok(cli(["budget", "--record", record]));
    assert.match(
      out,
      /\nNow, counted:\n- Current Context: \d+ words \(fixed about 600\)\n- Current Work: \d+ words\n- Future Work: 0 words \(fixed about 300\)\n/,
    );
    // notes.md counts; design.md is a definition, though an always line names it too.
    assert.match(
      out,
      /\n- Recovery's always files: 202 words\n- Total: [\d,]+ of about 10,000 words; [\d,]+ left\.\nNot counted:\n- rules: 0 words\n- Recovery's uncounted files: 3,002 words\n$/,
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

test("checkpoint --input rewrites In flight whole and replaces Recovery after a Recovery: line, keeping what it is not given, and refuses a line without its label or class", async () => {
  await withFolder(async ({ folder, cli }) => {
    const record = await task(folder, cli);
    const flight = (text) => /### In flight\n\n?([\s\S]*?)\n### Recovery/.exec(text)[1].trim();
    const recovery = (text) => /### Recovery\n\n?([\s\S]*?)\n### Next action/.exec(text)[1].trim();
    const checkpoint = (input) => cli(["checkpoint", "--record", record, "--input", "-"], input);
    const first = ok(
      checkpoint(
        [
          "- Now: half of the parser is written.",
          "- Dropped: a regular expression — it could not nest.",
          "Recovery:",
          "- always, not counted: specs/design.md — the accepted design.",
          "- always: sources/notes.md — what the next step rests on.",
          "- always: src.mjs (lines 3–5) — the loop being changed",
          "- when the tests fail: test/parser.test.mjs — what they check",
          "",
        ].join("\n"),
      ),
    );
    assert.match(first, /\nIn flight: rewritten, 2 line\(s\)\.\n/);
    // Each line with the size of what it names, and an always line's share of the budget (P5).
    assert.match(
      first,
      /\nRecovery: replaced, 4 line\(s\):\n- always, not counted: specs\/design\.md — the accepted design\. — 3,002 words, not counted\n- always: sources\/notes\.md — what the next step rests on\. — 202 words, 2% of the budget\n- always: src\.mjs \(lines 3–5\) — the loop being changed — 6 words, 0% of the budget\n- when the tests fail: test\/parser\.test\.mjs — what they check — 0 words once read\n/,
    );
    assert.match(
      first,
      /\nBudget: counted [\d,]+ of about 10,000 words \(normal, 200,000-token window\); .*not counted: rules 0, Recovery's uncounted files 3,002\.\n/,
    );
    assert.equal(
      flight(await readFile(record, "utf8")),
      "- Now: half of the parser is written.\n- Dropped: a regular expression — it could not nest.",
    );
    // Without a Recovery: line the list is kept; with only one, In flight is kept.
    ok(checkpoint("- Pending: the test run — CI\n"));
    assert.equal(flight(await readFile(record, "utf8")), "- Pending: the test run — CI");
    assert.match(recovery(await readFile(record, "utf8")), /^- always, not counted: specs\/design\.md/);
    assert.match(
      ok(
        checkpoint(
          "Recovery:\n- always, not counted: specs/design.md — the accepted design.\n- always: gone.mjs — a file that is not there\n",
        ),
      ),
      /\nWarning: Recovery: gone\.mjs does not exist\n/,
    );
    assert.equal(flight(await readFile(record, "utf8")), "- Pending: the test run — CI");
    assert.match(
      ok(cli(["checkpoint", "--record", record])),
      /\nIn flight: unchanged; pass --input.*\nRecovery: kept, 2 line\(s\):\n/,
    );
    const before = await readFile(record, "utf8");
    assert.match(checkpoint("- Later: something\n").stderr, /An In flight line starts with Now, Observed/);
    // Carry is a Recovery line now (P7): an old Carry line is refused.
    assert.match(checkpoint("- Carry: src.mjs — the loop\n").stderr, /goes under Recovery/);
    assert.match(checkpoint("Recovery:\n- sources/notes.md — no class\n").stderr, /A Recovery line is/);
    assert.match(checkpoint("Recovery: sources/notes.md\n").stderr, /After "Recovery:" come its lines/);
    assert.match(checkpoint("just prose\n").stderr, /takes In flight's lines/);
    assert.equal(await readFile(record, "utf8"), before);
    // "Recovery: none" empties the list, and names the definition it dropped.
    const emptied = ok(checkpoint("Recovery: none\n"));
    assert.match(emptied, /\nRecovery: replaced, 0 line\(s\)\.\n/);
    assert.match(
      emptied,
      /\nDropped: "always, not counted: specs\/design\.md — the accepted design\.", an always, not counted line \(an accepted definition or a method the work follows\): put it back with the next checkpoint if the work still rests on it\.\n/,
    );
    assert.equal(recovery(await readFile(record, "utf8")), "");
    ok(checkpoint("none\n"));
    assert.equal(flight(await readFile(record, "utf8")), "");
    // A labelled line that says only "none" is no line: the rest of In flight stays (T20).
    ok(checkpoint("- Now: the tests pass.\n- Pending: (none)\n"));
    assert.equal(flight(await readFile(record, "utf8")), "- Now: the tests pass.");
    ok(checkpoint("Recovery:\n- always: sources/notes.md — what the next step rests on.\n"));
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
        [
          "- Now: reading.",
          "Recovery:",
          "- always, not counted: specs/design.md — the accepted design.",
          "- always: sources/notes.md — what the next step rests on.",
          "- always: specs/design.md — the design again, read once.",
          "- always: src.mjs (lines 3–5) — the loop",
          "",
        ].join("\n"),
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
      "## Recovery: always (counted)",
      "## Recovery: always, not counted",
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
    assert.ok(section("## Recovery: always (counted)").includes(words(10_500, "note")));
    assert.match(section("## Checks"), /- Warning: the counted memory is [\d,]+ words, over the budget/);
    // A file an always line and an always, not counted line both name is a definition: printed once, not counted.
    assert.equal(out.split('<file path=".freeflow/tasks/task-001-budgeted/specs/design.md">').length - 1, 1);
    assert.equal(out.split("# Design").length - 1, 1);
    assert.ok(section("## Recovery: always, not counted").includes("# Design"));
    // A line range cuts what is read, numbered by file line (T2).
    assert.match(
      section("## Recovery: always (counted)"),
      /<file path="\.freeflow\/tasks\/task-001-budgeted\/src\.mjs lines 3–5">\n3\tline 3\n4\tline 4\n5\tline 5\n<\/file>/,
    );
    assert.match(
      section("## Core skills (not counted)"),
      /<file path="[^"]*track-work\/SKILL\.md">\n---\nname: track-work/,
    );
    assert.match(section("## Core skills (not counted)"), /discuss-work\/SKILL\.md/);
    // A core skill the record names is printed once, and never counted, whatever the line's class.
    const text = await readFile(record, "utf8");
    await writeFile(
      record,
      text.replace(
        "### Recovery\n\n",
        `### Recovery\n\n- always, not counted: ${CORE_SKILLS[0]} — how this record is kept.\n- always: ${CORE_SKILLS[1]} — discussing.\n`,
      ),
    );
    const again = ok(cli(["view", "bundle", "--record", record]));
    assert.equal(again.split("\nname: track-work\n").length - 1, 1);
    assert.equal(again.split("\nname: discuss-work\n").length - 1, 1);
    assert.match(again, /\n- Recovery's always files: 10,506 words, counted\n/);
    assert.match(section("## Core skills (not counted)"), /execute-work\/SKILL\.md/);
    assert.match(section("## Sizes"), /- Recovery's always files: 10,506 words, counted\n/);
    assert.match(section("## Sizes"), /- Recovery's uncounted files: 3,002 words, not counted\n/);
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
      "## Recovery",
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
      text.replace(
        "### Recovery\n",
        "### Recovery\n\n- always, not counted: docs/spec.md (in the repository) — the design.\n",
      ),
    );
    ok(
      inWork(
        ["checkpoint", "--record", "widget/task-001", "--repo", ".", "--input", "-"],
        "- Now: probing.\nRecovery:\n- always, not counted: docs/spec.md (in the repository) — the design.\n- always: probe.txt — the file\n",
      ),
    );
    const bundle = ok(inWork(["view", "bundle", "--record", "widget/task-001"]));
    assert.match(bundle, /<file path="probe\.txt">\np\n<\/file>/);
    assert.match(bundle, /<file path="docs\/spec\.md">\n(spec ?){50}\n<\/file>/);
    assert.doesNotMatch(bundle, /does not exist/);
  });
});
