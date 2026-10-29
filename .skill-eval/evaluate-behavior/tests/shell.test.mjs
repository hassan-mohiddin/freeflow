import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import registerSkillEvalGuard from "../../../skills/evaluate-behavior/scripts/pi-guard.mjs";
import { installFakePi } from "./helpers/fake-pi.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { harnessProblems } from "../../../skills/evaluate-behavior/scripts/lib/harness.mjs";
import { sealing } from "../../../skills/evaluate-behavior/scripts/lib/seal.mjs";
import {
  missingPrerequisites,
  prerequisiteRefusal,
  verifyConfinement,
} from "../../../skills/evaluate-behavior/scripts/lib/shell.mjs";

const scripts = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/", import.meta.url));
const entrypoint = path.join(scripts, "skill-eval.mjs");
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-shell-test-")));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function write(file, contents, mode) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`);
  if (mode) await chmod(file, mode);
  return file;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * A stand-in isolation extension. It refuses any command that names an absolute path or an HTTP client and runs
 * the rest in the workspace with only PATH set; with `passEnvironment` it hands the shell Pi's whole environment,
 * as Pi's original Gondolin example does; with `stopAfterDenial` it refuses every command after its first refusal,
 * as Claude Code's don't-ask mode can deny the shell for the rest of a run.
 */
function isolationExtension({ passEnvironment = false, exposeAgentDirectory = false, stopAfterDenial = false } = {}) {
  return `import { spawnSync } from "node:child_process";
let stopped = false;
export default function (pi) {
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: "Run a shell command in the stand-in isolation",
    parameters: { type: "object", properties: { command: { type: "string" }, timeout: { type: "number" } }, required: ["command"] },
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const command = String(params.command);
      // An isolation that mounts Pi's agent directory, where a subject's copied login lives, into its shell.
      const exposed = ${exposeAgentDirectory} && command.includes(process.env.PI_CODING_AGENT_DIR);
      if (stopped || (!exposed && /(^|[\\s'"=>])\\/|curl|wget/.test(command))) {
        stopped = ${stopAfterDenial};
        return { content: [{ type: "text", text: "denied by the stand-in isolation" }], details: {} };
      }
      const env = ${passEnvironment ? "process.env" : '{ PATH: process.env.PATH ?? "/usr/bin:/bin" }'};
      const result = spawnSync("/bin/sh", ["-c", command], { cwd: ctx?.cwd ?? process.cwd(), env, encoding: "utf8" });
      return { content: [{ type: "text", text: result.stdout + result.stderr }], details: {} };
    },
  });
}
`;
}

const ISOLATION = "isolation/stand-in";

function shellGroup(changes = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "shell",
    type: "body",
    input: { prompt: "List the workspace with bash." },
    fixture: null,
    tools: ["bash"],
    configuration: {
      host: { name: "pi", extensions: [{ path: ISOLATION, entry: "index.mjs" }] },
      subject: { kind: "none" },
      shell: { isolation: ISOLATION, network: "none" },
    },
    arms: { baseline: {}, candidate: {} },
    component: [],
    expectations: ["baseline", "candidate"].map((arm) => ({
      id: `${arm}-no-commands`,
      kind: "tool-call",
      variant: arm,
      tool: "run_command",
      expect: "not-called",
    })),
    review_questions: [],
    ...changes,
  };
}

function runCli(root, bin, args) {
  return spawnSync(
    process.execPath,
    [entrypoint, ...args, ...(args[0] === "run" && !args.includes("--jobs") ? ["--jobs", "1"] : [])],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
        SKILL_EVAL_PROBE_PUBLIC_URL: "",
      },
    },
  );
}

test("a declared shell is validated at load, and bash without one is refused before any subject starts", async () => {
  await withTempDirectory(async (root) => {
    const shared = shellGroup().configuration;
    const refusals = [
      [
        "an isolation that is not a host extension",
        { configuration: { ...shared, shell: { isolation: "other", network: "none" } } },
        /shell.isolation other is not among its host.extensions \(isolation\/stand-in\)/,
      ],
      ["a shell without bash", { tools: ["read"] }, /declares shell, so group.tools must include bash/],
      ["a description group", { type: "description" }, /bash is supported only in body groups/],
      [
        "an open network",
        { configuration: { ...shared, shell: { isolation: ISOLATION, network: "host" } } },
        /shell.network must be "none"/,
      ],
      [
        "a relative workspace mount",
        { configuration: { ...shared, shell: { isolation: ISOLATION, network: "none", workspace: "workspace" } } },
        /shell.workspace must be an absolute path/,
      ],
      [
        "an unknown prerequisite",
        { configuration: { ...shared, shell: { isolation: ISOLATION, network: "none", requires: ["docker"] } } },
        /unknown prerequisite docker; known: gondolin, qemu, node-23.6/,
      ],
    ];
    for (const [name, changes, message] of refusals) {
      const file = await write(path.join(root, `groups/${name.replaceAll(" ", "-")}.json`), shellGroup(changes));
      await assert.rejects(loadDefinition(file, { root }), { name: "DefinitionError", message }, name);
    }
    const loaded = await loadDefinition(await write(path.join(root, "groups/ok.json"), shellGroup()), { root });
    assert.deepEqual(loaded.variants.candidate.shell, { isolation: ISOLATION, network: "none" });

    // A group that declares no shell loads as before, and the run refuses bash before anything starts.
    const { bin, log } = await installFakePi(root);
    const unshelled = await write(
      path.join(root, "groups/unshelled.json"),
      shellGroup({ configuration: { host: { name: "pi" }, subject: { kind: "none" } } }),
    );
    await loadDefinition(unshelled, { root });
    const refused = runCli(root, bin, ["run", unshelled, "--uncommitted"]);
    assert.notEqual(refused.status, 0);
    assert.match(
      refused.stderr,
      /body execution does not support native tools: bash; bash runs only in a body group whose every arm declares a shell isolation/,
    );
    await assert.rejects(readFile(log), { code: "ENOENT" });
  });
});

test("the guard allows bash only with a declared shell and maps the isolation's workspace paths", async () => {
  await withTempDirectory(async (root) => {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const saved = { ...process.env };
    const install = (shell) => {
      Object.assign(process.env, {
        SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
        SKILL_EVAL_WRITABLE_ROOT: workspace,
        SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["bash", "read", "write"]),
      });
      if (shell === null) delete process.env.SKILL_EVAL_SHELL;
      else process.env.SKILL_EVAL_SHELL = JSON.stringify(shell);
      const handlers = new Map();
      registerSkillEvalGuard({ on: (event, handler) => handlers.set(event, handler) });
      return (toolName, input) => handlers.get("tool_call")({ toolName, input }, { cwd: workspace });
    };
    try {
      const unshelled = install(null);
      assert.match(unshelled("bash", { command: "ls" }).reason, /bash runs only in a declared shell isolation/);

      const call = install({ isolation: ISOLATION, network: "none", workspace: "/workspace" });
      assert.equal(call("bash", { command: "ls" }), undefined);
      assert.equal(call("write", { path: "/workspace/notes/a.txt" }), undefined);
      assert.equal(call("write", { path: "notes/a.txt" }), undefined);
      assert.match(call("write", { path: "/etc/hosts" }).reason, /escapes the evaluation environment: \/etc\/hosts/);
      assert.match(call("write", { path: "/workspace/../etc/hosts" }).reason, /escapes/);
      assert.match(call("read", { path: "/workspacex/a.txt" }).reason, /cannot be resolved|escapes/);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });
});

test("a missing prerequisite gives a refusal naming what is missing, why, and how to install it", async () => {
  await withTempDirectory(async (root) => {
    const bin = path.join(root, "tools");
    await write(path.join(bin, "node"), "#!/bin/sh\necho v22.1.0\n", 0o755);
    const shell = { isolation: ISOLATION, network: "none", requires: ["gondolin"] };

    const missing = await missingPrerequisites(shell, { environment: { PATH: bin } });

    assert.deepEqual(
      missing.map(({ name, need, found }) => ({ name, need, found })),
      [
        { name: "QEMU", need: "qemu-system-x86_64 or qemu-system-aarch64 on PATH", found: null },
        { name: "Node.js 23.6 or newer", need: "node 23.6.0 or newer on PATH", found: "node 22.1.0" },
      ],
    );
    const refusal = prerequisiteRefusal("shell", "candidate", shell, missing);
    assert.match(refusal, /^group shell cannot run: arm candidate declares a shell isolated by isolation\/stand-in/);
    assert.match(refusal, /- QEMU: needs qemu-system-x86_64 or qemu-system-aarch64 on PATH \(not found\)\./);
    assert.match(refusal, /Why: Gondolin runs each shell command in a local QEMU micro-VM/);
    if (process.platform === "darwin") assert.match(refusal, /Install: brew install qemu/);
    assert.match(refusal, /Download: Gondolin downloads its guest image on first start \(size not verified\)\./);
    assert.match(refusal, /Ask the user before installing anything, then run again\.$/);

    await write(path.join(bin, "qemu-system-aarch64"), "#!/bin/sh\n", 0o755);
    await write(path.join(bin, "node"), "#!/bin/sh\necho v23.6.0\n", 0o755);
    assert.deepEqual(await missingPrerequisites(shell, { environment: { PATH: bin } }), []);
  });
});

test("a group whose shell prerequisite is missing is invalid before any subject or probe starts", async () => {
  await withTempDirectory(async (root) => {
    const { bin, log } = await installFakePi(root);
    await write(path.join(root, ISOLATION, "index.mjs"), isolationExtension());
    const requires = [
      {
        name: "Fake VM",
        programs: ["skill-eval-fake-vm-not-installed"],
        reason: "the stand-in isolation runs commands in it",
        install: {
          macos: "brew install fake-vm",
          apt: "sudo apt-get install fake-vm",
          dnf: "sudo dnf install fake-vm",
        },
        download: "about 40 MB",
      },
    ];
    const group = shellGroup();
    group.configuration.shell.requires = requires;
    const definition = await write(path.join(root, "groups/shell.json"), group);

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.notEqual(result.status, 0);
    await assert.rejects(readFile(log), { code: "ENOENT" });
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/shell");
    const run = await readJson(path.join(groupDirectory, "baseline/run.json"));
    assert.equal(run.state, "invalid");
    assert.match(run.error.message, /- Fake VM: needs skill-eval-fake-vm-not-installed on PATH \(not found\)\./);
    assert.match(run.error.message, /Download: about 40 MB\./);
    assert.equal(run.error.details.kind, "shell-prerequisites");
    assert.equal(run.error.details.missing[0].name, "Fake VM");
  });
});

test("a confining isolation passes every probe, its runs record confinement, and the subjects run", async () => {
  await withTempDirectory(async (root) => {
    const { bin, log } = await installFakePi(root);
    await write(path.join(root, ISOLATION, "index.mjs"), isolationExtension());
    const definition = await write(path.join(root, "groups/shell.json"), shellGroup());

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const modes = (await readFile(log, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).mode);
    assert.deepEqual(modes, ["json", "json", "rpc", "rpc"]);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/shell");
    for (const arm of ["baseline", "candidate"]) {
      const run = await readJson(path.join(groupDirectory, arm, "run.json"));
      assert.equal(run.state, "complete");
      assert.equal(run.confinement.verified, true);
      assert.equal(run.confinement.directory, `confinement/${arm}`);
      assert.deepEqual(
        run.confinement.probes.map(({ id, ran, held }) => [id, ran, held]),
        [
          ["workspace-write", true, true],
          ["write-outside", true, true],
          ["read-home-parent", true, true],
          ["network", true, true],
          ["environment", true, true],
          ["read-login", true, true],
        ],
      );
      assert.equal(run.confinement.networkConnections, 0);
      // The login is out of reach because the probe of a marker in Pi's agent directory held.
      assert.equal(run.sealing.login, "out of reach");
    }
  });
});

test("a pilot runs the harness check before its first subject and prints what each arm's shell did", async () => {
  await withTempDirectory(async (root) => {
    const { bin, log } = await installFakePi(root);
    await write(path.join(root, ISOLATION, "index.mjs"), isolationExtension());
    const definition = await write(path.join(root, "groups/shell.json"), shellGroup());

    const result = runCli(root, bin, ["run", definition, "--uncommitted", "--pilot", "1"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    // The stand-in refuses any command naming an absolute path, so the path outside and the /tmp write are refused
    // and the shell keeps running.
    for (const arm of ["baseline", "candidate"]) {
      assert.match(
        result.stdout,
        new RegExp(
          `^Harness: shell ${arm}: workspace ran; path outside refused; workspace after it ran; /tmp write refused; node (yes|no), python3 (yes|no), git (yes|no)$`,
          "m",
        ),
      );
    }
    assert.ok(result.stdout.indexOf("Harness: ") < result.stdout.indexOf("Pilot: "));
    assert.match(result.stdout, /^Pilot: .+ passed$/m);
    const pilotId = result.stdout.match(/^Pilot: (\S+) passed$/m)[1];
    const groupDirectory = path.join(root, ".skill-eval/runs", pilotId, "groups/shell");
    const record = await readJson(path.join(groupDirectory, "harness/baseline/harness.json"));
    assert.equal(record.shellStopped, false);
    assert.deepEqual(
      record.probes.map(({ id }) => id),
      ["workspace", "outside-path", "workspace-again", "tmp-write", "tools"],
    );
    const summary = await readJson(path.join(root, ".skill-eval/runs", pilotId, "summary.json"));
    assert.deepEqual(Object.keys(summary.groups[0].harness), ["baseline", "candidate"]);
    // Probes run in JSON mode with the scripted model; then the subjects run.
    const modes = (await readFile(log, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).mode);
    assert.deepEqual(modes, ["json", "json", "json", "json", "rpc", "rpc"]);
  });
});

test("without a pilot, no harness check runs", async () => {
  await withTempDirectory(async (root) => {
    const { bin } = await installFakePi(root);
    await write(path.join(root, ISOLATION, "index.mjs"), isolationExtension());
    const definition = await write(path.join(root, "groups/shell.json"), shellGroup());

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.doesNotMatch(result.stdout, /^Harness: /m);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/shell");
    await assert.rejects(readFile(path.join(groupDirectory, "harness/baseline/harness.json")), { code: "ENOENT" });
  });
});

test("a shell that stops working after a path outside the workspace stops the pilot before any subject", async () => {
  await withTempDirectory(async (root) => {
    const { bin, log } = await installFakePi(root);
    await write(path.join(root, ISOLATION, "index.mjs"), isolationExtension({ stopAfterDenial: true }));
    const definition = await write(path.join(root, "groups/shell.json"), shellGroup());

    const result = runCli(root, bin, ["run", definition, "--uncommitted", "--pilot", "1"]);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /^Harness: shell baseline: workspace ran; path outside refused; workspace after it refused;/m,
    );
    assert.match(result.stdout, /^Pilot: .+ stopped the run$/m);
    assert.match(
      result.stdout,
      /arm baseline's shell stopped working after a command naming a path outside the workspace/,
    );
    assert.doesNotMatch(result.stdout, /^Aggregate: /m);
    const modes = (await readFile(log, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).mode);
    assert.ok(!modes.includes("rpc"), `no subject runs: ${modes.join(", ")}`);
  });
});

test("the harness check stops a pilot whose arms found different things, naming each arm's findings", () => {
  const findings = (tools) => ({
    workspace: "ran",
    outsidePath: "refused",
    workspaceAgain: "ran",
    tmpWrite: "ran",
    tools: { node: true, python3: tools, git: true },
  });
  const records = {
    baseline: { arm: "baseline", shellStopped: false, findings: findings(false) },
    candidate: { arm: "candidate", shellStopped: false, findings: findings(true) },
  };
  const [problem, ...rest] = harnessProblems("g1", records);
  assert.equal(rest.length, 0);
  assert.match(problem, /^g1: the arms' harness differs, so they differ in more than their component:/);
  assert.match(problem, /g1 baseline: .*python3 no/);
  assert.match(problem, /g1 candidate: .*python3 yes/);
  assert.deepEqual(
    harnessProblems("g1", { baseline: records.baseline, candidate: { ...records.baseline, arm: "candidate" } }),
    [],
  );
});

test("an isolation that exposes Pi's agent directory fails the login probe, and the group is invalid", async () => {
  await withTempDirectory(async (root) => {
    const { bin } = await installFakePi(root);
    await write(path.join(root, ISOLATION, "index.mjs"), isolationExtension({ exposeAgentDirectory: true }));
    const definition = await write(path.join(root, "groups/shell.json"), shellGroup());

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.notEqual(result.status, 0);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/shell");
    const run = await readJson(path.join(groupDirectory, "baseline/run.json"));
    assert.equal(run.state, "invalid");
    assert.match(run.error.message, /is not confined: read-login did not hold/);
    const login = run.confinement.probes.find((probe) => probe.id === "read-login");
    assert.equal(login.held, false);
    assert.match(login.output, /^[0-9a-f]{24}\n/);
    // The marker beside the isolated home is still out of reach: only the agent directory is exposed.
    assert.ok(run.confinement.probes.filter((probe) => probe.id !== "read-login").every((probe) => probe.held));
  });
});

test("the sealing record says the login is out of reach only where the login probe held", () => {
  const shell = { bash: "shell", commands: null, graders: null };
  const probes = (held) => ({
    probes: [
      { id: "read-home-parent", held: true },
      { id: "read-login", held },
    ],
  });
  assert.equal(sealing(shell, "none", probes(true)).login, "out of reach");
  assert.equal(sealing(shell, "none", probes(false)).login, "not shown out of reach");
  // A record from before the login probe existed proves nothing about the login.
  assert.equal(
    sealing(shell, "none", { probes: [{ id: "read-home-parent", held: true }] }).login,
    "not shown out of reach",
  );
  assert.equal(sealing(shell, "none").login, "not probed");
  // No bash and nothing on the host: no subject-written code runs beside the login.
  assert.equal(sealing({ bash: null, commands: "container", graders: "container" }, "none").login, "out of reach");
  assert.equal(
    sealing({ bash: "shell", commands: "host", graders: null }, "host", probes(true)).login,
    "reachable from code run on the host",
  );
});

test("an isolation that leaks one probe makes the group invalid with the probe outputs recorded", async () => {
  await withTempDirectory(async (root) => {
    const { bin, log } = await installFakePi(root);
    await write(path.join(root, ISOLATION, "index.mjs"), isolationExtension({ passEnvironment: true }));
    const definition = await write(path.join(root, "groups/shell.json"), shellGroup());

    const result = runCli(root, bin, ["run", definition, "--uncommitted"]);

    assert.notEqual(result.status, 0);
    const modes = (await readFile(log, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line).mode);
    assert.deepEqual(modes, ["json"]);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/shell");
    const run = await readJson(path.join(groupDirectory, "baseline/run.json"));
    assert.equal(run.state, "invalid");
    assert.match(
      run.error.message,
      /arm baseline's shell isolated by isolation\/stand-in is not confined: environment did not hold/,
    );
    assert.equal(run.confinement.verified, false);
    const environment = run.confinement.probes.find((probe) => probe.id === "environment");
    assert.equal(environment.held, false);
    assert.match(environment.output, /^[0-9a-f]{24}\n$/);
    assert.ok(run.confinement.probes.filter((probe) => probe.id !== "environment").every((probe) => probe.held));
    const recorded = await readJson(path.join(groupDirectory, "confinement/baseline/confinement.json"));
    assert.deepEqual(recorded, run.confinement);
  });
});

function installedPi() {
  const version = spawnSync("pi", ["--version"], { encoding: "utf8" });
  return version.status === 0 ? version.stdout.trim() : null;
}

test(
  "with the installed Pi and a local scripted model, host bash leaks every probe and a confining extension holds them",
  { skip: installedPi() === null ? "pi is not installed" : false },
  async () => {
    await withTempDirectory(async (root) => {
      const saved = { ...process.env };
      process.env.SKILL_EVAL_PROBE_PUBLIC_URL = "";
      process.env.SKILL_EVAL_CREDENTIALS_DIR = path.join(root, "no-credentials");
      try {
        const extension = await write(path.join(root, "stand-in/index.mjs"), isolationExtension());
        const shell = { isolation: "stand-in", network: "none" };
        const open = await verifyConfinement({
          arm: "open",
          shell,
          extensions: [],
          directory: path.join(root, "confinement/open"),
          groupDirectory: root,
        });
        assert.deepEqual(
          open.probes.map(({ id, held }) => [id, held]),
          [
            ["workspace-write", true],
            ["write-outside", false],
            ["read-home-parent", false],
            ["network", false],
            ["environment", false],
            ["read-login", false],
          ],
        );
        const confined = await verifyConfinement({
          arm: "confined",
          shell,
          extensions: [{ path: extension }],
          directory: path.join(root, "confinement/confined"),
          groupDirectory: root,
        });
        assert.equal(confined.verified, true, JSON.stringify(confined, null, 2));
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
    });
  },
);

function gondolinReadiness() {
  const qemu = ["qemu-system-x86_64", "qemu-system-aarch64"].some(
    (program) => spawnSync("sh", ["-c", `command -v ${program}`]).status === 0,
  );
  if (!qemu) return "QEMU is not installed";
  if (installedPi() === null) return "pi is not installed";
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 23 || (major === 23 && minor < 6)) return "Gondolin needs Node.js 23.6 or newer";
  return false;
}

test("the Gondolin example confines every probe", { skip: gondolinReadiness(), timeout: 20 * 60 * 1000 }, async () => {
  await withTempDirectory(async (root) => {
    // Built the way the example group builds it: a snapshot of the example with its locked dependencies.
    const example = path.join(root, "gondolin-extension");
    spawnSync("cp", ["-R", path.join(repositoryRoot, ".skill-eval/examples/gondolin-extension"), example]);
    const install = spawnSync("npm", ["ci", "--ignore-scripts"], { cwd: example, encoding: "utf8" });
    assert.equal(install.status, 0, install.stderr);
    const record = await verifyConfinement({
      arm: "gondolin",
      shell: { isolation: example, network: "none", workspace: "/workspace" },
      extensions: [{ path: path.join(example, "index.ts") }],
      directory: path.join(root, "confinement/gondolin"),
      groupDirectory: root,
    });
    assert.equal(record.verified, true, JSON.stringify(record, null, 2));
  });
});
