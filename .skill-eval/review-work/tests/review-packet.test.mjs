import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const script = resolve("skills/review-work/scripts/review-packet.mjs");
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      env: gitEnv,
      encoding: "utf8",
    },
  ).trim();
const write = async (root, files) => {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
};
const run = (cwd, args, using = script) => {
  const result = spawnSync(process.execPath, [using, ...args], { cwd, env: gitEnv, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

async function project(extra = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "review-packet-")));
  git(root, "init", "--quiet", "--initial-branch=main");
  await write(root, {
    ".gitignore": ".freeflow/\n",
    "package.json": JSON.stringify({ name: "demo", scripts: { test: "node --test", lint: "eslint ." } }),
    "src/auth/session.js": "export const ttl = 60;\n",
    "dev-docs/README.md": "# Docs\n",
    "dev-docs/auth.md": "# Auth\n\n> **Covers:** `src/auth/`\n> **Verified at:** `HEAD`\n",
    "REVIEW.md": "# Review Rules\n",
    ".freeflow/tasks/task-001-ttl/record.md": "# Working Record: TTL\n",
    ...Object.fromEntries(Object.entries(extra).filter(([, text]) => text !== null)),
  });
  for (const [path, text] of Object.entries(extra)) if (text === null) await rm(join(root, path));
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "base");
  const base = git(root, "rev-parse", "HEAD");
  await write(root, { "src/auth/session.js": "export const ttl = 30;\n", ".github/workflows/ci.yml": "on: push\n" });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "shorter ttl");
  return { root, base, task: join(root, ".freeflow/tasks/task-001-ttl") };
}

test("review-packet prefills the brief, names the gate triggers and budget, and check-brief accepts it", async () => {
  const { root, base, task } = await project();
  try {
    const result = run(root, [
      "--review",
      "1",
      "--base",
      base,
      "--task",
      task,
      "--boundary",
      "merge to main",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.checkBrief.ok, true);
    assert.deepEqual(
      packet.gateTriggers.map((each) => each.trigger),
      ["security, authentication, authorization or secrets", "CI or release files"],
    );
    assert.match(packet.budget, /^Review 1 of at most 3/);
    const brief = await readFile(join(task, "scratch/reviews/R1-brief.md"), "utf8");
    assert.match(brief, /^Review: 1\nBoundary: merge to main\nReviewed state: [0-9a-f]{12}\n/);
    assert.match(brief, /\nAgreement: `\.freeflow\/tasks\/task-001-ttl\/record\.md`\n/);
    assert.match(brief, /\nDocs: `dev-docs\/auth\.md`\n/);
    assert.match(brief, /\nReview rules: `REVIEW\.md`\n/);
    assert.match(brief, new RegExp(`\\nDiff: ${base.slice(0, 12)}\\.\\.[0-9a-f]{12}\\n`));
    assert.match(
      brief,
      /\nMay run: the project's declared checks: `npm test`, `npm run lint`; and probes of the changed code on copies in your own scratch folder, with no edits to the repository\n/,
    );
    assert.match(brief, /\nReport: `\.freeflow\/tasks\/task-001-ttl\/scratch\/reviews\/R1-report\.md`\n$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review-packet leaves the Boundary empty so check-brief refuses, and Review 2 starts at the last reviewed state", async () => {
  const { root, base, task } = await project();
  try {
    const first = run(root, ["--review", "1", "--base", base, "--task", task]);
    assert.equal(first.status, 1);
    assert.match(first.stdout, /check-brief: refused[\s\S]*- Boundary: is empty/);

    const reviewed = git(root, "rev-parse", "HEAD");
    await write(root, { "src/auth/session.js": "export const ttl = 45;\n" });
    git(root, "commit", "--quiet", "-am", "fix");
    const noReport = run(root, ["--review", "2", "--base", base, "--task", task, "--boundary", "merge", "--json"]);
    assert.equal(noReport.status, 1);
    assert.match(JSON.parse(noReport.stdout).notes.join("\n"), /no previous report/);

    await write(task, { "scratch/reviews/R1-report.md": "Judgment: Blocking\n" });
    const second = run(root, ["--review", "2", "--base", base, "--task", task, "--boundary", "merge", "--json"]);
    assert.equal(second.status, 0, second.stdout);
    const brief = await readFile(join(task, "scratch/reviews/R2-brief.md"), "utf8");
    assert.match(brief, new RegExp(`\\nDiff: ${reviewed.slice(0, 12)}\\.\\.`));
    assert.match(brief, /\nPrevious report: `[^`]*R1-report\.md`\n/);
    assert.match(JSON.parse(second.stdout).budget, /^Review 2 of at most 3/);
    assert.deepEqual(JSON.parse(second.stdout).correctionDiff, {
      from: reviewed.slice(0, 12),
      files: 1,
      insertions: 1,
      deletions: 1,
    });
    const printed = run(root, ["--review", "2", "--base", base, "--task", task, "--boundary", "merge"]);
    assert.match(
      printed.stdout,
      /Correction diff since Review 1's reviewed state [0-9a-f]{12}: 1 files, \+1 -1 lines\./,
    );
    assert.equal(run(root, ["--review", "4", "--base", base, "--task", task]).status, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review-packet run from outside the repository writes repository-relative Docs and Review rules paths that check-brief accepts", async () => {
  const { root, base, task } = await project();
  const elsewhere = await realpath(await mkdtemp(join(tmpdir(), "review-packet-cwd-")));
  try {
    const result = run(elsewhere, [
      "--review",
      "1",
      "--base",
      base,
      "--task",
      task,
      "--root",
      root,
      "--boundary",
      "merge to main",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).checkBrief.ok, true);
    const brief = await readFile(join(task, "scratch/reviews/R1-brief.md"), "utf8");
    assert.match(brief, /\nDocs: `dev-docs\/auth\.md`\n/);
    assert.match(brief, /\nReview rules: `REVIEW\.md`\n/);
    assert.equal(brief.includes(elsewhere), false, brief);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(elsewhere, { recursive: true, force: true });
  }
});

test("review-packet points Review rules at a tracked Markdown file's Review Rules section at the base", async () => {
  const { root, base, task } = await project({
    "REVIEW.md": null,
    "dev-docs/README.md": "# Docs\n\n## Review Rules\n\n- **Blocking Issue:** an unsupported claim.\n",
  });
  try {
    const result = run(root, ["--review", "1", "--base", base, "--task", task, "--boundary", "merge", "--json"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const brief = await readFile(join(task, "scratch/reviews/R1-brief.md"), "utf8");
    assert.match(brief, /\nReview rules: `dev-docs\/README\.md#review-rules`\n/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review-packet points Method at the base's copy of Review Work when the change under review edits it", async () => {
  const { root, task } = await project();
  try {
    await cp(resolve("skills/review-work"), join(root, "skills/review-work"), { recursive: true });
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "-m", "add review work");
    const base = git(root, "rev-parse", "HEAD");
    await write(root, { "skills/review-work/references/work.md": "# Work Review, edited by the change\n" });
    git(root, "commit", "--quiet", "-am", "edit the method");
    const copied = join(root, "skills/review-work/scripts/review-packet.mjs");
    const result = run(
      root,
      ["--review", "1", "--base", base, "--task", task, "--boundary", "merge", "--json"],
      copied,
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const brief = await readFile(join(task, "scratch/reviews/R1-brief.md"), "utf8");
    const short = base.slice(0, 12);
    assert.match(
      brief,
      new RegExp(
        `\\nMethod: \`skills/review-work/SKILL\\.md\`, \`skills/review-work/references/work\\.md\`, read from the base ${short} \\(git show ${short}:<path>\\)\\n`,
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("review-packet numbers briefs in sequence across a task and never replaces a review that has reported", async () => {
  const { root, base, task } = await project();
  try {
    await write(task, {
      "scratch/reviews/R1-brief.md": "Review: 1\nReviewed state: abc\n",
      "scratch/reviews/R1-report.md": "Judgment: Pass\n",
      "scratch/reviews/R2-brief.md": "Review: 1\nReviewed state: def\n",
      "scratch/reviews/R2-report.md": "Judgment: Pass\n",
    });
    const result = run(root, ["--review", "1", "--base", base, "--task", task, "--boundary", "merge", "--json"]);
    assert.equal(result.status, 0, result.stdout);
    assert.match(JSON.parse(result.stdout).brief, /R3-brief\.md$/);
    assert.equal(await readFile(join(task, "scratch/reviews/R1-brief.md"), "utf8"), "Review: 1\nReviewed state: abc\n");
    // Run again: R3 has no report yet, so its draft is written again rather than a new R4.
    const again = run(root, ["--review", "1", "--base", base, "--task", task, "--boundary", "merge", "--json"]);
    assert.match(JSON.parse(again.stdout).brief, /R3-brief\.md$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
