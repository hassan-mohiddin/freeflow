import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync as rawSpawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-skill/scripts/skill-eval.mjs", import.meta.url));
const FAKE_PI_ENVIRONMENT_KEYS = [
  "FAKE_PI_BREAK_FINAL_FOR",
  "FAKE_PI_BREAK_GRADE_FALLBACK_FOR",
  "FAKE_PI_BREAK_GROUP_ARTIFACTS_FOR",
  "FAKE_PI_BREAK_RUN_FOR",
  "FAKE_PI_CANCEL_PARENT",
  "FAKE_PI_CAPTURE_ENV",
  "FAKE_PI_DESCENDANT_PID",
  "FAKE_PI_ERROR_SKILL",
  "FAKE_PI_EXTENSION_ERROR",
  "FAKE_PI_FAIL_FOR",
  "FAKE_PI_FAIL_SKILL",
  "FAKE_PI_FIXTURE_SOURCE",
  "FAKE_PI_LOG",
  "FAKE_PI_MUTATE_FIXTURE",
  "FAKE_PI_MUTATE_SKILL",
  "FAKE_PI_PRIOR_GROUP",
  "FAKE_PI_READ_SKILL_INDEX",
  "FAKE_PI_REQUIRE_BASELINE_RUN",
  "FAKE_PI_REQUIRE_PRIOR_FOR",
  "FAKE_PI_SERIAL_LOCK",
];

function spawnSync(command, args, options) {
  if (command === process.execPath && args?.includes(entrypoint)) {
    const env = { ...(options?.env ?? process.env) };
    for (const key of FAKE_PI_ENVIRONMENT_KEYS) env[key] ??= "";
    return rawSpawnSync(command, args, { ...options, env });
  }
  return rawSpawnSync(command, args, options);
}

function fakeRuntime({ host = "pi", session = false, extensions = [], inherit = [] } = {}) {
  return {
    host,
    session,
    extensions,
    environment: {
      literal: {},
      inherit: [...new Set([...FAKE_PI_ENVIRONMENT_KEYS, ...inherit])],
    },
  };
}

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-eval-run-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeJson(root, relativePath, value) {
  const file = path.join(root, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    assert.fail(`${label} is not valid JSON: ${error.message}`);
  }
}

async function writeSkill(root, relativePath, { name, description }) {
  const directory = path.join(root, relativePath);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nFollow the declared workflow.\n`,
  );
  return realpath(directory);
}

async function installFakePi(root) {
  const bin = path.join(root, "bin");
  const executable = path.join(bin, "pi");
  await mkdir(bin, { recursive: true });
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
const skill = skills[0] ?? null;
const readSkill = skills[Number(process.env.FAKE_PI_READ_SKILL_INDEX ?? 0)] ?? null;
const fail = skill !== null && process.env.FAKE_PI_FAIL_SKILL === "1" && (!process.env.FAKE_PI_FAIL_FOR || process.cwd().includes(process.env.FAKE_PI_FAIL_FOR));
if (process.env.FAKE_PI_LOG) {
  appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({
    pid: process.pid,
    args,
    cwd: process.cwd(),
    allowedRoots: JSON.parse(process.env.SKILL_EVAL_ALLOWED_ROOTS),
    inheritedValue: process.env.FAKE_PI_CAPTURE_ENV ? process.env[process.env.FAKE_PI_CAPTURE_ENV] ?? null : null,
  }) + "\\n");
}
const variantDirectory = path.dirname(process.cwd());
const groupDirectory = path.dirname(variantDirectory);
const currentVariant = path.basename(variantDirectory);
const currentGroup = path.basename(groupDirectory);
if (process.env.FAKE_PI_REQUIRE_BASELINE_RUN === "1" && currentVariant === "candidate") {
  const required = groupDirectory + "/baseline/run.json";
  if (!existsSync(required)) {
    appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ kind: "missing-evidence", required }) + "\\n");
    process.exit(20);
  }
}
if (process.env.FAKE_PI_REQUIRE_PRIOR_FOR === currentGroup) {
  const prior = path.join(path.dirname(groupDirectory), process.env.FAKE_PI_PRIOR_GROUP);
  for (const required of [path.join(prior, "deterministic-grade.json"), path.join(prior, "group.json")]) {
    if (!existsSync(required)) {
      appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ kind: "missing-evidence", required }) + "\\n");
      process.exit(21);
    }
  }
}
if (process.env.FAKE_PI_SERIAL_LOCK) {
  let lock;
  try {
    lock = openSync(process.env.FAKE_PI_SERIAL_LOCK, "wx");
  } catch {
    appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ kind: "overlap", cwd: process.cwd() }) + "\\n");
    process.exit(19);
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
  closeSync(lock);
  unlinkSync(process.env.FAKE_PI_SERIAL_LOCK);
}
if (process.env.FAKE_PI_BREAK_FINAL_FOR && process.cwd().includes(process.env.FAKE_PI_BREAK_FINAL_FOR)) {
  mkdirSync("../final.md");
}
if (process.env.FAKE_PI_BREAK_RUN_FOR && process.cwd().includes(process.env.FAKE_PI_BREAK_RUN_FOR)) {
  mkdirSync("../run.json");
}
if (process.env.FAKE_PI_BREAK_GROUP_ARTIFACTS_FOR && process.cwd().includes(process.env.FAKE_PI_BREAK_GROUP_ARTIFACTS_FOR)) {
  mkdirSync(path.join(groupDirectory, "deterministic-grade.json"));
  mkdirSync(path.join(groupDirectory, "group.json"));
}
if (process.env.FAKE_PI_BREAK_GRADE_FALLBACK_FOR && process.cwd().includes(process.env.FAKE_PI_BREAK_GRADE_FALLBACK_FOR)) {
  mkdirSync(path.join(groupDirectory, "deterministic-grade.json"));
  mkdirSync(path.join(groupDirectory, "deterministic-grade-error.json"));
}
if (process.env.FAKE_PI_MUTATE_FIXTURE === "1") {
  const before = readFileSync("state.txt", "utf8");
  const variant = skill === null ? "baseline" : "candidate";
  appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ kind: "fixture", variant, before, cwd: process.cwd() }) + "\\n");
  writeFileSync("state.txt", variant + " mutation\\n");
  if (skill === null && process.env.FAKE_PI_FIXTURE_SOURCE) {
    writeFileSync(process.env.FAKE_PI_FIXTURE_SOURCE, "source changed after baseline snapshot\\n");
  }
}
if (process.env.FAKE_PI_MUTATE_SKILL === "1" && skill !== null) {
  writeFileSync(skill + "/SKILL.md", "tampered snapshot\\n");
}
if (process.env.FAKE_PI_DESCENDANT_PID) {
  const descendant = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)"],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  await new Promise((resolve) => descendant.once("message", resolve));
  appendFileSync(process.env.FAKE_PI_DESCENDANT_PID, String(descendant.pid));
}
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
emit({ type: "session", version: 3, id: "fake-session", cwd: process.cwd() });
if (process.env.FAKE_PI_EXTENSION_ERROR === "1") {
  emit({
    type: "extension_error",
    extensionPath: "pi-guard.mjs",
    event: "load",
    error: "fake guard load failure",
  });
}
emit({ type: "agent_start" });
emit({ type: "turn_start" });
if (readSkill) {
  const target = readSkill + "/SKILL.md";
  emit({ type: "tool_execution_start", toolCallId: "read-target", toolName: "read", args: { path: target } });
  emit({ type: "tool_execution_end", toolCallId: "read-target", toolName: "read", result: { content: [{ type: "text", text: "skill" }] }, isError: false });
}
const message = {
  role: "assistant",
  content: [{ type: "text", text: skill ? "Candidate response" : "Baseline response" }],
  provider: "fake",
  model: "fake-model",
  usage: { input: 10, output: 4, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
  stopReason: skill !== null && process.env.FAKE_PI_ERROR_SKILL === "1" ? "error" : "stop",
  errorMessage: skill !== null && process.env.FAKE_PI_ERROR_SKILL === "1" ? "fake provider failure" : undefined
};
emit({ type: "message_end", message });
emit({ type: "turn_end", message, toolResults: [] });
emit({ type: "agent_end", messages: [message], willRetry: false });
if (fail) process.exitCode = 7;
else emit({ type: "agent_settled" });
if (process.env.FAKE_PI_CANCEL_PARENT === "1") process.kill(process.ppid, "SIGINT");
`,
  );
  await chmod(executable, 0o755);
  await writeFile(path.join(bin, "piflow"), await readFile(executable));
  await chmod(path.join(bin, "piflow"), 0o755);
  return bin;
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function descriptionGroup() {
  return {
    schema_version: 1,
    kind: "group",
    id: "natural-activation",
    type: "description",
    input: { prompt: "Help me decide how to ship this change." },
    fixture: null,
    tools: ["read"],
    variants: {
      baseline: {
        source: { kind: "working-tree" },
        skills: [],
        target: null,
        context: [],
      },
      candidate: {
        source: { kind: "working-tree" },
        skills: ["skills/release-route"],
        target: 0,
        context: [],
      },
    },
    expectations: [
      { id: "baseline-no-read", kind: "skill-read", variant: "baseline", expect: "never" },
      { id: "candidate-read", kind: "skill-read", variant: "candidate", expect: "by-turn", turn: 1 },
    ],
    review_questions: [],
    runtime: fakeRuntime(),
    model: { model: "fake/model", thinking: "low" },
  };
}

test("runtime bundles are snapshotted once between the base guard and final observer", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    await mkdir(path.join(root, "extensions"), { recursive: true });
    await mkdir(path.join(root, "support"), { recursive: true });
    await writeFile(path.join(root, "extensions/probe.mjs"), "export { marker } from '../support/marker.mjs';\n");
    await writeFile(path.join(root, "support/marker.mjs"), "export const marker = 'ok';\n");
    const group = descriptionGroup();
    group.runtime = fakeRuntime({
      extensions: [{ entry: "extensions/probe.mjs", resources: ["extensions", "support"] }],
    });
    const definition = await writeJson(root, "groups/extensions.json", group);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const runs = await Promise.all(
      ["baseline", "candidate"].map(async (variant) =>
        parseJson(
          await readFile(path.join(resultDirectory, `groups/natural-activation/${variant}/run.json`), "utf8"),
          `${variant} extension run`,
        ),
      ),
    );
    for (const run of runs) {
      const bundle = run.resources.runtime.extensions[0];
      assert.equal(bundle.resources.length, 2);
      assert.equal(bundle.resources[0].declaredPath, "extensions");
      assert.equal(bundle.resources[1].declaredPath, "support");
      assert.equal(bundle.resources[1].files[0].path, "marker.mjs");
      assert.match(bundle.entry, /resources\/runtime\/extensions\/0\/extensions\/probe\.mjs$/);
    }
    assert.deepEqual(
      runs[0].resources.runtime.extensions[0].resources.map((resource) => resource.files),
      runs[1].resources.runtime.extensions[0].resources.map((resource) => resource.files),
    );
    for (const run of runs) {
      const guardIndex = run.process.args.findIndex((value) => /pi-guard\.mjs$/.test(value));
      const bundleIndex = run.process.args.findIndex((value) =>
        /resources\/runtime\/extensions\/0\/extensions\/probe\.mjs$/.test(value),
      );
      const observerIndex = run.process.args.findIndex((value) => /pi-observer\.mjs$/.test(value));
      assert.ok(guardIndex >= 0);
      assert.ok(bundleIndex > guardIndex);
      assert.equal(observerIndex, -1);
    }
  });
});

test("inherited runtime environment reaches the child without entering run evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const group = descriptionGroup();
    group.runtime = fakeRuntime({ session: true, inherit: ["EVAL_SECRET"] });
    const definition = await writeJson(root, "groups/inherited-environment.json", group);
    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_CAPTURE_ENV: "EVAL_SECRET",
        EVAL_SECRET: "do-not-persist-this-value",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const log = (await readFile(fakeLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => parseJson(line, "inherited environment log"));
    assert.equal(log[0].inheritedValue, "do-not-persist-this-value");
    const runText = await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8");
    assert.doesNotMatch(runText, /do-not-persist-this-value/);
    const run = parseJson(runText, "inherited environment run");
    assert.deepEqual(run.resources.runtime.environment, {
      literal: {},
      inherit: [...new Set([...FAKE_PI_ENVIRONMENT_KEYS, "EVAL_SECRET"])],
    });
    assert.equal(run.resources.runtime.session, true);
    assert.ok(run.process.args.includes("--session-dir"));
    assert.equal(run.process.args.includes("--no-session"), false);
  });
});

test("undeclared parent environment values stay out of the subject process", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/undeclared-environment.json", descriptionGroup());
    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_CAPTURE_ENV: "UNDECLARED_SECRET",
        UNDECLARED_SECRET: "must-not-reach-subject",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const log = (await readFile(fakeLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => parseJson(line, "undeclared environment log"));
    assert.equal(log[0].inheritedValue, null);
  });
});

test("forbidden native tools are rejected even when an extension is declared", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    const group = descriptionGroup();
    group.tools = ["bash", "powershell"];
    group.runtime = fakeRuntime({
      extensions: [{ entry: "extensions/probe.mjs", resources: ["extensions"] }],
    });
    const definition = await writeJson(root, "groups/forbidden-tool.json", group);
    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not support native tools: bash, powershell/);
    await assert.rejects(readFile(fakeLog, "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(root, ".skill-eval/runs"), "utf8"), { code: "ENOENT" });
  });
});

test("description groups reject custom tools even when an extension is declared", async () => {
  await withTempDirectory(async (root) => {
    const group = descriptionGroup();
    group.tools = ["custom_probe"];
    group.runtime = fakeRuntime({
      extensions: [{ entry: "extensions/probe.mjs", resources: ["extensions"] }],
    });
    const definition = await writeJson(root, "groups/description-custom-tool.json", group);
    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not support custom tools: custom_probe/);
    await assert.rejects(readFile(path.join(root, ".skill-eval/runs"), "utf8"), { code: "ENOENT" });
  });
});

test("required context observations fail the subject when the observer artifact is missing", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const group = descriptionGroup();
    group.expectations = [
      {
        id: "context-observed",
        kind: "context-text",
        variant: "candidate",
        turn: 1,
        expect: "contains",
        value: "context",
      },
    ];
    const definition = await writeJson(root, "groups/missing-context-observer.json", group);
    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const run = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "missing observer run",
    );
    assert.equal(run.state, "infrastructure-failed");
  });
});

test("fixture copies are fresh per variant and preserve declared materialization evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    await mkdir(path.join(root, "fixtures/project"), { recursive: true });
    await writeFile(path.join(root, "fixtures/project/state.txt"), "seed\n");
    const group = descriptionGroup();
    group.fixture = "fixtures/project";
    const definition = await writeJson(root, "groups/fixture.json", group);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_MUTATE_FIXTURE: "1",
        FAKE_PI_FIXTURE_SOURCE: path.join(root, "fixtures/project/state.txt"),
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const logContents = await readFile(fakeLog, "utf8");
    const log = logContents
      .trim()
      .split("\n")
      .map((line) => parseJson(line, "fake Pi log"));
    assert.deepEqual(
      log.filter((entry) => entry.kind === "fixture").map(({ variant, before }) => ({ variant, before })),
      [
        { variant: "baseline", before: "seed\n" },
        { variant: "candidate", before: "seed\n" },
      ],
    );

    const runs = await Promise.all(
      ["baseline", "candidate"].map(async (variant) =>
        parseJson(
          await readFile(path.join(resultDirectory, `groups/natural-activation/${variant}/run.json`), "utf8"),
          `${variant} fixture run`,
        ),
      ),
    );
    assert.notEqual(runs[0].workspace, runs[1].workspace);
    assert.equal(runs[0].resources.fixture.declaredPath, "fixtures/project");
    assert.equal(runs[1].resources.fixture.declaredPath, "fixtures/project");
    assert.deepEqual(runs[0].resources.fixture.files, runs[1].resources.fixture.files);
    assert.equal(await readFile(path.join(runs[0].workspace, "state.txt"), "utf8"), "baseline mutation\n");
    assert.equal(await readFile(path.join(runs[1].workspace, "state.txt"), "utf8"), "candidate mutation\n");
    assert.equal(
      await readFile(path.join(root, "fixtures/project/state.txt"), "utf8"),
      "source changed after baseline snapshot\n",
    );
  });
});

test("immutable declared resources are verified after subject execution", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/immutable.json", descriptionGroup());
    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_MUTATE_SKILL: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const run = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "mutated resource run",
    );
    assert.equal(run.state, "infrastructure-failed");
    assert.equal(run.process.protocolErrors.at(-1)?.reason, "immutable-resource-changed");
    assert.match(run.process.protocolErrors.at(-1)?.message, /declared skill changed during subject execution/);
    assert.match(await readFile(path.join(root, "skills/release-route/SKILL.md"), "utf8"), /name: release-route/);
  });
});

test("Git-backed skill snapshots use the exact commit and preserve unusual valid paths", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    const unusualSkill = "skills/release route\tline\nbreak";
    const unusualContext = "runtime/context with space\tline\nbreak.md";
    await writeSkill(root, unusualSkill, {
      name: "release-route",
      description: "Use the committed release contract.",
    });
    await mkdir(path.dirname(path.join(root, unusualContext)), { recursive: true });
    await writeFile(path.join(root, unusualContext), "Committed context only.\n");
    runGit(root, ["init", "--quiet"]);
    runGit(root, ["config", "user.email", "skill-eval@example.test"]);
    runGit(root, ["config", "user.name", "Skill Eval"]);
    runGit(root, ["add", "--", "."]);
    runGit(root, ["commit", "--quiet", "-m", "fixture"]);
    const commit = runGit(root, ["rev-parse", "HEAD"]);
    await writeSkill(root, unusualSkill, {
      name: "release-route",
      description: "This working-tree mutation must not enter the snapshot.",
    });
    await writeFile(path.join(root, unusualContext), "Mutated working-tree context.\n");

    const group = descriptionGroup();
    group.variants.candidate.source = { kind: "git", ref: commit };
    group.variants.candidate.skills = [unusualSkill];
    group.variants.candidate.context = [unusualContext];
    const definition = await writeJson(root, "groups/git-source.json", group);
    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const run = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "Git-backed run",
    );
    assert.deepEqual(run.resources.source, { kind: "git", ref: commit, commit });
    assert.equal(run.resources.skills[0].declaredPath, unusualSkill);
    assert.equal(run.resources.context[0].declaredPath, unusualContext);
    const snapshottedSkill = await readFile(path.join(run.resources.skills[0].path, "SKILL.md"), "utf8");
    assert.match(snapshottedSkill, /Use the committed release contract\./);
    assert.doesNotMatch(snapshottedSkill, /working-tree mutation/);
    const contextManifest = parseJson(
      await readFile(run.resources.contextDelivery.manifestPath, "utf8"),
      "Git-backed context manifest",
    );
    assert.equal(contextManifest.entries[0].files[0].content, "Committed context only.\n");
    assert.equal(run.activation.targetRead, true);
  });
});

test("Git-backed resource symlink escapes fail closed before Pi starts", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use the committed release contract.",
    });
    await symlink("../../../outside.md", path.join(root, "skills/release-route/escaped.md"));
    runGit(root, ["init", "--quiet"]);
    runGit(root, ["config", "user.email", "skill-eval@example.test"]);
    runGit(root, ["config", "user.name", "Skill Eval"]);
    runGit(root, ["add", "--", "."]);
    runGit(root, ["commit", "--quiet", "-m", "escaping fixture"]);
    const commit = runGit(root, ["rev-parse", "HEAD"]);
    const group = descriptionGroup();
    group.variants.candidate.source = { kind: "git", ref: commit };
    const definition = await writeJson(root, "groups/git-escape.json", group);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const run = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "Git symlink escape run",
    );
    assert.equal(run.state, "invalid");
    assert.match(run.error.message, /resource symlink escapes its declared root/);
    await assert.rejects(readFile(fakeLog, "utf8"), { code: "ENOENT" });
  });
});

test(
  "forced cleanup kills subject descendants that outlive the Pi parent",
  { skip: process.platform === "win32" },
  async () => {
    await withTempDirectory(async (root) => {
      const fakeLog = path.join(root, "fake-pi.jsonl");
      const descendantPidFile = path.join(root, "descendant.pid");
      const bin = await installFakePi(root);
      await writeSkill(root, "skills/release-route", {
        name: "release-route",
        description: "Use when choosing how to deliver a completed software change.",
      });
      const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

      const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
          FAKE_PI_LOG: fakeLog,
          FAKE_PI_CANCEL_PARENT: "1",
          FAKE_PI_DESCENDANT_PID: descendantPidFile,
        },
      });

      const descendantPid = Number(await readFile(descendantPidFile, "utf8"));
      try {
        assert.equal(result.status, 1, result.stderr);
        assert.equal(processExists(descendantPid), false, `descendant ${descendantPid} survived cleanup`);
      } finally {
        if (processExists(descendantPid)) process.kill(descendantPid, "SIGKILL");
      }
    });
  },
);

test("each run and grade is persisted before the next selected work starts", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const first = descriptionGroup();
    first.id = "first-order";
    const second = descriptionGroup();
    second.id = "second-order";
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/second.json", second);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "persistence-order-suite",
      groups: ["groups/first.json", "groups/second.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_REQUIRE_BASELINE_RUN: "1",
        FAKE_PI_REQUIRE_PRIOR_FOR: "second-order",
        FAKE_PI_PRIOR_GROUP: "first-order",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.equal(summary.state, "complete");
    const log = (await readFile(fakeLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => parseJson(line, "fake Pi log"));
    assert.equal(
      log.some((entry) => entry.kind === "missing-evidence"),
      false,
    );
    assert.equal(log.length, 4);
  });
});

test("ten-group suites run twenty isolated subjects serially in declared order", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const serialLock = path.join(root, "fake-pi.lock");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const references = /** @type {string[]} */ ([]);
    const expectedOrder = /** @type {string[]} */ ([]);
    for (let index = 1; index <= 10; index += 1) {
      const id = `batch-${String(index).padStart(2, "0")}`;
      const group = descriptionGroup();
      group.id = id;
      references.push(`groups/${id}.json`);
      expectedOrder.push(`${id}:baseline`, `${id}:candidate`);
      await writeJson(root, `groups/${id}.json`, group);
    }
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "ten-group-suite",
      groups: references,
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_SERIAL_LOCK: serialLock,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.equal(summary.state, "complete");
    assert.deepEqual(
      summary.groups.map(({ id, position }) => ({ id, position })),
      references.map((reference, index) => ({ id: path.basename(reference, ".json"), position: index + 1 })),
    );
    const log = (await readFile(fakeLog, "utf8"))
      .trim()
      .split("\n")
      .map((line) => parseJson(line, "fake Pi log"));
    assert.equal(
      log.some((entry) => entry.kind === "overlap"),
      false,
    );
    assert.equal(new Set(log.map((entry) => entry.pid)).size, 20);
    assert.equal(new Set(log.map((entry) => entry.cwd)).size, 20);
    assert.deepEqual(
      log.map((entry) => {
        const variantDirectory = path.dirname(entry.cwd);
        return `${path.basename(path.dirname(variantDirectory))}:${path.basename(variantDirectory)}`;
      }),
      expectedOrder,
    );
  });
});

test("ordinary failed checks keep the batch complete and do not stop later groups", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const failedCheck = descriptionGroup();
    failedCheck.id = "failed-check";
    failedCheck.expectations[1] = {
      id: "candidate-must-not-read",
      kind: "skill-read",
      variant: "candidate",
      expect: "never",
    };
    const later = descriptionGroup();
    later.id = "later-activation";
    await writeJson(root, "groups/failed-check.json", failedCheck);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "behavioral-failure-suite",
      groups: ["groups/failed-check.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.equal(summary.state, "complete");
    assert.deepEqual(
      summary.groups.map(({ id, state }) => ({ id, state })),
      [
        { id: "failed-check", state: "complete" },
        { id: "later-activation", state: "complete" },
      ],
    );
    const grade = parseJson(
      await readFile(path.join(resultDirectory, "groups/failed-check/deterministic-grade.json"), "utf8"),
      "failed deterministic grade",
    );
    assert.equal(grade.state, "complete");
    assert.equal(grade.checks.find((check) => check.id === "candidate-must-not-read")?.state, "fail");
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 4);
  });
});

test("grade errors preserve completed runs and do not stop later suite groups", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const gradeError = /** @type {any} */ (descriptionGroup());
    gradeError.id = "grade-error";
    gradeError.expectations = [
      {
        id: "description-response",
        kind: "response-text",
        variant: "candidate",
        expect: "contains",
        value: "Candidate",
      },
    ];
    const later = descriptionGroup();
    later.id = "later-activation";
    await writeJson(root, "groups/grade-error.json", gradeError);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "grade-error-suite",
      groups: ["groups/grade-error.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.deepEqual(
      summary.groups.map(({ id, state, grade }) => ({ id, state, grade })),
      [
        { id: "grade-error", state: "partially-complete", grade: "grade-error" },
        { id: "later-activation", state: "complete", grade: "complete" },
      ],
    );
    const completed = parseJson(
      await readFile(path.join(resultDirectory, "groups/grade-error/candidate/run.json"), "utf8"),
      "completed candidate",
    );
    assert.equal(completed.state, "complete");
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 4);
  });
});

test("variant-local setup failure preserves the safe counterpart and later groups", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const invalidCandidate = descriptionGroup();
    invalidCandidate.id = "invalid-candidate";
    invalidCandidate.variants.candidate.skills = ["skills/missing"];
    const later = descriptionGroup();
    later.id = "later-activation";
    await writeJson(root, "groups/invalid-candidate.json", invalidCandidate);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "variant-setup-suite",
      groups: ["groups/invalid-candidate.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.deepEqual(
      summary.groups.map(({ id, state }) => ({ id, state })),
      [
        { id: "invalid-candidate", state: "partially-complete" },
        { id: "later-activation", state: "complete" },
      ],
    );
    const baseline = parseJson(
      await readFile(path.join(resultDirectory, "groups/invalid-candidate/baseline/run.json"), "utf8"),
      "safe baseline",
    );
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/invalid-candidate/candidate/run.json"), "utf8"),
      "invalid candidate",
    );
    assert.equal(baseline.state, "complete");
    assert.equal(candidate.state, "invalid");
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 3);
  });
});

test("shared group setup failure is invalid and later suite groups still run", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const invalid = /** @type {any} */ (descriptionGroup());
    invalid.id = "invalid-fixture";
    invalid.fixture = "fixtures/missing";
    const later = descriptionGroup();
    later.id = "later-activation";
    await writeJson(root, "groups/invalid.json", invalid);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "shared-setup-suite",
      groups: ["groups/invalid.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.equal(summary.state, "partially-complete");
    assert.deepEqual(
      summary.groups.map(({ id, state }) => ({ id, state })),
      [
        { id: "invalid-fixture", state: "invalid" },
        { id: "later-activation", state: "complete" },
      ],
    );
    const invalidGroup = parseJson(
      await readFile(path.join(resultDirectory, "groups/invalid-fixture/group.json"), "utf8"),
      "invalid group",
    );
    assert.deepEqual(invalidGroup.variants, { baseline: "invalid", candidate: "invalid" });
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 2);
  });
});

test("variant persistence failure is recorded without stopping its counterpart or later groups", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const first = descriptionGroup();
    first.id = "persistence-failure";
    const later = descriptionGroup();
    later.id = "later-activation";
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "persistence-suite",
      groups: ["groups/first.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_BREAK_FINAL_FOR: path.join("groups", "persistence-failure", "candidate", "workspace"),
        FAKE_PI_FAIL_SKILL: "1",
        FAKE_PI_FAIL_FOR: path.join("groups", "persistence-failure", "candidate", "workspace"),
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.deepEqual(
      summary.groups.map(({ id, state }) => ({ id, state })),
      [
        { id: "persistence-failure", state: "partially-complete" },
        { id: "later-activation", state: "complete" },
      ],
    );
    const failedRunText = await readFile(
      path.join(resultDirectory, "groups/persistence-failure/candidate/run.json"),
      "utf8",
    );
    const failedRun = parseJson(failedRunText, "persistence-failed run");
    assert.equal(failedRun.state, "infrastructure-failed");
    assert.equal(failedRun.error.kind, "persistence");
    assert.match(failedRun.error.message, /final\.md/);
    assert.equal(failedRun.error.cause, null);
    assert.equal(failedRun.process.exitCode, 7);
    const grade = parseJson(
      await readFile(path.join(resultDirectory, "groups/persistence-failure/deterministic-grade.json"), "utf8"),
      "persistence-failure grade",
    );
    assert.equal(grade.evidence.candidate.sha256, createHash("sha256").update(failedRunText).digest("hex"));
    assert.equal(grade.checks.find((check) => check.variant === "candidate")?.state, "unavailable");
    const candidateFiles = await readdir(path.join(resultDirectory, "groups/persistence-failure/candidate"));
    assert.equal(
      candidateFiles.some((file) => file.endsWith(".tmp")),
      false,
    );
    const baseline = parseJson(
      await readFile(path.join(resultDirectory, "groups/persistence-failure/baseline/run.json"), "utf8"),
      "safe counterpart",
    );
    assert.equal(baseline.state, "complete");
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 4);
  });
});

test("recoverable grade and group persistence failures use fallback evidence and continue later groups", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const first = descriptionGroup();
    first.id = "post-processing-failure";
    const later = descriptionGroup();
    later.id = "later-activation";
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "post-processing-suite",
      groups: ["groups/first.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_BREAK_GROUP_ARTIFACTS_FOR: path.join("groups", "post-processing-failure", "candidate", "workspace"),
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.deepEqual(
      summary.groups.map(({ id, state, grade, artifacts }) => ({ id, state, grade, artifacts })),
      [
        {
          id: "post-processing-failure",
          state: "partially-complete",
          grade: "grade-error",
          artifacts: {
            grade: "deterministic-grade-error.json",
            group: "group-error.json",
          },
        },
        {
          id: "later-activation",
          state: "complete",
          grade: "complete",
          artifacts: {
            grade: "deterministic-grade.json",
            group: "group.json",
          },
        },
      ],
    );
    const groupDirectory = path.join(resultDirectory, "groups/post-processing-failure");
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade-error.json"), "utf8"),
      "fallback grade",
    );
    assert.equal(grade.state, "grade-error");
    assert.match(grade.errors.at(-1).reason, /persist deterministic-grade\.json/);
    const group = parseJson(await readFile(path.join(groupDirectory, "group-error.json"), "utf8"), "fallback group");
    assert.equal(group.state, "partially-complete");
    assert.match(group.errors.at(-1).message, /group\.json/);
    const view = spawnSync(process.execPath, [entrypoint, "view", resultDirectory], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Grade \[grade-error\]/);
    assert.match(view.stdout, /failed to persist deterministic-grade\.json/);
    assert.match(view.stdout, /failed to persist group\.json/);
    assert.match(view.stdout, /deterministic-grade-error\.json/);
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 4);
  });
});

test("unrecoverable grade fallback persistence stops queued work without claiming a batch result", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const first = descriptionGroup();
    first.id = "fatal-grade-persistence";
    const later = descriptionGroup();
    later.id = "must-not-start";
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "fatal-grade-suite",
      groups: ["groups/first.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_BREAK_GRADE_FALLBACK_FOR: path.join("groups", "fatal-grade-persistence", "candidate", "workspace"),
      },
    });

    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /^Path:/m);
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 2);
    const resultDirectories = await readdir(path.join(root, ".skill-eval/runs"));
    assert.equal(resultDirectories.length, 1);
    await assert.rejects(readFile(path.join(root, ".skill-eval/runs", resultDirectories[0], "summary.json"), "utf8"), {
      code: "ENOENT",
    });
  });
});

test("unrecoverable run persistence stops queued work without claiming a batch result", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const first = descriptionGroup();
    first.id = "fatal-persistence";
    const later = descriptionGroup();
    later.id = "must-not-start";
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/later.json", later);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "fatal-persistence-suite",
      groups: ["groups/first.json", "groups/later.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_BREAK_RUN_FOR: path.join("groups", "fatal-persistence", "baseline", "workspace"),
      },
    });

    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /^Path:/m);
    const invocations = (await readFile(fakeLog, "utf8")).trim().split("\n");
    assert.equal(invocations.length, 1);
    const runsRoot = path.join(root, ".skill-eval/runs");
    const resultDirectories = await readdir(runsRoot);
    assert.equal(resultDirectories.length, 1);
    const resultDirectory = path.join(runsRoot, resultDirectories[0]);
    assert.equal(await readFile(path.join(resultDirectory, "invocation.json"), "utf8").then(Boolean), true);
    await assert.rejects(readFile(path.join(resultDirectory, "summary.json"), "utf8"), { code: "ENOENT" });
  });
});

test("cancellation records queued variants and groups without starting more Pi subjects", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const first = descriptionGroup();
    first.id = "first-activation";
    const second = descriptionGroup();
    second.id = "second-activation";
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/second.json", second);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "cancel-suite",
      groups: ["groups/first.json", "groups/second.json"],
    });

    const result = spawnSync(process.execPath, [entrypoint, "run", suite], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_CANCEL_PARENT: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const invocationLog = await readFile(fakeLog, "utf8");
    const invocations = invocationLog.trim().split("\n");
    assert.equal(invocations.length, 1);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "summary");
    assert.equal(summary.state, "cancelled");
    const queuedRuns = [
      "groups/first-activation/candidate/run.json",
      "groups/second-activation/baseline/run.json",
      "groups/second-activation/candidate/run.json",
    ];
    for (const runPath of queuedRuns) {
      const queued = parseJson(await readFile(path.join(resultDirectory, runPath), "utf8"), runPath);
      assert.equal(queued.state, "cancelled");
      assert.equal(queued.process, undefined);
      assert.equal(queued.artifacts.events, null);
    }
  });
});

test("run rejects unsupported evaluation types before starting subjects or creating a result", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definitionValue = descriptionGroup();
    definitionValue.type = "end-to-end";
    const definition = await writeJson(root, "groups/end-to-end.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /supports description and body groups only/);
    await assert.rejects(readFile(fakeLog, "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(root, ".skill-eval/runs"), "utf8"), { code: "ENOENT" });
  });
});

test("one-shot description evaluation fails closed when the guard extension errors", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_EXTENSION_ERROR: "1",
      },
    });

    assert.equal(result.status, 1);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "candidate run",
    );
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.protocolErrors[0].reason, "extension-error");
    assert.equal(candidate.process.protocolErrors[0].error, "fake guard load failure");
  });
});

test("settled Pi provider errors are infrastructure failures even when JSON mode exits zero", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_ERROR_SKILL: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "candidate run",
    );
    assert.equal(candidate.process.exitCode, 0);
    assert.equal(candidate.process.settled, true);
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.assistantError, "fake provider failure");
  });
});

test("description activation counts only the exact canonical target SKILL.md", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/support", {
      name: "support",
      description: "Use when support context is needed.",
    });
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definitionValue = descriptionGroup();
    definitionValue.variants.candidate.skills = ["skills/support", "skills/release-route"];
    definitionValue.variants.candidate.target = 1;
    definitionValue.expectations = [
      { id: "target-not-read", kind: "skill-read", variant: "candidate", expect: "never" },
    ];
    const definition = await writeJson(root, "groups/natural-activation.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_READ_SKILL_INDEX: "0",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/natural-activation");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate run",
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );
    assert.equal(candidate.activation.targetRead, false);
    assert.match(candidate.activation.successfulReadPaths[0], /resources\/skills\/0\/SKILL\.md$/);
    assert.match(candidate.resources.targetPath, /resources\/skills\/1\/SKILL\.md$/);
    assert.notEqual(candidate.activation.successfulReadPaths[0], candidate.resources.targetPath);
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [{ id: "target-not-read", state: "pass" }],
    );
  });
});

test("one variant infrastructure failure preserves its evidence and the completed counterpart", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_PI_FAIL_SKILL: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /State: partially-complete/);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/natural-activation");
    const baseline = parseJson(await readFile(path.join(groupDirectory, "baseline/run.json"), "utf8"), "baseline run");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate run",
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );
    assert.equal(baseline.state, "complete");
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.exitCode, 7);
    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "baseline-no-read", state: "pass" },
        { id: "candidate-read", state: "unavailable" },
      ],
    );
    assert.equal(grade.evidence.candidate.sha256.length, 64);
  });
});

test("grade errors remain separate from completed subject evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definitionValue = descriptionGroup();
    definitionValue.expectations = [
      { id: "future-check", kind: "path-exists", path: "result.json" },
      {
        id: "description-response",
        kind: "response-text",
        variant: "candidate",
        expect: "contains",
        value: "Candidate",
      },
    ];
    const definition = await writeJson(root, "groups/natural-activation.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/natural-activation");
    const candidateRunText = await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8");
    const candidate = parseJson(candidateRunText, "candidate run");
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );
    assert.equal(candidate.state, "complete");
    assert.equal(grade.state, "grade-error");
    assert.deepEqual(grade.errors, [
      { id: "future-check", reason: "unsupported expectation kind: path-exists" },
      { id: "description-response", reason: "invalid response-text expectation" },
    ]);
    assert.equal(grade.evidence.candidate.sha256, createHash("sha256").update(candidateRunText).digest("hex"));
  });
});

test("suite group and variant selectors preserve original position through run and view", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/first-route", {
      name: "first-route",
      description: "Use when choosing the first route.",
    });
    await writeSkill(root, "skills/second-route", {
      name: "second-route",
      description: "Use when choosing the second route.",
    });
    const first = descriptionGroup();
    first.id = "first-activation";
    first.variants.candidate.skills = ["skills/first-route"];
    first.expectations = [{ id: "first-read", kind: "skill-read", variant: "candidate", expect: "by-turn", turn: 1 }];
    const second = descriptionGroup();
    second.id = "second-activation";
    second.variants.candidate.skills = ["skills/second-route"];
    second.expectations = [{ id: "second-read", kind: "skill-read", variant: "candidate", expect: "by-turn", turn: 1 }];
    await writeJson(root, "groups/first.json", first);
    await writeJson(root, "groups/second.json", second);
    const suite = await writeJson(root, "suite.json", {
      schema_version: 1,
      kind: "suite",
      id: "activation-suite",
      groups: ["groups/first.json", "groups/second.json"],
    });
    const environment = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_PI_LOG: fakeLog,
    };

    const run = spawnSync(process.execPath, [entrypoint, "run", suite, "--group", "2", "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: environment,
    });
    assert.equal(run.status, 0, run.stderr);
    const resultDirectory = run.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const summary = parseJson(await readFile(path.join(resultDirectory, "summary.json"), "utf8"), "suite summary");
    assert.deepEqual(
      summary.groups.map(({ id, position }) => ({ id, position })),
      [{ id: "second-activation", position: 2 }],
    );
    const baseline = parseJson(
      await readFile(path.join(resultDirectory, "groups/second-activation/baseline/run.json"), "utf8"),
      "unselected baseline",
    );
    assert.equal(baseline.state, "not-selected");
    const fakeInvocations = await readFile(fakeLog, "utf8");
    assert.equal(fakeInvocations.trim().split("\n").length, 1);

    const view = spawnSync(
      process.execPath,
      [entrypoint, "view", resultDirectory, "--group", "2", "--variant", "candidate"],
      { cwd: root, encoding: "utf8", env: environment },
    );
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Group second-activation \[complete\]/);
    assert.doesNotMatch(view.stdout, /first-activation/);
  });
});

test("view renders a direct result grade-first and filters one variant", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());
    const environment = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_PI_LOG: fakeLog,
    };
    const run = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: environment,
    });
    assert.equal(run.status, 0, run.stderr);
    const resultDirectory = run.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);

    const view = spawnSync(process.execPath, [entrypoint, "view", resultDirectory, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: environment,
    });

    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Group natural-activation \[complete\]/);
    assert.match(view.stdout, /check\s+candidate-read\s+candidate\s+skill-read\s+pass/);
    assert.match(view.stdout, /Candidate \[complete\]/);
    assert.match(view.stdout, /Candidate response/);
    assert.doesNotMatch(view.stdout, /Baseline \[/);
    assert.ok(view.stdout.indexOf("candidate-read") < view.stdout.indexOf("Candidate response"));
    assert.match(view.stdout, /definition\.json/);
    assert.match(view.stdout, /deterministic-grade\.json/);
    assert.match(view.stdout, /candidate\/run\.json/);
    assert.match(view.stdout, /candidate\/events\.jsonl/);
    assert.match(view.stdout, /candidate\/transcript\.json/);
    assert.match(view.stdout, /candidate\/final\.md/);
    assert.match(view.stdout, /candidate\/stderr\.log/);
  });
});

test("omitted runtime defaults to an explicit non-session profile", async () => {
  await withTempDirectory(async (root) => {
    const bin = await installFakePi(root);
    const group = descriptionGroup();
    delete group.runtime;
    group.expectations = [];
    await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/default-runtime.json", group);
    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const run = parseJson(
      await readFile(path.join(resultDirectory, "groups/natural-activation/candidate/run.json"), "utf8"),
      "default runtime run",
    );
    assert.deepEqual(run.resources.runtime, {
      host: "pi",
      session: false,
      environment: { literal: {}, inherit: [] },
      extensions: [],
    });
    assert.equal(run.process.command, "pi");
    assert.ok(run.process.args.includes("--no-session"));
  });
});

test("run persists isolated one-shot description evidence before deterministic activation grades", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakePi(root);
    const skill = await writeSkill(root, "skills/release-route", {
      name: "release-route",
      description: "Use when choosing how to deliver a completed software change.",
    });
    const definition = await writeJson(root, "groups/natural-activation.json", descriptionGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Result: .+\nPath: .+\nState: complete\n$/);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);

    const fakeInvocations = await readFile(fakeLog, "utf8");
    const invocations = fakeInvocations
      .trim()
      .split("\n")
      .map((line, index) => parseJson(line, `fake Pi invocation ${index + 1}`));
    assert.equal(invocations.length, 2);
    assert.notEqual(invocations[0].cwd, invocations[1].cwd);
    for (const invocation of invocations) {
      assert.ok(invocation.args.includes("--no-extensions"));
      assert.ok(invocation.args.includes("--no-skills"));
      assert.ok(invocation.args.includes("--no-prompt-templates"));
      assert.ok(invocation.args.includes("--no-themes"));
      assert.ok(invocation.args.includes("--no-context-files"));
      assert.ok(invocation.args.includes("--no-session"));
      assert.equal(invocation.args.at(-1), descriptionGroup().input.prompt);
      assert.doesNotMatch(invocation.args.at(-1), /release-route|\/skill:/);
      assert.ok(invocation.allowedRoots.includes(invocation.cwd));
    }
    assert.equal(invocations[0].args.includes("--skill"), false);
    const candidateSkill = invocations[1].args[invocations[1].args.indexOf("--skill") + 1];
    assert.notEqual(candidateSkill, skill);
    assert.match(candidateSkill, /candidate\/resources\/skills\/0$/);
    assert.ok(invocations[1].allowedRoots.includes(candidateSkill));

    const groupDirectory = path.join(resultDirectory, "groups", "natural-activation");
    const baselineRunText = await readFile(path.join(groupDirectory, "baseline", "run.json"), "utf8");
    const candidateRunText = await readFile(path.join(groupDirectory, "candidate", "run.json"), "utf8");
    const baselineRun = parseJson(baselineRunText, "baseline run");
    const candidateRun = parseJson(candidateRunText, "candidate run");
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );

    assert.equal(baselineRun.state, "complete");
    assert.equal(baselineRun.activation.targetRead, false);
    assert.equal(candidateRun.state, "complete");
    assert.equal(candidateRun.activation.targetRead, true);
    assert.deepEqual(candidateRun.activation.readTurns, [1]);
    assert.equal(candidateRun.response, "Candidate response");
    assert.equal(grade.state, "complete");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "baseline-no-read", state: "pass" },
        { id: "candidate-read", state: "pass" },
      ],
    );
    assert.equal(grade.evidence.baseline.sha256, createHash("sha256").update(baselineRunText).digest("hex"));
    assert.equal(grade.evidence.candidate.sha256, createHash("sha256").update(candidateRunText).digest("hex"));
    assert.deepEqual(
      candidateRun.resources.skills[0].files.map((file) => file.path),
      ["SKILL.md"],
    );
    assert.ok(await readFile(path.join(groupDirectory, "baseline", "events.jsonl"), "utf8"));
    assert.equal(await readFile(path.join(groupDirectory, "candidate", "final.md"), "utf8"), "Candidate response\n");
  });
});
