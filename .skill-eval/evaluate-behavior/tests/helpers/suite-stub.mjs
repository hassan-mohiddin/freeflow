// Test helper only: a stub dry run of one group of a committed Freeflow suite, with no model and no real engine. The
// suite folder is copied into a temporary definition root (outside Git, so the run is a dry run) beside a stand-in
// for Freeflow's snapshot script, and the run uses the fake Pi and fake Docker, a stand-in for the subscription's auth
// extension, and a local endpoint that plays the simulated user. Returns the result folder and the group's arm runs.
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { installFakeDocker } from "./fake-docker.mjs";
import { installFakePi } from "./fake-pi.mjs";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const entrypoint = path.join(repositoryRoot, "skills/evaluate-behavior/scripts/skill-eval.mjs");

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

/** A stand-in for scripts/freeflow-snapshot.mjs: the package layout the evaluator needs, with every named skill. */
async function installFakeSnapshot(root, skills) {
  await write(
    path.join(root, "scripts", "freeflow-snapshot.mjs"),
    `import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const target = option("--target");
mkdirSync(path.join(target, "pi-extension", "freeflow"), { recursive: true });
mkdirSync(path.join(target, "pi-extension", "dist", "host"), { recursive: true });
writeFileSync(path.join(target, "pi-extension", "freeflow", "index.js"), "export default () => {};\\n");
writeFileSync(path.join(target, "pi-extension", "dist", "host", "config-validation.js"),
  "export function validateRepositoryConfig() { return null; }\\nexport function validateLocalConfig() { return null; }\\n");
for (const skill of ${JSON.stringify(skills)}) {
  mkdirSync(path.join(target, "skills", skill), { recursive: true });
  writeFileSync(path.join(target, "skills", skill, "SKILL.md"), "---\\nname: " + skill + "\\ndescription: Use when testing.\\n---\\n");
}
writeFileSync(option("--metadata"), JSON.stringify({ sourceCommit: option("--commit"), packageName: "freeflow", packageVersion: "0.0.0-stub" }));
`,
  );
}

/** A local chat-completions endpoint whose every answer is `reply`: the simulated user. */
function startUserModel(reply) {
  const server = http.createServer((request, response) => {
    request.resume();
    request.on("end", () => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (delta, finish) =>
        `data: ${JSON.stringify({ id: "user", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      response.end(`${chunk({ role: "assistant", content: reply }, null)}${chunk({}, "stop")}data: [DONE]\n\n`);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        close: () => new Promise((done) => server.close(() => done())),
      }),
    );
  });
}

/**
 * @param {{ suite: string, suiteFile?: string, group: string, skills?: string[], rpcTools: any[], userReply?: string }}
 *   options `suite` is the suite folder under .skill-eval and `suiteFile` its suite file (suite.json by default);
 *   `rpcTools` are the tool calls the fake Pi makes on each prompt; `args` are added to the run's command line.
 */
export async function stubSuiteRun({
  suite,
  suiteFile = "suite.json",
  group,
  skills = [],
  rpcTools,
  userReply = "THANKS, DONE",
  args: extra = [],
}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "skill-eval-suite-stub-")));
  const user = await startUserModel(userReply);
  try {
    await cp(path.join(repositoryRoot, ".skill-eval", suite), path.join(root, ".skill-eval", suite), {
      recursive: true,
    });
    await installFakeSnapshot(root, skills);
    const credentials = path.join(root, "credentials");
    const auth = path.join(credentials, "npm", "node_modules", "@gotgenes", "pi-anthropic-auth");
    const configuration = JSON.parse(
      await readFile(path.join(root, ".skill-eval", suite, "configuration.json"), "utf8"),
    ).configuration;
    const version = configuration.host.extensions[0].version;
    await write(path.join(auth, "package.json"), JSON.stringify({ name: "@gotgenes/pi-anthropic-auth", version }));
    await write(path.join(auth, "index.js"), "export default () => {};\n");
    const provider = configuration.model.model.split("/")[0];
    await write(
      path.join(credentials, "models.json"),
      JSON.stringify({
        providers: { [provider]: { baseUrl: user.baseUrl, api: "openai-completions", apiKey: "stub" } },
      }),
    );
    const pi = await installFakePi(root, { rpcTools });
    const docker = await installFakeDocker(root);
    const args = [
      entrypoint,
      "run",
      `.skill-eval/${suite}/${suiteFile}`,
      "--group",
      group,
      "--uncommitted",
      "--yes",
      "--jobs",
      "1",
      ...extra,
    ];
    const { DOCKER_HOST: _host, ...inherited } = process.env;
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: root,
        env: {
          ...inherited,
          PATH: [pi.bin, docker.bin, process.env.PATH ?? ""].join(path.delimiter),
          SKILL_EVAL_CREDENTIALS_DIR: credentials,
          SKILL_EVAL_PROBE_PUBLIC_URL: "",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
    const resultDirectory = result.stdout.match(/^Path: (.+)$/m)?.[1] ?? null;
    return { root, result, resultDirectory, tools: pi.tools };
  } finally {
    await user.close();
  }
}

export async function removeStub(root) {
  await rm(root, { recursive: true, force: true });
}
