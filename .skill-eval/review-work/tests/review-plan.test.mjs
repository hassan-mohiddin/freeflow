import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const script = resolve("skills/review-work/scripts/review-plan.mjs");
const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  CLAUDE_CODE_SESSION_ID: "",
  // No user rule unless a test writes one: the home's rules/review.md would change when a review is due.
  FREEFLOW_HOME: join(tmpdir(), "freeflow-review-no-home"),
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
const SKILL = (description, body = "Body.\n") =>
  `---\nname: demo-skill\ndescription: "${description}"\n---\n\n# Demo\n\n${body}`;
const SETTINGS_TS = (keys) =>
  `export const SETTINGS = [\n${keys.map((key) => `  { key: "${key}", label: "x" },`).join("\n")}\n];\n`;

/** A repository with a base commit, then one commit with `change` on a branch; returns its root and base. */
async function repo(baseFiles, change, env = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "review-plan-")));
  git(root, "init", "--quiet", "--initial-branch=main");
  await write(root, { "README.md": "# Demo\n", ...baseFiles });
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "base");
  const base = git(root, "rev-parse", "HEAD");
  git(root, "checkout", "--quiet", "-b", "change");
  await write(root, change);
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "change");
  const run = (...args) => {
    const result = spawnSync(process.execPath, [script, "--base", base, ...args], {
      cwd: root,
      env: { ...gitEnv, ...env },
      encoding: "utf8",
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  const plan = (...args) => {
    const result = run(...args, "--json");
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { root, base, run, plan, cleanup: () => rm(root, { recursive: true, force: true }) };
}
const fired = (plan) => plan.flags.map((flag) => flag.name);
const FLOOR = { reviewers: 1, rounds: 1 };

test("the same inputs give the same plan, and a change no flag fires gets the floor: one reviewer, one round", async () => {
  const r = await repo({ "src/app.js": "export const a = 1;\n" }, { "src/app.js": "export const a = 2;\n" });
  try {
    const [first, second] = [r.plan(), r.plan()];
    assert.deepEqual(first, second);
    assert.deepEqual(first.floor, FLOOR);
    assert.deepEqual(first.flags, []);
    assert.deepEqual(first.reviewAt, { value: "pull request", from: "default", source: null, ignored: [] });
    const text = r.run();
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^Review plan for 1 file, [0-9a-f]+ \([0-9a-f]{8}\)\.\.HEAD \([0-9a-f]{8}\)\n/);
    assert.match(text.stdout, /\n {2}Review at: pull request \(Freeflow's default\)\n/);
    assert.match(
      text.stdout,
      /\n {2}Floor: 1 reviewer, 1 round \(Review 1\); after it you check the fixes, with no second round by rule\n/,
    );
    assert.match(text.stdout, /\n {2}Flags: none\n/);
    assert.match(text.stdout, /\n {2}Reviewer model: the routing table's review row \(delegate open --kind review\)\n/);
    assert.match(text.stdout, /\n {2}Already on record: none for [0-9a-f]{12}$/m);
    assert.doesNotMatch(text.stdout, /Depth|Quick|Standard|Deep|tier/);
  } finally {
    await r.cleanup();
  }
});

test("a fixture diff per built-in raises its flag with the reason, by path or by content, and keeps the floor", async () => {
  const cases = [
    [{}, { "src/auth/session.js": "export const ttl = 1;\n" }, "security", /under auth\//],
    [{}, { "src/passwordReset.ts": "export {};\n" }, "security", /named passwordReset\.ts/],
    [{}, { ".env.production": "A=1\n" }, "security", /a key or environment file/],
    [
      { "src/hooks.js": "export const check = () => ({});\n" },
      { "src/hooks.js": 'export const check = () => ({ decision: "deny" });\n' },
      "security",
      /changes a permission decision \(by content\)/,
    ],
    [{}, { "src/client.js": "const key = process.env.API_KEY;\n" }, "security", /a credential read/],
    [{}, { "src/sign.js": "crypto.createHmac('sha256', k);\n" }, "security", /a crypto call/],
    [{}, { "db/migrations/001_users.sql": "create table users();\n" }, "data", /under migrations\//],
    [{}, { "prisma/schema.prisma": "model A {}\n" }, "data", /named schema\.prisma/],
    [{}, { ".github/workflows/ci.yml": "on: push\n" }, "ci", /a CI or release file/],
    [{}, { "scripts/release-notes.mjs": "export {};\n" }, "ci", /a CI or release file/],
    [
      { "skills/demo/SKILL.md": SKILL("Use when demoing.") },
      { "skills/demo/SKILL.md": SKILL("Use when demoing or showing.") },
      "public interface",
      /changes its description \(by content\)/,
    ],
    [{}, { "skills/new/SKILL.md": SKILL("Use when new.") }, "public interface", /adds a skill/],
    [
      { "command-surface.json": JSON.stringify({ directSkillCalls: [{ command: "/a", skill: "a" }] }) },
      {
        "command-surface.json": JSON.stringify({
          directSkillCalls: [
            { command: "/a", skill: "a" },
            { command: "/b", skill: "b" },
          ],
        }),
      },
      "public interface",
      /adds \/b/,
    ],
    [
      { "pi-extension/src/host/config-validation.ts": SETTINGS_TS(["enabled"]) },
      { "pi-extension/src/host/config-validation.ts": SETTINGS_TS(["enabled", "gates.slice"]) },
      "public interface",
      /adds settings key gates\.slice/,
    ],
    [
      { "package.json": JSON.stringify({ name: "x" }) },
      { "package.json": JSON.stringify({ name: "x", bin: { x: "bin/x.js" } }) },
      "public interface",
      /changes package\.json's bin, exports or main/,
    ],
  ];
  for (const [baseFiles, change, flag, why] of cases) {
    const r = await repo(baseFiles, change);
    try {
      const plan = r.plan();
      const match = plan.flags.find((each) => each.name === flag);
      assert.ok(match, `${Object.keys(change)[0]} raises ${flag}: ${JSON.stringify(plan.flags)}`);
      assert.match(match.detail.join("\n"), why, Object.keys(change)[0]);
      assert.deepEqual(plan.floor, FLOOR, "a flag never changes the floor");
    } finally {
      await r.cleanup();
    }
  }
});

test("a diff that touches security code prints one reviewer, one round and the flag with its reason", async () => {
  const r = await repo(
    { "src/hooks.js": "export const check = () => ({});\n" },
    {
      "src/auth/login.js": "export const login = () => 1;\n",
      "src/hooks.js": 'export const check = () => ({ decision: "deny" });\n',
    },
  );
  try {
    const text = r.run();
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /\n {2}Floor: 1 reviewer, 1 round \(Review 1\)/);
    assert.match(
      text.stdout,
      /\n {2}Flags \(each a reason to weigh more than the floor with the user; none changes it\):\n {4}- security: src\/auth\/login\.js under auth\/; src\/hooks\.js changes a permission decision \(by content\)\n/,
    );
    assert.match(
      text.stdout,
      /\n {2}Above the floor: your call with the user: more reviewers, each with a different lens, or a stronger model; propose it with the reason and the cost\n/,
    );
  } finally {
    await r.cleanup();
  }
});

test("a doc named for sessions, a tokens.ts cost module, a skill body edit and other ordinary changes fire nothing", async () => {
  const r = await repo(
    {
      "skills/demo/SKILL.md": SKILL("Use when demoing.", "Old body.\n"),
      "package.json": JSON.stringify({ name: "x", scripts: { test: "a" } }),
      "pi-extension/src/host/config-validation.ts": `${SETTINGS_TS(["enabled"])}// one\n`,
      "src/hash.js": "export const h = 1;\n",
    },
    {
      "src/sessions.md": "# Sessions\n",
      "docs/auth.md": "# Auth\n",
      "src/cost/tokens.ts": "export const tokensPerCall = 3;\n",
      "skills/demo/SKILL.md": SKILL("Use when demoing.", "New body.\n"),
      "package.json": JSON.stringify({ name: "x", scripts: { test: "b" } }),
      "pi-extension/src/host/config-validation.ts": `${SETTINGS_TS(["enabled"])}// two\n`,
      "src/hash.js": "export const h = crypto.createHash('sha256');\n",
    },
  );
  try {
    assert.deepEqual(fired(r.plan()), []);
  } finally {
    await r.cleanup();
  }
});

test("the project's Review at line is read at the base, before the home's rule and the default", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "review-plan-home-")));
  const rules = (line) =>
    `# Dev\n\n## Review Rules\n\n- ${line}\n- Prose the agent reads.\n\n## Other\n\nReview at: commit\n`;
  const r = await repo(
    { "dev-docs/README.md": rules("Review at: push") },
    { "dev-docs/README.md": rules("Review at: commit"), "src/a.js": "1\n" },
    { FREEFLOW_HOME: home },
  );
  try {
    await write(home, { "rules/review.md": "# My review rule\n\nReview at: commit\n" });
    const plan = r.plan();
    assert.deepEqual(plan.reviewAt, {
      value: "push",
      from: "project",
      source: "dev-docs/README.md#review-rules",
      ignored: [],
    });
    assert.match(r.run().stdout, /\n {2}Review at: push \(dev-docs\/README\.md#review-rules at [0-9a-f]+\)\n/);
  } finally {
    await r.cleanup();
  }
  const own = await repo({}, { "src/a.js": "1\n" }, { FREEFLOW_HOME: home });
  try {
    assert.deepEqual(own.plan().reviewAt, {
      value: "commit",
      from: "home",
      source: join(home, "rules/review.md"),
      ignored: [],
    });
  } finally {
    await own.cleanup();
    await rm(home, { recursive: true, force: true });
  }
});

test("a Review at line that names no step is ignored and named; an old review block in a config changes nothing", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "review-plan-home-")));
  const r = await repo(
    {
      "REVIEW.md": "# Review\n\nReview at: sometimes\n",
      ".freeflow/config.json": JSON.stringify({ review: { unit: "manual", rounds: 1, depth: { default: "full" } } }),
    },
    { "src/a.js": "1\n" },
    { FREEFLOW_HOME: home, FREEFLOW_SESSION: "s-1" },
  );
  try {
    await write(home, {
      "sessions/s-1/settings.json": JSON.stringify({ "review.unit": "manual", "review.rounds": 1 }),
    });
    const result = r.run("--json");
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.deepEqual(plan.floor, FLOOR);
    assert.equal(plan.reviewAt.value, "pull request");
    assert.equal(plan.reviewAt.from, "default");
    assert.deepEqual(plan.reviewAt.ignored, [
      {
        source: "REVIEW.md",
        line: "Review at: sometimes",
        reason: 'takes commit, push, pull request, not "sometimes"',
      },
    ]);
    assert.match(r.run().stdout, /\n {4}Ignored: REVIEW\.md "Review at: sometimes": takes commit, push, pull request/);
  } finally {
    await r.cleanup();
    await rm(home, { recursive: true, force: true });
  }
});

test("an agreement's Review line and an added flag each raise a flag; nothing removes one", async () => {
  const raised = await repo({ "src/app.js": "1\n" }, { "src/app.js": "2\n" });
  try {
    const task = join(raised.root, ".freeflow/tasks/task-001");
    await write(raised.root, {
      ".freeflow/tasks/task-001/record.md":
        "# T\n\n## Current Work\n\n### Agreement A-001 — X\n\n- Opened: 2026-11-03\n- Done when done.\n- Review: src/app.js deep\n\n### Delegations\n",
    });
    const plan = raised.plan("--task", task);
    assert.deepEqual(fired(plan), ["the agreement"]);
    assert.deepEqual(plan.flags[0].detail, ["Review: src/app.js deep"]);
    assert.deepEqual(plan.floor, FLOOR);
    const all = raised.plan("--task", task, "--add", "security", "--reason", "it changes who may read a record");
    assert.deepEqual(fired(all), ["the agreement", "security"]);
    assert.match(all.flags.at(-1).detail[0], /added: it changes who may read a record/);
    assert.match(
      raised.run("--add", "security", "--reason", "it changes who may read a record").stdout,
      /\n {4}- security \(added\): added: it changes who may read a record\n/,
    );
    // There is no option that removes a flag.
    assert.equal(raised.run("--remove", "security").status, 2);
    assert.equal(raised.run("--add", "security").status, 2, "an added flag needs its reason");
    assert.equal(raised.run("--add", "style", "--reason", "x").status, 2, "only a built-in can be added");
  } finally {
    await raised.cleanup();
  }
});

test("a file whose content cannot be read is judged by its path and named", async () => {
  const r = await repo({}, { "skills/demo/SKILL.md": Buffer.from([0, 1, 2, 3, 0]).toString("latin1") });
  try {
    const plan = r.plan();
    assert.deepEqual(plan.byPathOnly, [{ path: "skills/demo/SKILL.md", reason: "binary" }]);
    assert.match(plan.flags.find((each) => each.name === "public interface").detail[0], /by path/);
    assert.match(r.run().stdout, /Judged by path only: skills\/demo\/SKILL\.md \(binary\)/);
  } finally {
    await r.cleanup();
  }
});
