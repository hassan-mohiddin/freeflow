import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition, selectDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { checkSelection, enforceReferenceChecks } from "../../../skills/evaluate-behavior/scripts/lib/reference.mjs";
import { runEvaluation } from "../../../skills/evaluate-behavior/scripts/lib/runner.mjs";
import { dockerCalls, installFakeDocker } from "./helpers/fake-docker.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const NODE = process.execPath;

const BUGGY = "export function add(a, b) {\n  return a - b;\n}\n";
const FIXED = "export function add(a, b) {\n  return a + b;\n}\n";
const HIDDEN_TEST = `import test from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/add.mjs";
test("adds two numbers", () => assert.equal(add(2, 3), 5));
test("adds negatives", () => assert.equal(add(-2, -3), -5));
`;
const FIX_PATCH = `diff --git a/src/add.mjs b/src/add.mjs
--- a/src/add.mjs
+++ b/src/add.mjs
@@ -1,3 +1,3 @@
 export function add(a, b) {
-  return a - b;
+  return a + b;
 }
`;

function hiddenTestExpectation(arm) {
  return {
    id: `${arm}-hidden`,
    kind: "command",
    variant: arm,
    argv: [NODE, "--test", "--test-reporter=tap", "test/add.test.mjs"],
    files: { "test/add.test.mjs": "graders/calc/add.test.mjs" },
    timeout_seconds: 60,
    pass: { tests: { format: "node-test", required: ["adds two numbers", "adds negatives"] } },
  };
}

function sourceExpectation(value) {
  return {
    id: "baseline-source",
    kind: "file-text",
    variant: "baseline",
    path: "src/add.mjs",
    expect: "contains",
    value,
  };
}

/** A schema 2 body group whose reference arm is baseline (the default), over the buggy fixture. */
function calcGroup({ expectations, reference_solution }) {
  return {
    schema_version: 2,
    kind: "group",
    id: "calc",
    type: "body",
    input: { prompt: "Fix add in src/add.mjs." },
    fixture: "fixtures/calc",
    tools: ["read", "write", "edit"],
    configuration: {
      host: { name: "pi" },
      model: { model: "fake/model" },
      subject: { kind: "skill", source: { kind: "working-tree" }, skills: [], target: null, context: [] },
    },
    arms: { baseline: {}, candidate: {} },
    component: [],
    expectations,
    review_questions: [],
    reference_solution,
  };
}

async function withRoot(run) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-reference-test-")));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

async function writeTask(root, group, references = {}) {
  await write(path.join(root, "fixtures/calc/src/add.mjs"), BUGGY);
  await write(path.join(root, "graders/calc/add.test.mjs"), HIDDEN_TEST);
  for (const [file, contents] of Object.entries(references)) await write(path.join(root, file), contents);
  return write(path.join(root, "groups/calc.json"), `${JSON.stringify(group, null, 2)}\n`);
}

async function checkOne(root, definitionFile) {
  const definition = await loadDefinition(definitionFile, { root });
  const [result] = await checkSelection(selectDefinition(definition, {}), { root });
  return result;
}

test("a patch reference that fixes the code is solvable", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline"), sourceExpectation("a + b")],
        reference_solution: { patch: "references/fix.patch" },
      }),
      { "references/fix.patch": FIX_PATCH },
    );
    const result = await checkOne(root, file);
    assert.equal(result.state, "solvable", result.reason);
    assert.deepEqual(
      result.arms.map((arm) => arm.arm),
      ["baseline"],
    );
    assert.equal(result.arms[0].checks.length, 2);
    assert.ok(result.arms[0].checks.every((check) => check.state === "pass"));
  });
});

test("a file-text expectation that the reference misses makes the task unsolvable", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline"), sourceExpectation("a * b")],
        reference_solution: { patch: "references/fix.patch" },
      }),
      { "references/fix.patch": FIX_PATCH },
    );
    const result = await checkOne(root, file);
    assert.equal(result.state, "unsolvable");
    assert.match(result.reason, /baseline: baseline-source: failed/);
    assert.doesNotMatch(result.reason, /baseline-hidden/);
  });
});

test("a files reference that leaves the hidden command failing is unsolvable", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { files: "references/wrong" },
      }),
      { "references/wrong/src/add.mjs": BUGGY },
    );
    const result = await checkOne(root, file);
    assert.equal(result.state, "unsolvable");
    assert.match(result.reason, /baseline: baseline-hidden: failed/);
  });
});

test("every arm is graded by default, and one failing arm makes the task unsolvable", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [
          hiddenTestExpectation("baseline"),
          sourceExpectation("a + b"),
          { ...sourceExpectation("a * b"), id: "candidate-source", variant: "candidate" },
        ],
        reference_solution: { patch: "references/fix.patch" },
      }),
      { "references/fix.patch": FIX_PATCH },
    );
    const result = await checkOne(root, file);
    assert.equal(result.state, "unsolvable");
    assert.deepEqual(
      result.arms.map((arm) => [arm.arm, arm.state]),
      [
        ["baseline", "solvable"],
        ["candidate", "unsolvable"],
      ],
    );
    assert.match(result.reason, /candidate: candidate-source: failed/);
  });
});

test("an arm key restricts the check to that arm", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [
          hiddenTestExpectation("baseline"),
          sourceExpectation("a + b"),
          { ...sourceExpectation("a * b"), id: "candidate-source", variant: "candidate" },
        ],
        reference_solution: { patch: "references/fix.patch", arm: "baseline" },
      }),
      { "references/fix.patch": FIX_PATCH },
    );
    const result = await checkOne(root, file);
    assert.equal(result.state, "solvable", result.reason);
    assert.deepEqual(
      result.arms.map((arm) => arm.arm),
      ["baseline"],
    );
  });
});

test("an arm key must name one of the group's arms", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { patch: "references/fix.patch", arm: "ghost" },
      }),
      { "references/fix.patch": FIX_PATCH },
    );
    await assert.rejects(loadDefinition(file, { root }), { message: /arm must name one of group.arms/ });
  });
});

test("a files reference that overlays the fixed code is solvable", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline"), sourceExpectation("a + b")],
        reference_solution: { files: "references/solution" },
      }),
      { "references/solution/src/add.mjs": FIXED },
    );
    const result = await checkOne(root, file);
    assert.equal(result.state, "solvable", result.reason);
  });
});

test("a group with no reference, or only interaction expectations, is not checkable", async () => {
  await withRoot(async (root) => {
    const plain = await writeTask(root, calcGroup({ expectations: [hiddenTestExpectation("baseline")] }));
    assert.equal((await checkOne(root, plain)).state, "not-checkable");
    const interaction = await writeTask(
      root,
      calcGroup({
        expectations: [
          { id: "baseline-said", kind: "response-text", variant: "baseline", expect: "contains", value: "done" },
        ],
        reference_solution: { patch: "references/fix.patch" },
      }),
      { "references/fix.patch": FIX_PATCH },
    );
    const result = await checkOne(root, interaction);
    assert.equal(result.state, "not-checkable");
    assert.match(result.reason, /no workspace or command expectation/);
  });
});

test("a reference inside the fixture, or outside the definition root, is refused at load time", async () => {
  await withRoot(async (root) => {
    await write(path.join(root, "fixtures/calc/answer.patch"), FIX_PATCH);
    const inside = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { patch: "fixtures/calc/answer.patch" },
      }),
    );
    await assert.rejects(loadDefinition(inside, { root }), { message: /inside the fixture/ });
    const outside = await write(
      path.join(root, "groups/outside.json"),
      JSON.stringify(
        calcGroup({
          expectations: [hiddenTestExpectation("baseline")],
          reference_solution: { files: "../elsewhere" },
        }),
      ),
    );
    await assert.rejects(loadDefinition(outside, { root }), { message: /stay inside the definition root/ });
  });
});

test("a run refuses an unsolvable task before any subject starts", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { files: "references/wrong" },
      }),
      { "references/wrong/src/add.mjs": BUGGY },
    );
    await assert.rejects(runEvaluation(file, {}, { root, dryRun: true }), {
      message: /does not solve the task.*--skip-reference-check/,
    });
    const [resultId] = await readdir(path.join(root, ".skill-eval/runs"));
    const resultDirectory = path.join(root, ".skill-eval/runs", resultId);
    const check = JSON.parse(await readFile(path.join(resultDirectory, "groups/calc/reference-check.json"), "utf8"));
    assert.equal(check.state, "unsolvable");
    assert.equal(await exists(path.join(resultDirectory, "groups/calc/baseline")), false);
  });
});

test("with --skip-reference-check the failure is recorded and the run is not refused", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { files: "references/wrong" },
      }),
      { "references/wrong/src/add.mjs": BUGGY },
    );
    const definition = await loadDefinition(file, { root });
    const selection = selectDefinition(definition, {});
    const resultDirectory = path.join(root, ".skill-eval/runs/skip-check");
    await enforceReferenceChecks(selection, { root, resultDirectory, skip: true });
    const check = JSON.parse(await readFile(path.join(resultDirectory, "groups/calc/reference-check.json"), "utf8"));
    assert.equal(check.state, "unsolvable");
    assert.equal(check.skipped, true);
  });
});

test("check-tasks reports each group and starts no subject or result", async () => {
  await withRoot(async (root) => {
    await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { files: "references/wrong" },
      }),
      { "references/wrong/src/add.mjs": BUGGY },
    );
    const run = spawnSync(process.execPath, [entrypoint, "check-tasks", "groups/calc.json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /^calc: unsolvable \(baseline: baseline-hidden: failed\)/m);
    assert.match(run.stdout, /^ {2}baseline: unsolvable/m);
    assert.equal(await exists(path.join(root, ".skill-eval")), false);
  });
});

async function exists(file) {
  return (await stat(file).catch(() => null)) !== null;
}

test("check-tasks lists what the task's copy lacks: Git history, ignored files, tools and network", async () => {
  await withRoot(async (root) => {
    const group = calcGroup({ expectations: [sourceExpectation("a + b")], reference_solution: undefined });
    group.input.prompt = "Fix add in src/add.mjs, read the keys in .env, run the tests after npm install, then commit.";
    group.arms.sealed = {
      environment: {
        kind: "container",
        image: `example.org/task@sha256:${"a".repeat(64)}`,
        workdir: "/testbed",
        network: "none",
      },
    };
    group.component = ["environment"];
    group.tools = ["read", "write", "edit"];
    const definition = await writeTask(root, group);
    // In this repository Git ignores .env and build/; the fixture holds a built file a clone would not have.
    await write(path.join(root, ".gitignore"), ".env\nbuild/\n");
    await write(path.join(root, "fixtures/calc/build/add.js"), "built\n");
    spawnSync("git", ["init", "-q"], { cwd: root });

    const result = await checkOne(root, definition);

    assert.deepEqual(result.copy.gaps, [
      "git history: the workspace is not a Git repository, and the task mentions commit",
      "ignored files: the fixture holds build/add.js, which Git ignores, so a clone of the repository lacks them",
      "ignored files the task names: .env; Git ignores them here, and the copy lacks them",
      ...["baseline", "candidate", "sealed"].flatMap((arm) => [
        `tools: arm ${arm} has no bash or run_command, and the task asks to run something`,
        `network: arm ${arm} has none, and the task refers to it (npm install)`,
      ]),
    ]);
    assert.deepEqual(result.copy.network, { baseline: "none", candidate: "none", sealed: "none" });
    const printed = spawnSync(process.execPath, [entrypoint, "check-tasks", "groups/calc.json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.match(printed.stdout, /^ {2}copy lacks: ignored files the task names: \.env;/m);
    assert.match(printed.stdout, /^ {2}baseline tools: read, write, edit; network: none$/m);
  });
});

const HALF_FIXED = "export function add(a, b) {\n  return Math.abs(a) + Math.abs(b);\n}\n";

test("a task whose graders already pass on the unchanged fixture is already solved, and a run refuses it", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { files: "references/fixed" },
      }),
      { "references/fixed/src/add.mjs": FIXED },
    );
    await write(path.join(root, "fixtures/calc/src/add.mjs"), FIXED);

    const result = await checkOne(root, file);
    assert.equal(result.state, "already-solved");
    assert.equal(result.reason, "baseline: every check already passes on the unchanged fixture");
    assert.deepEqual(result.arms[0].before, {
      state: "already-solved",
      checks: [{ id: "baseline-hidden", state: "pass" }],
      tests: { "baseline-hidden": { failToPass: [], passToPass: ["adds two numbers", "adds negatives"] } },
    });

    await assert.rejects(runEvaluation(file, {}, { root, dryRun: true }), {
      message: /task calc is already solved before any change.*--skip-reference-check/,
    });
    const [resultId] = await readdir(path.join(root, ".skill-eval/runs"));
    const recorded = JSON.parse(
      await readFile(path.join(root, ".skill-eval/runs", resultId, "groups/calc/reference-check.json"), "utf8"),
    );
    assert.equal(recorded.state, "already-solved");
    assert.equal(recorded.skipped, false);

    const tasks = spawnSync(process.execPath, [entrypoint, "check-tasks", "groups/calc.json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(tasks.status, 1, tasks.stderr);
    assert.match(tasks.stdout, /^calc: already-solved/m);
  });
});

test("required tests that fail before and pass after are fail-to-pass; ones passing both times are pass-to-pass", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(
      root,
      calcGroup({
        expectations: [hiddenTestExpectation("baseline")],
        reference_solution: { files: "references/fixed" },
      }),
      { "references/fixed/src/add.mjs": FIXED },
    );
    await write(path.join(root, "fixtures/calc/src/add.mjs"), HALF_FIXED);

    const result = await checkOne(root, file);
    assert.equal(result.state, "solvable", result.reason);
    assert.deepEqual(result.arms[0].before, {
      state: "fails-before",
      checks: [{ id: "baseline-hidden", state: "fail" }],
      tests: { "baseline-hidden": { failToPass: ["adds negatives"], passToPass: ["adds two numbers"] } },
    });

    const definition = await loadDefinition(file, { root });
    const resultDirectory = path.join(root, ".skill-eval/runs/recorded");
    await enforceReferenceChecks(selectDefinition(definition, {}), { root, resultDirectory });
    const recorded = JSON.parse(await readFile(path.join(resultDirectory, "groups/calc/reference-check.json"), "utf8"));
    assert.deepEqual(recorded.arms[0].before.tests, result.arms[0].before.tests);
    assert.equal(recorded.arms[0].state, "solvable");
  });
});

const IMAGE = `example.org/calc@sha256:${"c".repeat(64)}`;

function containerCalcGroup() {
  const group = calcGroup({
    expectations: [hiddenTestExpectation("baseline")],
    reference_solution: { patch: "references/fix.patch" },
  });
  group.configuration.environment = { kind: "container", image: IMAGE, workdir: "/testbed", network: "none" };
  return group;
}

async function withPath(prefix, run) {
  const saved = process.env.PATH;
  const savedHost = process.env.DOCKER_HOST;
  process.env.PATH = `${prefix}${path.delimiter}${saved ?? ""}`;
  delete process.env.DOCKER_HOST;
  try {
    return await run();
  } finally {
    process.env.PATH = saved;
    if (savedHost !== undefined) process.env.DOCKER_HOST = savedHost;
  }
}

test("a container group's command graders are checked in its image", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(root, containerCalcGroup(), { "references/fix.patch": FIX_PATCH });
    const docker = await installFakeDocker(root);

    const result = await withPath(docker.bin, () => checkOne(root, file));

    assert.equal(result.state, "solvable", result.reason);
    assert.equal(result.arms[0].before.state, "fails-before");
    const all = (await dockerCalls(docker.log)).filter((args) => args[0] === "run");
    // One read-only run checks that the engine shares the folder the graded copies live under; two run graders.
    const probes = all.filter((args) => args.includes("--entrypoint"));
    assert.equal(probes.length, 1);
    assert.ok(probes[0].some((arg) => arg.endsWith(":/testbed:ro")));
    const runs = all.filter((args) => !args.includes("--entrypoint"));
    assert.equal(runs.length, 2);
    for (const args of runs) {
      assert.ok(args.includes(IMAGE));
      assert.equal(args[args.indexOf("--network") + 1], "none");
      assert.match(args[args.indexOf("--volume") + 1], /\/commands\/baseline-hidden\/workspace:\/testbed$/);
      assert.deepEqual(args.slice(args.indexOf(IMAGE) + 1), [
        NODE,
        "--test",
        "--test-reporter=tap",
        "test/add.test.mjs",
      ]);
    }
  });
});

test("a container group is not checkable when its image is missing, with the structured refusal", async () => {
  await withRoot(async (root) => {
    const file = await writeTask(root, containerCalcGroup(), { "references/fix.patch": FIX_PATCH });
    const docker = await installFakeDocker(root, { imageMissing: true });

    const result = await withPath(docker.bin, () => checkOne(root, file));

    assert.equal(result.state, "not-checkable");
    assert.match(result.reason, /arm baseline runs in the container image example\.org\/calc@sha256:c+/);
    assert.match(result.reason, /Install: docker pull example\.org\/calc@sha256:c+/);
    assert.equal(result.missing[0].install, `docker pull ${IMAGE}`);
    const verbs = (await dockerCalls(docker.log)).map((args) => args[0]);
    assert.deepEqual(verbs, ["version", "image", "manifest"]);
  });
});
