// Test helper only: a `docker` stand-in that logs every invocation and acts like a small container engine.
// `exec` runs the command in the mounted workspace with no network client and nothing outside its mounts (the
// workspace, and read-only resources at their own host paths); `run` runs a grader's argv in the mounted copy.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * @param {string} root
 * @param {{ daemonDown?: boolean, imageMissing?: boolean, hiddenMounts?: boolean }} [options] `hiddenMounts` acts
 *   like a VM-based engine that does not share the host folder: a `run` mount arrives empty.
 * @returns {Promise<{ bin: string, log: string }>}
 */
export async function installFakeDocker(root, { daemonDown = false, imageMissing = false, hiddenMounts = false } = {}) {
  const bin = path.join(root, "docker-bin");
  const log = path.join(root, "docker.jsonl");
  const state = path.join(root, "docker-state");
  await mkdir(bin, { recursive: true });
  await mkdir(state, { recursive: true });
  const executable = path.join(bin, "docker");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const all = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(all) + "\\n");
let args = all;
while (args[0] === "--host") args = args.slice(2);
const [command, ...rest] = args;
const stateFile = (name) => path.join(${JSON.stringify(state)}, name + ".json");
const VALUED = new Set(["--name", "--label", "--network", "--memory", "--cpus", "--pids-limit", "--volume", "--workdir", "--entrypoint"]);
function parseRun(list) {
  const options = {};
  const volumes = [];
  let index = 0;
  while (index < list.length && list[index].startsWith("-")) {
    if (VALUED.has(list[index])) {
      if (list[index] === "--volume") volumes.push(list[index + 1]);
      options[list[index]] ??= list[index + 1];
      index += 2;
    } else index += 1;
  }
  return { options, volumes, image: list[index], argv: list.slice(index + 1) };
}
const fail = (message, code = 1) => {
  process.stderr.write(message + "\\n");
  process.exit(code);
};
if (command === "version") {
  if (${daemonDown}) fail("Cannot connect to the Docker daemon at unix:///fake/docker.sock. Is the docker daemon running?");
  process.stdout.write("27.0.0\\n");
} else if (command === "context") {
  process.stdout.write("unix:///fake/docker.sock\\n");
} else if (command === "image") {
  if (${imageMissing}) fail("Error response from daemon: No such image: " + rest.at(-1));
  process.stdout.write("[]\\n");
} else if (command === "manifest") {
  const entry = (architecture) => ({ Descriptor: { platform: { os: "linux", architecture } }, SchemaV2Manifest: { layers: [{ size: 3 * 1024 * 1024 }, { size: 1024 * 1024 }] } });
  process.stdout.write(JSON.stringify([entry("amd64"), entry("arm64")]) + "\\n");
} else if (command === "create") {
  const { options, volumes } = parseRun(rest);
  const [source, workdir] = volumes[0].split(":");
  // Further volumes are read-only resources mounted at their own host path.
  const resources = volumes.slice(1).map((volume) => volume.split(":"));
  if (resources.some(([from, to, mode]) => from !== to || mode !== "ro")) fail("fake docker: a resource mount must be path:path:ro");
  writeFileSync(stateFile(options["--name"]), JSON.stringify({ source, workdir, resources: resources.map(([from]) => from) }));
  process.stdout.write("fake-container-id\\n");
} else if (command === "start") {
  if (!existsSync(stateFile(rest[0]))) fail("Error: No such container: " + rest[0]);
} else if (command === "rm") {
  rmSync(stateFile(rest.at(-1)), { force: true });
} else if (command === "exec") {
  const workdir = rest[rest.indexOf("--workdir") + 1];
  const name = rest[rest.indexOf("--workdir") + 2];
  if (!existsSync(stateFile(name))) fail("Error: No such container: " + name);
  const { source, resources = [] } = JSON.parse(readFileSync(stateFile(name), "utf8"));
  const script = rest.at(-1).replaceAll(workdir, source);
  // Nothing outside the mount exists in the container, and it has no network client.
  if (/curl|wget/.test(script)) {
    process.stdout.write("NO-HTTP-CLIENT\\n");
    process.exit(0);
  }
  const outside = (script.match(/(?:^|[\\s'"=>])(\\/[^\\s'";]*)/g) ?? []).map((match) => match.trim().replace(/^['"=>]/, "")).filter((entry) => ![source, ...resources].some((mount) => entry === mount || entry.startsWith(mount + "/")));
  if (outside.length > 0) fail("sh: " + outside[0] + ": No such file or directory");
  const result = spawnSync("/bin/sh", ["-c", script], { cwd: source, env: { PATH: "/usr/bin:/bin" }, encoding: "utf8" });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
} else if (command === "run") {
  const { options, argv: given } = parseRun(rest);
  const argv = options["--entrypoint"] ? [options["--entrypoint"], ...given] : given;
  const [source] = options["--volume"].split(":");
  if (${hiddenMounts}) fail(argv[0] + ": " + (argv[1] ?? "") + ": No such file or directory");
  const result = spawnSync(argv[0], argv.slice(1), { cwd: source, env: process.env, encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
} else {
  fail("fake docker: unsupported command " + command);
}
`,
  );
  await chmod(executable, 0o755);
  return { bin, log };
}

/** Each logged docker invocation's arguments. */
export async function dockerCalls(log) {
  const contents = await readFile(log, "utf8").catch(() => "");
  return contents
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
