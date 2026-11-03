import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const status = resolve("skills/review-work/scripts/review-status.mjs");
const packet = resolve("skills/review-work/scripts/review-packet.mjs");
const checkBrief = resolve("skills/review-work/scripts/check-brief.mjs");
const adjudication = resolve("skills/review-work/scripts/check-adjudication.mjs");
const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  CLAUDE_CODE_SESSION_ID: "",
  FREEFLOW_SESSION: "",
};
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
const node = (cwd, script, args, env = {}) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env: { ...gitEnv, ...env }, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** main with commits c0 (base), c1, c2, c3, and a side branch commit; a task folder beside them. */
async function history() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "review-status-")));
  git(root, "init", "--quiet", "--initial-branch=main");
  const commits = [];
  for (const n of [0, 1, 2, 3]) {
    await write(root, { ".gitignore": ".freeflow/\n", "src/a.js": `${n}\n` });
    git(root, "add", "--all");
    git(root, "commit", "--quiet", "-m", `c${n}`);
    commits.push(git(root, "rev-parse", "HEAD"));
  }
  git(root, "checkout", "--quiet", "-b", "side", commits[1]);
  await write(root, { "src/b.js": "side\n" });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "side");
  const side = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "--quiet", "main");
  const task = join(root, ".freeflow/tasks/task-001");
  await mkdir(join(task, "reviews"), { recursive: true });
  const records = async (...lines) =>
    writeFile(
      join(task, "reviews/records.jsonl"),
      lines.map((line) => `${JSON.stringify({ v: 1, ...line })}\n`).join(""),
    );
  const run = (...args) => {
    const result = node(root, status, ["--task", task, ...args, "--json"]);
    return { status: result.status, ...JSON.parse(result.stdout) };
  };
  return { root, task, commits, side, records, run, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const review = (base, head, judgment, round = 1, depth = "standard") => ({
  ts: "2026-11-03T00:00:00Z",
  round,
  base,
  head,
  depth,
  tier: "standard",
  reviewers: 1,
  model: "auto",
  judgment,
  items: { accepted: 0, rejected: 0, open: 0 },
  report: `R${round}-report.md`,
});

test("review-status reports none, covered, and covered-but-stale with the re-review range", async () => {
  const h = await history();
  try {
    const [c0, c1, c2, c3] = h.commits;
    const none = h.run("--base", c0);
    assert.equal(none.status, 1);
    assert.equal(none.state, "none");
    assert.equal(none.line, `Review: none for ${c3.slice(0, 12)}; the plan says standard`);

    await h.records(review(c0, c1, "Pass"));
    const stale = h.run();
    assert.equal(stale.status, 1);
    assert.equal(stale.state, "stale");
    assert.equal(stale.since, 2);
    assert.equal(
      stale.line,
      `Review: on record for ${c1.slice(0, 12)}; 2 commits since: a diff-only re-review covers ${c1.slice(0, 12)}..${c3.slice(0, 12)}`,
    );
    const atOne = h.run("--head", c1);
    assert.equal(atOne.status, 0);
    assert.equal(atOne.line, `Review: on record for ${c1.slice(0, 12)} (standard, Pass after Review 1)`);

    // A diff-only Review 2 of c1..c3 completes the first review.
    await h.records(review(c0, c1, "Blocking", 1, "deep"), review(c1, c3, "Pass", 2, "deep"));
    const covered = h.run();
    assert.equal(covered.status, 0);
    assert.equal(covered.state, "covered");
    assert.equal(covered.line, `Review: on record for ${c3.slice(0, 12)} (deep, Pass after Review 2)`);
    const text = node(h.root, status, ["--task", h.task]);
    assert.equal(text.status, 0);
    assert.equal(text.stdout.trim(), covered.line);
  } finally {
    await h.cleanup();
  }
});

test("a Blocking or Inconclusive record covers nothing, a later round with no earlier review covers nothing, and another branch's records are ignored", async () => {
  const h = await history();
  try {
    const [c0, c1, c2, c3] = h.commits;
    await h.records(review(c0, c3, "Blocking"), review(c0, h.side, "Pass"));
    const blocked = h.run();
    assert.equal(blocked.state, "none");
    assert.equal(
      blocked.line,
      `Review: none for ${c3.slice(0, 12)}; the review of ${c3.slice(0, 12)} on record is Blocking, which covers nothing`,
    );
    await h.records(review(c0, c3, "Inconclusive"));
    assert.equal(h.run().state, "none");
    // A Review 2 whose base no review on record reached does not cover its head on its own.
    await h.records(review(c2, c3, "Pass", 2));
    assert.equal(h.run().state, "none");
    // Garbage lines are skipped and counted.
    await writeFile(
      join(h.task, "reviews/records.jsonl"),
      `not json\n${JSON.stringify(review(c0, c1, "Non-blocking"))}\n`,
    );
    const skipped = h.run("--head", c1);
    assert.equal(skipped.state, "covered");
    assert.equal(skipped.skippedLines, 1);
  } finally {
    await h.cleanup();
  }
});

test("without a task the records live in this session's reviews folder in the Freeflow home", async () => {
  const h = await history();
  const home = await realpath(await mkdtemp(join(tmpdir(), "review-status-home-")));
  try {
    const [c0, , , c3] = h.commits;
    await write(home, { "sessions/s-9/reviews/records.jsonl": `${JSON.stringify(review(c0, c3, "Pass"))}\n` });
    const result = node(h.root, status, ["--json"], { FREEFLOW_HOME: home, FREEFLOW_SESSION: "s-9" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).reviews, join(home, "sessions/s-9/reviews"));
    assert.equal(JSON.parse(result.stdout).state, "covered");
  } finally {
    await h.cleanup();
    await rm(home, { recursive: true, force: true });
  }
});

test("a Deep review: three briefs pass check-brief, one adjudication over the three reports, recorded against its head", async () => {
  const h = await history();
  try {
    const [c0, , , c3] = h.commits;
    await write(h.root, { "src/auth/login.js": "export const login = 1;\n" });
    git(h.root, "add", "--all");
    git(h.root, "commit", "--quiet", "-m", "auth");
    const head = git(h.root, "rev-parse", "HEAD");
    const reviews = join(h.task, "reviews");
    for (const letter of ["a", "b", "c"]) {
      const result = node(h.root, packet, [
        ...["--review", "1", "--base", c0, "--task", h.task, "--reviewer", letter],
        ...["--boundary", "merge", "--agreement", join(h.root, "src/a.js"), "--json"],
      ]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(JSON.parse(result.stdout).brief, new RegExp(`R1${letter}-brief\\.md$`));
      const brief = await readFile(join(reviews, `R1${letter}-brief.md`), "utf8");
      assert.match(brief, new RegExp(`\\nPlan: deep, tier security, reviewer ${letter} of 3, up to Review 3`));
      assert.match(brief, new RegExp(`\\nReport: \`[^\`]*R1${letter}-report\\.md\`\\n`));
      assert.equal(node(h.root, checkBrief, [join(reviews, `R1${letter}-brief.md`)]).status, 0);
    }
    // A Standard plan has one reviewer: --reviewer is refused.
    assert.equal(
      node(h.root, packet, ["--review", "1", "--base", c3, "--head", c3, "--task", h.task, "--reviewer", "a"]).status,
      2,
    );

    const report = (items) =>
      `Review type: independent\nReview number: 1\nJudgment: Blocking\n\n### Review Items\n\n${items}\nEvidence gaps: none\n`;
    await write(reviews, {
      "R1a-report.md": report("#### Issues — Blocking\n\nB1. The login skips the check.\n"),
      "R1b-report.md": report("#### Issues — Non-blocking\n\nN1. A message is unclear.\n"),
      "R1c-report.md": report("#### Unresolved — Questions\n\n- Should a locked account log in?\n"),
    });
    const reports = ["a", "b", "c"].map((letter) => join(reviews, `R1${letter}-report.md`));
    // One disposition missing across the three is refused.
    await write(reviews, {
      "R1-adjudication.md":
        "## Adjudication\n\n- a.B1: Rejected. The check runs in the caller.\n- b.N1: Accepted. Reworded.\n\nAdjudicated judgment: Inconclusive\n",
    });
    const missing = node(h.root, adjudication, [...reports, "--json"]);
    assert.equal(missing.status, 1);
    assert.match(
      JSON.parse(missing.stdout)
        .problems.map((each) => `${each.item}: ${each.problem}`)
        .join("\n"),
      /^c\.Q1: \(Question\) has no disposition/m,
    );
    // Complete: recorded against the reviewed head.
    await write(reviews, {
      "R1-adjudication.md":
        "## Adjudication\n\n- a.B1: Rejected. The check runs in the caller.\n- b.N1: Accepted. Reworded.\n- c.Q1: Rejected, out of scope for this change.\n\nAdjudicated judgment: Non-blocking\n",
    });
    const done = node(h.root, adjudication, [...reports, "--record", "--json"]);
    assert.equal(done.status, 0, done.stdout + done.stderr);
    const recorded = JSON.parse(done.stdout).record;
    assert.equal(recorded.depth, "deep");
    assert.equal(recorded.tier, "security");
    assert.equal(recorded.reviewers, 3);
    assert.equal(recorded.round, 1);
    assert.equal(recorded.judgment, "Non-blocking");
    assert.equal(recorded.report, "R1-adjudication.md");
    assert.deepEqual(recorded.items, { accepted: 1, rejected: 2, open: 0 });
    assert.ok(head.startsWith(recorded.head));
    const covered = h.run("--head", head);
    assert.equal(covered.state, "covered");
    assert.equal(covered.line, `Review: on record for ${head.slice(0, 12)} (deep, Non-blocking after Review 1)`);
  } finally {
    await h.cleanup();
  }
});
