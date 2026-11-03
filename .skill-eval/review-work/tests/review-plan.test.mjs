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
const fired = (plan) => plan.because.filter((match) => match.depth !== "off").map((match) => match.name);

test("the same inputs give the same plan, and a change no trigger fires gets the default Standard review", async () => {
  const r = await repo({ "src/app.js": "export const a = 1;\n" }, { "src/app.js": "export const a = 2;\n" });
  try {
    const [first, second] = [r.plan(), r.plan()];
    assert.deepEqual(first, second);
    assert.equal(first.depth, "standard");
    assert.equal(first.tier, "standard");
    assert.equal(first.reviewers, 1);
    assert.equal(first.rounds, 2);
    assert.equal(first.unit.value, "pr");
    assert.deepEqual(first.because, []);
    const text = r.run();
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^Review plan for 1 file, [0-9a-f]+ \([0-9a-f]{8}\)\.\.HEAD \([0-9a-f]{8}\)\n/);
    assert.match(text.stdout, /\n {2}Unit: pr \(the default\)\n/);
    assert.match(text.stdout, /\n {2}Depth: standard, tier standard, 1 reviewer, up to Review 2, humans 0\n/);
    assert.match(text.stdout, /\n {2}Default otherwise: standard \(the base has no \.freeflow\/config\.json/);
    assert.match(text.stdout, /\n {2}Already on record: none for [0-9a-f]{12}$/m);
  } finally {
    await r.cleanup();
  }
});

test("a fixture diff per built-in fires it, by path or by content", async () => {
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
      { "pi-extension/src/host/config-validation.ts": SETTINGS_TS(["enabled", "review.unit"]) },
      "public interface",
      /adds settings key review\.unit/,
    ],
    [
      { "package.json": JSON.stringify({ name: "x" }) },
      { "package.json": JSON.stringify({ name: "x", bin: { x: "bin/x.js" } }) },
      "public interface",
      /changes package\.json's bin, exports or main/,
    ],
  ];
  for (const [baseFiles, change, trigger, why] of cases) {
    const r = await repo(baseFiles, change);
    try {
      const plan = r.plan();
      const match = plan.because.find((each) => each.name === trigger);
      assert.ok(match, `${Object.keys(change)[0]} fires ${trigger}: ${JSON.stringify(plan.because)}`);
      assert.match(match.detail.join("\n"), why, Object.keys(change)[0]);
      assert.equal(plan.depth, "deep", Object.keys(change)[0]);
      assert.equal(plan.tier, trigger === "security" ? "security" : "standard", Object.keys(change)[0]);
      assert.equal(plan.reviewers, 3);
      assert.equal(plan.rounds, 3);
    } finally {
      await r.cleanup();
    }
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
    const plan = r.plan();
    assert.deepEqual(fired(plan), []);
    assert.equal(plan.depth, "standard");
  } finally {
    await r.cleanup();
  }
});

test("a branch that changes the depth rules is planned with the base's rules", async () => {
  const policy = (depth) => `${JSON.stringify({ review: { depth } })}\n`;
  const r = await repo(
    { ".freeflow/config.json": policy({ rules: [{ paths: ["src/**"], depth: "deep" }] }), "src/a.js": "1\n" },
    { ".freeflow/config.json": policy({ default: "quick", rules: [] }), "src/a.js": "2\n" },
  );
  try {
    const plan = r.plan();
    assert.equal(plan.depth, "deep");
    assert.deepEqual(fired(plan), ["rule 1 (.freeflow/config.json)"]);
    assert.equal(plan.policy, "file");
  } finally {
    await r.cleanup();
  }
});

test("a rule, an agreement's Review line and an added trigger each raise the plan; only the base's builtins lower a built-in", async () => {
  const policy = {
    review: {
      unit: "agreement",
      rounds: 2,
      depth: {
        default: "quick",
        rules: [
          { paths: ["src/payments/**"], depth: "deep", tier: "security", humans: 1 },
          { paths: ["src/auth/**"], depth: "quick" },
          { linesOver: 5, depth: "standard" },
        ],
        builtins: { ci: "quick", data: "off" },
      },
    },
  };
  const base = { ".freeflow/config.json": JSON.stringify(policy), "src/app.js": "1\n" };
  const quick = await repo(base, { "src/app.js": "2\n" });
  try {
    const plan = quick.plan();
    assert.equal(plan.depth, "quick", "the default applies where nothing matches");
    assert.equal(plan.unit.value, "agreement");
    assert.equal(plan.unit.from, "base");
    assert.equal(plan.rounds, 2, "quick allows Review 2 only if Blocking");
  } finally {
    await quick.cleanup();
  }
  const rule = await repo(base, { "src/payments/charge.js": "1\n" });
  try {
    const plan = rule.plan();
    assert.equal(plan.depth, "deep");
    assert.equal(plan.tier, "security");
    assert.equal(plan.humans, 1);
    assert.equal(plan.rounds, 2, "review.rounds caps the depth's budget");
  } finally {
    await rule.cleanup();
  }
  const lines = await repo(base, { "src/app.js": "1\n2\n3\n4\n5\n6\n7\n" });
  try {
    assert.equal(lines.plan().depth, "standard");
  } finally {
    await lines.cleanup();
  }
  // A path rule that says quick does not lower the security built-in on the same file; builtins does lower ci.
  const lowered = await repo(base, {
    "src/auth/login.js": "1\n",
    ".github/workflows/ci.yml": "on: push\n",
    "db/migrations/1.sql": "x\n",
  });
  try {
    const plan = lowered.plan();
    assert.equal(plan.depth, "deep");
    const ci = plan.because.find((each) => each.name === "ci");
    assert.equal(ci.depth, "quick");
    assert.equal(plan.because.find((each) => each.name === "data").depth, "off");
    const text = lowered.run();
    assert.match(text.stdout, /built-in "ci": .* -> quick \(the base's builtins\)/);
    assert.match(text.stdout, /Off at the base: built-in "data" would fire on db\/migrations\/1\.sql/);
  } finally {
    await lowered.cleanup();
  }
  const raised = await repo(base, { "src/app.js": "2\n" });
  try {
    const task = join(raised.root, ".freeflow/tasks/task-001");
    await write(raised.root, {
      ".freeflow/tasks/task-001/record.md":
        "# T\n\n## Current Work\n\n### Agreement A-001 — X\n\n- Opened: 2026-11-03\n- Done when done.\n- Review: src/app.js deep\n\n### Delegations\n",
    });
    const plan = raised.plan("--task", task);
    assert.equal(plan.depth, "deep");
    assert.deepEqual(fired(plan), ["the agreement"]);
    const all = raised.plan("--task", task, "--add", "security", "--reason", "it changes who may read a record");
    assert.equal(all.tier, "security");
    assert.match(all.because.at(-1).detail[0], /added: it changes who may read a record/);
    // There is no option that removes a trigger.
    assert.equal(raised.run("--remove", "security").status, 2);
    assert.equal(raised.run("--add", "security").status, 2, "an added trigger needs its reason");
    assert.equal(raised.run("--add", "style", "--reason", "x").status, 2, "only a built-in can be added");
  } finally {
    await raised.cleanup();
  }
});

test("a base policy that does not validate refuses the plan with the key and the reason", async () => {
  const r = await repo(
    { ".freeflow/config.json": JSON.stringify({ review: { depth: { default: "full" } } }) },
    { "src/a.js": "1\n" },
  );
  try {
    const result = r.run();
    assert.equal(result.status, 2);
    assert.match(
      result.stderr,
      /review\.depth\.default must be one of quick, standard, deep; a broken policy never means no review/,
    );
  } finally {
    await r.cleanup();
  }
  const personal = await repo({ ".gitignore": ".freeflow/local.json\n" }, { "src/a.js": "1\n" });
  try {
    await write(personal.root, { ".freeflow/local.json": JSON.stringify({ review: { depth: { default: "quick" } } }) });
    const result = personal.run();
    assert.equal(result.status, 2);
    assert.match(result.stderr, /local\.json is invalid: review\.depth is Repository scope only/);
  } finally {
    await personal.cleanup();
  }
});

test("the personal and session settings set the unit, model and rounds, not the depth", async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "review-plan-home-")));
  const r = await repo(
    { ".gitignore": ".freeflow/local.json\n", ".freeflow/config.json": JSON.stringify({ review: { unit: "push" } }) },
    { "src/a.js": "1\n" },
    { FREEFLOW_HOME: home, FREEFLOW_SESSION: "s-1" },
  );
  try {
    await write(r.root, { ".freeflow/local.json": JSON.stringify({ review: { model: "my-model" } }) });
    await write(home, {
      "sessions/s-1/settings.json": JSON.stringify({ "review.unit": "manual", "review.rounds": 1 }),
    });
    const plan = r.plan();
    assert.deepEqual(plan.unit, { value: "manual", from: "this session" });
    assert.deepEqual(plan.model, { value: "my-model", from: ".freeflow/local.json" });
    assert.equal(plan.reviewerModel, "my-model");
    assert.equal(plan.rounds, 1);
  } finally {
    await r.cleanup();
    await rm(home, { recursive: true, force: true });
  }
});

test("a file whose content cannot be read is judged by its path and named", async () => {
  const r = await repo({}, { "skills/demo/SKILL.md": Buffer.from([0, 1, 2, 3, 0]).toString("latin1") });
  try {
    const plan = r.plan();
    assert.deepEqual(plan.byPathOnly, [{ path: "skills/demo/SKILL.md", reason: "binary" }]);
    assert.match(plan.because.find((each) => each.name === "public interface").detail[0], /by path/);
    assert.match(r.run().stdout, /Judged by path only: skills\/demo\/SKILL\.md \(binary\)/);
  } finally {
    await r.cleanup();
  }
});
