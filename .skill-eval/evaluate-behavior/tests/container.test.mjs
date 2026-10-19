import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import registerSkillEvalGuard from "../../../skills/evaluate-behavior/scripts/pi-guard.mjs";
import { missingContainerPrerequisites } from "../../../skills/evaluate-behavior/scripts/lib/container.mjs";
import { loadDefinition } from "../../../skills/evaluate-behavior/scripts/lib/definitions.mjs";
import { verifyConfinement } from "../../../skills/evaluate-behavior/scripts/lib/shell.mjs";
import { dockerCalls, installFakeDocker } from "./helpers/fake-docker.mjs";
import { installFakePi } from "./helpers/fake-pi.mjs";

const entrypoint = fileURLToPath(new URL("../../../skills/evaluate-behavior/scripts/skill-eval.mjs", import.meta.url));
const IMAGE = `example.org/task@sha256:${"a".repeat(64)}`;
const NODE = process.execPath;

async function withTempDirectory(run) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-container-test-")));
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

function containerGroup(changes = {}, configuration = {}) {
  return {
    schema_version: 2,
    kind: "group",
    id: "boxed",
    type: "body",
    input: { prompt: "Fix the task with bash." },
    fixture: null,
    tools: ["bash"],
    configuration: {
      host: { name: "pi" },
      subject: { kind: "none" },
      environment: { kind: "container", image: IMAGE, workdir: "/testbed", network: "none" },
      ...configuration,
    },
    arms: { baseline: {}, candidate: {} },
    component: [],
    expectations: ["baseline", "candidate"].map((arm) => ({
      id: `${arm}-graded`,
      kind: "command",
      variant: arm,
      argv: [NODE, "-e", "require('node:fs').writeFileSync('graded.txt', 'graded in the image')"],
      pass: { exit_code: 0 },
    })),
    review_questions: [],
    ...changes,
  };
}

function cliEnvironment(root, bins) {
  const { DOCKER_HOST: _host, ...inherited } = process.env;
  return {
    ...inherited,
    PATH: [...bins, process.env.PATH ?? ""].join(path.delimiter),
    SKILL_EVAL_CREDENTIALS_DIR: path.join(root, "no-credentials"),
    SKILL_EVAL_PROBE_PUBLIC_URL: "",
  };
}

function runCli(root, bins, args) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root,
    encoding: "utf8",
    env: cliEnvironment(root, bins),
  });
}

test("a container environment needs a digest-pinned image and loads as the arms' shell", async () => {
  await withTempDirectory(async (root) => {
    const refusals = [
      [
        "a tag instead of a digest",
        { environment: { kind: "container", image: "example.org/task:latest", workdir: "/testbed", network: "none" } },
        /environment.image must be pinned by digest/,
      ],
      [
        "a relative workdir",
        { environment: { kind: "container", image: IMAGE, workdir: "testbed", network: "none" } },
        /environment.workdir must be an absolute path/,
      ],
      [
        "an open network",
        { environment: { kind: "container", image: IMAGE, workdir: "/testbed", network: "bridge" } },
        /environment.network must be "none"/,
      ],
      [
        "a container and a shell",
        { host: { name: "pi" }, shell: { isolation: "x", network: "none" } },
        /declares both shell and a container environment/,
      ],
    ];
    for (const [name, configuration, message] of refusals) {
      const file = await write(
        path.join(root, `groups/${name.replaceAll(" ", "-")}.json`),
        containerGroup({}, configuration),
      );
      await assert.rejects(loadDefinition(file, { root }), { name: "DefinitionError", message }, name);
    }
    const description = containerGroup({
      type: "description",
      tools: [],
      expectations: [{ id: "x", kind: "skill-read", variant: "baseline", expect: "never" }],
    });
    await assert.rejects(
      loadDefinition(await write(path.join(root, "groups/description.json"), description), { root }),
      {
        message: /container environment is supported only in body groups/,
      },
    );

    const loaded = await loadDefinition(await write(path.join(root, "groups/ok.json"), containerGroup()), { root });
    assert.deepEqual(loaded.variants.candidate.shell, {
      isolation: "container",
      network: "none",
      workspace: "/testbed",
      container: { image: IMAGE, workdir: "/testbed", network: "none" },
    });

    // Arms may differ in the image only where the component declares it.
    const other = `example.org/task@sha256:${"b".repeat(64)}`;
    const differing = containerGroup({
      arms: {
        baseline: {},
        candidate: { environment: { kind: "container", image: other, workdir: "/testbed", network: "none" } },
      },
      component: ["environment.image"],
    });
    const loadedDiffering = await loadDefinition(await write(path.join(root, "groups/differing.json"), differing), {
      root,
    });
    assert.equal(loadedDiffering.variants.candidate.shell.container.image, other);
    await assert.rejects(
      loadDefinition(await write(path.join(root, "groups/undeclared.json"), { ...differing, component: [] }), { root }),
      { code: "undeclared-difference", message: /differ in environment.image/ },
    );
  });
});

test("the guard routes bash into the subject's container and blocks it when none is running", async () => {
  const saved = { ...process.env };
  try {
    const workspace = await realpath(tmpdir());
    Object.assign(process.env, {
      SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
      SKILL_EVAL_WRITABLE_ROOT: workspace,
      SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["bash"]),
      SKILL_EVAL_SHELL: JSON.stringify({
        isolation: "container",
        network: "none",
        workspace: "/testbed",
        container: { image: IMAGE, workdir: "/testbed", network: "none" },
      }),
    });
    const install = () => {
      const handlers = new Map();
      registerSkillEvalGuard({ on: (event, handler) => handlers.set(event, handler) });
      return handlers.get("tool_call");
    };
    delete process.env.SKILL_EVAL_CONTAINER;
    assert.match(
      install()({ toolName: "bash", input: { command: "ls" } }, { cwd: workspace }).reason,
      /container for this evaluation is not running/,
    );

    process.env.SKILL_EVAL_CONTAINER = JSON.stringify({
      name: "skill-eval-subject-1",
      host: "unix:///x.sock",
      workdir: "/testbed",
    });
    const input = { command: "echo 'hi' && pwd" };
    assert.equal(install()({ toolName: "bash", input }, { cwd: workspace }), undefined);
    assert.equal(
      input.command,
      `docker --host 'unix:///x.sock' exec --workdir '/testbed' 'skill-eval-subject-1' sh -c 'echo '\\''hi'\\'' && pwd'`,
    );
    const echoed = spawnSync("sh", ["-c", `printf '%s' ${input.command.slice(input.command.indexOf("sh -c ") + 6)}`], {
      encoding: "utf8",
    });
    assert.equal(echoed.stdout, "echo 'hi' && pwd");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("without a docker command line, the refusal says what to install and to ask first", async () => {
  await withTempDirectory(async (root) => {
    const saved = process.env.PATH;
    process.env.PATH = path.join(root, "empty");
    try {
      const [missing] = await missingContainerPrerequisites({ image: IMAGE }, "macos");
      assert.equal(missing.name, "a docker command line");
      assert.match(missing.install, /brew install colima docker && colima start/);
    } finally {
      process.env.PATH = saved;
    }
  });
});

test("a workspace folder the engine does not share is refused by name, before anything runs on an empty mount", async () => {
  await withTempDirectory(async (root) => {
    const container = { image: IMAGE, workdir: "/testbed", network: "none" };
    const saved = process.env.PATH;
    try {
      const hidden = await installFakeDocker(path.join(root, "hidden"), { hiddenMounts: true });
      process.env.PATH = `${hidden.bin}${path.delimiter}${saved}`;
      const [missing, ...rest] = await missingContainerPrerequisites(container, "macos", path.join(root, "work"));
      assert.deepEqual(rest, []);
      assert.equal(missing.name, "a workspace folder the container engine can see");
      assert.match(missing.found, /did not reach the container: cat: marker: No such file or directory/);
      assert.match(missing.install, /Colima, by default, only your home folder/);
      assert.match(missing.install, /set TMPDIR/);

      const shared = await installFakeDocker(path.join(root, "shared"));
      process.env.PATH = `${shared.bin}${path.delimiter}${saved}`;
      assert.deepEqual(await missingContainerPrerequisites(container, "macos", path.join(root, "work")), []);
      const run = (await dockerCalls(shared.log)).find((args) => args[0] === "run");
      assert.ok(run.includes("--network") && run[run.indexOf("--network") + 1] === "none", "the probe has no network");
      assert.ok(
        run.some((arg) => arg.endsWith(":/testbed:ro")),
        "the probe mounts read-only",
      );
    } finally {
      process.env.PATH = saved;
    }
  });
});

test("a stopped engine or a missing image makes the group invalid before anything starts, and nothing is pulled", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const definition = await write(path.join(root, "groups/boxed.json"), containerGroup());

    const down = await installFakeDocker(path.join(root, "down"), { daemonDown: true });
    const stopped = runCli(root, [pi.bin, down.bin], ["run", definition, "--dry-run"]);
    assert.notEqual(stopped.status, 0);
    let groupDirectory = path.join(stopped.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    let run = await readJson(path.join(groupDirectory, "baseline/run.json"));
    assert.equal(run.state, "invalid");
    assert.match(
      run.error.message,
      /arm baseline runs in the container image example\.org\/task@sha256:a+, and this machine is missing:/,
    );
    assert.match(
      run.error.message,
      /- a running container engine: needs a docker daemon that answers `docker version` \(found Cannot connect/,
    );
    assert.match(run.error.message, /Ask the user before installing anything, then run again\.$/);
    assert.deepEqual(
      (await dockerCalls(down.log)).map((args) => args[0]),
      ["version"],
    );

    const absent = await installFakeDocker(path.join(root, "absent"), { imageMissing: true });
    const refused = runCli(root, [pi.bin, absent.bin], ["run", definition, "--dry-run"]);
    assert.notEqual(refused.status, 0);
    groupDirectory = path.join(refused.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    run = await readJson(path.join(groupDirectory, "baseline/run.json"));
    assert.match(
      run.error.message,
      new RegExp(`- the image ${IMAGE.replace(".", "\\.")}: needs the image present locally`),
    );
    assert.match(run.error.message, new RegExp(`Install: docker pull ${IMAGE.replace(".", "\\.")}`));
    assert.match(run.error.message, /Download: about 4 MB compressed, from docker manifest inspect\./);
    const calls = await dockerCalls(absent.log);
    assert.deepEqual(
      calls.map((args) => args[0]),
      ["version", "image", "manifest"],
    );
    assert.ok(calls.every((args) => !args.includes("pull")));
    await assert.rejects(readFile(pi.log), { code: "ENOENT" });
  });
});

test("probes, subjects and graders run in containers with the declared limits, in order, and are removed", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    const definition = await write(path.join(root, "groups/boxed.json"), containerGroup());

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--dry-run"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    const calls = await dockerCalls(docker.log);
    const verbs = calls.map((args) => (args[0] === "--host" ? `host ${args[2]}` : args[0]));
    // After the image, one `run` checks that the engine shares the folder the workspaces live under.
    const probe = ["version", "image", "run", "context", "create", "start", ...Array(5).fill("host exec"), "rm"];
    const subject = ["context", "create", "start", "rm"];
    assert.deepEqual(verbs, [...probe, ...probe, ...subject, "run", "rm", ...subject, "run", "rm"]);

    for (const created of calls.filter((args) => args[0] === "create")) {
      const option = (name) => created[created.indexOf(name) + 1];
      assert.equal(option("--network"), "none");
      assert.equal(option("--memory"), "4g");
      assert.equal(option("--cpus"), "2");
      assert.equal(option("--workdir"), "/testbed");
      assert.match(
        option("--volume"),
        /\/(confinement\/(baseline|candidate)|(baseline|candidate))\/workspace:\/testbed$/,
      );
      assert.ok(created.includes(IMAGE));
    }
    const removed = calls.filter((args) => args[0] === "rm").map((args) => args.at(-1));
    const names = calls.filter((args) => args[0] === "create").map((args) => args[args.indexOf("--name") + 1]);
    for (const name of names) assert.ok(removed.includes(name), `${name} was removed`);

    for (const arm of ["baseline", "candidate"]) {
      const run = await readJson(path.join(groupDirectory, arm, "run.json"));
      assert.equal(run.state, "complete");
      assert.equal(run.confinement.verified, true);
      assert.equal(run.confinement.isolation, "container");
      const record = run.postRun.commands[`${arm}-graded`];
      assert.equal(record.exitCode, 0);
      assert.equal(record.container.image, IMAGE);
      const graded = calls.find((args) => args[0] === "run" && args.includes(record.container.name));
      assert.ok(graded.includes("--rm"));
      assert.equal(graded[graded.indexOf("--network") + 1], "none");
      assert.match(
        graded[graded.indexOf("--volume") + 1],
        new RegExp(`/${arm}/commands/${arm}-graded/workspace:/testbed$`),
      );
      assert.equal(
        await readFile(path.join(groupDirectory, arm, record.directory, "graded.txt"), "utf8"),
        "graded in the image",
      );
    }
    const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
    assert.deepEqual(
      grade.checks.map(({ id, state }) => [id, state]),
      [
        ["baseline-graded", "pass"],
        ["candidate-graded", "pass"],
      ],
    );
  });
});

test("a container group without bash still runs its declared commands in a subject container", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    const definition = await write(
      path.join(root, "groups/boxed.json"),
      containerGroup({ tools: ["read", "run_command"], commands: [{ id: "unit-tests", argv: ["npm", "test"] }] }),
    );

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--dry-run"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const calls = await dockerCalls(docker.log);
    const verbs = calls.map((args) => (args[0] === "--host" ? `host ${args[2]}` : args[0]));
    // No shell to probe; each arm gets a subject container, then its grader runs in a fresh one.
    const prerequisites = ["version", "image", "run"];
    const subject = ["context", "create", "start", "rm"];
    assert.deepEqual(verbs, [...prerequisites, ...prerequisites, ...subject, "run", "rm", ...subject, "run", "rm"]);
  });
});

test("a container subject's bash runs a declared skill's script at the path it was given, mounted read-only", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root, { rpcBash: "sh {skill}/scripts/hello.sh > from-skill.txt" });
    const docker = await installFakeDocker(root);
    await write(
      path.join(root, "skills/helper/SKILL.md"),
      "---\nname: helper\ndescription: Use when greeting.\n---\n\n# Helper\n\nRun scripts/hello.sh.\n",
    );
    // The fake engine, like an image, has no host node; a script the skill ships runs by its path.
    await write(path.join(root, "skills/helper/scripts/hello.sh"), "echo hello from the skill\n");
    const definition = await write(
      path.join(root, "groups/boxed.json"),
      containerGroup(
        {
          arms: { only: {} },
          reference: "only",
          component: undefined,
          expectations: [
            {
              id: "ran-script",
              kind: "file-text",
              variant: "only",
              path: "from-skill.txt",
              expect: "contains",
              value: "hello from the skill",
            },
          ],
        },
        {
          subject: {
            kind: "skill",
            source: { kind: "working-tree" },
            skills: ["skills/helper"],
            target: null,
            context: [],
          },
        },
      ),
    );

    const result = runCli(root, [pi.bin, docker.bin], ["run", definition, "--dry-run"]);

    assert.equal(result.status, 0, result.stderr + result.stdout);
    const groupDirectory = path.join(result.stdout.match(/^Path: (.+)$/m)?.[1], "groups/boxed");
    const run = await readJson(path.join(groupDirectory, "only/run.json"));
    assert.equal(run.state, "complete");
    const skill = run.resources.skills[0].path;
    const created = (await dockerCalls(docker.log)).filter((args) => args[0] === "create").at(-1);
    const volumes = created.flatMap((arg, index) => (created[index - 1] === "--volume" ? [arg] : []));
    assert.deepEqual(volumes, [`${run.workspace}:/testbed`, `${skill}:${skill}:ro`]);
    const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
    assert.equal(grade.checks[0].state, "pass", JSON.stringify(grade.checks[0]));
  });
});

test("cancelling a running subject removes its container", async () => {
  await withTempDirectory(async (root) => {
    const pi = await installFakePi(root);
    const docker = await installFakeDocker(root);
    const hang = path.join(root, "hang.log");
    const group = containerGroup(
      {
        expectations: [
          {
            id: "baseline-graded",
            kind: "command",
            variant: "baseline",
            argv: [NODE, "-e", "0"],
            pass: { exit_code: 0 },
          },
        ],
      },
      { runtime: { environment: { literal: { FAKE_PI_HANG: hang }, inherit: [] } } },
    );
    const definition = await write(path.join(root, "groups/boxed.json"), group);

    const child = spawn(process.execPath, [entrypoint, "run", definition, "--dry-run"], {
      cwd: root,
      env: cliEnvironment(root, [pi.bin, docker.bin]),
      stdio: "ignore",
    });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await readFile(hang, "utf8").catch(() => "")).includes("prompted")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    child.kill("SIGINT");
    await exited;

    const calls = await dockerCalls(docker.log);
    const subjectCreate = calls.findLast((args) => args[0] === "create");
    const name = subjectCreate[subjectCreate.indexOf("--name") + 1];
    assert.match(name, /^skill-eval-subject-/);
    const startIndex = calls.findIndex((args) => args[0] === "start" && args[1] === name);
    const removeIndex = calls.findIndex((args) => args[0] === "rm" && args.at(-1) === name);
    assert.ok(startIndex >= 0 && removeIndex > startIndex, JSON.stringify(calls));
  });
});

function localDockerImage() {
  if (spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).status !== 0) {
    return { skip: "docker is not installed or its daemon is not running" };
  }
  for (const name of ["busybox", "alpine"]) {
    const inspected = spawnSync("docker", ["image", "inspect", "--format", "{{json .RepoDigests}}", name], {
      encoding: "utf8",
    });
    if (inspected.status !== 0) continue;
    const digest = JSON.parse(inspected.stdout.trim() || "[]")[0];
    if (typeof digest === "string") return { image: digest };
  }
  return { skip: "no busybox or alpine image is present locally, and the tests never pull one" };
}

const local = localDockerImage();

test(
  "a real container passes every confinement probe",
  { skip: local.skip ?? (spawnSync("pi", ["--version"]).status === 0 ? false : "pi is not installed") },
  async () => {
    await withTempDirectory(async (root) => {
      const saved = { ...process.env };
      process.env.SKILL_EVAL_PROBE_PUBLIC_URL = "";
      process.env.SKILL_EVAL_CREDENTIALS_DIR = path.join(root, "no-credentials");
      try {
        const container = { image: local.image, workdir: "/testbed", network: "none" };
        const record = await verifyConfinement({
          arm: "real",
          shell: { isolation: "container", network: "none", workspace: "/testbed", container },
          extensions: [],
          directory: path.join(root, "confinement/real"),
          groupDirectory: root,
        });
        assert.equal(record.verified, true, JSON.stringify(record, null, 2));
      } finally {
        for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
    });
  },
);
