import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { decide } from "../../../skills/evaluate-behavior/scripts/claude-guard.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { evaluatorToolCall } from "../../../skills/evaluate-behavior/scripts/lib/hosts/claude-code/session.mjs";
import {
  readSkill,
  skillCommandPrompt,
} from "../../../skills/evaluate-behavior/scripts/lib/hosts/claude-code/skills.mjs";
import { dockerCalls, installFakeDocker } from "./helpers/fake-docker.mjs";
import { answersTools, claudeStarts, installFakeClaude, startScriptedApi } from "./helpers/fake-claude.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const IMAGE = `example.org/task@sha256:${"a".repeat(64)}`;
const MODEL = { model: "anthropic/claude-haiku-5-5", thinking: "low" };
// Variables of the machine's own Claude Code login and network, which a test run must not use.
const AMBIENT = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_SESSION_INGRESS_TOKEN_FILE",
  "ANTHROPIC_BASE_URL",
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "DOCKER_HOST",
];

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-claude-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`);
  return file;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeSkill(root) {
  return write(
    path.join(root, "skills/release-route/SKILL.md"),
    '---\nname: release-route\ndescription: "Use when delivering a change."\n---\n\n# Release Route\n\nShip it.\n',
  );
}

function boxedGroup(changes = {}, configuration = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "claude-boxed",
    type: "body",
    input: { prompt: "Write hello.txt with bash." },
    fixture: null,
    tools: ["read", "bash"],
    configuration: {
      host: { name: "claude-code" },
      model: MODEL,
      subject: { kind: "none" },
      environment: { kind: "container", image: IMAGE, workdir: "/testbed", network: "none" },
      ...configuration,
    },
    arms: { baseline: {}, candidate: {} },
    component: [],
    expectations: ["baseline", "candidate"].map((arm) => ({
      id: `${arm}-hello`,
      kind: "file-text",
      variant: arm,
      path: "hello.txt",
      expect: "contains",
      value: "hello",
    })),
    review_questions: [],
    ...changes,
  };
}

function descriptionGroup(changes = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "claude-activation",
    type: "description",
    input: { prompt: "How should I ship this change?" },
    fixture: null,
    tools: ["read"],
    configuration: {
      host: { name: "claude-code" },
      model: MODEL,
      subject: {
        kind: "skill",
        source: { kind: "working-tree" },
        skills: ["skills/release-route"],
        target: 0,
        context: [],
      },
    },
    arms: { baseline: {} },
    component: [],
    expectations: [{ id: "read", kind: "skill-read", variant: "baseline", expect: "by-turn", turn: 1 }],
    review_questions: [],
    ...changes,
  };
}

/** Runs the evaluator without blocking this process, which serves the scripted API. */
function runCli(root, bins, args, environment = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !AMBIENT.includes(key)));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd: root,
      env: {
        ...inherited,
        PATH: [...bins, process.env.PATH ?? ""].join(path.delimiter),
        SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
        SKILL_EVAL_PROBE_PUBLIC_URL: "",
        ...environment,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function groupDirectory(result, id) {
  return path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups", id);
}

test("a Claude Code group loads, and what Claude Code cannot run is refused at load", async () => {
  await withTempDirectory(async (root) => {
    const loaded = await loadDefinition(await write(path.join(root, "boxed.json"), boxedGroup()), { root });
    assert.equal(loaded.host, "claude-code");
    assert.equal(loaded.variants.baseline.shell.isolation, "container");

    const refusals = [
      [{}, { model: { model: "openai-codex/gpt-5.5" } }, /Claude Code runs only Anthropic models/],
      [{}, { model: { model: "anthropic/claude-haiku-5-5", thinking: "minimal" } }, /thinking must be one of low/],
      [{ tools: ["read", "bash", "web"] }, {}, /group.tools web is not available on Claude Code/],
      [{}, { model: undefined }, /needs a model on Claude Code/],
      [
        {},
        { host: { name: "claude-code", extensions: [{ package: "pi-thing", version: "1.0.0" }] } },
        /host.extensions are Pi packages/,
      ],
      [{}, { host: { name: "claude-code", settings: { hooks: {} } } }, /host.settings cannot set hooks/],
      [{}, { host: { name: "claude-code", settings: { env: { A: "1" } } } }, /host.settings cannot set env/],
    ];
    for (const [index, [changes, configuration, message]] of refusals.entries()) {
      const definition = boxedGroup(changes, configuration);
      if (Object.hasOwn(configuration, "model") && configuration.model === undefined) {
        delete definition.configuration.model;
      }
      const file = await write(path.join(root, `refused-${index}.json`), definition);
      await assert.rejects(loadDefinition(file, { root }), { code: "invalid-definition", message }, String(message));
    }
  });
});

test("the Claude Code guard hook allows declared calls, routes Bash into the container, and denies the rest", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await write(path.join(workspace, "notes.txt"), "inside\n");
    await write(path.join(root, "outside.txt"), "outside\n");
    const environment = {
      SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
      SKILL_EVAL_WRITABLE_ROOT: workspace,
      SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["read", "find", "bash"]),
      SKILL_EVAL_SHELL: JSON.stringify({ isolation: "container", workspace: "/testbed", container: {} }),
      SKILL_EVAL_CONTAINER: JSON.stringify({ name: "box", host: "unix:///fake.sock", workdir: "/testbed" }),
    };
    const call = (tool_name, tool_input) => decide({ tool_name, tool_input, cwd: workspace }, environment);

    assert.deepEqual(call("Read", { file_path: "notes.txt" }), { permissionDecision: "allow" });
    assert.deepEqual(call("Read", { file_path: "/testbed/notes.txt" }), { permissionDecision: "allow" });
    assert.equal(call("Read", { file_path: path.join(root, "outside.txt") }).permissionDecision, "deny");
    assert.equal(
      call("Write", { file_path: "new.txt", content: "x" }).permissionDecisionReason,
      "Tool is not declared for this evaluation: write",
    );
    assert.equal(call("WebFetch", { url: "https://example.com" }).permissionDecision, "deny");
    assert.deepEqual(call("Glob", { pattern: "**/*.txt" }), { permissionDecision: "allow" });
    assert.match(call("Glob", { pattern: "/etc/*" }).permissionDecisionReason, /pattern must be relative/);
    assert.match(call("Glob", { pattern: "../**" }).permissionDecisionReason, /pattern must be relative/);
    assert.equal(call("Glob", { pattern: "*", path: root }).permissionDecision, "deny");

    const bash = call("Bash", { command: "ls", description: "List" });
    assert.equal(bash.permissionDecision, "allow");
    assert.equal(bash.updatedInput.description, "List");
    // The docker client runs the command in the container through the lifetime wrapper, with a stdin that stays open.
    assert.match(
      bash.updatedInput.command,
      /^skill_eval_in=\$\(mktemp -d\) && mkfifo "\$skill_eval_in\/in" && \{ rm -rf "\$skill_eval_in"; docker --host 'unix:\/\/\/fake\.sock' exec -i --workdir '\/testbed' 'box' sh -c '[^]*' sh 'ls'; \} <>"\$skill_eval_in\/in"$/,
    );
    const { SKILL_EVAL_CONTAINER: _running, ...stopped } = environment;
    assert.match(
      decide({ tool_name: "Bash", tool_input: { command: "ls" }, cwd: workspace }, stopped).permissionDecisionReason,
      /container for this evaluation is not running/,
    );
  });
});

test("Claude Code's tool calls are recorded under the evaluator's tool names", () => {
  assert.deepEqual(evaluatorToolCall("Read", { file_path: "a.txt", offset: 2 }, ["read"]), {
    toolName: "read",
    args: { path: "a.txt", offset: 2 },
  });
  assert.deepEqual(evaluatorToolCall("Glob", { pattern: "*.md" }, ["ls"]), {
    toolName: "ls",
    args: { pattern: "*.md" },
  });
  assert.deepEqual(evaluatorToolCall("Glob", { pattern: "*.md" }, ["ls", "find"]).toolName, "find");
  assert.deepEqual(evaluatorToolCall("Bash", { command: "ls" }, ["bash"]), {
    toolName: "bash",
    args: { command: "ls" },
  });
});

test("an explicit skill delivery reads as Pi's skill command expansion", async () => {
  await withTempDirectory(async (root) => {
    const file = await writeSkill(root);
    const skill = await readSkill(path.dirname(file));
    assert.equal(skill.name, "release-route");
    assert.equal(skill.description, "Use when delivering a change.");
    assert.equal(
      skillCommandPrompt(skill, "Ship it now."),
      `<skill name="release-route" location="${file}">\nReferences are relative to ${path.dirname(file)}.\n\n# Release Route\n\nShip it.\n</skill>\n\nShip it now.`,
    );
  });
});

test("a Claude Code body group probes its container, runs both arms there, and records Claude Code's evidence", async () => {
  await withTempDirectory(async (root) => {
    const claude = await installFakeClaude(root);
    const docker = await installFakeDocker(root);
    const api = await startScriptedApi((body) =>
      answersTools(body)
        ? [{ type: "text", text: "Wrote hello.txt." }]
        : [
            { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "printf hello > hello.txt" } },
            { type: "tool_use", id: "toolu_2", name: "Read", input: { file_path: "/etc/hostname" } },
          ],
    );
    try {
      const definition = await write(path.join(root, "groups/boxed.json"), boxedGroup());
      const result = await runCli(root, [claude.bin, docker.bin], ["run", definition, "--dry-run"], {
        CLAUDE_CODE_OAUTH_TOKEN: "test-token",
        ANTHROPIC_BASE_URL: api.url,
        PARENT_ONLY: "parent",
      });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const directory = groupDirectory(result, "claude-boxed");

      for (const arm of ["baseline", "candidate"]) {
        const run = await readJson(path.join(directory, arm, "run.json"));
        assert.equal(run.state, "complete", JSON.stringify(run.process));
        assert.equal(run.process.host, "claude-code");
        assert.equal(run.confinement.verified, true);
        assert.ok(run.confinement["claude-code"]);
        for (const pair of [
          ["--model", "claude-haiku-5-5"],
          ["--effort", "low"],
          ["--tools", "Read,Bash"],
          ["--setting-sources", ""],
          ["--permission-mode", "dontAsk"],
        ]) {
          assert.equal(run.process.args[run.process.args.indexOf(pair[0]) + 1], pair[1], pair[0]);
        }
        assert.ok(run.process.args.includes("--system-prompt-file"));
        assert.deepEqual(
          run.toolActivity.map((call) => [call.toolName, call.hostToolName, call.isError]),
          [
            ["bash", "Bash", false],
            ["read", "Read", true],
          ],
        );
        assert.equal(run.toolActivity[1].args.path, "/etc/hostname");
        assert.equal(run.response, "Wrote hello.txt.");
        assert.equal(run.usage.cost.total, 0.01);
        assert.equal(run.model.observed.model, "claude-haiku-5-5");
        assert.equal(await readFile(path.join(directory, arm, "workspace/hello.txt"), "utf8"), "hello");
        assert.deepEqual(run.isolation.credentials, [{ variable: "CLAUDE_CODE_OAUTH_TOKEN" }]);

        // What reached the model: the evaluator's prompt, after Claude Code's own identity line.
        const context = await readJson(path.join(directory, arm, "host-context.json"));
        assert.equal(context.init.version, "9.9.9");
        assert.match(context.first.system[1], /^You are an expert coding assistant operating inside Claude Code/);
        assert.equal(context.first.messages[0].text, "Write hello.txt with bash.");
      }

      const starts = await claudeStarts(claude.log);
      // Two probes (no login, the stub's key), then the two subjects.
      assert.equal(starts.length, 4);
      for (const start of starts.slice(0, 2)) {
        assert.equal(start.env.ANTHROPIC_API_KEY, "probe");
        assert.equal(start.env.CLAUDE_CODE_OAUTH_TOKEN, null);
      }
      for (const start of starts.slice(2)) {
        assert.equal(start.env.CLAUDE_CODE_OAUTH_TOKEN, "test-token");
        assert.match(start.env.CLAUDE_CONFIG_DIR, /\/isolation\/config$/);
        assert.match(start.env.HOME, /\/isolation\/home$/);
        assert.equal(start.env.PARENT_ONLY, null);
        assert.equal(start.env.DISABLE_AUTO_COMPACT, "1");
        // The subject talks to the evaluator's recording relay, which forwards to the declared endpoint.
        assert.notEqual(start.env.ANTHROPIC_BASE_URL, api.url);
      }
      const execs = (await dockerCalls(docker.log)).filter((args) => args.includes("exec"));
      assert.ok(execs.some((args) => args.at(-1) === "printf hello > hello.txt"));
      const grade = await readJson(path.join(directory, "deterministic-grade.json"));
      assert.deepEqual(
        grade.checks.map(({ id, state }) => [id, state]),
        [
          ["baseline-hello", "pass"],
          ["candidate-hello", "pass"],
        ],
      );
    } finally {
      await api.close();
    }
  });
});

test("a Claude Code description run lists the declared skill and records the target read", async () => {
  await withTempDirectory(async (root) => {
    const claude = await installFakeClaude(root);
    await writeSkill(root);
    const api = await startScriptedApi((body) => {
      if (answersTools(body)) return [{ type: "text", text: "Ship it." }];
      const location = /<location>(.+)<\/location>/.exec(body.system.map((block) => block.text).join("\n"))?.[1];
      return [{ type: "tool_use", id: "toolu_read", name: "Read", input: { file_path: location } }];
    });
    try {
      const definition = await write(path.join(root, "groups/activation.json"), descriptionGroup());
      const result = await runCli(root, [claude.bin], ["run", definition, "--dry-run"], {
        CLAUDE_CODE_OAUTH_TOKEN: "test-token",
        ANTHROPIC_BASE_URL: api.url,
      });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const run = await readJson(path.join(groupDirectory(result, "claude-activation"), "baseline", "run.json"));
      assert.equal(run.state, "complete", JSON.stringify(run.process));
      assert.equal(run.activation.targetRead, true);
      assert.equal(run.activation.firstReadTurn, 1);
      assert.match(api.requests[0].body.system[1].text, /<name>release-route<\/name>/);
      assert.match(api.requests[0].body.system[1].text, /<description>Use when delivering a change.<\/description>/);
    } finally {
      await api.close();
    }
  });
});

test("a Claude Code body run with turns keeps one session, delivers the target skill, and records each turn", async () => {
  await withTempDirectory(async (root) => {
    const claude = await installFakeClaude(root);
    await writeSkill(root);
    let replies = 0;
    const api = await startScriptedApi(() => [{ type: "text", text: `reply ${++replies}` }]);
    try {
      const group = descriptionGroup({
        id: "claude-turns",
        type: "body",
        input: { turns: ["First.", "Second."] },
        expectations: [
          { id: "answered", kind: "response-text", variant: "baseline", value: "reply", expect: "contains" },
        ],
      });
      const definition = await write(path.join(root, "groups/turns.json"), group);
      const result = await runCli(root, [claude.bin], ["run", definition, "--dry-run"], {
        CLAUDE_CODE_OAUTH_TOKEN: "test-token",
        ANTHROPIC_BASE_URL: api.url,
      });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const run = await readJson(path.join(groupDirectory(result, "claude-turns"), "baseline", "run.json"));
      assert.equal(run.state, "complete", JSON.stringify(run.process));
      assert.equal(run.delivery.kind, "explicit-skill-command");
      assert.equal(run.delivery.command, "skill:release-route");
      assert.deepEqual(
        run.turns.map((turn) => [turn.response, turn.usage.cost.total]),
        [
          ["reply 1", 0.01],
          ["reply 2", 0.01],
        ],
      );
      assert.match(run.turns[0].deliveredPrompt, /^<skill name="release-route"/);
      assert.equal(run.turns[1].deliveredPrompt, "Second.");
      assert.equal((await claudeStarts(claude.log)).length, 1);
    } finally {
      await api.close();
    }
  });
});
