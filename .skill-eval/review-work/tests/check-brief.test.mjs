import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("skills/review-work/scripts/check-brief.mjs");

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

// A repository with a base and a head commit, a Working Record, a dev doc, review rules, evidence and a reviews folder.
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "check-brief-"));
  git(root, "init", "--quiet", "--initial-branch=main");
  await write(root, {
    "skills/review-work/SKILL.md": "# Review Work\n",
    "dev-docs/README.md": "# Docs\n\n## Review Rules\n",
    "dev-docs/subsystems/app.md": "# App\n",
    "src/app.js": "export const a = 1;\n",
  });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "base");
  const base = git(root, "rev-parse", "HEAD");
  await write(root, { "src/app.js": "export const a = 2;\n" });
  git(root, "commit", "--quiet", "-am", "head");
  const head = git(root, "rev-parse", "HEAD");
  await write(root, {
    ".freeflow/tasks/task-001/record.md": "# Record\n",
    ".freeflow/tasks/task-001/scratch/evidence/checks.txt": "ok\n",
    ".freeflow/tasks/task-001/scratch/reviews/R1-report.md": "Judgment: Blocking\n",
    ".freeflow/tasks/task-001/scratch/reviews/R1-adjudication.md": "Accepted: 1\n",
  });
  return { root, base, head };
}

const brief = ({ base, head }, overrides = {}) => {
  const fields = {
    Review: "1",
    Boundary: "ready for the user's PR review",
    "Reviewed state": `\`${head}\``,
    Method: "`skills/review-work/SKILL.md` and its references/work.md",
    Agreement: "`.freeflow/tasks/task-001/record.md` (view resume)",
    Docs: "`dev-docs/subsystems/app.md`",
    "Review rules": "`dev-docs/README.md#review-rules`",
    Diff: `${base}..${head}`,
    Evidence: "`.freeflow/tasks/task-001/scratch/evidence/` (check it, don't trust it)",
    "May run": "npm test, npm run typecheck",
    Report: "`.freeflow/tasks/task-001/scratch/reviews/R1-report.md`",
    ...overrides,
  };
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
};

async function check(root, text, ...args) {
  await write(root, { "brief.md": `${text}\n` });
  const result = spawnSync(process.execPath, [scriptPath, "brief.md", "--json", ...args], {
    cwd: root,
    env: gitEnv,
    encoding: "utf8",
  });
  return { status: result.status, report: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

const lines = (report) => report.problems.map((each) => each.line);

test("accepts a complete brief whose paths and commits exist", async () => {
  const repo = await repository();
  const { status, report } = await check(repo.root, brief(repo));
  assert.equal(status, 0, JSON.stringify(report?.problems));
  assert.equal(report.ok, true);
});

test("refuses a brief missing a required line and names every missing one", async () => {
  const repo = await repository();
  const { status, report } = await check(repo.root, brief(repo, { Agreement: undefined, "Review rules": undefined }));
  assert.equal(status, 1);
  assert.deepEqual(lines(report).sort(), ["Agreement", "Review rules"]);
});

test("refuses a path that does not exist, and ignores a #anchor on one that does", async () => {
  const repo = await repository();
  const { status, report } = await check(repo.root, brief(repo, { Docs: "`dev-docs/subsystems/missing.md`" }));
  assert.equal(status, 1);
  assert.deepEqual(lines(report), ["Docs"]);
  assert.match(report.problems[0].problem, /missing\.md/);
});

test("accepts none for docs, review rules and evidence, but not for the agreement or method", async () => {
  const repo = await repository();
  const accepted = await check(repo.root, brief(repo, { Docs: "none", "Review rules": "none", Evidence: "none" }));
  assert.equal(accepted.status, 0, JSON.stringify(accepted.report?.problems));
  const refused = await check(repo.root, brief(repo, { Agreement: "none", Method: "none" }));
  assert.equal(refused.status, 1);
  assert.deepEqual(lines(refused.report).sort(), ["Agreement", "Method"]);
});

test("refuses pasted text where a pointer belongs", async () => {
  const repo = await repository();
  const { status, report } = await check(
    repo.root,
    brief(repo, { Agreement: "The user wants the counter to start at 2 and never reset." }),
  );
  assert.equal(status, 1);
  assert.match(report.problems[0].problem, /backticks/);
});

test("refuses a reviewed state or diff that names no commit", async () => {
  const repo = await repository();
  const { status, report } = await check(
    repo.root,
    brief(repo, { "Reviewed state": "`deadbeef`", Diff: `${repo.base}..nosuchbranch` }),
  );
  assert.equal(status, 1);
  assert.deepEqual(lines(report).sort(), ["Diff", "Reviewed state"]);
});

test("refuses a diff that is not a range", async () => {
  const repo = await repository();
  const { status, report } = await check(repo.root, brief(repo, { Diff: repo.head }));
  assert.equal(status, 1);
  assert.match(report.problems[0].problem, /<base>\.\.<head>/);
});

test("requires the previous report for Review 2 and 3, and only accepts rounds 1 to 3", async () => {
  const repo = await repository();
  const second = await check(repo.root, brief(repo, { Review: "2" }));
  assert.equal(second.status, 1);
  assert.deepEqual(lines(second.report), ["Previous report"]);
  const withPrevious = await check(
    repo.root,
    brief(repo, {
      Review: "2",
      "Previous report":
        "`.freeflow/tasks/task-001/scratch/reviews/R1-report.md` and `.freeflow/tasks/task-001/scratch/reviews/R1-adjudication.md`",
    }),
  );
  assert.equal(withPrevious.status, 0, JSON.stringify(withPrevious.report?.problems));
  const fourth = await check(repo.root, brief(repo, { Review: "4" }));
  assert.equal(fourth.status, 1);
  assert.deepEqual(lines(fourth.report), ["Review"]);
});

test("refuses a report path in a folder that does not exist", async () => {
  const repo = await repository();
  const { status, report } = await check(repo.root, brief(repo, { Report: "`scratch/nowhere/R1-report.md`" }));
  assert.equal(status, 1);
  assert.deepEqual(lines(report), ["Report"]);
});

test("reads list items and bold labels, and resolves paths against --root", async () => {
  const repo = await repository();
  const text = brief(repo)
    .split("\n")
    .map((line) => `- **${line.replace(": ", ":** ")}`)
    .join("\n");
  const elsewhere = await mkdtemp(join(tmpdir(), "check-brief-cwd-"));
  await writeFile(join(elsewhere, "brief.md"), `${text}\n`);
  const result = spawnSync(process.execPath, [scriptPath, "brief.md", "--root", repo.root, "--json"], {
    cwd: elsewhere,
    env: gitEnv,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout);
});

test("exits 2 on a usage error", async () => {
  const repo = await repository();
  const result = spawnSync(process.execPath, [scriptPath], { cwd: repo.root, env: gitEnv, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage/);
});
