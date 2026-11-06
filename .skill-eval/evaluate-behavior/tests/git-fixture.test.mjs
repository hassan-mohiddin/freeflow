// A fixture taken from a commit of the definition root's repository, and a reference solution at another commit
// (SPEC-011 4.4): what the top-line suite's tasks are made of. No model and no subject runs.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { prepareGitFixture, validateGitFixture } from "../../../skills/evaluate-behavior/scripts/lib/git-fixture.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const fail = (message) => {
  throw new Error(message);
};

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
  return file;
}

/**
 * A repository with three commits: the bug, the fix with its new test (the pull request's head), and a commit that
 * adds the suite's own files. Returns the commits.
 */
async function withRepository(run) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-git-fixture-")));
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    }).trim();
  try {
    git("init", "-q");
    await write(path.join(root, "src/add.mjs"), "export const add = (a, b) => a - b;\n");
    await write(path.join(root, "big/huge.txt"), "left out of the workspace\n");
    await write(
      path.join(root, "test/add.test.mjs"),
      'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/add.mjs";\ntest("adds", () => assert.ok(true));\n',
    );
    git("add", "-A");
    git("commit", "-qm", "bug");
    const start = git("rev-parse", "HEAD");
    await write(path.join(root, "src/add.mjs"), "export const add = (a, b) => a + b;\n");
    await write(
      path.join(root, "test/add.test.mjs"),
      'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { add } from "../src/add.mjs";\ntest("adds", () => assert.equal(add(2, 3), 5));\n',
    );
    git("add", "-A");
    git("commit", "-qm", "fix");
    const head = git("rev-parse", "HEAD");
    await run({ root, git, start, head });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function group({ start, reference, grader = "graders/add.test.mjs" }) {
  return {
    schema_version: 2,
    kind: "group",
    id: "add",
    type: "body",
    input: { prompt: "add subtracts. Fix it." },
    fixture: { git: start, exclude: ["big", "graders", "groups"] },
    tools: ["read", "write", "edit"],
    configuration: { host: { name: "pi" }, model: { model: "fake/model" }, subject: { kind: "none" } },
    arms: { plain: {}, freeflow: {} },
    reference: "plain",
    component: [],
    expectations: ["plain", "freeflow"].map((arm) => ({
      id: `${arm}-hidden`,
      kind: "command",
      variant: arm,
      comparison: "hidden-tests",
      argv: [process.execPath, "--test", "test/add.test.mjs"],
      files: { "test/add.test.mjs": grader },
      timeout_seconds: 60,
      pass: { exit_code: 0 },
    })),
    review_questions: [],
    reference_solution: { git: reference },
  };
}

test("a commit fixture is a full commit and relative exclusions, and a commit reference needs one", () => {
  const commit = "a".repeat(40);
  assert.deepEqual(validateGitFixture({ git: commit }, fail), { git: commit, exclude: [] });
  for (const [value, message] of [
    [{ git: "HEAD" }, /full 40-character commit/],
    [{ git: commit.slice(0, 12) }, /full 40-character commit/],
    [{ git: commit, exclude: ["/etc"] }, /relative paths/],
    [{ git: commit, exclude: ["../up"] }, /relative paths/],
    [{ git: commit, extra: 1 }, /unsupported field extra/],
  ])
    assert.throws(() => validateGitFixture(value, fail), message);
});

test("check-tasks writes each commit's tree, less the exclusions, and runs the held-back test on both", async () => {
  await withRepository(async ({ root, git, start, head }) => {
    // The held-back test is the head's, kept outside the fixture as a grader file.
    await write(path.join(root, "graders/add.test.mjs"), git("show", `${head}:test/add.test.mjs`));
    await write(path.join(root, "groups/add.json"), JSON.stringify(group({ start, reference: head })));
    const loaded = await loadDefinition(path.join(root, "groups/add.json"), { root });
    assert.deepEqual(loaded.fixture, { git: start, exclude: ["big", "graders", "groups"] });

    const solvable = spawnSync(process.execPath, [entrypoint, "check-tasks", "groups/add.json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(solvable.status, 0, solvable.stdout + solvable.stderr);
    assert.match(solvable.stdout, /^add \(groups\/add\.json\): solvable/m);

    // A reference commit that does not fix it is unsolvable: the check is wrong, or the task is.
    await write(path.join(root, "groups/add.json"), JSON.stringify(group({ start, reference: start })));
    const unsolvable = spawnSync(process.execPath, [entrypoint, "check-tasks", "groups/add.json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(unsolvable.status, 1);
    assert.match(unsolvable.stdout, /^add \(groups\/add\.json\): unsolvable/m);

    // A commit reference with a folder fixture is refused when the group loads.
    const folder = { ...group({ start, reference: head }), fixture: "src" };
    await write(path.join(root, "groups/folder.json"), JSON.stringify(folder));
    await assert.rejects(loadDefinition(path.join(root, "groups/folder.json"), { root }), /git needs a commit fixture/);
  });
});

test("the runner's snapshot of a commit fixture holds the commit's tree less the exclusions, and nothing later", async () => {
  await withRepository(async ({ root, start }) => {
    const groupDirectory = path.join(root, "out");
    const fixture = await prepareGitFixture({ fixture: { git: start, exclude: ["big"] }, root, groupDirectory });
    assert.equal(fixture.declaredPath, `git:${start}`);
    assert.deepEqual(fixture.git, { commit: start, exclude: ["big"] });
    assert.equal(
      await readFile(path.join(fixture.snapshotPath, "src/add.mjs"), "utf8"),
      "export const add = (a, b) => a - b;\n",
    );
    assert.equal(existsSync(path.join(fixture.snapshotPath, "big")), false);
    assert.equal(existsSync(path.join(fixture.snapshotPath, ".git")), false);
    assert.deepEqual(fixture.files.map((entry) => entry.path).sort(), [
      "src",
      "src/add.mjs",
      "test",
      "test/add.test.mjs",
    ]);
    await assert.rejects(
      prepareGitFixture({
        fixture: { git: "f".repeat(40), exclude: [] },
        root,
        groupDirectory: path.join(root, "out2"),
      }),
      /could not be written/,
    );
  });
});
