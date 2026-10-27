import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/track-work/scripts/working-record.mjs");
const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  TRACK_WORK_TEST_MODE: "1",
};
const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      env: gitEnv,
      encoding: "utf8",
    },
  ).trim();
const run = (cwd, args, input = "") => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, env: gitEnv, encoding: "utf8", input });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

// A repository on branch main with one commit, and a record whose Current Slice names a branch and a commit.
async function workspace({ branchNamed = "main", commit = null, updates = [], sources = [], defines = [] } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "track-work-recover-")));
  git(root, "init", "--quiet", "--initial-branch=main");
  await writeFile(join(root, ".gitignore"), ".freeflow/\n");
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs/spec.md"), "# Spec\n\nOne.\nTwo.\n");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "base");
  const head = git(root, "rev-parse", "HEAD");
  const init = run(
    root,
    ["init", "--root", root, "--name", "Queue", "--input", "-"],
    `### Goal\n- Add a queue.\n\n### What defines this task\n${defines.map((each) => `- ${each}`).join("\n")}\n\n### Next useful action\n- Build it.\n`,
  );
  assert.equal(init.status, 0, init.stderr);
  const record = init.stdout.trim().split("\n")[0];
  const recordPath = resolve(root, record);
  const start = run(
    root,
    [
      "slice",
      "start-direct",
      "--record",
      recordPath,
      "--title",
      "Build the queue",
      "--next-action",
      "Edit.",
      "--input",
      "-",
    ],
    `- Intended result: a queue.\n- Authority source: the user.\n- Scope: src/.\n- Expected evidence: tests.\n- Stop condition: done.\n- Starting state: on ${branchNamed} at ${commit ?? head.slice(0, 8)}.\n`,
  );
  assert.equal(start.status, 0, start.stderr);
  let text = await readFile(recordPath, "utf8");
  if (updates.length)
    text = text.replace(
      "\n### Recovery sources",
      `\n##### Material updates\n\n${updates.map((each) => `- ${each.replace("{HEAD}", head.slice(0, 8))}`).join("\n")}\n\n### Recovery sources`,
    );
  if (sources.length)
    text = text.replace(
      "### Recovery sources\n",
      `### Recovery sources\n\n${sources.map((each) => `- ${each}`).join("\n")}\n`,
    );
  await writeFile(recordPath, text);
  return { root, recordPath, head, taskDir: dirname(recordPath) };
}

test("view recover gives the resume view, each source with its trigger and size, and live Git state", async () => {
  const { root, recordPath } = await workspace({
    defines: ["docs/spec.md — the accepted shape."],
    sources: [
      "sources/notes.md — what the user said; read when changing the message.",
      "docs/missing.md — gone.",
      "https://example.com/doc — background.",
    ],
  });
  try {
    await mkdir(join(dirname(recordPath), "sources"), { recursive: true });
    await writeFile(join(dirname(recordPath), "sources/notes.md"), "a\nb\n");
    const result = run(root, ["view", "recover", "--record", recordPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^# Working Record: Queue/);
    assert.match(result.stdout, /## Recovery\n/);
    assert.match(result.stdout, /docs\/spec\.md: resolves \(5 lines/);
    assert.match(result.stdout, /read when changing the message\n {2}- sources\/notes\.md: resolves \(3 lines/);
    assert.match(result.stdout, /docs\/missing\.md: missing/);
    assert.match(result.stdout, /https:\/\/example\.com\/doc: not checked \(URL\)/);
    assert.match(result.stdout, /- branch main, HEAD [0-9a-f]{12} \(base\)/);
    assert.match(result.stdout, /no mismatch found/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("view recover reports a record naming another branch and a commit HEAD does not have", async () => {
  const { root, recordPath } = await workspace();
  try {
    git(root, "checkout", "--quiet", "-b", "feature");
    git(root, "commit", "--quiet", "--allow-empty", "-m", "on feature");
    const feature = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "--quiet", "-b", "other", "main~0");
    git(root, "checkout", "--quiet", "main");
    git(root, "checkout", "--quiet", "other");
    const text = (await readFile(recordPath, "utf8")).replace(
      /Starting state: on main at [0-9a-f]+/,
      `Starting state: on feature at ${feature.slice(0, 8)}`,
    );
    await writeFile(recordPath, text);
    const result = run(root, ["view", "recover", "--record", recordPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /the record names branch feature; HEAD is on other/);
    assert.match(result.stdout, new RegExp(`names commit ${feature.slice(0, 8)}, which is not in HEAD's history`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validate warns on unresolved pointers, fails on them only with --strict, and lists outside ones", async () => {
  const { root, recordPath, head } = await workspace({
    updates: [
      "Result — identity: {HEAD}; pointer: docs/spec.md",
      "Evidence — claim: fast; result: supported; pointer: scratch/bench.json; 17/9 runs passed",
      "Evidence — claim: compared; pointer: ~/elsewhere/notes.md",
      "Extension — added scope: a new script, src/planned.mjs",
      "Result — merged upstream as 2d3dd0bc",
    ],
  });
  try {
    const warned = run(root, ["validate", "--record", recordPath]);
    assert.equal(warned.status, 0, warned.stderr);
    assert.match(warned.stdout, /^valid\n/);
    assert.match(warned.stdout, /3 pointer\(s\) in Material updates do not resolve here/);
    assert.match(warned.stdout, /scratch\/bench\.json does not exist/);
    assert.match(warned.stdout, /src\/planned\.mjs does not exist/);
    assert.match(warned.stdout, /commit 2d3dd0bc is not in this repository/);
    assert.doesNotMatch(warned.stdout, /17\/9/);
    assert.match(warned.stdout, /outside the repository, not checked:\n- line \d+: ~\/elsewhere\/notes\.md/);

    const strict = run(root, ["validate", "--record", recordPath, "--strict"]);
    assert.equal(strict.status, 1, strict.stdout);
    assert.match(
      strict.stderr,
      /on Evidence or Result lines do not resolve:\n- line \d+: scratch\/bench\.json does not exist\n- line \d+: commit 2d3dd0bc/,
    );
    // A planned path on an Extension line stays a warning, even with --strict.
    assert.match(
      strict.stderr,
      /1 pointer\(s\) in Material updates do not resolve here[^\n]*\n- line \d+: src\/planned\.mjs/,
    );

    await mkdir(join(dirname(recordPath), "scratch"), { recursive: true });
    await writeFile(join(dirname(recordPath), "scratch/bench.json"), "{}\n");
    // The full hash: a bare hash counts as a commit only with both a digit and a letter, which a short prefix of a
    // random hash sometimes lacks (about 2% of 8-character prefixes are all digits).
    const text = (await readFile(recordPath, "utf8")).replace("merged upstream as 2d3dd0bc", `merged as ${head}`);
    await writeFile(recordPath, text);
    const passing = run(root, ["validate", "--record", recordPath, "--strict"]);
    assert.equal(passing.status, 0, passing.stderr);
    assert.match(passing.stdout, /^valid\n.*\n5 evidence pointer\(s\) checked\n1 pointer\(s\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
