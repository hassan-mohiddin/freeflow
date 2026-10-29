import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/write-docs/scripts/docs-check.mjs");

// Isolate Git from the machine's configuration so a global hook, signing or colour setting cannot change a result.
const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
};
const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd, env: gitEnv, encoding: "utf8" },
  ).trim();

async function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

const doc = (title, covers, commit) =>
  `# ${title}\n\n> **Covers:** ${covers.map((path) => `\`${path}\``).join(", ")}\n> **Verified at:** \`${commit}\` (2026-10-19)\n\nBody.\n`;

// A repository with code, then docs verified against it, then one covered change made without its doc:
//   dev-docs/README.md          no header
//   dev-docs/subsystems/a.md    covers src/a.js           current
//   dev-docs/subsystems/lib.md  covers the src/lib/ folder stale (src/lib/b.js changed after it)
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "docs-check-"));
  git(root, "init", "--quiet", "--initial-branch=main");
  await write(root, { "src/a.js": "export const a = 1;\n", "src/lib/b.js": "export const b = 1;\n", "other.js": "\n" });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "code");
  const base = git(root, "rev-parse", "--short", "HEAD");
  await write(root, {
    "dev-docs/README.md": "# Docs\n\nThe index, with no header.\n",
    "dev-docs/subsystems/a.md": doc("A", ["src/a.js"], base),
    "dev-docs/subsystems/lib.md": doc("Lib", ["src/lib/"], base),
  });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "docs");
  await write(root, { "src/lib/b.js": "export const b = 2;\n" });
  git(root, "commit", "--quiet", "-am", "change lib without its doc");
  return { root, base };
}

function covering(cwd, ...args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args, "--json"], { cwd, env: gitEnv, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const docsFor = (report, path) => report.paths.find((entry) => entry.path === path).documents;

test("--covering finds the doc that covers a file, and reports it current", async (t) => {
  const { root, base } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = covering(root, "--covering", "src/a.js");
  assert.deepEqual(docsFor(report, "src/a.js"), [
    { path: "dev-docs/subsystems/a.md", verifiedAt: base, state: "current", changed: [] },
  ]);
});

test("--covering finds the doc that covers a folder holding the file, and reports it stale", async (t) => {
  const { root } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  const [found] = docsFor(covering(root, "--covering", "src/lib/b.js"), "src/lib/b.js");
  assert.equal(found.path, "dev-docs/subsystems/lib.md");
  assert.equal(found.state, "stale");
  assert.deepEqual(found.changed, ["src/lib/b.js"]);
});

test("--covering reports a path nothing covers, and counts docs with no Covers line", async (t) => {
  const { root } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  const report = covering(root, "--covering", "other.js", "--covering", "src/a.js");
  assert.deepEqual(docsFor(report, "other.js"), []);
  assert.equal(docsFor(report, "src/a.js").length, 1);
  assert.equal(report.documents, 3);
  assert.deepEqual(report.withoutCovers, ["dev-docs/README.md"]);
});

test("--covering searches the docs index by default and the given docs otherwise", async (t) => {
  const { root } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(covering(root, "--covering", "src/a.js").searched, ["dev-docs"]);
  const narrowed = covering(root, join(root, "dev-docs/subsystems/lib.md"), "--covering", "src/a.js", "--root", root);
  assert.deepEqual(narrowed.searched, ["dev-docs/subsystems/lib.md"]);
  assert.deepEqual(docsFor(narrowed, "src/a.js"), []);
});

test("--covering prints one line per covering doc as text", async (t) => {
  const { root, base } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [scriptPath, "--covering", "src/lib/b.js", "--covering", "other.js"], {
    cwd: root,
    env: gitEnv,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      "src/lib/b.js",
      `  dev-docs/subsystems/lib.md (verified at ${base}: stale, 1 covered file(s) changed since)`,
      "other.js",
      "  no covering document",
      "3 documents searched; 1 have no Covers line, so no lookup can find them.",
      "",
    ].join("\n"),
  );
});

test("--covering exits 2 when the project has no docs index and none are given", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "docs-check-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, "init", "--quiet", "--initial-branch=main");
  const result = spawnSync(process.execPath, [scriptPath, "--covering", "src/a.js"], {
    cwd: root,
    env: gitEnv,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no developer docs found/);
});

test("--driven counts a covered change committed together with its doc, which the default treats as reviewed", async (t) => {
  const { root } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  // The doc's Verified at stays at the first commit; the code and the doc's text change together.
  const base = git(root, "rev-parse", "--short", "HEAD~2");
  await write(root, {
    "src/a.js": "export const a = 2;\n",
    "dev-docs/subsystems/a.md": `${doc("A", ["src/a.js"], base)}Edited with the code.\n`,
  });
  git(root, "commit", "--quiet", "-am", "change a with its doc");
  const run = (...args) =>
    spawnSync(process.execPath, [scriptPath, "dev-docs/subsystems/a.md", "--strict", ...args], {
      cwd: root,
      env: gitEnv,
      encoding: "utf8",
    });
  assert.equal(run().status, 0);
  const driven = run("--driven");
  assert.equal(driven.status, 1);
  assert.match(driven.stdout, /covered code changed since [0-9a-f]+:\n {4}src\/a\.js/);
});

test("--stamp moves a stale doc's Verified at to HEAD, so the doc and the code go in one commit", async (t) => {
  const { root } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = (...args) =>
    spawnSync(process.execPath, [scriptPath, "dev-docs", ...args], { cwd: root, env: gitEnv, encoding: "utf8" });
  // lib.md is stale from the committed change; a.md is current and an uncommitted change to it makes it stale too.
  await write(root, { "src/a.js": "export const a = 3;\n" });
  assert.equal(run("--strict").status, 1);
  const stamped = run("--stamp");
  assert.equal(stamped.status, 0, stamped.stdout + stamped.stderr);
  const head = git(root, "rev-parse", "--short", "HEAD");
  assert.match(stamped.stdout, new RegExp(`stamped dev-docs/subsystems/a\\.md at ${head}`));
  assert.match(stamped.stdout, new RegExp(`stamped dev-docs/subsystems/lib\\.md at ${head}`));
  // One commit with the code and the restamped docs leaves nothing stale.
  git(root, "commit", "--quiet", "-am", "change a, with its doc restamped");
  assert.equal(run("--strict").status, 0, run("--strict").stdout);
  // A current doc is left as it was.
  const again = run("--stamp");
  assert.doesNotMatch(again.stdout, /stamped/);
});

test("--stamp leaves a feature file alone, since its Verified at is the commit it was driven at", async (t) => {
  const { root, base } = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  await write(root, { "dev-docs/features/f.md": doc("F", ["src/lib/"], base) });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "feature file");
  await write(root, { "src/lib/b.js": "export const b = 3;\n" });
  const stamped = spawnSync(process.execPath, [scriptPath, "dev-docs", "--stamp"], {
    cwd: root,
    env: gitEnv,
    encoding: "utf8",
  });
  assert.match(
    stamped.stdout,
    /not stamped: dev-docs\/features\/f\.md \(a feature file: drive it, then move its Verified at\)/,
  );
});
