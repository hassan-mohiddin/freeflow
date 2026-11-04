// SPEC-010 4.1 and 4.2: the routing table in the store's rules/routing.md (a project's first), the route delegate
// open takes from it, the brief's Settled, Check and Route, a sent-back return's reason, and the planner's rates.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  DEFAULT_TABLE,
  RoutingError,
  parseTable,
  routeFrom,
} from "../../../skills/track-work/scripts/lib/routing5.mjs";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const BRIEF = "## Result wanted\nThe thing.\n## Scope\nsrc\n## Done when\nIt runs.\n";
const STORE = [{ label: "rules/routing.md", text: DEFAULT_TABLE }];

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

/** A local store with the default table, a project widget and a task in it with a Slice, beside a repository. */
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

test("the default table picks the first matching row for each kind, settled and check, as SPEC-010 section 3 lays out", () => {
  const table = parseTable(DEFAULT_TABLE);
  assert.equal(table.cheap, "claude-haiku-5-5");
  assert.equal(table.rows.length, 6);
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
          const route = routeFrom(STORE, { kind, tier, settled, check }, "claude-opus-5-5");
          const want = expected(kind, tier, settled, check);
          const name = JSON.stringify({ kind, tier, settled, check });
          if (!want) {
            assert.equal(route.state, "unmatched", name);
            continue;
          }
          assert.equal(route.state, "matched", name);
          assert.deepEqual([route.row.number, route.agent, route.askFirst], want, name);
          assert.equal(route.route, `rules/routing.md row ${want[0]}`, name);
        }
  assert.equal(combinations, 72);
  // The Route lines are section 3's text.
  assert.equal(
    routeFrom(STORE, { kind: "build", settled: "yes", check: "tests" }, null).line,
    "Route: cheap (claude-haiku-5-5), xhigh (rules/routing.md: build, settled yes, check tests)",
  );
  assert.equal(
    routeFrom(STORE, { kind: "build", settled: "no", check: "tests" }, "claude-opus-5-5").line,
    "Route: frontier (the coordinator's model), high — needs the user's yes (rules/routing.md)",
  );
});

test("a project's table is read first and wins over the store's; a row it does not match falls to the store's", () => {
  const project = {
    label: "projects/widget/rules/routing.md",
    text: "Cheap: claude-haiku-4-5\n\n| Kind | Settled | Check | Tier | Effort | Ask first |\n| --- | --- | --- | --- | --- | --- |\n| build | yes | tests | frontier | medium | no |\n",
  };
  const won = routeFrom([project, ...STORE], { kind: "build", settled: "yes", check: "tests" }, "claude-opus-5-5");
  assert.equal(won.route, "projects/widget/rules/routing.md row 1");
  assert.equal(won.agent, "claude-opus-5-5, medium");
  assert.equal(
    won.line,
    "Route: frontier (claude-opus-5-5), medium (projects/widget/rules/routing.md: build, settled yes, check tests)",
  );
  // A frontier row with no coordinator's model known names the tier, as the family the agent resolves (section 5).
  assert.equal(routeFrom([project], { kind: "build", settled: "yes", check: "tests" }, null).agent, "frontier, medium");
  const fell = routeFrom([project, ...STORE], { kind: "gather" }, null);
  assert.equal(fell.route, "rules/routing.md row 1");
  // The store's row keeps the store's own cheap model.
  assert.equal(fell.agent, "claude-haiku-5-5, xhigh");
});

test("a malformed table is refused with its line and the reason", () => {
  const header = "| Kind | Settled | Check | Tier | Effort | Ask first |\n| --- | --- | --- | --- | --- | --- |\n";
  const cases = [
    [
      "# Routing\n\nNo table here.\n",
      /^rules\/routing\.md: no table with the columns Kind \| Settled \| Check \| Tier \| Effort \| Ask first$/,
    ],
    [
      `${header}| build | maybe | any | cheap | xhigh | no |\n`,
      /^rules\/routing\.md line 3: Settled "maybe" is not yes, no or any$/,
    ],
    [
      `${header}| build | yes | tests, vibes | cheap | xhigh | no |\n`,
      /^rules\/routing\.md line 3: Check "tests, vibes" is not scripted, tests, judgement/,
    ],
    [
      `${header}| deploy | any | any | cheap | xhigh | no |\n`,
      /^rules\/routing\.md line 3: Kind "deploy" is not one of build, review/,
    ],
    [`${header}| build | any | any | cheap | xhigh |\n`, /^rules\/routing\.md line 3: a row has 6 cells, not 5$/],
    [
      `${header}| build | any | any | cheap | xhigh | maybe |\n`,
      /^rules\/routing\.md line 3: Ask first "maybe" is yes or no$/,
    ],
    [
      `${header}| build | any | any | cheap | very high | no |\n`,
      /^rules\/routing\.md line 3: Effort "very high" is one level/,
    ],
    [header, /^rules\/routing\.md line 1: the table has no rows$/],
    [
      `Cheap: claude haiku\n\n${header}| any | any | any | cheap | xhigh | no |\n`,
      /^rules\/routing\.md line 1: Cheap: names one model ID/,
    ],
  ];
  for (const [text, pattern] of cases) {
    assert.throws(
      () => parseTable(text),
      (error) => error instanceof RoutingError && pattern.test(error.message),
      text,
    );
    const route = routeFrom([{ label: "rules/routing.md", text }], { kind: "build" }, null);
    assert.equal(route.state, "malformed");
    assert.match(route.error.message, pattern);
  }
  assert.equal(routeFrom([], { kind: "build" }, null).state, "none");
});

test("delegate open without --agent takes the route from the table, prints the Route line and writes Settled, Check and Route in the brief", async () => {
  await withStore(async ({ home, taskDir, cli }) => {
    assert.equal(await readFile(join(home, "rules", "routing.md"), "utf8"), DEFAULT_TABLE);
    const out = ok(open(cli, ["--kind", "build", "--settled", "yes", "--check", "tests"]));
    assert.match(
      out,
      /^Opened D-001 — Build the thing\ndelegations\/D-001-build-the-thing\/brief\.md\nSpace: the coordinator's checkout \(read only\)\nRoute: cheap \(claude-haiku-5-5\), xhigh \(rules\/routing\.md: build, settled yes, check tests\)\n/,
    );
    assert.match(
      await briefOf(taskDir),
      /^Agent: claude-haiku-5-5, xhigh · Kind: build · Settled: yes · Check: tests · Route: rules\/routing\.md row 4 · Handle: not started$/m,
    );
    assert.match(
      await readFile(join(taskDir, "record.md"), "utf8"),
      /- D-001 — Build the thing \(build, claude-haiku-5-5 xhigh\)/,
    );
    // The review tier's row is reached with --tier; it asks the user first.
    refused(
      cli(
        [
          "delegate",
          "open",
          "--record",
          "widget/task-001",
          "--title",
          "Review it",
          "--kind",
          "review",
          "--tier",
          "security",
          "--input",
          "-",
        ],
        { input: BRIEF },
      ),
      // With no transcript, the coordinator's model is not known, so the suggestion names it in words.
      /Route: frontier \(the coordinator's model\), high — needs the user's yes \(rules\/routing\.md\)\. Ask the user; on their yes, open it again with --agent "<the coordinator's model>, high"\./,
    );
    // A project's own table is read first.
    await mkdir(join(home, "projects", "widget", "rules"), { recursive: true });
    await writeFile(
      join(home, "projects", "widget", "rules", "routing.md"),
      "| Kind | Settled | Check | Tier | Effort | Ask first |\n| --- | --- | --- | --- | --- | --- |\n| build | yes | tests | claude-sonnet-5 | high | no |\n",
    );
    assert.match(
      ok(open(cli, ["--kind", "build", "--settled", "yes", "--check", "tests"])),
      /\nRoute: claude-sonnet-5, high \(projects\/widget\/rules\/routing\.md: build, settled yes, check tests\)\n/,
    );
    assert.match(
      await briefOf(taskDir, "D-002"),
      /^Agent: claude-sonnet-5, high · Kind: build · Settled: yes · Check: tests · Route: projects\/widget\/rules\/routing\.md row 1 · Handle: not started$/m,
    );
  });
});

test("delegate open refuses an Ask-first row until --agent is given, and the frontier tier is the coordinator's model", async () => {
  await withStore(async ({ folder, taskDir, cli }) => {
    const transcript = join(folder, "session.jsonl");
    await writeFile(
      transcript,
      `${JSON.stringify({ type: "assistant", timestamp: "2026-11-04T10:00:00.000Z", effort: "xhigh", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 10, output_tokens: 1 } } })}\n`,
    );
    const env = { FREEFLOW_TRANSCRIPT: transcript };
    const asked = open(cli, ["--kind", "build", "--settled", "no", "--check", "tests"], { env });
    refused(
      asked,
      /^Error: Route: frontier \(the coordinator's model\), high — needs the user's yes \(rules\/routing\.md\)\. Ask the user; on their yes, open it again with --agent "claude-opus-5-5, high"\.$/m,
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

test("delegate open refuses a malformed table and no match with the reason unless --agent is given, and says where a missing table goes", async () => {
  await withStore(async ({ home, taskDir, cli }) => {
    refused(
      open(cli, ["--kind", "build"]),
      /^Error: delegate open: no row of rules\/routing\.md matches build \(give --settled and --check where the table asks\); give --agent "<model>, <effort>"\.$/m,
    );
    refused(open(cli, ["--kind", "build", "--settled", "maybe"]), /--settled is yes or no/);
    refused(open(cli, ["--kind", "build", "--check", "vibes"]), /--check is scripted, tests, judgement/);
    await writeFile(
      join(home, "rules", "routing.md"),
      `${DEFAULT_TABLE.replace("| build | yes | scripted, tests | cheap | xhigh | no |", "| build | yes | scripted, tests | cheap | xhigh |")}`,
    );
    refused(
      open(cli, ["--kind", "gather"]),
      /^Error: delegate open: rules\/routing\.md line 10: a row has 6 cells, not 5\. Ask the user to mend it \(only the user edits the table\), or give --agent "<model>, <effort>"\.$/m,
    );
    const warned = ok(open(cli, ["--kind", "gather", "--agent", "Haiku, xhigh"]));
    assert.match(
      warned,
      /\nRoute: given \(Haiku, xhigh\)\nWarning: rules\/routing\.md line 10: a row has 6 cells, not 5; the brief's Agent is the one given \(only the user edits the table\)\.\n/,
    );
    await rm(join(home, "rules", "routing.md"));
    refused(
      open(cli, ["--kind", "gather"]),
      new RegExp(
        `^Error: delegate open requires --agent "<model>, <effort>": there is no routing table\\. The table goes in ${join(home, "rules", "routing.md").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}, and only the user writes it\\.$`,
        "m",
      ),
    );
    assert.match(await briefOf(taskDir), /^Agent: Haiku, xhigh · Kind: gather · Route: given · Handle: not started$/m);
  });
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
      /^D-001's return: State done \(build, settled yes, check tests, route rules\/routing\.md row 4\); every heading is there; it names no commit\. Its line now says returned\..* Now read it and the diff, and rerun the tests that decide the result\.\n$/,
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
      /- Kind: build\n- Agent: claude-haiku-5-5, xhigh\n- Settled: yes\n- Check: tests\n- Route: rules\/routing\.md row 4\n- Reason: capability\n/,
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
