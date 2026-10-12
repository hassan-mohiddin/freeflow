// Container environments (optional): a configuration may run the subject's shell and the group's command graders
// in a digest-pinned image through the standard `docker` command line (Docker Desktop, Colima, OrbStack or Podman
// all provide it). Docker is looked for only when a group declares a container; an image is never pulled, and a
// missing CLI, daemon or image refuses the group with what to install or pull. A container environment is a shell
// isolation like any other: the shell tier's probes verify it before any subject runs.

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

const run = promisify(execFile);
const IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;
const DOCKER_TIMEOUT_MS = 30_000;
/** Resource limits for every container the evaluator starts. */
export const CONTAINER_LIMITS = Object.freeze({ memory: "4g", cpus: "2", pids: "1024" });
const KEEP_ALIVE = "trap 'exit 0' TERM INT; while :; do sleep 3600 & wait $!; done";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validates a configuration's `environment`: `{ kind: "container", image: "<name>@sha256:<digest>", workdir,
 * network: "none" }`.
 *
 * @param {any} value
 * @param {string} label
 * @param {(code: string, message: string) => never} fail
 */
export function validateContainerEnvironment(value, label, fail) {
  if (!isPlainObject(value)) fail("invalid-definition", `${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (!["kind", "image", "workdir", "network"].includes(key)) {
      fail("invalid-definition", `${label} contains unsupported field ${key}`);
    }
  }
  if (value.kind !== "container") fail("invalid-definition", `${label}.kind must be container`);
  if (typeof value.image !== "string" || !IMAGE.test(value.image)) {
    fail(
      "invalid-definition",
      `${label}.image must be pinned by digest, such as name@sha256:<64 hex characters>; a tag can change under the run`,
    );
  }
  const workdir = value.workdir;
  if (
    typeof workdir !== "string" ||
    !workdir.startsWith("/") ||
    workdir === "/" ||
    workdir.endsWith("/") ||
    workdir
      .split("/")
      .slice(1)
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    fail("invalid-definition", `${label}.workdir must be an absolute path such as /testbed`);
  }
  if (value.network !== "none") fail("invalid-definition", `${label}.network must be "none"`);
}

/** The shell a container environment provides: bash runs in the container, which shows the workspace at workdir. */
export function containerShell(environment) {
  if (environment?.kind !== "container") return undefined;
  const container = { image: environment.image, workdir: environment.workdir, network: environment.network };
  return { isolation: "container", network: environment.network, workspace: environment.workdir, container };
}

/** The docker CLI's endpoint, so a subject's isolated shell (which has no ~/.docker) reaches the same daemon. */
export async function dockerHost() {
  if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST;
  try {
    const { stdout } = await run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], {
      timeout: DOCKER_TIMEOUT_MS,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

const DOCKER_INSTALL = {
  macos: "brew install colima docker && colima start (or install Docker Desktop or OrbStack)",
  apt: "sudo apt-get install docker.io && sudo systemctl start docker (or install Docker Engine from docs.docker.com, or Podman with podman-docker)",
  dnf: "sudo dnf install podman-docker (or Docker Engine from docs.docker.com, then sudo systemctl start docker)",
};
const DOCKER_START = {
  macos: "colima start, or open Docker Desktop or OrbStack",
  apt: "sudo systemctl start docker",
  dnf: "sudo systemctl start docker (or podman machine start)",
};

/**
 * What is missing for a container environment, in the shell tier's refusal shape: the docker CLI, its daemon, and
 * the image present locally (with its pull command and, when the registry reports it, its download size).
 *
 * @param {{ image: string }} container
 * @param {string | null} manager "macos", "apt", "dnf" or null
 */
export async function missingContainerPrerequisites(container, manager) {
  const reason = "the configuration runs the subject's shell and the command graders in a container";
  try {
    await run("docker", ["version", "--format", "{{.Server.Version}}"], { timeout: DOCKER_TIMEOUT_MS });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [
        {
          name: "a docker command line",
          need: "docker on PATH (Docker Desktop, Colima, OrbStack or Podman's docker)",
          found: null,
          reason,
          install: manager === null ? null : DOCKER_INSTALL[manager],
          download: null,
        },
      ];
    }
    return [
      {
        name: "a running container engine",
        need: "a docker daemon that answers `docker version`",
        found: firstLine(error?.stderr) ?? "no daemon answered",
        reason,
        install: manager === null ? null : `start it: ${DOCKER_START[manager]}`,
        download: null,
      },
    ];
  }
  try {
    await run("docker", ["image", "inspect", container.image], { timeout: DOCKER_TIMEOUT_MS });
    return [];
  } catch {
    const size = await imageDownloadSize(container.image);
    return [
      {
        name: `the image ${container.image}`,
        need: "the image present locally (the evaluator never pulls one)",
        found: null,
        reason,
        install: `docker pull ${container.image}`,
        download: size === null ? null : `about ${formatBytes(size)} compressed, from docker manifest inspect`,
      },
    ];
  }
}

/** Compressed layer bytes for this machine's platform from `docker manifest inspect -v`, or null when unknown. */
async function imageDownloadSize(image) {
  let parsed;
  try {
    const { stdout } = await run("docker", ["manifest", "inspect", "-v", image], { timeout: DOCKER_TIMEOUT_MS });
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const architecture = process.arch === "arm64" ? "arm64" : "amd64";
  const entry =
    entries.find(
      (candidate) =>
        candidate?.Descriptor?.platform?.os === "linux" && candidate.Descriptor.platform.architecture === architecture,
    ) ?? entries[0];
  const layers = entry?.SchemaV2Manifest?.layers ?? entry?.OCIManifest?.layers;
  if (!Array.isArray(layers) || layers.length === 0) return null;
  return layers.reduce((total, layer) => total + (Number.isFinite(layer?.size) ? layer.size : 0), 0);
}

function formatBytes(bytes) {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function firstLine(value) {
  const line = String(value ?? "")
    .split("\n")
    .find((entry) => entry.trim() !== "");
  return line?.trim() ?? null;
}

// What the docker client needs from the user's environment to reach its engine, and nothing else.
const DOCKER_CLIENT_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LANG",
  "TMPDIR",
  "XDG_RUNTIME_DIR",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_CONFIG",
  "DOCKER_CERT_PATH",
  "DOCKER_TLS_VERIFY",
];

/** The environment for a docker client the evaluator runs itself (a grader's `docker run`). */
export function dockerClientEnvironment() {
  return Object.fromEntries(
    DOCKER_CLIENT_KEYS.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])),
  );
}

export function containerName(purpose) {
  return `skill-eval-${purpose}-${randomBytes(6).toString("hex")}`;
}

/** The options every evaluator container shares: limits, the declared network, and the workspace mount. */
function runOptions(container, workspace) {
  return [
    "--label",
    "skill-eval=1",
    "--network",
    container.network,
    "--memory",
    CONTAINER_LIMITS.memory,
    "--cpus",
    CONTAINER_LIMITS.cpus,
    "--pids-limit",
    CONTAINER_LIMITS.pids,
    "--volume",
    `${workspace}:${container.workdir}`,
    "--workdir",
    container.workdir,
  ];
}

/**
 * Creates and starts a long-lived container for one subject (or one probe run) with the workspace mounted at
 * workdir. `remove()` force-removes it and is safe to call more than once; callers call it in `finally`, so a
 * cancelled run removes it too.
 */
export async function startContainer({ container, workspace, purpose = "subject" }) {
  const name = containerName(purpose);
  const host = await dockerHost();
  let removed = false;
  const remove = async () => {
    if (removed) return;
    removed = true;
    await run("docker", ["rm", "--force", name], { timeout: DOCKER_TIMEOUT_MS }).catch(() => {});
  };
  try {
    await run(
      "docker",
      [
        "create",
        "--name",
        name,
        ...runOptions(container, workspace),
        "--entrypoint",
        "sh",
        container.image,
        "-c",
        KEEP_ALIVE,
      ],
      { timeout: DOCKER_TIMEOUT_MS },
    );
    await run("docker", ["start", name], { timeout: DOCKER_TIMEOUT_MS });
  } catch (error) {
    await remove();
    throw new Error(
      `starting a container from ${container.image} failed: ${firstLine(error?.stderr) ?? error.message}`,
    );
  }
  return { name, host, remove };
}

/** The value the guard reads to route bash into a running container. */
export function containerTarget(handle, container) {
  return JSON.stringify({ name: handle.name, host: handle.host, workdir: container.workdir });
}

/** The running container from `containerTarget`'s value, or null when there is none. */
export function parseContainerTarget(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed?.name === "string" && typeof parsed.workdir === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** The docker client argv that runs a declared command's argv inside the running container, at its workdir. */
export function containerExecArgv(target, argv) {
  const host = typeof target.host === "string" && target.host !== "" ? ["--host", target.host] : [];
  return ["docker", ...host, "exec", "--workdir", target.workdir, target.name, ...argv];
}

/**
 * The argv that runs a command grader in a fresh container on the graded copy, with the same limits and network.
 * The caller removes the container by name afterwards, so a timeout or cancellation leaves nothing running.
 */
export function graderArgv({ container, copy, argv, name }) {
  return ["docker", "run", "--rm", "--name", name, ...runOptions(container, copy), container.image, ...argv];
}

export async function removeContainer(name) {
  await run("docker", ["rm", "--force", name], { timeout: DOCKER_TIMEOUT_MS }).catch(() => {});
}
