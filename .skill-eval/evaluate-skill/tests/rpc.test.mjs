import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-skill/scripts/skill-eval.mjs", import.meta.url));

async function withTempDirectory(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "skill-eval-rpc-test-"));
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

async function readJsonLines(file, label) {
  const contents = await readFile(file, "utf8");
  return contents
    .trim()
    .split("\n")
    .map((line, index) => parseJson(line, `${label} line ${index + 1}`));
}

async function writeSkill(root, relativePath, name = "release-route") {
  const directory = path.join(root, relativePath);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when ${name} guidance is needed.\n---\n\n# ${name}\n`,
  );
  return realpath(directory);
}

async function installFakeRpcPi(root) {
  const bin = path.join(root, "bin");
  const executable = path.join(bin, "pi");
  await mkdir(bin, { recursive: true });
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const skills = args.flatMap((arg, index) => arg === "--skill" ? [args[index + 1]] : []);
const log = (value) => appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify(value) + "\\n");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
log({ kind: "spawn", args, cwd: process.cwd(), allowedRoots: JSON.parse(process.env.SKILL_EVAL_ALLOWED_ROOTS), contextManifest: process.env.SKILL_EVAL_CONTEXT_MANIFEST ?? null });
if (process.env.FAKE_RPC_EXTENSION_ERROR === "1") {
  emit({
    type: "extension_error",
    extensionPath: "pi-guard.mjs",
    event: "load",
    error: "fake guard load failure",
  });
}
if (process.env.FAKE_RPC_EXIT_ON_START === "1") process.exit(9);
if (process.env.FAKE_RPC_DESCENDANT_PID) {
  const descendant = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)"],
    { stdio: ["ignore", "ignore", "ignore", "ipc"] },
  );
  await new Promise((resolve) => descendant.once("message", resolve));
  appendFileSync(process.env.FAKE_RPC_DESCENDANT_PID, String(descendant.pid));
}
let buffer = "";
let turn = 0;
let active = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf("\\n");
    if (newline === -1) break;
    let line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line.endsWith("\\r")) line = line.slice(0, -1);
    if (line === "") continue;
    const command = JSON.parse(line);
    log({ kind: "command", command });
    if (command.type === "prompt" && process.env.FAKE_RPC_EMPTY_FRAME === "1") process.stdout.write("\\n");
    if (command.type === "prompt" && process.env.FAKE_RPC_INVALID_FRAME === "1") {
      process.stdout.write(JSON.stringify({ type: "response", id: command.id, command: command.type, success: true }) + "\\u2028" + JSON.stringify({ type: "agent_start" }) + "\\n");
      continue;
    }
    const responseId = command.type === "prompt" && process.env.FAKE_RPC_WRONG_ID === "1" ? "wrong-id" : command.id;
    const response = { type: "response", id: responseId, command: command.type, success: true };
    if (command.type === "get_commands") {
      response.data = {
        commands: skills.map((skill) => ({
          name: "skill:" + (readFileSync(skill + "/SKILL.md", "utf8").match(/^name: (.+)$/m)?.[1] ?? "unknown"),
          source: "skill",
          sourceInfo: { path: process.env.FAKE_RPC_COMMAND_PATH ?? skill + "/SKILL.md" },
        })),
      };
    }
    emit(response);
    if (command.type !== "prompt" || responseId !== command.id) continue;
    if (active) log({ kind: "overlap", turn: turn + 1 });
    active = true;
    turn += 1;
    if (process.env.FAKE_RPC_CANCEL_PARENT === "1") {
      process.kill(process.ppid, "SIGINT");
      continue;
    }
    if (process.env.FAKE_RPC_INCOMPLETE_FRAME === "1") {
      const exit = () => setTimeout(() => process.exit(0), 100);
      if (process.stdout.write("x".repeat(17 * 1024 * 1024))) exit();
      else process.stdout.once("drain", exit);
      continue;
    }
    emit({ type: "agent_start" });
    emit({ type: "turn_start" });
    if (command.message.startsWith("/skill:release-route ") && process.env.FAKE_RPC_WRITE_EFFECT === "1") {
      emit({
        type: "tool_execution_start",
        toolCallId: "write-effect",
        toolName: "write",
        args: { path: "result.txt", content: "candidate effect\\n" },
      });
      writeFileSync("result.txt", "candidate effect\\n");
      emit({
        type: "tool_execution_end",
        toolCallId: "write-effect",
        toolName: "write",
        result: { content: [{ type: "text", text: "wrote result.txt" }] },
        isError: false,
      });
    }
    if (process.env.FAKE_RPC_TURN_EFFECTS === "1" && skills.length > 0) {
      if (turn === 1) writeFileSync("intermediate.txt", "turn one\\n");
      if (turn === 2) unlinkSync("intermediate.txt");
    }
    if (process.env.FAKE_RPC_DIRECTORY_EFFECTS === "1" && skills.length > 0) {
      if (turn === 1) mkdirSync("empty");
      if (turn === 2) rmdirSync("empty");
    }
    if (process.env.FAKE_RPC_GRADING_FIXTURE === "1" && skills.length > 0 && turn === 1) {
      writeFileSync("data.json", JSON.stringify({ present: null, status: "ready" }) + "\\n");
      writeFileSync("report.txt", "success\\n");
    }
    if ((turn === 2 || process.env.FAKE_RPC_EXIT_BEFORE_SETTLEMENT === "1") && skills[0]) {
      const target = skills[0] + "/SKILL.md";
      emit({ type: "tool_execution_start", toolCallId: "read-" + turn, toolName: "read", args: { path: target } });
      emit({ type: "tool_execution_end", toolCallId: "read-" + turn, toolName: "read", result: { content: [{ type: "text", text: "skill" }] }, isError: false });
    }
    const providerError = process.env.FAKE_RPC_PROVIDER_ERROR === "1" && turn === 1;
    const responseText = process.env.FAKE_RPC_SPLIT_UTF8 === "1"
      ? "Exact 😀 evidence"
      : command.message.startsWith("/skill:release-route ")
        ? "Candidate body response"
        : "Turn " + turn + " response";
    const message = {
      role: "assistant",
      content: [{ type: "text", text: responseText }],
      provider: "fake",
      model: "fake-model",
      usage: { input: turn * 10, output: turn * 4, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
      stopReason: providerError ? "error" : "stop",
      errorMessage: providerError ? "fake provider failure" : undefined
    };
    const finishTurn = () => {
      emit({ type: "turn_end", message, toolResults: [] });
      emit({ type: "agent_end", messages: [message], willRetry: false });
      log({ kind: "settled", turn });
      emit({ type: "agent_settled" });
      active = false;
    };
    if (process.env.FAKE_RPC_SPLIT_UTF8 === "1") {
      const encoded = Buffer.from(JSON.stringify({ type: "message_end", message }) + "\\n");
      const marker = encoded.indexOf(Buffer.from("😀"));
      process.stdout.write(encoded.subarray(0, marker + 2));
      setTimeout(() => {
        process.stdout.write(encoded.subarray(marker + 2));
        finishTurn();
      }, 10);
      continue;
    }
    emit({ type: "message_end", message });
    if (process.env.FAKE_RPC_EXIT_BEFORE_SETTLEMENT === "1") {
      emit({ type: "turn_end", message, toolResults: [] });
      emit({ type: "agent_end", messages: [message], willRetry: false });
      setTimeout(() => process.exit(7), 10);
      continue;
    }
    finishTurn();
  }
});
`,
  );
  await chmod(executable, 0o755);
  return bin;
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

function multiTurnGroup() {
  return {
    schema_version: 1,
    kind: "group",
    id: "multi-turn-activation",
    type: "description",
    input: { turns: ["Help me prepare this change.", "How should I deliver it now?"] },
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
      { id: "never-read", kind: "skill-read", variant: "candidate", expect: "never" },
      { id: "read-on-two", kind: "skill-read", variant: "candidate", expect: "on-turn", turn: 2 },
      { id: "read-by-two", kind: "skill-read", variant: "candidate", expect: "by-turn", turn: 2 },
      {
        id: "not-before-two",
        kind: "skill-read",
        variant: "candidate",
        expect: "not-before-turn",
        turn: 2,
      },
    ],
    review_questions: [],
    model: { model: "fake/model", thinking: "low" },
  };
}

function bodyGroup() {
  return {
    schema_version: 1,
    kind: "group",
    id: "body-behavior",
    type: "body",
    input: { prompt: "Apply the delivery guidance to this change." },
    fixture: null,
    tools: [],
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
    expectations: [],
    review_questions: ["Did the response follow the supplied delivery constraints?"],
    model: { model: "fake/model", thinking: "low" },
  };
}

test("body evaluation explicitly delivers only the selected target body and preserves review evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definition = await writeJson(root, "groups/body.json", bodyGroup());

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

    const log = await readJsonLines(fakeLog, "fake Pi log");
    const prompts = log
      .filter((entry) => entry.kind === "command" && entry.command.type === "prompt")
      .map((entry) => entry.command.message);
    assert.deepEqual(prompts, [
      "Apply the delivery guidance to this change.",
      "/skill:release-route Apply the delivery guidance to this change.",
    ]);
    assert.ok(prompts.every((prompt) => !prompt.includes("Did the response follow")));

    const baseline = parseJson(
      await readFile(path.join(resultDirectory, "groups/body-behavior/baseline/run.json"), "utf8"),
      "baseline body run",
    );
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/body-behavior/candidate/run.json"), "utf8"),
      "candidate body run",
    );
    assert.equal(baseline.evaluationType, "body");
    assert.equal(candidate.evaluationType, "body");
    assert.deepEqual(baseline.delivery, { kind: "natural-prompt", turn: 1, targetPath: null });
    assert.equal(candidate.delivery.kind, "explicit-skill-command");
    assert.equal(candidate.delivery.turn, 1);
    assert.match(candidate.delivery.targetPath, /resources\/skills\/0\/SKILL\.md$/);
    assert.equal(candidate.response, "Candidate body response");
    assert.equal(candidate.activation, undefined);

    const viewed = spawnSync(process.execPath, [entrypoint, "view", resultDirectory], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(viewed.status, 0, viewed.stderr);
    assert.match(viewed.stdout, /Review questions:\n {2}- Did the response follow the supplied delivery constraints\?/);
    assert.match(viewed.stdout, /delivery: explicit-skill-command on turn 1/);
    assert.match(viewed.stdout, /Candidate body response/);
    assert.doesNotMatch(viewed.stdout, /target-read:/);
  });
});

test("body evaluation preserves ordered multi-skill and declared-context materialization", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/support", "support-guidance");
    await writeSkill(root, "skills/release-route");
    await mkdir(path.join(root, "runtime"), { recursive: true });
    await writeFile(path.join(root, "runtime/interaction-contract.md"), "Preserve the declared rollback boundary.\n");
    const group = bodyGroup();
    group.variants.candidate.skills = ["skills/support", "skills/release-route"];
    group.variants.candidate.target = 1;
    group.variants.candidate.context = ["runtime/interaction-contract.md"];
    const definition = await writeJson(root, "groups/body-environment.json", group);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
      },
    });

    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory, `${result.stderr}\n${result.stdout}`);
    const failedRun =
      result.status === 0
        ? ""
        : await readFile(path.join(resultDirectory, "groups/body-behavior/candidate/run.json"), "utf8");
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}\n${failedRun}`);
    const log = await readJsonLines(fakeLog, "multi-skill fake Pi log");
    const spawn = log.find((entry) => entry.kind === "spawn");
    const skillPaths = spawn.args.flatMap((arg, index) => (arg === "--skill" ? [spawn.args[index + 1]] : []));
    assert.deepEqual(
      skillPaths.map((skillPath) => path.basename(skillPath)),
      ["0", "1"],
    );
    assert.ok(spawn.contextManifest);
    assert.equal(spawn.allowedRoots.length, 4);
    const prompt = log.find((entry) => entry.kind === "command" && entry.command.type === "prompt")?.command.message;
    assert.equal(prompt, "/skill:release-route Apply the delivery guidance to this change.");

    const run = parseJson(
      await readFile(path.join(resultDirectory, "groups/body-behavior/candidate/run.json"), "utf8"),
      "multi-skill body run",
    );
    assert.deepEqual(
      run.resources.skills.map((skill) => skill.declaredPath),
      ["skills/support", "skills/release-route"],
    );
    assert.equal(run.resources.targetPath, path.join(run.resources.skills[1].path, "SKILL.md"));
    assert.deepEqual(
      run.resources.context.map((entry) => entry.declaredPath),
      ["runtime/interaction-contract.md"],
    );
    assert.equal(run.resources.contextDelivery.kind, "system-prompt");
    assert.equal(run.resources.contextDelivery.manifestPath, spawn.contextManifest);
    assert.match(run.resources.contextDelivery.sha256, /^[a-f0-9]{64}$/);
  });
});

test("multi-skill body evaluation fails before prompting when the target command name is ambiguous", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/support", "release-route");
    await writeSkill(root, "skills/release-route", "release-route");
    const group = bodyGroup();
    group.variants.candidate.skills = ["skills/support", "skills/release-route"];
    group.variants.candidate.target = 1;
    const definition = await writeJson(root, "groups/body-ambiguous.json", group);

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
      await readFile(path.join(resultDirectory, "groups/body-behavior/candidate/run.json"), "utf8"),
      "ambiguous body run",
    );
    assert.equal(run.state, "infrastructure-failed");
    assert.match(run.process.protocolErrors[0].message, /ambiguous target skill command/);
    const log = await readJsonLines(fakeLog, "ambiguous command log");
    assert.equal(
      log.some((entry) => entry.kind === "command" && entry.command.type === "prompt"),
      false,
    );
  });
});

test("body evaluation fails closed before prompting when the guard extension errors", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definitionValue = bodyGroup();
    definitionValue.tools = ["write"];
    const definition = await writeJson(root, "groups/body-guard.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_EXTENSION_ERROR: "1",
      },
    });

    assert.equal(result.status, 1);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/body-behavior/candidate/run.json"), "utf8"),
      "candidate body run",
    );
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.protocolErrors[0].reason, "extension-error");
    assert.equal(candidate.process.protocolErrors[0].error, "fake guard load failure");
    const log = await readJsonLines(fakeLog, "fake Pi log");
    assert.equal(
      log.some((entry) => entry.kind === "command" && entry.command.type === "prompt"),
      false,
    );
  });
});

test("body evaluation fails before prompting when Pi cannot identify the exact target command", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definition = await writeJson(root, "groups/body-command.json", bodyGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_COMMAND_PATH: path.join(root, "missing/SKILL.md"),
      },
    });

    assert.equal(result.status, 1);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/body-behavior/candidate/run.json"), "utf8"),
      "candidate body run",
    );
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.delivery.kind, "unavailable");
    assert.match(candidate.delivery.targetPath, /resources\/skills\/0\/SKILL\.md$/);
    assert.equal(candidate.process.protocolErrors[0].reason, "operation-failed");
    assert.match(candidate.process.protocolErrors[0].message, /did not register the exact target skill command/);
    const log = await readJsonLines(fakeLog, "fake Pi log");
    assert.equal(
      log.some((entry) => entry.kind === "command" && entry.command.type === "prompt"),
      false,
    );
  });
});

test("multi-turn body evaluation explicitly loads each previous and updated snapshot on only the first turn", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-v1");
    await writeSkill(root, "skills/release-v2");
    const definitionValue = bodyGroup();
    definitionValue.input = {
      turns: ["Apply the delivery guidance to this change.", "Now summarize the final route."],
    };
    definitionValue.variants.baseline = {
      source: { kind: "working-tree" },
      skills: ["skills/release-v1"],
      target: 0,
      context: [],
    };
    definitionValue.variants.candidate = {
      source: { kind: "working-tree" },
      skills: ["skills/release-v2"],
      target: 0,
      context: [],
    };
    definitionValue.expectations = [
      {
        id: "candidate-second-turn",
        kind: "response-text",
        variant: "candidate",
        expect: "contains",
        value: "Turn 2",
        turn: 2,
      },
      {
        id: "candidate-resource-read",
        kind: "resource-read",
        variant: "candidate",
        resource: "skill",
        index: 0,
        path: "SKILL.md",
        expect: "read",
        turn: 2,
      },
    ];
    const definition = await writeJson(root, "groups/body-versions.json", definitionValue);

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
    const log = await readJsonLines(fakeLog, "fake Pi log");
    const prompts = log
      .filter((entry) => entry.kind === "command" && entry.command.type === "prompt")
      .map((entry) => entry.command.message);
    assert.deepEqual(prompts, [
      "/skill:release-route Apply the delivery guidance to this change.",
      "Now summarize the final route.",
      "/skill:release-route Apply the delivery guidance to this change.",
      "Now summarize the final route.",
    ]);
    assert.equal(log.filter((entry) => entry.kind === "command" && entry.command.type === "get_commands").length, 2);

    const grade = parseJson(
      await readFile(path.join(resultDirectory, "groups/body-behavior/deterministic-grade.json"), "utf8"),
      "body grade",
    );
    assert.deepEqual(
      grade.checks.map(({ id, state, observed }) => ({ id, state, observed })),
      [
        {
          id: "candidate-second-turn",
          state: "pass",
          observed: { response: "Turn 2 response", turn: 2 },
        },
        {
          id: "candidate-resource-read",
          state: "pass",
          observed: {
            path: await realpath(
              path.join(resultDirectory, "groups/body-behavior/candidate/resources/skills/0/SKILL.md"),
            ),
            read: true,
            turn: 2,
          },
        },
      ],
    );

    for (const variant of ["baseline", "candidate"]) {
      const run = parseJson(
        await readFile(path.join(resultDirectory, `groups/body-behavior/${variant}/run.json`), "utf8"),
        `${variant} body run`,
      );
      assert.equal(run.state, "complete");
      assert.equal(run.delivery.kind, "explicit-skill-command");
      assert.match(run.delivery.targetPath, new RegExp(`${variant}/resources/skills/0/SKILL\\.md$`));
      assert.deepEqual(
        run.turns.map(({ prompt, deliveredPrompt }) => ({ prompt, deliveredPrompt })),
        [
          {
            prompt: "Apply the delivery guidance to this change.",
            deliveredPrompt: "/skill:release-route Apply the delivery guidance to this change.",
          },
          {
            prompt: "Now summarize the final route.",
            deliveredPrompt: "Now summarize the final route.",
          },
        ],
      );
      assert.equal(run.activation, undefined);
    }
  });
});

test("multi-turn body grading preserves intermediate workspace evidence by turn", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definitionValue = bodyGroup();
    definitionValue.input = { turns: ["Create the intermediate result.", "Remove the intermediate result."] };
    definitionValue.expectations = [
      {
        id: "turn-one-file",
        kind: "file-text",
        variant: "candidate",
        path: "intermediate.txt",
        expect: "equals",
        value: "turn one\n",
        turn: 1,
      },
      {
        id: "turn-one-directory",
        kind: "path",
        variant: "candidate",
        path: "empty",
        expect: "exists",
        turn: 1,
      },
      {
        id: "turn-one-change",
        kind: "changed-paths",
        variant: "candidate",
        expect: "equals",
        paths: ["intermediate.txt"],
        turn: 1,
      },
      {
        id: "turn-two-absence",
        kind: "path",
        variant: "candidate",
        path: "intermediate.txt",
        expect: "absent",
        turn: 2,
      },
      {
        id: "turn-two-directory",
        kind: "path",
        variant: "candidate",
        path: "empty",
        expect: "absent",
        turn: 2,
      },
      {
        id: "turn-two-net-change",
        kind: "changed-paths",
        variant: "candidate",
        expect: "equals",
        paths: [],
        turn: 2,
      },
    ];
    const definition = await writeJson(root, "groups/body-turn-evidence.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_TURN_EFFECTS: "1",
        FAKE_RPC_DIRECTORY_EFFECTS: "1",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/body-behavior");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate body run",
    );
    assert.equal(candidate.state, "complete");
    assert.deepEqual(
      candidate.turns.map((turn) => ({
        turn: turn.turn,
        files: turn.workspace?.files.map((file) => file.path) ?? null,
      })),
      [
        { turn: 1, files: ["empty", "intermediate.txt"] },
        { turn: 2, files: [] },
      ],
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "body grade",
    );
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "turn-one-file", state: "pass" },
        { id: "turn-one-directory", state: "pass" },
        { id: "turn-one-change", state: "pass" },
        { id: "turn-two-absence", state: "pass" },
        { id: "turn-two-directory", state: "pass" },
        { id: "turn-two-net-change", state: "pass" },
      ],
    );
  });
});

test("body evaluation preserves declared tool activity and exact workspace effects", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definitionValue = bodyGroup();
    definitionValue.tools = ["write"];
    const definition = await writeJson(root, "groups/body-effect.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_WRITE_EFFECT: "1",
      },
    });

    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory, `${result.stderr}\n${result.stdout}`);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/body-behavior/candidate/run.json"), "utf8"),
      "candidate body run",
    );
    assert.equal(candidate.state, "complete", JSON.stringify(candidate, null, 2));
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.deepEqual(
      candidate.toolActivity.map(({ toolName, completed, isError }) => ({ toolName, completed, isError })),
      [{ toolName: "write", completed: true, isError: false }],
    );
    assert.deepEqual(candidate.effects.before, []);
    assert.equal(candidate.effects.after.length, 1);
    assert.equal(candidate.effects.after[0].path, "result.txt");
    assert.match(candidate.effects.after[0].sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(candidate.effects.changes, {
      created: ["result.txt"],
      modified: [],
      deleted: [],
    });

    const viewed = spawnSync(process.execPath, [entrypoint, "view", resultDirectory, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(viewed.status, 0, viewed.stderr);
    assert.match(viewed.stdout, /tools-used: write/);
    assert.match(viewed.stdout, /changes\tcreated\tresult\.txt/);
    assert.match(viewed.stdout, /^ {2}changes\tmodified$/m);
    assert.match(viewed.stdout, /^ {2}changes\tdeleted$/m);
  });
});

test("command expectations are rejected before any subject starts", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const commandMarker = path.join(root, "command-ran.txt");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definitionValue = bodyGroup();
    definitionValue.expectations = [
      {
        id: "unsupported-command",
        kind: "command",
        variant: "candidate",
        argv: [process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(commandMarker)},'ran\\n')`],
        expect: "exit-code",
        value: 0,
      },
    ];
    const definition = await writeJson(root, "groups/body-command.json", definitionValue);

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
    assert.match(result.stderr, /command expectations are not supported/);
    await assert.rejects(readFile(commandMarker, "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(fakeLog, "utf8"), { code: "ENOENT" });
    await assert.rejects(readFile(path.join(root, ".skill-eval/runs"), "utf8"), { code: "ENOENT" });
  });
});

test("public body execution persists runs before broader deterministic grading", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definitionValue = bodyGroup();
    definitionValue.expectations = [
      {
        id: "null-field",
        kind: "json",
        variant: "candidate",
        path: "data.json",
        expect: "field-equals",
        pointer: "/present",
        value: null,
      },
      {
        id: "baseline-report",
        comparison: "report-exists",
        kind: "path",
        variant: "baseline",
        path: "report.txt",
        expect: "exists",
      },
      {
        id: "candidate-report",
        comparison: "report-exists",
        kind: "path",
        variant: "candidate",
        path: "report.txt",
        expect: "exists",
      },
    ];
    const definition = await writeJson(root, "groups/body-grading.json", definitionValue);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_GRADING_FIXTURE: "1",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/body-behavior");
    const runFile = path.join(groupDirectory, "candidate/run.json");
    const runText = await readFile(runFile, "utf8");
    const run = parseJson(runText, "candidate run");
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "body grade",
    );
    assert.equal(run.state, "complete");
    assert.equal(grade.state, "complete");
    assert.equal(grade.evidence.candidate.sha256, createHash("sha256").update(runText).digest("hex"));
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "null-field", state: "pass" },
        { id: "baseline-report", state: "fail" },
        { id: "candidate-report", state: "pass" },
      ],
    );
    assert.equal(grade.comparisons[0].transition, "fail-to-pass");
    const viewed = spawnSync(process.execPath, [entrypoint, "view", resultDirectory], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(viewed.status, 0, viewed.stderr);
    assert.match(
      viewed.stdout,
      /comparison\s+report-exists\s+path\s+fail-to-pass\s+baseline=baseline-report:fail\s+candidate=candidate-report:pass/,
    );
  });
});

test("a failed body response check remains separate from the completed subject run", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definitionValue = bodyGroup();
    definitionValue.expectations = [
      {
        id: "candidate-mentions-body",
        kind: "response-text",
        variant: "candidate",
        expect: "contains",
        value: "body",
      },
      {
        id: "candidate-mentions-rollback",
        kind: "response-text",
        variant: "candidate",
        expect: "contains",
        value: "rollback",
      },
    ];
    const definition = await writeJson(root, "groups/body-response.json", definitionValue);

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
    const groupDirectory = path.join(resultDirectory, "groups/body-behavior");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate body run",
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "body grade",
    );
    assert.equal(candidate.state, "complete");
    assert.equal(grade.state, "complete");
    assert.deepEqual(grade.checks, [
      {
        id: "candidate-mentions-body",
        kind: "response-text",
        variant: "candidate",
        state: "pass",
        expected: { expect: "contains", value: "body", turn: null },
        observed: { response: "Candidate body response", turn: 1 },
      },
      {
        id: "candidate-mentions-rollback",
        kind: "response-text",
        variant: "candidate",
        state: "fail",
        expected: { expect: "contains", value: "rollback", turn: null },
        observed: { response: "Candidate body response", turn: 1 },
      },
    ]);
  });
});

test("a body response check outside the declared turn range becomes a grade error after run persistence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definitionValue = bodyGroup();
    definitionValue.expectations = [
      {
        id: "undeclared-second-turn",
        kind: "response-text",
        variant: "candidate",
        expect: "contains",
        value: "response",
        turn: 2,
      },
    ];
    const definition = await writeJson(root, "groups/body-turn-range.json", definitionValue);

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
    const groupDirectory = path.join(resultDirectory, "groups/body-behavior");
    const candidateRunText = await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8");
    const candidate = parseJson(candidateRunText, "candidate body run");
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "body grade",
    );
    assert.equal(candidate.state, "complete");
    assert.equal(grade.state, "grade-error");
    assert.deepEqual(grade.checks, []);
    assert.deepEqual(grade.errors, [{ id: "undeclared-second-turn", reason: "invalid response-text expectation" }]);
    assert.equal(grade.evidence.candidate.sha256, createHash("sha256").update(candidateRunText).digest("hex"));
  });
});

test("persistent description evaluation sends declared turns through one Pi RPC session", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    const sourceSkill = await writeSkill(root, "skills/release-route");
    const definition = await writeJson(root, "groups/multi-turn.json", multiTurnGroup());

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

    const logText = await readFile(fakeLog, "utf8");
    const log = logText
      .trim()
      .split("\n")
      .map((line, index) => parseJson(line, `fake Pi log line ${index + 1}`));
    const spawns = log.filter((entry) => entry.kind === "spawn");
    assert.equal(spawns.length, 1);
    assert.deepEqual(spawns[0].args.slice(0, 2), ["--mode", "rpc"]);
    assert.ok(spawns[0].args.includes("--no-session"));
    assert.equal(spawns[0].args.includes(multiTurnGroup().input.turns[0]), false);
    const snapshottedSkill = spawns[0].args[spawns[0].args.indexOf("--skill") + 1];
    assert.notEqual(snapshottedSkill, sourceSkill);
    assert.match(snapshottedSkill, /candidate\/resources\/skills\/0$/);

    const commands = log.filter((entry) => entry.kind === "command").map((entry) => entry.command);
    assert.deepEqual(
      commands.filter((command) => command.type === "prompt").map((command) => command.message),
      multiTurnGroup().input.turns,
    );
    assert.deepEqual(
      commands.slice(0, 2).map(({ type, enabled }) => ({ type, enabled })),
      [
        { type: "set_auto_retry", enabled: false },
        { type: "set_auto_compaction", enabled: false },
      ],
    );
    assert.equal(new Set(commands.map((command) => command.id)).size, commands.length);
    assert.deepEqual(
      log
        .filter((entry) => entry.kind === "settled" || (entry.kind === "command" && entry.command.type === "prompt"))
        .map((entry) => (entry.kind === "settled" ? `settled-${entry.turn}` : `prompt-${entry.command.id}`)),
      ["prompt-request-3", "settled-1", "prompt-request-4", "settled-2"],
    );
    assert.equal(
      log.some((entry) => entry.kind === "overlap"),
      false,
    );

    const groupDirectory = path.join(resultDirectory, "groups", "multi-turn-activation");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate run",
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );

    assert.equal(candidate.state, "complete");
    assert.deepEqual(candidate.prompts, multiTurnGroup().input.turns);
    assert.deepEqual(
      candidate.turns.map(({ turn, prompt, promptAccepted, response, settled, targetRead }) => ({
        turn,
        prompt,
        promptAccepted,
        response,
        settled,
        targetRead,
      })),
      [
        {
          turn: 1,
          prompt: "Help me prepare this change.",
          promptAccepted: true,
          response: "Turn 1 response",
          settled: true,
          targetRead: false,
        },
        {
          turn: 2,
          prompt: "How should I deliver it now?",
          promptAccepted: true,
          response: "Turn 2 response",
          settled: true,
          targetRead: true,
        },
      ],
    );
    assert.deepEqual(
      candidate.turns.map((turn) => turn.transcript),
      [
        { file: "transcript.json", start: 0, end: 1 },
        { file: "transcript.json", start: 1, end: 2 },
      ],
    );
    assert.equal(candidate.activation.targetRead, true);
    assert.equal(candidate.activation.firstReadTurn, 2);
    assert.deepEqual(candidate.activation.readTurns, [2]);
    assert.equal(candidate.turns[0].toolActivity.length, 0);
    assert.deepEqual(
      candidate.turns[1].toolActivity.map(({ toolName, completed, isError }) => ({
        toolName,
        completed,
        isError,
      })),
      [{ toolName: "read", completed: true, isError: false }],
    );
    assert.deepEqual(candidate.usage, {
      input: 30,
      output: 12,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    });
    assert.equal(candidate.response, "Turn 2 response");
    assert.deepEqual(
      grade.checks.map(({ id, state }) => ({ id, state })),
      [
        { id: "never-read", state: "fail" },
        { id: "read-on-two", state: "pass" },
        { id: "read-by-two", state: "pass" },
        { id: "not-before-two", state: "pass" },
      ],
    );

    const view = spawnSync(process.execPath, [entrypoint, "view", resultDirectory, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Turns: 2/);
    assert.match(view.stdout, /Turn 1 \[settled\]/);
    assert.match(view.stdout, /prompt: Help me prepare this change\./);
    assert.match(view.stdout, /response: Turn 1 response/);
    assert.match(view.stdout, /Turn 2 \[settled, target-read\]/);
    assert.match(view.stdout, /response: Turn 2 response/);
  });
});

test("split UTF-8 code points remain exact across RPC stdout chunks", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const group = multiTurnGroup();
    group.id = "split-utf8";
    group.input.turns = ["Preserve this exact response."];
    group.expectations = [{ id: "no-read", kind: "skill-read", variant: "candidate", expect: "never" }];
    const definition = await writeJson(root, "groups/split-utf8.json", group);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_SPLIT_UTF8: "1",
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const variantDirectory = path.join(resultDirectory, "groups/split-utf8/candidate");
    const candidate = parseJson(await readFile(path.join(variantDirectory, "run.json"), "utf8"), "candidate run");
    const transcript = await readFile(path.join(variantDirectory, "transcript.json"), "utf8");
    const events = await readFile(path.join(variantDirectory, "events.jsonl"), "utf8");
    assert.equal(candidate.response, "Exact 😀 evidence");
    assert.match(transcript, /Exact 😀 evidence/);
    assert.match(events, /Exact 😀 evidence/);
    assert.doesNotMatch(`${transcript}\n${events}`, /�/);
  });
});

test("RPC framing and response-correlation failures preserve inspectable subject evidence", async () => {
  for (const scenario of [
    { variable: "FAKE_RPC_WRONG_ID", reason: "unexpected-response" },
    { variable: "FAKE_RPC_EMPTY_FRAME", reason: "empty-record" },
    { variable: "FAKE_RPC_INVALID_FRAME", reason: "invalid-json" },
  ]) {
    await withTempDirectory(async (root) => {
      const fakeLog = path.join(root, "fake-pi.jsonl");
      const bin = await installFakeRpcPi(root);
      await writeSkill(root, "skills/release-route");
      const definition = await writeJson(root, "groups/multi-turn.json", multiTurnGroup());

      const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
          FAKE_PI_LOG: fakeLog,
          [scenario.variable]: "1",
        },
      });

      assert.equal(result.status, 1, result.stderr);
      const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
      assert.ok(
        resultDirectory,
        `${scenario.variable} produced no result path\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      const candidate = parseJson(
        await readFile(path.join(resultDirectory, "groups/multi-turn-activation/candidate/run.json"), "utf8"),
        "candidate run",
      );
      assert.equal(candidate.state, "infrastructure-failed");
      assert.ok(candidate.process.protocolErrors.some((error) => error.reason === scenario.reason));
      assert.deepEqual(candidate.activation.readTurns, []);
    });
  }
});

test("an interrupted active turn preserves only its directly observed evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definition = await writeJson(root, "groups/multi-turn.json", multiTurnGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_EXIT_BEFORE_SETTLEMENT: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const groupDirectory = path.join(resultDirectory, "groups/multi-turn-activation");
    const candidate = parseJson(
      await readFile(path.join(groupDirectory, "candidate/run.json"), "utf8"),
      "candidate run",
    );
    const grade = parseJson(
      await readFile(path.join(groupDirectory, "deterministic-grade.json"), "utf8"),
      "deterministic grade",
    );
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.exitCode, 7);
    assert.equal(candidate.turns.length, 1);
    assert.deepEqual(
      candidate.turns.map(({ turn, promptAccepted, settled, response, targetRead }) => ({
        turn,
        promptAccepted,
        settled,
        response,
        targetRead,
      })),
      [
        {
          turn: 1,
          promptAccepted: true,
          settled: false,
          response: "Turn 1 response",
          targetRead: true,
        },
      ],
    );
    assert.deepEqual(candidate.turns[0].transcript, { file: "transcript.json", start: 0, end: 1 });
    assert.equal(candidate.turns[0].toolActivity[0].toolName, "read");
    assert.equal(candidate.activation.targetRead, true);
    assert.equal(candidate.activation.firstReadTurn, 1);
    assert.deepEqual(candidate.activation.readTurns, [1]);
    assert.ok(grade.checks.every((check) => check.state === "unavailable"));

    const view = spawnSync(process.execPath, [entrypoint, "view", resultDirectory, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Turn 1 \[unsettled, target-read\]/);
    assert.match(view.stdout, /response: Turn 1 response/);
  });
});

test("an oversized incomplete RPC frame triggers the emergency transport safeguard", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const group = multiTurnGroup();
    group.id = "incomplete-frame";
    group.input.turns = ["Return one response."];
    const definition = await writeJson(root, "groups/incomplete-frame.json", group);

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_INCOMPLETE_FRAME: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const variantDirectory = path.join(resultDirectory, "groups/incomplete-frame/candidate");
    const candidate = parseJson(await readFile(path.join(variantDirectory, "run.json"), "utf8"), "candidate run");
    const safeguard = candidate.process.protocolErrors.find((error) => error.reason === "incomplete-frame-limit");
    assert.equal(candidate.state, "infrastructure-failed");
    assert.ok(safeguard);
    assert.equal(safeguard.limitBytes, 16 * 1024 * 1024);
    assert.ok(safeguard.observedBytes > safeguard.limitBytes);
    const eventsStat = await stat(path.join(variantDirectory, "events.jsonl"));
    assert.ok(eventsStat.size < 1024);
  });
});

test("an RPC process that exits before accepting commands becomes persisted infrastructure evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definition = await writeJson(root, "groups/multi-turn.json", multiTurnGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_EXIT_ON_START: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory, result.stderr);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/multi-turn-activation/candidate/run.json"), "utf8"),
      "candidate run",
    );
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.process.exitCode, 9);
    assert.ok(candidate.process.protocolErrors.length > 0);
  });
});

test("a settled provider error stops later declared turns and remains infrastructure evidence", async () => {
  await withTempDirectory(async (root) => {
    const fakeLog = path.join(root, "fake-pi.jsonl");
    const bin = await installFakeRpcPi(root);
    await writeSkill(root, "skills/release-route");
    const definition = await writeJson(root, "groups/multi-turn.json", multiTurnGroup());

    const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        FAKE_PI_LOG: fakeLog,
        FAKE_RPC_PROVIDER_ERROR: "1",
      },
    });

    assert.equal(result.status, 1, result.stderr);
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
    assert.ok(resultDirectory);
    const logText = await readFile(fakeLog, "utf8");
    const log = logText
      .trim()
      .split("\n")
      .map((line, index) => parseJson(line, `fake Pi log line ${index + 1}`));
    assert.equal(log.filter((entry) => entry.kind === "command" && entry.command.type === "prompt").length, 1);
    const candidate = parseJson(
      await readFile(path.join(resultDirectory, "groups/multi-turn-activation/candidate/run.json"), "utf8"),
      "candidate run",
    );
    assert.equal(candidate.state, "infrastructure-failed");
    assert.equal(candidate.turns.length, 1);
    assert.equal(candidate.turns[0].assistantError, "fake provider failure");
    assert.equal(candidate.process.assistantError, "fake provider failure");

    const view = spawnSync(process.execPath, [entrypoint, "view", resultDirectory, "--variant", "candidate"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /Candidate \[infrastructure-failed\]/);
    assert.match(view.stdout, /Turn 1 \[settled\]/);
    assert.match(view.stdout, /response: Turn 1 response/);
    assert.match(view.stdout, /assistant-error: fake provider failure/);
  });
});

test(
  "RPC cancellation starts no later turn and kills resistant subject descendants",
  { skip: process.platform === "win32" },
  async () => {
    await withTempDirectory(async (root) => {
      const fakeLog = path.join(root, "fake-pi.jsonl");
      const descendantPidFile = path.join(root, "descendant.pid");
      const bin = await installFakeRpcPi(root);
      await writeSkill(root, "skills/release-route");
      const definition = await writeJson(root, "groups/multi-turn.json", multiTurnGroup());

      const result = spawnSync(process.execPath, [entrypoint, "run", definition, "--variant", "candidate"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
          FAKE_PI_LOG: fakeLog,
          FAKE_RPC_CANCEL_PARENT: "1",
          FAKE_RPC_DESCENDANT_PID: descendantPidFile,
        },
      });

      const descendantPid = Number(await readFile(descendantPidFile, "utf8"));
      try {
        assert.equal(result.status, 1, result.stderr);
        assert.equal(processExists(descendantPid), false, `descendant ${descendantPid} survived cleanup`);
        const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1];
        assert.ok(resultDirectory);
        const logText = await readFile(fakeLog, "utf8");
        const log = logText
          .trim()
          .split("\n")
          .map((line, index) => parseJson(line, `fake Pi log line ${index + 1}`));
        assert.equal(log.filter((entry) => entry.kind === "command" && entry.command.type === "prompt").length, 1);
        const candidate = parseJson(
          await readFile(path.join(resultDirectory, "groups/multi-turn-activation/candidate/run.json"), "utf8"),
          "candidate run",
        );
        assert.equal(candidate.state, "cancelled");
        assert.equal(candidate.process.terminationReason, "cancelled");
        assert.deepEqual(
          candidate.turns.map(({ turn, promptAccepted, settled, response }) => ({
            turn,
            promptAccepted,
            settled,
            response,
          })),
          [{ turn: 1, promptAccepted: true, settled: false, response: "" }],
        );
      } finally {
        if (processExists(descendantPid)) process.kill(descendantPid, "SIGKILL");
      }
    });
  },
);
