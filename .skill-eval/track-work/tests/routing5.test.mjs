// SPEC-010 4.1 and 4.2, and the delegation rules of 2026-11-14: the rules file in the store's rules/delegation.md (a
// project's first, the older rules/routing.md after each, Freeflow's shipped default last), the route delegate open
// takes from it, the Worker: ceiling, an agreement's Workers: grants, the brief's Settled, Check and Route, a sent-back
// return's reason, and the planner's rates.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  DEFAULT_LABEL,
  DEFAULT_RULES,
  RoutingError,
  grantCovers,
  grantsIn,
  parseRules,
  ranksAbove,
  routeFrom,
  rulesFiles,
  workerFrom,
} from "../../../skills/track-work/scripts/lib/routing5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const BRIEF = "## Result wanted\nThe thing.\n## Scope\nsrc\n## Done when\nIt runs.\n";
const DEFAULT = [{ label: DEFAULT_LABEL, text: DEFAULT_RULES }];
const PROSE = "# Delegation rules\n\nHassan's own rules, in prose. Haiku is the default worker, at xhigh.\n";

function ok(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function refused(result, pattern) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, pattern);
}

const git = (cwd, args) =>
  execFileSync("git", ["-C", cwd, "-c", "user.name=T", "-c", "user.email=t@example.com", ...args], {
    encoding: "utf8",
  }).trim();

/** A local store with a project widget and a task in it with a Slice, beside a repository. */
async function withStore(run) {
  const folder = realpathSync(await mkdtemp(join(tmpdir(), "track-work-routing5-")));
  try {
    await writeFile(join(folder, "gitconfig"), "");
    const home = join(folder, "home");
    const repo = join(folder, "widget");
    execFileSync("git", ["init", "--quiet", "-b", "main", repo]);
    git(repo, ["commit", "--quiet", "--allow-empty", "-m", "start"]);
    const cli = (args, { input = "", env = {} } = {}) =>
      spawnSync(process.execPath, [scriptPath, ...args], {
        cwd: folder,
        input,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: join(folder, "gitconfig"),
          GIT_CONFIG_NOSYSTEM: "1",
          FREEFLOW_HOME: home,
          FREEFLOW_SESSION: "aaaaaaaa-1111",
          FREEFLOW_HARNESS: "Claude Code",
          FREEFLOW_TRANSCRIPT: "",
          CLAUDECODE: "",
          CLAUDE_CODE_SESSION_ID: "",
          CLAUDE_CODE_REMOTE: "",
          CLAUDE_CODE_REMOTE_SESSION_ID: "",
          ...env,
        },
      });
    ok(cli(["store", "init", "--git-name", "Test User", "--git-email", "t@example.com"]));
    ok(cli(["project", "new", "--name", "widget"]));
    ok(
      cli([
        "task",
        "create",
        "--title",
        "Widget",
        "--goal",
        "Build it.",
        "--cue",
        "read when widget",
        "--project",
        "widget",
      ]),
    );
    ok(
      cli(
        [
          "slice",
          "start-direct",
          "--record",
          "widget/task-001",
          "--title",
          "Coordinate",
          "--next-action",
          "Wait.",
          "--input",
          "-",
        ],
        {
          input:
            "- Result wanted: r.\n- Under: the user's request.\n- Scope: s.\n- Done when: d.\n- Stop if: x.\n- Started from: y.\n",
        },
      ),
    );
    const taskDir = join(home, "projects", "widget", "tasks", "task-001-widget");
    await run({ folder, home, repo, taskDir, cli });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

const open = (cli, flags, options = {}) =>
  cli(["delegate", "open", "--record", "widget/task-001", "--title", "Build the thing", ...flags, "--input", "-"], {
    input: BRIEF,
    ...options,
  });

const briefOf = (taskDir, id = "D-001", slug = "build-the-thing") =>
  readFile(join(taskDir, "delegations", `${id}-${slug}`, "brief.md"), "utf8");

/** The store's delegation.md (or a project's), written with a table of its own. */
const table = (rows, { cheap = null, worker = null } = {}) =>
  [
    cheap && `Cheap: ${cheap}`,
    worker && `Worker: ${worker}`,
    "",
    "| Kind | Settled | Check | Tier | Effort | Ask first |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ]
    .filter((line) => line !== null && line !== false)
    .join("\n");

test("the shipped default picks the first matching row for each kind, settled and check, as SPEC-010 section 3 lays out", () => {
  const parsed = parseRules(DEFAULT_RULES);
  assert.equal(parsed.cheap, "claude-haiku-5-5");
  assert.equal(parsed.worker, "claude-opus-5-5");
  assert.equal(parsed.rows.length, 6);
  const expected = (kind, tier, settled, check) => {
    if (["gather", "research", "eval"].includes(kind)) return [1, "claude-haiku-5-5, xhigh", false];
    if (kind === "review")
      return tier === "security" ? [3, "claude-opus-5-5, high", true] : [2, "claude-haiku-5-5, xhigh", false];
    if (settled === "yes" && ["scripted", "tests"].includes(check)) return [4, "claude-haiku-5-5, xhigh", false];
    if (settled === "no") return [5, "claude-opus-5-5, high", true];
    if (check === "judgement") return [6, "claude-opus-5-5, high", true];
    return null;
  };
  let combinations = 0;
  for (const kind of ["gather", "research", "eval", "review", "build"])
    for (const tier of kind === "review" ? [null, "security"] : [null])
      for (const settled of [null, "yes", "no"])
        for (const check of [null, "scripted", "tests", "judgement"]) {
          combinations += 1;
          // The coordinator's model is never the frontier tier's: the Worker: model is.
          const route = routeFrom(DEFAULT, { kind, tier, settled, check }, "claude-fable-5-2");
          const want = expected(kind, tier, settled, check);
          const name = JSON.stringify({ kind, tier, settled, check });
          if (!want) {
            assert.equal(route.state, "unmatched", name);
            continue;
          }
          assert.equal(route.state, "matched", name);
          assert.deepEqual([route.row.number, route.agent, route.askFirst], want, name);
          assert.equal(route.route, `${DEFAULT_LABEL} row ${want[0]}`, name);
        }
  assert.equal(combinations, 72);
  // The Route lines name the shipped default in place of a file's label.
  assert.equal(
    routeFrom(DEFAULT, { kind: "build", settled: "yes", check: "tests" }, null).line,
    "Route: cheap (claude-haiku-5-5), xhigh (Freeflow's default: build, settled yes, check tests)",
  );
  assert.equal(
    routeFrom(DEFAULT, { kind: "build", settled: "no", check: "tests" }, "claude-opus-5-5").line,
    "Route: frontier (claude-opus-5-5), high — needs the user's yes (Freeflow's default)",
  );
});

test("the frontier tier resolves to the Worker: model, and to the coordinator's model only when no file names a Worker:", () => {
  const project = {
    label: "projects/widget/rules/delegation.md",
    text: table(["| build | no | any | frontier | high | no |"], { worker: "claude-sonnet-5" }),
  };
  const won = routeFrom([project, ...DEFAULT], { kind: "build", settled: "no", check: "tests" }, "claude-fable-5-2");
  assert.equal(won.agent, "claude-sonnet-5, high");
  assert.equal(won.route, "projects/widget/rules/delegation.md row 1");
  // A table with no Worker: line anywhere but the default still has the default's Worker: (Opus).
  const bare = { label: "rules/delegation.md", text: table(["| build | no | any | frontier | high | no |"]) };
  assert.equal(
    routeFrom([bare, ...DEFAULT], { kind: "build", settled: "no", check: "tests" }, "claude-fable-5-2").agent,
    "claude-opus-5-5, high",
  );
  // With no Worker: line in any file, the coordinator's model, as before.
  assert.equal(
    routeFrom([bare], { kind: "build", settled: "no", check: "tests" }, "claude-fable-5-2").agent,
    "claude-fable-5-2, high",
  );
  assert.equal(workerFrom([bare]), null);
  assert.equal(workerFrom(DEFAULT), "claude-opus-5-5");
});

test("a project's table wins over the store's, a row it does not match falls to the store's, and each field is looked up on its own", () => {
  const project = {
    label: "projects/widget/rules/routing.md",
    text: "Cheap: claude-haiku-4-5\n\n| Kind | Settled | Check | Tier | Effort | Ask first |\n| --- | --- | --- | --- | --- | --- |\n| build | yes | tests | frontier | medium | no |\n",
  };
  const won = routeFrom([project, ...DEFAULT], { kind: "build", settled: "yes", check: "tests" }, "claude-fable-5-2");
  assert.equal(won.route, "projects/widget/rules/routing.md row 1");
  assert.equal(won.agent, "claude-opus-5-5, medium");
  assert.equal(
    won.line,
    "Route: frontier (claude-opus-5-5), medium (projects/widget/rules/routing.md: build, settled yes, check tests)",
  );
  // A row the project's table does not match falls to the default's; the Cheap: model is the first file's that has one.
  const fell = routeFrom([project, ...DEFAULT], { kind: "gather" }, null);
  assert.equal(fell.route, `${DEFAULT_LABEL} row 1`);
  assert.equal(fell.agent, "claude-haiku-4-5, xhigh");
});

test("a rules file with no table is prose: it falls through to the next file and the default, with no error", () => {
  const files = [{ label: "rules/delegation.md", text: PROSE }, ...DEFAULT];
  const route = routeFrom(files, { kind: "build", settled: "yes", check: "tests" }, null);
  assert.equal(route.state, "matched");
  assert.equal(route.route, `${DEFAULT_LABEL} row 4`);
  assert.equal(parseRules(PROSE).rows, null);
  assert.equal(workerFrom(files), "claude-opus-5-5");
  // Prose with no table in the first file and the default's line for the rest: still the default's route.
  assert.equal(
    routeFrom([{ label: "rules/delegation.md", text: "" }, ...DEFAULT], { kind: "gather" }, null).route,
    `${DEFAULT_LABEL} row 1`,
  );
});

test("routing.md is read when no delegation.md table exists, and a delegation.md table is read before it", () => {
  const older = {
    label: "rules/routing.md",
    text: table(["| gather | any | any | cheap | high | no |"], { cheap: "claude-haiku-4-5" }),
  };
  const newer = { label: "rules/delegation.md", text: table(["| build | yes | tests | cheap | medium | no |"]) };
  assert.equal(
    routeFrom([{ label: "rules/delegation.md", text: PROSE }, older, ...DEFAULT], { kind: "gather" }, null).route,
    "rules/routing.md row 1",
  );
  assert.equal(
    routeFrom([{ label: "rules/delegation.md", text: PROSE }, older, ...DEFAULT], { kind: "gather" }, null).agent,
    "claude-haiku-4-5, high",
  );
  assert.equal(routeFrom([newer, older, ...DEFAULT], { kind: "gather" }, null).route, `rules/routing.md row 1`);
  assert.equal(
    routeFrom([newer, older, ...DEFAULT], { kind: "build", settled: "yes", check: "tests" }, null).route,
    "rules/delegation.md row 1",
  );
});

test("a rules file that does not parse is refused with its line and the reason; a broken Kind header is an error, not prose", () => {
  const header = "| Kind | Settled | Check | Tier | Effort | Ask first |\n| --- | --- | --- | --- | --- | --- |\n";
  const cases = [
    [
      `${header}| build | maybe | any | cheap | xhigh | no |\n`,
      /^rules\/delegation\.md line 3: Settled "maybe" is not yes, no or any$/,
    ],
    [
      `${header}| build | yes | tests, vibes | cheap | xhigh | no |\n`,
      /^rules\/delegation\.md line 3: Check "tests, vibes" is not scripted, tests, judgement/,
    ],
    [
      `${header}| deploy | any | any | cheap | xhigh | no |\n`,
      /^rules\/delegation\.md line 3: Kind "deploy" is not one of build, review/,
    ],
    [`${header}| build | any | any | cheap | xhigh |\n`, /^rules\/delegation\.md line 3: a row has 6 cells, not 5$/],
    [
      `${header}| build | any | any | cheap | xhigh | maybe |\n`,
      /^rules\/delegation\.md line 3: Ask first "maybe" is yes or no$/,
    ],
    [
      `${header}| build | any | any | cheap | very high | no |\n`,
      /^rules\/delegation\.md line 3: Effort "very high" is one level/,
    ],
    [header, /^rules\/delegation\.md line 1: the table has no rows$/],
    [
      "Cheap: claude haiku\n\n" + header + "| any | any | any | cheap | xhigh | no |\n",
      /^rules\/delegation\.md line 1: Cheap: names one model ID/,
    ],
    [
      "Worker: claude opus\n\n" + header + "| any | any | any | cheap | xhigh | no |\n",
      /^rules\/delegation\.md line 1: Worker: names one model ID, as Worker: claude-opus-5-5/,
    ],
    [
      "Worker: claude-opus-5-5\nWorker: claude-sonnet-5\n",
      /^rules\/delegation\.md line 2: the worker model is named twice \(Worker:\)/,
    ],
    [
      "| Kind | Settled | Check |\n| --- | --- | --- |\n| build | any | any |\n",
      /^rules\/delegation\.md line 1: the table's header is Kind \| Settled \| Check, not Kind/,
    ],
  ];
  for (const [text, pattern] of cases) {
    assert.throws(
      () => parseRules(text, "rules/delegation.md"),
      (error) => error instanceof RoutingError && pattern.test(error.message),
      text,
    );
    const route = routeFrom([{ label: "rules/delegation.md", text }, ...DEFAULT], { kind: "build" }, null);
    assert.equal(route.state, "malformed");
    assert.match(route.error.message, pattern);
  }
  // The rules that apply are read in order; the shipped default is always the last.
  assert.deepEqual(
    rulesFiles(null).map((file) => file.label),
    [DEFAULT_LABEL],
  );
});

test("the rules files that apply are read in order: the project's delegation.md, the store's, the project's routing.md, the store's routing.md, the default", async () => {
  await withStore(async ({ home }) => {
    await mkdir(join(home, "projects", "widget", "rules"), { recursive: true });
    for (const file of [
      join(home, "rules", "routing.md"),
      join(home, "projects", "widget", "rules", "routing.md"),
      join(home, "rules", "delegation.md"),
      join(home, "projects", "widget", "rules", "delegation.md"),
    ])
      await writeFile(file, "# rules\n");
    assert.deepEqual(
      rulesFiles(home, "widget").map((file) => file.label),
      [
        join("projects", "widget", "rules", "delegation.md"),
        join("rules", "delegation.md"),
        join("projects", "widget", "rules", "routing.md"),
        join("rules", "routing.md"),
        DEFAULT_LABEL,
      ],
    );
    assert.deepEqual(
      rulesFiles(null, "widget").map((file) => file.label),
      [DEFAULT_LABEL],
      "with no store, only the default",
    );
  });
});

test("delegate open with no rules file of the user's uses Freeflow's default, names it in the Route line and the brief, and the store init writes no rules file", async () => {
  await withStore(async ({ home, taskDir, cli }) => {
    assert.equal(existsSync(join(home, "rules", "routing.md")), false);
    assert.equal(existsSync(join(home, "rules", "delegation.md")), false);
    const out = ok(open(cli, ["--kind", "build", "--settled", "yes", "--check", "tests"]));
    assert.match(
      out,
      /^Opened D-001 — Build the thing\ndelegations\/D-001-build-the-thing\/brief\.md\nSpace: the coordinator's checkout \(read only\)\nRoute: cheap \(claude-haiku-5-5\), xhigh \(Freeflow's default: build, settled yes, check tests\)\n/,
    );
    assert.match(
      await briefOf(taskDir),
      /^Agent: claude-haiku-5-5, xhigh · Kind: build · Settled: yes · Check: tests · Route: Freeflow's default row 4 · Handle: not started$/m,
    );
    // The default's Ask-first frontier row names the Worker: model, not the coordinator's.
    refused(
      open(cli, ["--kind", "build", "--settled", "no", "--check", "tests"], { env: { FREEFLOW_TRANSCRIPT: "" } }),
      /Route: frontier \(claude-opus-5-5\), high — needs the user's yes \(Freeflow's default\)\. Ask the user; on their yes, open it again with --agent "claude-opus-5-5, high"\./,
    );
  });
});

test("a prose-only delegation.md is no error for delegate open: the route falls through to the shipped default", async () => {
  await withStore(async ({ home, cli, taskDir }) => {
    await writeFile(join(home, "rules", "delegation.md"), PROSE);
    assert.match(
      ok(open(cli, ["--kind", "gather"])),
      /\nRoute: cheap \(claude-haiku-5-5\), xhigh \(Freeflow's default: gather\)\n/,
    );
    assert.match(await briefOf(taskDir), /Route: Freeflow's default row 1 · Handle/);
  });
});

test("delegate open refuses an Ask-first row until --agent is given, and the frontier tier is the Worker: model, not the coordinator's", async () => {
  await withStore(async ({ folder, taskDir, cli }) => {
    const transcript = join(folder, "session.jsonl");
    await writeFile(
      transcript,
      `${JSON.stringify({ type: "assistant", timestamp: "2026-11-04T10:00:00.000Z", effort: "xhigh", message: { id: "m1", model: "claude-fable-5-2", usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 10, output_tokens: 1 } } })}\n`,
    );
    const env = { FREEFLOW_TRANSCRIPT: transcript };
    const asked = open(cli, ["--kind", "build", "--settled", "no", "--check", "tests"], { env });
    refused(
      asked,
      /^Error: Route: frontier \(claude-opus-5-5\), high — needs the user's yes \(Freeflow's default\)\. Ask the user; on their yes, open it again with --agent "claude-opus-5-5, high"\.$/m,
    );
    refused(
      open(cli, ["--kind", "eval", "--check", "judgement", "--settled", "no", "--tier", "x y"], { env }),
      /--tier names one tier/,
    );
    assert.equal(
      (await readFile(join(taskDir, "record.md"), "utf8")).includes("D-001"),
      false,
      "a refusal writes nothing",
    );
    const given = ok(
      open(cli, ["--kind", "build", "--settled", "no", "--check", "tests", "--agent", "claude-opus-5-5, high"], {
        env,
      }),
    );
    assert.match(given, /\nRoute: given \(claude-opus-5-5, high\)\n/);
    assert.match(
      await briefOf(taskDir),
      /^Agent: claude-opus-5-5, high · Kind: build · Settled: no · Check: tests · Route: given · Handle: not started$/m,
    );
  });
});

test("a model ranked above the Worker: line is refused unless the user named it with --named-by-user; an unranked model is never refused", async () => {
  await withStore(async ({ home, taskDir, cli }) => {
    refused(
      open(cli, ["--kind", "gather", "--agent", "claude-fable-5-2, high"]),
      /^Error: delegate open: claude-fable-5-2 is ranked above the Worker: line \(claude-opus-5-5\), the strongest model a worker may run on\. Only a model the user names goes above it: add --named-by-user\.$/m,
    );
    refused(open(cli, ["--kind", "gather", "--named-by-user"]), /--named-by-user goes with --agent/);
    assert.equal(
      (await readFile(join(taskDir, "record.md"), "utf8")).includes("D-001"),
      false,
      "a refusal writes nothing",
    );
    // The same model, with the user's word, opens; the brief says given.
    assert.match(
      ok(open(cli, ["--kind", "gather", "--agent", "claude-fable-5-2, high", "--named-by-user"])),
      /\nRoute: given \(claude-fable-5-2, high\)\n/,
    );
    assert.match(await briefOf(taskDir), /^Agent: claude-fable-5-2, high · /m);
    // Opus and Haiku, and a model that is in no family, are not refused.
    ok(open(cli, ["--kind", "gather", "--agent", "claude-opus-5-5, high"]));
    ok(open(cli, ["--kind", "gather", "--agent", "Haiku, xhigh"]));
    ok(open(cli, ["--kind", "gather", "--agent", "some-other-model, high"]));
    // A store's own Worker: line lowers the ceiling.
    await writeFile(join(home, "rules", "delegation.md"), "Worker: claude-sonnet-5\n\nThe rows are the default's.\n");
    refused(
      open(cli, ["--kind", "gather", "--agent", "claude-opus-5-5, high"]),
      /ranked above the Worker: line \(claude-sonnet-5\)/,
    );
    ok(open(cli, ["--kind", "gather", "--agent", "claude-sonnet-5, high"]));
  });
});

test("a route the table names above the Worker: line is refused the same way, and the frontier route never is", async () => {
  await withStore(async ({ home, cli, taskDir }) => {
    await mkdir(join(home, "projects", "widget", "rules"), { recursive: true });
    await writeFile(
      join(home, "projects", "widget", "rules", "delegation.md"),
      table(["| gather | any | any | claude-fable-5-2 | high | no |"]),
    );
    refused(
      open(cli, ["--kind", "gather"]),
      /^Error: delegate open: projects\/widget\/rules\/delegation\.md row 1 routes to claude-fable-5-2, above the Worker: line \(claude-opus-5-5\)/m,
    );
    assert.equal((await readFile(join(taskDir, "record.md"), "utf8")).includes("D-001"), false);
    // The same row opens with the user's word, given on the command line.
    ok(open(cli, ["--kind", "gather", "--agent", "claude-fable-5-2, high", "--named-by-user"]));
    // The default's frontier rows resolve to the Worker: model, so they are never refused as above it: asked first instead.
    await rm(join(home, "projects", "widget", "rules", "delegation.md"));
    refused(
      open(cli, ["--kind", "build", "--settled", "yes", "--check", "judgement"]),
      /Route: frontier \(claude-opus-5-5\), high — needs the user's yes/,
    );
  });
});

test("an agreement's Workers: line lets an Ask-first route open without --agent, and the Route line says granted by A-NNN", async () => {
  await withStore(async ({ taskDir, cli }) => {
    refused(open(cli, ["--kind", "build", "--settled", "no", "--check", "tests"]), /needs the user's yes/);
    ok(
      cli(["agreement", "open", "--record", "widget/task-001", "--title", "Build the demo", "--input", "-"], {
        input:
          '- Done when the demo runs. You: "go" (2026-11-14)\n- Workers: Haiku; Opus at medium or high (2026-11-14)\n',
      }),
    );
    const out = ok(open(cli, ["--kind", "build", "--settled", "no", "--check", "tests"]));
    assert.match(
      out,
      /\nRoute: frontier \(claude-opus-5-5\), high \(Freeflow's default: build, settled no, check tests\), granted by A-001\n/,
    );
    assert.match(
      await briefOf(taskDir),
      /^Agent: claude-opus-5-5, high · Kind: build · Settled: no · Check: tests · Route: Freeflow's default row 5, granted by A-001 · Handle: not started$/m,
    );
  });
});

test("an agreement's Workers: line grants only the models and efforts it names", async () => {
  await withStore(async ({ cli, taskDir, home }) => {
    ok(
      cli(["agreement", "open", "--record", "widget/task-001", "--title", "Build the demo", "--input", "-"], {
        input: "- Done when the demo runs.\n- Workers: Haiku; Opus at medium\n",
      }),
    );
    // Opus is granted at medium only: the default's high row is still asked.
    refused(open(cli, ["--kind", "build", "--settled", "no", "--check", "tests"]), /needs the user's yes/);
    // A grant of one family does not grant the other: a named full ID covers only itself.
    await writeFile(
      join(home, "rules", "delegation.md"),
      table(["| build | no | any | claude-sonnet-5 | high | yes |"]),
    );
    refused(open(cli, ["--kind", "build", "--settled", "no", "--check", "tests"]), /needs the user's yes/);
    assert.equal(
      existsSync(join(taskDir, "delegations", "D-001-build-the-thing", "brief.md")),
      false,
      "a refusal writes no brief",
    );
  });
});

test("the Workers: grant reading: family words, full IDs, efforts, and the user's words after the first sentence", () => {
  assert.deepEqual(grantsIn(["- Workers: Haiku; Opus at medium or high (2026-11-14)"]), [
    { name: "haiku", efforts: null },
    { name: "opus", efforts: ["medium", "high"] },
  ]);
  assert.deepEqual(grantsIn(['- Workers: claude-opus-5-5 at high. You: "yes" (2026-11-14)']), [
    { name: "claude-opus-5-5", efforts: ["high"] },
  ]);
  assert.deepEqual(grantsIn(["- Workers: Opus", "  at high (2026-11-14)"]), [{ name: "opus", efforts: ["high"] }]);
  assert.deepEqual(grantsIn(["- Done when x."]), []);
  const opus = { name: "opus", efforts: ["medium", "high"] };
  assert.equal(grantCovers(opus, "claude-opus-5-5", "high"), true);
  assert.equal(grantCovers(opus, "claude-opus-5-5", "xhigh"), false);
  assert.equal(grantCovers(opus, "claude-fable-5-2", "high"), false);
  assert.equal(grantCovers({ name: "claude-opus-5-5", efforts: null }, "claude-opus-4-1", "high"), false);
  assert.equal(grantCovers({ name: "haiku", efforts: null }, "claude-haiku-5-5", "xhigh"), true);
});

test("the rank: haiku < sonnet < opus < fable = mythos, a family word ranks as its family, and an unranked model is never above", () => {
  assert.equal(ranksAbove("claude-sonnet-5", "claude-opus-5-5"), false);
  assert.equal(ranksAbove("claude-opus-5-5", "claude-sonnet-5"), true);
  assert.equal(ranksAbove("claude-fable-5-2", "claude-opus-5-5"), true);
  assert.equal(ranksAbove("claude-mythos-1", "claude-fable-5-2"), false, "fable and mythos rank equally");
  assert.equal(ranksAbove("claude-fable-5-2", "claude-mythos-1"), false, "fable and mythos rank equally");
  assert.equal(ranksAbove("Opus", "claude-haiku-5-5"), true, "a family word is its family");
  assert.equal(ranksAbove("gpt-5", "claude-haiku-5-5"), false, "a model in no family is not ranked");
  assert.equal(ranksAbove("claude-opus-5-5", "gpt-5"), false, "no ranked Worker: means nothing is above it");
});

test("check-return and close read Settled, Check and Route; a return sent back needs its reason, which History keeps", async () => {
  await withStore(async ({ taskDir, cli }) => {
    ok(open(cli, ["--kind", "build", "--settled", "yes", "--check", "tests"]));
    const folder = join(taskDir, "delegations", "D-001-build-the-thing");
    await writeFile(
      join(folder, "return.md"),
      "# D-001 return\nState: done\n## Result\nthe thing\n## Identities\nnone\n## Checks\nnone\n## Left open\nnone\n## Not done\nnone\n",
    );
    assert.match(
      ok(cli(["delegate", "check-return", "--record", "widget/task-001", "--id", "D-001"])),
      /^D-001's return: State done \(build, settled yes, check tests, route Freeflow's default row 4\); every heading is there; it names no commit\. Its line now says returned\..* Now read it and the diff, and rerun the tests that decide the result\.\n$/,
    );
    const close = (flags) =>
      cli(["delegate", "close", "--record", "widget/task-001", "--id", "D-001", ...flags, "--input", "-"], {
        input: "- Cue: read when the thing matters\n- Result: the tests are missing\n- Task effect: none\n",
      });
    refused(
      close(["--outcome", "sent back"]),
      /A return sent back says why: --reason brief \(the brief left out what the work needed\), capability \(the model could not do it\) or scope \(the work was not what the brief said\)\./,
    );
    refused(close(["--outcome", "sent back", "--reason", "laziness"]), /--reason is brief, capability, scope\./);
    refused(close(["--outcome", "stopped", "--reason", "scope"]), /--reason says why a return was sent back/);
    assert.match(
      ok(close(["--outcome", "sent back", "--reason", "capability"])),
      /^Closed D-001 — sent back \(capability\)/,
    );
    const history = await readFile(join(taskDir, "history.md"), "utf8");
    assert.match(
      history,
      /- Kind: build\n- Agent: claude-haiku-5-5, xhigh\n- Settled: yes\n- Check: tests\n- Route: Freeflow's default row 4\n- Reason: capability\n/,
    );
    ok(cli(["validate", "--record", "widget/task-001"]));
  });
});

test("estimate --plan and --store group closed delegations by kind, check and model, with the sent-back rate and its reasons", async () => {
  await withStore(async ({ home, taskDir, cli }) => {
    const entry = (id, { kind, check, agent, state, reason }) =>
      [
        `## ${id} — Work ${id}`,
        "",
        `- State: ${state}`,
        "- Dates: 2026-11-01",
        `- Cue: read when ${id} matters`,
        "- Under: the user's request",
        `- Kind: ${kind}`,
        `- Agent: ${agent}`,
        check && `- Check: ${check}`,
        reason && `- Reason: ${reason}`,
        "- Result: r.",
        "- Task effect: e.",
        `- Return: delegations/${id}-work/return.md`,
      ]
        .filter(Boolean)
        .join("\n");
    const haiku = "claude-haiku-5-5, xhigh";
    const entries = [
      ["D-001", { kind: "build", check: "tests", agent: haiku, state: "accepted" }],
      ["D-002", { kind: "build", check: "tests", agent: haiku, state: "sent back", reason: "capability" }],
      ["D-003", { kind: "build", check: "tests", agent: haiku, state: "sent back", reason: "brief" }],
      ["D-004", { kind: "build", check: "tests", agent: haiku, state: "accepted" }],
      [
        "D-005",
        { kind: "build", check: "judgement", agent: "claude-opus-5-5, high", state: "sent back", reason: "brief" },
      ],
      ["D-006", { kind: "gather", agent: haiku, state: "accepted" }],
      ["D-007", { kind: "gather", agent: haiku, state: "sent back" }],
    ];
    const path = join(taskDir, "history.md");
    await writeFile(
      path,
      `${(await readFile(path, "utf8")).trimEnd()}\n\n${entries.map(([id, fields]) => entry(id, fields)).join("\n\n")}\n`,
    );
    ok(cli(["validate", "--record", "widget/task-001"]));
    const rows = [
      "- build, tests, claude-haiku-5-5 xhigh: 4 closed, 2 sent back (50%): capability 1, brief 1",
      "- build, judgement, claude-opus-5-5 high: 1 closed, 1 sent back (100%): brief 1",
      "- gather, check not recorded, claude-haiku-5-5 xhigh: 2 closed, 1 sent back (50%): reason not recorded 1",
    ].join("\n");
    const plan = ok(
      cli(["estimate", "--plan", "--record", "widget/task-001", "--used", "1000", "--done", "1", "--input", "-"], {
        input: "- One\n",
      }),
    );
    assert.ok(
      plan.includes(
        `Delegations closed (this task), by kind, check and model, with how many were sent back:\n${rows}\n`,
      ),
      plan,
    );
    const store = ok(cli(["estimate", "--store"]));
    assert.ok(
      store.includes(`Delegations closed, by kind, check and model, with how many were sent back:\n${rows}\n`),
      store,
    );
    assert.ok(home);
  });
});
