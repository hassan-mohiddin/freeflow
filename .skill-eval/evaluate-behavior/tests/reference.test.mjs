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
    assert.equal(result.checks.length, 2);
    assert.ok(result.checks.every((check) => check.state === "pass"));
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
    assert.match(result.reason, /baseline-source: failed/);
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
    assert.match(result.reason, /baseline-hidden: failed/);
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
    assert.match(run.stdout, /^calc: unsolvable \(baseline-hidden: failed\)/m);
    assert.equal(await exists(path.join(root, ".skill-eval")), false);
  });
});

async function exists(file) {
  return (await stat(file).catch(() => null)) !== null;
}
