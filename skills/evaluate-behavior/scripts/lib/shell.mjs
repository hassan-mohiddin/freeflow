// The shell tier: a body group may give its subject `bash` only through a declared isolation extension, and the
// evaluator never trusts the declaration. Before an arm's first subject it checks the isolation's prerequisites and
// runs the subject's own Pi, with the arm's extensions and a local scripted model, through probes that a confined
// shell must fail. Any probe that does not hold makes the group invalid. The evaluator picks no sandbox itself.

import { randomBytes } from "node:crypto";
import { access, constants, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { containerShell, containerTarget, missingContainerPrerequisites, startContainer } from "./container.mjs";

const run = promisify(execFile);
const PROBE_PROVIDER = "skill-eval-probe";
const PROBE_MODEL = "confinement";
const PROBE_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_TAIL = 2000;
// Planted in Pi's own environment; a confined shell must not see it.
export const PROBE_VARIABLE = "CONFINEMENT_PROBE";
const PUBLIC_URL_VARIABLE = "SKILL_EVAL_PROBE_PUBLIC_URL";
const DEFAULT_PUBLIC_URL = "https://example.com/";

/**
 * Prerequisites an isolation may name in `shell.requires`. Each is a program on PATH (any of `programs`), or a
 * minimum Node version for the `node` Pi runs on.
 */
const PREREQUISITES = {
  qemu: {
    name: "QEMU",
    programs: ["qemu-system-x86_64", "qemu-system-aarch64"],
    install: {
      macos: "brew install qemu",
      apt: process.arch === "arm64" ? "sudo apt-get install qemu-system-arm" : "sudo apt-get install qemu-system-x86",
      dnf: process.arch === "arm64" ? "sudo dnf install qemu-system-aarch64" : "sudo dnf install qemu-system-x86",
    },
  },
  "node-23.6": {
    name: "Node.js 23.6 or newer",
    node: "23.6.0",
    install: {
      macos: "brew install node",
      apt: "install Node.js 23.6 or newer from https://nodejs.org (distribution packages are usually older), or with nvm: nvm install 24",
      dnf: "install Node.js 23.6 or newer from https://nodejs.org (distribution packages are usually older), or with nvm: nvm install 24",
    },
  },
};

/** Named sets of prerequisites, for isolations the evaluator knows. */
const PROFILES = {
  gondolin: {
    requires: ["qemu", "node-23.6"],
    reason: "Gondolin runs each shell command in a local QEMU micro-VM, and its host library needs Node.js 23.6+",
    download: "Gondolin downloads its guest image on first start (size not verified)",
  },
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates a configuration's `shell`: `{ isolation, network: "none", workspace?, requires? }`.
 *
 * @param {any} value
 * @param {string} label
 * @param {(code: string, message: string) => never} fail
 */
export function validateShell(value, label, fail) {
  if (!isPlainObject(value)) fail("invalid-definition", `${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!["isolation", "network", "workspace", "requires"].includes(key)) {
      fail("invalid-definition", `${label} contains unsupported field ${key}`);
    }
  }
  if (typeof value.isolation !== "string" || value.isolation.trim() === "") {
    fail("invalid-definition", `${label}.isolation must name one of the arm's host.extensions`);
  }
  if (value.network !== "none") fail("invalid-definition", `${label}.network must be "none"`);
  if (Object.hasOwn(value, "workspace")) {
    const workspace = value.workspace;
    if (
      typeof workspace !== "string" ||
      !workspace.startsWith("/") ||
      workspace === "/" ||
      workspace.endsWith("/") ||
      workspace
        .split("/")
        .slice(1)
        .some((part) => part === "" || part === "." || part === "..")
    ) {
      fail("invalid-definition", `${label}.workspace must be an absolute path such as /workspace`);
    }
  }
  if (Object.hasOwn(value, "requires")) {
    if (!Array.isArray(value.requires)) fail("invalid-definition", `${label}.requires must be an array`);
    for (const [index, entry] of value.requires.entries()) {
      if (typeof entry === "string") {
        if (!Object.hasOwn(PROFILES, entry) && !Object.hasOwn(PREREQUISITES, entry)) {
          fail(
            "invalid-definition",
            `${label}.requires[${index}] names an unknown prerequisite ${entry}; known: ${[...Object.keys(PROFILES), ...Object.keys(PREREQUISITES)].join(", ")}`,
          );
        }
        continue;
      }
      validateCustomPrerequisite(entry, `${label}.requires[${index}]`, fail);
    }
  }
}

function validateCustomPrerequisite(entry, label, fail) {
  if (!isPlainObject(entry)) fail("invalid-definition", `${label} must be a known name or an object`);
  for (const key of Object.keys(entry)) {
    if (!["name", "programs", "reason", "install", "download"].includes(key)) {
      fail("invalid-definition", `${label} contains unsupported field ${key}`);
    }
  }
  if (typeof entry.name !== "string" || entry.name === "") fail("invalid-definition", `${label}.name must be a string`);
  if (
    !Array.isArray(entry.programs) ||
    entry.programs.length === 0 ||
    !entry.programs.every((program) => typeof program === "string" && /^[A-Za-z0-9._+-]+$/.test(program))
  ) {
    fail("invalid-definition", `${label}.programs must list program names, any one of which satisfies it`);
  }
  for (const key of ["reason", "download"]) {
    if (Object.hasOwn(entry, key) && typeof entry[key] !== "string") {
      fail("invalid-definition", `${label}.${key} must be a string`);
    }
  }
  if (Object.hasOwn(entry, "install")) {
    if (!isPlainObject(entry.install)) fail("invalid-definition", `${label}.install must be an object`);
    for (const [key, command] of Object.entries(entry.install)) {
      if (!["macos", "apt", "dnf"].includes(key) || typeof command !== "string") {
        fail("invalid-definition", `${label}.install may give macos, apt and dnf commands as strings`);
      }
    }
  }
}

/** A host extension entry as `shell.isolation` names it: the package name, or the source or working-tree path. */
export function isolationLabel(entry) {
  if (typeof entry?.package === "string") return entry.package;
  if (isPlainObject(entry?.source)) return entry.source.path;
  return entry?.path;
}

/**
 * Group-level rules once any arm declares `shell`: `bash` in the tools, a body group, and every arm's shell isolated
 * by one of that arm's host extensions. A group that declares no shell keeps the run-time refusal of `bash`.
 *
 * @param {{ group: any, names: string[], configurations: Record<string, any>, fail: (code: string, message: string) => never }} options
 */
export function validateShellGroup({ group, names, configurations, fail }) {
  for (const arm of names) {
    if (configurations[arm].shell !== undefined && configurations[arm].environment !== undefined) {
      fail(
        "invalid-definition",
        `arm ${arm} declares both shell and a container environment, which provides the shell`,
      );
    }
  }
  const containers = names.filter((arm) => configurations[arm].environment !== undefined);
  if (containers.length > 0 && group.type !== "body") {
    fail("invalid-definition", "a container environment is supported only in body groups");
  }
  const declared = names.filter((arm) => configurations[arm].shell !== undefined);
  if (declared.length === 0 && !(group.tools.includes("bash") && containers.length > 0)) return;
  if (!group.tools.includes("bash")) {
    fail("invalid-definition", `arm ${declared[0]} declares shell, so group.tools must include bash`);
  }
  if (group.type !== "body") fail("invalid-definition", "bash is supported only in body groups");
  for (const arm of names) {
    const shell = configurations[arm].shell ?? containerShell(configurations[arm].environment);
    if (shell === undefined) {
      fail(
        "invalid-definition",
        `bash needs a confined shell: arm ${arm} must declare configuration.shell with an isolation extension, or a container environment`,
      );
    }
    if (shell.container !== undefined) continue;
    const labels = (configurations[arm].host.extensions ?? []).map(isolationLabel);
    if (!labels.includes(shell.isolation)) {
      fail(
        "invalid-definition",
        `arm ${arm}'s shell.isolation ${shell.isolation} is not among its host.extensions (${labels.join(", ") || "none"})`,
      );
    }
  }
}

/** The prerequisites a shell declares, expanded from profiles, with the reasons and downloads they carry. */
function declaredPrerequisites(shell) {
  const entries = [];
  for (const entry of shell.requires ?? []) {
    if (typeof entry !== "string") {
      entries.push({ ...entry, reason: entry.reason ?? null, download: entry.download ?? null });
      continue;
    }
    const profile = PROFILES[entry];
    const names = profile === undefined ? [entry] : profile.requires;
    for (const name of names) {
      entries.push({ ...PREREQUISITES[name], reason: profile?.reason ?? null, download: profile?.download ?? null });
    }
  }
  return entries;
}

/**
 * The declared prerequisites that are missing on this machine, each with why it is needed and how to install it on
 * this operating system.
 *
 * @returns {Promise<Array<{ name: string, need: string, found: string | null, reason: string | null, install: string | null, download: string | null }>>}
 */
export async function missingPrerequisites(shell, { environment = process.env } = {}) {
  const missing = [];
  const manager = await packageManager(environment);
  for (const prerequisite of declaredPrerequisites(shell)) {
    let need;
    let found = null;
    let satisfied;
    if (prerequisite.node !== undefined) {
      need = `node ${prerequisite.node} or newer on PATH`;
      found = await nodeVersion(environment);
      satisfied = found !== null && compareVersions(found, prerequisite.node) >= 0;
      if (found !== null) found = `node ${found}`;
    } else {
      need = `${prerequisite.programs.join(" or ")} on PATH`;
      satisfied = (await Promise.all(prerequisite.programs.map((program) => onPath(program, environment)))).some(
        Boolean,
      );
    }
    if (satisfied) continue;
    missing.push({
      name: prerequisite.name,
      need,
      found,
      reason: prerequisite.reason,
      install: manager === null ? null : (prerequisite.install?.[manager] ?? null),
      download: prerequisite.download,
    });
  }
  return missing;
}

/** The refusal the agent relays to the user: what is missing, why, how to install it, and that it should ask first. */
export function prerequisiteRefusal(groupId, arm, shell, missing) {
  const what =
    shell.container === undefined
      ? `declares a shell isolated by ${shell.isolation}`
      : `runs in the container image ${shell.container.image}`;
  const lines = [`group ${groupId} cannot run: arm ${arm} ${what}, and this machine is missing:`];
  for (const entry of missing) {
    lines.push(`- ${entry.name}: needs ${entry.need}${entry.found ? ` (found ${entry.found})` : " (not found)"}.`);
    if (entry.reason) lines.push(`  Why: ${entry.reason}.`);
    lines.push(
      `  Install: ${entry.install ?? "no install command is known for this system; see the isolation's documentation"}`,
    );
    if (entry.download) lines.push(`  Download: ${entry.download}.`);
  }
  lines.push("Ask the user before installing anything, then run again.");
  return lines.join("\n");
}

async function packageManager(environment) {
  if (process.platform === "darwin") return "macos";
  if (process.platform !== "linux") return null;
  if (await onPath("apt-get", environment)) return "apt";
  if (await onPath("dnf", environment)) return "dnf";
  return null;
}

async function onPath(program, environment) {
  for (const directory of (environment.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    try {
      await access(path.join(directory, program), constants.X_OK);
      return true;
    } catch {
      // Not in this directory.
    }
  }
  return false;
}

async function nodeVersion(environment) {
  try {
    const { stdout } = await run("node", ["--version"], { env: environment, timeout: 10000 });
    return stdout.trim().replace(/^v/, "");
  } catch {
    return null;
  }
}

function compareVersions(left, right) {
  const parse = (value) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [a, b] = [parse(left), parse(right)];
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

/** A failure that makes a group invalid, with structured details for its runs' evidence. */
export class ShellError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ShellError";
    this.details = details;
  }
}

/**
 * Checks prerequisites and verifies confinement for every selected arm that declares a shell, before any subject
 * starts. Returns each verified arm's confinement record; throws a ShellError when a prerequisite is missing or a
 * probe does not hold.
 *
 * @param {{ group: any, variants: Record<string, string>, hostExtensions: Record<string, any[]>, groupDirectory: string, signal?: AbortSignal }} options
 */
export async function prepareShell({ group, variants, hostExtensions, groupDirectory, signal }) {
  const confinement = {};
  for (const [arm, state] of Object.entries(variants)) {
    const shell = group.variants[arm]?.shell;
    if (state !== "selected" || shell === undefined) continue;
    const missing =
      shell.container === undefined
        ? await missingPrerequisites(shell)
        : await missingContainerPrerequisites(shell.container, await packageManager(process.env));
    if (missing.length > 0) {
      throw new ShellError(prerequisiteRefusal(group.id, arm, shell, missing), {
        kind: "shell-prerequisites",
        arm,
        isolation: shell.isolation,
        missing,
      });
    }
    // A container that only hosts the command graders gives the subject no shell to probe.
    if (shell.container !== undefined && !group.tools.includes("bash")) continue;
    confinement[arm] = await verifyConfinement({
      arm,
      shell,
      extensions: hostExtensions[arm] ?? [],
      directory: path.join(groupDirectory, "confinement", arm),
      groupDirectory,
      signal,
    });
    if (!confinement[arm].verified) {
      const failed = confinement[arm].probes.filter((probe) => !probe.held).map((probe) => probe.id);
      throw new ShellError(
        `arm ${arm}'s shell isolated by ${shell.isolation} is not confined: ${failed.join(", ")} did not hold (see confinement in the run evidence)`,
        { kind: "shell-confinement", arm, confinement },
      );
    }
  }
  return confinement;
}

/**
 * Runs the probes for one arm through its own Pi and extensions, with a local scripted model, and judges each by
 * what the host can observe: files on the host, connections to a host listener, and the probe output.
 */
export async function verifyConfinement({ arm, shell, extensions, directory, groupDirectory, signal }) {
  await rm(directory, { recursive: true, force: true });
  const workspace = path.join(directory, "workspace");
  const outside = path.join(directory, "outside");
  await mkdir(workspace, { recursive: true });
  await mkdir(outside, { recursive: true });
  const nonce = randomBytes(12).toString("hex");
  const { prepareIsolation } = await import("./isolation.mjs");
  const { effectivePiSettings } = await import("./pi-host.mjs");
  const isolation = await prepareIsolation(directory, null, { settings: effectivePiSettings({}) });
  // The isolated HOME's parent holds a marker the shell must not read.
  const marker = path.join(isolation.evidence.root, "probe-marker");
  await writeFile(marker, `${nonce}\n`);
  const written = path.join(outside, `written-${nonce}`);

  const listener = await startListener(nonce);
  const publicUrl = Object.hasOwn(process.env, PUBLIC_URL_VARIABLE)
    ? process.env[PUBLIC_URL_VARIABLE]
    : DEFAULT_PUBLIC_URL;
  const urls = [listener.url, ...(publicUrl ? [publicUrl] : [])];
  const probes = [
    {
      id: "workspace-write",
      purpose: "control: the shell runs and writes inside the workspace",
      command: `printf '%s' ${nonce} > confinement-control && cat confinement-control`,
    },
    {
      id: "write-outside",
      purpose: "writing a host file outside the workspace must fail",
      command: `printf '%s' ${nonce} > ${quote(written)}; echo "exit=$?"`,
    },
    {
      id: "read-home-parent",
      purpose: "reading a marker beside the isolated home must fail",
      command: `cat ${quote(marker)}; echo "exit=$?"`,
    },
    {
      id: "network",
      purpose: "reaching the network must fail",
      command: networkCommand(urls),
    },
    {
      id: "environment",
      purpose: `the ${PROBE_VARIABLE} variable planted in Pi's environment must be absent`,
      command: `printenv ${PROBE_VARIABLE} || echo unset`,
    },
  ];
  const model = await startModelStub(probes);
  const agent = path.join(isolation.evidence.root, "agent");
  await writeFile(
    path.join(agent, "models.json"),
    `${JSON.stringify({ providers: { [PROBE_PROVIDER]: { baseUrl: model.baseUrl, api: "openai-completions", apiKey: "probe", models: [{ id: PROBE_MODEL }] } } }, null, 2)}\n`,
  );

  // A container shell is probed in its own container, started on the probe workspace like a subject's.
  let container = null;
  if (shell.container !== undefined) {
    try {
      container = await startContainer({ container: shell.container, workspace, purpose: "probe" });
    } catch (error) {
      await Promise.all([model.close(), listener.close()]);
      throw error;
    }
  }
  const { baseProcessEnvironment, guardExtensionPath, runPiProcess } = await import("./pi.mjs");
  const environment = {
    ...baseProcessEnvironment(),
    PWD: workspace,
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify([workspace]),
    SKILL_EVAL_WRITABLE_ROOT: workspace,
    SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(["bash"]),
    SKILL_EVAL_CONTEXT_MANIFEST: "",
    SKILL_EVAL_HOST: "pi",
    SKILL_EVAL_PROMPT_MODE: "isolated",
    SKILL_EVAL_SHELL: JSON.stringify(shell),
    [PROBE_VARIABLE]: nonce,
    ...(container === null ? {} : { SKILL_EVAL_CONTAINER: containerTarget(container, shell.container) }),
    ...isolation.environment,
  };
  const args = ["--mode", "json", "-p", "--no-session", "--no-extensions", "--extension", guardExtensionPath()];
  for (const extension of extensions) args.push("--extension", extension.path);
  args.push(
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
    "--tools",
    "bash",
    "--model",
    `${PROBE_PROVIDER}/${PROBE_MODEL}`,
    "Run each confinement probe with bash, exactly as given.",
  );
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  const eventsFile = path.join(directory, "events.jsonl");
  const stderrFile = path.join(directory, "stderr.log");
  let observation = null;
  let launchError = null;
  try {
    observation = await runPiProcess({
      command: "pi",
      args,
      cwd: workspace,
      eventsFile,
      stderrFile,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      environment,
    });
  } catch (error) {
    launchError = error instanceof Error ? error.message : String(error);
  } finally {
    await Promise.all([model.close(), listener.close(), container?.remove()]);
  }

  const results = await toolResults(eventsFile);
  const judged = probes.map((probe) => ({ ...probe, ...results.get(probe.id) }));
  const control = await readFile(path.join(workspace, "confinement-control"), "utf8").catch(() => null);
  const leakedWrite = await stat(written).then(
    () => true,
    () => false,
  );
  const held = {
    "workspace-write": control === nonce,
    "write-outside": !leakedWrite,
    "read-home-parent": !includes(judged[2], nonce),
    network: listener.connections === 0 && !/REACHED:(?!000)\S+/.test(judged[3].output ?? ""),
    environment: !includes(judged[4], nonce),
  };
  const record = {
    verified: false,
    isolation: shell.isolation,
    network: shell.network,
    directory: path.relative(groupDirectory, directory).split(path.sep).join("/"),
    probes: judged.map((probe) => ({
      id: probe.id,
      purpose: probe.purpose,
      command: probe.command,
      ran: probe.ran === true,
      held: probe.ran === true && held[probe.id],
      isError: probe.isError ?? null,
      output: (probe.output ?? "").slice(-OUTPUT_TAIL),
    })),
    networkConnections: listener.connections,
    pi: {
      exitCode: observation?.exitCode ?? null,
      terminationReason: observation?.terminationReason ?? (timeout.aborted ? "timeout" : null),
      error: launchError,
      stderr: (await readFile(stderrFile, "utf8").catch(() => "")).slice(-OUTPUT_TAIL),
    },
  };
  record.verified = record.probes.every((probe) => probe.held);
  await writeFile(path.join(directory, "confinement.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

function includes(probe, nonce) {
  return (probe.output ?? "").includes(nonce);
}

function quote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

/** Tries each URL with whichever HTTP client the shell has, printing REACHED:<status> only on a response. */
function networkCommand(urls) {
  const lines = urls.map(
    (url) =>
      `if command -v curl >/dev/null 2>&1; then curl -sS -m 8 -o /dev/null -w 'REACHED:%{http_code}\\n' ${quote(url)}; ` +
      `elif command -v wget >/dev/null 2>&1; then wget -q -T 8 -O /dev/null ${quote(url)} && echo REACHED:ok; ` +
      `else echo NO-HTTP-CLIENT; fi`,
  );
  return lines.join("; ");
}

/** Each probe's tool result from Pi's JSON events, by tool call ID. */
async function toolResults(eventsFile) {
  const results = new Map();
  const contents = await readFile(eventsFile, "utf8").catch(() => "");
  for (const line of contents.split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "tool_execution_end" || typeof event.toolCallId !== "string") continue;
    const content = Array.isArray(event.result?.content) ? event.result.content : [];
    results.set(event.toolCallId, {
      ran: true,
      isError: event.isError === true,
      output: content
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join(""),
    });
  }
  return results;
}

/** An HTTP listener on every interface, reached through the host's first external IPv4 address when it has one. */
function startListener(nonce) {
  return new Promise((resolve, reject) => {
    const state = { connections: 0 };
    const server = http.createServer((request, response) => {
      response.end(nonce);
    });
    server.on("connection", () => {
      state.connections += 1;
    });
    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => {
      const address = externalAddress() ?? "127.0.0.1";
      resolve({
        url: `http://${address}:${server.address().port}/${nonce}`,
        get connections() {
          return state.connections;
        },
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function externalAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

/**
 * A local OpenAI-compatible chat-completions endpoint that answers the first request with every probe as a bash
 * tool call, and any request carrying tool results with a short final answer. No model is called.
 */
function startModelStub(probes) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        let parsed = {};
        try {
          parsed = JSON.parse(body || "{}");
        } catch {
          // Answered as a first request.
        }
        const followUp = Array.isArray(parsed.messages) && parsed.messages.some((message) => message?.role === "tool");
        const message = followUp
          ? { role: "assistant", content: "Probes finished." }
          : {
              role: "assistant",
              content: null,
              tool_calls: probes.map((probe, index) => ({
                index,
                id: probe.id,
                type: "function",
                function: { name: "bash", arguments: JSON.stringify({ command: probe.command }) },
              })),
            };
        const finish = followUp ? "stop" : "tool_calls";
        const base = { id: "probe", created: 0, model: parsed.model ?? PROBE_MODEL };
        const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        if (parsed.stream !== true) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              ...base,
              object: "chat.completion",
              choices: [
                {
                  index: 0,
                  message: { ...message, tool_calls: message.tool_calls?.map(({ index: _index, ...call }) => call) },
                  finish_reason: finish,
                },
              ],
              usage,
            }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const send = (chunk) =>
          response.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", ...chunk })}\n\n`);
        send({ choices: [{ index: 0, delta: message, finish_reason: null }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: finish }] });
        send({ choices: [], usage });
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}
