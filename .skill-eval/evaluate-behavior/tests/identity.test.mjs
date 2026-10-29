import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-identity-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function git(root, ...args) {
  const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// A fake Pi that answers --version and otherwise records that it started.
async function installFakePi(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const executable = path.join(bin, "pi");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) { process.stdout.write("1.1.0\\n"); process.exit(0); }
appendFileSync(${JSON.stringify(path.join(root, "..", path.basename(root) + "-pi.log"))}, "started\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], provider: "fake", model: "model", usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } }, stopReason: "stop" } });
emit({ type: "agent_settled" });
`,
  );
  await chmod(executable, 0o755);
  return bin;
}

function group({ hostVersion } = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "identity",
    type: "description",
    input: { prompt: "Say done." },
    fixture: "fixtures/task",
    tools: ["read"],
    configuration: {
      host: hostVersion ? { name: "pi", version: hostVersion } : { name: "pi" },
      model: { model: "fake/model" },
      subject: { kind: "skill", source: { kind: "working-tree" }, context: [] },
    },
    arms: {
      baseline: { subject: { skills: [], target: null } },
      candidate: { subject: { skills: ["skills/target"], target: 0 } },
    },
    component: ["subject.skills", "subject.target"],
    expectations: [{ id: "candidate-read", kind: "skill-read", variant: "candidate", expect: "never" }],
    review_questions: [],
  };
}

/** A committed repository holding the definition, its fixture and its skill. */
async function setUp(root, options = {}) {
  const repo = path.join(root, "repo");
  await mkdir(path.join(repo, "fixtures/task"), { recursive: true });
  await mkdir(path.join(repo, "skills/target"), { recursive: true });
  await writeFile(path.join(repo, "fixtures/task/notes.md"), "Notes.\n");
  await writeFile(
    path.join(repo, "skills/target/SKILL.md"),
    "---\nname: target\ndescription: Use when testing.\n---\n\n# Target\n",
  );
  await writeFile(path.join(repo, "group.json"), `${JSON.stringify(group(options), null, 2)}\n`);
  git(repo, "init", "-q");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "inputs");
  const bin = await installFakePi(repo);
  return { repo, bin, log: path.join(root, "repo-pi.log"), head: git(repo, "rev-parse", "HEAD") };
}

function run(repo, bin, extra = []) {
  return spawnSync(process.execPath, [entrypoint, "run", "group.json", "--jobs", "1", ...extra], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      SKILL_EVAL_CREDENTIALS_DIR: path.join(repo, "no-credentials"),
    },
  });
}

async function summaryOf(result) {
  const directory = result.stdout.match(/^Path: (.+)$/m)?.[1];
  assert.ok(directory, result.stdout + result.stderr);
  return { directory, summary: JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8")) };
}

test("committed inputs make a canonical run that records their commit", async () => {
  await withTempDirectory(async (root) => {
    const { repo, bin, head } = await setUp(root);

    const result = run(repo, bin);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const { directory, summary } = await summaryOf(result);
    assert.equal(summary.dryRun, false);
    assert.deepEqual(summary.inputs, { commit: head, uncommitted: [] });
    const candidate = JSON.parse(await readFile(path.join(directory, "groups/identity/candidate/run.json"), "utf8"));
    assert.equal(candidate.resources.source.commit, head);
  });
});

test("an uncommitted input refuses a run before anything starts, unless it is a dry run", async () => {
  await withTempDirectory(async (root) => {
    const { repo, bin, log } = await setUp(root);
    await writeFile(path.join(repo, "skills/target/SKILL.md"), "---\nname: target\ndescription: Edited.\n---\n");
    await writeFile(path.join(repo, "fixtures/task/new.md"), "Not committed.\n");

    const refused = run(repo, bin);

    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /uncommitted inputs: fixtures\/task\/new\.md, skills\/target\/SKILL\.md/);
    assert.match(refused.stderr, /commit them, or run with --uncommitted/);
    assert.doesNotMatch(refused.stdout, /^Result:/m);
    await assert.rejects(readFile(log), { code: "ENOENT" });

    const dry = run(repo, bin, ["--uncommitted"]);

    assert.equal(dry.status, 0, dry.stderr + dry.stdout);
    assert.match(dry.stdout, /^Plan: .+; uncommitted inputs$/m);
    const { summary } = await summaryOf(dry);
    assert.equal(summary.dryRun, true);
    assert.deepEqual(summary.inputs.uncommitted, ["fixtures/task/new.md", "skills/target/SKILL.md"]);
  });
});

test("a dry run's trials support no claim", async () => {
  await withTempDirectory(async (root) => {
    const { repo, bin } = await setUp(root);
    await writeFile(path.join(repo, "fixtures/task/notes.md"), "Edited.\n");

    const result = run(repo, bin, ["--uncommitted", "--trials", "2"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const aggregateId = result.stdout.match(/^Aggregate: (.+)$/m)?.[1];
    const aggregate = JSON.parse(
      await readFile(path.join(repo, ".skill-eval/runs", aggregateId, "aggregate.json"), "utf8"),
    );
    assert.equal(aggregate.dryRun, true);
    assert.equal(aggregate.claim.class, "none");
  });
});

test("inputs outside any Git repository need a dry run", async () => {
  await withTempDirectory(async (root) => {
    const { repo, bin } = await setUp(root);
    await rm(path.join(repo, ".git"), { recursive: true, force: true });

    const refused = run(repo, bin);

    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /not in a Git repository/);
  });
});

test("a declared host version that differs from the installed one is refused before anything starts", async () => {
  await withTempDirectory(async (root) => {
    const mismatch = await setUp(path.join(root, "a"), { hostVersion: "9.9.9" });

    const refused = run(mismatch.repo, mismatch.bin);

    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /declares pi 9\.9\.9, but the installed pi is 1\.1\.0/);
    await assert.rejects(readFile(mismatch.log), { code: "ENOENT" });

    const matching = await setUp(path.join(root, "b"), { hostVersion: "1.1.0" });
    const accepted = run(matching.repo, matching.bin);
    assert.equal(accepted.status, 0, accepted.stderr + accepted.stdout);
    const { summary } = await summaryOf(accepted);
    assert.equal(summary.hostVersion, "1.1.0");
  });
});
